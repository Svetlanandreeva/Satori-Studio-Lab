import { sqlite } from "@/db";
import { saveClientDocument } from "@/lib/client-documents";

/** Заявка с формы сайта («На заказ» / «Бизнесу»), как её хранит backend сайта. */
export interface SiteLead {
  id: string;
  type?: "custom" | "business" | string;
  name?: string; phone?: string; contact?: string; email?: string; company?: string;
  idea?: string; budget?: string; inquiryType?: string; volume?: string; comment?: string;
  professional?: boolean; referenceName?: string; referenceDataUrl?: string; source?: string;
  createdAt?: string;
  tracking?: { yclid?: string; clientId?: string; utm_source?: string; utm_medium?: string; utm_campaign?: string; utm_term?: string; referrer?: string };
}

const MARK = (id: string) => `[site-lead:${id}]`;

function phoneKey(v: unknown): string | null {
  let d = String(v || "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("8")) d = `7${d.slice(1)}`;
  if (d.length === 10) d = `7${d}`;
  return d.length >= 10 ? d : null;
}
const emailOf = (v: unknown) => { const m = String(v || "").match(/[^\s@]+@[^\s@]+\.[^\s@]+/); return m ? m[0].toLowerCase() : null; };
const clean = (v: unknown, max = 4000) => String(v ?? "").trim().slice(0, max);

/** Реклама, если есть клик Директа (yclid) или платная метка. */
export function isAdLead(t: SiteLead["tracking"]): boolean {
  if (!t) return false;
  if (t.yclid) return true;
  const medium = String(t.utm_medium || "").toLowerCase(), src = String(t.utm_source || "").toLowerCase();
  return /cpc|cpm|cpa|paid|ppc/.test(medium) || /yandex.?direct|ya.?direct|^direct$/.test(src);
}

function describe(lead: SiteLead): { title: string; body: string } {
  const business = lead.type === "business";
  const lines = business
    ? [`Заявка «Бизнесу» с сайта`, lead.company && `Компания: ${clean(lead.company, 200)}`, lead.inquiryType && `Запрос: ${clean(lead.inquiryType, 200)}`, lead.volume && `Объём: ${clean(lead.volume, 200)}`, lead.comment && `Комментарий: ${clean(lead.comment)}`]
    : [`Заявка «На заказ» с сайта`, lead.idea && `Идея: ${clean(lead.idea)}`, lead.budget && `Бюджет: ${clean(lead.budget, 200)}`, lead.professional ? "Компания / дизайнер" : null];
  const contact = [lead.phone && `Телефон: ${clean(lead.phone, 60)}`, lead.contact && lead.contact !== lead.phone && `Связь: ${clean(lead.contact, 200)}`, lead.email && `Почта: ${clean(lead.email, 200)}`];
  const t = lead.tracking || {};
  const utm = [t.utm_source, t.utm_medium, t.utm_campaign].filter(Boolean).join(" / ");
  const origin = [isAdLead(t) ? "Источник: реклама (Яндекс Директ)" : "Источник: сайт", utm && `Метки: ${utm}`, t.utm_term && `Ключ: ${clean(t.utm_term, 200)}`];
  const body = [...lines, ...contact, ...origin].filter(Boolean).join("\n");
  const subject = business ? clean(lead.company || lead.inquiryType, 80) : clean(lead.idea, 80).split("\n")[0];
  const title = `${business ? "Бизнесу" : "На заказ"}${subject ? `: ${subject}` : " — заявка с сайта"}`.slice(0, 120);
  return { title, body };
}

function firstStage(): { id: string } | undefined {
  return sqlite.prepare(`SELECT id FROM pipeline_stages WHERE COALESCE(is_won,0)=0 AND COALESCE(is_lost,0)=0 AND lower(name) NOT LIKE '%песочн%' AND lower(name) NOT LIKE '%спам%' ORDER BY "order" LIMIT 1`).get() as { id: string } | undefined;
}

/**
 * Кладёт заявку с сайта в CRM: клиент (ищем по телефону/почте), сделка на первом этапе,
 * заметка с текстом формы, задача «связаться» на сегодня и референс в файлы клиента.
 * Повторная отправка той же заявки ничего не дублирует.
 */
export function syncSiteLead(lead: SiteLead, opts: { backfill?: boolean } = {}) {
  const id = clean(lead?.id, 100);
  if (!id) throw new Error("У заявки нет id");
  const mark = MARK(id);
  const done = sqlite.prepare("SELECT id FROM deals WHERE notes LIKE ? UNION SELECT deal_id FROM activities WHERE description LIKE ? LIMIT 1").get(`%${mark}%`, `%${mark}%`);
  if (done) return { leadId: id, skipped: true, reason: "already-synced" };

  const ad = isAdLead(lead.tracking);
  const created = lead.createdAt && !Number.isNaN(Date.parse(lead.createdAt)) ? new Date(lead.createdAt) : new Date();
  const ts = Math.floor(created.getTime() / 1000);
  const now = Math.floor(Date.now() / 1000);
  const phone = phoneKey(lead.phone) || phoneKey(lead.contact);
  const email = emailOf(lead.email) || emailOf(lead.contact);
  const { title, body } = describe(lead);

  const tx = sqlite.transaction(() => {
    const existing = (sqlite.prepare("SELECT id, phone, email, source FROM contacts").all() as Array<{ id: string; phone: string | null; email: string | null; source: string }>)
      .find((c) => (phone && phoneKey(c.phone) === phone) || (email && String(c.email || "").toLowerCase() === email));
    // Досылка старых заявок при выкатке: если человек уже есть в CRM, его уже вели вручную —
    // только дописываем текст заявки к последней сделке, без новых сделок и задач.
    if (opts.backfill && existing) {
      const last = sqlite.prepare("SELECT id FROM deals WHERE contact_id=? ORDER BY updated_at DESC LIMIT 1").get(existing.id) as { id: string } | undefined;
      sqlite.prepare(`INSERT INTO activities (id, type, description, contact_id, deal_id, priority, completed_at, created_at) VALUES (?, 'note', ?, ?, ?, 'normal', ?, ?)`)
        .run(crypto.randomUUID(), `${body}\n${mark}`, existing.id, last?.id || null, ts, ts);
      return { contactId: existing.id, dealId: last?.id || null, createdDeal: false };
    }
    let contactId = existing?.id;
    if (!contactId) {
      contactId = crypto.randomUUID();
      sqlite.prepare(`INSERT INTO contacts (id, name, email, phone, company, source, temperature, qualification, score, notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'warm', 'new', 50, ?, ?, ?)`).run(
        contactId, clean(lead.name, 200) || "Заявка с сайта", email, clean(lead.phone || (phone ? lead.contact : ""), 60) || null,
        clean(lead.company, 200) || null, ad ? "ads" : "website", mark, ts, now);
    } else if (ad && existing?.source === "website") {
      sqlite.prepare("UPDATE contacts SET source='ads', updated_at=? WHERE id=?").run(now, contactId);
    }

    // Открытая сделка у клиента уже есть — не плодим вторую, дописываем в неё.
    const open = sqlite.prepare(`SELECT d.id FROM deals d JOIN pipeline_stages s ON s.id=d.stage_id
      WHERE d.contact_id=? AND COALESCE(s.is_won,0)=0 AND COALESCE(s.is_lost,0)=0 ORDER BY d.updated_at DESC LIMIT 1`).get(contactId) as { id: string } | undefined;
    let dealId = open?.id;
    if (!dealId) {
      const stage = firstStage();
      if (!stage) throw new Error("В воронке нет первого этапа");
      dealId = crypto.randomUUID();
      sqlite.prepare(`INSERT INTO deals (id, title, value, stage_id, contact_id, probability, notes, created_at, updated_at) VALUES (?, ?, 0, ?, ?, 10, ?, ?, ?)`)
        .run(dealId, title, stage.id, contactId, `${mark}\n${body}`, ts, now);
    }
    sqlite.prepare(`INSERT INTO activities (id, type, description, contact_id, deal_id, priority, completed_at, created_at) VALUES (?, 'note', ?, ?, ?, 'normal', ?, ?)`)
      .run(crypto.randomUUID(), `${body}\n${mark}`, contactId, dealId, ts, ts);
    if (!opts.backfill) sqlite.prepare(`INSERT INTO activities (id, type, description, contact_id, deal_id, priority, scheduled_at, created_at) VALUES (?, 'task', ?, ?, ?, 'high', ?, ?)`)
      .run(crypto.randomUUID(), `Связаться по заявке с сайта: ${title}`, contactId, dealId, Math.max(ts, now - 60), now);
    return { contactId, dealId, createdDeal: !open };
  });
  const res = tx();

  if (lead.referenceDataUrl && /^data:([\w/+.-]+);base64,/.test(lead.referenceDataUrl)) {
    try {
      const [head, b64] = lead.referenceDataUrl.split(",", 2);
      const mime = head.slice(5, head.indexOf(";"));
      saveClientDocument({ contactId: res.contactId, name: clean(lead.referenceName, 150) || "Референс с сайта", mimeType: mime, bytes: new Uint8Array(Buffer.from(b64, "base64")), sourceChannel: "website" });
    } catch { /* референс не критичен */ }
  }
  return { leadId: id, ...res, ad };
}
