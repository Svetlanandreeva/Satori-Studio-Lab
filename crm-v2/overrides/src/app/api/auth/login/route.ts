import { NextRequest, NextResponse } from "next/server";
import {
  CRM_SESSION_COOKIE,
  createCrmSessionToken,
  crmSessionTtlSeconds,
  passwordMatches,
} from "@/lib/session-auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({})) as { password?: string };
    if (!passwordMatches(body.password)) {
      return NextResponse.json({ error: "Неверный пароль" }, { status: 401 });
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set(CRM_SESSION_COOKIE, createCrmSessionToken(), {
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
