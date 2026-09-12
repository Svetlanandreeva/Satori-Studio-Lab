export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { runCrmConsistencyRepair } = await import("@/lib/crm-consistency");
  runCrmConsistencyRepair();
  const { startEmailSyncScheduler } = await import("@/lib/email-sync-runner");
  startEmailSyncScheduler();
}
