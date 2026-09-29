import fs from "fs";
import { sqlite } from "@/db";
import { getClientDocument, listClientDocuments, saveClientDocument } from "@/lib/client-documents";
import { docxToHtml, xlsxToHtml } from "@/lib/office-preview";
import { getOpenAiBaseUrl, getOpenAiKey, openAiSettings } from "@/lib/ai-settings";
import { buildDocx, type DocBlock } from "@/lib/docx-writer";

/**
 * КП от AI: собирает переписку, документы клиента, данные сделки и прошлые КП студии
 * и просит модель составить черновик. Цены и сроки AI не придумывает — если их нет
 * в переписке/документах, оставляет пустыми и пишет, что уточнить.
 */
export type ProposalItem = { name: string; description?: string; qty?: number | null; price?: number | null };
export type Proposal = {
  title: string; intro: string; items: ProposalItem[]; timeline: string; payment: string; delivery: string; notes: string;
  missing: string[];
};

const strip = (html: string) => html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|tr|h\d|li)>/gi, "\n").replace(/<\/td>/gi, " | ").replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();

function documentText(docId: string, contactId: string, limit = 12000): string | null {
  const doc = getClientDocument(docId, contactId);
  if (!doc) return null;
  const name = String(doc.name || "").toLowerCase();
  try {
    const buf = fs.readFileSync(String(doc.filePath));
    if (name.endsWith(".docx")) return strip(docxToHtml(buf)).slice(0, limit);
    if (name.endsWith(".xlsx")) return strip(xlsxToHtml(buf)).slice(0, limit);
    if (/\.(txt|csv|md)$/.test(name)) return buf.toString("utf8").slice(0, limit);
  } catch { /* битый файл — пропускаем */ }
  return null;
}

function conversation(contactId: string) {
  const tg = sqlite.prepare(`SELECT type, description, created_at AS at FROM activities WHERE contact_id=? AND type LIKE 'telegram%' ORDER BY created_at DESC LIMIT 80`).all(contactId) as Array<{ type: string; description: string; at: number }>;
  const mail = sqlite.prepare(`SELECT m.direction AS d, m.subject, m.body_text AS body, m.received_at AS at FROM email_messages m JOIN email_threads t ON t.id=m.thread_id WHERE t.contact_id=? AND COALESCE(t.is_service,0)=0 ORDER BY m.received_at DESC LIMIT 60`).all(contactId) as Array<{ d: string; subject: string; body: string; at: number }>;
  const ms = (v: number) => (v > 1e12 ? v : v * 1000);
  return [
    ...tg.map((r) => ({ at: ms(Number(r.at)), who: r.type.includes("outgoing") ? "студия" : "клиент", text: String(r.description || "").split("\n").slice(1).join("\n").replace(/\[tg-media:[^\]]+\]/g, "").trim() })),
    ...mail.map((r) => ({ at: ms(Number(r.at)), who: r.d === "outgoing" ? "студия" : "клиент", text: `${r.subject ? `[${r.subject}] ` : ""}${String(r.body || "").slice(0, 3000)}` })),
  ].sort((a, b) => a.at - b.at).slice(-100).map((m) => `${m.who}: ${m.text}`).join("\n\n").slice(0, 40000);
}

/** Прошлые КП студии (по названию файла) — как образец стиля и цен. */
function pastProposals(excludeContactId: string) {
  const rows = sqlite.prepare(`SELECT id, contact_id AS contactId, name FROM client_documents
    WHERE contact_id<>? AND (kind='commercial_offer' OR lower(name) LIKE '%кп%' OR lower(name) LIKE '%коммерч%') AND lower(name) LIKE '%.docx'
    ORDER BY created_at DESC LIMIT 3`).all(excludeContactId) as Array<{ id: string; contactId: string; name: string }>;
  return rows.map((r) => ({ name: r.name, text: documentText(r.id, r.contactId, 5000) })).filter((r) => r.text);
}

