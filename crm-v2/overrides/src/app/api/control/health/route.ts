import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { DB_PATH, sqlite } from "@/db";
import { listBackups } from "@/lib/backups";
import { getEmailConfig, isEmailConfigured } from "@/lib/email-integration";
import { getSetting, INTEGRATION_KEYS } from "@/lib/satori-integrations";
import { operationsHeartbeat } from "@/lib/operations-scheduler";

export const dynamic = "force-dynamic";

function ageSeconds(value: string | null) {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? Math.max(0, Math.round((Date.now() - ms) / 1000)) : null;
}

export async function GET() {
  let databaseOk = false;
  let databaseMessage = "Не проверена";
  try {
    const check = sqlite.pragma("quick_check", { simple: true });
    databaseOk = String(check).toLowerCase() === "ok";
    databaseMessage = databaseOk ? "SQLite в порядке" : String(check);
  } catch (error) {
    databaseMessage = error instanceof Error ? error.message : "Ошибка SQLite";
  }

  const email = getEmailConfig();
  const emailLastSyncAt = getSetting(INTEGRATION_KEYS.emailLastSyncAt);
  const emailLastSyncError = getSetting(INTEGRATION_KEYS.emailLastSyncError);
  const telegramToken = getSetting(INTEGRATION_KEYS.telegramBotToken);
  const telegramChat = getSetting(INTEGRATION_KEYS.telegramChatId);
  const needProject = getSetting(INTEGRATION_KEYS.needNumberProjectId);
  const heartbeat = operationsHeartbeat();
  const heartbeatAge = ageSeconds(heartbeat);
  const backups = listBackups();

  let disk: { freeBytes: number; totalBytes: number; freePercent: number } | null = null;
  try {
    const stat = fs.statfsSync(path.dirname(DB_PATH));
    const totalBytes = Number(stat.blocks) * Number(stat.bsize);
    const freeBytes = Number(stat.bavail) * Number(stat.bsize);
    disk = { freeBytes, totalBytes, freePercent: totalBytes ? (freeBytes / totalBytes) * 100 : 0 };
  } catch {}

  const statuses = {
    database: { ok: databaseOk, message: databaseMessage },
    email: {
      ok: isEmailConfigured(email) && !emailLastSyncError && (ageSeconds(emailLastSyncAt) ?? 999999) < 300,
      configured: isEmailConfigured(email),
      lastSyncAt: emailLastSyncAt,
      lastError: emailLastSyncError || null,
      message: !isEmailConfigured(email) ? "Почта не настроена" : emailLastSyncError ? "Есть ошибка синхронизации" : emailLastSyncAt ? "Синхронизация работает" : "Ожидаем первую синхронизацию",
    },
    telegram: {
      ok: Boolean(telegramToken && telegramChat),
      configured: Boolean(telegramToken && telegramChat),
      message: telegramToken && telegramChat ? "Telegram настроен" : "Telegram не настроен полностью",
    },
    needNumber: {
      ok: Boolean(needProject),
      configured: Boolean(needProject),
      projectId: needProject || null,
      message: needProject ? `Проект ${needProject}` : "ID проекта не задан",
    },
    scheduler: {
      ok: heartbeatAge !== null && heartbeatAge < 180,
      heartbeat,
      ageSeconds: heartbeatAge,
      message: heartbeatAge !== null && heartbeatAge < 180 ? "Фоновые задачи работают" : "Нет свежего heartbeat",
    },
    backups: {
      ok: backups.length > 0 && Date.now() - Number((backups[0] as any)?.createdAt || 0) < 36 * 60 * 60 * 1000,
      count: backups.length,
      latest: backups[0] || null,
      message: backups.length ? "Резервные копии есть" : "Резервных копий пока нет",
    },
    disk: disk ? {
      ok: disk.freePercent >= 10,
      ...disk,
      message: `${disk.freePercent.toFixed(1)}% свободно`,
    } : { ok: true, message: "Недоступно для проверки" },
  };

  const overall = Object.values(statuses).every((item: any) => item.ok !== false);
  return NextResponse.json({ overall, checkedAt: new Date().toISOString(), statuses });
}
