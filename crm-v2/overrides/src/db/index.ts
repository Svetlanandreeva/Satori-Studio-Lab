import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import path from "path";
import fs from "fs";

const DB_PATH = process.env.CRM_DB_PATH || path.join(process.cwd(), "data", "crm.db");

const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

function createDatabase(): Database.Database {
  const db = new Database(DB_PATH, { timeout: 15000 });

  try {
    db.pragma("journal_mode = WAL");
  } catch {}

  try {
    db.pragma("busy_timeout = 15000");
  } catch {}

  try {
    db.pragma("foreign_keys = ON");
  } catch {}

  return db;
}

function initTables(db: Database.Database): void {
  const tables = [
    `CREATE TABLE IF NOT EXISTS contacts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      company TEXT,
      source TEXT NOT NULL DEFAULT 'otro',
      temperature TEXT NOT NULL DEFAULT 'cold',
      qualification TEXT NOT NULL DEFAULT 'new',
      score INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS pipeline_stages (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      "order" INTEGER NOT NULL,
      color TEXT NOT NULL DEFAULT '#64748b',
      is_won INTEGER NOT NULL DEFAULT 0,
      is_lost INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS deals (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      value INTEGER NOT NULL DEFAULT 0,
      stage_id TEXT NOT NULL REFERENCES pipeline_stages(id),
      contact_id TEXT NOT NULL REFERENCES contacts(id),
      expected_close INTEGER,
      probability INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS activities (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      description TEXT NOT NULL,
      contact_id TEXT NOT NULL REFERENCES contacts(id),
      deal_id TEXT REFERENCES deals(id),
      scheduled_at INTEGER,
      completed_at INTEGER,
      created_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS crm_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`,
  ];

  for (const sql of tables) {
    try {
      db.exec(sql);
    } catch {}
  }

  try {
    const columns = db.prepare("PRAGMA table_info(contacts)").all() as Array<{ name: string }>;
    if (!columns.some((column) => column.name === "qualification")) {
      db.exec("ALTER TABLE contacts ADD COLUMN qualification TEXT NOT NULL DEFAULT 'new'");
    }
  } catch (error) {
    console.error("CRM qualification migration failed", error);
  }
}

function seedDefaultStages(db: Database.Database): void {
  try {
    const result = db
      .prepare("SELECT COUNT(*) as count FROM pipeline_stages")
      .get() as { count: number } | undefined;

    if (!result || result.count > 0) return;

    const defaultStages = [
      { name: "Новый запрос", order: 1, color: "#64748b", isWon: 0, isLost: 0 },
      { name: "Расчёт", order: 2, color: "#2563eb", isWon: 0, isLost: 0 },
      { name: "Согласовано", order: 3, color: "#8b5cf6", isWon: 0, isLost: 0 },
      { name: "В производстве", order: 4, color: "#ea580c", isWon: 0, isLost: 0 },
      { name: "Готово", order: 5, color: "#0f766e", isWon: 0, isLost: 0 },
      { name: "Доставка", order: 6, color: "#0891b2", isWon: 0, isLost: 0 },
      { name: "Завершено", order: 7, color: "#16a34a", isWon: 1, isLost: 0 },
      { name: "Отказ", order: 8, color: "#dc2626", isWon: 0, isLost: 1 },
    ];

    const insert = db.prepare(
      `INSERT OR IGNORE INTO pipeline_stages (id, name, "order", color, is_won, is_lost) VALUES (?, ?, ?, ?, ?, ?)`
    );

    const seedAll = db.transaction(() => {
      for (const stage of defaultStages) {
        insert.run(
          crypto.randomUUID(),
          stage.name,
          stage.order,
          stage.color,
          stage.isWon,
          stage.isLost
        );
      }
    });

    seedAll();
  } catch {}
}

function phoneIdentity(value: string | null): string | null {
  if (!value) return null;
  let digits = value.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("8")) digits = `7${digits.slice(1)}`;
  if (digits.length === 10) digits = `7${digits}`;
  return digits.length >= 10 ? digits : null;
}

function emailIdentity(value: string | null): string | null {
  const email = value?.trim().toLowerCase();
  return email || null;
}

