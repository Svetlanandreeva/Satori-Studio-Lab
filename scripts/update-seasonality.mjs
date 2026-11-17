// Обновляет файлы сезонности свежими цифрами Вордстата через Yandex Search API (Yandex Cloud).
// Старый api.wordstat.yandex.net закрыт: Вордстат API теперь живёт в Yandex Cloud.
// Нужны секреты репозитория:
//   YANDEX_SEARCH_API_KEY — API-ключ сервисного аккаунта с ролью search-api.webSearch.user (scope yc.search-api.execute);
//   YANDEX_FOLDER_ID      — ID каталога в Yandex Cloud.
// Без них ничего не меняет и завершается без ошибки. 4 запроса в месяц стоят копейки.
import { readFileSync, writeFileSync } from "node:fs";
import { seasonalIndex } from "./seasonality-lib.mjs";

const FILE = new URL("../crm/public/seasonality-data.json", import.meta.url);
// копия для дашборда админки на satorilabural.ru
const SITE_FILE = new URL("../public/seasonality-data.json", import.meta.url);
const API_KEY = process.env.YANDEX_SEARCH_API_KEY;
const FOLDER_ID = process.env.YANDEX_FOLDER_ID;
const API = "https://searchapi.api.cloud.yandex.net/v2/wordstat/dynamics";

if (!API_KEY || !FOLDER_ID) {
  console.log("YANDEX_SEARCH_API_KEY или YANDEX_FOLDER_ID не заданы — данные сезонности оставлены как есть.");
  process.exit(0);
}

const pad = (n) => String(n).padStart(2, "0");
const now = new Date();
// последний полный месяц и 36 месяцев назад от него
const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 35, 1));
const fromDate = `${start.getUTCFullYear()}-${pad(start.getUTCMonth() + 1)}-01`;
const toDate = `${end.getUTCFullYear()}-${pad(end.getUTCMonth() + 1)}-${pad(end.getUTCDate())}`;

async function dynamics(phrase) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Api-Key ${API_KEY}` },
      body: JSON.stringify({ phrase, period: "PERIOD_MONTHLY", fromDate: `${fromDate}T00:00:00Z`, toDate: `${toDate}T23:59:59Z`, folderId: FOLDER_ID }),
    });
    if (res.ok) {
      const body = await res.json();
      const rows = body.results || body.dynamics || [];
      return new Map(rows.map((d) => [String(d.date).slice(0, 7), Number(d.count) || 0]));
    }
    const text = await res.text();
    if ((res.status === 429 || res.status >= 500) && attempt < 3) { await new Promise((r) => setTimeout(r, 2000 * attempt)); continue; }
    throw new Error(`Search API ответил ${res.status} на «${phrase}»: ${text.slice(0, 300)}`);
  }
}

const data = JSON.parse(readFileSync(FILE, "utf8"));
for (const series of data.series) {
  const maps = [];
  for (const phrase of series.phrases) maps.push(await dynamics(phrase));
  const months = [...maps[0].keys()].sort();
  const monthly = months.map((m) => maps.reduce((sum, map) => sum + (map.get(m) || 0), 0));
  if (months.length < 12) throw new Error(`Мало данных по «${series.title}»: ${months.length} мес.`);
  series.months = months;
  series.monthly = monthly;
  series.index = seasonalIndex(months, monthly);
  console.log(`${series.title}: ${series.index.join(" ")}`);
}
data.updated = now.toISOString().slice(0, 10);
data.period = [data.series[0].months[0], data.series[0].months.at(-1)];
writeFileSync(FILE, JSON.stringify(data, null, 1) + "\n");
writeFileSync(SITE_FILE, JSON.stringify(data, null, 1) + "\n");
console.log(`Готово: ${fromDate} — ${toDate}`);
