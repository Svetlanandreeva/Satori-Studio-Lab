import { isEmailConfigured, syncEmailMailbox } from "@/lib/email-integration";
import { cleanupLegacyAutoEmailContacts } from "@/lib/email-crm-policy";
import { INTEGRATION_KEYS, getSetting, setSetting } from "@/lib/satori-integrations";

export async function runIncrementalEmailSync() {
  if (!isEmailConfigured()) {
    cleanupLegacyAutoEmailContacts();
    return { configured: false, imported: 0, folders: [] as string[] };
  }

  const originalDays = getSetting(INTEGRATION_KEYS.emailSyncDays) || "365";
  const hasPreviousSync = Boolean(getSetting(INTEGRATION_KEYS.emailLastSyncAt));
  if (hasPreviousSync) setSetting(INTEGRATION_KEYS.emailSyncDays, "2");

  try {
    const result = await syncEmailMailbox();
    const removedAutoContacts = cleanupLegacyAutoEmailContacts();
    return { configured: true, ...result, removedAutoContacts };
  } finally {
    if (hasPreviousSync) setSetting(INTEGRATION_KEYS.emailSyncDays, originalDays);
  }
}

const schedulerKey = "__satoriEmailSyncTimer";

type GlobalWithScheduler = typeof globalThis & {
  [schedulerKey]?: ReturnType<typeof setInterval>;
};

export function startEmailSyncScheduler() {
  const globalRef = globalThis as GlobalWithScheduler;
  if (globalRef[schedulerKey]) return;

  const tick = async () => {
    try {
      await runIncrementalEmailSync();
    } catch (error) {
      console.error("Satori email background sync failed", error);
    }
  };

  const first = setTimeout(() => void tick(), 20_000);
  first.unref?.();

  const timer = setInterval(() => void tick(), 60_000);
  timer.unref?.();
  globalRef[schedulerKey] = timer;
}
