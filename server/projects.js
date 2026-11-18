import { json, Router } from "express";
import multer from "multer";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { requireAdmin } from "./auth.js";
import { normalizeWaybill, validWaybill } from "./dellinTracking.js";
import { ensureProjectOrder, getOrder } from "./orders.js";

const maxFileSize = 10 * 1024 * 1024;
const fileTypes = /\.(pdf|docx?|xlsx?|csv|txt|jpe?g|png|webp|heic|dwg|dxf|step|stp)$/i;
const uuid = /^[0-9a-f-]{36}$/;
const projectStatuses = ["", "planned", "in-progress", "on-hold", "done", "canceled"];
const stepStatuses = ["pending", "in-progress", "done"];

class ProjectError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function field(value, max, label, required = false) {
  if (typeof value !== "string" || value.length > max || (required && !value.trim())) {
    throw new ProjectError(400, `Проверьте поле «${label}».`);
  }
  return value.trim();
}

function date(value) {
  if (value === "") return "";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = new Date(value);
    if (Number.isFinite(+parsed) && parsed.toISOString().slice(0, 10) === value) return value;
  }
  throw new ProjectError(400, "Проверьте даты проекта, покупок и оплат.");
}

function amount(value, min = 0) {
  if (!Number.isSafeInteger(value) || value < min || value > 100_000_000_000) {
    throw new ProjectError(400, "Проверьте введённые суммы.");
  }
  return value;
}

function entries(rows, kind) {
  if (!Array.isArray(rows) || rows.length > 200) {
    throw new ProjectError(400, "В одном проекте доступно до 200 покупок и 200 оплат.");
  }
  return rows.map((row) => ({
    label: field(row?.label, 200, kind, kind === "Покупка"),
    date: date(row?.date),
    amount: amount(row?.amount, 1),
  }));
}

function savedContacts(project) {
  return project?.contacts ?? (project?.contact ? [{ name: "", details: project.contact }] : []);
}

function projectContacts(body, existing) {
  if (body.contacts === undefined) {
    const details = field(body.contact, 200, "Контакт");
    const contacts = savedContacts(existing);
    if (details === (existing?.contact ?? "")) return contacts;
    const [first, ...others] = contacts;
    const updated = { name: first?.name ?? "", details };
    return [updated, ...others].filter((item) => item.name || item.details);
  }
  if (!Array.isArray(body.contacts) || body.contacts.length > 30) {
    throw new ProjectError(400, "В одном проекте доступно до 30 контактов.");
  }
  return body.contacts.map((item) => ({
    name: field(item?.name, 200, "Имя контакта"),
    details: field(item?.details, 200, "Телефон, почта или мессенджер"),
  })).filter((item) => item.name || item.details);
}

function workDetails(body, existing) {
  const status = body.status === undefined ? existing?.status ?? "" : body.status;
  if (!projectStatuses.includes(status)) throw new ProjectError(400, "Выберите статус проекта.");

  const steps = body.steps === undefined ? existing?.steps ?? [] : body.steps;
  if (!Array.isArray(steps) || steps.length > 50) {
    throw new ProjectError(400, "В одном проекте доступно до 50 этапов.");
  }
  return {
    status,
    notes: field(body.notes === undefined ? existing?.notes ?? "" : body.notes, 4000, "Комментарий к проекту"),
    steps: steps.map((step) => {
      if (!stepStatuses.includes(step?.status)) throw new ProjectError(400, "Выберите статус этапа.");
      return {
        name: field(step.name, 200, "Название этапа", true),
        status: step.status,
        notes: field(step.notes, 1000, "Комментарий к этапу"),
      };
    }),
  };
}

function projectFields(body, existing) {
  const startDate = date(body?.startDate);
  const dueDate = date(body?.dueDate);
  if (startDate && dueDate && dueDate < startDate) {
    throw new ProjectError(400, "Срок проекта должен быть не раньше даты начала.");
  }
  const contacts = projectContacts(body, existing);
  const waybill = normalizeWaybill(field(body.waybill === undefined ? existing?.waybill ?? "" : body.waybill, 64, "Номер накладной"));
  if (waybill && !validWaybill(waybill)) throw new ProjectError(400, "Проверьте номер накладной.");
  return {
    name: field(body.name, 200, "Название проекта", true),
    contact: contacts[0]?.details || contacts[0]?.name || "",
    contacts,
    ...workDetails(body, existing),
    leadId: field(body.leadId, 100, "Заявка"),
    startDate,
    dueDate,
    shipmentDate: date(body.shipmentDate === undefined ? existing?.shipmentDate ?? "" : body.shipmentDate),
    waybill,
    budget: body.budget === null ? null : amount(body.budget),
    price: body.price === null ? null : amount(body.price),
    expenses: entries(body.expenses, "Покупка"),
    payments: entries(body.payments, "Оплата"),
  };
}

function route(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      if (error instanceof ProjectError) return res.status(error.status).json({ error: error.message });
      next(error);
    }
  };
}

