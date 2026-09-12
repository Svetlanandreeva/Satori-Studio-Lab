import { NextResponse } from "next/server";
import { listDealHistory } from "@/lib/operations";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return NextResponse.json({ history: listDealHistory(id) });
}
