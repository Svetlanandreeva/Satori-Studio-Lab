import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { activities } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getRequestActor } from "@/lib/request-actor";
import { writeAuditLog } from "@/lib/operations";
import { sqlite } from "@/db";
import { canAccessTask, ensureTaskChat } from "@/lib/task-chat";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const existing = db.select().from(activities).where(eq(activities.id, id)).get();
  if (!existing) return NextResponse.json({ error: "Задача не найдена" }, { status: 404 });
  const actor = getRequestActor(request);
  if (!canAccessTask(actor, existing)) return NextResponse.json({ error: "Это не ваша задача" }, { status: 403 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    if (body.description !== undefined) patch.description = String(body.description || "").trim();
    if (body.priority !== undefined && ["low", "normal", "high", "urgent"].includes(String(body.priority))) patch.priority = String(body.priority);
    if (body.ownerId !== undefined && actor.role === "owner") patch.ownerId = String(body.ownerId || "").trim() || null;
    if (body.scheduledAt !== undefined) patch.scheduledAt = body.scheduledAt ? new Date(String(body.scheduledAt)) : null;
    if (body.completed !== undefined) patch.completedAt = body.completed ? new Date() : null;
    const result = db.update(activities).set(patch).where(eq(activities.id, id)).returning().get();
    writeAuditLog(getRequestActor(request), body.completed ? "complete_task" : "update_task", "activity", id, patch);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Не удалось обновить задачу" }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const existing = db.select().from(activities).where(eq(activities.id, id)).get();
  if (!existing) return NextResponse.json({ error: "Задача не найдена" }, { status: 404 });
  const actor = getRequestActor(request);
  if (actor.role !== "owner") {
    ensureTaskChat();
    const by = (sqlite.prepare("SELECT created_by AS by FROM activities WHERE id=?").get(id) as { by?: string | null } | undefined)?.by;
    if (by !== actor.id) return NextResponse.json({ error: "Удалить задачу может тот, кто её поставил" }, { status: 403 });
  }
  sqlite.prepare("DELETE FROM task_comments WHERE task_id=?").run(id);
  db.delete(activities).where(eq(activities.id, id)).run();
  writeAuditLog(getRequestActor(request), "delete_task", "activity", id, { description: existing.description });
  return NextResponse.json({ ok: true });
}
