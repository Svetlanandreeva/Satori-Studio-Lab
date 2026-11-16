import { Router } from "express";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { listLeads } from "./leads.js";

const dataDir = fileURLToPath(new URL("./data/", import.meta.url));
const projectsFile = join(dataDir, "projects.json");
const categories = ["Материалы", "Работа", "Подрядчики", "Упаковка", "Доставка", "Прочее"];
let pendingWrite = Promise.resolve();

async function readProjects() {
  try {
    return JSON.parse(await readFile(projectsFile, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function writeProjects(projects) {
  await mkdir(dataDir, { recursive: true });
  const temporary = join(dataDir, `projects-${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, JSON.stringify(projects, null, 2), { mode: 0o600 });
    await rename(temporary, projectsFile);
  } finally {
    await rm(temporary, { force: true });
  }
}

function withWriteLock(operation) {
  const result = pendingWrite.then(operation);
  pendingWrite = result.catch(() => {});
  return result;
}

function clean(value, limit = 200) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function validate(body) {
  const title = clean(body?.title);
  const units = body?.units;
  if (!title || !Number.isInteger(units) || units < 1 || units > 1_000_000) return null;
  if (!Array.isArray(body.expenses) || body.expenses.length > 200) return null;
  const expenses = body.expenses.map((row) => ({
    title: clean(row?.title),
    category: row?.category,
    kopecks: row?.kopecks,
  }));
  if (expenses.some((row) => !row.title || !categories.includes(row.category) ||
    !Number.isSafeInteger(row.kopecks) || row.kopecks <= 0 || row.kopecks > 100_000_000_000)) return null;
  return { title, units, expenses };
}

async function resolveContact(input, previous) {
  const leadId = clean(input?.leadId);
  if (leadId) {
    if (previous?.leadId === leadId) return previous;
    const lead = (await listLeads()).find((entry) => entry.id === leadId && !entry.isSpam);
    if (!lead) return null;
    return {
      leadId,
      name: clean(lead.name) || clean(lead.company) || lead.crmNumber,
      details: [...new Set([lead.phone, lead.email, lead.contact].map((value) => clean(value)).filter(Boolean))].join(" · "),
    };
  }
  const name = clean(input?.name);
  const details = clean(input?.details, 400);
  return name && details ? { leadId: "", name, details } : null;
}

export const projectsRouter = Router();

projectsRouter.get("/", async (_req, res) => {
  res.set("Cache-Control", "no-store").json(await readProjects());
});

async function saveProject(req, res) {
  const input = validate(req.body);
  if (!input) return res.status(400).json({ error: "Проверьте название, тираж и суммы расходов. В проекте может быть до 200 расходов." });

  return withWriteLock(async () => {
    const projects = await readProjects();
    const existing = req.params.id ? projects.find((project) => project.id === req.params.id) : null;
    if (req.params.id && !existing) return res.status(404).json({ error: "Проект не найден." });
    if (existing && existing.revision !== req.body.revision) {
      return res.status(409).json({ error: "Проект изменён в другой вкладке. Скопируйте нужные правки и откройте проект заново." });
    }

    const contact = await resolveContact(req.body.contact, existing?.contact);
    if (!contact) return res.status(400).json({ error: "Выберите контакт из заявок или укажите имя и способ связи." });
    const saved = {
      ...input,
      contact,
      id: existing?.id ?? randomUUID(),
      revision: (existing?.revision ?? 0) + 1,
    };
    await writeProjects([saved, ...projects.filter((project) => project.id !== saved.id)]);
    return res.status(existing ? 200 : 201).json(saved);
  });
}

projectsRouter.post("/", saveProject);
projectsRouter.put("/:id", saveProject);
