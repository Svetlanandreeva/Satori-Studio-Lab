import { NextResponse } from "next/server";
import { testEmailConnection } from "@/lib/email-integration";

export const runtime = "nodejs";

export async function POST() {
  try {
    const result = await testEmailConnection();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось подключиться к почте" },
      { status: 400 }
    );
  }
}
