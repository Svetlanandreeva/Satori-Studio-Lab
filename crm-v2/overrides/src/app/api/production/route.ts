import { NextRequest, NextResponse } from "next/server";
import { listProductionProjects, setChecklistItem, writeAuditLog } from "@/lib/operations";
import { getRequestActor } from "@/lib/request-actor";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    // В «Производстве» — только сделки на этапе «В производстве».
    const inProduction = (name: unknown) => String(name || "").trim().toLowerCase().replace(/ё/g, "е") === "в производстве";
    const projects = listProductionProjects().filter((project: Record<string, unknown>) => inProduction(project.stageName));
    // Менеджеру — без затрат, прибыли и денег по проектам (календарь и чек-листы остаются).
    const actor = getRequestActor(request);
    if (actor.role !== "owner") return NextResponse.json({ restricted: true, projects: projects.map((p: Record<string, unknown>) => ({ ...p, directCost: null, profit: null, receivedAmount: null, value: p.ownerId && p.ownerId === actor.id ? p.value : null })) });
    return NextResponse.json({ projects });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Не удалось загрузить производство" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const dealId = String(body.dealId || "").trim();
    const key = String(body.key || "").trim();
    if (!dealId || !key) return NextResponse.json({ error: "Не указан проект или шаг" }, { status: 400 });
    const checklist = setChecklistItem({ dealId, key, done: Boolean(body.done) });
    writeAuditLog(getRequestActor(request), "update_production_checklist", "deal", dealId, { key, done: Boolean(body.done) });
    return NextResponse.json({ checklist });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Не удалось обновить производство" }, { status: 400 });
  }
}
