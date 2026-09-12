import { ImapFlow } from "imapflow";
import { simpleParser, type AddressObject, type ParsedMail } from "mailparser";
import nodemailer from "nodemailer";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { contacts, emailMessages, emailThreads } from "@/db/schema";
import { saveClientDocument } from "@/lib/client-documents";
import { INTEGRATION_KEYS, getBooleanSetting, getSetting, setSetting } from "@/lib/satori-integrations";

export interface EmailIntegrationConfig {
  address: string;
  username: string;
  password: string;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  fromName: string;
  ignoreSenders: string[];
  ignoreSubjects: string[];
  syncDays: number;
}

export interface OutgoingEmailAttachment {
  filename: string;
  content: Uint8Array;
  contentType?: string | null;
}

function numberSetting(key: string, fallback: number): number {
  const value = Number(getSetting(key));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
function listSetting(key: string): string[] {
  return String(getSetting(key) || "").split(/[\n,;]+/).map((item) => item.trim().toLowerCase()).filter(Boolean);
}

export function getEmailConfig(): EmailIntegrationConfig {
  const address = String(getSetting(INTEGRATION_KEYS.emailAddress) || "").trim().toLowerCase();
  return {
    address,
    username: String(getSetting(INTEGRATION_KEYS.emailUsername) || address).trim(),
    password: String(getSetting(INTEGRATION_KEYS.emailPassword) || ""),
    imapHost: String(getSetting(INTEGRATION_KEYS.emailImapHost) || "").trim(),
    imapPort: numberSetting(INTEGRATION_KEYS.emailImapPort, 993),
    imapSecure: getBooleanSetting(INTEGRATION_KEYS.emailImapSecure, true),
    smtpHost: String(getSetting(INTEGRATION_KEYS.emailSmtpHost) || "").trim(),
    smtpPort: numberSetting(INTEGRATION_KEYS.emailSmtpPort, 465),
    smtpSecure: getBooleanSetting(INTEGRATION_KEYS.emailSmtpSecure, true),
    fromName: String(getSetting(INTEGRATION_KEYS.emailFromName) || "Satori Studio").trim() || "Satori Studio",
    ignoreSenders: listSetting(INTEGRATION_KEYS.emailIgnoreSenders),
    ignoreSubjects: listSetting(INTEGRATION_KEYS.emailIgnoreSubjects),
    syncDays: Math.min(3650, Math.max(1, numberSetting(INTEGRATION_KEYS.emailSyncDays, 365))),
  };
}

export function isEmailConfigured(config = getEmailConfig()): boolean {
  return Boolean(config.address && config.username && config.password && config.imapHost && config.smtpHost);
}

function createImap(config: EmailIntegrationConfig) {
  return new ImapFlow({
    host: config.imapHost, port: config.imapPort, secure: config.imapSecure,
    auth: { user: config.username, pass: config.password }, logger: false,
    connectionTimeout: 12000, greetingTimeout: 12000, socketTimeout: 25000,
  });
}
function createSmtp(config: EmailIntegrationConfig) {
  return nodemailer.createTransport({
    host: config.smtpHost, port: config.smtpPort, secure: config.smtpSecure,
    auth: { user: config.username, pass: config.password }, connectionTimeout: 12000,
    greetingTimeout: 12000, socketTimeout: 20000, tls: { rejectUnauthorized: true },
  });
}
function addressValues(value: AddressObject | AddressObject[] | undefined): Array<{ address: string; name: string }> {
  const objects = Array.isArray(value) ? value : value ? [value] : [];
  return objects.flatMap((object) => (object.value || []).map((item) => ({ address: String(item.address || "").trim().toLowerCase(), name: String(item.name || "").trim() })).filter((item) => item.address));
}
function subjectValue(value: unknown): string { return String(value || "Без темы").trim() || "Без темы"; }
function cleanBody(text: unknown): string {
  return String(text || "").replace(/\r\n/g, "\n").replace(/\n{4,}/g, "\n\n\n").trim().slice(0, 120_000);
}
function snippet(text: string): string { return text.replace(/\s+/g, " ").trim().slice(0, 220); }
function headerText(mail: ParsedMail, name: string): string {
  const value = mail.headers.get(name.toLowerCase());
  return value === undefined || value === null ? "" : String(value).trim().toLowerCase();
}
function senderExplicitlyIgnored(email: string, patterns: string[]): boolean {
  const normalized = email.toLowerCase();
  return patterns.some((pattern) => pattern && (pattern.startsWith("@") ? normalized.endsWith(pattern) : normalized === pattern || normalized.includes(pattern)));
}
function looksServiceMail(mail: ParsedMail, remoteEmail: string, config: EmailIntegrationConfig): boolean {
  const localPart = remoteEmail.split("@")[0] || "";
  const subject = subjectValue(mail.subject).toLowerCase();
  if (senderExplicitlyIgnored(remoteEmail, config.ignoreSenders)) return true;
  if (config.ignoreSubjects.some((part) => part && subject.includes(part))) return true;
  if (/^(no[._-]?reply|do[._-]?not[._-]?reply|notifications?|mailer-daemon|postmaster|bounce|robot|bot)([+._-]|$)/i.test(localPart)) return true;
  const autoSubmitted = headerText(mail, "auto-submitted");
  const precedence = headerText(mail, "precedence");
  const listId = headerText(mail, "list-id");
  const autoResponse = headerText(mail, "x-auto-response-suppress");
  if (autoSubmitted && autoSubmitted !== "no") return true;
  if (/bulk|list|junk/.test(precedence) || listId || autoResponse) return true;
  return /^(delivery status notification|undelivered mail returned|mail delivery failed|automatic reply|автоматический ответ|не удалось доставить)/i.test(subject);
}

function findContactByEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  return db.select().from(contacts).all().find((contact) => String(contact.email || "").trim().toLowerCase() === normalized) || null;
}

