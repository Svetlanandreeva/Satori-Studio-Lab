import { NextRequest, NextResponse } from "next/server";
import { metrikaSettings, saveManualAdSpend, saveMetrikaSettings } from "@/lib/metrika";

export const dynamic = "force-dynamic";

export async function GET() { return NextResponse.json(metrikaSettings()); }

export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as { token?: string; counterId?: string; month?: string; spend?: number | string };
  try {
    if (body.month && body.spend !== undefined) saveManualAdSpend(String(body.month), Number(String(body.spend).replace(/\s/g, "").replace(",", ".")) || 0);
    const s = (body.token !== undefined || body.counterId) ? saveMetrikaSettings({ token: body.token, counterId: body.counterId }) : metrikaSettings();
    return NextResponse.json(s);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Не удалось сохранить" }, { status: 400 });
  }
}
