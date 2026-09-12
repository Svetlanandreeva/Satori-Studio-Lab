import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { randomUUID } from "node:crypto";
import nodemailer from "nodemailer";
import { sendTelegramMessage, getSetting, getBooleanSetting, INTEGRATION_KEYS } from "@/lib/satori-integrations";
import { replyToEmailThread } from "@/lib/email-integration";

const DB_PATH = process.env.CRM_DB_PATH || path.join(process.cwd(), "data", "crm.db");
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const sqlite = new Database(DB_PATH, { timeout: 15000 });
try { sqlite.pragma("journal_mode = WAL"); } catch {}
try { sqlite.pragma("busy_timeout = 15000"); } catch {}
try { sqlite.pragma("foreign_keys = ON"); } catch {}

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS shipment_state (
    deal_id TEXT PRIMARY KEY REFERENCES deals(id) ON DELETE CASCADE,
    tracking_code TEXT NOT NULL DEFAULT '',
    shipped_at INTEGER,
    delivered_at INTEGER,
    notified_at INTEGER,
    notification_channel TEXT,
    notification_error TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_shipment_tracking ON shipment_state(tracking_code);
`);

function tableExists(name: string): boolean {
  return Boolean(sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
}

function moscowDate(value = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(value);
  const year = parts.find((x) => x.type === "year")?.value || "1970";
  const month = parts.find((x) => x.type === "month")?.value || "01";
  const day = parts.find((x) => x.type === "day")?.value || "01";
  return `${year}-${month}-${day}`;
}

function telegramMeta(notes: unknown): { chatId: string | null; businessConnectionId: string | null } {
  const text = String(notes || "");
  return {
    chatId: text.match(/\[telegram-chat:([^\]]+)\]/i)?.[1]?.trim() || null,
    businessConnectionId: text.match(/\[telegram-business:([^\]]+)\]/i)?.[1]?.trim() || null,
  };
}

function emailConfig() {
  const address = String(getSetting(INTEGRATION_KEYS.emailAddress) || "").trim().toLowerCase();
  const domain = address.split("@")[1] || "";
  const isYandexMailbox = domain === "satori.ru" || domain === "yandex.ru" || domain.startsWith("yandex.");
  const username = String(getSetting(INTEGRATION_KEYS.emailUsername) || address).trim();
  const password = String(getSetting(INTEGRATION_KEYS.emailPassword) || "");
  const host = String(getSetting(INTEGRATION_KEYS.emailSmtpHost) || (isYandexMailbox ? "smtp.yandex.ru" : "")).trim();
  const port = Number(getSetting(INTEGRATION_KEYS.emailSmtpPort) || 465);
  const secure = getBooleanSetting(INTEGRATION_KEYS.emailSmtpSecure, true);
  const fromName = String(getSetting(INTEGRATION_KEYS.emailFromName) || "Satori Studio").trim() || "Satori Studio";
  return { address, username, password, host, port: Number.isFinite(port) ? port : 465, secure, fromName };
}

async function sendStandaloneEmail(to: string, subject: string, text: string): Promise<{ sent: boolean; error?: string }> {
  const config = emailConfig();
  const recipient = String(to || "").trim().toLowerCase();
  if (!recipient) return { sent: false, error: "У клиента не указан email" };
  if (!config.address || !config.username || !config.password || !config.host) {
    return { sent: false, error: "Почта не настроена для исходящей отправки" };
  }
  try {
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.username, pass: config.password },
      connectionTimeout: 12000,
      greetingTimeout: 12000,
      socketTimeout: 20000,
      tls: { rejectUnauthorized: true },
    });
    await transporter.sendMail({
      from: { name: config.fromName, address: config.address },
      to: recipient,
      subject,
      text,
    });
    return { sent: true };
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message : "Ошибка отправки email" };
  }
}

function shipmentMessage(name: string, title: string, trackingCode: string): string {
  const hello = name ? `Здравствуйте, ${name}!` : "Здравствуйте!";
  return [
    hello,
    `Ваш заказ «${title}» отправлен и передан в доставку.`,
    `Трек-номер: ${trackingCode}`,
    "По нему можно отслеживать отправление у перевозчика.",
    "Satori Studio",
  ].join("\n");
}

function recordActivity(input: { contactId: string; dealId: string; description: string; type?: string }) {
  if (!tableExists("activities")) return;
  const now = Math.floor(Date.now() / 1000);
  sqlite.prepare(`
    INSERT INTO activities(id,type,description,contact_id,deal_id,scheduled_at,completed_at,created_at)
    VALUES(?,?,?,?,?,NULL,?,?)
  `).run(
    randomUUID(), input.type || "note", input.description,
    input.contactId, input.dealId, now, now
  );
}

function mirrorProjectShipment(dealId: string, shippedAt: number) {
  if (!tableExists("project_details")) return;
  const date = moscowDate(new Date(shippedAt));
  const now = Date.now();
  sqlite.prepare(`
    INSERT INTO project_details(
      deal_id,ordered_at,contract_deadline,shipped_at,delivered_at,
      production_term_days,payment_terms,notes,created_at,updated_at
    ) VALUES(?,NULL,NULL,?,NULL,NULL,NULL,NULL,?,?)
    ON CONFLICT(deal_id) DO UPDATE SET shipped_at=COALESCE(project_details.shipped_at,excluded.shipped_at), updated_at=excluded.updated_at
  `).run(dealId, date, now, now);
}

function mirrorProjectDelivery(dealId: string, deliveredAt: number) {
  if (!tableExists("project_details")) return;
  const date = moscowDate(new Date(deliveredAt));
  const now = Date.now();
  sqlite.prepare(`
    INSERT INTO project_details(
      deal_id,ordered_at,contract_deadline,shipped_at,delivered_at,
      production_term_days,payment_terms,notes,created_at,updated_at
    ) VALUES(?,NULL,NULL,NULL,?,NULL,NULL,NULL,?,?)
    ON CONFLICT(deal_id) DO UPDATE SET delivered_at=COALESCE(project_details.delivered_at,excluded.delivered_at), updated_at=excluded.updated_at
  `).run(dealId, date, now, now);
}

export function getShipmentState(dealId: string) {
  return sqlite.prepare(`
    SELECT deal_id AS dealId, tracking_code AS trackingCode, shipped_at AS shippedAt,
      delivered_at AS deliveredAt, notified_at AS notifiedAt,
      notification_channel AS notificationChannel, notification_error AS notificationError
    FROM shipment_state WHERE deal_id=?
  `).get(dealId) as {
    dealId: string; trackingCode: string; shippedAt: number | null; deliveredAt: number | null;
    notifiedAt: number | null; notificationChannel: string | null; notificationError: string | null;
  } | undefined;
}

export function saveTrackingCode(dealId: string, value: unknown) {
  const trackingCode = String(value || "").trim();
  if (!trackingCode) throw new Error("Укажите трек-номер / код отправления");
  if (trackingCode.length > 120) throw new Error("Трек-номер слишком длинный");
  const deal = sqlite.prepare("SELECT id,contact_id AS contactId FROM deals WHERE id=?").get(dealId) as { id: string; contactId: string } | undefined;
  if (!deal) throw new Error("Сделка не найдена");
  const now = Date.now();
  const previous = getShipmentState(dealId);
  sqlite.prepare(`
    INSERT INTO shipment_state(deal_id,tracking_code,shipped_at,created_at,updated_at)
    VALUES(?,?,?,?,?)
    ON CONFLICT(deal_id) DO UPDATE SET
      tracking_code=excluded.tracking_code,
      shipped_at=COALESCE(shipment_state.shipped_at,excluded.shipped_at),
      notified_at=CASE WHEN shipment_state.tracking_code<>excluded.tracking_code THEN NULL ELSE shipment_state.notified_at END,
      notification_channel=CASE WHEN shipment_state.tracking_code<>excluded.tracking_code THEN NULL ELSE shipment_state.notification_channel END,
      notification_error=CASE WHEN shipment_state.tracking_code<>excluded.tracking_code THEN NULL ELSE shipment_state.notification_error END,
      updated_at=excluded.updated_at
  `).run(dealId, trackingCode, now, now, now);
  mirrorProjectShipment(dealId, now);
  const changed = previous?.trackingCode !== trackingCode;
  if (changed) {
    recordActivity({
      contactId: deal.contactId,
      dealId,
      type: "note",
      description: `Отправление передано в доставку. Трек-номер: ${trackingCode}`,
    });
  }
  return { trackingCode, changed };
}

export async function notifyShipment(dealId: string, trackingCode: string) {
  const row = sqlite.prepare(`
    SELECT d.id AS dealId,d.title AS title,c.id AS contactId,c.name AS contactName,
      c.email AS email,c.notes AS contactNotes
    FROM deals d JOIN contacts c ON c.id=d.contact_id WHERE d.id=?
  `).get(dealId) as {
    dealId: string; title: string; contactId: string; contactName: string; email: string | null; contactNotes: string | null;
  } | undefined;
  if (!row) throw new Error("Сделка не найдена");

  const state = getShipmentState(dealId);
  if (state?.notifiedAt && state.trackingCode === trackingCode) {
    return { sent: true, channel: state.notificationChannel || "already-sent", alreadySent: true };
  }

  const text = shipmentMessage(row.contactName || "", row.title || "заказ", trackingCode);
  const meta = telegramMeta(row.contactNotes);
  let telegramError = "";
  if (meta.chatId) {
    const tg = await sendTelegramMessage({
      text,
      chatId: meta.chatId,
      businessConnectionId: meta.businessConnectionId,
      parseMode: null,
    });
    if (tg.sent) {
      const now = Date.now();
      sqlite.prepare(`UPDATE shipment_state SET notified_at=?,notification_channel='telegram',notification_error=NULL,updated_at=? WHERE deal_id=?`)
        .run(now, now, dealId);
      recordActivity({ contactId: row.contactId, dealId, type: "telegram_business_outgoing", description: `[shipment:${trackingCode}] ${text}` });
      return { sent: true, channel: "telegram" };
    }
    telegramError = tg.error || "Telegram не отправил сообщение";
  }

  let emailError = "";
  const recipientEmail = String(row.email || "").trim().toLowerCase();
  if (recipientEmail) {
    const thread = tableExists("email_threads")
      ? sqlite.prepare(`SELECT id FROM email_threads WHERE contact_id=? AND lower(remote_email)=lower(?) ORDER BY last_message_at DESC LIMIT 1`)
          .get(row.contactId, recipientEmail) as { id: string } | undefined
      : undefined;
    if (thread?.id) {
      try {
        await replyToEmailThread(thread.id, text);
        const now = Date.now();
        sqlite.prepare(`UPDATE shipment_state SET notified_at=?,notification_channel='email',notification_error=NULL,updated_at=? WHERE deal_id=?`)
          .run(now, now, dealId);
        recordActivity({ contactId: row.contactId, dealId, type: "email_outgoing", description: `[shipment:${trackingCode}] Трек-номер отправлен в почтовый диалог` });
        return { sent: true, channel: "email" };
      } catch (error) {
        emailError = error instanceof Error ? error.message : "Не удалось ответить в почтовый диалог";
      }
    }

    const mail = await sendStandaloneEmail(recipientEmail, `Ваш заказ отправлен · трек ${trackingCode}`, text);
    if (mail.sent) {
      const now = Date.now();
      sqlite.prepare(`UPDATE shipment_state SET notified_at=?,notification_channel='email',notification_error=NULL,updated_at=? WHERE deal_id=?`)
        .run(now, now, dealId);
      recordActivity({ contactId: row.contactId, dealId, type: "email_outgoing", description: `[shipment:${trackingCode}] Трек-номер отправлен на ${recipientEmail}` });
      return { sent: true, channel: "email" };
    }
    emailError = [emailError, mail.error || "Email не отправлен"].filter(Boolean).join("; ");
  }

  const error = [telegramError, emailError, !meta.chatId && !recipientEmail ? "У клиента нет Telegram-диалога и email" : ""]
    .filter(Boolean).join("; ");
  sqlite.prepare(`UPDATE shipment_state SET notification_error=?,updated_at=? WHERE deal_id=?`).run(error || "Не удалось отправить уведомление", Date.now(), dealId);
  return { sent: false, channel: null, needsManual: true, error: error || "Не удалось отправить уведомление" };
}

export async function startShipment(dealId: string, trackingCodeInput: unknown) {
  const { trackingCode } = saveTrackingCode(dealId, trackingCodeInput);
  let notification: Awaited<ReturnType<typeof notifyShipment>>;
  try {
    notification = await notifyShipment(dealId, trackingCode);
  } catch (error) {
    notification = {
      sent: false,
      channel: null,
      needsManual: true,
      error: error instanceof Error ? error.message : "Не удалось отправить уведомление клиенту",
    };
    sqlite.prepare(`UPDATE shipment_state SET notification_error=?,updated_at=? WHERE deal_id=?`)
      .run(notification.error, Date.now(), dealId);
  }
  return { trackingCode, notification };
}

export function markShipmentDelivered(dealId: string) {
  const now = Date.now();
  sqlite.prepare(`
    INSERT INTO shipment_state(deal_id,tracking_code,delivered_at,created_at,updated_at)
    VALUES(?,'',?,?,?)
    ON CONFLICT(deal_id) DO UPDATE SET delivered_at=COALESCE(shipment_state.delivered_at,excluded.delivered_at),updated_at=excluded.updated_at
  `).run(dealId, now, now, now);
  mirrorProjectDelivery(dealId, now);
  return now;
}