function touchKnownContact(remoteEmail: string, isService: boolean) {
  const existing = findContactByEmail(remoteEmail);
  if (!existing || isService) return existing;
  if (existing.temperature === "cold" || existing.qualification === "new") {
    db.update(contacts).set({
      temperature: existing.temperature === "cold" ? "warm" : existing.temperature,
      qualification: existing.qualification === "new" ? "working" : existing.qualification,
      score: Math.max(40, Number(existing.score || 0)), updatedAt: new Date(),
    }).where(eq(contacts.id, existing.id)).run();
  }
  return existing;
}

function findOrCreateThread(input: {
  remoteEmail: string; remoteName: string; subject: string; isService: boolean; contactId: string | null;
  receivedAt: Date; bodyText: string; direction: "incoming" | "outgoing";
}) {
  const threadKey = input.remoteEmail.trim().toLowerCase();
  let thread = db.select().from(emailThreads).where(eq(emailThreads.threadKey, threadKey)).get();
  const now = new Date();
  if (!thread) {
    thread = db.insert(emailThreads).values({
      id: crypto.randomUUID(), threadKey, subject: input.subject, remoteEmail: input.remoteEmail,
      remoteName: input.remoteName || null, contactId: input.contactId, isService: input.isService,
      unreadCount: 0, lastMessageAt: input.receivedAt, lastSnippet: snippet(input.bodyText),
      lastDirection: input.direction, createdAt: now, updatedAt: now,
    }).returning().get();
  }
  return thread;
}

function upsertParsedMessage(input: {
  mail: ParsedMail; folder: string; uid: number; accountEmail: string; unread: boolean;
  internalDate?: Date | null; config: EmailIntegrationConfig;
}): boolean {
  const from = addressValues(input.mail.from)[0];
  const to = addressValues(input.mail.to);
  const fromEmail = from?.address || "";
  const account = input.accountEmail.toLowerCase();
  const direction: "incoming" | "outgoing" = fromEmail === account ? "outgoing" : "incoming";
  const remote = direction === "incoming" ? from : to.find((item) => item.address !== account) || to[0];
  if (!remote?.address) return false;
  const messageId = String(input.mail.messageId || `imap:${input.folder}:${input.uid}`).trim();
  if (db.select().from(emailMessages).where(eq(emailMessages.messageId, messageId)).get()) return false;

  const subject = subjectValue(input.mail.subject);
  const bodyText = cleanBody(input.mail.text || input.mail.html || "");
  const knownContact = findContactByEmail(remote.address);
  const explicitlyIgnored = senderExplicitlyIgnored(remote.address, input.config.ignoreSenders);
  const isService = explicitlyIgnored || (!knownContact && looksServiceMail(input.mail, remote.address, input.config));
  const contact = knownContact ? touchKnownContact(remote.address, isService) : null;
  const receivedAt = input.mail.date || input.internalDate || new Date();
  const thread = findOrCreateThread({ remoteEmail: remote.address, remoteName: remote.name, subject, isService, contactId: contact?.id || null, receivedAt, bodyText, direction });
  const now = new Date();

  db.insert(emailMessages).values({
    id: crypto.randomUUID(), threadId: thread.id, messageId,
    inReplyTo: input.mail.inReplyTo ? String(input.mail.inReplyTo) : null,
    references: input.mail.references ? (Array.isArray(input.mail.references) ? input.mail.references.join(" ") : String(input.mail.references)) : null,
    direction, folder: input.folder, remoteUid: input.uid, fromEmail: fromEmail || account,
    fromName: from?.name || null, toEmail: to.map((item) => item.address).join(", ") || account,
    subject, bodyText, isService, isRead: direction === "outgoing" || !input.unread,
    receivedAt, createdAt: now,
  }).run();

  const isNewer = receivedAt.getTime() >= thread.lastMessageAt.getTime();
  const unreadIncrement = direction === "incoming" && input.unread ? 1 : 0;
  db.update(emailThreads).set({
    subject: isNewer ? subject : thread.subject,
    remoteName: remote.name || thread.remoteName,
    contactId: contact?.id || thread.contactId,
    isService,
    unreadCount: Math.max(0, Number(thread.unreadCount || 0) + unreadIncrement),
    lastMessageAt: isNewer ? receivedAt : thread.lastMessageAt,
    lastSnippet: isNewer ? snippet(bodyText) : thread.lastSnippet,
    lastDirection: isNewer ? direction : thread.lastDirection,
    updatedAt: now,
  }).where(eq(emailThreads.id, thread.id)).run();
  return true;
}

