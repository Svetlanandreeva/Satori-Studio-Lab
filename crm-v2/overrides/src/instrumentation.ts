export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startEmailSyncScheduler } = await import("@/lib/email-sync-runner");
  startEmailSyncScheduler();
}
