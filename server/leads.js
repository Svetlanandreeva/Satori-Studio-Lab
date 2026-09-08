import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LEADS_FILE = path.join(__dirname, "data", "leads.json");
const CRM_FILE = path.join(__dirname, "..", "crm", "data", "crm.json");

let writeQueue = Promise.resolve();

async function readLeads() {
  if (!existsSync(LEADS_FILE)) return [];
  const raw = await readFile(LEADS_FILE, "utf-8");
  return raw.trim() ? JSON.parse(raw) : [];
}

async function readCrmStages() {
  try {
    if (!existsSync(CRM_FILE)) return {};
    const raw = await readFile(CRM_FILE, "utf-8");
    const data = raw.trim() ? JSON.parse(raw) : {};
    return data.leadStages && typeof data.leadStages === "object" ? data.leadStages : {};
  } catch {
    return {};
  }
}

function crmNumber(id) {
  return `S-${String(id || "").replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

async function enrichLeads(leads) {
  const stages = await readCrmStages();
  return leads.map((lead) => ({
    ...lead,
    crmNumber: lead.crmNumber || crmNumber(lead.id),
    crmStatus: stages[lead.id] || lead.crmStatus || "Новый запрос",
    crmId: `lead:${lead.id}`,
  }));
}

function withWriteLock(fn) {
  writeQueue = writeQueue.then(fn, fn);
  return writeQueue;
}

export async function listLeads() {
  return enrichLeads(await readLeads());
}

export async function createLead(data) {
  return withWriteLock(async () => {
    const leads = await readLeads();
    const id = randomUUID();
    const lead = { ...data, id, crmNumber: crmNumber(id), createdAt: new Date().toISOString(), read: false };
    leads.push(lead);
    await writeFile(LEADS_FILE, JSON.stringify(leads, null, 2), "utf-8");
    return lead;
  });
}

export async function updateLead(id, patch) {
  return withWriteLock(async () => {
    const leads = await readLeads();
    const idx = leads.findIndex((lead) => lead.id === id);
    if (idx === -1) return null;
    leads[idx] = { ...leads[idx], ...patch, crmNumber: leads[idx].crmNumber || crmNumber(id) };
    await writeFile(LEADS_FILE, JSON.stringify(leads, null, 2), "utf-8");
    return leads[idx];
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
