import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { deals, pipelineStages } from "@/db/schema";
import { eq } from "drizzle-orm";
import { pushDealStageToStorefront } from "@/lib/store-orders";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const deal = db.select().from(deals).where(eq(deals.id, id)).get();
  if (!deal) return NextResponse.json({ error: "Сделка не найдена" }, { status: 404 });
  return NextResponse.json(deal);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }

  const existing = db.select().from(deals).where(eq(deals.id, id)).get();
  if (!existing) return NextResponse.json({ error: "Сделка не найдена" }, { status: 404 });

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (body.title !== undefined) updateData.title = body.title;
  if (body.value !== undefined) updateData.value = body.value;
  if (body.stageId !== undefined) updateData.stageId = body.stageId;
  if (body.contactId !== undefined) updateData.contactId = body.contactId;
  if (body.expectedClose !== undefined) {
    updateData.expectedClose = body.expectedClose ? new Date(String(body.expectedClose)) : null;
  }
  if (body.probability !== undefined) {
    updateData.probability = Math.max(0, Math.min(100, Number(body.probability)));
  }
  if (body.notes !== undefined) updateData.notes = body.notes;

  const result = db
    .update(deals)
    .set(updateData)
    .where(eq(deals.id, id))
    .returning()
    .get();

  if (body.stageId !== undefined) {
    const stage = db
      .select()
      .from(pipelineStages)
      .where(eq(pipelineStages.id, String(body.stageId)))
      .get();
    if (stage) {
      try {
        await pushDealStageToStorefront(id, stage.name);
      } catch (error) {
        // The CRM stage change itself must remain saved even if the storefront
        // is temporarily unavailable. A later reconciliation will repair it.
        console.error("Storefront fulfillment sync failed", error);
      }
    }
  }

  return NextResponse.json(result);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const existing = db.select().from(deals).where(eq(deals.id, id)).get();
  if (!existing) return NextResponse.json({ error: "Сделка не найдена" }, { status: 404 });
  db.delete(deals).where(eq(deals.id, id)).run();
  return NextResponse.json({ success: true });
}
