import { sqlite } from "@/db";

const PREFIX = "deal_payment_date:";

function key(dealId: string) {
  return `${PREFIX}${dealId}`;
}

export function getDealPaymentDate(dealId: string): string | null {
  try {
    const row = sqlite.prepare("SELECT value FROM crm_settings WHERE key=?").get(key(dealId)) as { value?: string } | undefined;
    const value = String(row?.value || "").trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
  } catch {
    return null;
  }
}

export function setDealPaymentDate(dealId: string, value: string | null) {
  const normalized = String(value || "").trim();
  if (normalized && !/^\d{4}-\d{2}-\d{2}$/.test(normalized)) throw new Error("Некорректная дата оплаты");
  if (!normalized) {
    sqlite.prepare("DELETE FROM crm_settings WHERE key=?").run(key(dealId));
    return null;
  }
  sqlite.prepare("INSERT INTO crm_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
    .run(key(dealId), normalized);
  return normalized;
}
