import express from "express";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { requireAdmin } from "./auth.js";

const endpoint = "https://api.dellin.ru/v3/orders/statuses_history.json";
const appKeyPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const numberPattern = /^[\p{L}\d]+(?:-[\p{L}\d]+)*$/u;

export function normalizeWaybill(value) {
  return value.trim().replace(/\s+/g, "").replace(/[–—‑]/g, "-");
}

export function validWaybill(value) {
  return value.length <= 64 && /\d/.test(value) && numberPattern.test(value);
}

function accessError(payload, httpStatus) {
  const codes = Array.isArray(payload?.errors) ? payload.errors.map((error) => Number(error?.code)) : [];
  const code = codes.find((value) => [100004, 101001, 101002, 101003, 101004, 101005, 101006, 101007].includes(value));
  if ([101001, 101002, 101007].includes(code)) return {
    status: "access", code,
    message: code === 101007 ? "API-ключ заблокирован Деловыми Линиями. Обратитесь в поддержку перевозчика."
      : "Деловые Линии сообщили, что API-ключ недействителен. Скопируйте ключ приложения целиком из письма.",
  };
  if (code === 100004) return { status: "forbidden", code,
    message: "Для этого ключа не открыт доступ к истории статусов. Обратитесь в api_support@dellin.ru и попросите доступ к методу /v3/orders/statuses_history.json (код 100004)." };
  if ([101003, 101004, 101005, 101006].includes(code)) return { status: "authorization", code,
    message: "API перевозчика запросил дополнительную авторизацию. Это не означает, что ключ приложения неверный. Уточните доступ к истории статусов в api_support@dellin.ru." };
  const status = Number(payload?.metadata?.status ?? httpStatus);
  if ([401, 403].includes(httpStatus) || [401, 403].includes(status)) return {
    status: payload ? "authorization" : "blocked",
    message: payload ? "API перевозчика отказал в доступе без уточнения причины. Обратитесь в api_support@dellin.ru."
      : "Сервер Деловых Линий ограничил доступ к API и вернул страницу блокировки. Проверка ключа не выполнена. Обратитесь в api_support@dellin.ru для проверки доступа с IP сервера сайта.",
  };
  return null;
}

async function trackingStatus(appkey, waybill) {
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ appkey, docIds: [waybill] }),
      signal: AbortSignal.timeout(7000),
      redirect: "error",
    });
    const payload = await response.json().catch(() => null);
    const code = Number(payload?.metadata?.status ?? response.status);
    const access = accessError(payload, response.status);
    if (access) return access;
    if (Array.isArray(payload?.errors) && payload.errors.some((error) => Number(error?.code) === 130002)) return { status: "not-found" };
    if (!response.ok || code !== 200 || !payload?.data) return { status: "unavailable" };
    const history = payload.data.statusHistory?.[waybill];
    if (!Array.isArray(history)) return { status: "not-found" };

    const events = history.flatMap((item) => [
      { label: item?.stateName, date: item?.stateDate },
      { label: item?.detailedStatusRus, date: item?.detailedStatusDate },
    ]).filter(({ label, date }) => typeof label === "string" && label.trim() && Number.isFinite(Date.parse(date)));

    events.sort((first, second) => Date.parse(second.date) - Date.parse(first.date));
    const latest = events[0];
    return latest ? { status: "ok", label: latest.label, date: latest.date } : { status: "not-found" };
  } catch {
    return { status: "unavailable" };
  }
}

export function createDellinTrackingRouter(dataDir) {
  const router = express.Router();
  const keyFile = path.join(dataDir, "dellin-tracking-key");

  async function getKey() {
    try {
      const key = (await readFile(keyFile, "utf8")).trim();
      if (key) return key;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    return process.env.DELLIN_TRACKING_APP_KEY?.trim();
  }

  router.use(requireAdmin, (_req, res, next) => {
    res.set("Cache-Control", "private, no-store");
    next();
  });

  router.get("/connection", async (_req, res) => {
    try {
      res.json({ configured: Boolean(await getKey()) });
    } catch {
      res.status(500).json({ error: "Не удалось проверить подключение перевозчика." });
    }
  });

  router.get("/", async (req, res) => {
    const waybill = typeof req.query.waybill === "string" ? normalizeWaybill(req.query.waybill) : "";
    if (!validWaybill(waybill)) return res.status(400).json({ status: "invalid" });
    try {
      const key = await getKey();
      res.json(key ? await trackingStatus(key, waybill) : { status: "setup" });
    } catch {
      res.status(500).json({ status: "unavailable" });
    }
  });

  router.put("/connection", async (req, res) => {
    const key = typeof req.body?.key === "string" ? req.body.key.trim().replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/[‐‑‒–—−]/g, "-") : "";
    const waybill = typeof req.body?.waybill === "string" ? normalizeWaybill(req.body.waybill) : "";
    if (!appKeyPattern.test(key)) return res.status(400).json({ error: "Проверьте формат API-ключа." });
    if (waybill && !validWaybill(waybill)) return res.status(400).json({ error: "Проверьте номер накладной." });

    const result = waybill ? await trackingStatus(key, waybill) : { status: "unverified" };
    if (result.status === "access") return res.status(400).json({ error: result.message, code: result.code });
    const verified = ["ok", "not-found"].includes(result.status);
    const notice = result.status === "ok" ? "Подключение сохранено. Статус отправления получен."
      : result.status === "not-found" ? "Ключ принят перевозчиком и сохранён. Отправление по указанному номеру не найдено или номер неоднозначен."
      : result.status === "unverified" ? "Ключ сохранён. Проверим подключение, когда в проекте будет указан номер накладной."
      : `Ключ сохранён, но подключение пока не проверено. ${result.message || "Перевозчик временно не отвечает. Повторите проверку позже."}`;

    const temporary = `${keyFile}.${randomUUID()}.tmp`;
    try {
      await mkdir(dataDir, { recursive: true });
      await writeFile(temporary, key, { mode: 0o600, flag: "wx" });
      await rename(temporary, keyFile);
      res.json({ ...result, configured: true, verified, notice });
    } catch {
      res.status(500).json({ error: "Не удалось сохранить подключение." });
    } finally {
      await rm(temporary, { force: true }).catch(() => {});
    }
  });

  return router;
}
