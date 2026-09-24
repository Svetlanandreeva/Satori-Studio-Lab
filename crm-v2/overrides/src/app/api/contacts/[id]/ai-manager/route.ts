import { NextRequest, NextResponse } from "next/server";
import { analyzeContactWithAi } from "@/lib/ai-manager";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    let body: Record<string, unknown> = {};
    try { body = await request.json(); } catch {}
    const result = await analyzeContactWithAi(id, {
      documentId: body.documentId ? String(body.documentId) : undefined,
      apply: body.apply === true,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "AI manager error" }, { status: 400 });
  }
}
