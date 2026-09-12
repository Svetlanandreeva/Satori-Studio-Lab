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

const allowedKinds = new Set(["contract", "invoice", "brief", "specification", "other"]);
const allowedExt = new Set([".pdf", ".doc", ".docx", ".xls", ".xlsx", ".jpg", ".jpeg", ".png", ".webp", ".zip"]);

export interface ClientDocumentRecord {
  id: string;
  contactId: string;
  kind: string;
  name: string;
  storedName?: string;
  mimeType: string | null;
  sizeBytes: number;
  createdAt: number;
}

export interface ClientDocumentFile extends ClientDocumentRecord {
  storedName: string;
  filePath: string;
}

function safeName(value: string): string {
  return path.basename(value || "document").replace(/[\x00-\x1f<>:"/\\|?*]+/g, "_").slice(0, 160) || "document";
}

export function listClientDocuments(contactId: string): ClientDocumentRecord[] {
  return sqlite.prepare(`SELECT id,contact_id AS contactId,kind,name,mime_type AS mimeType,size_bytes AS sizeBytes,created_at AS createdAt
    FROM client_documents WHERE contact_id=? ORDER BY created_at DESC`).all(contactId) as ClientDocumentRecord[];
}

export function saveClientDocument(input: { contactId: string; kind: string; name: string; mimeType?: string | null; bytes: Uint8Array }) {
  const contact = sqlite.prepare("SELECT id FROM contacts WHERE id=?").get(input.contactId);
  if (!contact) throw new Error("Клиент не найден");
  if (input.bytes.byteLength <= 0) throw new Error("Файл пустой");
  if (input.bytes.byteLength > 20 * 1024 * 1024) throw new Error("Максимальный размер файла 20 МБ");
  const name = safeName(input.name);
  const ext = path.extname(name).toLowerCase();
  if (!allowedExt.has(ext)) throw new Error("Разрешены PDF, DOC/DOCX, XLS/XLSX, JPG/PNG/WEBP и ZIP");
  const kind = allowedKinds.has(input.kind) ? input.kind : "other";
  const id = crypto.randomUUID();
  const storedName = `${id}${ext}`;
  fs.writeFileSync(path.join(baseDir, storedName), Buffer.from(input.bytes));
  sqlite.prepare(`INSERT INTO client_documents(id,contact_id,kind,name,stored_name,mime_type,size_bytes,created_at)
    VALUES(?,?,?,?,?,?,?,?)`).run(id, input.contactId, kind, name, storedName, input.mimeType || null, input.bytes.byteLength, Date.now());
  return listClientDocuments(input.contactId).find(x => x.id === id) || null;
}

export function getClientDocument(documentId: string, contactId?: string): ClientDocumentFile | null {
  const row = sqlite.prepare(`SELECT id,contact_id AS contactId,kind,name,stored_name AS storedName,mime_type AS mimeType,size_bytes AS sizeBytes,created_at AS createdAt
    FROM client_documents WHERE id=?`).get(documentId) as Omit<ClientDocumentFile, "filePath"> | undefined;
  if (!row || (contactId && row.contactId !== contactId)) return null;
  const filePath = path.join(baseDir, row.storedName);
  if (!fs.existsSync(filePath)) return null;
  return { ...row, filePath };
}

export function deleteClientDocument(documentId: string, contactId: string) {
  const row = getClientDocument(documentId, contactId);
  if (!row) return false;
  try { fs.unlinkSync(row.filePath); } catch {}
  sqlite.prepare("DELETE FROM client_documents WHERE id=? AND contact_id=?").run(documentId, contactId);
  return true;
}
