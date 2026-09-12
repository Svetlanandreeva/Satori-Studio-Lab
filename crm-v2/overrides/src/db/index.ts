import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import path from "path";
import fs from "fs";
import { SPAM_STAGE_NAME } from "@/lib/lead-qualification";

export const DB_PATH = process.env.CRM_DB_PATH || path.join(process.cwd(), "data", "crm.db");
const RESTORE_MARKER = `${DB_PATH}.restore-pending`;

function applyPendingRestore(): void {
  try {
    if (!fs.existsSync(RESTORE_MARKER)) return;
    const backupPath = fs.readFileSync(RESTORE_MARKER, "utf8").trim();
    if (!backupPath || !fs.existsSync(backupPath)) {
      fs.rmSync(RESTORE_MARKER, { force: true });
      console.error("CRM restore marker referenced a missing backup", backupPath);
      return;
    }
    const check = new Database(backupPath, { readonly: true });
    const integrity = check.pragma("quick_check", { simple: true });
    check.close();
    if (String(integrity).toLowerCase() !== "ok") {
      fs.rmSync(RESTORE_MARKER, { force: true });
      throw new Error(`Backup integrity check failed: ${integrity}`);
    }
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    fs.copyFileSync(backupPath, `${DB_PATH}.restore-tmp`);
    fs.rmSync(`${DB_PATH}-wal`, { force: true });
    fs.rmSync(`${DB_PATH}-shm`, { force: true });
    fs.renameSync(`${DB_PATH}.restore-tmp`, DB_PATH);
    fs.rmSync(RESTORE_MARKER, { force: true });
    console.log(`CRM database restored from ${path.basename(backupPath)}`);
  } catch (error) {
    console.error("CRM pending restore failed", error);
  }
}

applyPendingRestore();

const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

function createDatabase(): Database.Database {
  const database = new Database(DB_PATH, { timeout: 15000 });
  try { database.pragma("journal_mode = WAL"); } catch {}
  try { database.pragma("busy_timeout = 15000"); } catch {}
  try { database.pragma("foreign_keys = ON"); } catch {}
  return database;
}

function addColumn(database: Database.Database, table: string, ddl: string, column: string): void {
  try {
    const columns = database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (!columns.some((item) => item.name === column)) database.exec(ddl);
  } catch (error) {
    console.error(`CRM migration failed: ${table}.${column}`, error);
  }
}

