import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { activities, contacts, deals, pipelineStages } from "@/db/schema";
import {
  INTEGRATION_KEYS,
  ensureNeedNumberSecret,
  escapeTelegramHtml,
  getBooleanSetting,
  getSetting,
  normalizeRussianPhone,
  phoneIdentity,
  safeSecretEqual,
  sendTelegramMessage,
} from "@/lib/satori-integrations";

type FlatPayload = Record<string, string>;

const PHONE_KEYS = [
  "phone",
  "phone_number",
  "telephone",
  "tel",
  "mobile",
  "msisdn",
  "number",
  "client_phone",
  "contact_phone",
  "телефон",
  "номер",
];
const NAME_KEYS = ["name", "full_name", "client_name", "contact_name", "имя", "фио"];
const REGION_KEYS = ["region", "city", "geo", "location", "регион", "город"];
const NICHE_KEYS = ["niche", "category", "theme", "segment", "ниша", "категория"];
const INTEREST_KEYS = ["interest", "query", "request", "intent", "интерес", "запрос"];
const PROJECT_KEYS = ["project", "project_id", "projectid", "projectId", "проект"];
const SOURCE_KEYS = ["source", "site", "url", "competitor", "domain", "источник", "сайт"];

function flattenPayload(
  value: unknown,
  prefix = "",
  out: FlatPayload = {},
  depth = 0
): FlatPayload {
  if (depth > 5 || value === null || value === undefined) return out;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    if (prefix) out[prefix.toLowerCase()] = String(value).trim();
    return out;
  }
  if (Array.isArray(value)) {
    value.slice(0, 20).forEach((item, index) =>
      flattenPayload(item, prefix ? `${prefix}.${index}` : String(index), out, depth + 1)
    );
    return out;
  }
  if (typeof value === "object") {
    Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
      const next = prefix ? `${prefix}.${key}` : key;
      flattenPayload(item, next, out, depth + 1);
    });
  }
  return out;
}

function keyTail(key: string): string {
  return key.split(".").pop()?.toLowerCase() || key.toLowerCase();
}

function pick(flat: FlatPayload, aliases: string[]): string | null {
  const wanted = aliases.map((x) => x.toLowerCase());
  for (const alias of wanted) {
    for (const [key, value] of Object.entries(flat)) {
      if (key.toLowerCase() === alias || keyTail(key) === alias) {
        if (value) return value;
      }
    }
  }
  return null;
}

function findPhone(flat: FlatPayload): string | null {
  const preferred = pick(flat, PHONE_KEYS);
  const normalizedPreferred = normalizeRussianPhone(preferred);
  if (normalizedPreferred) return normalizedPreferred;

  for (const value of Object.values(flat)) {
    const text = String(value);
    if (!/[+()\d][\d\s()+-]{8,}/.test(text)) continue;
    const normalized = normalizeRussianPhone(text);
    if (normalized) return normalized;
  }
  return null;
}

async function parsePayload(request: NextRequest): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return (await request.json()) as Record<string, unknown>;
  }
  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    const form = await request.formData();
    const result: Record<string, unknown> = {};
    for (const [key, value] of form.entries()) {
      if (typeof value === "string") result[key] = value;
    }
    return result;
  }

  const text = await request.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return Object.fromEntries(new URLSearchParams(text));
  }
}

function externalOrigin(request: NextRequest): string {
  const proto = request.headers.get("x-forwarded-proto") || "https";
  const host =
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    "crm.satorilabural.online";
  return `${proto}://${host}`;
}

