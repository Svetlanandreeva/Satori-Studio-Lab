import { cookies } from "next/headers";
import { CRM_SESSION_COOKIE, parseCrmSessionToken } from "@/lib/session-auth";
import type { SessionActor } from "@/lib/operations";

/**
 * Кто смотрит страницу и что ему можно.
 * Владелец видит всё. Менеджер (и «просмотр») не видит экономику компании:
 * деньги показываем только по сделкам, где он ответственный.
 */
export async function pageActor(): Promise<SessionActor> {
  const store = await cookies();
  return parseCrmSessionToken(store.get(CRM_SESSION_COOKIE)?.value)?.actor || { id: "owner", name: "Владелец", role: "owner" };
}

export const isOwner = (a: SessionActor) => a.role === "owner";

/** Видно ли деньги по сделке этому человеку. */
export function canSeeDealMoney(a: SessionActor, ownerId: string | null | undefined): boolean {
  return isOwner(a) || (Boolean(ownerId) && ownerId === a.id);
}

/** Разделы и API только для владельца. Используется в proxy (страницы/API) и в меню. */
export const OWNER_ONLY_PAGES = ["/analytics", "/economics", "/procurement", "/control", "/settings", "/assistant", "/sandbox", "/projects"];
export const OWNER_ONLY_API = ["/api/economics", "/api/funnel-settings", "/api/control", "/api/export", "/api/integrations/settings", "/api/integrations/openai", "/api/assistant", "/api/projects"];
