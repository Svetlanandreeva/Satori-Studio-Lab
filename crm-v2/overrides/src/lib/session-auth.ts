import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export const CRM_SESSION_COOKIE = "satori_crm_session";
export const DEFAULT_SESSION_TTL_SECONDS = 60 * 60 * 24 * 180;

function adminPassword(): string {
  return String(process.env.ADMIN_PASSWORD || "");
}

function signingSecret(): string {
  return String(process.env.CRM_SESSION_SECRET || process.env.ADMIN_SESSION_SECRET || adminPassword());
}

export function crmSessionTtlSeconds(): number {
  const value = Number(process.env.CRM_SESSION_TTL_SECONDS || DEFAULT_SESSION_TTL_SECONDS);
  return Number.isFinite(value) && value >= 3600 ? Math.floor(value) : DEFAULT_SESSION_TTL_SECONDS;
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && timingSafeEqual(a, b);
}

function sign(payload: string): string {
  const secret = signingSecret();
  if (!secret) throw new Error("ADMIN_PASSWORD не задан — вход в CRM недоступен");
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function passwordMatches(value: unknown): boolean {
  const expected = adminPassword();
  if (!expected) throw new Error("ADMIN_PASSWORD не задан — вход в CRM недоступен");
  return safeEqual(String(value || ""), expected);
}

export function createCrmSessionToken(): string {
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    v: 1,
    iat: now,
    exp: now + crmSessionTtlSeconds(),
    jti: randomUUID(),
  }), "utf8").toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyCrmSessionToken(token: unknown): boolean {
  const raw = String(token || "");
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return false;
  const payload = raw.slice(0, dot);
  const signature = raw.slice(dot + 1);
  if (!safeEqual(signature, sign(payload))) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const now = Math.floor(Date.now() / 1000);
    return data?.v === 1 && Number(data?.iat) <= now + 60 && Number(data?.exp) > now;
  } catch {
    return false;
  }
}
