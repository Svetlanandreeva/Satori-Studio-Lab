import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROMO_FILE = path.join(__dirname, "data", "promocodes.json");

let writeQueue = Promise.resolve();

async function readPromoCodes() {
  if (!existsSync(PROMO_FILE)) return [];
  const raw = await readFile(PROMO_FILE, "utf-8");
  return raw.trim() ? JSON.parse(raw) : [];
}

function withWriteLock(fn) {
  writeQueue = writeQueue.then(fn, fn);
  return writeQueue;
}

export async function listPromoCodes() {
  return readPromoCodes();
}

export async function getPromoCode(code) {
  if (!code) return null;
  const codes = await readPromoCodes();
  return codes.find((c) => c.code.toLowerCase() === code.toLowerCase()) || null;
}

export async function createPromoCode({ code, type, value, usageLimit }) {
  return withWriteLock(async () => {
    if (!code || !type || !value) throw new Error("Заполните код, тип и размер скидки");
    const codes = await readPromoCodes();
    if (codes.some((c) => c.code.toLowerCase() === code.toLowerCase())) {
      throw new Error("Такой промокод уже существует");
    }
    const promo = {
      code: code.trim().toUpperCase(),
      type, // "percent" | "fixed"
      value: Number(value),
      usageLimit: usageLimit ? Number(usageLimit) : null,
      usedCount: 0,
      active: true,
      createdAt: new Date().toISOString(),
    };
    codes.push(promo);
    await writeFile(PROMO_FILE, JSON.stringify(codes, null, 2), "utf-8");
    return promo;
  });
}

export async function updatePromoCode(code, patch) {
  return withWriteLock(async () => {
    const codes = await readPromoCodes();
    const idx = codes.findIndex((c) => c.code.toLowerCase() === code.toLowerCase());
    if (idx === -1) return null;
    codes[idx] = { ...codes[idx], ...patch };
    await writeFile(PROMO_FILE, JSON.stringify(codes, null, 2), "utf-8");
    return codes[idx];
  });
}

export async function deletePromoCode(code) {
  return withWriteLock(async () => {
    const codes = await readPromoCodes();
    const next = codes.filter((c) => c.code.toLowerCase() !== code.toLowerCase());
    const changed = next.length !== codes.length;
    if (changed) await writeFile(PROMO_FILE, JSON.stringify(next, null, 2), "utf-8");
    return changed;
  });
}

export function isPromoUsable(promo) {
  if (!promo || !promo.active) return false;
  if (promo.usageLimit && promo.usedCount >= promo.usageLimit) return false;
  return true;
}

export function computeDiscount(promo, amount) {
  const raw = promo.type === "percent" ? amount * (promo.value / 100) : promo.value;
  return Math.max(0, Math.min(Math.round(raw), amount));
}
