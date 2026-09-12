import { NextRequest, NextResponse } from "next/server";

const COOKIE = "satori_crm_session";
const PUBLIC_PATHS = [
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/integrations/need-number",
  "/api/integrations/telegram/webhook",
  "/sw.js",
  "/favicon.ico",
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

function isInternalHost(request: NextRequest): boolean {
  const host = String(request.headers.get("host") || "").toLowerCase();
  return host.startsWith("127.0.0.1") || host.startsWith("localhost");
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
  return atob(padded);
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function sign(payload: string): Promise<string> {
  const secret = String(process.env.CRM_SESSION_SECRET || process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD || "");
  if (!secret) return "";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return bytesToBase64Url(new Uint8Array(signature));
}

type SessionData = { role: "owner" | "manager" | "viewer"; actorId: string; actorName: string };

async function sessionData(token: string | undefined): Promise<SessionData | null> {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const expected = await sign(payload);
  if (!expected || !constantTimeEqual(signature, expected)) return null;
  try {
    const data = JSON.parse(decodeBase64Url(payload));
    const now = Math.floor(Date.now() / 1000);
    if (![1, 2].includes(Number(data?.v)) || Number(data?.iat) > now + 60 || Number(data?.exp) <= now) return null;
    const rawRole = String(data?.actor?.role || "owner");
    const role = rawRole === "viewer" || rawRole === "manager" ? rawRole : "owner";
    return {
      role,
      actorId: String(data?.actor?.id || "owner"),
      actorName: String(data?.actor?.name || "Владелец"),
    };
  } catch {
    return null;
  }
}

function mutation(method: string) {
  return !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
}

function roleBlocked(request: NextRequest, session: SessionData): string | null {
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith("/api/") || !mutation(request.method)) return null;
  if (session.role === "viewer") return "Роль «Просмотр» не может изменять данные CRM";
  if (session.role === "manager" && (pathname.startsWith("/api/team") || pathname.startsWith("/api/control/backups"))) {
    return "Это действие доступно только владельцу CRM";
  }
  return null;
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (isInternalHost(request) || pathname.startsWith("/_next/") || isPublicPath(pathname)) return NextResponse.next();

  const session = await sessionData(request.cookies.get(COOKIE)?.value);
  if (session) {
    if (pathname === "/login") return NextResponse.redirect(new URL("/", request.url));
    const blocked = roleBlocked(request, session);
    if (blocked) return NextResponse.json({ error: blocked }, { status: 403 });
    const response = NextResponse.next();
    response.headers.set("x-satori-role", session.role);
    response.headers.set("x-satori-actor", session.actorName);
    return response;
  }

  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Сессия истекла. Войдите снова." }, { status: 401 });
  const login = new URL("/login", request.url);
  login.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(login);
}

export const config = { matcher: ["/((?!_next/static|_next/image).*)"] };
