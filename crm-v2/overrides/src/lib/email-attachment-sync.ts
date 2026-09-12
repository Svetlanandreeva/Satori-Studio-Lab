import { ImapFlow } from "imapflow";
import { simpleParser, type AddressObject } from "mailparser";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { contacts, emailMessages, emailThreads } from "@/db/schema";
import { getEmailConfig, isEmailConfigured } from "@/lib/email-integration";
import { detectClientDocumentKind, saveClientDocument } from "@/lib/client-documents";
import { getSetting, setSetting } from "@/lib/satori-integrations";

const BACKFILL_KEY = "satori_email_attachment_backfill_done";

function addressValues(value: AddressObject | AddressObject[] | undefined): Array<{ address: string; name: string }> {
  const objects = Array.isArray(value) ? value : value ? [value] : [];
  return objects.flatMap((object) =>
    (object.value || [])
      .map((item) => ({ address: String(item.address || "").trim().toLowerCase(), name: String(item.name || "").trim() }))
      .filter((item) => item.address)
  );
}

function findContactId(remoteEmail: string, messageId: string): string | null {
  const existingMessage = db.select().from(emailMessages).where(eq(emailMessages.messageId, messageId)).get();
  if (existingMessage) {
    const thread = db.select().from(emailThreads).where(eq(emailThreads.id, existingMessage.threadId)).get();
    if (thread?.contactId) return thread.contactId;
  }

  const normalized = remoteEmail.trim().toLowerCase();
  const contact = db.select().from(contacts).all().find((item) => String(item.email || "").trim().toLowerCase() === normalized);
  return contact?.id || null;
}

function usefulAttachment(attachment: { filename?: string | null; contentDisposition?: string | null; content?: Buffer; size?: number }): boolean {
  const size = Number(attachment.size || attachment.content?.byteLength || 0);
  if (!size) return false;
  if (String(attachment.contentDisposition || "").toLowerCase() === "inline" && size < 128 * 1024) return false;
  return Boolean(attachment.filename || size >= 128 * 1024);
}

async function importMessageAttachments(input: {
  source: Buffer;
  folder: string;
  uid: number;
  accountEmail: string;
  internalDate?: Date | null;
}): Promise<number> {
  const mail = await simpleParser(input.source);
  if (!mail.attachments?.length) return 0;

  const from = addressValues(mail.from)[0];
  const to = addressValues(mail.to);
  const account = input.accountEmail.toLowerCase();
  const fromEmail = from?.address || "";
  const direction: "incoming" | "outgoing" = fromEmail === account ? "outgoing" : "incoming";
  const remote = direction === "incoming" ? from : to.find((item) => item.address !== account) || to[0];
  if (!remote?.address) return 0;

  const messageId = String(mail.messageId || `imap:${input.folder}:${input.uid}`).trim();
  const contactId = findContactId(remote.address, messageId);
  if (!contactId) return 0;

  const receivedAt = mail.date || input.internalDate || new Date();
  let imported = 0;

  for (let index = 0; index < mail.attachments.length; index += 1) {
    const attachment = mail.attachments[index];
    if (!usefulAttachment(attachment)) continue;
    const rawName = String(attachment.filename || `Вложение ${index + 1}`).trim();
    const attachmentId = String(attachment.cid || `${index}:${rawName}`).slice(0, 240);
    try {
      const saved = saveClientDocument({
        contactId,
        kind: detectClientDocumentKind(rawName),
        name: rawName,
        mimeType: attachment.contentType || null,
        bytes: attachment.content,
        sourceChannel: "email",
        sourceMessageId: messageId,
        sourceAttachmentId: attachmentId,
        sourceDirection: direction,
        createdAt: receivedAt,
      });
      if (saved) imported += 1;
    } catch (error) {
      console.warn("Email attachment skipped", rawName, error instanceof Error ? error.message : error);
    }
  }

  return imported;
}

let activeAttachmentSync: Promise<{ imported: number; folders: string[]; backfill: boolean }> | null = null;

export async function syncEmailAttachments(): Promise<{ imported: number; folders: string[]; backfill: boolean }> {
  if (activeAttachmentSync) return activeAttachmentSync;

  activeAttachmentSync = (async () => {
    const config = getEmailConfig();
    if (!isEmailConfigured(config)) return { imported: 0, folders: [], backfill: false };

    const backfill = getSetting(BACKFILL_KEY) !== "1";
    const sinceDays = backfill ? Math.max(365, config.syncDays) : Math.max(3, config.syncDays);
    const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
    const client = new ImapFlow({
      host: config.imapHost,
      port: config.imapPort,
      secure: config.imapSecure,
      auth: { user: config.username, pass: config.password },
      logger: false,
      connectionTimeout: 12000,
      greetingTimeout: 12000,
      socketTimeout: 30000,
    });

    let imported = 0;
    const folders: string[] = [];
    try {
      await client.connect();
      const mailboxes = await client.list();
      const inbox = mailboxes.find((box) => box.specialUse === "\\Inbox")?.path || "INBOX";
      const sent =
        mailboxes.find((box) => box.specialUse === "\\Sent")?.path ||
        mailboxes.find((box) => /(^|\/)(sent|sent items|отправлен)/i.test(box.path))?.path ||
        null;
      folders.push(...Array.from(new Set([inbox, sent].filter(Boolean))) as string[]);

      for (const folder of folders) {
        const lock = await client.getMailboxLock(folder);
        try {
          const uids = await client.search({ since }, { uid: true });
          const capped = uids.slice(backfill ? -2500 : -500);
          for (let offset = 0; offset < capped.length; offset += 100) {
            const batch = capped.slice(offset, offset + 100);
            for await (const message of client.fetch(batch, { uid: true, source: true, internalDate: true }, { uid: true })) {
              if (!message.source || !message.uid) continue;
              try {
                imported += await importMessageAttachments({
                  source: message.source,
                  folder,
                  uid: Number(message.uid),
                  accountEmail: config.address,
                  internalDate: message.internalDate || null,
                });
              } catch (error) {
                console.error("Email attachment parse failed", folder, message.uid, error);
              }
            }
          }
        } finally {
          lock.release();
        }
      }

      if (backfill) setSetting(BACKFILL_KEY, "1");
      setSetting("satori_email_attachments_last_sync_at", new Date().toISOString());
      return { imported, folders, backfill };
    } finally {
      try { await client.logout(); } catch {}
    }
  })();

  try {
    return await activeAttachmentSync;
  } finally {
    activeAttachmentSync = null;
  }
}