function mergeDuplicateContacts(db: Database.Database): number {
  try {
    const rows = db
      .prepare(
        `SELECT id, name, email, phone, company, notes, qualification, created_at
         FROM contacts
         ORDER BY created_at ASC, id ASC`
      )
      .all() as Array<{
        id: string;
        name: string;
        email: string | null;
        phone: string | null;
        company: string | null;
        notes: string | null;
        qualification: string | null;
        created_at: number;
      }>;

    const phoneMap = new Map<string, string>();
    const emailMap = new Map<string, string>();
    let merged = 0;

    const transaction = db.transaction(() => {
      for (const row of rows) {
        const phone = phoneIdentity(row.phone);
        const email = emailIdentity(row.email);
        const canonicalId = (phone && phoneMap.get(phone)) || (email && emailMap.get(email));

        if (!canonicalId || canonicalId === row.id) {
          if (phone) phoneMap.set(phone, row.id);
          if (email) emailMap.set(email, row.id);
          continue;
        }

        const canonical = db
          .prepare("SELECT * FROM contacts WHERE id = ?")
          .get(canonicalId) as Record<string, unknown> | undefined;
        if (!canonical) continue;

        const mergedNotes = [canonical.notes, row.notes]
          .filter((value, index, all) => value && all.indexOf(value) === index)
          .join("\n\n");
        const qualification =
          canonical.qualification && canonical.qualification !== "new"
            ? canonical.qualification
            : row.qualification || "new";

        db.prepare(
          `UPDATE contacts
           SET email = COALESCE(NULLIF(email, ''), ?),
               phone = COALESCE(NULLIF(phone, ''), ?),
               company = COALESCE(NULLIF(company, ''), ?),
               notes = ?,
               qualification = ?,
               updated_at = ?
           WHERE id = ?`
        ).run(
          row.email,
          row.phone,
          row.company,
          mergedNotes || null,
          qualification,
          Date.now(),
          canonicalId
        );

        db.prepare("UPDATE deals SET contact_id = ? WHERE contact_id = ?").run(canonicalId, row.id);
        db.prepare("UPDATE activities SET contact_id = ? WHERE contact_id = ?").run(canonicalId, row.id);
        db.prepare("DELETE FROM contacts WHERE id = ?").run(row.id);
        merged += 1;

        if (phone) phoneMap.set(phone, canonicalId);
        if (email) emailMap.set(email, canonicalId);
      }
    });

    transaction();
    return merged;
  } catch (error) {
    console.error("CRM contact dedupe failed", error);
    return 0;
  }
}

function removeExactDuplicateDeals(db: Database.Database): number {
  try {
    const rows = db
      .prepare(
        `SELECT id, contact_id, title, value, stage_id, expected_close, probability, notes, created_at
         FROM deals
         ORDER BY created_at ASC, id ASC`
      )
      .all() as Array<Record<string, unknown>>;

    const seen = new Map<string, string>();
    let removed = 0;
    const transaction = db.transaction(() => {
      for (const row of rows) {
        const key = JSON.stringify([
          row.contact_id,
          row.title,
          row.value,
          row.stage_id,
          row.expected_close ?? null,
          row.probability,
          row.notes ?? null,
          row.created_at,
        ]);
        const canonicalId = seen.get(key);
        if (!canonicalId) {
          seen.set(key, String(row.id));
          continue;
        }
        db.prepare("UPDATE activities SET deal_id = ? WHERE deal_id = ?").run(canonicalId, row.id);
        db.prepare("DELETE FROM deals WHERE id = ?").run(row.id);
        removed += 1;
      }
    });
    transaction();
    return removed;
  } catch (error) {
    console.error("CRM deal dedupe failed", error);
    return 0;
  }
}

const sqlite = createDatabase();
initTables(sqlite);
seedDefaultStages(sqlite);

const mergedContacts = mergeDuplicateContacts(sqlite);
const removedDeals = removeExactDuplicateDeals(sqlite);
if (mergedContacts || removedDeals) {
  console.log(`CRM dedupe: merged ${mergedContacts} contacts, removed ${removedDeals} exact duplicate deals`);
}

export const db = drizzle(sqlite, { schema });