export function createProjectsRouter(dataDir) {
  const router = Router();
  const projectsFile = path.join(dataDir, "projects.json");
  const documentsDir = path.join(dataDir, "project-documents");
  let queue = Promise.resolve();

  async function readProjects() {
    try {
      return JSON.parse(await readFile(projectsFile, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
  }

  async function saveProjects(projects) {
    await mkdir(dataDir, { recursive: true });
    const temporary = `${projectsFile}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify(projects, null, 2), { mode: 0o600 });
      await rename(temporary, projectsFile);
    } finally {
      await rm(temporary, { force: true });
    }
  }

  function change(task) {
    const result = queue.then(async () => task(await readProjects()));
    queue = result.catch(() => {});
    return result;
  }

  function getProject(projects, id) {
    const project = projects.find((item) => item.id === id);
    if (!project) throw new ProjectError(404, "Проект не найден.");
    return project;
  }

  function getDocument(project, id) {
    const document = uuid.test(id) && project.documents.find((item) => item.id === id);
    if (!document) throw new ProjectError(404, "Документ не найден.");
    return document;
  }

  const receiveFile = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxFileSize, files: 1, fields: 0 },
    defParamCharset: "utf8",
  }).single("file");

  router.use(requireAdmin);
  router.use(json({ limit: "512kb" }));
  router.use((_req, res, next) => {
    res.set("Cache-Control", "private, no-store");
    next();
  });

  router.get("/", route(async (_req, res) => {
    const projects = await readProjects();
    for (const project of projects) {
      if (project.generatedOrderId) await ensureProjectOrder(project);
    }
    res.json(projects.map((project) => ({ ...project, contacts: savedContacts(project) })));
  }));

  async function orderLink(body, existing) {
    if (body.orderId === undefined && existing) return {};
    const orderId = field(body.orderId ?? "", 100, "Заказ");
    if (orderId) {
      if (!await getOrder(orderId)) throw new ProjectError(400, "Выбранный заказ не найден.");
      return { orderId };
    }
    const generatedOrderId = existing?.generatedOrderId || randomUUID();
    return { generatedOrderId, orderId: generatedOrderId };
  }

  router.post("/", route(async (req, res) => {
    const fields = projectFields(req.body);
    const requestId = req.body.requestId;
    if (requestId !== undefined && (typeof requestId !== "string" || !uuid.test(requestId))) {
      throw new ProjectError(400, "Некорректный идентификатор создания проекта.");
    }
    const project = await change(async (projects) => {
      const previous = requestId && projects.find((item) => item.requestId === requestId);
      if (previous) {
        if (previous.generatedOrderId) await ensureProjectOrder(previous);
        return previous;
      }
      const item = { ...fields, ...await orderLink(req.body), id: randomUUID(), requestId,
        createdAt: new Date().toISOString(), revision: 1, documents: [] };
      await saveProjects([item, ...projects]);
      if (item.generatedOrderId) await ensureProjectOrder(item);
      return item;
    });
    res.status(201).json(project);
  }));

  router.put("/:id", route(async (req, res) => {
    const project = await change(async (projects) => {
      const item = getProject(projects, req.params.id);
      if (item.revision !== req.body?.revision) {
        throw new ProjectError(409, "Проект изменился в другой вкладке. Обновите страницу перед повторным сохранением.");
      }
      const fields = projectFields(req.body, item);
      const link = await orderLink(req.body, item);
      Object.assign(item, fields, link, { revision: item.revision + 1 });
      await saveProjects(projects);
      if (item.generatedOrderId) await ensureProjectOrder(item);
      return item;
    });
    res.json(project);
  }));

  router.post("/:id/documents", (req, res, next) => {
    receiveFile(req, res, (error) => {
      if (error instanceof multer.MulterError) {
        const tooLarge = error.code === "LIMIT_FILE_SIZE";
        return res.status(tooLarge ? 413 : 400).json({
          error: tooLarge ? "Размер файла не должен превышать 10 МБ." : "Выберите один файл.",
        });
      }
      next(error);
    });
  }, route(async (req, res) => {
    const file = req.file;
    const name = file?.originalname?.trim();
    if (!file?.size || !name || name.length > 200 || /[/\\\u0000-\u001f\u007f]/.test(name) || !fileTypes.test(name)) {
      throw new ProjectError(400, "Выберите документ, таблицу, фото или чертёж поддерживаемого формата.");
    }

    const document = await change(async (projects) => {
      const project = getProject(projects, req.params.id);
      if (project.documents.length >= 50) throw new ProjectError(400, "В одном проекте доступно до 50 документов.");
      const item = { id: randomUUID(), name, size: file.size, createdAt: new Date().toISOString() };
      const filename = path.join(documentsDir, item.id);
      await mkdir(documentsDir, { recursive: true, mode: 0o700 });
      await writeFile(filename, file.buffer, { mode: 0o600, flag: "wx" });
      try {
        project.documents.push(item);
        await saveProjects(projects);
      } catch (error) {
        await rm(filename, { force: true });
        throw error;
      }
      return item;
    });
    res.status(201).json(document);
  }));

  router.get("/:id/documents/:documentId", route(async (req, res, next) => {
    const project = getProject(await readProjects(), req.params.id);
    const document = getDocument(project, req.params.documentId);
    res.set("X-Content-Type-Options", "nosniff");
    res.download(path.join(documentsDir, document.id), document.name, {
      headers: { "Content-Type": "application/octet-stream" },
      cacheControl: false,
    }, (error) => {
      if (error) next(error);
    });
  }));

  router.delete("/:id/documents/:documentId", route(async (req, res) => {
    await change(async (projects) => {
      const project = getProject(projects, req.params.id);
      const document = getDocument(project, req.params.documentId);
      project.documents = project.documents.filter((item) => item.id !== document.id);
      await saveProjects(projects);
      await rm(path.join(documentsDir, document.id), { force: true }).catch((error) => {
        console.error("Could not remove project document", error.code);
      });
    });
    res.sendStatus(204);
  }));

  router.use((error, _req, res, next) => {
    if (res.headersSent) return next(error);
    if (error.code === "ENOENT" || error.status === 404) {
      return res.status(404).json({ error: "Документ не найден." });
    }
    console.error("Project request failed", error);
    res.status(500).json({ error: "Не удалось выполнить операцию с проектом." });
  });

  return router;
}
