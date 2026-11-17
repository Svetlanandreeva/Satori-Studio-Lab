// Обновляет crm/public/seasonality-data.json свежими цифрами из API Вордстата.
// Запускается GitHub Action раз в месяц. Нужен секрет WORDSTAT_TOKEN (OAuth-токен с доступом wordstat:api).
// Без токена ничего не меняет и завершается без ошибки.
import { readFileSync, writeFileSync } from "node:fs";
import { seasonalIndex } from "./seasonality-lib.mjs";

const FILE = new URL("../crm/public/seasonality-data.json", import.meta.url);
const TOKEN = process.env.WORDSTAT_TOKEN;
const API = "https://api.wordstat.yandex.net/v1/dynamics";

if (!TOKEN) {
  console.log("WORDSTAT_TOKEN не задан — данные сезонности оставлены как есть.");
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
      headers: { "Content-Type": "application/json;charset=utf-8", Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ phrase, period: "monthly", fromDate, toDate }),
    });
    if (res.ok) {
      const body = await res.json();
      return new Map((body.dynamics || []).map((d) => [String(d.date).slice(0, 7), Number(d.count) || 0]));
    }
    const text = await res.text();
    if (res.status === 429 && attempt < 3) { await new Promise((r) => setTimeout(r, 2000 * attempt)); continue; }
    throw new Error(`Вордстат ответил ${res.status} на «${phrase}»: ${text.slice(0, 300)}`);
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
console.log(`Готово: ${fromDate} — ${toDate}`);
