import { useEffect, useMemo, useState, type FormEvent } from "react";
import { TrendingUp } from "lucide-react";
import "./styles/admin-seasonality.css";

// Сезонность спроса на дашборде админки.
// Данные: /seasonality-data.json (public/), индексы по месяцам из Яндекс Вордстата.
// Раз в месяц файл обновляет GitHub Action «Update CRM seasonality» (нужны секреты YANDEX_SEARCH_API_KEY и YANDEX_FOLDER_ID).
// Дневная кривая — плавная интерполяция месячных индексов, поэтому «сегодня» сдвигается каждый день.

type Series = { id: string; title: string; short?: string; note?: string; index: number[] };
type SeasonData = { updated?: string; source?: string; series: Series[] };

const FALLBACK: SeasonData = {
  updated: "2026-11-17",
  source: "Яндекс Вордстат, вся Россия",
  series: [
    { id: "shop", title: "Готовые светильники", short: "Готовые", index: [1.12, 0.89, 0.87, 0.69, 0.77, 0.51, 0.75, 1.11, 1.13, 1.48, 1.22, 1.47] },
    { id: "custom", title: "Свет на заказ", short: "На заказ", index: [1, 0.94, 0.93, 0.84, 1.11, 0.86, 1.06, 1, 0.99, 1, 1.05, 1.22] },
    { id: "horeca", title: "Рестораны и отели", short: "Рестораны", note: "запросов мало — это ориентир", index: [0.94, 0.88, 0.92, 0.98, 1.02, 0.89, 1, 1.12, 1, 1.06, 1.22, 0.97] },
  ],
};

const MONTHS = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const MONTHS_GEN = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const DAY = 86400000;
const BUDGET_KEY = "satori_season_budget";
const SERIES_KEY = "satori_season_series";

const read = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* приватный режим */ } };
const pct = (v: number) => `${v >= 1 ? "+" : "−"}${Math.abs(Math.round((v - 1) * 100))}%`;
const rub = (n: number) => `${new Intl.NumberFormat("ru-RU").format(Math.round(n / 100) * 100)} ₽`;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export function dailyIndex(index: number[], date: Date) {
  const y = date.getFullYear();
  const t = date.getTime();
  for (let k = -1; k < 12; k++) {
    const a = new Date(y, k, 15).getTime();
    const b = new Date(y, k + 1, 15).getTime();
    if (t >= a && t <= b) {
      const va = index[((k % 12) + 12) % 12];
      const vb = index[(k + 1) % 12];
      const f = (1 - Math.cos(((t - a) / (b - a)) * Math.PI)) / 2;
      return va + (vb - va) * f;
    }
  }
  return index[date.getMonth()];
}

function level(v: number) {
  if (v >= 1.1) return { key: "high", label: "Сезон", advice: "Спрос выше обычного — добавляйте бюджет на рекламу" };
  if (v <= 0.9) return { key: "low", label: "Спад", advice: "Спрос ниже обычного — реклама на минимуме, время для контента и SEO" };
  return { key: "mid", label: "Норма", advice: "Обычный спрос — обычный бюджет" };
}

function valid(data: unknown): data is SeasonData {
  const d = data as SeasonData;
  return Boolean(d && Array.isArray(d.series) && d.series.length && d.series.every((s) => Array.isArray(s.index) && s.index.length === 12));
}