async function syncMailbox(client: ImapFlow, mailboxPath: string, config: EmailIntegrationConfig, since: Date): Promise<number> {
  const lock = await client.getMailboxLock(mailboxPath);
  let imported = 0;
  try {
    const uids = await client.search({ since }, { uid: true });
    if (!uids.length) return 0;
    const capped = uids.slice(-5000);
    for (let offset = 0; offset < capped.length; offset += 100) {
      const batch = capped.slice(offset, offset + 100);
      for await (const message of client.fetch(batch, { uid: true, source: true, flags: true, internalDate: true }, { uid: true })) {
        if (!message.source || !message.uid) continue;
        try {
          const mail = await simpleParser(message.source);
          if (upsertParsedMessage({ mail, folder: mailboxPath, uid: Number(message.uid), accountEmail: config.address, unread: !message.flags?.has("\\Seen"), internalDate: message.internalDate || null, config })) imported += 1;
        } catch (error) { console.error("Email message parse failed", mailboxPath, message.uid, error); }
      }
    }
  } finally { lock.release(); }
  return imported;
}

let activeSync: Promise<{ imported: number; folders: string[] }> | null = null;
export async function syncEmailMailbox(): Promise<{ imported: number; folders: string[] }> {
  if (activeSync) return activeSync;
  activeSync = (async () => {
    const config = getEmailConfig();
    if (!isEmailConfigured(config)) return { imported: 0, folders: [] };
    const client = createImap(config);
    try {
      await client.connect();
      const mailboxes = await client.list();
      const inbox = mailboxes.find((box) => box.specialUse === "\\Inbox")?.path || "INBOX";
      const sent = mailboxes.find((box) => box.specialUse === "\\Sent")?.path || mailboxes.find((box) => /(^|\/)(sent|sent items|отправлен)/i.test(box.path))?.path || null;
      const folders = Array.from(new Set([inbox, sent].filter(Boolean))) as string[];
      const since = new Date(Date.now() - config.syncDays * 24 * 60 * 60 * 1000);
      let imported = 0;
      for (const folder of folders) imported += await syncMailbox(client, folder, config, since);
      setSetting(INTEGRATION_KEYS.emailLastSyncAt, new Date().toISOString());
      setSetting(INTEGRATION_KEYS.emailLastSyncError, "");
      return { imported, folders };
    } catch (error) {
      setSetting(INTEGRATION_KEYS.emailLastSyncError, (error instanceof Error ? error.message : "Ошибка синхронизации почты").slice(0, 500));
      throw error;
    } finally { try { await client.logout(); } catch {} }
  })();
  try { return await activeSync; } finally { activeSync = null; }
}

export async function testEmailConnection(): Promise<{ imap: boolean; smtp: boolean }> {
  const config = getEmailConfig();
  if (!isEmailConfigured(config)) throw new Error("Заполните настройки почты");
  const client = createImap(config);
  try { await client.connect(); await client.mailboxOpen("INBOX", { readOnly: true }); }
  finally { try { await client.logout(); } catch {} }
  await createSmtp(config).verify();
  return { imap: true, smtp: true };
}

export function listEmailThreads(filter: "client" | "service" | "all" = "client", search = "") {
  const query = search.trim().toLowerCase();
  return db.select().from(emailThreads).orderBy(desc(emailThreads.lastMessageAt)).all().filter((thread) => {
    if (filter === "client" && thread.isService) return false;
    if (filter === "service" && !thread.isService) return false;
    if (!query) return true;
    return [thread.remoteName, thread.remoteEmail, thread.subject, thread.lastSnippet].filter(Boolean).some((value) => String(value).toLowerCase().includes(query));
  });
}

