import { NextRequest, NextResponse } from "next/server";
import { syncSiteLead, type SiteLead } from "@/lib/site-leads";

export const dynamic = "force-dynamic";

/** Заявки с форм сайта. Сайт шлёт сюда с того же сервера (127.0.0.1) — снаружи закрыто сессией. */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as SiteLead | { leads?: SiteLead[]; backfill?: boolean } | null;
  if (!body) return NextResponse.json({ error: "Пустой запрос" }, { status: 400 });
  const leads = Array.isArray((body as { leads?: SiteLead[] }).leads) ? (body as { leads: SiteLead[] }).leads : [body as SiteLead];
  const results = leads.map((lead) => {
    try { return { ok: true, ...syncSiteLead(lead, { backfill: Boolean((body as { backfill?: boolean }).backfill) }) }; }
    catch (e) { return { ok: false, leadId: String(lead?.id || ""), error: e instanceof Error ? e.message : "Ошибка" }; }
  });
  const failed = results.filter((r) => !r.ok).length;
  return NextResponse.json({ ok: failed === 0, processed: results.length, failed, results }, { status: failed && failed === results.length ? 500 : 200 });
}