function Chart({ series, today }: { series: Series; today: Date }) {
  const model = useMemo(() => {
    const from = new Date(today.getFullYear(), today.getMonth() - 4, 1);
    const to = new Date(today.getFullYear(), today.getMonth() + 8, 1);
    const days = Math.round((to.getTime() - from.getTime()) / DAY);
    const pts: { x: number; v: number }[] = [];
    for (let i = 0; i <= days; i += 2) pts.push({ x: i / days, v: dailyIndex(series.index, new Date(from.getTime() + i * DAY)) });
    const months = Array.from({ length: 12 }, (_, k) => {
      const d = new Date(from.getFullYear(), from.getMonth() + k, 1);
      return { x: (d.getTime() - from.getTime()) / DAY / days, label: MONTHS[d.getMonth()], now: d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear() };
    });
    return { pts, months, todayX: (today.getTime() - from.getTime()) / DAY / days, todayV: dailyIndex(series.index, today) };
  }, [series, today]);

  const W = 720, H = 200, top = 16, bottom = 12;
  const vs = model.pts.map((p) => p.v);
  const hi = Math.max(1.25, ...vs) + 0.05;
  const lo = Math.min(0.75, ...vs) - 0.05;
  const y = (v: number) => top + (1 - (v - lo) / (hi - lo)) * (H - top - bottom);
  const line = model.pts.map((p, i) => `${i ? "L" : "M"}${(p.x * W).toFixed(1)},${y(p.v).toFixed(1)}`).join("");
  const yHigh = y(1.1), yLow = y(0.9), tx = model.todayX * W;
  const clipHigh = `season-high-${series.id}`, clipLow = `season-low-${series.id}`, fill = `season-fill-${series.id}`;

  return <div className="season-chart">
    <div className="season-plot">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id={fill} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#191b22" stopOpacity=".14" /><stop offset="1" stopColor="#191b22" stopOpacity="0" /></linearGradient>
          <clipPath id={clipHigh}><rect x="0" y="0" width={W} height={yHigh} /></clipPath>
          <clipPath id={clipLow}><rect x="0" y={yLow} width={W} height={H - yLow} /></clipPath>
        </defs>
        <rect x="0" y="0" width={W} height={yHigh} className="season-zone-high" />
        <rect x="0" y={yLow} width={W} height={H - yLow} className="season-zone-low" />
        <line x1="0" x2={W} y1={y(1)} y2={y(1)} className="season-base" vectorEffect="non-scaling-stroke" />
        <path d={`${line}L${W},${H}L0,${H}Z`} fill={`url(#${fill})`} />
        <rect x="0" y="0" width={tx} height={H} className="season-past" />
        <path d={line} className="season-line" vectorEffect="non-scaling-stroke" />
        <path d={line} className="season-line-high" clipPath={`url(#${clipHigh})`} vectorEffect="non-scaling-stroke" />
        <path d={line} className="season-line-low" clipPath={`url(#${clipLow})`} vectorEffect="non-scaling-stroke" />
        <line x1={tx} x2={tx} y1="0" y2={H} className="season-today" vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="season-dot" style={{ left: `${model.todayX * 100}%`, top: `${(y(model.todayV) / H) * 100}%` }} />
      <span className="season-today-label" style={{ left: `${model.todayX * 100}%` }}>сегодня</span>
    </div>
    <div className="season-months">
      {model.months.map((m) => <span key={m.label + m.x} className={m.now ? "season-month-now" : ""} style={{ left: `${m.x * 100}%` }}>{m.label}</span>)}
    </div>
    <div className="season-legend">
      <span className="season-key-high">сезон</span><span className="season-key-mid">норма</span><span className="season-key-low">спад</span><span className="season-key-base">пунктир — обычный уровень</span>
    </div>
  </div>;
}

function Leads({ counts, today }: { counts: number[]; today: Date }) {
  const max = Math.max(1, ...counts);
  const total = counts.reduce((a, b) => a + b, 0);
  const first = new Date(today.getTime() - 29 * DAY);
  return <div className="season-leads">
    <div className="season-leads-head"><b>Заявки и заказы по дням</b><span>{total} за 30 дней</span></div>
    <ol className="season-leads-bars" aria-label="Заявки и заказы по дням за 30 дней">
      {counts.map((n, i) => {
        const d = new Date(today.getTime() - (29 - i) * DAY);
        return <li key={i} title={`${d.getDate()} ${MONTHS_GEN[d.getMonth()]}: ${n}`}>
          <span className={n ? "" : "season-zero"} style={{ height: `${n ? Math.max(18, Math.round((n / max) * 100)) : 6}%` }} />
        </li>;
      })}
    </ol>
    <div className="season-leads-axis"><span>{first.getDate()} {MONTHS_GEN[first.getMonth()]}</span><span>сегодня</span></div>
  </div>;
}

