import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const DB_PATH = process.env.CRM_DB_PATH || path.join(process.cwd(), "data", "crm.db");
const sqlite = new Database(DB_PATH, { timeout: 15000 });

function ts(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  const number = Number(value);
  if (Number.isFinite(number) && number > 100000000000) return number;
  if (Number.isFinite(number) && number > 1000000000) return number * 1000;
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function paymentSignal(text: string): boolean {
  return /(?:оплат(?:а|у|или|ил|ила|ено|или полностью)|сч[её]т оплачен|плат[её]ж (?:прош[её]л|отправлен|проведен)|деньги (?:перевели|отправили|поступили)|перевел[аи]?|payment (?:sent|made|completed|received)|paid)/i.test(text);
}

function futurePayment(text: string): boolean {
  return /(?:до оплаты|оплатим|оплачу|оплатят|жд[её]м оплат|ожидаем оплат|сч[её]т передан|оплата завтра|после оплаты|на оплате)/i.test(text);
}

function explicitAmounts(text: string): number[] {
  const result: number[] = [];
  const pattern = /(?:итого|стоимость|сумма|цена|к оплате|предоплата|сч[её]т(?:а)? на)\s*[:—-]?\s*(\d[\d\s]{2,10})(?:[,.]\d{1,2})?\s*(?:₽|руб(?:\.|лей|ля)?|rub)/gi;
  for (const match of text.matchAll(pattern)) {
    const rub = Number(match[1].replace(/\s/g, ""));
    if (rub >= 100 && rub <= 10_000_000) result.push(Math.round(rub * 100));
  }
  return result;
}

function readableDocumentText(contactId: string): string {
  const docs = sqlite.prepare(`
    SELECT stored_name AS storedName,name
    FROM client_documents
    WHERE contact_id=?
    ORDER BY created_at DESC
    LIMIT 30
  `).all(contactId) as Array<{ storedName: string; name: string }>;
  let text = "";
  const baseDir = process.env.CRM_CLIENT_FILES_PATH || path.join(path.dirname(DB_PATH), "client-files");
  for (const doc of docs) {
    const ext = path.extname(doc.storedName || "").toLowerCase();
    if (![".txt", ".csv"].includes(ext)) continue;
    try {
      text += `\n${doc.name}\n${fs.readFileSync(path.join(baseDir, doc.storedName), "utf8").slice(0, 100000)}`;
    } catch {}
  }
  return text;
}

export function dealConversationContext(dealId: string) {
  const deal = sqlite.prepare(`
    SELECT d.*,c.name AS contactName,c.email AS contactEmail,c.phone AS contactPhone
    FROM deals d
    JOIN contacts c ON c.id=d.contact_id
    WHERE d.id=?
  `).get(dealId) as any;
  if (!deal) return null;

  // Critical rule: a deal may only read conversations assigned to its own contact.
  // Semantic similarity across different contacts is never enough to mix threads.
  const related = sqlite.prepare(`
    SELECT em.*,et.remote_email AS remoteEmail,et.contact_id AS contactId
    FROM email_messages em
    JOIN email_threads et ON et.id=em.thread_id
    WHERE et.contact_id=?
    ORDER BY em.received_at ASC
  `).all(deal.contact_id) as any[];

  const docText = readableDocumentText(deal.contact_id);
  const conversationText = related.map((message) => `${message.subject || ""}\n${message.body_text || ""}`).join("\n");
  const foundAmounts = explicitAmounts(`${conversationText}\n${docText}`);
  const counts = new Map<number, number>();
  for (const amount of foundAmounts) counts.set(amount, (counts.get(amount) || 0) + 1);
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const detectedAmount = ranked.length && (ranked[0][1] >= 2 || Boolean(docText)) ? ranked[0][0] : 0;

  const oldAutoSuspect = Number(deal.value || 0) >= 100_000_000 && !foundAmounts.includes(Number(deal.value || 0));
  if (detectedAmount > 0 && (Number(deal.value || 0) <= 0 || oldAutoSuspect)) {
    sqlite.prepare("UPDATE deals SET value=?,updated_at=? WHERE id=?").run(detectedAmount, Date.now(), dealId);
    deal.value = detectedAmount;
  } else if (oldAutoSuspect && !detectedAmount) {
    sqlite.prepare("UPDATE deals SET value=0,updated_at=? WHERE id=?").run(Date.now(), dealId);
    deal.value = 0;
  }

  const payment = related
    .filter((message) => {
      const text = `${message.body_text || ""} ${message.subject || ""}`;
      return paymentSignal(text) && !futurePayment(text);
    })
    .sort((a, b) => ts(b.received_at) - ts(a.received_at))[0] || null;

  let verifiedPaymentDoc: any = null;
  if (payment) {
    verifiedPaymentDoc = sqlite.prepare(`
      SELECT * FROM client_documents
      WHERE contact_id=? AND source_direction='incoming'
        AND (
          source_message_id=?
          OR lower(name) LIKE '%чек%'
          OR lower(name) LIKE '%оплат%'
          OR lower(name) LIKE '%receipt%'
          OR lower(name) LIKE '%payment%'
          OR lower(name) LIKE '%платеж%'
        )
      ORDER BY created_at DESC
      LIMIT 1
    `).get(deal.contact_id, payment.message_id) as any;
  }

  if (payment && verifiedPaymentDoc) {
    const amount = detectedAmount || Number(deal.value || 0);
    const paidStage = sqlite.prepare(`
      SELECT id FROM pipeline_stages
      WHERE lower(name) LIKE '%оплач%'
      ORDER BY "order"
      LIMIT 1
    `).get() as { id?: string } | undefined;
    const paymentAt = ts(payment.received_at);
    if (amount > 0) {
      sqlite.prepare(`
        INSERT INTO deal_economics(deal_id,received_amount,updated_at)
        VALUES(?,?,?)
        ON CONFLICT(deal_id) DO UPDATE SET
          received_amount=MAX(received_amount,excluded.received_amount),
          updated_at=excluded.updated_at
      `).run(dealId, amount, paymentAt);
    }
    if (paidStage?.id) {
      sqlite.prepare("UPDATE deals SET stage_id=?,updated_at=? WHERE id=?").run(paidStage.id, paymentAt, dealId);
    }
  }

  return {
    deal,
    detectedAmount,
    relatedMessages: related.slice(-180),
    paymentEvidence: payment ? {
      text: String(payment.body_text || "").slice(0, 600),
      date: ts(payment.received_at),
      email: payment.remoteEmail,
      document: verifiedPaymentDoc?.name || null,
      autoApplied: Boolean(verifiedPaymentDoc),
    } : null,
    duplicateContactIds: [] as string[],
  };
}