function initTables(database: Database.Database): void {
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
    `CREATE TABLE IF NOT EXISTS team_members (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      login TEXT UNIQUE,
      password_hash TEXT,
      role TEXT NOT NULL DEFAULT 'manager',
      active INTEGER NOT NULL DEFAULT 1,
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
      owner_id TEXT,
      loss_reason TEXT,
      expected_close INTEGER,
      probability INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS deal_stage_history (
      id TEXT PRIMARY KEY,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      from_stage_id TEXT,
      to_stage_id TEXT NOT NULL,
      reason TEXT,
      changed_by TEXT,
      created_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS activities (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      description TEXT NOT NULL,
      contact_id TEXT NOT NULL REFERENCES contacts(id),
      deal_id TEXT REFERENCES deals(id),
      owner_id TEXT,
      priority TEXT NOT NULL DEFAULT 'normal',
      scheduled_at INTEGER,
      completed_at INTEGER,
      created_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS message_templates (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      channel TEXT NOT NULL DEFAULT 'all',
      body TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS project_checklist (
      id TEXT PRIMARY KEY,
      deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      title TEXT NOT NULL,
      done INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL,
      UNIQUE(deal_id, key)
    )`,
    `CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      actor_id TEXT,
      actor_name TEXT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      details TEXT,
      created_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS crm_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS email_threads (
      id TEXT PRIMARY KEY,
      thread_key TEXT NOT NULL UNIQUE,
      subject TEXT NOT NULL DEFAULT 'Без темы',
      remote_email TEXT NOT NULL,
      remote_name TEXT,
      contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL,
      is_service INTEGER NOT NULL DEFAULT 0,
      unread_count INTEGER NOT NULL DEFAULT 0,
      last_message_at INTEGER NOT NULL,
      last_snippet TEXT,
      last_direction TEXT NOT NULL DEFAULT 'incoming',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS email_messages (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL REFERENCES email_threads(id) ON DELETE CASCADE,
      message_id TEXT NOT NULL UNIQUE,
      in_reply_to TEXT,
      "references" TEXT,
      direction TEXT NOT NULL,
      folder TEXT,
      remote_uid INTEGER,
      from_email TEXT NOT NULL,
      from_name TEXT,
      to_email TEXT NOT NULL,
      subject TEXT NOT NULL DEFAULT 'Без темы',
      body_text TEXT NOT NULL DEFAULT '',
      is_service INTEGER NOT NULL DEFAULT 0,
      is_read INTEGER NOT NULL DEFAULT 0,
      received_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_email_threads_last_message ON email_threads(last_message_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_email_threads_contact ON email_threads(contact_id)`,
    `CREATE INDEX IF NOT EXISTS idx_email_messages_thread_time ON email_messages(thread_id, received_at ASC)`,
    `CREATE INDEX IF NOT EXISTS idx_activities_schedule ON activities(completed_at, scheduled_at)`,
    `CREATE INDEX IF NOT EXISTS idx_stage_history_deal ON deal_stage_history(deal_id, created_at ASC)`,
    `CREATE INDEX IF NOT EXISTS idx_project_checklist_deal ON project_checklist(deal_id, sort_order ASC)`,
    `CREATE INDEX IF NOT EXISTS idx_audit_log_time ON audit_log(created_at DESC)`,
  ];

  for (const sql of tables) {
    try { database.exec(sql); } catch (error) { console.error("CRM table init failed", error); }
  }

  addColumn(database, "contacts", "ALTER TABLE contacts ADD COLUMN qualification TEXT NOT NULL DEFAULT 'new'", "qualification");
  addColumn(database, "deals", "ALTER TABLE deals ADD COLUMN owner_id TEXT", "owner_id");
  addColumn(database, "deals", "ALTER TABLE deals ADD COLUMN loss_reason TEXT", "loss_reason");
  addColumn(database, "activities", "ALTER TABLE activities ADD COLUMN owner_id TEXT", "owner_id");
  addColumn(database, "activities", "ALTER TABLE activities ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal'", "priority");

  try {
    database.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_deal_stage_insert
      AFTER INSERT ON deals
      BEGIN
        INSERT INTO deal_stage_history(id, deal_id, from_stage_id, to_stage_id, reason, changed_by, created_at)
        VALUES(lower(hex(randomblob(16))), NEW.id, NULL, NEW.stage_id, 'Создание сделки', NULL, NEW.created_at);
      END;

      CREATE TRIGGER IF NOT EXISTS trg_deal_stage_change
      AFTER UPDATE OF stage_id ON deals
      WHEN OLD.stage_id <> NEW.stage_id
      BEGIN
        INSERT INTO deal_stage_history(id, deal_id, from_stage_id, to_stage_id, reason, changed_by, created_at)
        VALUES(lower(hex(randomblob(16))), NEW.id, OLD.stage_id, NEW.stage_id, NULL, NULL, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER));
      END;
    `);
  } catch (error) {
    console.error("CRM stage history trigger init failed", error);
  }

  try {
    const existingDeals = database.prepare("SELECT id, stage_id, created_at FROM deals").all() as Array<{ id: string; stage_id: string; created_at: number }>;
    const hasHistory = database.prepare("SELECT 1 FROM deal_stage_history WHERE deal_id=? LIMIT 1");
    const insertHistory = database.prepare("INSERT INTO deal_stage_history(id,deal_id,from_stage_id,to_stage_id,reason,changed_by,created_at) VALUES(?,?,?,?,?,?,?)");
    for (const deal of existingDeals) {
      if (!hasHistory.get(deal.id)) insertHistory.run(crypto.randomUUID(), deal.id, null, deal.stage_id, "Текущий этап при включении истории", null, deal.created_at || Date.now());
    }
  } catch (error) {
    console.error("CRM stage history backfill failed", error);
  }
}

function seedDefaultStages(database: Database.Database): void {
  try {
    const result = database.prepare("SELECT COUNT(*) as count FROM pipeline_stages").get() as { count: number } | undefined;
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
    const insert = database.prepare(`INSERT OR IGNORE INTO pipeline_stages (id, name, "order", color, is_won, is_lost) VALUES (?, ?, ?, ?, ?, ?)`);
    const seedAll = database.transaction(() => {
      for (const stage of defaultStages) insert.run(crypto.randomUUID(), stage.name, stage.order, stage.color, stage.isWon, stage.isLost);
    });
    seedAll();
  } catch (error) { console.error("CRM stage seed failed", error); }
}

function seedOperations(database: Database.Database): void {
  try {
    const now = Date.now();
    database.prepare(`INSERT OR IGNORE INTO team_members(id,name,login,password_hash,role,active,created_at,updated_at) VALUES('owner','Владелец',NULL,NULL,'owner',1,?,?)`).run(now, now);
    const count = database.prepare("SELECT COUNT(*) AS count FROM message_templates").get() as { count: number } | undefined;
    if (!count?.count) {
      const insert = database.prepare("INSERT INTO message_templates(id,title,channel,body,sort_order,created_at,updated_at) VALUES(?,?,?,?,?,?,?)");
      const templates = [
        ["Получили заявку", "all", "Здравствуйте! Получили ваш запрос. Сейчас уточним детали и вернёмся с расчётом.", 10],
        ["Отправляю расчёт", "all", "Здравствуйте! Отправляю предварительный расчёт. Если всё подходит, зафиксируем детали и перейдём к производству.", 20],
        ["Запустили производство", "all", "Заказ запущен в производство. Будем держать вас в курсе и сообщим, когда всё будет готово к отправке.", 30],
        ["Заказ готов", "all", "Ваш заказ готов. Подготавливаем упаковку и передачу в доставку.", 40],
        ["Трек отправления", "all", "Заказ передан в доставку. Трек-номер отправления: ", 50],
      ] as const;
      for (const [title, channel, body, order] of templates) insert.run(crypto.randomUUID(), title, channel, body, order, now, now);
    }
  } catch (error) { console.error("CRM operations seed failed", error); }
}

function ensureSpamStage(database: Database.Database): void {
  try {
    const existing = database.prepare("SELECT id FROM pipeline_stages WHERE name = ? LIMIT 1").get(SPAM_STAGE_NAME) as { id: string } | undefined;
    if (existing) return;
    database.prepare(`INSERT INTO pipeline_stages (id, name, "order", color, is_won, is_lost) VALUES (?, ?, ?, ?, 0, 0)`).run(crypto.randomUUID(), SPAM_STAGE_NAME, 999, "#7f1d1d");
  } catch (error) { console.error("CRM spam stage migration failed", error); }
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

function mergeDuplicateContacts(database: Database.Database): number {
  try {
    const rows = database.prepare(`SELECT id, name, email, phone, company, notes, qualification, created_at FROM contacts ORDER BY created_at ASC, id ASC`).all() as Array<{ id: string; name: string; email: string | null; phone: string | null; company: string | null; notes: string | null; qualification: string | null; created_at: number }>;
    const phoneMap = new Map<string, string>();
    const emailMap = new Map<string, string>();
    let merged = 0;
    const transaction = database.transaction(() => {
      for (const row of rows) {
        const phone = phoneIdentity(row.phone);
        const email = emailIdentity(row.email);
        const canonicalId = (phone && phoneMap.get(phone)) || (email && emailMap.get(email));
        if (!canonicalId || canonicalId === row.id) {
          if (phone) phoneMap.set(phone, row.id);
          if (email) emailMap.set(email, row.id);
          continue;
        }
        const canonical = database.prepare("SELECT email, phone, company, notes, qualification FROM contacts WHERE id = ?").get(canonicalId) as { email: string | null; phone: string | null; company: string | null; notes: string | null; qualification: string | null } | undefined;
        if (!canonical) continue;
        const mergedNotes = [canonical.notes, row.notes].filter((value, index, all) => value && all.indexOf(value) === index).join("\n\n");
        const qualification = canonical.qualification && canonical.qualification !== "new" ? canonical.qualification : row.qualification || "new";
        database.prepare(`UPDATE contacts SET email=COALESCE(NULLIF(email,''),?), phone=COALESCE(NULLIF(phone,''),?), company=COALESCE(NULLIF(company,''),?), notes=?, qualification=?, updated_at=? WHERE id=?`).run(row.email, row.phone, row.company, mergedNotes || null, qualification, Date.now(), canonicalId);
        database.prepare("UPDATE deals SET contact_id=? WHERE contact_id=?").run(canonicalId, row.id);
        database.prepare("UPDATE activities SET contact_id=? WHERE contact_id=?").run(canonicalId, row.id);
        database.prepare("UPDATE email_threads SET contact_id=? WHERE contact_id=?").run(canonicalId, row.id);
        try { database.prepare("UPDATE client_documents SET contact_id=? WHERE contact_id=?").run(canonicalId, row.id); } catch {}
        database.prepare("DELETE FROM contacts WHERE id=?").run(row.id);
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

function removeExactDuplicateDeals(database: Database.Database): number {
  try {
    const rows = database.prepare(`SELECT id, contact_id, title, value, stage_id, expected_close, probability, notes, created_at FROM deals ORDER BY created_at ASC, id ASC`).all() as Array<{ id: string; contact_id: string; title: string; value: number; stage_id: string; expected_close: number | null; probability: number; notes: string | null; created_at: number }>;
    const seen = new Map<string, string>();
    let removed = 0;
    const transaction = database.transaction(() => {
      for (const row of rows) {
        const legacyMarker = (row.notes || "").toLowerCase().includes("legacy");
        const identityTimestamp = legacyMarker ? "legacy-import" : row.created_at;
        const key = JSON.stringify([row.contact_id, row.title, row.value, row.stage_id, row.expected_close, row.probability, row.notes, identityTimestamp]);
        const canonicalId = seen.get(key);
        if (!canonicalId) { seen.set(key, row.id); continue; }
        database.prepare("UPDATE activities SET deal_id=? WHERE deal_id=?").run(canonicalId, row.id);
        database.prepare("DELETE FROM deals WHERE id=?").run(row.id);
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

export const sqlite = createDatabase();
initTables(sqlite);
seedDefaultStages(sqlite);
ensureSpamStage(sqlite);
seedOperations(sqlite);

const mergedContacts = mergeDuplicateContacts(sqlite);
const removedDeals = removeExactDuplicateDeals(sqlite);
if (mergedContacts || removedDeals) console.log(`CRM dedupe: merged ${mergedContacts} contacts, removed ${removedDeals} duplicate deals`);

export const db = drizzle(sqlite, { schema });