export default function AdminSeasonality({ token }: { token: string }) {
  const [data, setData] = useState<SeasonData>(FALLBACK);
  const [seriesId, setSeriesId] = useState(() => read(SERIES_KEY) || "shop");
  const [budget, setBudget] = useState(() => Number(read(BUDGET_KEY)) || 2000);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [counts, setCounts] = useState<number[] | null>(null);
  const today = useMemo(() => startOfDay(new Date()), []);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/seasonality-data.json", { cache: "no-cache", signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null)).then((d) => { if (valid(d)) setData(d); }).catch(() => {});
    const auth = { Authorization: `Bearer ${token}` };
    Promise.all([
      fetch("/api/admin/leads", { headers: auth, cache: "no-store", signal: controller.signal }).then((r) => (r.ok ? r.json() : [])),
      fetch("/api/admin/orders", { headers: auth, cache: "no-store", signal: controller.signal }).then((r) => (r.ok ? r.json() : [])),
    ]).then(([leads, orders]) => {
      const days = Array(30).fill(0);
      const add = (createdAt?: string) => {
        if (!createdAt) return;
        const ago = Math.round((today.getTime() - startOfDay(new Date(createdAt)).getTime()) / DAY);
        if (ago >= 0 && ago < 30) days[29 - ago] += 1;
      };
      (Array.isArray(leads) ? leads : []).forEach((l: { createdAt?: string; isSpam?: boolean }) => { if (!l.isSpam) add(l.createdAt); });
      (Array.isArray(orders) ? orders : []).forEach((o: { createdAt?: string }) => add(o.createdAt));
      setCounts(days);
    }).catch(() => {});
    return () => controller.abort();
  }, [token, today]);

  const series = data.series.find((s) => s.id === seriesId) || data.series[0];
  const now = dailyIndex(series.index, today);
  const in30 = dailyIndex(series.index, new Date(today.getTime() + 30 * DAY));
  const lv = level(now);
  const trend = in30 - now > 0.04 ? "растёт" : in30 - now < -0.04 ? "падает" : "ровно";
  const updated = data.updated ? new Date(`${data.updated}T00:00:00`) : null;

  function pick(id: string) { setSeriesId(id); write(SERIES_KEY, id); }
  function saveBudget(e: FormEvent) {
    e.preventDefault();
    const v = Number(draft);
    if (v > 0) { setBudget(v); write(BUDGET_KEY, String(v)); }
    setEditing(false);
  }

  return <section className="overview-card season-card" aria-labelledby="season-title">
    <header className="overview-card-head">
      <div>
        <h2 id="season-title"><TrendingUp size={19} /> Сезонность спроса</h2>
        <p className="season-sub">{today.getDate()} {MONTHS_GEN[today.getMonth()]} · {data.source || "Яндекс Вордстат"}{updated ? `, данные на ${updated.getDate()} ${MONTHS_GEN[updated.getMonth()]}` : ""}</p>
      </div>
      <div className="overview-range" role="group" aria-label="Направление">
        {data.series.map((s) => <button type="button" key={s.id} aria-pressed={s.id === series.id} onClick={() => pick(s.id)}>{s.short || s.title}</button>)}
      </div>
    </header>
    <div className="season-body">
      <div className={`season-now season-now-${lv.key}`}>
        <span className="season-eyebrow">Сейчас · {series.title}</span>
        <div className="season-big"><b>{lv.label}</b><span>{pct(now)}</span></div>
        <p>{lv.advice}.</p>
        <dl>
          <div>
            <dt>Бюджет на неделю</dt>
            <dd>≈ {rub(budget * now)}
              {editing
                ? <form className="season-budget-form" onSubmit={saveBudget}>
                    <input type="number" min={100} step={100} value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Обычный бюджет в неделю, ₽" autoFocus />
                    <button type="submit">OK</button>
                  </form>
                : <button type="button" className="season-budget-edit" onClick={() => { setDraft(String(budget)); setEditing(true); }}>от базы {rub(budget)} · изменить</button>}
            </dd>
          </div>
          <div><dt>Через 30 дней</dt><dd>{pct(in30)} · {trend}</dd></div>
        </dl>
        {series.note && <small className="season-note">{series.note}</small>}
      </div>
      <div className="season-right">
        <Chart series={series} today={today} />
        {counts && <Leads counts={counts} today={today} />}
      </div>
    </div>
  </section>;
}
