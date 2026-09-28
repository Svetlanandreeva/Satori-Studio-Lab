import { NextRequest, NextResponse } from "next/server";
import { listProductionProjects, setChecklistItem, writeAuditLog } from "@/lib/operations";
import { getRequestActor } from "@/lib/request-actor";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ projects: listProductionProjects() });
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
