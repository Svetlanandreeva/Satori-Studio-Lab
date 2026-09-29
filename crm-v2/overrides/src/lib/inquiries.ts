import { sqlite } from "@/db";
import { normalizeLegacyDate } from "@/lib/date-normalization";
import { ensureReasonColumn } from "@/lib/qualification-reason";

const TZ = "Asia/Yekaterinburg";
const ymd = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

export type Inquiry = { id: string; source: string | null; qualification: string | null; reason: string | null; day: string; status: "work" | "junk" | "wait"; paid: boolean; received: number };

/**
 * Новые обращения за месяц: люди, которые написали сами.
 * Не считаем Need Number, подрядчиков, дубли, только-сервисные письма и тех, кому мы написали первыми.
 * status: work — есть сделка дальше первого этапа; junk — не квал/спам; wait — ещё не разобрано.
 */
export function monthInquiries(month: string): Inquiry[] {
  return rangeInquiries(`${month}-01`, `${month}-31`);
}

/** То же за произвольный период [from, to] включительно (YYYY-MM-DD). */
export function rangeInquiries(from: string, to: string): Inquiry[] {
  const firstStage = (sqlite.prepare(`SELECT id FROM pipeline_stages WHERE COALESCE(is_won,0)=0 AND COALESCE(is_lost,0)=0 AND lower(name) NOT LIKE '%песочн%' AND lower(name) NOT LIKE '%спам%' ORDER BY "order" LIMIT 1`).get() as { id?: string } | undefined)?.id;
  const serviceOnly = new Set((sqlite.prepare(`SELECT contact_id AS id FROM email_threads WHERE contact_id IS NOT NULL GROUP BY contact_id HAVING MIN(COALESCE(is_service,0))=1`).all() as Array<{ id: string }>).map((r) => r.id));
  const dealsByContact = new Map<string, Array<{ stage: string; paid: boolean; received: number }>>();
  for (const r of sqlite.prepare(`SELECT d.contact_id AS c, d.stage_id AS s, (SELECT COALESCE(received_amount,0) FROM deal_economics e WHERE e.deal_id=d.id) AS r, COALESCE(ps.is_won,0) AS won
      FROM deals d JOIN pipeline_stages ps ON ps.id=d.stage_id`).all() as Array<{ c: string; s: string; r: number | null; won: number }>) {
    const l = dealsByContact.get(r.c) || []; l.push({ stage: r.s, paid: Number(r.r || 0) > 0 || Boolean(r.won), received: Number(r.r || 0) }); dealsByContact.set(r.c, l);
  }
  const toMs = (v: unknown) => { const n = Number(v) || 0; return n > 1e12 ? n : n * 1000; };
  const firstMsg = new Map<string, { at: number; out: boolean }>();
  const seen = (id: string | null, at: number, out: boolean) => { if (!id || !at) return; const f = firstMsg.get(id); if (!f || at < f.at) firstMsg.set(id, { at, out }); };
  for (const r of sqlite.prepare("SELECT contact_id AS c, type, created_at AS at FROM activities WHERE type LIKE 'telegram%'").all() as Array<{ c: string; type: string; at: number }>) seen(r.c, toMs(r.at), r.type.includes("outgoing"));
  for (const r of sqlite.prepare("SELECT t.contact_id AS c, m.direction AS d, m.received_at AS at FROM email_messages m JOIN email_threads t ON t.id=m.thread_id WHERE t.contact_id IS NOT NULL").all() as Array<{ c: string; d: string; at: number }>) seen(r.c, toMs(r.at), r.d === "outgoing");
  ensureReasonColumn();
  return (sqlite.prepare("SELECT id, source, qualification, qualification_reason AS reason, created_at AS createdAt FROM contacts").all() as Array<{ id: string; source: string | null; qualification: string | null; reason: string | null; createdAt: unknown }>)
    .map((c) => ({ ...c, day: (() => { const d = normalizeLegacyDate(c.createdAt); return d ? ymd(d) : ""; })() }))
    .filter((c) => c.day >= from && c.day <= to && c.source !== "need_number" && !["contractor", "duplicate"].includes(String(c.qualification || "")) && !serviceOnly.has(c.id) && !firstMsg.get(c.id)?.out)
    .map((c) => {
      const deals = dealsByContact.get(c.id) || [];
      const taken = deals.some((d) => d.stage !== firstStage);
      const junkQ = ["spam", "ignore", "unqualified", "not_target"].includes(String(c.qualification || ""));
      return { id: c.id, source: c.source, qualification: c.qualification, reason: c.reason, day: c.day, status: (taken ? "work" : junkQ ? "junk" : "wait") as Inquiry["status"], paid: deals.some((d) => d.paid), received: deals.reduce((n, d) => n + d.received, 0) };
    });
}
