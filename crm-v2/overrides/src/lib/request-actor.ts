import type { NextRequest } from "next/server";
import { CRM_SESSION_COOKIE, parseCrmSessionToken } from "@/lib/session-auth";
import type { SessionActor } from "@/lib/operations";

export function getRequestActor(request: NextRequest): SessionActor {
  return parseCrmSessionToken(request.cookies.get(CRM_SESSION_COOKIE)?.value)?.actor || {
    id: "owner",
    name: "Владелец",
    role: "owner",
  };
}

export function assertOwner(request: NextRequest): SessionActor {
  const actor = getRequestActor(request);
  if (actor.role !== "owner") throw new Error("Это действие доступно только владельцу CRM");
  return actor;
}
