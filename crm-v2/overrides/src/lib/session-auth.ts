import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { SessionActor } from "@/lib/operations";

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
  if (!expected) throw new Error("ADMIN_PASSWORD не задан — вход владельца CRM недоступен");
  return safeEqual(String(value || ""), expected);
}

export function createCrmSessionToken(actor?: SessionActor): string {
  const now = Math.floor(Date.now() / 1000);
  const sessionActor: SessionActor = actor || { id: "owner", name: "Владелец", role: "owner" };
  const payload = Buffer.from(JSON.stringify({
    v: 2,
    iat: now,
    exp: now + crmSessionTtlSeconds(),
    jti: randomUUID(),
    actor: sessionActor,
  }), "utf8").toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function parseCrmSessionToken(token: unknown): { actor: SessionActor; exp: number; iat: number } | null {
  const raw = String(token || "");
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = raw.slice(0, dot);
  const signature = raw.slice(dot + 1);
  if (!safeEqual(signature, sign(payload))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const now = Math.floor(Date.now() / 1000);
    if (![1, 2].includes(Number(data?.v)) || Number(data?.iat) > now + 60 || Number(data?.exp) <= now) return null;
    const rawActor = data?.actor || { id: "owner", name: "Владелец", role: "owner" };
    const role = rawActor.role === "viewer" || rawActor.role === "manager" ? rawActor.role : "owner";
    return {
      actor: {
        id: String(rawActor.id || "owner"),
        name: String(rawActor.name || "Владелец"),
        role,
      },
      exp: Number(data.exp),
      iat: Number(data.iat),
    };
  } catch {
    return null;
  }
}

export function verifyCrmSessionToken(token: unknown): boolean {
  return Boolean(parseCrmSessionToken(token));
}
