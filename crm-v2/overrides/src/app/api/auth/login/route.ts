import { NextRequest, NextResponse } from "next/server";
import {
  CRM_SESSION_COOKIE,
  createCrmSessionToken,
  crmSessionTtlSeconds,
  passwordMatches,
} from "@/lib/session-auth";
import { authenticateTeamMember, type SessionActor } from "@/lib/operations";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({})) as { login?: string; password?: string };
    const login = String(body.login || "").trim();
    const password = String(body.password || "");
    let actor: SessionActor | null = null;

    if (login) {
      actor = authenticateTeamMember(login, password);
      if (!actor) return NextResponse.json({ error: "Неверный логин или пароль" }, { status: 401 });
    } else {
      if (!passwordMatches(password)) return NextResponse.json({ error: "Неверный пароль" }, { status: 401 });
      actor = { id: "owner", name: "Владелец", role: "owner" };
    }

    const response = NextResponse.json({ ok: true, actor });
    response.cookies.set(CRM_SESSION_COOKIE, createCrmSessionToken(actor), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: crmSessionTtlSeconds(),
    });
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось войти" },
      { status: 503 }
    );
  }
}
