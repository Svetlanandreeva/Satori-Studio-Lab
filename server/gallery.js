import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GALLERY_FILE = path.join(__dirname, "data", "gallery.json");

let writeQueue = Promise.resolve();

async function readGallery() {
  if (!existsSync(GALLERY_FILE)) return [];
  const raw = await readFile(GALLERY_FILE, "utf-8");
  return raw.trim() ? JSON.parse(raw) : [];
}

function withWriteLock(fn) {
  writeQueue = writeQueue.then(fn, fn);
  return writeQueue;
}

export async function listGallery() {
  return readGallery();
}

export async function addGalleryPhoto(url) {
  return withWriteLock(async () => {
    const photos = await readGallery();
    const photo = { id: randomUUID(), url };
    photos.unshift(photo);
    await writeFile(GALLERY_FILE, JSON.stringify(photos, null, 2), "utf-8");
    return photo;
  });
}

export async function removeGalleryPhoto(id) {
  return withWriteLock(async () => {
    const photos = await readGallery();
    const next = photos.filter((p) => p.id !== id);
    const changed = next.length !== photos.length;
    if (changed) await writeFile(GALLERY_FILE, JSON.stringify(next, null, 2), "utf-8");
    return changed;
  });
}
