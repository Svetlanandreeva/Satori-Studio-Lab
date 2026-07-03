import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PRODUCTS_FILE = path.join(__dirname, "data", "products.json");

let writeQueue = Promise.resolve();

async function readProducts() {
  if (!existsSync(PRODUCTS_FILE)) return [];
  const raw = await readFile(PRODUCTS_FILE, "utf-8");
  return raw.trim() ? JSON.parse(raw) : [];
}

function withWriteLock(fn) {
  writeQueue = writeQueue.then(fn, fn);
  return writeQueue;
}

export async function listProducts() {
  return readProducts();
}

export async function getProduct(id) {
  const products = await readProducts();
  return products.find((p) => p.id === id) || null;
}

export async function createProduct(data) {
  return withWriteLock(async () => {
    const products = await readProducts();
    const nextId = products.reduce((max, p) => Math.max(max, p.id), 0) + 1;
    const product = { ...data, id: nextId };
    products.push(product);
    await writeFile(PRODUCTS_FILE, JSON.stringify(products, null, 2), "utf-8");
    return product;
  });
}

export async function updateProduct(id, patch) {
  return withWriteLock(async () => {
    const products = await readProducts();
    const idx = products.findIndex((p) => p.id === id);
    if (idx === -1) return null;
    products[idx] = { ...products[idx], ...patch, id };
    await writeFile(PRODUCTS_FILE, JSON.stringify(products, null, 2), "utf-8");
    return products[idx];
  });
}

export async function deleteProduct(id) {
  return withWriteLock(async () => {
    const products = await readProducts();
    const idx = products.findIndex((p) => p.id === id);
    if (idx === -1) return false;
    products.splice(idx, 1);
    await writeFile(PRODUCTS_FILE, JSON.stringify(products, null, 2), "utf-8");
    return true;
  });
}
