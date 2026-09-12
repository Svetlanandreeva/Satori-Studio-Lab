import { NextRequest, NextResponse } from "next/server";
import { getAssistantState, runAssistantAudit, saveChannelSpend } from "@/lib/assistant";
import { enrichContactsFromDialogs } from "@/lib/contact-intelligence";
import { getDailyManagementBrief } from "@/lib/assistant-daily";

export const dynamic = "force-dynamic";

function withManagementData<T extends Record<string, unknown>>(state: T, dialogueEnrichment?: Record<string, unknown>) {
  return {
    ...state,
    dailyBrief: getDailyManagementBrief(),
    dialogueEnrichment: dialogueEnrichment || null,
  };
}

async function runFullAudit(notify: boolean) {
  const dialogueEnrichment = enrichContactsFromDialogs();
  const state = await runAssistantAudit({ notify });
  return withManagementData(state as Record<string, unknown>, dialogueEnrichment);
}

export async function GET() {
  try {
    const state = getAssistantState() as Record<string, unknown>;
    if (!state.latestRun) return NextResponse.json(await runFullAudit(false));
    return NextResponse.json(withManagementData(state));
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
      return NextResponse.json(await runFullAudit(false));
    }
    return NextResponse.json(await runFullAudit(body.notify === true));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Не удалось выполнить проверку" }, { status: 400 });
  }
}
