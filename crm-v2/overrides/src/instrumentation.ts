export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { runCrmConsistencyRepair } = await import("@/lib/crm-consistency");
  runCrmConsistencyRepair();
  try {
    const { runEmailDuplicateRepair } = await import("@/lib/email-dedup");
    runEmailDuplicateRepair();
  } catch (error) {
    console.error("Email duplicate repair failed", error);
  }
  const { startEmailSyncScheduler } = await import("@/lib/email-sync-runner");
  startEmailSyncScheduler();
  const { startOperationsScheduler } = await import("@/lib/operations-scheduler");
  startOperationsScheduler();
}
