import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const DB_PATH = process.env.CRM_DB_PATH || path.join(process.cwd(), "data", "crm.db");
const baseDir = process.env.CRM_CLIENT_FILES_PATH || path.join(path.dirname(DB_PATH), "client-files");
if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });
const sqlite = new Database(DB_PATH, { timeout: 15000 });
try { sqlite.pragma("journal_mode = WAL"); } catch {}
try { sqlite.pragma("busy_timeout = 15000"); } catch {}

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS client_documents (
    id TEXT PRIMARY KEY,
    contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    kind TEXT NOT NULL DEFAULT 'other',
    name TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    mime_type TEXT,
    size_bytes INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_client_documents_contact ON client_documents(contact_id, created_at DESC);
`);

for (const ddl of [
  "ALTER TABLE client_documents ADD COLUMN source_channel TEXT",
  "ALTER TABLE client_documents ADD COLUMN source_message_id TEXT",
  "ALTER TABLE client_documents ADD COLUMN source_attachment_id TEXT",
  "ALTER TABLE client_documents ADD COLUMN source_direction TEXT",
] as const) {
  try {
    sqlite.exec(ddl);
  } catch (error) {
    if (!/duplicate column name/i.test(error instanceof Error ? error.message : String(error))) throw error;
  }
}

sqlite.exec(`
  CREATE INDEX IF NOT EXISTS idx_client_documents_source
    ON client_documents(contact_id, source_channel, source_message_id, source_attachment_id);
`);

const allowedKinds = new Set(["contract", "commercial_offer", "invoice", "brief", "specification", "other"]);
const allowedExt = new Set([
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt", ".csv",
  ".jpg", ".jpeg", ".png", ".webp", ".heic", ".zip", ".rar", ".7z",
  ".stl", ".step", ".stp", ".3mf",
]);

export interface ClientDocumentRecord {
  id: string;
  contactId: string;
  kind: string;
  name: string;
  storedName?: string;
  mimeType: string | null;
  sizeBytes: number;
  createdAt: number;
  sourceChannel: string | null;
  sourceMessageId: string | null;
  sourceAttachmentId: string | null;
  sourceDirection: string | null;
}

export interface ClientDocumentFile extends ClientDocumentRecord {
  storedName: string;
  filePath: string;
}

function safeName(value: string): string {
  return path.basename(value || "document").replace(/[\x00-\x1f<>:"/\\|?*]+/g, "_").slice(0, 160) || "document";
}

function extensionFromMime(mimeType?: string | null): string {
  const value = String(mimeType || "").toLowerCase();
  const map: Record<string, string> = {
    "application/pdf": ".pdf",
    "application/msword": ".doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/vnd.ms-excel": ".xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
    "application/vnd.ms-powerpoint": ".ppt",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/heic": ".heic",
    "text/plain": ".txt",
    "text/csv": ".csv",
    "application/zip": ".zip",
  };
  return map[value] || "";
}

export function detectClientDocumentKind(name: string): string {
  const value = String(name || "").toLowerCase();
  if (/(^|[\s._-])(кп|commercial[\s_-]*offer|proposal|quotation|quote|estimate)([\s._-]|$)|коммерческ.{0,12}предлож/.test(value)) return "commercial_offer";
  if (/договор|contract|agreement/.test(value)) return "contract";
  if (/сч[её]т|invoice|bill/.test(value)) return "invoice";
  if (/спецификац|specification|(^|[\s._-])spec([\s._-]|$)/.test(value)) return "specification";
  if (/(^|[\s._-])тз([\s._-]|$)|технич.{0,12}задан|brief|бриф/.test(value)) return "brief";
  return "other";
}

function selectColumns() {
  return `id,contact_id AS contactId,kind,name,stored_name AS storedName,mime_type AS mimeType,size_bytes AS sizeBytes,created_at AS createdAt,
    source_channel AS sourceChannel,source_message_id AS sourceMessageId,source_attachment_id AS sourceAttachmentId,source_direction AS sourceDirection`;
}

export function listClientDocuments(contactId: string): ClientDocumentRecord[] {
  return sqlite.prepare(`SELECT ${selectColumns()} FROM client_documents WHERE contact_id=? ORDER BY created_at DESC`)
    .all(contactId) as ClientDocumentRecord[];
}

export function saveClientDocument(input: {
  contactId: string;
  kind?: string;
  name: string;
  mimeType?: string | null;
  bytes: Uint8Array;
  sourceChannel?: string | null;
  sourceMessageId?: string | null;
  sourceAttachmentId?: string | null;
  sourceDirection?: string | null;
  createdAt?: number | Date | null;
}) {
  const contact = sqlite.prepare("SELECT id FROM contacts WHERE id=?").get(input.contactId);
  if (!contact) throw new Error("Клиент не найден");
  if (input.bytes.byteLength <= 0) throw new Error("Файл пустой");
  if (input.bytes.byteLength > 20 * 1024 * 1024) throw new Error("Максимальный размер файла 20 МБ");

  if (input.sourceChannel && input.sourceMessageId && input.sourceAttachmentId) {
    const existing = sqlite.prepare(`SELECT ${selectColumns()} FROM client_documents
      WHERE contact_id=? AND source_channel=? AND source_message_id=? AND source_attachment_id=? LIMIT 1`)
      .get(input.contactId, input.sourceChannel, input.sourceMessageId, input.sourceAttachmentId) as ClientDocumentRecord | undefined;
    if (existing) return existing;
  }

  let name = safeName(input.name);
  let ext = path.extname(name).toLowerCase();
  if (!ext) {
    ext = extensionFromMime(input.mimeType);
    if (ext) name = `${name}${ext}`;
  }
  if (!allowedExt.has(ext)) throw new Error("Этот формат файла пока не поддерживается в карточке клиента");

  const requestedKind = String(input.kind || "");
  const kind = allowedKinds.has(requestedKind) ? requestedKind : detectClientDocumentKind(name);
  const id = crypto.randomUUID();
  const storedName = `${id}${ext}`;
  fs.writeFileSync(path.join(baseDir, storedName), Buffer.from(input.bytes));
  const createdAt = input.createdAt instanceof Date ? input.createdAt.getTime() : Number(input.createdAt || Date.now());

  sqlite.prepare(`INSERT INTO client_documents(
      id,contact_id,kind,name,stored_name,mime_type,size_bytes,created_at,
      source_channel,source_message_id,source_attachment_id,source_direction
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(
      id,
      input.contactId,
      kind,
      name,
      storedName,
      input.mimeType || null,
      input.bytes.byteLength,
      Number.isFinite(createdAt) ? createdAt : Date.now(),
      input.sourceChannel || null,
      input.sourceMessageId || null,
      input.sourceAttachmentId || null,
      input.sourceDirection || null
    );
  return listClientDocuments(input.contactId).find((x) => x.id === id) || null;
}

export function getClientDocument(documentId: string, contactId?: string): ClientDocumentFile | null {
  const row = sqlite.prepare(`SELECT ${selectColumns()} FROM client_documents WHERE id=?`)
    .get(documentId) as ClientDocumentRecord | undefined;
  if (!row || (contactId && row.contactId !== contactId) || !row.storedName) return null;
  const filePath = path.join(baseDir, row.storedName);
  if (!fs.existsSync(filePath)) return null;
  return { ...row, storedName: row.storedName, filePath } as ClientDocumentFile;
}

export function deleteClientDocument(documentId: string, contactId: string) {
  const row = getClientDocument(documentId, contactId);
  if (!row) return false;
  try { fs.unlinkSync(row.filePath); } catch {}
  sqlite.prepare("DELETE FROM client_documents WHERE id=? AND contact_id=?").run(documentId, contactId);
  return true;
}
