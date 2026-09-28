import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

const TOKEN_VERSION = "v1";
const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function adminPassword() {
  const value = String(process.env.ADMIN_PASSWORD || "");
  if (!value) throw new Error("ADMIN_PASSWORD не задан в .env — вход в админку недоступен.");
  return value;
}

function signingSecret() {
  // An optional dedicated secret lets us rotate ADMIN_PASSWORD without changing
  // the session-signing key. If absent, derive it from the existing admin secret.
  return String(process.env.ADMIN_SESSION_SECRET || adminPassword());
}

function ttlSeconds() {
  const configured = Number(process.env.ADMIN_SESSION_TTL_SECONDS || DEFAULT_TTL_SECONDS);
  return Number.isFinite(configured) && configured >= 3600 ? Math.floor(configured) : DEFAULT_TTL_SECONDS;
}

function encode(value) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decode(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(payload) {
  return createHmac("sha256", signingSecret()).update(payload).digest("base64url");
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  return left.length === right.length && timingSafeEqual(left, right);
}

function createToken() {
  const now = Math.floor(Date.now() / 1000);
  const payload = encode(JSON.stringify({
    v: TOKEN_VERSION,
    iat: now,
    exp: now + ttlSeconds(),
    jti: randomUUID(),
  }));
  return `${payload}.${sign(payload)}`;
}

function verifyToken(token) {
  const raw = String(token || "");
  const separator = raw.lastIndexOf(".");
  if (separator <= 0) return false;
  const payload = raw.slice(0, separator);
  const signature = raw.slice(separator + 1);
  if (!signature || !safeEqual(signature, sign(payload))) return false;

  try {
    const data = JSON.parse(decode(payload));
    const now = Math.floor(Date.now() / 1000);
    return data?.v === TOKEN_VERSION && Number(data?.iat) <= now + 60 && Number(data?.exp) > now;
  } catch {
    return false;
  }
}

export function login(password) {
  const expected = adminPassword();
  if (String(password || "") !== expected) return null;
  return createToken();
}

export function requireAdmin(req, res, next) {
  const header = String(req.headers.authorization || "");
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token || !verifyToken(token)) {
    return res.status(401).json({ error: "Не авторизован" });
  }
  next();
}
