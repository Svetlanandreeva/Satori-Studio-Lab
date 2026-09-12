import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const DB_PATH = process.env.CRM_DB_PATH || path.join(process.cwd(), "data", "crm.db");
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const sqlite = new Database(DB_PATH, { timeout: 15000 });
try { sqlite.pragma("journal_mode = WAL"); } catch {}
try { sqlite.pragma("busy_timeout = 15000"); } catch {}
try { sqlite.pragma("foreign_keys = ON"); } catch {}

function tableExists(table: string): boolean {
  return Boolean(sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table));
}

function ensureEconomicsMigrationPrerequisites() {
  try {
    if (tableExists("deal_economics")) {
      const columns = sqlite.prepare("PRAGMA table_info(deal_economics)").all() as Array<{ name: string }>;
      if (!columns.some((column) => column.name === "payment_commission_rate")) {
        sqlite.exec("ALTER TABLE deal_economics ADD COLUMN payment_commission_rate REAL NOT NULL DEFAULT 0");
      }
    }

    if (tableExists("business_expenses")) {
      const columns = sqlite.prepare("PRAGMA table_info(business_expenses)").all() as Array<{ name: string }>;
      const migrations: Array<[string, string]> = [
        ["expense_type", "TEXT NOT NULL DEFAULT 'fixed'"],
        ["percent_rate", "REAL NOT NULL DEFAULT 0"],
        ["percent_base_amount", "INTEGER NOT NULL DEFAULT 0"],
        ["due_date", "TEXT"],
        ["paid_at", "TEXT"],
        ["recurring_monthly", "INTEGER NOT NULL DEFAULT 1"],
        ["recurring_series_id", "TEXT"],
        ["base_month", "TEXT"],
      ];
      for (const [name, definition] of migrations) {
        if (!columns.some((column) => column.name === name)) {
          sqlite.exec(`ALTER TABLE business_expenses ADD COLUMN ${name} ${definition}`);
        }
      }
      sqlite.prepare("UPDATE business_expenses SET recurring_series_id = id WHERE recurring_series_id IS NULL OR TRIM(recurring_series_id) = ''").run();
      sqlite.exec("CREATE INDEX IF NOT EXISTS idx_business_expenses_month ON business_expenses(month)");
      sqlite.exec("CREATE INDEX IF NOT EXISTS idx_business_expenses_series ON business_expenses(recurring_series_id, month)");
    }
  } catch (error) {
    console.error("CRM economics compatibility migration failed", error);
  }
}

// economics.ts imports this module before creating its indexes. Existing CRM databases
// therefore need the new columns added here first, otherwise SQLite rejects the index
// on recurring_series_id and every economics-dependent endpoint returns HTTP 500.
ensureEconomicsMigrationPrerequisites();

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS deal_flow_state (
    deal_id TEXT PRIMARY KEY REFERENCES deals(id) ON DELETE CASCADE,
    calculation_entered_at INTEGER,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS deal_flow_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
`);

interface StageRow {
  id: string;
  name: string;
  stageOrder: number;
  isLost: number | boolean;
  isWon: number | boolean;
}

function normalize(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е");
}

function stages(): StageRow[] {
  return sqlite
    .prepare(`
      SELECT
        id,
        name,
        "order" AS stageOrder,
        is_lost AS isLost,
        is_won AS isWon
      FROM pipeline_stages
      ORDER BY "order" ASC
    `)
    .all() as StageRow[];
}

export function findCalculationStage(): StageRow | null {
  const all = stages();
  return all.find((stage) => normalize(stage.name).includes("расчет")) || null;
}

function isSandboxStage(name: unknown): boolean {
  const value = normalize(name);
  return value.includes("песочниц") || value.includes("спам");
}

function cleanupLegacyLostBackfill() {
  const key = "lost_backfill_cleaned_v1";
  const existing = sqlite
    .prepare(`SELECT value FROM deal_flow_meta WHERE key = ?`)
    .get(key) as { value: string } | undefined;
  if (existing) return;

  const now = Date.now();
  const transaction = sqlite.transaction(() => {
    // The first version of milestone backfill inferred every stage with an order
    // after «Расчёт», including «Отказ». Historical lost deals therefore could be
    // marked even when they had never reached calculation. Remove only that
    // one-time legacy seed. After this marker is stored, genuinely calculated
    // deals remain tracked even if they later move to «Отказ».
    sqlite.prepare(`
      DELETE FROM deal_flow_state
      WHERE deal_id IN (
        SELECT d.id
        FROM deals d
        JOIN pipeline_stages ps ON ps.id = d.stage_id
        WHERE COALESCE(ps.is_lost, 0) = 1
      )
    `).run();

    sqlite.prepare(`
      INSERT INTO deal_flow_meta (key, value, updated_at)
      VALUES (?, '1', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(key, now);
  });
  transaction();
}

