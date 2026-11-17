// Сезонность спроса на дашборде CRM (вкладка «Воронка», под сводкой проектов).
// Данные: /seasonality-data.json — индексы по месяцам из Яндекс Вордстата.
// Файл раз в месяц обновляет GitHub Action «Update CRM seasonality» (нужны секреты YANDEX_SEARCH_API_KEY и YANDEX_FOLDER_ID).
// Дневная кривая — плавная интерполяция месячных индексов, поэтому «сегодня» сдвигается каждый день.
// Заявки по дням берутся из самой CRM.

const MONTHS = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const MONTHS_GEN = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const DAY = 86400000;
const BUDGET_KEY = "satori_season_budget";
const SERIES_KEY = "satori_season_series";
const TOKEN_KEY = "satori_crm_token";

const FALLBACK = {
  updated: "2026-11-17",
  source: "Яндекс Вордстат, вся Россия",
  series: [
    { id: "shop", title: "Готовые светильники", short: "Готовые", index: [1.12, 0.89, 0.87, 0.69, 0.77, 0.51, 0.75, 1.11, 1.13, 1.48, 1.22, 1.47] },
    { id: "custom", title: "Свет на заказ", short: "На заказ", index: [1, 0.94, 0.93, 0.84, 1.11, 0.86, 1.06, 1, 0.99, 1, 1.05, 1.22] },
    { id: "horeca", title: "Рестораны и отели", short: "Рестораны", note: "запросов мало — это ориентир", index: [0.94, 0.88, 0.92, 0.98, 1.02, 0.89, 1, 1.12, 1, 1.06, 1.22, 0.97] },
  ],
};

const readStore = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const writeStore = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

const state = {
  data: FALLBACK,
  seriesId: readStore(SERIES_KEY) || "shop",
  budget: Number(readStore(BUDGET_KEY)) || 2000,
  leads: null, // 30 чисел или null, если CRM не отдала данные
  editingBudget: false,
};

const esc = (v = "") => String(v).replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c]));
const pct = (v) => `${v >= 1 ? "+" : "−"}${Math.abs(Math.round((v - 1) * 100))}%`;
const rub = (n) => `${new Intl.NumberFormat("ru-RU").format(Math.round(n / 100) * 100)} ₽`;
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

