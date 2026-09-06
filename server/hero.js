import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HERO_FILE = path.join(__dirname, "data", "hero.json");
const MAX_HERO_SLIDES = 8;

function validSlide(slide) {
  return slide && (slide.type === "image" || slide.type === "video") && typeof slide.url === "string" && slide.url;
}

function normalizeHero(data) {
  if (!data || typeof data !== "object") return { type: null, url: null, slides: [] };

  const slides = [];
  if (Array.isArray(data.slides)) {
    for (const slide of data.slides) {
      if (!validSlide(slide) || slides.some((item) => item.url === slide.url)) continue;
      slides.push({ type: slide.type, url: slide.url });
    }
  }

  // Backward compatibility with the old single-media hero.json format.
  if (validSlide(data) && !slides.some((item) => item.url === data.url)) {
    slides.unshift({ type: data.type, url: data.url });
  }

  const trimmed = slides.slice(0, MAX_HERO_SLIDES);
  const current = validSlide(data)
    ? { type: data.type, url: data.url }
    : (trimmed[0] || { type: null, url: null });

  return { type: current.type, url: current.url, slides: trimmed };
}

async function readHero() {
  if (!existsSync(HERO_FILE)) return { type: null, url: null, slides: [] };
  const raw = await readFile(HERO_FILE, "utf-8");
  return raw.trim() ? normalizeHero(JSON.parse(raw)) : { type: null, url: null, slides: [] };
}

export async function getHero() {
  return readHero();
}

export async function setHero(data) {
  // Removing hero media from the admin clears the whole carousel intentionally.
  if (!data?.type) {
    const empty = { type: null, url: null, slides: [] };
    await writeFile(HERO_FILE, JSON.stringify(empty, null, 2), "utf-8");
    return empty;
  }

  const current = await readHero();
  const nextSlide = { type: data.type, url: data.url };
  const slides = [
    nextSlide,
    ...current.slides.filter((slide) => slide.url !== nextSlide.url),
  ].slice(0, MAX_HERO_SLIDES);

  // `type`/`url` stay for compatibility with the existing storefront/admin preview,
  // while `slides` is the actual autoplay carousel source.
  const hero = { type: nextSlide.type, url: nextSlide.url, slides };
  await writeFile(HERO_FILE, JSON.stringify(hero, null, 2), "utf-8");
  return hero;
}
