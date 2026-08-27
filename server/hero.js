import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HERO_FILE = path.join(__dirname, "data", "hero.json");

export async function getHero() {
  if (!existsSync(HERO_FILE)) return { type: null, url: null };
  const raw = await readFile(HERO_FILE, "utf-8");
  return raw.trim() ? JSON.parse(raw) : { type: null, url: null };
}

export async function setHero(data) {
  const hero = { type: data.type, url: data.url };
  await writeFile(HERO_FILE, JSON.stringify(hero, null, 2), "utf-8");
  return hero;
}