export function getEmailThread(threadId: string) {
  const thread = db.select().from(emailThreads).where(eq(emailThreads.id, threadId)).get();
  if (!thread) return null;
  const messages = db.select().from(emailMessages).where(eq(emailMessages.threadId, threadId)).all().sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime());
  if (thread.unreadCount > 0) {
    db.update(emailThreads).set({ unreadCount: 0, updatedAt: new Date() }).where(eq(emailThreads.id, threadId)).run();
    for (const message of messages) if (!message.isRead) db.update(emailMessages).set({ isRead: true }).where(eq(emailMessages.id, message.id)).run();
  }
  const contact = thread.contactId ? db.select().from(contacts).where(eq(contacts.id, thread.contactId)).get() || null : null;
  return { thread: { ...thread, unreadCount: 0 }, messages, contact };
}

export function setThreadService(threadId: string, isService: boolean) {
  const thread = db.select().from(emailThreads).where(eq(emailThreads.id, threadId)).get();
  if (!thread) return null;
  db.update(emailThreads).set({ isService, updatedAt: new Date() }).where(eq(emailThreads.id, threadId)).run();
  return db.select().from(emailThreads).where(eq(emailThreads.id, threadId)).get();
}

export async function replyToEmailThread(threadId: string, body: string, attachments: OutgoingEmailAttachment[] = []) {
  const text = cleanBody(body);
  if (!text && !attachments.length) throw new Error("Напишите сообщение или приложите файл");
  const config = getEmailConfig();
  if (!isEmailConfigured(config)) throw new Error("Почта не подключена");
  const thread = db.select().from(emailThreads).where(eq(emailThreads.id, threadId)).get();
  if (!thread) throw new Error("Диалог не найден");
  const lastMessage = db.select().from(emailMessages).where(eq(emailMessages.threadId, threadId)).orderBy(desc(emailMessages.receivedAt)).get();
  const subject = /^re:/i.test(thread.subject) ? thread.subject : `Re: ${thread.subject}`;
  const mailAttachments = attachments.map((attachment) => ({
    filename: attachment.filename,
    content: Buffer.from(attachment.content),
    contentType: attachment.contentType || undefined,
  }));
  const fallbackText = text || (attachments.length === 1 ? `Файл: ${attachments[0].filename}` : `Файлы: ${attachments.map((item) => item.filename).join(", ")}`);
  const info = await createSmtp(config).sendMail({
    from: { name: config.fromName, address: config.address }, to: thread.remoteEmail, subject,
    text: fallbackText, inReplyTo: lastMessage?.messageId || undefined,
    references: lastMessage?.messageId ? [lastMessage.messageId] : undefined,
    attachments: mailAttachments,
  });
  const messageId = String(info.messageId || `<crm-${crypto.randomUUID()}@satori.local>`);
  const now = new Date();
  if (!db.select().from(emailMessages).where(eq(emailMessages.messageId, messageId)).get()) {
    db.insert(emailMessages).values({
      id: crypto.randomUUID(), threadId, messageId, inReplyTo: lastMessage?.messageId || null,
      references: lastMessage?.messageId || null, direction: "outgoing", folder: "CRM", remoteUid: null,
      fromEmail: config.address, fromName: config.fromName, toEmail: thread.remoteEmail, subject,
      bodyText: text || attachments.map((item) => `📎 ${item.filename}`).join("\n"), isService: thread.isService,
      isRead: true, receivedAt: now, createdAt: now,
    }).run();
  }
  if (thread.contactId) {
    for (let index = 0; index < attachments.length; index += 1) {
      const attachment = attachments[index];
      try {
        saveClientDocument({
          contactId: thread.contactId, name: attachment.filename, mimeType: attachment.contentType || null,
          bytes: attachment.content, sourceChannel: "email", sourceMessageId: messageId,
          sourceAttachmentId: `out:${index}`, sourceDirection: "outgoing", createdAt: now,
        });
      } catch (error) { console.error("Failed to save outgoing email attachment", error); }
    }
  }
  const display = text || attachments.map((item) => `📎 ${item.filename}`).join(" · ");
  db.update(emailThreads).set({ subject, lastMessageAt: now, lastSnippet: snippet(display), lastDirection: "outgoing", updatedAt: now }).where(eq(emailThreads.id, threadId)).run();
  return { sent: true, messageId, attachments: attachments.length };
}
