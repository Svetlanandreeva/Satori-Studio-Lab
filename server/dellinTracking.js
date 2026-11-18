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
    if ([401, 403].includes(response.status) || [401, 403].includes(code)) return { status: "access" };
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
    const key = typeof req.body?.key === "string" ? req.body.key.trim() : "";
    const waybill = typeof req.body?.waybill === "string" ? normalizeWaybill(req.body.waybill) : "";
    if (!appKeyPattern.test(key)) return res.status(400).json({ error: "Проверьте формат API-ключа." });
    if (!validWaybill(waybill)) return res.status(400).json({ error: "Введите номер накладной для проверки подключения." });

    const result = await trackingStatus(key, waybill);
    if (result.status === "access") return res.status(400).json({ error: "Перевозчик отклонил API-ключ. Проверьте его и права доступа." });
    if (result.status === "unavailable") return res.status(502).json({ error: "Не удалось проверить ключ у перевозчика. Попробуйте ещё раз." });

    const temporary = `${keyFile}.${randomUUID()}.tmp`;
    try {
      await mkdir(dataDir, { recursive: true });
      await writeFile(temporary, key, { mode: 0o600, flag: "wx" });
      await rename(temporary, keyFile);
      res.json(result);
    } catch {
      res.status(500).json({ error: "Не удалось сохранить подключение." });
    } finally {
      await rm(temporary, { force: true }).catch(() => {});
    }
  });

  return router;
}
