import { NextRequest, NextResponse } from "next/server";
import {
  CRM_SESSION_COOKIE,
  createCrmSessionToken,
  crmSessionTtlSeconds,
  passwordMatches,
} from "@/lib/session-auth";
import { authenticateTeamMember, type SessionActor } from "@/lib/operations";

export const dynamic = "force-dynamic";

function publicOrigin(request: NextRequest) {
  const forwardedHost = String(request.headers.get("x-forwarded-host") || "").split(",")[0]?.trim();
  const host = forwardedHost || String(request.headers.get("host") || "").split(",")[0]?.trim();
  const forwardedProto = String(request.headers.get("x-forwarded-proto") || "").split(",")[0]?.trim();
  const protocol = forwardedProto || (request.nextUrl.protocol ? request.nextUrl.protocol.replace(":", "") : "https");

  if (host && !/^localhost(?::\d+)?$/i.test(host) && !/^127\.0\.0\.1(?::\d+)?$/.test(host)) {
    return `${protocol}://${host}`;
  }

  // Production requests arrive at this route through nginx on port 3020.
  // Never leak the internal localhost origin back to a browser redirect.
  if (process.env.NODE_ENV === "production") {
    return String(process.env.CRM_PUBLIC_ORIGIN || "https://crm.crmsatori.ru").replace(/\/$/, "");
  }

  return request.nextUrl.origin;
}

function publicUrl(request: NextRequest, pathname: string) {
  return new URL(pathname, `${publicOrigin(request)}/`);
}

function loginErrorRedirect(request: NextRequest, message: string) {
  const url = publicUrl(request, "/login");
  url.searchParams.set("error", message);
  return NextResponse.redirect(url, 303);
}

// Защита от подбора пароля: 5 неудачных попыток за 15 минут с одного адреса → пауза 15 минут.
const failures = new Map<string, { count: number; first: number; blockedUntil: number }>();
const WINDOW_MS = 15 * 60 * 1000;
function clientIp(request: NextRequest) {
  return String(request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for") || "local").split(",")[0].trim();
}
function isBlocked(ip: string) {
  const f = failures.get(ip);
  return Boolean(f && f.blockedUntil > Date.now());
}
function registerFailure(ip: string) {
  const now = Date.now();
  const f = failures.get(ip);
  if (!f || now - f.first > WINDOW_MS) { failures.set(ip, { count: 1, first: now, blockedUntil: 0 }); return; }
  f.count += 1;
  if (f.count >= 5) f.blockedUntil = now + WINDOW_MS;
  if (failures.size > 5000) failures.clear();
}

export async function POST(request: NextRequest) {
  const ip = clientIp(request);
  const contentTypeEarly = String(request.headers.get("content-type") || "").toLowerCase();
  if (isBlocked(ip)) {
    const msg = "Слишком много попыток входа. Подожди 15 минут.";
    return contentTypeEarly.includes("application/json") ? NextResponse.json({ error: msg }, { status: 429 }) : loginErrorRedirect(request, msg);
  }
  const contentType = String(request.headers.get("content-type") || "").toLowerCase();
  const isNativeForm = contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data");

  try {
    let login = "";
    let password = "";
    let next = "/";

    if (isNativeForm) {
      const form = await request.formData();
      login = String(form.get("login") || "").trim();
      password = String(form.get("password") || "");
      const requestedNext = String(form.get("next") || "/");
      next = requestedNext.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/";
    } else {
      const body = await request.json().catch(() => ({})) as { login?: string; password?: string; next?: string };
      login = String(body.login || "").trim();
      password = String(body.password || "");
      const requestedNext = String(body.next || "/");
      next = requestedNext.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/";
    }

    let actor: SessionActor | null = null;
    if (login) {
      actor = authenticateTeamMember(login, password);
      if (!actor) {
        registerFailure(ip);
        return isNativeForm
          ? loginErrorRedirect(request, "Неверный логин или пароль")
          : NextResponse.json({ error: "Неверный логин или пароль" }, { status: 401 });
      }
    } else {
      if (!passwordMatches(password)) {
        registerFailure(ip);
        return isNativeForm
          ? loginErrorRedirect(request, "Неверный пароль")
          : NextResponse.json({ error: "Неверный пароль" }, { status: 401 });
      }
      actor = { id: "owner", name: "Владелец", role: "owner" };
    }

    failures.delete(ip);
    const response = isNativeForm
      ? NextResponse.redirect(publicUrl(request, next), 303)
      : NextResponse.json({ ok: true, actor });

    response.cookies.set(CRM_SESSION_COOKIE, createCrmSessionToken(actor), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: crmSessionTtlSeconds(),
    });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось войти";
    return isNativeForm ? loginErrorRedirect(request, message) : NextResponse.json({ error: message }, { status: 503 });
  }
}
