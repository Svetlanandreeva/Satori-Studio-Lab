import { getSetting, INTEGRATION_KEYS } from "@/lib/satori-integrations";

export async function sendTelegramDocument(input: {
  chatId: string;
  filename: string;
  bytes: Uint8Array;
  mimeType?: string | null;
  caption?: string | null;
  businessConnectionId?: string | null;
}) {
  const token = getSetting(INTEGRATION_KEYS.telegramBotToken);
  if (!token) return { sent: false, error: "Telegram-бот не настроен" };
  if (!input.chatId) return { sent: false, error: "У клиента нет Telegram-чата" };
  if (input.bytes.byteLength > 20 * 1024 * 1024) return { sent: false, error: "Максимальный размер файла из CRM — 20 МБ" };

  const form = new FormData();
  form.set("chat_id", input.chatId);
  form.set("document", new Blob([Buffer.from(input.bytes)], { type: input.mimeType || "application/octet-stream" }), input.filename || "file");
  if (input.caption) form.set("caption", String(input.caption).slice(0, 1000));
  if (input.businessConnectionId) form.set("business_connection_id", input.businessConnectionId);

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, { method: "POST", body: form, signal: AbortSignal.timeout(20_000) });
    const data = await response.json().catch(() => ({})) as { ok?: boolean; description?: string; result?: { message_id?: number } };
    if (!response.ok || !data.ok) return { sent: false, error: data.description || `Telegram HTTP ${response.status}` };
    return { sent: true, messageId: data.result?.message_id || null };
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message : "Не удалось отправить файл в Telegram" };
  }
}
