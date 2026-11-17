// Сезонность спроса на дашборде CRM (вкладка «Воронка»).
// Данные — Яндекс Вордстат, вся Россия, ноябрь 2024 — сентябрь 2026.
// Индекс месяца = спрос в этом месяце / средний спрос за окружающие 12 месяцев
// (так общий спад рынка не путается с сезоном), усреднён по годам. 1.00 — обычный месяц.
// Обновить: пересчитать INDEX по свежим цифрам Вордстата и поменять UPDATED.

const UPDATED = "17.11.2026";
const MONTHS = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const MONTHS_FULL = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
const MONTHS_IN = ["январе", "феврале", "марте", "апреле", "мае", "июне", "июле", "августе", "сентябре", "октябре", "ноябре", "декабре"];

const SERIES = [
  {
    id: "shop",
    title: "Готовые светильники",
    query: "«дизайнерская настольная лампа»",
    index: [1.12, 0.89, 0.87, 0.69, 0.77, 0.51, 0.75, 1.11, 1.13, 1.48, 1.22, 1.47],
  },
  {
    id: "custom",
    title: "Свет на заказ",
    query: "«светильник на заказ» + «люстра на заказ»",
    index: [1.0, 0.94, 0.93, 0.84, 1.11, 0.86, 1.06, 1.0, 0.99, 1.0, 1.05, 1.22],
  },
  {
    id: "horeca",
    title: "Рестораны и отели",
    query: "«светильники для ресторана» — запросов мало, это ориентир",
    index: [0.94, 0.88, 0.92, 0.98, 1.02, 0.89, 1.0, 1.12, 1.0, 1.06, 1.22, 0.97],
  },
];

function level(value) {
  if (value >= 1.1) return { key: "high", label: "Сезон", advice: "Добавить бюджет на рекламу" };
  if (value <= 0.9) return { key: "low", label: "Спад", advice: "Реклама на минимуме — время для контента и SEO" };
  return { key: "mid", label: "Норма", advice: "Обычный бюджет" };
}

const pct = (v) => `${v >= 1 ? "+" : "−"}${Math.abs(Math.round((v - 1) * 100))}%`;

function seriesBlock(series, month) {
  const now = series.index[month];
  const next = series.index[(month + 1) % 12];
  const lv = level(now);
  const nextLv = level(next);
  const hi = Math.max(...series.index);
  const lo = Math.min(...series.index) - 0.1;
  const bars = series.index
    .map((v, i) => {
      const l = level(v).key;
      const h = Math.round(12 + 88 * ((v - lo) / (hi - lo)));
      return `<li class="season-bar season-${l}${i === month ? " season-now" : ""}" title="${MONTHS_FULL[i]}: ${pct(v)} к обычному месяцу"><span style="height:${h}%"></span><small>${MONTHS[i]}</small></li>`;
    })
    .join("");
  return `<div class="season-series">
    <div class="season-head">
      <b>${series.title}</b>
      <span class="season-badge season-${lv.key}">${lv.label} · ${pct(now)}</span>
    </div>
    <p class="season-advice">${lv.advice}. В ${MONTHS_IN[(month + 1) % 12]}: ${nextLv.label.toLowerCase()} (${pct(next)}).</p>
    <ol class="season-bars" aria-label="Спрос по месяцам: ${series.title}">${bars}</ol>
    <small class="season-query">Запрос ${series.query}</small>
  </div>`;
}

function cardHtml() {
  const month = new Date().getMonth();
  return `<section class="season-card" aria-labelledby="season-title">
    <div class="season-top">
      <h2 id="season-title">Сезонность спроса — ${MONTHS_FULL[month]}</h2>
      <small>Яндекс Вордстат, вся Россия, данные на ${UPDATED}. % — отклонение от обычного месяца без учёта общего спада рынка.</small>
    </div>
    <div class="season-grid">${SERIES.map((s) => seriesBlock(s, month)).join("")}</div>
  </section>`;
}

const STYLE = `
.season-card{background:#fff;border:1px solid #e3e5ea;border-radius:16px;padding:18px 20px;margin:0 0 22px}
.season-top h2{margin:0;font-size:17px;font-weight:650;letter-spacing:-.025em}
.season-top small{display:block;margin-top:4px;color:#6b7080;font-size:12px}
.season-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:18px 26px;margin-top:16px}
.season-head{display:flex;align-items:center;justify-content:space-between;gap:10px}
.season-head b{font-size:14px}
.season-badge{font-size:12px;font-weight:600;padding:3px 9px;border-radius:20px;white-space:nowrap}
.season-badge.season-high{background:#1f7a3a;color:#fff}
.season-badge.season-mid{background:#eceef2;color:#2a2e38}
.season-badge.season-low{background:#f3e3e1;color:#8a2a1f}
.season-advice{margin:8px 0 10px;font-size:13px;color:#2a2e38}
.season-bars{display:grid;grid-template-columns:repeat(12,1fr);gap:4px;list-style:none;margin:0;padding:0;height:86px;align-items:end}
.season-bar{display:flex;flex-direction:column;justify-content:flex-end;align-items:center;height:100%;gap:4px}
.season-bar span{display:block;width:100%;border-radius:4px 4px 2px 2px;background:#c9ccd3}
.season-bar.season-high span{background:#3d9a58}
.season-bar.season-low span{background:#e0b4ae}
.season-bar.season-now span{outline:2px solid #12141a;outline-offset:1px}
.season-bar small{font-size:10px;color:#80869a;line-height:1}
.season-bar.season-now small{color:#12141a;font-weight:700}
.season-query{display:block;margin-top:8px;font-size:11px;color:#80869a}
`;

function ensureStyle() {
  if (document.getElementById("season-style")) return;
  const style = document.createElement("style");
  style.id = "season-style";
  style.textContent = STYLE;
  document.head.appendChild(style);
}

const root = document.querySelector("#app");

function place() {
  const overview = root?.querySelector(".project-overview");
  if (!overview || root.querySelector(".season-card")) return;
  ensureStyle();
  overview.insertAdjacentHTML("afterend", cardHtml());
}

if (root) {
  // Вставляем только если карточки нет — сама вставка повторно не срабатывает.
  new MutationObserver(place).observe(root, { childList: true, subtree: false });
  place();
}
