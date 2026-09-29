import { NextRequest, NextResponse } from "next/server";
import { sqlite } from "@/db";
import { promoteEmailThreadToCrm, setEmailThreadService } from "@/lib/email-crm-policy";
import { getRequestActor } from "@/lib/request-actor";
import { writeAuditLog } from "@/lib/operations";
import { deleteDealsCascade } from "@/lib/safe-delete";
import { workStage } from "@/lib/work-stage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Статус обращения из «Сообщений»:
 *  new    — просто написал (контакт считается, в сделках его нет);
 *  work   — взят в работу: карточка появляется в сделках на этапе из настроек (по умолчанию — следующий после «Новый запрос»);
 *  ignore — не клиент (спам, реклама) — не считается обращением;
 *  contractor — подрядчик/поставщик: переписка во вкладке «Подрядчики», не клиент и не обращение.
 */
type Status = "new" | "work" | "ignore" | "contractor";

function openDealFor(contactId: string) {
  return sqlite.prepare(`SELECT d.id, d.stage_id AS stageId, ps.name AS stageName FROM deals d JOIN pipeline_stages ps ON ps.id=d.stage_id
    WHERE d.contact_id=? AND COALESCE(ps.is_won,0)=0 AND COALESCE(ps.is_lost,0)=0 ORDER BY d.updated_at DESC LIMIT 1`).get(contactId) as { id: string; stageId: string; stageName: string } | undefined;
}

function state(contactId: string | null) {
  if (!contactId) return { status: "new" as Status, stageName: null, dealId: null };
  const contact = sqlite.prepare("SELECT qualification FROM contacts WHERE id=?").get(contactId) as { qualification?: string } | undefined;
  const deal = openDealFor(contactId);
  if (deal) return { status: (deal.stageId === workStage().first?.id ? "new" : "work") as Status, stageName: deal.stageName, dealId: deal.id };
  if (contact?.qualification === "contractor") return { status: "contractor" as Status, stageName: null, dealId: null };
  if (["ignore", "spam", "unqualified"].includes(String(contact?.qualification || ""))) return { status: "ignore" as Status, stageName: null, dealId: null };
  return { status: "new" as Status, stageName: null, dealId: null };
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  if (url.searchParams.get("list")) {
    const contractors = (sqlite.prepare("SELECT id FROM contacts WHERE qualification='contractor'").all() as Array<{ id: string }>).map((r) => r.id);
    // В архив чатов: «Не клиент» или сделка ушла в «Отказ» и открытых сделок нет.
    const rows = sqlite.prepare(`SELECT c.id, c.updated_at AS cu,
        (SELECT MAX(d.updated_at) FROM deals d JOIN pipeline_stages ps ON ps.id=d.stage_id WHERE d.contact_id=c.id AND COALESCE(ps.is_lost,0)=1) AS lostAt,
        (SELECT MAX(a.created_at) FROM audit_log a WHERE a.action='inbox_status' AND a.entity_id=c.id) AS markedAt
      FROM contacts c WHERE
        (c.qualification IN ('ignore','spam','unqualified','not_target')
         OR EXISTS (SELECT 1 FROM deals d JOIN pipeline_stages ps ON ps.id=d.stage_id WHERE d.contact_id=c.id AND COALESCE(ps.is_lost,0)=1))
        AND NOT EXISTS (SELECT 1 FROM deals d JOIN pipeline_stages ps ON ps.id=d.stage_id WHERE d.contact_id=c.id AND COALESCE(ps.is_lost,0)=0 AND COALESCE(ps.is_won,0)=0)
        AND COALESCE(c.qualification,'') <> 'contractor'`).all() as Array<{ id: string; cu: number | null; lostAt: number | null; markedAt: number | null }>;
    // Момент отказа (мс): чат вернётся в список, только если клиент напишет после него.
    const ms = (v: number | null) => { const n = Number(v) || 0; return n > 1e12 ? n : n * 1000; };
    const archived = Object.fromEntries(rows.map((r) => [r.id, Math.max(ms(r.lostAt), ms(r.markedAt)) || ms(r.cu)]));
    return NextResponse.json({ contactIds: contractors, contractors, archived });
  }
  const contactId = url.searchParams.get("contactId");
  return NextResponse.json(state(contactId));
}

