import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LEADS_FILE = path.join(__dirname, "data", "leads.json");

let writeQueue = Promise.resolve();

async function readLeads() {
  if (!existsSync(LEADS_FILE)) return [];
  const raw = await readFile(LEADS_FILE, "utf-8");
  return raw.trim() ? JSON.parse(raw) : [];
}

function withWriteLock(fn) {
  writeQueue = writeQueue.then(fn, fn);
  return writeQueue;
}

export async function listLeads() {
  return readLeads();
}

export async function createLead(data) {
  return withWriteLock(async () => {
    const leads = await readLeads();
    const lead = { ...data, id: randomUUID(), createdAt: new Date().toISOString(), read: false };
    leads.push(lead);
    await writeFile(LEADS_FILE, JSON.stringify(leads, null, 2), "utf-8");
    return lead;
  });
}

export async function markAllLeadsRead() {
  return withWriteLock(async () => {
    const leads = await readLeads();
    const next = leads.map((l) => (l.read ? l : { ...l, read: true }));
    await writeFile(LEADS_FILE, JSON.stringify(next, null, 2), "utf-8");
    return next;
  });
}

export async function deleteLead(id) {
  return withWriteLock(async () => {
    const leads = await readLeads();
    const next = leads.filter((l) => l.id !== id);
    await writeFile(LEADS_FILE, JSON.stringify(next, null, 2), "utf-8");
    return next.length !== leads.length;
  });
}
