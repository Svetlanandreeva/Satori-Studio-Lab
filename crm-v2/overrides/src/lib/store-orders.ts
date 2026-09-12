import { db } from "@/db";
import { activities, contacts, deals, pipelineStages } from "@/db/schema";
import { eq } from "drizzle-orm";
import { SPAM_STAGE_NAME } from "@/lib/lead-qualification";
import { markDealReachedCalculation } from "@/lib/deal-flow";
import { seedStoreOrderPaymentDate } from "@/lib/projects";

export interface StoreOrder {
  id: string;
  items?: Array<{ id?: number; name?: string; price?: number; qty?: number }>;
  customer?: { name?: string; phone?: string; email?: string; company?: string };
  amount?: number;
  subtotal?: number;
  discount?: number;
  promoCode?: string | null;
  status?: string;
  fulfillmentStatus?: string;
  trackingCode?: string | null;
  createdAt?: string;
  paidAt?: string;
}

const STORE_STAGE_NAME = "Отправлен клиенту";

function phoneIdentity(value: unknown): string | null {
  if (!value) return null;
  let digits = String(value).replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("8")) digits = `7${digits.slice(1)}`;
  if (digits.length === 10) digits = `7${digits}`;
  return digits.length >= 10 ? digits : null;
}

function emailIdentity(value: unknown): string | null {
  const email = String(value || "").trim().toLowerCase();
  return email || null;
}

function appendUniqueNote(notes: string | null | undefined, line: string): string {
  const current = String(notes || "").trim();
  if (!line || current.includes(line)) return current;
  return [current, line].filter(Boolean).join("\n");
}

export function storeOrderIdFromDealNotes(notes: unknown): string | null {
  const text = String(notes || "");
  const patterns = [/\[store-order:([^\]]+)\]/i, /\[legacy-deal:(?:web|order):([^\]]+)\]/i, /^Source ID:\s*([^\s]+)\s*$/im];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

export function ensureStorePipelineStage(): void {
  const existing = db.select().from(pipelineStages).all().find((stage) => stage.name === STORE_STAGE_NAME);
  if (existing) return;
  const stages = db.select().from(pipelineStages).all();
  for (const stage of stages) {
    if (stage.name !== SPAM_STAGE_NAME && stage.order >= 7) {
      db.update(pipelineStages).set({ order: stage.order + 1 }).where(eq(pipelineStages.id, stage.id)).run();
    }
  }
  db.insert(pipelineStages).values({
    id: crypto.randomUUID(), name: STORE_STAGE_NAME, order: 7, color: "#0284c7", isWon: false, isLost: false,
  }).run();
}

function stageForOrder(order: StoreOrder): string | null {
  const payment = String(order.status || "").toLowerCase();
  const fulfillment = String(order.fulfillmentStatus || "Новый");
  if (payment === "canceled") return null;
  if (fulfillment === "Отменён") return "Отказ";
  if (payment !== "paid") return null;
  if (fulfillment === "Выполнен") return "Завершено";
  if (fulfillment === "Отправлен" || fulfillment === "Отправлен клиенту") return STORE_STAGE_NAME;
  if (fulfillment === "Собран") return "Готово";
  if (fulfillment === "В работе") return "В производстве";
  return "Согласовано";
}

function probabilityForStage(name: string): number {
  const values: Record<string, number> = {
    "Новый запрос": 10, "Расчёт": 30, "Согласовано": 60, "В производстве": 75,
    "Готово": 90, "Доставка": 94, [STORE_STAGE_NAME]: 97, "Завершено": 100, "Отказ": 0,
  };
  return values[name] ?? 10;
}

function stageByName(name: string) {
  return db.select().from(pipelineStages).all().find((stage) => stage.name === name);
}

function findContact(order: StoreOrder, existingDeal?: typeof deals.$inferSelect | null) {
  if (existingDeal) {
    const byDeal = db.select().from(contacts).where(eq(contacts.id, existingDeal.contactId)).get();
    if (byDeal) return byDeal;
  }
  const phone = phoneIdentity(order.customer?.phone);
  const email = emailIdentity(order.customer?.email);
  return db.select().from(contacts).all().find((contact) => {
    const samePhone = phone && phoneIdentity(contact.phone) === phone;
    const sameEmail = email && emailIdentity(contact.email) === email;
    return Boolean(samePhone || sameEmail);
  }) || null;
}

