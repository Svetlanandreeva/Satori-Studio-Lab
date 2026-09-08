import { Router } from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { requireAdmin } from "../server/auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const HISTORY_FILE = path.join(DATA_DIR, "parser-history.json");
let writeQueue = Promise.resolve();

async function ensureHistory() {
  await mkdir(DATA_DIR, { recursive: true });
  if (!existsSync(HISTORY_FILE)) await writeFile(HISTORY_FILE, "[]\n", "utf-8");
}

export async function listParserRuns() {
  await ensureHistory();
  const raw = await readFile(HISTORY_FILE, "utf-8");
  const data = raw.trim() ? JSON.parse(raw) : [];
  return Array.isArray(data) ? data : [];
}

function mutateHistory(mutator) {
  const run = async () => {
    const history = await listParserRuns();
    const result = await mutator(history);
    await writeFile(HISTORY_FILE, JSON.stringify(history, null, 2), "utf-8");
    return result;
  };
  writeQueue = writeQueue.then(run, run);
  return writeQueue;
}

const text = (value) => String(value || "").trim();
const number = (value) => Math.max(0, Number(value || 0));

function normalizeContact(contact = {}) {
  return {
    id: text(contact.id) || randomUUID(),
    name: text(contact.name),
    role: text(contact.role),
    company: text(contact.company),
    phone: text(contact.phone),
    email: text(contact.email),
    telegram: text(contact.telegram),
    website: text(contact.website),
    sourceUrl: text(contact.sourceUrl),
    status: text(contact.status) || "new",
    importedToCrm: Boolean(contact.importedToCrm),
  };
}

function stats(history) {
  return history.reduce((acc, run) => {
    acc.runs += 1;
    acc.found += number(run.found);
    acc.newContacts += number(run.newContacts);
    acc.duplicates += number(run.duplicates);
    acc.errors += number(run.errors);
    if (run.status === "running") acc.running += 1;
    return acc;
  }, { runs: 0, found: 0, newContacts: 0, duplicates: 0, errors: 0, running: 0 });
}

export async function patchParserContact(runId, contactId, patch = {}) {
  return mutateHistory((history) => {
    const run = history.find((item) => item.id === runId);
    const contact = run?.contacts?.find((item) => item.id === contactId);
    if (!contact) return null;
    if (patch.status !== undefined) contact.status = text(patch.status);
    if (patch.importedToCrm !== undefined) contact.importedToCrm = Boolean(patch.importedToCrm);
    return contact;
  });
}

export function createParserHistoryRouter() {
  const router = Router();
  router.use(requireAdmin);

  router.get("/", async (req, res) => {
    try {
      const history = await listParserRuns();
      const competitor = text(req.query.competitor).toLowerCase();
      const status = text(req.query.status);
      const filtered = history.filter((run) => {
        if (competitor && !`${run.competitor || ""} ${run.source || ""}`.toLowerCase().includes(competitor)) return false;
        if (status && run.status !== status) return false;
        return true;
      });
      res.json({ runs: filtered, stats: stats(history) });
    } catch (error) {
      console.error("Parser history read failed:", error);
      res.status(500).json({ error: "Не удалось загрузить историю парсинга" });
    }
  });

  router.post("/runs", async (req, res) => {
    const startedAt = new Date().toISOString();
    const run = {
      id: randomUUID(),
      competitor: text(req.body?.competitor) || "Без названия",
      source: text(req.body?.source),
      sourceUrl: text(req.body?.sourceUrl),
      query: text(req.body?.query),
      status: "running",
      startedAt,
      finishedAt: null,
      found: 0,
      newContacts: 0,
      duplicates: 0,
      errors: 0,
      errorMessage: "",
      contacts: [],
      notes: text(req.body?.notes),
    };
    await mutateHistory((history) => { history.unshift(run); return run; });
    res.json(run);
  });

  router.post("/runs/:id/contacts", async (req, res) => {
    const incoming = Array.isArray(req.body?.contacts) ? req.body.contacts.map(normalizeContact) : [];
    const updated = await mutateHistory((history) => {
      const run = history.find((item) => item.id === req.params.id);
      if (!run) return null;
      const known = new Set((run.contacts || []).map((item) => [item.email, item.phone, item.telegram, item.sourceUrl].map((v) => text(v).toLowerCase()).filter(Boolean).join("|")));
      let duplicates = 0;
      for (const contact of incoming) {
        const key = [contact.email, contact.phone, contact.telegram, contact.sourceUrl].map((v) => text(v).toLowerCase()).filter(Boolean).join("|");
        if (key && known.has(key)) { duplicates += 1; continue; }
        if (key) known.add(key);
        run.contacts.push(contact);
      }
      run.found = number(req.body?.found ?? run.contacts.length + duplicates);
      run.newContacts = number(req.body?.newContacts ?? run.contacts.length);
      run.duplicates = number(req.body?.duplicates ?? ((run.duplicates || 0) + duplicates));
      run.errors = number(req.body?.errors ?? run.errors);
      return run;
    });
    if (!updated) return res.status(404).json({ error: "Запуск не найден" });
    res.json(updated);
  });

  router.patch("/runs/:id", async (req, res) => {
    const updated = await mutateHistory((history) => {
      const run = history.find((item) => item.id === req.params.id);
      if (!run) return null;
      if (req.body?.competitor !== undefined) run.competitor = text(req.body.competitor);
      if (req.body?.source !== undefined) run.source = text(req.body.source);
      if (req.body?.sourceUrl !== undefined) run.sourceUrl = text(req.body.sourceUrl);
      if (req.body?.query !== undefined) run.query = text(req.body.query);
      if (req.body?.notes !== undefined) run.notes = text(req.body.notes);
      if (req.body?.errorMessage !== undefined) run.errorMessage = text(req.body.errorMessage);
      for (const key of ["found", "newContacts", "duplicates", "errors"]) if (req.body?.[key] !== undefined) run[key] = number(req.body[key]);
      if (["running", "completed", "failed", "cancelled"].includes(req.body?.status)) {
        run.status = req.body.status;
        if (run.status !== "running" && !run.finishedAt) run.finishedAt = new Date().toISOString();
      }
      return run;
    });
    if (!updated) return res.status(404).json({ error: "Запуск не найден" });
    res.json(updated);
  });

  router.post("/runs/:id/finish", async (req, res) => {
    const updated = await mutateHistory((history) => {
      const run = history.find((item) => item.id === req.params.id);
      if (!run) return null;
      run.status = req.body?.status === "failed" ? "failed" : "completed";
      run.finishedAt = new Date().toISOString();
      for (const key of ["found", "newContacts", "duplicates", "errors"]) if (req.body?.[key] !== undefined) run[key] = number(req.body[key]);
      if (req.body?.errorMessage !== undefined) run.errorMessage = text(req.body.errorMessage);
      if (req.body?.notes !== undefined) run.notes = text(req.body.notes);
      return run;
    });
    if (!updated) return res.status(404).json({ error: "Запуск не найден" });
    res.json(updated);
  });

  router.patch("/runs/:runId/contacts/:contactId", async (req, res) => {
    const updated = await patchParserContact(req.params.runId, req.params.contactId, req.body || {});
    if (!updated) return res.status(404).json({ error: "Контакт не найден" });
    res.json(updated);
  });

  return router;
}
