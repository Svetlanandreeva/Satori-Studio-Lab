import express from "express";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { requireAdmin } from "./auth.js";
import { COUNTER_ID } from "./metrika.js";

const reportURL = "https://api-metrika.yandex.net/stat/v1/data";
const clientsURL = "https://api-metrika.yandex.net/management/v1/clients";
const directURL = "https://api.direct.yandex.ru/live/v4/json/";
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

function report(token, start, parameters) {
  return metrikaRequest(reportURL, token, {
    ids: String(COUNTER_ID),
    date1: start,
    date2: "today",
    accuracy: "full",
    limit: "1",
    ...parameters,
  });
}

function metric(result, index, isCount = true) {
  if (result.status !== "ok") return unavailable(result.status);
  const value = result.data?.totals?.[index];
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return unavailable("unavailable");
  return { status: "ok", value: isCount ? Math.round(value) : value, sampled: Boolean(result.data.sampled) };
}

async function directReport(token, start) {
  const result = await metrikaRequest(clientsURL, token, { counters: String(COUNTER_ID) });
  if (result.status !== "ok") return result;
  if (!Array.isArray(result.data?.clients)) return { status: "unavailable" };
  const logins = [...new Set(result.data.clients.map((client) => client?.chief_login).filter((login) => typeof login === "string" && login))];
  if (!logins.length) return { status: "access" };
  return report(token, start, {
    preset: "sources_direct_clicks",
    metrics: "ym:ad:clicks,ym:ad:RUBConvertedAdCost",
    dimensions: "ym:ad:automaticDirectOrder",
    include_undefined: "false",
    direct_client_logins: logins.join(","),
  });
}

async function directBalance(token) {
  try {
    const response = await fetch(directURL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        method: "AccountManagement",
        token,
        locale: "ru",
        param: { Action: "Get", SelectionCriteria: {} },
      }),
      signal: AbortSignal.timeout(6000),
      redirect: "error",
    });
    const payload = await response.json().catch(() => null);
    const code = Number(payload?.error_code);
    if (code === 58) return unavailable("approval");
    if ([53, 54, 513, 3000, 3001].includes(code) || [401, 403].includes(response.status)) return unavailable("access");
    if (!response.ok || payload?.error_code) return unavailable("unavailable");
    const accounts = payload?.data?.Accounts;
    if (!Array.isArray(accounts)) return unavailable("unavailable");
    if (accounts.length !== 1) return unavailable("account");
    const { Amount, Currency } = accounts[0] ?? {};
    const value = typeof Amount === "string" && Amount.trim() ? Number(Amount) : Amount;
    if (typeof value !== "number" || !Number.isFinite(value) || !/^[A-Z]{3}$/.test(Currency ?? "")) {
      return unavailable("unavailable");
    }
    return { status: "ok", value, currency: Currency, checkedAt: new Date().toISOString() };
  } catch {
    return unavailable("unavailable");
  }
}