function notesFrom(input: {
  project: string;
  niche: string | null;
  region: string | null;
  interest: string | null;
  source: string | null;
}): string {
  return [
    "Источник: Need Number",
    `Проект: ${input.project}`,
    input.niche ? `Ниша: ${input.niche}` : null,
    input.region ? `Регион: ${input.region}` : null,
    input.interest ? `Интерес: ${input.interest}` : null,
    input.source ? `Сигнал/источник: ${input.source}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

async function proxyTelegramWebhook(request: NextRequest) {
  const body = await request.text();
  const secret = request.headers.get("x-telegram-bot-api-secret-token") || "";
  const response = await fetch("http://127.0.0.1:3020/api/integrations/telegram/webhook", {
    method: "POST",
    headers: {
      "content-type": request.headers.get("content-type") || "application/json",
      "x-telegram-bot-api-secret-token": secret,
    },
    body,
    cache: "no-store",
  });
  return new NextResponse(await response.text(), {
    status: response.status,
    headers: { "content-type": response.headers.get("content-type") || "application/json" },
  });
}

export async function POST(request: NextRequest) {
  if (request.nextUrl.searchParams.get("telegram") === "1") {
    return proxyTelegramWebhook(request);
  }

  const expectedSecret = ensureNeedNumberSecret();
  const receivedSecret =
    request.nextUrl.searchParams.get("key") ||
    request.headers.get("x-need-number-secret");

  if (!safeSecretEqual(receivedSecret, expectedSecret)) {
    return NextResponse.json(
      { error: "Неверный ключ webhook Need Number" },
      { status: 401 }
    );
  }

  let payload: Record<string, unknown>;
  try {
    payload = await parsePayload(request);
  } catch {
    return NextResponse.json(
      { error: "Не удалось прочитать данные webhook" },
      { status: 400 }
    );
  }

  const flat = flattenPayload(payload);
  const phone = findPhone(flat);
  if (!phone) {
    return NextResponse.json(
      {
        error: "В webhook Need Number не найден номер телефона",
        receivedFields: Object.keys(flat).slice(0, 40),
      },
      { status: 400 }
    );
  }

  const configuredProject = getSetting(INTEGRATION_KEYS.needNumberProjectId) || "1474";
  const project = pick(flat, PROJECT_KEYS) || configuredProject;
  const name = pick(flat, NAME_KEYS);
  const niche = pick(flat, NICHE_KEYS);
  const region = pick(flat, REGION_KEYS);
  const interest = pick(flat, INTEREST_KEYS);
  const source = pick(flat, SOURCE_KEYS);
  const noteText = notesFrom({ project, niche, region, interest, source });
  const identity = phoneIdentity(phone);
  const now = new Date();

  const existing = db
    .select()
    .from(contacts)
    .all()
    .find((contact) => phoneIdentity(contact.phone) === identity);

  let contact = existing;
  const duplicate = Boolean(existing);
  let dealId: string | null = null;

  if (existing) {
    db.insert(activities)
      .values({
        type: "note",
        description: `Повторный сигнал Need Number. ${noteText.replace(/\n/g, "; ")}`,
        contactId: existing.id,
        createdAt: now,
      })
      .run();
  } else {
    contact = db
      .insert(contacts)
      .values({
        name: name || `Need Number · ${phone}`,
        email: null,
        phone,
        company: null,
        source: "need_number",
        temperature: "warm",
        score: 55,
        notes: noteText,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();

    db.insert(activities)
      .values({
        type: "note",
        description: "Лид автоматически получен из Need Number",
        contactId: contact.id,
        createdAt: now,
      })
      .run();

    if (getBooleanSetting(INTEGRATION_KEYS.needNumberCreateDeal, true)) {
      const stage = db
        .select()
        .from(pipelineStages)
        .orderBy(asc(pipelineStages.order))
        .all()
        .find((item) => !item.isWon && !item.isLost);

      if (stage) {
        const createdDeal = db
          .insert(deals)
          .values({
            title: niche ? `Need Number · ${niche}` : `Need Number · ${phone}`,
            value: 0,
            stageId: stage.id,
            contactId: contact.id,
            probability: 20,
            notes: noteText,
            createdAt: now,
            updatedAt: now,
          })
          .returning()
          .get();
        dealId = createdDeal.id;
      }
    }
  }

  if (!contact) {
    return NextResponse.json({ error: "Не удалось создать клиента" }, { status: 500 });
  }

  const contactUrl = `${externalOrigin(request)}/contacts/${contact.id}`;
  const telegramLines = [
    duplicate ? "♻️ <b>Повторный лид Need Number</b>" : "🟢 <b>Новый лид Need Number</b>",
    `📞 <code>${escapeTelegramHtml(phone)}</code>`,
    niche ? `🏷 ${escapeTelegramHtml(niche)}` : null,
    region ? `📍 ${escapeTelegramHtml(region)}` : null,
    interest ? `💬 ${escapeTelegramHtml(interest)}` : null,
    `Проект: ${escapeTelegramHtml(project)}`,
  ].filter(Boolean) as string[];

  const telegram = await sendTelegramMessage({
    text: telegramLines.join("\n"),
    url: contactUrl,
  });

  return NextResponse.json(
    {
      success: true,
      duplicate,
      contactId: contact.id,
      dealId,
      phone,
      telegram,
    },
    { status: duplicate ? 200 : 201 }
  );
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    integration: "Need Number → SATORI CRM → Telegram",
    method: "POST",
  });
}
