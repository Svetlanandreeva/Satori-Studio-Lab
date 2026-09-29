import { sqlite } from "@/db";

/** Готовые шаблоны студии. Добавляются один раз; дальше их можно менять в «Контроль → Шаблоны». */
export const UNQUAL_TEMPLATE_TITLE = "Отказ — не наш профиль";

export const DEFAULT_TEMPLATES: Array<{ title: string; body: string }> = [
  { title: "Уточнение деталей", body: "{имя}, здравствуйте! Чтобы точно посчитать стоимость и сроки, подскажите, пожалуйста:\n— размеры (диаметр/высота) и количество;\n— где будет висеть или стоять светильник;\n— цвет и материал;\n— к какому сроку нужно.\nЕсли есть фото интерьера — пришлите, это очень поможет." },
  { title: "Запрос референса", body: "{имя}, пришлите, пожалуйста, референсы — фото или ссылки на светильники, которые вам нравятся, и фото места, куда он пойдёт. По ним быстрее подберём форму и посчитаем стоимость." },
  { title: "Вернёмся с расчётом", body: "{имя}, спасибо, всё записали! Согласуем детали с мастерами и вернёмся к вам с расчётом стоимости и сроков в течение 1–2 рабочих дней." },
  { title: "Уточнение статуса", body: "{имя}, здравствуйте! Подскажите, пожалуйста, актуален ли ещё ваш запрос? Если планы изменились — тоже напишите, чтобы мы не беспокоили вас лишний раз." },
  { title: "Напоминание о нас", body: "{имя}, здравствуйте! Это студия SATORI — делаем дизайнерские светильники на заказ. Вы интересовались у нас светильником: если вопрос ещё актуален, с радостью продолжим. Когда вам удобно обсудить?" },
  { title: UNQUAL_TEMPLATE_TITLE, body: "{имя}, здравствуйте! Спасибо, что обратились в SATORI. К сожалению, такие заказы мы не выполняем: мы делаем авторские светильники небольшими партиями, а не серийную стандартную продукцию. Надеемся, вы быстро найдёте подходящего производителя, а если понадобится дизайнерский свет — будем рады помочь." },
];

const FLAG = "default_templates_v1";

export function ensureDefaultTemplates() {
  try {
    const done = sqlite.prepare("SELECT value FROM crm_settings WHERE key=?").get(FLAG) as { value?: string } | undefined;
    if (done?.value) return;
    const existing = new Set((sqlite.prepare("SELECT lower(title) AS t FROM message_templates").all() as Array<{ t: string }>).map((r) => r.t));
    const max = (sqlite.prepare("SELECT COALESCE(MAX(sort_order),0) AS m FROM message_templates").get() as { m: number }).m || 0;
    const now = Date.now();
    DEFAULT_TEMPLATES.forEach((t, i) => {
      if (existing.has(t.title.toLowerCase())) return;
      sqlite.prepare("INSERT INTO message_templates(id,title,channel,body,sort_order,created_at,updated_at) VALUES(?,?,?,?,?,?,?)")
        .run(crypto.randomUUID(), t.title, "all", t.body, max + i + 1, now, now);
    });
    sqlite.prepare("INSERT INTO crm_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(FLAG, new Date().toISOString());
  } catch (error) { console.error("Default templates seed failed", error); }
}