export async function POST(request: NextRequest) {
  const actor = getRequestActor(request);
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 }); }
  const status = String(body.status || "") as Status;
  const channel = String(body.channel || "");
  const threadId = body.threadId ? String(body.threadId) : null;
  let contactId = body.contactId ? String(body.contactId) : null;
  const title = String(body.title || "").trim();
  if (!["new", "work", "ignore", "contractor"].includes(status)) return NextResponse.json({ error: "Неизвестный статус" }, { status: 400 });

  try {
    const now = Math.floor(Date.now() / 1000);
    if (status === "work") {
      const stages = workStage();
      if (!stages.work) return NextResponse.json({ error: "В воронке нет этапов" }, { status: 400 });
      if (channel === "email" && threadId) {
        const result = promoteEmailThreadToCrm(threadId);
        contactId = result.contact.id;
      }
      if (!contactId) return NextResponse.json({ error: "Нет клиента для этого диалога" }, { status: 400 });
      const existing = openDealFor(contactId);
      if (!existing) {
        const contact = sqlite.prepare("SELECT name FROM contacts WHERE id=?").get(contactId) as { name?: string } | undefined;
        sqlite.prepare(`INSERT INTO deals(id,title,value,stage_id,contact_id,probability,notes,created_at,updated_at) VALUES(?,?,0,?,?,30,?,?,?)`)
          .run(crypto.randomUUID(), title || `${channel === "telegram" ? "Telegram" : "Заявка"} · ${contact?.name || "клиент"}`, stages.work.id, contactId, "Взято в работу из «Сообщений»", now, now);
      } else if (stages.first && existing.stageId === stages.first.id) {
        // Лид с первого этапа — переводим в работу.
        sqlite.prepare("UPDATE deals SET stage_id=?, updated_at=? WHERE id=?").run(stages.work.id, now, existing.id);
      }
      if (contactId) sqlite.prepare("UPDATE contacts SET qualification=CASE WHEN qualification IN ('qualified') THEN qualification ELSE 'working' END, updated_at=? WHERE id=?").run(now, contactId);
    } else if (status === "contractor") {
      if (!contactId && channel === "email" && threadId) contactId = promoteEmailThreadToCrm(threadId, { createDeal: false }).contact.id;
      if (!contactId) return NextResponse.json({ error: "Нет контакта для этого диалога" }, { status: 400 });
      const open = openDealFor(contactId);
      if (open && open.stageId !== workStage().first?.id) return NextResponse.json({ error: `У контакта открыта сделка (${open.stageName}). Сначала закройте её.` }, { status: 409 });
      // Пустой лид на первом этапе убираем — подрядчик не сделка.
      if (open) { const v = sqlite.prepare("SELECT value FROM deals WHERE id=?").get(open.id) as { value?: number } | undefined; if (!v?.value) deleteDealsCascade([open.id]); }
      sqlite.prepare("UPDATE contacts SET qualification='contractor', updated_at=? WHERE id=?").run(now, contactId);
    } else if (status === "ignore") {
      const open = contactId ? openDealFor(contactId) : undefined;
      if (open && open.stageId !== workStage().first?.id) return NextResponse.json({ error: `У клиента открыта сделка (${open.stageName}). Переведите её в «Отказ» в карточке сделки.` }, { status: 409 });
      if (contactId) sqlite.prepare("UPDATE contacts SET qualification='ignore', updated_at=? WHERE id=?").run(now, contactId);
      else if (channel === "email" && threadId) setEmailThreadService(threadId, true);
    } else if (contactId) {
      sqlite.prepare("UPDATE contacts SET qualification='new', updated_at=? WHERE id=? AND qualification IN ('ignore','spam','unqualified','contractor')").run(now, contactId);
    }
    writeAuditLog(actor, "inbox_status", "contact", contactId, { status, channel, threadId });
    return NextResponse.json({ ok: true, contactId, ...state(contactId) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Не удалось изменить статус" }, { status: 400 });
  }
}
