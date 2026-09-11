export type LeadQualification =
  | "new"
  | "working"
  | "qualified"
  | "unqualified"
  | "not_target"
  | "spam"
  | "duplicate";

export const SPAM_STAGE_NAME = "Песочница / Спам";

export const LEAD_QUALIFICATION_OPTIONS: Array<{
  value: LeadQualification;
  label: string;
  description: string;
}> = [
  { value: "new", label: "Новый", description: "Лид ещё не разобран" },
  { value: "working", label: "В работе", description: "Контакт проверяется или ведётся диалог" },
  { value: "qualified", label: "Квалифицирован", description: "Есть подходящий запрос и потенциал сделки" },
  { value: "unqualified", label: "Не квалифицирован", description: "Не проходит квалификацию" },
  { value: "not_target", label: "Не целевой", description: "Не относится к целевой аудитории Satori" },
  { value: "spam", label: "Спам", description: "Мусорный или нежелательный лид — уходит в Песочницу" },
  { value: "duplicate", label: "Дубль", description: "Повтор существующего клиента или лида" },
];

export const LEAD_QUALIFICATION_LABELS: Record<LeadQualification, string> =
  Object.fromEntries(
    LEAD_QUALIFICATION_OPTIONS.map((option) => [option.value, option.label])
  ) as Record<LeadQualification, string>;

export const CLOSED_QUALIFICATIONS = new Set<LeadQualification>([
  "unqualified",
  "not_target",
  "spam",
  "duplicate",
]);

export function isLeadQualification(value: unknown): value is LeadQualification {
  return LEAD_QUALIFICATION_OPTIONS.some((option) => option.value === value);
}
