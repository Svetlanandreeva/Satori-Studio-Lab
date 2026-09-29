import { NextRequest, NextResponse } from "next/server";
import { openStages, setWorkStage, workStage } from "@/lib/work-stage";

export const dynamic = "force-dynamic";

export async function GET() {
  const s = workStage();
  return NextResponse.json({ stageId: s.work?.id || null, stageName: s.work?.name || null, savedId: s.savedId, options: openStages().slice(1) });
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json() as { stageId?: string | null };
    setWorkStage(body.stageId || null);
    const s = workStage();
    return NextResponse.json({ stageId: s.work?.id || null, stageName: s.work?.name || null, savedId: s.savedId });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Не удалось сохранить" }, { status: 400 });
  }
}
