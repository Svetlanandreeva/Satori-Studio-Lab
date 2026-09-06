import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ORDERS_FILE = path.join(__dirname, "data", "orders.json");

let writeQueue = Promise.resolve();

async function readOrders() {
  if (!existsSync(ORDERS_FILE)) return [];
  const raw = await readFile(ORDERS_FILE, "utf-8");
  return raw.trim() ? JSON.parse(raw) : [];
}

function withWriteLock(fn) {
  writeQueue = writeQueue.then(fn, fn);
  return writeQueue;
}

function hasCompleteDeliveryAddress(customer) {
  if (!customer?.delivery || String(customer.delivery).startsWith("Самовывоз")) return true;

  const address = String(customer.address || "").trim();
  const parts = address.split(/[\s,]+/).filter(Boolean);

  // The checkout used to accept any non-empty string, so values such as
  // "Чита" passed validation. For courier/post delivery we need at least a
  // meaningful street/address fragment and a house number.
  return address.length >= 8 && parts.length >= 2 && /\d/.test(address);
}

export async function listOrders() {
  return readOrders();
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

  return withWriteLock(async () => {
    const orders = await readOrders();
    orders.push(order);
    await writeFile(ORDERS_FILE, JSON.stringify(orders, null, 2), "utf-8");
    return order;
  });
}

export async function updateOrder(id, patch) {
  return withWriteLock(async () => {
    const orders = await readOrders();
    const idx = orders.findIndex((o) => o.id === id);
    if (idx === -1) return null;
    orders[idx] = { ...orders[idx], ...patch };
    await writeFile(ORDERS_FILE, JSON.stringify(orders, null, 2), "utf-8");
    return orders[idx];
  });
}
