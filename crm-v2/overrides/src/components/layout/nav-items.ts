import {
  BarChart3, Banknote, Boxes, CalendarClock, Factory, Handshake, Kanban,
  LayoutDashboard, MessageCircle, PhoneCall, ShieldCheck, Sparkles, Users,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: typeof LayoutDashboard; hint?: string };

/** Ежедневная работа — всегда на виду. */
export const PRIMARY_NAV: NavItem[] = [
  { href: "/", label: "Сводка", icon: LayoutDashboard, hint: "Цифры, календарь, воронка" },
  { href: "/pipeline", label: "Воронка", icon: Kanban, hint: "Сделки по этапам" },
  { href: "/deals", label: "Сделки", icon: Handshake, hint: "Список заказов" },
  { href: "/production", label: "Производство", icon: Factory, hint: "Сроки и дедлайны" },
  { href: "/contacts", label: "Клиенты", icon: Users, hint: "База клиентов" },
  { href: "/inbox", label: "Сообщения", icon: MessageCircle, hint: "Почта и Telegram" },
  { href: "/tasks", label: "Задачи", icon: CalendarClock, hint: "Сегодня и просроченные" },
];

/** Остальное — свёрнуто в «Ещё». */
export const SECONDARY_NAV: NavItem[] = [
  { href: "/economics", label: "Деньги", icon: Banknote, hint: "Поступления и расходы" },
  { href: "/procurement", label: "Закупки", icon: Boxes, hint: "Материалы" },
  { href: "/analytics", label: "Аналитика", icon: BarChart3, hint: "Продажи и источники" },
  { href: "/assistant", label: "AI помощник", icon: Sparkles, hint: "Срез по CRM" },
  { href: "/call-list", label: "Обзвон", icon: PhoneCall, hint: "Лиды на обработку" },
  { href: "/control", label: "Контроль", icon: ShieldCheck, hint: "Сотрудники и доступы" },
];

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