function titleForOrder(order: StoreOrder): string {
  const names = (order.items || []).map((item) => String(item?.name || "").trim()).filter(Boolean);
  if (names.length === 1) return names[0];
  if (names.length > 1) return names.join(", ");
  return "Заказ с сайта";
}

function notesForOrder(existing: string | null | undefined, order: StoreOrder): string {
  let notes = appendUniqueNote(existing, `[store-order:${order.id}]`);
  notes = appendUniqueNote(notes, `Статус оплаты сайта: ${order.status || "unknown"}`);
  if (order.paidAt) notes = appendUniqueNote(notes, `Оплачено на сайте: ${order.paidAt}`);
  if (order.promoCode) notes = appendUniqueNote(notes, `Промокод: ${order.promoCode}`);
  if (order.discount) notes = appendUniqueNote(notes, `Скидка: ${order.discount} ₽`);
  if (order.trackingCode) notes = appendUniqueNote(notes, `Трек-номер: ${order.trackingCode}`);
  return notes;
}

function recordFailedPaymentAttempt(order: StoreOrder, contactId: string) {
  const marker = `[store-payment-failed:${order.id}]`;
  const exists = db.select().from(activities).all().some((activity) =>
    activity.contactId === contactId && String(activity.description || "").includes(marker)
  );
  if (exists) return;
  const amount = Math.max(0, Number(order.amount || 0));
  db.insert(activities).values({
    id: crypto.randomUUID(),
    type: "note",
    description: `${marker} Неудачная попытка оплаты на сайте${amount ? ` · ${amount.toLocaleString("ru-RU")} ₽` : ""}`,
    contactId,
    dealId: null,
    scheduledAt: null,
    completedAt: new Date(),
    createdAt: new Date(),
  }).run();
}

function removeFailedStoreDeal(order: StoreOrder, existingDeal: typeof deals.$inferSelect) {
  const contact = findContact(order, existingDeal);
  if (contact) recordFailedPaymentAttempt(order, contact.id);
  db.update(activities).set({ dealId: null }).where(eq(activities.dealId, existingDeal.id)).run();
  db.delete(deals).where(eq(deals.id, existingDeal.id)).run();
  return { orderId: String(order.id), contactId: contact?.id || existingDeal.contactId, dealId: existingDeal.id, removed: true, reason: "failed-payment" };
}

