import { NextRequest, NextResponse } from "next/server";
import { mergeContacts } from "@/lib/operations";
import { getRequestActor } from "@/lib/request-actor";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const sourceId = String(body.sourceId || "").trim();
    const targetId = String(body.targetId || "").trim();
    const contact = mergeContacts(sourceId, targetId, getRequestActor(request));
    return NextResponse.json({ contact });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Не удалось объединить клиентов" }, { status: 400 });
  }
}
