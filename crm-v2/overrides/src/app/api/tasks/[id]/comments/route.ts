import { NextRequest, NextResponse } from "next/server";
import { sqlite } from "@/db";
import { getRequestActor } from "@/lib/request-actor";
import { addComment, canAccessTask, listComments, markRead } from "@/lib/task-chat";

export const dynamic = "force-dynamic";

function task(id: string) {
  return sqlite.prepare("SELECT id, owner_id AS ownerId FROM activities WHERE id=?").get(id) as { id: string; ownerId: string | null } | undefined;
}

/** Чат по задаче. Открыл — отмечаем прочитанным. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = getRequestActor(request);
  const t = task(id);
  if (!t) return NextResponse.json({ error: "Задача не найдена" }, { status: 404 });
  if (!canAccessTask(actor, t)) return NextResponse.json({ error: "Это не ваша задача" }, { status: 403 });
  const comments = listComments(id);
  markRead(id, actor.id);
  return NextResponse.json({ comments, me: actor.id });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = getRequestActor(request);
  const t = task(id);
  if (!t) return NextResponse.json({ error: "Задача не найдена" }, { status: 404 });
  if (!canAccessTask(actor, t)) return NextResponse.json({ error: "Это не ваша задача" }, { status: 403 });
  if (actor.role === "viewer") return NextResponse.json({ error: "Режим просмотра" }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as { text?: string };
  try { return NextResponse.json({ comment: addComment(id, { id: actor.id, name: actor.name }, String(body.text || "")) }); }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Ошибка" }, { status: 400 }); }
}
