import { NextRequest, NextResponse } from "next/server";
import { getEmailThread } from "@/lib/email-integration";
import { listClientDocuments } from "@/lib/client-documents";
import {
  cleanEmailDisplayBody,
  cleanupLegacyAutoEmailContacts,
  getContactPipelineContext,
  setEmailThreadService,
} from "@/lib/email-crm-policy";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  cleanupLegacyAutoEmailContacts();
  const { id } = await params;
  const result = getEmailThread(id);
  if (!result) return NextResponse.json({ error: "Диалог не найден" }, { status: 404 });
  const messages = result.messages.map((message) => ({
    ...message,
    bodyText: cleanEmailDisplayBody(message.bodyText),
    sourceMessageId: message.messageId || null,
  }));
  const deal = getContactPipelineContext(result.contact?.id || result.thread.contactId);
  const contactId=result.contact?.id || result.thread.contactId;
  const documents=contactId ? listClientDocuments(contactId).filter((d)=>d.sourceChannel==="email") : [];
  return NextResponse.json({ ...result, messages, deal, documents });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }
  if (typeof body.isService !== "boolean") {
    return NextResponse.json({ error: "Передайте isService" }, { status: 400 });
  }
  const thread = setEmailThreadService(id, body.isService);
  if (!thread) return NextResponse.json({ error: "Диалог не найден" }, { status: 404 });
  return NextResponse.json(thread);
}
