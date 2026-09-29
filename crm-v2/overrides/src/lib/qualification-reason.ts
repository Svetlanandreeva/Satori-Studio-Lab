import { sqlite } from "@/db";

/** Причина «не квал» у контакта: «не наш профиль», «спам»… — для учёта и Сводки. */
let ready = false;
export function ensureReasonColumn() {
  if (ready) return;
  try { sqlite.exec("ALTER TABLE contacts ADD COLUMN qualification_reason TEXT"); } catch { /* уже есть */ }
  ready = true;
}

export const UNQUAL_REASONS = ["Не наш профиль", "Серийное / массовое производство", "Не целевой запрос", "Спам / реклама"] as const;
