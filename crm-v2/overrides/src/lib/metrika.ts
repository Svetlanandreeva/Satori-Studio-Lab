import { sqlite } from "@/db";
import { readSecret, saveSecret } from "@/lib/ai-settings";

/**
 * Яндекс Метрика + Директ: сколько людей пришло с рекламы и сколько из них дошло
 * до сообщения / заявки / заказа. Данные берём из API Метрики (счётчик сайта),
 * расходы Директа — из Метрики, если Директ связан со счётчиком (иначе вводятся вручную).
 */
const API = process.env.METRIKA_API_BASE || "https://api-metrika.yandex.net";
export const DEFAULT_COUNTER = "110458266";

const GOALS = {
  messengers: ["telegram_click", "whatsapp_click", "phone_click"],
  leads: ["lead_custom_submitted", "lead_business_submitted"],
  orders: ["checkout_submitted", "quick_buy_submitted"],
} as const;

const setting = (k: string) => (sqlite.prepare("SELECT value FROM crm_settings WHERE key=?").get(k) as { value?: string } | undefined)?.value || "";
const setSetting = (k: string, v: string) => sqlite.prepare("INSERT INTO crm_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(k, v);

export function metrikaSettings() {
  const token = readSecret("metrika_token") || process.env.YANDEX_METRIKA_TOKEN || "";
  return { configured: Boolean(token), counterId: setting("metrika_counter_id") || DEFAULT_COUNTER, masked: token ? `${token.slice(0, 4)}••••${token.slice(-4)}` : "" };
}
export function saveMetrikaSettings(input: { token?: string; counterId?: string }) {
  if (input.token !== undefined) saveSecret("metrika_token", input.token);
  if (input.counterId) setSetting("metrika_counter_id", input.counterId.replace(/\D/g, ""));
  return metrikaSettings();
}
export function manualAdSpend(month: string) { return Number(setting(`ad_spend:${month}`)) || 0; }
export function saveManualAdSpend(month: string, rub: number) { setSetting(`ad_spend:${month}`, String(Math.max(0, Math.round(rub)))); }

async function api<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `OAuth ${token}` }, cache: "no-store" });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    let msg = t; try { msg = JSON.parse(t).message || t; } catch {}
    throw new Error(res.status === 403 ? "нет доступа к счётчику — проверь токен и права (metrika:read)" : `Метрика ${res.status}: ${String(msg).slice(0, 160)}`);
  }
  return res.json() as Promise<T>;
}

type Goal = { id: number; name: string; conditions?: Array<{ url?: string }> };
type Report = { data: Array<{ dimensions: Array<{ id?: string; name?: string }>; metrics: number[] }>; totals: number[] };

export type FunnelRow = { visits: number; messengers: number; leads: number; orders: number };
export type AdFunnel = {
  month: string; configured: boolean; error?: string;
  ad: FunnelRow | null; all: FunnelRow | null;
  cost: number | null; costSource: "direct" | "manual" | null; clicks: number | null; costError?: string;
  missingGoals: string[];
  /** По дням месяца: визиты и действия с рекламы, расход Директа. */
  daily: Array<{ date: string; visits: number; messengers: number; leads: number; orders: number; cost: number | null }>;
};

function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const today = new Date().toISOString().slice(0, 10);
  const end = `${month}-${String(last).padStart(2, "0")}`;
  return { date1: `${month}-01`, date2: end > today ? today : end };
}

// Кэш на 15 минут — Метрика не любит частые запросы, а цифры меняются медленно.
const cache = new Map<string, { at: number; value: AdFunnel }>();

