import { NextRequest, NextResponse } from "next/server";
import { listProjects, saveProjectDetails } from "@/lib/projects";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ projects: listProjects() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось загрузить проекты" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const dealId = String(body.dealId || "").trim();
    if (!dealId) return NextResponse.json({ error: "Не указан проект" }, { status: 400 });

    const result = saveProjectDetails({
      dealId,
      orderedAt: body.orderedAt ? String(body.orderedAt) : null,
      contractDeadline: body.contractDeadline ? String(body.contractDeadline) : null,
      shippedAt: body.shippedAt ? String(body.shippedAt) : null,
      notes: body.notes ? String(body.notes) : null,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось сохранить проект";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
