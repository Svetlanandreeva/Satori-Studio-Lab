import { NextRequest, NextResponse } from "next/server";
import { searchCrm } from "@/lib/operations";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = String(searchParams.get("q") || "").trim();
  return NextResponse.json({ results: searchCrm(q) });
}
