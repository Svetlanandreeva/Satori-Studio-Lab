import { NextResponse } from "next/server";
import { runIncrementalEmailSync } from "@/lib/email-sync-runner";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST() {
  try {
    const result = await runIncrementalEmailSync();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ошибка синхронизации почты" },
      { status: 500 }
    );
  }
}
