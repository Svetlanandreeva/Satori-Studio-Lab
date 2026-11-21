import { sqlite } from "@/db";
import { saveClientDocument } from "@/lib/client-documents";

/**
 * HOME shares the existing SATORI contact database, but each order gets its
 * own deal. Never merge a HOME order into an open Studio production deal.
 * Idempotency is based on the immutable external order ID in deal notes.
 */
export interface HomeOrder {
  id: string;
  createdAt?: string;
  type?: string;
  client: { name: string; contact: string; city: string; email?: string };
  items: Array<{ name?: string; quantity: number; link?: string }>;
  comment?: string;
  files?: Array<{ name: string; type?: string; data: string }>;
}
const field = (v: unknown, max = 300) => String(v ?? "").trim().slice(0, max);
const phoneKey = (v: unknown) => {
  let d = String(v || "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("8")) d = "7" + d.slice(1);
  if (d.length === 10) d = "7" + d;
  return d.length >= 10 ? d : null;
};
const emailKey = (v: unknown) => {
  const s = String(v || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : null;
};

export function syncHomeOrder(order: HomeOrder) {
  const id = field(order?.id, 100);
  if (!/^SH-[A-Z0-9-]{8,90}$/.test(id)) throw new Error("Неверный идентификатор заявки");
  if (!order.client || !field(order.client.name) || !field(order.client.contact) || !field(order.client.city)) throw new Error("Нет контактов клиента");
  if (!Array.isArray(order.items) || order.items.length < 1 || order.items.length > 40) throw new Error("Неверный список товаров");
  const items = order.items.map((item) => {
    const name = field(item.name, 230), link = field(item.link, 2000);
    const quantity = Number(item.quantity);
    if ((!name && !link) || !Number.isInteger(quantity) || quantity < 1 || quantity > 9999) throw new Error("Неверная позиция товара");
    return { name, link, quantity };
  });
  const marker = `[satori-home-order:${id}]`;
  const client = order.client;
  const normalizedPhone = phoneKey(client.contact);
  const normalizedEmail = emailKey(client.email) || emailKey(client.contact);
  const timestamp = order.createdAt && !Number.isNaN(Date.parse(order.createdAt)) ? new Date(order.createdAt).getTime() : Date.now();
  const created = Math.floor(timestamp / 1000);
  const now = Math.floor(Date.now() / 1000);
  const details = [
    "Бренд: SATORI HOME",
    `Заказ HOME: ${id}`,
    `Категория: ${field(order.type, 100) || "Заказ из Китая"}`,
    `Клиент: ${field(client.name, 200)}`,
    `Связь: ${field(client.contact, 150)}`,
    `Доставка: ${field(client.city, 120)}`,
    normalizedEmail ? `Почта: ${normalizedEmail}` : "",
    ...items.map((item, i) => `${i + 1}. ${item.name || "Товар"} ×${item.quantity}${item.link ? " — " + item.link : ""}`),
    order.comment ? `Комментарий: ${field(order.comment, 2000)}` : "",
    ...((Array.isArray(order.files) ? order.files : []).map(f => `Вложение: ${field(f.name, 140)}`)),
  ].filter(Boolean).join("\n").slice(0, 18000);
  const result = sqlite.transaction(() => {
    const duplicate = sqlite.prepare("SELECT id, contact_id FROM deals WHERE notes LIKE ? LIMIT 1").get(`%${marker}%`) as { id: string; contact_id: string } | undefined;
    if (duplicate) return { contactId: duplicate.contact_id, dealId: duplicate.id, skipped: true };
    const existing = (sqlite.prepare("SELECT id, phone, email FROM contacts").all() as Array<{ id: string; phone: string | null; email: string | null }>)
      .find(c => (normalizedPhone && phoneKey(c.phone) === normalizedPhone) || (normalizedEmail && emailKey(c.email) === normalizedEmail));
    let contactId = existing?.id;
    if (!contactId) {
      contactId = crypto.randomUUID();
      sqlite.prepare(`INSERT INTO contacts (id, name, email, phone, company, source, temperature, qualification, score, notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, NULL, 'satori_home', 'warm', 'new', 50, ?, ?, ?)`)
        .run(contactId, field(client.name, 200), normalizedEmail, normalizedPhone || field(client.contact, 60), marker, created, now);
    }
    const stage = sqlite.prepare(`SELECT id FROM pipeline_stages WHERE COALESCE(is_won,0)=0 AND COALESCE(is_lost,0)=0
      AND lower(name) NOT LIKE '%песочн%' AND lower(name) NOT LIKE '%спам%' ORDER BY "order" LIMIT 1`).get() as { id: string } | undefined;
    if (!stage) throw new Error("В CRM не настроена воронка");
    const dealId = crypto.randomUUID();
    const title = `HOME · ${id} · ${items[0].name || "Товары из Китая"}`.slice(0, 180);
    sqlite.prepare(`INSERT INTO deals (id, title, value, stage_id, contact_id, probability, notes, created_at, updated_at)
      VALUES (?, ?, 0, ?, ?, 10, ?, ?, ?)`).run(dealId, title, stage.id, contactId, `${marker}\n${details}`, created, now);
    sqlite.prepare(`INSERT INTO activities (id, type, description, contact_id, deal_id, priority, completed_at, created_at)
      VALUES (?, 'note', ?, ?, ?, 'normal', ?, ?)`).run(crypto.randomUUID(), details, contactId, dealId, created, now);
    sqlite.prepare(`INSERT INTO activities (id, type, description, contact_id, deal_id, priority, scheduled_at, created_at)
      VALUES (?, 'task', ?, ?, ?, 'high', ?, ?)`).run(crypto.randomUUID(), `Связаться: SATORI HOME ${id}`, contactId, dealId, now, now);
    return { contactId, dealId, skipped: false };
  })();
  let savedFiles = 0;
  let failedFiles = 0;
  if (!result.skipped && Array.isArray(order.files)) for (const file of order.files.slice(0, 3)) {
    try {
      const name = field(file.name, 150);
      const mime = field(file.type, 100);
      const allowed = /^(image\/(jpeg|png|webp)|application\/pdf|application\/vnd\.(openxmlformats-officedocument\.spreadsheetml\.sheet|ms-excel)|text\/csv|application\/csv|application\/octet-stream)$/;
      if (!allowed.test(mime) || typeof file.data !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(file.data)) throw new Error("invalid-file");
      const bytes = Buffer.from(file.data, "base64");
      if (bytes.length > 3 * 1024 * 1024) throw new Error("file-too-large");
      saveClientDocument({ contactId: result.contactId, name, mimeType: mime, bytes: new Uint8Array(bytes), sourceChannel: "website" });
      savedFiles++;
    } catch { failedFiles++; }
  }
  return { orderId: id, ...result, savedFiles, failedFiles };
}
