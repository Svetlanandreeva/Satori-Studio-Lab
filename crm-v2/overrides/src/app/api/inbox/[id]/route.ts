import { NextRequest, NextResponse } from "next/server";
import { getEmailThread } from "@/lib/email-integration";
import { listClientDocuments } from "@/lib/client-documents";
import { emailGroupThreadIds } from "@/lib/email-inbox-groups";
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
  // Собираем все ветки переписки в одну ленту.
  const siblings = emailGroupThreadIds(id).filter((tid) => tid !== id).map((tid) => getEmailThread(tid)).filter(Boolean) as Array<NonNullable<ReturnType<typeof getEmailThread>>>;
  const allMessages = [...result.messages, ...siblings.flatMap((s) => s.messages)].sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime());
  const contactFromGroup = result.contact || siblings.find((s) => s.contact)?.contact || null;
  if (!result.contact && contactFromGroup) result.contact = contactFromGroup;
  const addresses = [...new Set([result.thread.remoteEmail, ...siblings.map((s) => s.thread.remoteEmail)].filter(Boolean))];
  const messages = allMessages.map((message) => ({
    ...message,
    bodyText: cleanEmailDisplayBody(message.bodyText),
    sourceMessageId: message.messageId || null,
  }));
  const deal = getContactPipelineContext(result.contact?.id || result.thread.contactId);
  const contactId=result.contact?.id || result.thread.contactId;
  const documents=contactId ? listClientDocuments(contactId).filter((d)=>d.sourceChannel==="email") : [];
  return NextResponse.json({ ...result, messages, deal, documents, addresses });
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
  for (const tid of emailGroupThreadIds(id)) if (tid !== id) setEmailThreadService(tid, body.isService);
  return NextResponse.json(thread);
}
