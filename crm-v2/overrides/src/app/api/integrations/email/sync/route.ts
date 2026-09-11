import { NextResponse } from "next/server";
import { isEmailConfigured, syncEmailMailbox } from "@/lib/email-integration";
import { INTEGRATION_KEYS, getSetting, setSetting } from "@/lib/satori-integrations";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST() {
  if (!isEmailConfigured()) {
    return NextResponse.json({ success: true, configured: false, imported: 0, folders: [] });
  }

  // The first sync respects the configured history depth (365 days by default).
  // Every later poll only overlaps the last two days. Message-ID dedupe makes
  // this safe while avoiding reparsing a whole year of mail every minute.
  const originalDays = getSetting(INTEGRATION_KEYS.emailSyncDays) || "365";
  const hasPreviousSync = Boolean(getSetting(INTEGRATION_KEYS.emailLastSyncAt));
  if (hasPreviousSync) setSetting(INTEGRATION_KEYS.emailSyncDays, "2");

  try {
    const result = await syncEmailMailbox();
    return NextResponse.json({ success: true, configured: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ошибка синхронизации почты" },
      { status: 500 }
    );
  } finally {
    if (hasPreviousSync) setSetting(INTEGRATION_KEYS.emailSyncDays, originalDays);
  }
}
