import { NextRequest, NextResponse } from "next/server";
import { listProjects, saveProjectDetails } from "@/lib/projects";
import { getShipmentState, startShipment } from "@/lib/shipment";
import { runCrmConsistencyRepair } from "@/lib/crm-consistency";

export const dynamic = "force-dynamic";

function normalizeDeadlineBucket<T extends Record<string, unknown> | null>(project: T): T {
  if (!project) return project;
  const daysRemaining = Number(project.daysRemaining);
  if (project.deadlineStatus === "due_soon" && Number.isFinite(daysRemaining) && daysRemaining > 2) {
    return { ...project, deadlineStatus: "on_track" } as T;
  }
  return project;
}

function withShipment<T extends Record<string, unknown> | null>(project: T): T {
  if (!project) return project;
  const dealId = String(project.dealId || "");
  const shipment = dealId ? getShipmentState(dealId) : undefined;
  return {
    ...project,
    trackingCode: shipment?.trackingCode || "",
    trackingNotifiedAt: shipment?.notifiedAt || null,
    trackingNotificationChannel: shipment?.notificationChannel || null,
    trackingNotificationError: shipment?.notificationError || null,
  } as T;
}

function decoratedProjects() {
  runCrmConsistencyRepair();
  return listProjects().map((project) => withShipment(normalizeDeadlineBucket(project)));
}

export async function GET() {
  try {
    return NextResponse.json({ projects: decoratedProjects() });
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

    if (String(body.action || "") === "shipment") {
      const project = listProjects().find((item) => item.dealId === dealId);
      if (!project) return NextResponse.json({ error: "Проект не найден" }, { status: 404 });
      if (!["Доставка", "Завершено"].includes(String(project.stageName || ""))) {
        return NextResponse.json(
          { error: "Трек-номер можно отправить клиенту после перевода сделки в «Доставка»" },
          { status: 400 }
        );
      }

      const shipment = await startShipment(dealId, body.trackingCode);
      runCrmConsistencyRepair();
      const updated = decoratedProjects().find((item) => item.dealId === dealId) || null;
      return NextResponse.json({ project: updated, shipment });
    }

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
    return NextResponse.json(withShipment(normalizeDeadlineBucket(result)));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось сохранить проект";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
