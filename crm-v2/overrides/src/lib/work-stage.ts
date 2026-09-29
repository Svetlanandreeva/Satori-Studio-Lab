import { sqlite } from "@/db";

export const WORK_STAGE_KEY = "inbox_work_stage_id";
type StageRow = { id: string; name: string };

/** Открытые этапы по порядку (без песочницы/спама). */
export function openStages(): StageRow[] {
  return sqlite.prepare(`SELECT id, name FROM pipeline_stages WHERE COALESCE(is_won,0)=0 AND COALESCE(is_lost,0)=0
    AND lower(name) NOT LIKE '%песочн%' AND lower(name) NOT LIKE '%спам%' ORDER BY "order"`).all() as StageRow[];
}

/**
 * Куда попадает клиент по кнопке «В работу» в «Сообщениях».
 * Выбирается в Настройках → Этапы воронки; по умолчанию — этап сразу после «Новый запрос».
 */
export function workStage() {
  const open = openStages();
  const saved = (sqlite.prepare("SELECT value FROM crm_settings WHERE key=?").get(WORK_STAGE_KEY) as { value?: string } | undefined)?.value;
  const chosen = saved ? open.find((s) => s.id === saved) : undefined;
  return { first: open[0], work: chosen || open[1] || open[0], savedId: chosen?.id || null };
}

export function setWorkStage(stageId: string | null) {
  if (!stageId) { sqlite.prepare("DELETE FROM crm_settings WHERE key=?").run(WORK_STAGE_KEY); return; }
  if (!openStages().some((s) => s.id === stageId)) throw new Error("Этап не найден или закрытый");
  sqlite.prepare("INSERT INTO crm_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(WORK_STAGE_KEY, stageId);
}
