import { NextRequest, NextResponse } from "next/server";
import { sqlite } from "@/db";
import { generateProposal, proposalText, saveProposalDocx, type Proposal } from "@/lib/ai-proposal";
import { getRequestActor } from "@/lib/request-actor";
import { writeAuditLog } from "@/lib/operations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** POST {action:"generate", contactId, dealId?, instructions?} → черновик КП; {action:"save", contactId, dealId?, proposal} → .docx в файлы клиента. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as { action?: string; contactId?: string; dealId?: string | null; instructions?: string; proposal?: Proposal };
  const contactId = String(body.contactId || "");
  if (!contactId) return NextResponse.json({ error: "Не указан клиент" }, { status: 400 });
  try {
    if (body.action === "save") {
      if (!body.proposal?.title) return NextResponse.json({ error: "Нет текста КП" }, { status: 400 });
      const dealTitle = body.dealId ? (sqlite.prepare("SELECT title FROM deals WHERE id=?").get(body.dealId) as { title?: string } | undefined)?.title : null;
      const document = saveProposalDocx(contactId, body.proposal, dealTitle);
      writeAuditLog(getRequestActor(request), "proposal_saved", "contact", contactId, { dealId: body.dealId || null, documentId: document?.id });
      return NextResponse.json({ document, text: proposalText(body.proposal) });
    }
    const proposal = await generateProposal({ contactId, dealId: body.dealId || null, instructions: body.instructions });
    return NextResponse.json({ proposal, text: proposalText(proposal) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Не удалось составить КП" }, { status: 422 });
  }
}
