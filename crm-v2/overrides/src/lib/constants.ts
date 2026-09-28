import type { Temperature, LeadSource, ActivityType } from "@/types";

export const TEMPERATURE_CONFIG: Record<
  Temperature,
  { label: string; color: string; bgColor: string }
> = {
  cold: { label: "Холодный", color: "#64748b", bgColor: "#f1f5f9" },
  warm: { label: "Тёплый", color: "#ea580c", bgColor: "#fff7ed" },
  hot: { label: "Горячий", color: "#dc2626", bgColor: "#fef2f2" },
};

export const SOURCE_LABELS: Record<LeadSource, string> = {
  website: "Сайт",
  whatsapp: "WhatsApp",
  referido: "Рекомендация",
  redes_sociales: "Соцсети",
  llamada_fria: "Холодный звонок",
  email: "Email",
  formulario: "Форма",
  evento: "Мероприятие",
  import: "Импорт",
  webhook: "Webhook",
  need_number: "Need Number",
  otro: "Другое",
};

export const ACTIVITY_TYPE_CONFIG: Record<
  ActivityType,
  { label: string; icon: string }
> = {
  call: { label: "Звонок", icon: "Phone" },
  email: { label: "Email", icon: "Mail" },
  meeting: { label: "Встреча", icon: "Users" },
  note: { label: "Заметка", icon: "FileText" },
  follow_up: { label: "Follow-up", icon: "Clock" },
};

export function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function cleanPhoneForWhatsApp(phone: string): string {
  // "+7 999 123-45-67" → "525512345678"
  return phone.replace(/[\s\-\(\)]/g, "").replace(/^\+/, "");
}

function toDate(date: Date | number): Date {
  if (date instanceof Date) return date;
  // If number is less than 1e12, it's in seconds; otherwise milliseconds
  return new Date(date < 1e12 ? date * 1000 : date);
}

export function formatDate(date: Date | number | null): string {
  if (!date) return "-";
  const d = toDate(date);
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

export function formatRelativeDate(date: Date | number): string {
  const d = toDate(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Сегодня";
  if (diffDays === 1) return "Вчера";
  if (diffDays < 7) return `${diffDays} дн. назад`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} нед. назад`;
  return formatDate(date);
}