async function callAi(system: string, payload: unknown) {
  const key = getOpenAiKey();
  if (!key) throw new Error("AI не подключён: добавь ключ в Настройки → AI-менеджер");
  const base = getOpenAiBaseUrl(); const model = openAiSettings().model; const official = base.includes("api.openai.com");
  const res = await fetch(official ? `${base}/responses` : `${base}/chat/completions`, {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(official
      ? { model, input: [{ role: "system", content: [{ type: "input_text", text: system }] }, { role: "user", content: [{ type: "input_text", text: JSON.stringify(payload) }] }], text: { format: { type: "json_object" } } }
      : { model, messages: [{ role: "system", content: system }, { role: "user", content: JSON.stringify(payload) }], response_format: { type: "json_object" } }),
  });
  if (!res.ok) throw new Error(`AI ответил ошибкой ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json() as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  const text = official ? json.output_text || json.output?.flatMap((x: any) => x.content || []).find((x: any) => x.type === "output_text")?.text : json.choices?.[0]?.message?.content; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!text) throw new Error("AI вернул пустой ответ");
  return JSON.parse(text);
}

const SYSTEM = `Ты менеджер студии SATORI (Екатеринбург): авторские дизайнерские светильники, 3D-печать, небольшие партии, работа с дизайнерами интерьеров и бизнесом (рестораны, шоурумы, отели).
Составь коммерческое предложение (КП) для клиента по данным из переписки, документов клиента и сделки. Пиши по-русски, на «вы», без приветствия по имени (имя в источнике может быть неверным), деловым спокойным тоном, без воды.
Правила:
- Используй только факты из данных. НЕ придумывай цены, количество, размеры и сроки. Если цены нет — price: null и добавь в missing, что нужно уточнить.
- Сумма сделки (deal.value) и прошлые КП студии — можно опираться, но не выдумывать недостающее.
- items: позиции заказа (name — что это, description — размеры/материал/цвет, qty, price — цена за единицу в рублях или null).
- timeline — сроки изготовления (если есть срок в сделке — используй его), payment — условия оплаты (если неизвестно — «предоплата 50%, остаток перед отгрузкой» можно предложить как стандарт студии, пометив в missing, что это стандарт), delivery — доставка, notes — что входит/важные условия.
- missing — короткий список, что нужно уточнить у клиента или мастеров перед отправкой.
Верни только JSON: {"title":"...","intro":"...","items":[{"name":"...","description":"...","qty":1,"price":null}],"timeline":"...","payment":"...","delivery":"...","notes":"...","missing":["..."]}`;

export async function generateProposal(input: { contactId: string; dealId?: string | null; instructions?: string }): Promise<Proposal> {
  const contact = sqlite.prepare("SELECT id, name, company, email, phone FROM contacts WHERE id=?").get(input.contactId) as Record<string, unknown> | undefined;
  if (!contact) throw new Error("Клиент не найден");
  const deal = input.dealId ? sqlite.prepare(`SELECT d.title, d.value, d.notes, s.name AS stage, p.production_term_days AS termDays FROM deals d
      LEFT JOIN pipeline_stages s ON s.id=d.stage_id LEFT JOIN project_details p ON p.deal_id=d.id WHERE d.id=?`).get(input.dealId) as Record<string, unknown> | undefined : undefined;
  const docs = listClientDocuments(input.contactId).slice(0, 12).map((d) => ({ name: d.name, text: documentText(d.id, input.contactId) }));
  const payload = {
    client: { company: contact.company || null },
    deal: deal ? { title: deal.title, valueRub: Number(deal.value || 0) / 100 || null, termDays: deal.termDays || null, stage: deal.stage, notes: String(deal.notes || "").replace(/\[[^\]]+\]/g, "").trim().slice(0, 2000) } : null,
    conversation: conversation(input.contactId),
    clientDocuments: docs,
    studioPastProposals: pastProposals(input.contactId),
    extraInstructions: input.instructions || null,
  };
  const r = await callAi(SYSTEM, payload);
  const num = (v: unknown) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
  return {
    title: String(r.title || `Коммерческое предложение${deal?.title ? ` — ${deal.title}` : ""}`),
    intro: String(r.intro || ""),
    items: Array.isArray(r.items) ? r.items.slice(0, 40).map((i: Record<string, unknown>) => ({ name: String(i.name || ""), description: String(i.description || ""), qty: num(i.qty), price: num(i.price) })) : [],
    timeline: String(r.timeline || ""), payment: String(r.payment || ""), delivery: String(r.delivery || ""), notes: String(r.notes || ""),
    missing: Array.isArray(r.missing) ? r.missing.map(String).slice(0, 12) : [],
  };
}

const rub = (n: number) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(n) + " ₽";

export function proposalTotal(p: Proposal) {
  return p.items.reduce((s, i) => s + (i.price != null ? i.price * (i.qty || 1) : 0), 0);
}

export function proposalText(p: Proposal) {
  const lines = [p.title, "", p.intro, ""];
  p.items.forEach((i, k) => lines.push(`${k + 1}. ${i.name}${i.description ? ` — ${i.description}` : ""}${i.qty ? `, ${i.qty} шт.` : ""}${i.price != null ? ` — ${rub(i.price)}${i.qty && i.qty > 1 ? ` за шт.` : ""}` : ""}`));
  const total = proposalTotal(p);
  if (total) lines.push("", `Итого: ${rub(total)}`);
  if (p.timeline) lines.push("", `Сроки: ${p.timeline}`);
  if (p.payment) lines.push(`Оплата: ${p.payment}`);
  if (p.delivery) lines.push(`Доставка: ${p.delivery}`);
  if (p.notes) lines.push("", p.notes);
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function saveProposalDocx(contactId: string, p: Proposal, dealTitle?: string | null) {
  const date = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(new Date());
  const blocks: DocBlock[] = [
    { type: "small", text: `Студия SATORI · ${date}`, align: "right" },
    { type: "h1", text: p.title },
  ];
  if (p.intro) blocks.push({ type: "p", text: p.intro });
  if (p.items.length) {
    const rows = [["№", "Позиция", "Кол-во", "Цена", "Сумма"]];
    p.items.forEach((i, k) => rows.push([String(k + 1), `${i.name}${i.description ? `\n${i.description}` : ""}`, i.qty ? String(i.qty) : "—", i.price != null ? rub(i.price) : "по запросу", i.price != null ? rub(i.price * (i.qty || 1)) : "—"]));
    const total = proposalTotal(p);
    if (total) rows.push(["", "Итого", "", "", rub(total)]);
    blocks.push({ type: "table", rows, header: true, widths: [500, 4600, 1100, 1400, 1400] });
  }
  if (p.timeline) blocks.push({ type: "h2", text: "Сроки" }, { type: "p", text: p.timeline });
  if (p.payment) blocks.push({ type: "h2", text: "Оплата" }, { type: "p", text: p.payment });
  if (p.delivery) blocks.push({ type: "h2", text: "Доставка" }, { type: "p", text: p.delivery });
  if (p.notes) blocks.push({ type: "h2", text: "Важно" }, { type: "p", text: p.notes });
  blocks.push({ type: "spacer" }, { type: "small", text: "Предложение действительно 14 дней. Будем рады ответить на вопросы." });
  const bytes = buildDocx(blocks);
  const safe = (dealTitle || p.title).replace(/[\\/:*?"<>|]+/g, " ").slice(0, 60).trim();
  return saveClientDocument({
    contactId, kind: "commercial_offer", name: `КП — ${safe}.docx`,
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", bytes: new Uint8Array(bytes),
  });
}
