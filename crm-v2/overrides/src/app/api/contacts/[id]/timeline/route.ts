import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  activities,
  contacts,
  deals,
  emailMessages,
  emailThreads,
  pipelineStages,
} from "@/db/schema";
import { cleanEmailDisplayBody } from "@/lib/email-crm-policy";
import { emailConversationThreadIds } from "@/lib/email-conversation";
import { getTelegramThread } from "@/lib/telegram-inbox";

export const dynamic = "force-dynamic";

const TELEGRAM_TYPES = new Set([
  "telegram_incoming",
  "telegram_outgoing",
  "telegram_business_incoming",
  "telegram_business_outgoing",
]);

function iso(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value || ""));
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const contact = db.select().from(contacts).where(eq(contacts.id, id)).get();
  if (!contact) return NextResponse.json({ error: "Клиент не найден" }, { status: 404 });

  const allThreads = db.select().from(emailThreads).all();
  const seedThreads = allThreads.filter((thread) => thread.contactId === id);
  const threadIds = new Set<string>();
  for (const seed of seedThreads) {
    for (const relatedId of emailConversationThreadIds(seed.id)) threadIds.add(relatedId);
  }
  for (const seed of seedThreads) threadIds.add(seed.id);

  const relatedThreads = allThreads.filter((thread) => threadIds.has(thread.id));
  const threadById = new Map(relatedThreads.map((thread) => [thread.id, thread]));
  const relatedContactIds = new Set<string>([id]);
  for (const thread of relatedThreads) if (thread.contactId) relatedContactIds.add(thread.contactId);

  const relatedContacts = db
    .select()
    .from(contacts)
    .all()
    .filter((item) => relatedContactIds.has(item.id))
    .map((item) => ({
      id: item.id,
      name: item.name,
      email: item.email,
      phone: item.phone,
      company: item.company,
    }));

  const emailHistory = db
    .select()
    .from(emailMessages)
    .all()
    .filter((message) => threadIds.has(message.threadId))
    .map((message) => {
      const thread = threadById.get(message.threadId);
      return {
        id: `email:${message.id}`,
        channel: "email" as const,
        direction: message.direction === "outgoing" ? "outgoing" as const : "incoming" as const,
        timestamp: iso(message.receivedAt),
        body: cleanEmailDisplayBody(message.bodyText),
        sender: message.direction === "outgoing"
          ? "Вы"
          : (message.fromName || message.fromEmail || thread?.remoteName || thread?.remoteEmail || "Email"),
        address: message.direction === "outgoing" ? message.toEmail : message.fromEmail,
        subject: message.subject || thread?.subject || "Без темы",
        threadId: message.threadId,
      };
    });

  const telegram = getTelegramThread(id);
  const telegramHistory = (telegram?.messages || []).map((message) => ({
    id: `telegram:${message.id}`,
    channel: "telegram" as const,
    direction: message.direction,
    timestamp: message.receivedAt,
    body: message.bodyText,
    sender: message.direction === "outgoing" ? "Вы" : contact.name,
    address: telegram?.thread?.remoteHandle || contact.phone || "Telegram",
    subject: "Telegram",
    threadId: id,
  }));

  const genericActivities = db
    .select()
    .from(activities)
    .where(eq(activities.contactId, id))
    .all()
    .filter((activity) => !TELEGRAM_TYPES.has(activity.type))
    .map((activity) => ({
      id: `activity:${activity.id}`,
      channel: "activity" as const,
      direction: "internal" as const,
      timestamp: iso(activity.createdAt),
      body: activity.description,
      sender: "CRM",
      address: activity.type,
      subject: activity.type,
      threadId: null,
      activityType: activity.type,
      completedAt: activity.completedAt ? iso(activity.completedAt) : null,
      scheduledAt: activity.scheduledAt ? iso(activity.scheduledAt) : null,
      dealId: activity.dealId || null,
    }));

  const stageMap = new Map(db.select().from(pipelineStages).all().map((stage) => [stage.id, stage]));
  const contactDeals = db
    .select()
    .from(deals)
    .where(eq(deals.contactId, id))
    .all()
    .map((deal) => {
      const stage = stageMap.get(deal.stageId);
      return {
        id: deal.id,
        title: deal.title,
        value: deal.value,
        stageId: deal.stageId,
        stageName: stage?.name || "",
        stageIsWon: Boolean(stage?.isWon),
        stageIsLost: Boolean(stage?.isLost),
        expectedClose: deal.expectedClose ? iso(deal.expectedClose) : null,
        probability: deal.probability,
        createdAt: iso(deal.createdAt),
        updatedAt: iso(deal.updatedAt),
      };
    });

  const history = [...emailHistory, ...telegramHistory, ...genericActivities]
    .filter((item) => item.body || item.channel === "activity")
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  return NextResponse.json({
    contact: {
      id: contact.id,
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
      company: contact.company,
      source: contact.source,
      qualification: contact.qualification,
      notes: contact.notes,
      createdAt: iso(contact.createdAt),
      updatedAt: iso(contact.updatedAt),
    },
    participants: relatedContacts,
    emailThreads: relatedThreads.map((thread) => ({
      id: thread.id,
      subject: thread.subject,
      remoteEmail: thread.remoteEmail,
      remoteName: thread.remoteName,
      contactId: thread.contactId,
      unreadCount: thread.unreadCount,
      lastMessageAt: iso(thread.lastMessageAt),
    })),
    telegram: telegram?.thread || null,
    deals: contactDeals,
    history,
  });
}
