import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getProduct } from "./products.js";
import { getPayment } from "./yookassa.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ORDERS_FILE = path.join(__dirname, "data", "orders.json");
const CRM_FILE = path.join(__dirname, "..", "crm", "data", "crm.json");

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

function fallbackCrmStatus(order) {
  const status = order?.fulfillmentStatus || "Новый";
  if (status === "Выполнен" || status === "Отменён") return "Завершено";
  if (status === "Отправлен") return "Доставка";
  if (status === "Собран") return "Готово";
  if (status === "В работе") return "В производстве";
  return "Новый запрос";
}

async function enrichOrders(orders) {
  const stages = await readCrmStages();
  return orders.map((order) => ({
    ...order,
    crmNumber: order.crmNumber || crmNumber(order.id),
    crmStatus: stages[order.id] || order.crmStatus || fallbackCrmStatus(order),
    crmId: `web:${order.id}`,
  }));
}

function withWriteLock(fn) {
  writeQueue = writeQueue.then(fn, fn);
  return writeQueue;
}

function hasCompleteDeliveryAddress(customer) {
  if (!customer?.delivery || String(customer.delivery).startsWith("Самовывоз")) return true;

  const address = String(customer.address || "").trim();
  const parts = address.split(/[\s,]+/).filter(Boolean);

  // A city alone is not enough for courier/post delivery: require a meaningful
  // street fragment plus a house number.
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
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("Корзина пуста");
  }
  if (items.length > 30) {
    throw new Error("Слишком много позиций в одном заказе");
  }

  const canonical = [];
  for (const item of items) {
    const id = Number(item?.id);
    const qty = Number(item?.qty);
    if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(qty) || qty < 1 || qty > 99) {
      throw new Error("Проверьте количество товаров в корзине");
    }

    const product = await getProduct(id);
    if (!product) {
      throw new Error("Один из товаров больше недоступен. Обновите корзину и попробуйте снова");
    }

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
  if (patch?.status !== "paid" || order?.status === "paid") return;
  if (!order?.paymentId) throw new Error("Нельзя подтвердить оплату без paymentId");

  const payment = await getPayment(order.paymentId);
  const paymentAmount = Number(payment?.amount?.value);
  const amountMatches = Number.isFinite(paymentAmount) && Math.abs(paymentAmount - Number(order.amount)) < 0.01;
  const metadataMatches = String(payment?.metadata?.orderId || "") === String(order.id);
  const currencyMatches = payment?.amount?.currency === "RUB";

  if (payment?.status !== "succeeded" || !amountMatches || !metadataMatches || !currencyMatches) {
    throw new Error("ЮKassa не подтвердила оплату этого заказа");
  }
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
  if (!hasCompleteDeliveryAddress(order?.customer)) {
    throw new Error("Укажите полный адрес доставки: город, улицу и номер дома");
  }
  if (!hasValidPhone(order?.customer)) {
    throw new Error("Проверьте номер телефона");
  }
  if (!hasValidEmail(order?.customer)) {
    throw new Error("Проверьте адрес электронной почты");
  }

  const items = await canonicalizeItems(order?.items);
  const canonicalSubtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
  const submittedSubtotal = Number(order?.subtotal);
  const discount = Number(order?.discount || 0);
  const amount = Number(order?.amount);

  if (!Number.isFinite(submittedSubtotal) || submittedSubtotal !== canonicalSubtotal) {
    throw new Error("Состав корзины изменился. Обновите страницу перед оплатой");
  }
  if (!Number.isFinite(discount) || discount < 0 || discount > canonicalSubtotal) {
    throw new Error("Некорректная скидка в заказе");
  }
  if (!Number.isFinite(amount) || amount !== canonicalSubtotal - discount || amount < 0) {
    throw new Error("Итоговая сумма заказа изменилась. Обновите страницу перед оплатой");
  }

  return withWriteLock(async () => {
    const orders = await readOrders();
    const linkedOrder = {
      ...order,
      items,
      subtotal: canonicalSubtotal,
      amount,
      discount,
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

    await verifyPaidTransition(orders[idx], patch);

    orders[idx] = { ...orders[idx], ...patch, crmNumber: orders[idx].crmNumber || crmNumber(id) };
    await writeFile(ORDERS_FILE, JSON.stringify(orders, null, 2), "utf-8");
    return orders[idx];
  });
}
