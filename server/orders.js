import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getProduct } from "./products.js";
import { getPayment } from "./yookassa.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ORDERS_FILE = path.join(__dirname, "data", "orders.json");
const CRM_FILE = path.join(__dirname, "..", "crm", "data", "crm.json");
const CRM_V2_INTERNAL_URL = process.env.CRM_V2_INTERNAL_URL || "http://127.0.0.1:3020";

let writeQueue = Promise.resolve();

async function readOrders() {
  if (!existsSync(ORDERS_FILE)) return [];
  const raw = await readFile(ORDERS_FILE, "utf-8");
  return raw.trim() ? JSON.parse(raw) : [];
}

async function readCrmStages() {
  try {
    if (!existsSync(CRM_FILE)) return {};
    const raw = await readFile(CRM_FILE, "utf-8");
    const data = raw.trim() ? JSON.parse(raw) : {};
    return data.webOrderStages && typeof data.webOrderStages === "object" ? data.webOrderStages : {};
  } catch {
    return {};
  }
}

function crmNumber(id) {
  return `S-${String(id || "").replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

function normalizeFulfillmentStatus(value) {
  return value === "Отправлен" ? "Отправлен клиенту" : (value || "Новый");
}

function fallbackCrmStatus(order) {
  const status = normalizeFulfillmentStatus(order?.fulfillmentStatus);
  if (status === "Выполнен") return "Завершено";
  if (status === "Отменён") return "Отказ";
  if (status === "Отправлен клиенту") return "Отправлен клиенту";
  if (status === "Собран") return "Готово";
  if (status === "В работе") return "В производстве";
  return "Новый запрос";
}

async function enrichOrders(orders) {
  const stages = await readCrmStages();
  return orders.map((order) => ({
    ...order,
    fulfillmentStatus: normalizeFulfillmentStatus(order.fulfillmentStatus),
    crmNumber: order.crmNumber || crmNumber(order.id),
    crmStatus: stages[order.id] || order.crmStatus || fallbackCrmStatus(order),
    crmId: `web:${order.id}`,
  }));
}

async function syncOrderToCrmV2(order) {
  try {
    const response = await fetch(`${CRM_V2_INTERNAL_URL}/api/integrations/store-orders`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(order),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error("CRM v2 order sync failed:", response.status, detail.slice(0, 200));
    }
  } catch (error) {
    console.error("CRM v2 order sync unavailable:", error?.message || error);
  }
}

function withWriteLock(fn) {
  writeQueue = writeQueue.then(fn, fn);
  return writeQueue;
}

function hasCompleteDeliveryAddress(customer) {
  if (!customer?.delivery || String(customer.delivery).startsWith("Самовывоз")) return true;
  const address = String(customer.address || "").trim();
  const parts = address.split(/[\s,]+/).filter(Boolean);
  return address.length >= 8 && parts.length >= 2 && /\d/.test(address);
}

function hasValidPhone(customer) {
  const digits = String(customer?.phone || "").replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}

function hasValidEmail(customer) {
  const email = String(customer?.email || "").trim();
  return !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function canonicalizeItems(items) {
  if (!Array.isArray(items) || items.length === 0) throw new Error("Корзина пуста");
  if (items.length > 30) throw new Error("Слишком много позиций в одном заказе");

  const canonical = [];
  for (const item of items) {
    const id = Number(item?.id);
    const qty = Number(item?.qty);
    if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(qty) || qty < 1 || qty > 99) {
      throw new Error("Проверьте количество товаров в корзине");
    }
    const product = await getProduct(id);
    if (!product) throw new Error("Один из товаров больше недоступен. Обновите корзину и попробуйте снова");
    const currentPrice = Number(product.price);
    const submittedPrice = Number(item?.price);
    if (!Number.isFinite(currentPrice) || currentPrice < 0 || submittedPrice !== currentPrice) {
      throw new Error(`Цена товара «${product.name}» изменилась. Обновите страницу перед оплатой`);
    }
    canonical.push({ id: product.id, name: product.name, price: currentPrice, qty });
  }
  return canonical;
}

async function verifyPaidTransition(order, patch) {
  if (patch?.status !== "paid" || order?.status === "paid") return null;
  if (!order?.paymentId) throw new Error("Нельзя подтвердить оплату без paymentId");

  const payment = await getPayment(order.paymentId);
  const paymentAmount = Number(payment?.amount?.value);
  const amountMatches = Number.isFinite(paymentAmount) && Math.abs(paymentAmount - Number(order.amount)) < 0.01;
  const metadataMatches = String(payment?.metadata?.orderId || "") === String(order.id);
  const currencyMatches = payment?.amount?.currency === "RUB";

  if (payment?.status !== "succeeded" || !amountMatches || !metadataMatches || !currencyMatches) {
    throw new Error("ЮKassa не подтвердила оплату этого заказа");
  }
  return payment;
}

export async function listOrders() {
  return enrichOrders(await readOrders());
}

export async function getOrder(id) {
  const orders = await readOrders();
  return orders.find((o) => o.id === id) || null;
}

export async function findOrderByCode(code) {
  const orders = await readOrders();
  const lower = code.toLowerCase();
  return orders.find((o) => o.id.toLowerCase().startsWith(lower)) || null;
}

export async function createOrder(order) {
  if (!hasCompleteDeliveryAddress(order?.customer)) throw new Error("Укажите полный адрес доставки: город, улицу и номер дома");
  if (!hasValidPhone(order?.customer)) throw new Error("Проверьте номер телефона");
  if (!hasValidEmail(order?.customer)) throw new Error("Проверьте адрес электронной почты");

  const items = await canonicalizeItems(order?.items);
  const canonicalSubtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
  const submittedSubtotal = Number(order?.subtotal);
  const discount = Number(order?.discount || 0);
  const amount = Number(order?.amount);

  if (!Number.isFinite(submittedSubtotal) || submittedSubtotal !== canonicalSubtotal) throw new Error("Состав корзины изменился. Обновите страницу перед оплатой");
  if (!Number.isFinite(discount) || discount < 0 || discount > canonicalSubtotal) throw new Error("Некорректная скидка в заказе");
  if (!Number.isFinite(amount) || amount !== canonicalSubtotal - discount || amount < 0) throw new Error("Итоговая сумма заказа изменилась. Обновите страницу перед оплатой");

  return withWriteLock(async () => {
    const orders = await readOrders();
    const linkedOrder = {
      ...order,
      items,
      subtotal: canonicalSubtotal,
      amount,
      discount,
      fulfillmentStatus: normalizeFulfillmentStatus(order.fulfillmentStatus),
      crmNumber: order.crmNumber || crmNumber(order.id),
    };
    orders.push(linkedOrder);
    await writeFile(ORDERS_FILE, JSON.stringify(orders, null, 2), "utf-8");
    return linkedOrder;
  });
}

export async function updateOrder(id, patch) {
  return withWriteLock(async () => {
    const orders = await readOrders();
    const idx = orders.findIndex((o) => o.id === id);
    if (idx === -1) return null;

    const previousFulfillment = normalizeFulfillmentStatus(orders[idx].fulfillmentStatus);
    const verifiedPayment = await verifyPaidTransition(orders[idx], patch);
    const normalizedPatch = { ...patch };
    if (normalizedPatch.fulfillmentStatus !== undefined) {
      normalizedPatch.fulfillmentStatus = normalizeFulfillmentStatus(normalizedPatch.fulfillmentStatus);
    }
    if (normalizedPatch.status === "paid" && orders[idx].status !== "paid" && !normalizedPatch.paidAt) {
      normalizedPatch.paidAt =
        verifiedPayment?.captured_at || verifiedPayment?.created_at || new Date().toISOString();
    }

    const nextFulfillment = normalizeFulfillmentStatus(
      normalizedPatch.fulfillmentStatus ?? orders[idx].fulfillmentStatus
    );
    const statusChanged = nextFulfillment !== previousFulfillment;
    if (statusChanged && nextFulfillment === "Отправлен клиенту" && !orders[idx].shippedAt && !normalizedPatch.shippedAt) {
      normalizedPatch.shippedAt = new Date().toISOString();
    }
    if (statusChanged && nextFulfillment === "Выполнен") {
      const completedAt = new Date().toISOString();
      if (!orders[idx].shippedAt && !normalizedPatch.shippedAt) normalizedPatch.shippedAt = completedAt;
      if (!orders[idx].deliveredAt && !normalizedPatch.deliveredAt) normalizedPatch.deliveredAt = completedAt;
    }

    orders[idx] = {
      ...orders[idx],
      ...normalizedPatch,
      fulfillmentStatus: nextFulfillment,
      crmNumber: orders[idx].crmNumber || crmNumber(id),
    };
    await writeFile(ORDERS_FILE, JSON.stringify(orders, null, 2), "utf-8");

    const shouldSync = orders[idx].status === "paid" || orders[idx].status === "canceled" || normalizedPatch.fulfillmentStatus !== undefined;
    if (shouldSync) void syncOrderToCrmV2(orders[idx]);
    return orders[idx];
  });
}