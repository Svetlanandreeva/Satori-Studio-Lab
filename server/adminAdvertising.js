import express from "express";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { requireAdmin } from "./auth.js";
import { COUNTER_ID } from "./metrika.js";

const reportURL = "https://api-metrika.yandex.net/stat/v1/data";
const clientsURL = "https://api-metrika.yandex.net/management/v1/clients";
const periods = new Map([["today", "today"], ["7", "6daysAgo"], ["30", "29daysAgo"]]);
const cacheMs = 5 * 60_000;
const unavailable = (status) => ({ status, value: null });

async function metrikaRequest(base, token, query) {
  const url = new URL(base);
  url.search = new URLSearchParams(query);
  try {
    const response = await fetch(url, {
      headers: { Authorization: `OAuth ${token}` },
      signal: AbortSignal.timeout(6000),
      redirect: "error",
    });
    if (response.status === 401 || response.status === 403) return { status: "access" };
    if (!response.ok) return { status: "unavailable" };
    return { status: "ok", data: await response.json() };
  } catch {
    return { status: "unavailable" };
  }
}

async function report(token, start, parameters) {
  const result = await metrikaRequest(reportURL, token, {
    ids: String(COUNTER_ID),
    date1: start,
    date2: "today",
    accuracy: "full",
    limit: "1",
    ...parameters,
  });
  if (result.status !== "ok") return unavailable(result.status);
  const value = result.data?.totals?.[0];
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return unavailable("unavailable");
  return { status: "ok", value: Math.round(value), sampled: Boolean(result.data.sampled) };
}

async function directReport(token, start) {
  const result = await metrikaRequest(clientsURL, token, { counters: String(COUNTER_ID) });
  if (result.status !== "ok") return unavailable(result.status);
  if (!Array.isArray(result.data?.clients)) return unavailable("unavailable");
  const logins = [...new Set(result.data.clients.map((client) => client?.chief_login).filter((login) => typeof login === "string" && login))];
  if (!logins.length) return unavailable("access");
  return report(token, start, {
    preset: "sources_direct_clicks",
    metrics: "ym:ad:clicks",
    dimensions: "ym:ad:automaticDirectOrder",
    include_undefined: "false",
    direct_client_logins: logins.join(","),
  });
}

export function createAdminAdvertisingRouter(dataDir) {
  const router = express.Router();
  const tokenFile = path.join(dataDir, "metrika-report-token");
  const cache = new Map();
  let connectionVersion = 0;

  async function readToken() {
    try {
      const token = (await readFile(tokenFile, "utf8")).trim();
      if (token) return token;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    return process.env.YANDEX_METRIKA_REPORT_TOKEN?.trim() || process.env.YANDEX_METRIKA_TOKEN?.trim();
  }

  router.use(requireAdmin, (_req, res, next) => {
    res.set("Cache-Control", "private, no-store");
    next();
  });

  router.get("/", async (req, res) => {
    const period = req.query.period ?? "7";
    const start = periods.get(period);
    if (!start) return res.status(400).json({ error: "Выберите период отчёта." });

    try {
      const version = connectionVersion;
      const token = await readToken();
      if (!token) return res.json({ views: unavailable("setup"), clicks: unavailable("setup") });

      let entry = cache.get(period);
      if (!entry || entry.version !== version || entry.expiresAt <= Date.now()) {
        const result = Promise.all([
          report(token, start, { metrics: "ym:s:pageviews" }),
          directReport(token, start),
        ]).then(([views, clicks]) => {
          if (views.status === "unavailable" || clicks.status === "unavailable") {
            if (cache.get(period) === entry) entry.expiresAt = Date.now() + 10_000;
          }
          return { views, clicks };
        });
        entry = { result, version, expiresAt: Date.now() + cacheMs };
        if (version === connectionVersion) cache.set(period, entry);
      }
      res.json(await entry.result);
    } catch {
      res.status(500).json({ error: "Не удалось загрузить статистику рекламы." });
    }
  });

  router.put("/connection", async (req, res) => {
    const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
    if (!/^[\w.~+-]{20,512}$/.test(token)) {
      return res.status(400).json({ error: "Проверьте OAuth-токен Яндекс Метрики." });
    }
    const verification = await report(token, "today", { metrics: "ym:s:pageviews" });
    if (verification.status === "access") {
      return res.status(400).json({ error: "У токена нет доступа на чтение к счётчику Satori." });
    }
    if (verification.status !== "ok") {
      return res.status(502).json({ error: "Метрика временно не отвечает. Попробуйте ещё раз." });
    }

    const temporary = `${tokenFile}.${randomUUID()}.tmp`;
    try {
      await mkdir(dataDir, { recursive: true });
      await writeFile(temporary, token, { mode: 0o600, flag: "wx" });
      await rename(temporary, tokenFile);
      connectionVersion++;
      cache.clear();
      res.sendStatus(204);
    } catch {
      res.status(500).json({ error: "Не удалось сохранить подключение." });
    } finally {
      await rm(temporary, { force: true }).catch(() => {});
    }
  });

  return router;
}
