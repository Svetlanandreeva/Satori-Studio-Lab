import { NextRequest, NextResponse } from "next/server";
import { deleteTemplate, listTemplates, saveTemplate, writeAuditLog } from "@/lib/operations";
import { getRequestActor } from "@/lib/request-actor";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ templates: listTemplates() });
}

export async function POST(request: NextRequest) {
  try {
    const actor = getRequestActor(request);
    const body = await request.json() as Record<string, unknown>;
    const template = saveTemplate({
      title: String(body.title || ""),
      channel: String(body.channel || "all"),
      body: String(body.body || ""),
      sortOrder: body.sortOrder === undefined ? undefined : Number(body.sortOrder),
    });
    writeAuditLog(actor, "create_template", "message_template", String((template as any)?.id || ""), { title: body.title, channel: body.channel });
    return NextResponse.json({ template }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Не удалось создать шаблон" }, { status: 400 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const actor = getRequestActor(request);
    const body = await request.json() as Record<string, unknown>;
    const id = String(body.id || "").trim();
    if (!id) return NextResponse.json({ error: "Не указан шаблон" }, { status: 400 });
    const template = saveTemplate({
      id,
      title: String(body.title || ""),
      channel: String(body.channel || "all"),
      body: String(body.body || ""),
      sortOrder: body.sortOrder === undefined ? undefined : Number(body.sortOrder),
    });
    writeAuditLog(actor, "update_template", "message_template", id, { title: body.title, channel: body.channel });
    return NextResponse.json({ template });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Не удалось обновить шаблон" }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const actor = getRequestActor(request);
    const { searchParams } = new URL(request.url);
    const id = String(searchParams.get("id") || "").trim();
    if (!id) return NextResponse.json({ error: "Не указан шаблон" }, { status: 400 });
    if (!deleteTemplate(id)) return NextResponse.json({ error: "Шаблон не найден" }, { status: 404 });
    writeAuditLog(actor, "delete_template", "message_template", id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Не удалось удалить шаблон" }, { status: 400 });
  }
}
