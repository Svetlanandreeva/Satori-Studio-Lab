import { NextResponse } from "next/server";
import { isEmailConfigured, syncEmailMailbox } from "@/lib/email-integration";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST() {
  try {
    if (!isEmailConfigured()) {
      return NextResponse.json({ success: true, configured: false, imported: 0, folders: [] });
    }
    const result = await syncEmailMailbox();
    return NextResponse.json({ success: true, configured: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ошибка синхронизации почты" },
      { status: 500 }
    );
  }
}
