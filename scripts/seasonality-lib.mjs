// Общая логика расчёта сезонности: используется скриптом обновления и тестом.
// Индекс месяца = спрос в месяце / средний спрос за окружающие 12 месяцев (убирает общий тренд рынка),
// усреднённый по годам и нормированный так, чтобы среднее по 12 месяцам было 1.00.
export function seasonalIndex(months, values) {
  const n = values.length;
  if (n < 12) throw new Error("Нужно минимум 12 месяцев данных");
  const ratios = Array.from({ length: 12 }, () => []);
  for (let i = 0; i < n; i++) {
    const start = Math.max(0, Math.min(i - 6, n - 12));
    const base = values.slice(start, start + 12).reduce((a, b) => a + b, 0) / 12;
    if (base > 0) ratios[Number(months[i].slice(5, 7)) - 1].push(values[i] / base);
  }
  const idx = ratios.map((r) => (r.length ? r.reduce((a, b) => a + b, 0) / r.length : 1));
  const avg = idx.reduce((a, b) => a + b, 0) / 12;
  return idx.map((v) => Math.round((v / avg) * 100) / 100);
}