export async function adFunnel(month: string): Promise<AdFunnel> {
  const { configured, counterId } = metrikaSettings();
  const token = readSecret("metrika_token") || process.env.YANDEX_METRIKA_TOKEN || "";
  const manual = manualAdSpend(month);
  const base: AdFunnel = { month, configured, ad: null, all: null, cost: manual || null, costSource: manual ? "manual" : null, clicks: null, missingGoals: [], daily: [] };
  if (!configured) return base;
  const key = `${counterId}:${month}:${manual}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 15 * 60 * 1000) return hit.value;
  try {
    const { goals } = await api<{ goals: Goal[] }>(`/management/v1/counter/${counterId}/goals`, token);
    const byIdent = new Map<string, number>();
    for (const g of goals) for (const c of g.conditions || []) if (c.url) byIdent.set(c.url, g.id);
    const all: string[] = [...GOALS.messengers, ...GOALS.leads, ...GOALS.orders];
    const found = all.filter((g) => byIdent.has(g));
    base.missingGoals = all.filter((g) => !byIdent.has(g));
    const metrics = ["ym:s:visits", ...found.map((g) => `ym:s:goal${byIdent.get(g)}reaches`)];
    const { date1, date2 } = monthRange(month);
    const q = new URLSearchParams({ ids: counterId, date1, date2, metrics: metrics.join(","), dimensions: "ym:s:lastsignTrafficSource", accuracy: "full", limit: "50" });
    const report = await api<Report>(`/stat/v1/data?${q}`, token);
    const sum = (vals: number[], group: readonly string[]) => group.reduce((s, g) => { const i = found.indexOf(g); return s + (i >= 0 ? Number(vals[i + 1] || 0) : 0); }, 0);
    const row = (vals: number[]): FunnelRow => ({ visits: Number(vals[0] || 0), messengers: sum(vals, GOALS.messengers), leads: sum(vals, GOALS.leads), orders: sum(vals, GOALS.orders) });
    base.all = row(report.totals || []);
    const adRow = report.data.find((d) => d.dimensions[0]?.id === "ad");
    base.ad = adRow ? row(adRow.metrics) : { visits: 0, messengers: 0, leads: 0, orders: 0 };
    // По дням — только реклама.
    try {
      const dq = new URLSearchParams({ ids: counterId, date1, date2, metrics: metrics.join(","), dimensions: "ym:s:date", filters: "ym:s:lastsignTrafficSource=='ad'", accuracy: "full", limit: "62", sort: "ym:s:date" });
      const d = await api<Report>(`/stat/v1/data?${dq}`, token);
      const byDay = new Map(d.data.map((x) => [String(x.dimensions[0]?.name || x.dimensions[0]?.id || ""), row(x.metrics)]));
      for (let t = Date.parse(`${date1}T12:00:00Z`); t <= Date.parse(`${date2}T12:00:00Z`); t += 86_400_000) {
        const date = new Date(t).toISOString().slice(0, 10);
        base.daily.push({ date, ...(byDay.get(date) || { visits: 0, messengers: 0, leads: 0, orders: 0 }), cost: null });
      }
    } catch { /* без графика по дням */ }
    if (!manual) {
      // Расход Директа: сначала новый отчёт «Источники, расходы и ROI» (ym:ev:expenses),
      // затем старые метрики Директа (ym:ad) — им иногда нужен логин клиента Директа.
      const login = setting("metrika_direct_login") || "studiosatori";
      const tries: Array<Record<string, string>> = [
        { metrics: "ym:ev:expenses<currency>,ym:ev:clicks", currency: "RUB" },
        { metrics: "ym:ev:expenses<currency>", currency: "RUB" },
        { metrics: "ym:ad:RUBAdCost,ym:ad:clicks", ...(login ? { direct_client_logins: login } : {}) },
      ];
      const errors: string[] = [];
      for (const t of tries) {
        try {
          const cq = new URLSearchParams({ ids: counterId, date1, date2, accuracy: "full", ...t });
          const c = await api<Report>(`/stat/v1/data?${cq}`, token);
          const cost = Number(c.totals?.[0] || 0);
          if (cost > 0) {
            base.cost = Math.round(cost); base.costSource = "direct"; base.clicks = Number(c.totals?.[1] || 0) || null;
            try { // тот же запрос по дням
              const dim = t.metrics.startsWith("ym:ev") ? "ym:ev:date" : "ym:ad:date";
              const dq = new URLSearchParams({ ids: counterId, date1, date2, accuracy: "full", ...t, metrics: t.metrics.split(",")[0], dimensions: dim, limit: "62" });
              const d = await api<Report>(`/stat/v1/data?${dq}`, token);
              const m = new Map(d.data.map((x) => [String(x.dimensions[0]?.name || x.dimensions[0]?.id || "").slice(0, 10), Number(x.metrics[0] || 0)]));
              for (const day of base.daily) day.cost = Math.round(m.get(day.date) || 0);
            } catch { /* расход по дням не обязателен */ }
            break;
          }
        } catch (e) { errors.push(e instanceof Error ? e.message : String(e)); }
      }
      if (base.cost == null && errors.length) base.costError = errors[0].slice(0, 200);
    }
  } catch (e) {
    base.error = e instanceof Error ? e.message : "Метрика не ответила";
  }
  cache.set(key, { at: Date.now(), value: base });
  return base;
}
