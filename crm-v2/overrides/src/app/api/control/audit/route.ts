import { NextRequest, NextResponse } from "next/server";
import { listAuditLog } from "@/lib/operations";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limit = Math.max(1, Math.min(200, Number(searchParams.get("limit") || 80)));
  return NextResponse.json({ events: listAuditLog(limit) });
}
