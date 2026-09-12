import fs from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { backupFile, createBackup, listBackups, requestRestore } from "@/lib/backups";
import { assertOwner } from "@/lib/request-actor";
import { writeAuditLog } from "@/lib/operations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    assertOwner(request);
    const { searchParams } = new URL(request.url);
    const download = searchParams.get("download");
    if (download) {
      const filePath = backupFile(download);
      const bytes = fs.readFileSync(filePath);
      return new NextResponse(bytes, {
        headers: {
          "content-type": "application/octet-stream",
          "content-disposition": `attachment; filename="${path.basename(filePath)}"`,
          "cache-control": "no-store",
        },
      });
    }
    return NextResponse.json({ backups: listBackups() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Не удалось загрузить резервные копии" }, { status: 403 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = assertOwner(request);
    const backup = await createBackup("manual");
    writeAuditLog(actor, "create_backup", "system", backup.name, { size: backup.size });
    return NextResponse.json({ backup }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Не удалось создать резервную копию" }, { status: 400 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const actor = assertOwner(request);
    const body = await request.json() as { name?: string };
    const name = String(body.name || "").trim();
    if (!name) return NextResponse.json({ error: "Не выбрана резервная копия" }, { status: 400 });
    const result = requestRestore(name);
    writeAuditLog(actor, "restore_backup", "system", name);
    setTimeout(() => process.exit(0), 450);
    return NextResponse.json({ ...result, restarting: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Не удалось запустить восстановление" }, { status: 400 });
  }
}
