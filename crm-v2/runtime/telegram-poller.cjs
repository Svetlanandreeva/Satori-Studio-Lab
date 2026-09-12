"use strict";

const https = require("node:https");
const { randomBytes } = require("node:crypto");
const Database = require("better-sqlite3");

const DB_PATH = process.env.CRM_DB_PATH || "/var/lib/satori-auto-crm/crm.db";
const CRM_ORIGIN = (process.env.CRM_INTERNAL_ORIGIN || "http://127.0.0.1:3020").replace(/\/$/, "");
const TELEGRAM_API_HOST = "api.telegram.org";
const TELEGRAM_API_FALLBACK_IP = process.env.TELEGRAM_API_IP || "149.154.167.220";
const POLL_TIMEOUT_SECONDS = 25;
const REQUEST_TIMEOUT_MS = 36_000;
const RETRY_DELAY_MS = 2_000;
const ALLOWED_UPDATES = [
  "message",
  "edited_message",
  "business_connection",
  "business_message",
  "edited_business_message",
  "deleted_business_messages",
];

const SETTINGS = {
  token: "satori_telegram_bot_token",
  secret: "satori_telegram_webhook_secret",
  transport: "satori_telegram_transport",
  offset: "satori_telegram_poll_offset",
  heartbeat: "satori_telegram_poll_heartbeat_at",
  error: "satori_telegram_poll_last_error",
  startedAt: "satori_telegram_poll_started_at",
  webhookEnabled: "satori_telegram_webhook_enabled",
  webhookUrl: "satori_telegram_webhook_url",
  webhookError: "satori_telegram_webhook_last_error",
};

let stopped = false;
let db = null;
let activeToken = "";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nowIso() {
  return new Date().toISOString();
}

function openDb() {
  if (db) return db;
  db = new Database(DB_PATH);
  db.pragma("busy_timeout = 5000");
  return db;
}

function getSetting(key) {
  try {
    const row = openDb().prepare("SELECT value FROM crm_settings WHERE key = ? LIMIT 1").get(key);
    return row && typeof row.value === "string" ? row.value : "";
  } catch (error) {
    if (String(error && error.message || error).includes("no such table")) return "";
    throw error;
  }
}

function setSetting(key, value) {
  openDb().prepare(
    "INSERT INTO crm_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(key, String(value));
}

function ensureSecret() {
  const existing = getSetting(SETTINGS.secret);
  if (existing && existing.length >= 24) return existing;
  const secret = randomBytes(24).toString("hex");
  setSetting(SETTINGS.secret, secret);
  return secret;
}

function telegramRequestOnce(token, method, payload, forcedIp) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload || {});
    const request = https.request(
      {
        protocol: "https:",
        hostname: forcedIp || TELEGRAM_API_HOST,
        servername: TELEGRAM_API_HOST,
        port: 443,
        path: `/bot${token}/${method}`,
        method: "POST",
        headers: {
          Host: TELEGRAM_API_HOST,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          "User-Agent": "SatoriCRM-TelegramPoller/1.0",
        },
        timeout: REQUEST_TIMEOUT_MS,
      },
      (response) => {
        let raw = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => { raw += chunk; });
        response.on("end", () => {
          try {
            resolve(JSON.parse(raw || "{}"));
          } catch {
            reject(new Error(`Telegram ${method}: некорректный ответ HTTP ${response.statusCode || 0}`));
          }
        });
      }
    );
    request.on("timeout", () => request.destroy(new Error(`Telegram ${method}: timeout`)));
    request.on("error", reject);
    request.end(body);
  });
}

async function telegramRequest(token, method, payload) {
  try {
    return await telegramRequestOnce(token, method, payload);
  } catch (firstError) {
    if (!TELEGRAM_API_FALLBACK_IP) throw firstError;
    try {
      return await telegramRequestOnce(token, method, payload, TELEGRAM_API_FALLBACK_IP);
    } catch (secondError) {
      throw new Error(
        `${firstError instanceof Error ? firstError.message : String(firstError)}; fallback: ${secondError instanceof Error ? secondError.message : String(secondError)}`
      );
    }
  }
}

async function switchToPolling(token) {
  const response = await telegramRequest(token, "deleteWebhook", { drop_pending_updates: false });
  if (!response || response.ok !== true) {
    throw new Error(response && response.description ? response.description : "Telegram не отключил webhook");
  }
  setSetting(SETTINGS.transport, "polling");
  setSetting(SETTINGS.webhookEnabled, "0");
  setSetting(SETTINGS.webhookUrl, "");
  setSetting(SETTINGS.webhookError, "");
  setSetting(SETTINGS.error, "");
  setSetting(SETTINGS.startedAt, nowIso());
  activeToken = token;
  console.log("Telegram transport: long polling enabled");
}

async function deliverUpdate(update) {
  const secret = ensureSecret();
  const response = await fetch(`${CRM_ORIGIN}/api/integrations/need-number?telegram=1`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Telegram-Bot-Api-Secret-Token": secret,
    },
    body: JSON.stringify(update),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`CRM Telegram handler HTTP ${response.status}: ${text.slice(0, 240)}`);
  }
}

async function runOnce() {
  const token = getSetting(SETTINGS.token);
  if (!token) {
    activeToken = "";
    setSetting(SETTINGS.transport, "polling");
    setSetting(SETTINGS.error, "Telegram-бот не настроен");
    setSetting(SETTINGS.heartbeat, nowIso());
    await sleep(5_000);
    return;
  }

  if (token !== activeToken) {
    await switchToPolling(token);
  }

  setSetting(SETTINGS.heartbeat, nowIso());
  const savedOffset = Number(getSetting(SETTINGS.offset) || "0");
  const payload = {
    timeout: POLL_TIMEOUT_SECONDS,
    limit: 50,
    allowed_updates: ALLOWED_UPDATES,
  };
  if (Number.isSafeInteger(savedOffset) && savedOffset > 0) payload.offset = savedOffset;

  const response = await telegramRequest(token, "getUpdates", payload);
  if (!response || response.ok !== true) {
    const description = response && response.description ? response.description : "Telegram getUpdates вернул ошибку";
    // Another route or an old process may have restored a webhook. Heal it here
    // instead of leaving inbound messages broken.
    if (/webhook/i.test(description) || Number(response && response.error_code) === 409) {
      activeToken = "";
      await switchToPolling(token);
      return;
    }
    throw new Error(description);
  }

  const updates = Array.isArray(response.result) ? response.result : [];
  for (const update of updates) {
    if (stopped) break;
    if (!update || !Number.isSafeInteger(update.update_id)) continue;
    await deliverUpdate(update);
    setSetting(SETTINGS.offset, String(update.update_id + 1));
    setSetting(SETTINGS.error, "");
    setSetting(SETTINGS.heartbeat, nowIso());
  }
  setSetting(SETTINGS.heartbeat, nowIso());
}

async function main() {
  console.log(`SATORI Telegram poller starting; db=${DB_PATH}`);
  while (!stopped) {
    try {
      await runOnce();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Telegram poller: ${message}`);
      try {
        setSetting(SETTINGS.error, message.slice(0, 1000));
        setSetting(SETTINGS.heartbeat, nowIso());
      } catch (dbError) {
        console.error(`Telegram poller DB: ${dbError instanceof Error ? dbError.message : String(dbError)}`);
      }
      await sleep(RETRY_DELAY_MS);
    }
  }
  try { if (db) db.close(); } catch (_) {}
}

process.on("SIGTERM", () => { stopped = true; });
process.on("SIGINT", () => { stopped = true; });

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
