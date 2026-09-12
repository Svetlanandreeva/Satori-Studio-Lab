import { getSetting, setSetting } from "@/lib/satori-integrations";

const MESSAGE_INDICATORS_STARTED_AT_KEY = "satori_message_indicators_started_at_v2";

export function getMessageIndicatorsStartedAt(): Date {
  const raw = String(getSetting(MESSAGE_INDICATORS_STARTED_AT_KEY) || "").trim();
  if (raw) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  const now = new Date();
  setSetting(MESSAGE_INDICATORS_STARTED_AT_KEY, now.toISOString());
  return now;
}
