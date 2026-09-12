import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { randomUUID } from "node:crypto";

const DB_PATH = process.env.CRM_DB_PATH || path.join(process.cwd(), "data", "crm.db");
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const sqlite = new Database(DB_PATH, { timeout: 15000 });
try { sqlite.pragma("journal_mode = WAL"); } catch {}
try { sqlite.pragma("busy_timeout = 15000"); } catch {}
try { sqlite.pragma("foreign_keys = ON"); } catch {}

export const DELIVERY_STAGE_NAME = "Доставка";
export const LEGACY_SHIPPED_STAGE_NAME = "Отправлен клиенту";
export const COMPLETED_STAGE_NAME = "Завершено";

const CANONICAL_STAGES = [
  { name: "Новый запрос", order: 1, color: "#64748b", isWon: 0, isLost: 0 },
  { name: "Расчёт", order: 2, color: "#2563eb", isWon: 0, isLost: 0 },
  { name: "Согласовано", order: 3, color: "#8b5cf6", isWon: 0, isLost: 0 },
  { name: "В производстве", order: 4, color: "#ea580c", isWon: 0, isLost: 0 },
  { name: "Готово", order: 5, color: "#0f766e", isWon: 0, isLost: 0 },
  { name: DELIVERY_STAGE_NAME, order: 6, color: "#0891b2", isWon: 0, isLost: 0 },
  { name: COMPLETED_STAGE_NAME, order: 7, color: "#16a34a", isWon: 1, isLost: 0 },
  { name: "Отказ", order: 8, color: "#dc2626", isWon: 0, isLost: 1 },
] as const;

