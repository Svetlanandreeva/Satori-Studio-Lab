import Database from "better-sqlite3";
import path from "path";

const sqlite = new Database(process.env.CRM_DB_PATH || path.join(process.cwd(), "data", "crm.db"), { timeout: 15000 });

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS deal_manual_overrides (
    deal_id TEXT PRIMARY KEY,
    value_locked INTEGER NOT NULL DEFAULT 0,
    stage_locked INTEGER NOT NULL DEFAULT 0,
    title_locked INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
  );
`);

export function getDealManualOverrides(dealId: string) {
  const row = sqlite.prepare(`SELECT value_locked AS valueLocked, stage_locked AS stageLocked, title_locked AS titleLocked FROM deal_manual_overrides WHERE deal_id=?`).get(dealId) as any;
  return { valueLocked: Boolean(row?.valueLocked), stageLocked: Boolean(row?.stageLocked), titleLocked: Boolean(row?.titleLocked) };
}

export function lockDealFields(dealId: string, fields: { value?: boolean; stage?: boolean; title?: boolean }) {
  const current = getDealManualOverrides(dealId);
  sqlite.prepare(`
    INSERT INTO deal_manual_overrides(deal_id,value_locked,stage_locked,title_locked,updated_at)
    VALUES(?,?,?,?,?)
    ON CONFLICT(deal_id) DO UPDATE SET
      value_locked=excluded.value_locked,
      stage_locked=excluded.stage_locked,
      title_locked=excluded.title_locked,
      updated_at=excluded.updated_at
  `).run(
    dealId,
    fields.value === undefined ? Number(current.valueLocked) : Number(fields.value),
    fields.stage === undefined ? Number(current.stageLocked) : Number(fields.stage),
    fields.title === undefined ? Number(current.titleLocked) : Number(fields.title),
    Date.now(),
  );
}
