/** Выводы словами по сквозной воронке: что хорошо, что плохо и что сделать. Правила, без AI. */

export type Period = {
  cost: number | null;
  visits: number | null;       // визиты с рекламы
  actions: number | null;      // написали + заявки + заказы с рекламы
  messengers: number | null; leads: number | null; orders: number | null;
  inq: number; work: number; paid: number; revenue: number; adInq: number;
};
export type Insight = { tone: "good" | "bad" | "info"; text: string; action?: string };

const n = (v: number) => new Intl.NumberFormat("ru-RU").format(Math.round(v));
const rub = (v: number) => `${n(v)} ₽`;
const pp = (a: number, b: number) => (b ? (a / b) * 100 : 0);
const change = (cur: number, prev: number) => (prev ? Math.round(((cur - prev) / prev) * 100) : null);
const f1 = (v: number) => v.toLocaleString("ru-RU", { maximumFractionDigits: 1 });

export function buildInsights(cur: Period, prev: Period | null, daily: Array<{ date: string; visits: number; messengers: number; leads: number; orders: number; cost: number | null }>, prevLabel: string): Insight[] {
  const out: Insight[] = [];
  const cpa = cur.cost && cur.actions ? cur.cost / cur.actions : null;
  const pcpa = prev?.cost && prev.actions ? prev.cost / prev.actions : null;

  // 1. Цена действия с рекламы и её динамика.
  if (cpa != null) {
    const ch = pcpa ? change(cpa, pcpa) : null;
    if (ch != null && ch >= 15) out.push({ tone: "bad", text: `Действие с рекламы подорожало на ${ch}%: ${rub(cpa)} против ${rub(pcpa!)} ${prevLabel}.`, action: "Проверь поисковые запросы и минус-слова в кампаниях, где вырос расход." });
    else if (ch != null && ch <= -15) out.push({ tone: "good", text: `Действие с рекламы подешевело на ${-ch}%: ${rub(cpa)} против ${rub(pcpa!)} ${prevLabel}.` });
    else out.push({ tone: "info", text: `Одно действие с рекламы (написал, заявка или заказ) стоит ${rub(cpa)}${pcpa ? ` — примерно как ${prevLabel}` : ""}.` });
  } else if (cur.cost && !cur.actions) {
    out.push({ tone: "bad", text: `На рекламу ушло ${rub(cur.cost)}, а действий с рекламы нет.`, action: "Проверь, что цели Метрики срабатывают и ведут ли объявления на нужные страницы." });
  }

  // 2. Конверсия сайта: визит → действие.
  if (cur.visits && cur.actions != null) {
    const c = pp(cur.actions, cur.visits), pc = prev?.visits && prev.actions != null ? pp(prev.actions, prev.visits) : null;
    if (c < 1) out.push({ tone: "bad", text: `Из рекламы действуют только ${f1(c)}% посетителей — 99 из 100 уходят молча.`, action: "Попробуй кнопку «Написать в Telegram» на первом экране и короткую форму заявки." });
    else if (pc != null && c < pc * 0.8) out.push({ tone: "bad", text: `Сайт стал хуже превращать рекламу в обращения: ${f1(c)}% против ${f1(pc)}% ${prevLabel}.` });
    else if (pc != null && c > pc * 1.2) out.push({ tone: "good", text: `Сайт лучше превращает рекламу в обращения: ${f1(c)}% против ${f1(pc)}% ${prevLabel}.` });
  }

  // 3. Дни, когда платили, а действий не было.
  const empty = daily.filter((d) => (d.cost || 0) > 0 && d.messengers + d.leads + d.orders === 0);
  const wasted = empty.reduce((s, d) => s + (d.cost || 0), 0);
  if (empty.length >= 3 && cur.cost && wasted / cur.cost >= 0.2) out.push({ tone: "bad", text: `${empty.length} дн. реклама крутилась без единого действия — это ${rub(wasted)} (${Math.round((wasted / cur.cost) * 100)}% расхода).`, action: "Посмотри расписание показов: возможно, стоит отключать рекламу в эти дни недели." });
  const best = [...daily].sort((a, b) => (b.messengers + b.leads + b.orders) - (a.messengers + a.leads + a.orders))[0];
  if (best && best.messengers + best.leads + best.orders >= 3) {
    const day = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", weekday: "short", timeZone: "UTC" }).format(new Date(`${best.date}T12:00:00Z`));
    out.push({ tone: "info", text: `Лучший день — ${day}: ${best.messengers + best.leads + best.orders} действий с рекламы.` });
  }

  // 4. Сайт → CRM: сколько рекламных действий видно в CRM.
  if (cur.actions && cur.messengers && cur.messengers >= cur.actions * 0.6) out.push({ tone: "info", text: `${Math.round(pp(cur.messengers, cur.actions))}% людей с рекламы не оставляют заявку, а сразу пишут в Telegram или звонят — в CRM они попадают без рекламной метки.` });

  // 5. CRM: разбор и оплаты.
  if (cur.inq) {
    const w = pp(cur.work, cur.inq), pw = prev?.inq ? pp(prev.work, prev.inq) : null;
    const wait = cur.inq - cur.work;
    if (pw != null && w < pw - 10) out.push({ tone: "bad", text: `В работу берём меньше: ${Math.round(w)}% обращений против ${Math.round(pw)}% ${prevLabel}.` });
    else if (pw != null && w > pw + 10) out.push({ tone: "good", text: `В работу берём больше: ${Math.round(w)}% обращений против ${Math.round(pw)}% ${prevLabel}.` });
    if (wait >= 5 && wait / cur.inq > 0.4) out.push({ tone: "bad", text: `${wait} обращений так и не дошли до работы.`, action: "Разбери «Сообщения»: отметь «В работу» или «Не квал», чтобы не терять живых клиентов." });
  }
  if (prev) {
    const ch = change(cur.revenue, prev.revenue);
    if (ch != null && Math.abs(ch) >= 10) out.push({ tone: ch > 0 ? "good" : "bad", text: `Денег пришло ${ch > 0 ? "больше" : "меньше"} на ${Math.abs(ch)}%: ${rub(cur.revenue)} против ${rub(prev.revenue)} ${prevLabel}.` });
  }
  if (cur.cost && cur.revenue) {
    const drr = pp(cur.cost, cur.revenue);
    if (drr > 30) out.push({ tone: "bad", text: `Реклама съедает ${Math.round(drr)}% выручки — дорого для штучного производства.` });
    else if (drr < 10) out.push({ tone: "good", text: `Реклама стоит всего ${f1(drr)}% от выручки — можно пробовать увеличить бюджет на кампаниях с дешёвыми действиями.` });
  }
  const order: Record<Insight["tone"], number> = { bad: 0, good: 1, info: 2 };
  return out.sort((a, b) => order[a.tone] - order[b.tone]).slice(0, 6);
}

export { change };
