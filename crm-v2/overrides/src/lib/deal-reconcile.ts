import Database from "better-sqlite3";
import path from "path";
import { analyzeContactWithAi } from "@/lib/ai-manager";
import { dealConversationContext } from "@/lib/deal-intelligence";

const sqlite = new Database(process.env.CRM_DB_PATH || path.join(process.cwd(), "data", "crm.db"), { timeout: 15000 });

function normalizedTitle(value: unknown): string {
  return String(value || "")
    .toLowerCase()
    .replace(/^\s*(re|fw|fwd):\s*/gi, "")
    .replace(/\[ticket[^\]]*\]/gi, "")
    .replace(/коммерческ(?:ое|ого)? предложение/gi, "")
    .replace(/[^a-zа-яё0-9]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function repairEmailOwnership(): number {
  let repaired = 0;
  const threads = sqlite.prepare(`SELECT id,remote_email AS remoteEmail,contact_id AS contactId FROM email_threads`).all() as any[];
  const contacts = sqlite.prepare(`SELECT id,email FROM contacts WHERE email IS NOT NULL AND trim(email)<>''`).all() as any[];
  const byEmail = new Map(contacts.map((contact) => [String(contact.email).trim().toLowerCase(), contact.id]));

  for (const thread of threads) {
    const expectedContactId = byEmail.get(String(thread.remoteEmail || "").trim().toLowerCase());
    if (!expectedContactId || expectedContactId === thread.contactId) continue;
    sqlite.prepare("UPDATE email_threads SET contact_id=?,updated_at=? WHERE id=?").run(expectedContactId, Date.now(), thread.id);
    repaired += 1;
  }

  // Attach email-origin documents back to the contact that owns the source email thread.
  try {
    sqlite.exec(`
      UPDATE client_documents
      SET contact_id = (
        SELECT et.contact_id
        FROM email_messages em
        JOIN email_threads et ON et.id=em.thread_id
        WHERE em.message_id=client_documents.source_message_id
        LIMIT 1
      )
      WHERE source_channel='email'
        AND source_message_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM email_messages em
          JOIN email_threads et ON et.id=em.thread_id
          WHERE em.message_id=client_documents.source_message_id
            AND et.contact_id IS NOT NULL
            AND et.contact_id<>client_documents.contact_id
        );
    `);
  } catch {}
  return repaired;
}

export async function reconcileDeals() {
  const repairedThreads = repairEmailOwnership();

  const rows = sqlite.prepare(`
    SELECT d.id,d.title,d.contact_id AS contactId,d.value,d.updated_at AS updatedAt
    FROM deals d
    ORDER BY d.updated_at DESC
  `).all() as any[];

  // Only merge exact duplicate deals that already belong to the SAME contact.
  // Never merge different clients because their email text happens to look similar.
  const groups = new Map<string, any[]>();
  for (const row of rows) {
    const title = normalizedTitle(row.title);
    if (!title || ["запрос", "запрос кп", "новая заявка"].includes(title)) continue;
    const key = `${row.contactId}:${title}`;
    const group = groups.get(key) || [];
    group.push(row);
    groups.set(key, group);
  }

  let merged = 0;
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const primary = group.sort((a, b) => (Number(b.value > 0) - Number(a.value > 0)) || Number(b.updatedAt) - Number(a.updatedAt))[0];
    for (const duplicate of group) {
      if (duplicate.id === primary.id) continue;
      if (!primary.value && duplicate.value) {
        sqlite.prepare("UPDATE deals SET value=? WHERE id=?").run(duplicate.value, primary.id);
        primary.value = duplicate.value;
      }
      sqlite.prepare("DELETE FROM deals WHERE id=?").run(duplicate.id);
      merged += 1;
    }
  }

  const currentDeals = sqlite.prepare(`SELECT id,contact_id AS contactId FROM deals ORDER BY updated_at DESC`).all() as any[];
  const analyzedContacts = new Set<string>();
  for (const row of currentDeals) {
    try { dealConversationContext(row.id); } catch {}
    if (analyzedContacts.has(row.contactId)) continue;
    analyzedContacts.add(row.contactId);
    try { await analyzeContactWithAi(row.contactId, { apply: true }); } catch {}
  }

  return { merged, repairedThreads };
}
