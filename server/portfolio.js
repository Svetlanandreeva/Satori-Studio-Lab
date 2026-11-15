import { readFile, writeFile, mkdir, rename, unlink } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BACKEND_DIR = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(BACKEND_DIR, "data", "portfolio-projects.json");
const SEED_FILE = path.join(BACKEND_DIR, "portfolio-seed.json");
let writeQueue = Promise.resolve();

function revision(projects) {
  return createHash("sha256").update(JSON.stringify(projects)).digest("hex");
}
function validImageUrl(value) {
  const url = String(value || "").trim();
  if (url.length > 1000 || !url) return false;
  if (/^\/(?:promo\/img\/works|uploads)\/[a-zA-Z0-9_\-./%]+$/.test(url) && !url.includes("..")) return true;
  if (url.startsWith("https://")) {
    try {
      const parsed = new URL(url);
      return parsed.protocol === "https:" && !parsed.username && !parsed.password;
    } catch { return false; }
  }
  return false;
}

function validateProjects(items) {
  if (!Array.isArray(items) || items.length > 150) throw new Error("Слишком много проектов");
  const used = new Set();
  return items.map((raw, index) => {
    const id = String(raw?.id || "").trim();
    const title = String(raw?.title || "").trim();
    if (!/^[a-z0-9][a-z0-9-]{1,79}$/.test(id) || used.has(id)) {
      throw new Error("Некорректный или повторяющийся ID проекта №" + (index + 1));
    }
    used.add(id);
    if (!title || title.length > 150) throw new Error("Укажите название проекта №" + (index + 1));
    const descriptions = raw.descriptions;
    if (!Array.isArray(descriptions) || descriptions.length > 8) {
      throw new Error("Некорректное описание проекта: " + title);
    }
    const cleanedDescriptions = descriptions.map(text => String(text || "").trim());
    if (cleanedDescriptions.some(text => text.length > 2000)) {
      throw new Error("Слишком длинное описание проекта: " + title);
    }
    if (!Array.isArray(raw.images) || raw.images.length < 1 || raw.images.length > 50) {
      throw new Error("Для проекта нужно от 1 до 50 фотографий: " + title);
    }
    const images = raw.images.map(img => {
      const url = String(img?.url || "").trim();
      const alt = String(img?.alt || title).trim();
      if (!validImageUrl(url) || alt.length > 240) {
        throw new Error("Некорректный URL фотографии проекта: " + title);
      }
      return { url, alt };
    });
    return { id, title, descriptions: cleanedDescriptions.filter(Boolean), images };
  });
}

async function readData() {
  let raw;
  try {
    raw = await readFile(DATA_FILE, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    // Initial catalog data is deployed with promo/, while admin edits live
    // outside it in backend/data/ and are never replaced by promo sync.
    raw = await readFile(SEED_FILE, "utf8");
  }
  return validateProjects(JSON.parse(raw).projects);
}

export async function listPortfolio() {
  const projects = await readData();
  return { projects, version: revision(projects) };
}

export async function savePortfolio(payload) {
  const run = writeQueue.then(async () => {
    const current = await readData();
    if (payload?.version !== revision(current)) {
      const conflict = new Error("Каталог изменился. Обновите страницу перед сохранением.");
      conflict.status = 409;
      throw conflict;
    }
    const projects = validateProjects(payload?.projects);
    await mkdir(path.dirname(DATA_FILE), { recursive: true });
    const temp = DATA_FILE + "." + randomUUID() + ".tmp";
    try {
      await writeFile(temp, JSON.stringify({ projects }, null, 2) + "\n", { mode: 0o600 });
      await rename(temp, DATA_FILE);
    } catch (error) {
      await unlink(temp).catch(() => {});
      throw error;
    }
    return { projects, version: revision(projects) };
  });
  writeQueue = run.catch(() => {});
  return run;
}
