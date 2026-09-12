import { NextRequest, NextResponse } from "next/server";
import { getAssistantState, runAssistantAudit, saveChannelSpend } from "@/lib/assistant";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const state = getAssistantState();
    if (!state.latestRun) return NextResponse.json(await runAssistantAudit({ notify: false }));
    return NextResponse.json(state);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Не удалось загрузить помощника" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    let body: Record<string, unknown> = {};
    try { body = (await request.json()) as Record<string, unknown>; } catch {}
    const action = String(body.action || "run");
    if (action === "spend") {
      saveChannelSpend({
        channel: String(body.channel || ""),
        month: String(body.month || ""),
        amount: Number(body.amount || 0),
        notes: body.notes ? String(body.notes) : null,
      });
      return NextResponse.json(await runAssistantAudit({ notify: false }));
    }
    return NextResponse.json(await runAssistantAudit({ notify: body.notify === true }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Не удалось выполнить проверку" }, { status: 400 });
  }
}
