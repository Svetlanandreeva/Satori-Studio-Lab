import { sqlite } from "@/db";
import { buildEmailConversationIndex, emailThreadIdFromDealNotes } from "@/lib/email-conversation";
import { mergeContacts, writeAuditLog } from "@/lib/operations";
import { deleteDealsCascade } from "@/lib/safe-delete";

/**
 * Разовая чистка дублей из почты: одна переписка (в т.ч. с разных адресов) = один клиент
 * и одна заявка. Сливаем только клиентов, созданных автоматически из почты, а удаляем
 * только пустые дубли на первом этапе (без суммы, без оплат, без закупок).
 */
const FLAG = "email_duplicate_repair_v1";

type ThreadRow = { id: string; contactId: string | null };
type ContactRow = { id: string; source: string | null; createdAt: number };
type DealRow = { id: string; contactId: string; stageId: string; value: number; notes: string | null; createdAt: number; stageOrder: number; isWon: number; isLost: number };

export function runEmailDuplicateRepair(force = false) {
  const done = sqlite.prepare("SELECT value FROM crm_settings WHERE key=?").get(FLAG) as { value?: string } | undefined;
  if (done?.value && !force) return { skipped: true };

  const index = buildEmailConversationIndex();
  const threads = sqlite.prepare("SELECT id, contact_id AS contactId FROM email_threads").all() as ThreadRow[];
  const contactById = new Map((sqlite.prepare("SELECT id, source, created_at AS createdAt FROM contacts").all() as ContactRow[]).map((c) => [c.id, c]));

  const conversations = new Map<string, ThreadRow[]>();
  for (const t of threads) {
    const conv = index.conversationByThreadId.get(t.id) || t.id;
    const list = conversations.get(conv) || [];
    list.push(t);
    conversations.set(conv, list);
  }

  let mergedContacts = 0;
  let removedDeals = 0;

  for (const [conv, list] of conversations) {
    // 1. Клиенты: оставляем самого старого, автоматически созданные из почты вливаем в него.
    const ids = [...new Set(list.map((t) => t.contactId).filter(Boolean) as string[])].filter((id) => contactById.has(id));
    let primary = ids.sort((a, b) => (contactById.get(a)!.createdAt || 0) - (contactById.get(b)!.createdAt || 0))[0] || null;
    for (const id of ids) {
      if (!primary || id === primary) continue;
      if (String(contactById.get(id)?.source || "") !== "email") continue;
      try { mergeContacts(id, primary); contactById.delete(id); mergedContacts += 1; }
      catch (error) { console.error("Email dedup: merge failed", id, primary, error); }
    }
    if (primary) sqlite.prepare("UPDATE email_threads SET contact_id=? WHERE id IN (" + list.map(() => "?").join(",") + ")").run(primary, ...list.map((t) => t.id));

    // 2. Заявки этой переписки: оставляем самую продвинутую, пустые дубли на первом этапе удаляем.
    if (!primary) continue;
    const convThreads = new Set(list.map((t) => t.id));
    const deals = (sqlite.prepare(`SELECT d.id, d.contact_id AS contactId, d.stage_id AS stageId, d.value, d.notes, d.created_at AS createdAt,
        ps."order" AS stageOrder, ps.is_won AS isWon, ps.is_lost AS isLost
      FROM deals d JOIN pipeline_stages ps ON ps.id = d.stage_id WHERE d.contact_id = ?`).all(primary) as DealRow[])
      .filter((d) => {
        const t = emailThreadIdFromDealNotes(d.notes);
        if (t) return convThreads.has(t) || (index.conversationByThreadId.get(t) || t) === conv;
        // Старые заявки из почты, у которых AI затёр метку переписки: берём, если клиент почтовый
        // и это не заказ магазина.
        return String(contactById.get(primary!)?.source || "") === "email" && !/\[(store-order|legacy-deal):/i.test(String(d.notes || ""));
      });
    if (deals.length < 2) continue;
    const firstOrder = Math.min(...(sqlite.prepare(`SELECT "order" AS o FROM pipeline_stages WHERE is_won=0 AND is_lost=0`).all() as Array<{ o: number }>).map((r) => r.o));
    const ranked = [...deals].sort((a, b) => (b.stageOrder - a.stageOrder) || ((b.value || 0) - (a.value || 0)) || (a.createdAt - b.createdAt));
    const keep = ranked[0];
    const removable = ranked.slice(1).filter((d) => {
      if (d.stageOrder !== firstOrder || (d.value || 0) > 0) return false;
      try {
        const econ = sqlite.prepare("SELECT received_amount AS r FROM deal_economics WHERE deal_id=?").get(d.id) as { r?: number } | undefined;
        if (econ?.r) return false;
      } catch {}
      try {
        const bought = sqlite.prepare("SELECT 1 FROM deal_purchases WHERE deal_id=? LIMIT 1").get(d.id);
        if (bought) return false;
      } catch {}
      return true;
    });
    if (removable.length) {
      deleteDealsCascade(removable.map((d) => d.id));
      removedDeals += removable.length;
      writeAuditLog(null, "email_dedup_remove_deals", "deal", keep.id, { removed: removable.map((d) => d.id) });
    }
  }

  sqlite.prepare("INSERT INTO crm_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(FLAG, new Date().toISOString());
  if (mergedContacts || removedDeals) console.log(`Email dedup: merged ${mergedContacts} contacts, removed ${removedDeals} duplicate deals`);
  return { mergedContacts, removedDeals };
}