// Индекс на конкретный день: косинусная интерполяция между серединами месяцев.
function dailyIndex(index, date) {
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

function level(v) {
  if (v >= 1.1) return { key: "high", label: "Сезон", advice: "Спрос выше обычного — добавляйте бюджет на рекламу" };
  if (v <= 0.9) return { key: "low", label: "Спад", advice: "Спрос ниже обычного — реклама на минимуме, время для контента и SEO" };
  return { key: "mid", label: "Норма", advice: "Обычный спрос — обычный бюджет" };
}

function currentSeries() {
  return state.data.series.find((s) => s.id === state.seriesId) || state.data.series[0];
}

// Кривая на 12 месяцев: 4 месяца назад — сегодня — 8 месяцев вперёд.
function chartModel(series, today) {
  const from = new Date(today.getFullYear(), today.getMonth() - 4, 1);
  const to = new Date(today.getFullYear(), today.getMonth() + 8, 1);
  const days = Math.round((to - from) / DAY);
  const pts = [];
  for (let i = 0; i <= days; i += 2) pts.push({ x: i / days, v: dailyIndex(series.index, new Date(from.getTime() + i * DAY)) });
  const months = [];
  for (let k = 0; k < 12; k++) {
    const d = new Date(from.getFullYear(), from.getMonth() + k, 1);
    months.push({ x: (d - from) / DAY / days, label: MONTHS[d.getMonth()], now: d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear() });
  }
  return { pts, months, todayX: (today - from) / DAY / days, todayV: dailyIndex(series.index, today) };
}

function chartSvg(model) {
  const W = 720, H = 200, top = 16, bottom = 12;
  const vs = model.pts.map((p) => p.v);
  const hi = Math.max(1.25, ...vs) + 0.05;
  const lo = Math.min(0.75, ...vs) - 0.05;
  const y = (v) => top + (1 - (v - lo) / (hi - lo)) * (H - top - bottom);
  const line = model.pts.map((p, i) => `${i ? "L" : "M"}${(p.x * W).toFixed(1)},${y(p.v).toFixed(1)}`).join("");
  const yHigh = y(1.1), yLow = y(0.9), tx = model.todayX * W;
  return `<svg class="season-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
    <defs>
      <linearGradient id="season-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#101217" stop-opacity=".14"/><stop offset="1" stop-color="#101217" stop-opacity="0"/></linearGradient>
      <clipPath id="season-clip-high"><rect x="0" y="0" width="${W}" height="${yHigh}"/></clipPath>
      <clipPath id="season-clip-low"><rect x="0" y="${yLow}" width="${W}" height="${H - yLow}"/></clipPath>
    </defs>
    <rect x="0" y="0" width="${W}" height="${yHigh}" class="season-zone-high"/>
    <rect x="0" y="${yLow}" width="${W}" height="${H - yLow}" class="season-zone-low"/>
    <line x1="0" x2="${W}" y1="${y(1)}" y2="${y(1)}" class="season-base" vector-effect="non-scaling-stroke"/>
    <path d="${line}L${W},${H}L0,${H}Z" fill="url(#season-fill)"/>
    <rect x="0" y="0" width="${tx}" height="${H}" class="season-past"/>
    <path d="${line}" class="season-line" vector-effect="non-scaling-stroke"/>
    <path d="${line}" class="season-line-high" clip-path="url(#season-clip-high)" vector-effect="non-scaling-stroke"/>
    <path d="${line}" class="season-line-low" clip-path="url(#season-clip-low)" vector-effect="non-scaling-stroke"/>
    <line x1="${tx}" x2="${tx}" y1="0" y2="${H}" class="season-today" vector-effect="non-scaling-stroke"/>
  </svg><span class="season-dot" style="left:${(model.todayX * 100).toFixed(2)}%;top:${((y(model.todayV) / H) * 100).toFixed(2)}%"></span>`;
}

function leadsStrip(today) {
  if (!state.leads) return "";
  const max = Math.max(1, ...state.leads);
  const total = state.leads.reduce((a, b) => a + b, 0);
  const bars = state.leads.map((n, i) => {
    const d = new Date(today.getTime() - (29 - i) * DAY);
    const h = n ? Math.max(18, Math.round((n / max) * 100)) : 6;
    return `<li title="${d.getDate()} ${MONTHS_GEN[d.getMonth()]}: ${n}"><span class="${n ? "" : "season-zero"}" style="height:${h}%"></span></li>`;
  }).join("");
  const first = new Date(today.getTime() - 29 * DAY);
  return `<div class="season-leads">
    <div class="season-leads-head"><b>Заявки и заказы по дням</b><span>${total} за 30 дней</span></div>
    <ol class="season-leads-bars" aria-label="Заявки по дням за 30 дней">${bars}</ol>
    <div class="season-leads-axis"><span>${first.getDate()} ${MONTHS_GEN[first.getMonth()]}</span><span>сегодня</span></div>
  </div>`;
}

function cardHtml() {
  const today = startOfDay(new Date());
  const series = currentSeries();
  const now = dailyIndex(series.index, today);
  const in30 = dailyIndex(series.index, new Date(today.getTime() + 30 * DAY));
  const lv = level(now);
  const trend = in30 - now > 0.04 ? "растёт" : in30 - now < -0.04 ? "падает" : "ровно";
  const model = chartModel(series, today);
  const tabs = state.data.series.map((s) => `<button type="button" data-season-series="${esc(s.id)}" class="${s.id === series.id ? "active" : ""}" aria-pressed="${s.id === series.id}">${esc(s.short || s.title)}</button>`).join("");
  const months = model.months.map((m) => `<span class="${m.now ? "season-month-now" : ""}" style="left:${(m.x * 100).toFixed(2)}%">${m.label}</span>`).join("");
  const budget = state.editingBudget
    ? `<form class="season-budget-form" data-season-budget-form><input type="number" min="100" step="100" value="${state.budget}" aria-label="Обычный бюджет в неделю, ₽"><button type="submit">OK</button></form>`
    : `<button type="button" class="season-budget-edit" data-season-budget>от базы ${rub(state.budget)} · изменить</button>`;
  const updated = state.data.updated ? new Date(`${state.data.updated}T00:00:00`) : null;
  return `<section class="season-card" aria-labelledby="season-title">
    <div class="season-top">
      <div><h2 id="season-title">Сезонность спроса</h2><p>${today.getDate()} ${MONTHS_GEN[today.getMonth()]} · ${esc(state.data.source || "Яндекс Вордстат")}${updated ? `, данные на ${updated.getDate()} ${MONTHS_GEN[updated.getMonth()]}` : ""}</p></div>
      <div class="season-tabs" role="group" aria-label="Направление">${tabs}</div>
    </div>
    <div class="season-body">
      <div class="season-now season-now-${lv.key}">
        <span class="season-eyebrow">Сейчас · ${esc(series.title)}</span>
        <div class="season-big"><b>${lv.label}</b><span>${pct(now)}</span></div>
        <p>${lv.advice}.</p>
        <dl>
          <div><dt>Бюджет на неделю</dt><dd>≈ ${rub(state.budget * now)}${budget}</dd></div>
          <div><dt>Через 30 дней</dt><dd>${pct(in30)} · ${trend}</dd></div>
        </dl>
        ${series.note ? `<small class="season-note">${esc(series.note)}</small>` : ""}
      </div>
      <div class="season-chart">
        <div class="season-plot">${chartSvg(model)}<span class="season-today-label" style="left:${(model.todayX * 100).toFixed(2)}%">сегодня</span></div>
        <div class="season-months">${months}</div>
        <div class="season-legend"><span class="season-key-high">сезон</span><span class="season-key-mid">норма</span><span class="season-key-low">спад</span><span class="season-key-base">пунктир — обычный уровень</span></div>
        ${leadsStrip(today)}
      </div>
    </div>
  </section>`;
}

const STYLE = `
.season-card{margin:0 0 26px;padding:clamp(16px,2vw,25px);background:#ffffffdf;border:1px solid #fff;border-radius:24px;box-shadow:var(--shadow,0 16px 45px #252a3510)}
.season-top{display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:12px 20px}
.season-top h2{margin:0;font-size:17px;font-weight:650;letter-spacing:-.025em;color:var(--ink,#101217)}
.season-top p{margin:4px 0 0;font-size:12px;color:var(--muted,#555b66)}
.season-tabs{display:flex;gap:4px;padding:4px;background:#eef0f3;border-radius:999px}
.season-tabs button{border:0;background:transparent;color:#424955;font:inherit;font-size:12px;font-weight:600;min-height:32px;padding:6px 13px;border-radius:999px;cursor:pointer}
.season-tabs button:hover{color:var(--ink,#101217);background:#e2e5ea}
.season-tabs button.active{background:var(--dark,#101216);color:#fff}
.season-body{display:grid;grid-template-columns:minmax(220px,.8fr) minmax(0,2fr);gap:13px;margin-top:16px}
.season-now{display:flex;flex-direction:column;gap:10px;padding:clamp(14px,1.8vw,22px);border-radius:20px;background:#15171c;color:#cbd1da}
.season-eyebrow{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#8e96a3}
.season-big{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.season-big b{color:#fff;font-size:clamp(26px,2.8vw,36px);letter-spacing:-.05em;line-height:1}
.season-big span{font-size:14px;font-weight:650;padding:4px 10px;border-radius:999px;background:#ffffff1f;color:#fff;font-variant-numeric:tabular-nums}
.season-now-high .season-big span{background:var(--green,#356454)}
.season-now-low .season-big span{background:var(--red,#a12e49)}
.season-now p{margin:0;font-size:13px;line-height:1.45}
.season-now dl{display:grid;gap:10px;margin:auto 0 0;padding-top:12px;border-top:1px solid #ffffff1f}
.season-now dl div{display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap}
.season-now dt{font-size:12px;color:#8e96a3}
.season-now dd{margin:0;color:#fff;font-size:14px;font-weight:600;font-variant-numeric:tabular-nums;text-align:right}
.season-budget-edit{display:block;margin:2px 0 0 auto;border:0;background:none;color:#8e96a3;font:inherit;font-size:11px;font-weight:400;padding:0;cursor:pointer;text-decoration:underline;text-underline-offset:2px}
.season-budget-edit:hover{color:#fff}
.season-budget-form{display:flex;gap:4px;justify-content:flex-end;margin-top:6px}
.season-budget-form input{width:90px;padding:4px 7px;border-radius:9px;border:1px solid #ffffff33;background:#ffffff14;color:#fff;font:inherit;font-size:12px}
.season-budget-form button{border:0;border-radius:9px;background:#fff;color:#101217;font:inherit;font-size:11px;font-weight:700;padding:4px 9px;cursor:pointer}
.season-note{font-size:11px;color:#8e96a3}
.season-chart{min-width:0;padding:clamp(12px,1.6vw,18px);border-radius:20px;background:#f6f7f9;border:1px solid #e6e9ee}
.season-plot{position:relative;height:clamp(150px,18vw,200px)}
.season-svg{display:block;width:100%;height:100%}
.season-zone-high{fill:#356454;opacity:.09}
.season-zone-low{fill:#a12e49;opacity:.07}
.season-base{stroke:#9aa1ad;stroke-width:1;stroke-dasharray:3 4}
.season-past{fill:#f6f7f9;opacity:.55}
.season-line{fill:none;stroke:#303641;stroke-width:2.4;stroke-linejoin:round}
.season-line-high{fill:none;stroke:var(--green,#356454);stroke-width:2.8}
.season-line-low{fill:none;stroke:var(--red,#a12e49);stroke-width:2.8}
.season-today{stroke:#101217;stroke-width:1.2}
.season-dot{position:absolute;width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:50%;background:#101217;border:2.5px solid #fff;box-shadow:0 2px 6px #10121740}
.season-today-label{position:absolute;top:-2px;transform:translateX(6px);font-size:11px;font-weight:700;color:#101217;background:#f6f7f9;padding:0 4px;border-radius:6px}
.season-months{position:relative;height:18px;margin-top:6px}
.season-months span{position:absolute;transform:translateX(-2px);font-size:11px;color:#80869a}
.season-months .season-month-now{color:#101217;font-weight:700}
.season-legend{display:flex;flex-wrap:wrap;gap:6px 14px;margin-top:6px;font-size:11px;color:var(--muted,#555b66)}
.season-legend span::before{content:"";display:inline-block;width:12px;height:3px;border-radius:2px;margin-right:6px;vertical-align:middle;background:#303641}
.season-legend .season-key-high::before{background:var(--green,#356454)}
.season-legend .season-key-low::before{background:var(--red,#a12e49)}
.season-legend .season-key-base::before{background:none;border-top:1px dashed #9aa1ad;height:0}
.season-leads{margin-top:14px;padding-top:12px;border-top:1px solid #e3e6eb}
.season-leads-head{display:flex;justify-content:space-between;gap:10px;font-size:12px;color:var(--muted,#555b66)}
.season-leads-head b{color:var(--ink,#101217);font-weight:650}
.season-leads-bars{display:grid;grid-template-columns:repeat(30,1fr);gap:3px;height:46px;margin:8px 0 4px;padding:0;list-style:none;align-items:end}
.season-leads-bars li{height:100%;display:flex;align-items:flex-end}
.season-leads-bars span{display:block;width:100%;border-radius:3px;background:#303641}
.season-leads-bars span.season-zero{background:#d9dde4}
.season-leads-axis{display:flex;justify-content:space-between;font-size:10px;color:#80869a}
@media (max-width:980px){.season-body{grid-template-columns:minmax(0,1fr)}}
@media (max-width:560px){.season-months span:nth-child(even){display:none}.season-tabs{width:100%}.season-tabs button{flex:1}}
`;

function ensureStyle() {
  if (document.getElementById("season-style")) return;
  const style = document.createElement("style");
  style.id = "season-style";
  style.textContent = STYLE;
  document.head.appendChild(style);
}

const root = document.querySelector("#app");

function bind(card) {
  card.addEventListener("click", (e) => {
    const tab = e.target.closest("[data-season-series]");
    if (tab) {
      state.seriesId = tab.dataset.seasonSeries;
      writeStore(SERIES_KEY, state.seriesId);
      redraw();
      return;
    }
    if (e.target.closest("[data-season-budget]")) { state.editingBudget = true; redraw(); }
  });
  card.addEventListener("submit", (e) => {
    if (!e.target.matches("[data-season-budget-form]")) return;
    e.preventDefault();
    const v = Number(e.target.querySelector("input").value);
    if (v > 0) { state.budget = v; writeStore(BUDGET_KEY, String(v)); }
    state.editingBudget = false;
    redraw();
  });
}

function redraw() {
  const old = root?.querySelector(".season-card");
  if (!old) { place(); return; }
  const tmp = document.createElement("div");
  tmp.innerHTML = cardHtml();
  const next = tmp.firstElementChild;
  old.replaceWith(next);
  bind(next);
  next.querySelector(".season-budget-form input")?.focus();
}

function place() {
  const overview = root?.querySelector(".project-overview");
  if (!overview || root.querySelector(".season-card")) return;
  ensureStyle();
  overview.insertAdjacentHTML("afterend", cardHtml());
  bind(root.querySelector(".season-card"));
}

async function loadData() {
  try {
    const res = await fetch("/seasonality-data.json", { cache: "no-cache" });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.series) && data.series.length && data.series.every((s) => Array.isArray(s.index) && s.index.length === 12)) state.data = data;
    }
  } catch {}
  try {
    const token = readStore(TOKEN_KEY) || "";
    const res = await fetch("/api/bootstrap", { headers: token ? { Authorization: `Bearer ${token}` } : {}, credentials: "same-origin" });
    if (res.ok) {
      const payload = await res.json();
      const today = startOfDay(new Date()).getTime();
      const counts = Array(30).fill(0);
      for (const d of payload.deals || []) {
        if (d.isSpam || !d.createdAt || (d.source !== "lead" && d.source !== "web")) continue;
        const ago = Math.round((today - startOfDay(new Date(d.createdAt)).getTime()) / DAY);
        if (ago >= 0 && ago < 30) counts[29 - ago] += 1;
      }
      state.leads = counts;
    }
  } catch {}
  redraw();
}

if (root) {
  // Реагируем только на перерисовку корня CRM; изменения внутри карточки сюда не попадают.
  new MutationObserver(place).observe(root, { childList: true, subtree: false });
  place();
  loadData();
}