export function markDealReachedCalculation(dealId: string, targetStageId?: string | null) {
  const calculation = findCalculationStage();
  if (!calculation) return false;

  const target = targetStageId
    ? sqlite
        .prepare(`
          SELECT
            id,
            name,
            "order" AS stageOrder,
            is_lost AS isLost,
            is_won AS isWon
          FROM pipeline_stages
          WHERE id = ?
        `)
        .get(targetStageId) as StageRow | undefined
    : sqlite
        .prepare(`
          SELECT
            ps.id,
            ps.name,
            ps."order" AS stageOrder,
            ps.is_lost AS isLost,
            ps.is_won AS isWon
          FROM deals d
          JOIN pipeline_stages ps ON ps.id = d.stage_id
          WHERE d.id = ?
        `)
        .get(dealId) as StageRow | undefined;

  if (
    !target ||
    Boolean(target.isLost) ||
    isSandboxStage(target.name) ||
    Number(target.stageOrder) < Number(calculation.stageOrder)
  ) {
    return false;
  }

  const now = Date.now();
  sqlite.prepare(`
    INSERT INTO deal_flow_state (deal_id, calculation_entered_at, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(deal_id) DO UPDATE SET
      calculation_entered_at = COALESCE(deal_flow_state.calculation_entered_at, excluded.calculation_entered_at),
      updated_at = excluded.updated_at
  `).run(dealId, now, now);
  return true;
}

export function syncCalculationMilestones() {
  cleanupLegacyLostBackfill();

  const calculation = findCalculationStage();
  if (!calculation) return { calculationStage: null, marked: 0 };

  const current = sqlite.prepare(`
    SELECT
      d.id AS dealId,
      ps.name AS stageName,
      ps."order" AS stageOrder,
      ps.is_lost AS isLost,
      ps.is_won AS isWon
    FROM deals d
    JOIN pipeline_stages ps ON ps.id = d.stage_id
  `).all() as Array<{
    dealId: string;
    stageName: string;
    stageOrder: number;
    isLost: number | boolean;
    isWon: number | boolean;
  }>;

  const insert = sqlite.prepare(`
    INSERT INTO deal_flow_state (deal_id, calculation_entered_at, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(deal_id) DO UPDATE SET
      calculation_entered_at = COALESCE(deal_flow_state.calculation_entered_at, excluded.calculation_entered_at),
      updated_at = excluded.updated_at
  `);

  const now = Date.now();
  let marked = 0;
  const transaction = sqlite.transaction(() => {
    for (const row of current) {
      if (Boolean(row.isLost)) continue;
      if (isSandboxStage(row.stageName)) continue;
      if (Number(row.stageOrder) < Number(calculation.stageOrder)) continue;
      insert.run(row.dealId, now, now);
      marked += 1;
    }
  });
  transaction();
  return { calculationStage: calculation, marked };
}

export function calculationReachedDealIds(): string[] {
  syncCalculationMilestones();
  return (
    sqlite
      .prepare(`SELECT deal_id AS dealId FROM deal_flow_state WHERE calculation_entered_at IS NOT NULL`)
      .all() as Array<{ dealId: string }>
  ).map((row) => row.dealId);
}
