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

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS deal_flow_state (
    deal_id TEXT PRIMARY KEY REFERENCES deals(id) ON DELETE CASCADE,
    calculation_entered_at INTEGER,
    updated_at INTEGER NOT NULL
  );
`);

interface StageRow {
  id: string;
  name: string;
  stageOrder: number;
}

function normalize(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е");
}

function stages(): StageRow[] {
  return sqlite
    .prepare(`SELECT id, name, "order" AS stageOrder FROM pipeline_stages ORDER BY "order" ASC`)
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

export function markDealReachedCalculation(dealId: string, targetStageId?: string | null) {
  const calculation = findCalculationStage();
  if (!calculation) return false;

  const target = targetStageId
    ? sqlite
        .prepare(`SELECT id, name, "order" AS stageOrder FROM pipeline_stages WHERE id = ?`)
        .get(targetStageId) as StageRow | undefined
    : sqlite
        .prepare(`
          SELECT ps.id, ps.name, ps."order" AS stageOrder
          FROM deals d
          JOIN pipeline_stages ps ON ps.id = d.stage_id
          WHERE d.id = ?
        `)
        .get(dealId) as StageRow | undefined;

  if (!target || isSandboxStage(target.name) || Number(target.stageOrder) < Number(calculation.stageOrder)) {
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
  const calculation = findCalculationStage();
  if (!calculation) return { calculationStage: null, marked: 0 };

  const current = sqlite.prepare(`
    SELECT d.id AS dealId, ps.name AS stageName, ps."order" AS stageOrder
    FROM deals d
    JOIN pipeline_stages ps ON ps.id = d.stage_id
  `).all() as Array<{ dealId: string; stageName: string; stageOrder: number }>;

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
