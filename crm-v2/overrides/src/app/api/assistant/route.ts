import { NextRequest, NextResponse } from "next/server";
import { saveChannelSpend } from "@/lib/assistant";
import { enrichContactsFromDialogs } from "@/lib/contact-intelligence";
import { getDailyManagementBrief } from "@/lib/assistant-daily";
import { getSanitizedAssistantState, runAssistantSafely } from "@/lib/assistant-runtime";
import { chatWithCrmManager } from "@/lib/assistant-chat";
import { prepareDocumentDelivery, confirmDocumentDelivery, preparePaymentConfirmation, confirmPayment } from "@/lib/assistant-actions";

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
  const state = await runAssistantSafely({ notify });
  return withManagementData(state as Record<string, unknown>, dialogueEnrichment);
}

export async function GET() {
  try {
    const state = getSanitizedAssistantState() as Record<string, unknown>;
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
    if (action === "prepare_document_send") return NextResponse.json(prepareDocumentDelivery(String(body.contactId||""),String(body.documentId||"")));
    if (action === "confirm_document_send") return NextResponse.json(await confirmDocumentDelivery({contactId:String(body.contactId||""),documentId:String(body.documentId||""),channel:body.channel==="email"?"email":"telegram",threadId:body.threadId?String(body.threadId):undefined,caption:body.caption?String(body.caption):undefined}));
    if (action === "prepare_payment") return NextResponse.json(preparePaymentConfirmation(String(body.dealId||""),Number(body.amount||0),String(body.evidence||"")));
    if (action === "confirm_payment") return NextResponse.json(confirmPayment(String(body.dealId||""),Number(body.amount||0),String(body.evidence||"")));
    if (action === "chat") {
      const message=String(body.message||"").trim();
      if(!message) return NextResponse.json({error:"Напишите задачу для AI-менеджера"},{status:400});
      return NextResponse.json(await chatWithCrmManager(message));
    }
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