export function createAdminAdvertisingRouter(dataDir) {
  const router = express.Router();
  const tokenFile = path.join(dataDir, "metrika-report-token");
  const directTokenFile = path.join(dataDir, "direct-balance-token");
  const cache = new Map();
  let connectionVersion = 0;
  let balanceCache;

  async function readToken(file, fallback) {
    try {
      const token = (await readFile(file, "utf8")).trim();
      if (token) return token;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    return fallback?.trim();
  }

  async function saveToken(file, token) {
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      await mkdir(dataDir, { recursive: true });
      await writeFile(temporary, token, { mode: 0o600, flag: "wx" });
      await rename(temporary, file);
    } finally {
      await rm(temporary, { force: true }).catch(() => {});
    }
  }

  function tokenFrom(req) {
    const value = typeof req.body?.token === "string" ? req.body.token.trim() : "";
    return /^[\w.~+-]{20,512}$/.test(value) ? value : "";
  }

  router.use(requireAdmin, (_req, res, next) => {
    res.set("Cache-Control", "private, no-store");
    next();
  });

  router.get("/connections", async (_req, res) => {
    try {
      const metrika = await readToken(tokenFile, process.env.YANDEX_METRIKA_REPORT_TOKEN || process.env.YANDEX_METRIKA_TOKEN);
      const direct = await readToken(directTokenFile, process.env.YANDEX_DIRECT_BALANCE_TOKEN);
      res.json({ metrika: Boolean(metrika), direct: Boolean(direct) });
    } catch {
      res.status(500).json({ error: "Не удалось проверить настройки подключений." });
    }
  });

  router.get("/", async (req, res) => {
    const period = req.query.period ?? "7";
    const start = periods.get(period);
    if (!start) return res.status(400).json({ error: "Выберите период отчёта." });

    try {
      const version = connectionVersion;
      const token = await readToken(tokenFile, process.env.YANDEX_METRIKA_REPORT_TOKEN || process.env.YANDEX_METRIKA_TOKEN);
      if (!token) return res.json({ views: unavailable("setup"), clicks: unavailable("setup"), spend: unavailable("setup") });

      let entry = cache.get(period);
      if (!entry || entry.version !== version || entry.expiresAt <= Date.now()) {
        const result = Promise.all([
          report(token, start, { metrics: "ym:s:pageviews" }),
          directReport(token, start),
        ]).then(([traffic, ads]) => {
          const views = metric(traffic, 0);
          const clicks = metric(ads, 0);
          const spend = metric(ads, 1, false);
          if ([views, clicks, spend].some((item) => item.status === "unavailable")) {
            if (cache.get(period) === entry) entry.expiresAt = Date.now() + 10_000;
          }
          return { views, clicks, spend };
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
    const token = tokenFrom(req);
    if (!token) {
      return res.status(400).json({ error: "Проверьте OAuth-токен Яндекс Метрики." });
    }
    const verification = metric(await report(token, "today", { metrics: "ym:s:pageviews" }), 0);
    if (verification.status === "access") {
      return res.status(400).json({ error: "У токена нет доступа на чтение к счётчику Satori." });
    }
    if (verification.status !== "ok") {
      return res.status(502).json({ error: "Метрика временно не отвечает. Попробуйте ещё раз." });
    }

    try {
      await saveToken(tokenFile, token);
      connectionVersion++;
      cache.clear();
      res.sendStatus(204);
    } catch {
      res.status(500).json({ error: "Не удалось сохранить подключение." });
    }
  });

  router.get("/balance", async (_req, res) => {
    if (!balanceCache || balanceCache.expiresAt <= Date.now()) {
      const entry = { expiresAt: Date.now() + cacheMs };
      entry.result = readToken(directTokenFile, process.env.YANDEX_DIRECT_BALANCE_TOKEN)
        .then((token) => token ? directBalance(token) : unavailable("setup"))
        .catch(() => unavailable("unavailable"))
        .then((balance) => {
          if (balance.status === "unavailable") entry.expiresAt = Date.now() + 10_000;
          return balance;
        });
      balanceCache = entry;
    }
    res.json(await balanceCache.result);
  });

  router.put("/direct-connection", async (req, res) => {
    const token = tokenFrom(req);
    if (!token) return res.status(400).json({ error: "Проверьте OAuth-токен Яндекс Директа." });
    const balance = await directBalance(token);
    if (balance.status !== "ok") {
      const messages = {
        approval: "Яндекс ещё не одобрил доступ приложения к API Директа.",
        access: "Проверьте право direct:api и доступ к рекламному аккаунту.",
        account: "Нужен токен рекламного аккаунта с одним общим счётом.",
        unavailable: "Не удалось получить баланс от Директа. Попробуйте ещё раз.",
      };
      return res.status(balance.status === "unavailable" ? 502 : 400).json({ error: messages[balance.status] });
    }
    try {
      await saveToken(directTokenFile, token);
      balanceCache = { result: Promise.resolve(balance), expiresAt: Date.now() + cacheMs };
      res.sendStatus(204);
    } catch {
      res.status(500).json({ error: "Не удалось сохранить подключение Директа." });
    }
  });

  return router;
}
