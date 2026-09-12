import { NextRequest, NextResponse } from "next/server";
import { listProjects, saveProjectDetails } from "@/lib/projects";

export const dynamic = "force-dynamic";

function normalizeDeadlineBucket<T extends Record<string, unknown> | null>(project: T): T {
  if (!project) return project;
  const daysRemaining = Number(project.daysRemaining);
  if (project.deadlineStatus === "due_soon" && Number.isFinite(daysRemaining) && daysRemaining > 2) {
    return { ...project, deadlineStatus: "on_track" } as T;
  }
  return project;
}

export async function GET() {
  try {
    const projects = listProjects().map((project) => normalizeDeadlineBucket(project));
    return NextResponse.json({ projects });
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
      productionTermDays:
        body.productionTermDays === null || body.productionTermDays === undefined || body.productionTermDays === ""
          ? null
          : Number(body.productionTermDays),
      contractDeadline: body.contractDeadline ? String(body.contractDeadline) : null,
      shippedAt: body.shippedAt ? String(body.shippedAt) : null,
      paymentTerms: body.paymentTerms ? String(body.paymentTerms) : null,
      notes: body.notes ? String(body.notes) : null,
    });
    return NextResponse.json(normalizeDeadlineBucket(result));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось сохранить проект";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