export function syncStoreOrder(order: StoreOrder) {
  ensureStorePipelineStage();
  const orderId = String(order?.id || "").trim();
  if (!orderId) throw new Error("У заказа нет id");

  const allDeals = db.select().from(deals).all();
  const existingDeal = allDeals.find((deal) => storeOrderIdFromDealNotes(deal.notes) === orderId) || null;
  const paymentStatus = String(order.status || "").toLowerCase();

  // Неудачная попытка оплаты — это событие клиента, а не сделка.
  if (paymentStatus === "canceled") {
    if (existingDeal) return removeFailedStoreDeal(order, existingDeal);
    return { orderId, skipped: true, reason: "failed-payment-no-deal" };
  }

  if (!existingDeal && paymentStatus !== "paid") return { orderId, skipped: true, reason: "not-paid" };

  let contact = findContact(order, existingDeal);
  if (!contact && paymentStatus === "paid") {
    const now = new Date();
    contact = db.insert(contacts).values({
      id: crypto.randomUUID(),
      name: String(order.customer?.name || "Покупатель сайта").trim() || "Покупатель сайта",
      email: order.customer?.email ? String(order.customer.email).trim() : null,
      phone: order.customer?.phone ? String(order.customer.phone).trim() : null,
      company: order.customer?.company ? String(order.customer.company).trim() : null,
      source: "website", temperature: "hot", qualification: "qualified", score: 100,
      notes: `[store-customer-order:${orderId}]`, createdAt: now, updatedAt: now,
    }).returning().get();
  }
  if (!contact) return { orderId, skipped: true, reason: "contact-not-found" };

  const isPaid = paymentStatus === "paid";
  if (isPaid) {
    db.update(contacts).set({ temperature: "hot", qualification: "qualified", score: 100, updatedAt: new Date() })
      .where(eq(contacts.id, contact.id)).run();
  }

  const targetStageName = stageForOrder(order);
  if (!targetStageName) return { orderId, contactId: contact.id, skipped: true, reason: "payment-pending" };
  const targetStage = stageByName(targetStageName);
  if (!targetStage) throw new Error(`Нет этапа CRM «${targetStageName}»`);

  const value = Math.max(0, Math.round(Number(order.amount || 0) * 100));
  const now = new Date();

  if (!existingDeal) {
    const created = db.insert(deals).values({
      id: crypto.randomUUID(), title: titleForOrder(order), value, stageId: targetStage.id, contactId: contact.id,
      expectedClose: null,
      probability: targetStage.isLost ? 0 : (isPaid ? 100 : probabilityForStage(targetStageName)),
      notes: notesForOrder(null, order),
      createdAt: order.paidAt ? new Date(order.paidAt) : (order.createdAt ? new Date(order.createdAt) : now),
      updatedAt: now,
    }).returning().get();
    if (!targetStage.isLost) markDealReachedCalculation(created.id, targetStage.id);
    if (isPaid) seedStoreOrderPaymentDate(created.id, order.paidAt || order.createdAt || now.toISOString());
    return { orderId, contactId: contact.id, dealId: created.id, created: true, stage: targetStageName };
  }

  const currentStage = db.select().from(pipelineStages).where(eq(pipelineStages.id, existingDeal.stageId)).get();
  let nextStage = currentStage || targetStage;
  if (targetStageName === "Отказ") nextStage = targetStage;
  else if (!currentStage || currentStage.isLost || targetStage.isWon || targetStage.order > currentStage.order) nextStage = targetStage;

  db.update(deals).set({
    title: existingDeal.title || titleForOrder(order), value, stageId: nextStage.id,
    probability: nextStage.isLost ? 0 : (isPaid ? 100 : probabilityForStage(nextStage.name)),
    notes: notesForOrder(existingDeal.notes, order), updatedAt: now,
  }).where(eq(deals.id, existingDeal.id)).run();

  if (!nextStage.isLost) markDealReachedCalculation(existingDeal.id, nextStage.id);
  if (isPaid) seedStoreOrderPaymentDate(existingDeal.id, order.paidAt || order.createdAt || now.toISOString());

  return { orderId, contactId: contact.id, dealId: existingDeal.id, created: false, stage: nextStage.name };
}

const CRM_TO_STOREFRONT_STATUS: Record<string, string> = {
  "В производстве": "В работе", "Готово": "Собран", [STORE_STAGE_NAME]: "Отправлен клиенту", "Завершено": "Выполнен",
};

let cachedAdminToken = "";
let cachedAdminTokenUntil = 0;

async function getStoreAdminToken(): Promise<string> {
  if (cachedAdminToken && cachedAdminTokenUntil > Date.now()) return cachedAdminToken;
  const password = process.env.ADMIN_PASSWORD;
  if (!password) throw new Error("ADMIN_PASSWORD не передан в CRM v2");
  const base = process.env.STORE_BACKEND_URL || "http://127.0.0.1:3001";
  const response = await fetch(`${base}/api/admin/login`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password }), cache: "no-store",
  });
  if (!response.ok) throw new Error(`Вход в backend сайта: HTTP ${response.status}`);
  const payload = (await response.json()) as { token?: string };
  if (!payload.token) throw new Error("Backend сайта не вернул admin token");
  cachedAdminToken = payload.token;
  cachedAdminTokenUntil = Date.now() + 10 * 60 * 1000;
  return cachedAdminToken;
}

export async function pushDealStageToStorefront(dealId: string, stageName: string) {
  const fulfillmentStatus = CRM_TO_STOREFRONT_STATUS[stageName];
  if (!fulfillmentStatus) return { synced: false, reason: "stage-does-not-sync" };
  const deal = db.select().from(deals).where(eq(deals.id, dealId)).get();
  if (!deal) return { synced: false, reason: "deal-not-found" };
  const orderId = storeOrderIdFromDealNotes(deal.notes);
  if (!orderId) return { synced: false, reason: "not-a-store-order" };
  const token = await getStoreAdminToken();
  const base = process.env.STORE_BACKEND_URL || "http://127.0.0.1:3001";
  const response = await fetch(`${base}/api/admin/orders/${encodeURIComponent(orderId)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ fulfillmentStatus }), cache: "no-store",
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Не удалось обновить статус заказа на сайте: HTTP ${response.status} ${detail.slice(0, 160)}`);
  }
  return { synced: true, orderId, fulfillmentStatus };
}