function tableExists(name: string): boolean {
  return Boolean(sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
}

function stageRows(name: string) {
  if (!tableExists("pipeline_stages")) return [] as Array<{ id: string; name: string }>;
  return sqlite.prepare("SELECT id,name FROM pipeline_stages WHERE name=? ORDER BY rowid ASC").all(name) as Array<{ id: string; name: string }>;
}

function normalizeLegacyContactSources(): number {
  if (!tableExists("contacts")) return 0;
  let changed = 0;
  const website = sqlite.prepare(`
    UPDATE contacts SET source='website'
    WHERE lower(trim(COALESCE(source,''))) IN ('order','web','site','store','shop','website_order')
  `).run();
  changed += Number(website.changes || 0);
  const telegram = sqlite.prepare(`
    UPDATE contacts SET source='telegram_account'
    WHERE lower(trim(COALESCE(source,''))) IN ('telegram_business','telegram personal','personal_telegram')
  `).run();
  changed += Number(telegram.changes || 0);
  return changed;
}

function ensureCanonicalPipeline(): { created: number; merged: number; movedDeals: number } {
  if (!tableExists("pipeline_stages") || !tableExists("deals")) return { created: 0, merged: 0, movedDeals: 0 };
  let created = 0;
  let merged = 0;
  let movedDeals = 0;

  const tx = sqlite.transaction(() => {
    // Старый магазин создавал отдельную стадию «Отправлен клиенту». По смыслу это
    // тот же момент, что и «Доставка»: производство закончено, заказ передан перевозчику.
    let delivery = stageRows(DELIVERY_STAGE_NAME)[0];
    const legacy = stageRows(LEGACY_SHIPPED_STAGE_NAME);
    if (!delivery && legacy.length) {
      sqlite.prepare(`UPDATE pipeline_stages SET name=?, "order"=6, color='#0891b2', is_won=0, is_lost=0 WHERE id=?`)
        .run(DELIVERY_STAGE_NAME, legacy[0].id);
      delivery = { id: legacy[0].id, name: DELIVERY_STAGE_NAME };
      legacy.shift();
    }

    for (const stage of CANONICAL_STAGES) {
      const rows = stageRows(stage.name);
      let primary = rows[0];
      if (!primary) {
        primary = { id: randomUUID(), name: stage.name };
        sqlite.prepare(`INSERT INTO pipeline_stages(id,name,"order",color,is_won,is_lost) VALUES(?,?,?,?,?,?)`)
          .run(primary.id, stage.name, stage.order, stage.color, stage.isWon, stage.isLost);
        created += 1;
      }
      sqlite.prepare(`UPDATE pipeline_stages SET "order"=?, color=?, is_won=?, is_lost=? WHERE id=?`)
        .run(stage.order, stage.color, stage.isWon, stage.isLost, primary.id);
      for (const duplicate of rows.slice(1)) {
        const result = sqlite.prepare("UPDATE deals SET stage_id=? WHERE stage_id=?").run(primary.id, duplicate.id);
        movedDeals += Number(result.changes || 0);
        sqlite.prepare("DELETE FROM pipeline_stages WHERE id=?").run(duplicate.id);
        merged += 1;
      }
    }

    delivery = stageRows(DELIVERY_STAGE_NAME)[0];
    if (delivery) {
      for (const oldStage of stageRows(LEGACY_SHIPPED_STAGE_NAME)) {
        const result = sqlite.prepare("UPDATE deals SET stage_id=? WHERE stage_id=?").run(delivery.id, oldStage.id);
        movedDeals += Number(result.changes || 0);
        sqlite.prepare("DELETE FROM pipeline_stages WHERE id=?").run(oldStage.id);
        merged += 1;
      }
    }

    // Песочница остаётся вне основной последовательности.
    sqlite.prepare(`UPDATE pipeline_stages SET "order"=999 WHERE lower(name) LIKE '%песочниц%' OR lower(name) LIKE '%спам%'`).run();
  });
  tx();
  return { created, merged, movedDeals };
}

function ensureShipmentWarning(): number {
  if (!tableExists("assistant_insights") || !tableExists("shipment_state") || !tableExists("pipeline_stages")) return 0;
  const now = Date.now();
  const rows = sqlite.prepare(`
    SELECT d.id AS dealId, d.title AS title,
           COALESCE(s.tracking_code,'') AS trackingCode,
           ps.name AS stageName
    FROM deals d
    JOIN pipeline_stages ps ON ps.id=d.stage_id
    LEFT JOIN shipment_state s ON s.deal_id=d.id
  `).all() as Array<{ dealId: string; title: string; trackingCode: string; stageName: string }>;
  let open = 0;
  for (const row of rows) {
    const fingerprint = `shipment-tracking:${row.dealId}`;
    if (row.stageName === DELIVERY_STAGE_NAME && !String(row.trackingCode || "").trim()) {
      sqlite.prepare(`
        INSERT INTO assistant_insights(
          id,fingerprint,severity,category,title,detail,entity_type,entity_id,action_url,status,created_at,updated_at
        ) VALUES(?,?,?,?,?,?,?,?,?,'open',?,?)
        ON CONFLICT(fingerprint) DO UPDATE SET
          severity=excluded.severity, category=excluded.category, title=excluded.title,
          detail=excluded.detail, entity_type=excluded.entity_type, entity_id=excluded.entity_id,
          action_url=excluded.action_url, status='open', updated_at=excluded.updated_at
      `).run(
        randomUUID(), fingerprint, "warning", "projects",
        `Нет трек-номера: ${row.title}`,
        "Сделка уже находится в доставке, но код отправления не указан. Добавьте трек-номер и отправьте его клиенту.",
        "deal", row.dealId, "/pipeline", now, now
      );
      open += 1;
    } else {
      sqlite.prepare("UPDATE assistant_insights SET status='resolved', updated_at=? WHERE fingerprint=? AND status='open'")
        .run(now, fingerprint);
    }
  }
  return open;
}

export function runCrmConsistencyRepair() {
  const normalizedSources = normalizeLegacyContactSources();
  const pipeline = ensureCanonicalPipeline();
  const shipmentWarnings = ensureShipmentWarning();
  return { normalizedSources, pipeline, shipmentWarnings };
}
