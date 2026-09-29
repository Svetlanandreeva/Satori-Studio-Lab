import { NextRequest, NextResponse } from "next/server";
import { getRequestActor } from "@/lib/request-actor";

export const dynamic = "force-dynamic";

/** Кто вошёл: для меню и скрытия денег на клиенте. */
export async function GET(request: NextRequest) {
  const a = getRequestActor(request);
  return NextResponse.json({ id: a.id, name: a.name, role: a.role });
}
