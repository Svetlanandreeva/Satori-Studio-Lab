import { NextRequest, NextResponse } from "next/server";
import { assertOwner, getRequestActor } from "@/lib/request-actor";
import { createTeamMember, listTeamMembers, updateTeamMember, deleteTeamMember, writeAuditLog } from "@/lib/operations";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ members: listTeamMembers() });
}

export async function POST(request: NextRequest) {
  try {
    const actor = assertOwner(request);
    const body = await request.json() as Record<string, unknown>;
    const member = createTeamMember({
      name: String(body.name || ""),
      login: String(body.login || ""),
      password: String(body.password || ""),
      role: String(body.role || "manager"),
    });
    writeAuditLog(actor, "create_team_member", "team_member", String((member as any)?.id || ""), { name: body.name, login: body.login, role: body.role });
    return NextResponse.json({ member }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Не удалось создать сотрудника" }, { status: 400 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const actor = assertOwner(request);
    const body = await request.json() as Record<string, unknown>;
    const id = String(body.id || "").trim();
    if (!id) return NextResponse.json({ error: "Не указан сотрудник" }, { status: 400 });
    const member = updateTeamMember({
      id,
      name: body.name === undefined ? undefined : String(body.name || ""),
      login: body.login === undefined ? undefined : String(body.login || ""),
      password: body.password ? String(body.password) : undefined,
      role: body.role === undefined ? undefined : String(body.role),
      active: body.active === undefined ? undefined : Boolean(body.active),
    });
    writeAuditLog(actor, "update_team_member", "team_member", id, { name: body.name, login: body.login, role: body.role, active: body.active });
    return NextResponse.json({ member });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Не удалось обновить сотрудника" }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const actor = assertOwner(request);
    const { searchParams } = new URL(request.url);
    const id = String(searchParams.get("id") || "").trim();
    if (!id) return NextResponse.json({ error: "Не указан сотрудник" }, { status: 400 });
    const deleted = deleteTeamMember(id);
    if (!deleted) return NextResponse.json({ error: "Сотрудник не найден" }, { status: 404 });
    writeAuditLog(actor, "delete_team_member", "team_member", id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Не удалось удалить сотрудника" }, { status: 400 });
  }
}
