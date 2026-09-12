import { NextRequest, NextResponse } from "next/server";
import { getRequestActor } from "@/lib/request-actor";

export async function GET(request: NextRequest) {
  return NextResponse.json({ actor: getRequestActor(request) });
}
