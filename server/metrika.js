const COUNTER_ID = 110458266;
const API_BASE = "https://api-metrika.yandex.net/management/v1/counter";

// ── Server-side offline-conversion fallback ─────────────────────────────────
// Fired when a payment is confirmed (webhook or status poll), independent of
// whether the customer's browser is still open. Yandex processes this with a
// delay of up to ~2 hours — it's a safety net, not a replacement for the
// instant client-side reachGoal() call in App.tsx.
export async function sendOfflineConversion(order) {
  const token = process.env.YANDEX_METRIKA_TOKEN;
  if (!token) return; // не настроено — тихо ничего не делаем
  if (!order.yclid && !order.clientId) return; // нечем привязать конверсию

  const idColumn = order.yclid ? "Yclid" : "ClientId";
  const idValue = order.yclid || order.clientId;
  const dateTime = Math.floor(Date.now() / 1000);

  const csv = `${idColumn},Target,DateTime,Price,Currency\n${idValue},purchase,${dateTime},${order.amount},RUB\n`;

  const form = new FormData();
  form.append("file", new Blob([csv], { type: "text/csv" }), "conversions.csv");

  const idType = order.yclid ? "YCLID" : "CLIENT_ID";
  const url = `${API_BASE}/${COUNTER_ID}/offline_conversions/upload?client_id_type=${idType}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `OAuth ${token}` },
    body: form,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Metrika offline-conversion upload failed: ${res.status} ${text}`);
  }
  return res.json();
}
