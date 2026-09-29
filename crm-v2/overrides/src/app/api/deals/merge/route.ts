import { NextRequest, NextResponse } from "next/server";
import { sqlite } from "@/db";
import { deleteDealsCascade } from "@/lib/safe-delete";
import { getRequestActor } from "@/lib/request-actor";
import { writeAuditLog } from "@/lib/operations";

/**
 * Объединение дублей одного заказа: остаётся выбранная сделка, к ней переносятся
 * история, задачи, закупки, файлы; оплаты/сроки берутся с дубля, только если у основной их нет.
 */
function tableHas(table: string, column: string) {
  try { return (sqlite.prepare(`PRAGMA table_info("${table}")`).all() as Array<{ name: string }>).some((c) => c.name === column); }
  catch { return false; }
}

export async function POST(request: NextRequest) {
  let body: { keepId?: unknown; ids?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 }); }
  const keepId = String(body.keepId || "");
  const ids = Array.isArray(body.ids) ? [...new Set(body.ids.map(String))].filter((id) => id && id !== keepId) : [];
  if (!keepId || !ids.length) return NextResponse.json({ error: "Выбери основную сделку и дубли" }, { status: 400 });
  const keep = sqlite.prepare("SELECT id, title, notes, value FROM deals WHERE id=?").get(keepId) as { id: string; title: string; notes: string | null; value: number } | undefined;
  if (!keep) return NextResponse.json({ error: "Основная сделка не найдена" }, { status: 404 });
  const others = ids.map((id) => sqlite.prepare("SELECT id, title, notes, value FROM deals WHERE id=?").get(id) as { id: string; title: string; notes: string | null; value: number } | undefined).filter(Boolean) as Array<{ id: string; title: string; notes: string | null; value: number }>;
  if (!others.length) return NextResponse.json({ error: "Дубли не найдены" }, { status: 404 });

  try {
    sqlite.transaction(() => {
      const otherIds = others.map((o) => o.id);
      const marks = otherIds.map(() => "?").join(",");
      // Переносим «живые» данные на основную сделку.
      for (const table of ["activities", "deal_purchases", "client_documents"]) {
        if (tableHas(table, "deal_id")) sqlite.prepare(`UPDATE "${table}" SET deal_id=? WHERE deal_id IN (${marks})`).run(keepId, ...otherIds);
      }
      // Сроки и оплата — с дубля, если у основной пусто.
      if (tableHas("project_details", "deal_id")) {
        const has = sqlite.prepare("SELECT ordered_at FROM project_details WHERE deal_id=?").get(keepId) as { ordered_at?: string } | undefined;
        if (!has?.ordered_at) {
          const donor = sqlite.prepare(`SELECT * FROM project_details WHERE deal_id IN (${marks}) AND ordered_at IS NOT NULL LIMIT 1`).get(...otherIds) as Record<string, unknown> | undefined;
          if (donor) {
            sqlite.prepare("DELETE FROM project_details WHERE deal_id=?").run(keepId);
            sqlite.prepare("UPDATE project_details SET deal_id=? WHERE deal_id=?").run(keepId, donor.deal_id);
          }
        }
      }
      if (tableHas("deal_economics", "deal_id")) {
        const has = sqlite.prepare("SELECT received_amount AS r FROM deal_economics WHERE deal_id=?").get(keepId) as { r?: number } | undefined;
        if (!has?.r) {
          const donor = sqlite.prepare(`SELECT deal_id FROM deal_economics WHERE deal_id IN (${marks}) AND received_amount > 0 ORDER BY received_amount DESC LIMIT 1`).get(...otherIds) as { deal_id?: string } | undefined;
          if (donor?.deal_id) {
            sqlite.prepare("DELETE FROM deal_economics WHERE deal_id=?").run(keepId);
            sqlite.prepare("UPDATE deal_economics SET deal_id=? WHERE deal_id=?").run(keepId, donor.deal_id);
          }
        }
      }
      // Сумма — с дубля, если у основной не указана; служебные метки переписки сохраняем.
      const value = keep.value || Math.max(0, ...others.map((o) => Number(o.value) || 0));
      const markers = new Set<string>();
      for (const n of [keep.notes, ...others.map((o) => o.notes)]) for (const m of String(n || "").match(/\[[a-z][a-z0-9-]*:[^\]]+\]/gi) || []) markers.add(m);
      const plain = String(keep.notes || "").replace(/\[[a-z][a-z0-9-]*:[^\]]+\]/gi, "").trim();
      const merged = [...markers].join(" ") + (plain ? ` ${plain}` : "") + `\nОбъединено с: ${others.map((o) => `«${o.title}»`).join(", ")}`;
      sqlite.prepare("UPDATE deals SET value=?, notes=?, updated_at=? WHERE id=?").run(value, merged.trim(), Math.floor(Date.now() / 1000), keepId);
    })();
    deleteDealsCascade(others.map((o) => o.id));
    writeAuditLog(getRequestActor(request), "merge_deals", "deal", keepId, { merged: others.map((o) => ({ id: o.id, title: o.title })) });
    return NextResponse.json({ success: true, keepId, merged: others.length });
  } catch (error) {
    console.error("Deal merge failed", error);
    return NextResponse.json({ error: "Не удалось объединить: " + (error instanceof Error ? error.message : "ошибка") }, { status: 500 });
  }
}
