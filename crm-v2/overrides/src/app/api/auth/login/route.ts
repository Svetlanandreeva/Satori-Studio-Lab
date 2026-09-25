import { NextRequest, NextResponse } from "next/server";
import {
  CRM_SESSION_COOKIE,
  createCrmSessionToken,
  crmSessionTtlSeconds,
  passwordMatches,
} from "@/lib/session-auth";
import { authenticateTeamMember, type SessionActor } from "@/lib/operations";

export const dynamic = "force-dynamic";

function loginErrorRedirect(request: NextRequest, message: string) {
  const url = new URL("/login", request.url);
  url.searchParams.set("error", message);
  return NextResponse.redirect(url, 303);
}

export async function POST(request: NextRequest) {
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
        return isNativeForm
          ? loginErrorRedirect(request, "Неверный логин или пароль")
          : NextResponse.json({ error: "Неверный логин или пароль" }, { status: 401 });
      }
    } else {
      if (!passwordMatches(password)) {
        return isNativeForm
          ? loginErrorRedirect(request, "Неверный пароль")
          : NextResponse.json({ error: "Неверный пароль" }, { status: 401 });
      }
      actor = { id: "owner", name: "Владелец", role: "owner" };
    }

    const response = isNativeForm
      ? NextResponse.redirect(new URL(next, request.url), 303)
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
