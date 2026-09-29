import { NextRequest, NextResponse } from "next/server";
import { getRequestActor } from "@/lib/request-actor";
import { addPayout, deletePayout, managerEarnings, setCommissionRate } from "@/lib/earnings";
import { writeAuditLog } from "@/lib/operations";

export const dynamic = "force-dynamic";

/** Заработано: менеджер видит только себя и только свою долю; владелец — любого, с прибылью и выплатами. */
export async function GET(request: NextRequest) {
  const actor = getRequestActor(request);
  const asked = new URL(request.url).searchParams.get("memberId") || "";
  const memberId = actor.role === "owner" ? asked : actor.id;
  if (!memberId) return NextResponse.json({ error: "Не выбран сотрудник" }, { status: 400 });
  const data = managerEarnings(memberId);
  if (actor.role === "owner") return NextResponse.json({ ...data, full: true });
  return NextResponse.json({ ...data, full: false, deals: data.deals.map(({ directCost: _c, profit: _p, ...d }) => d) });
}

export async function POST(request: NextRequest) {
  const actor = getRequestActor(request);
  if (actor.role !== "owner") return NextResponse.json({ error: "Только владелец" }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as { action?: string; memberId?: string; amount?: number; paidAt?: string; note?: string; rate?: number };
  const memberId = String(body.memberId || "");
  if (!memberId) return NextResponse.json({ error: "Не выбран сотрудник" }, { status: 400 });
  try {
    if (body.action === "rate") { const rate = setCommissionRate(memberId, Number(body.rate)); writeAuditLog(actor, "set_commission_rate", "team_member", memberId, { rate }); }
    else { const id = addPayout(memberId, Number(body.amount), String(body.paidAt || ""), body.note ? String(body.note) : null); writeAuditLog(actor, "add_payout", "team_member", memberId, { id, amount: body.amount }); }
    return NextResponse.json({ ...managerEarnings(memberId), full: true });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Ошибка" }, { status: 400 }); }
}

export async function DELETE(request: NextRequest) {
  const actor = getRequestActor(request);
  if (actor.role !== "owner") return NextResponse.json({ error: "Только владелец" }, { status: 403 });
  const id = new URL(request.url).searchParams.get("id") || "";
  if (!deletePayout(id)) return NextResponse.json({ error: "Выплата не найдена" }, { status: 404 });
  writeAuditLog(actor, "delete_payout", "payout", id);
  return NextResponse.json({ ok: true });
}
