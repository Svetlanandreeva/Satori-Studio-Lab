import { detectClientDocumentKind, saveClientDocument } from "@/lib/client-documents";
import { INTEGRATION_KEYS, getSetting, telegramApiRequest } from "@/lib/satori-integrations";

type TelegramFileRef = {
  file_id: string;
  file_unique_id?: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
  width?: number;
  height?: number;
};

type TelegramMessage = {
  message_id: number;
  date?: number;
  chat?: { id?: number | string };
  document?: TelegramFileRef;
  photo?: TelegramFileRef[];
};

type TelegramUpdate = {
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  business_message?: TelegramMessage;
  edited_business_message?: TelegramMessage;
};

type TelegramGetFile = {
  file_id: string;
  file_unique_id?: string;
  file_size?: number;
  file_path?: string;
};

function messageFromUpdate(update: TelegramUpdate): TelegramMessage | null {
  return update.business_message || update.edited_business_message || update.message || update.edited_message || null;
}

function attachmentFromMessage(message: TelegramMessage): { ref: TelegramFileRef; name: string; mimeType: string | null } | null {
  if (message.document?.file_id) {
    return {
      ref: message.document,
      name: message.document.file_name || `Telegram файл ${message.message_id}`,
      mimeType: message.document.mime_type || null,
    };
  }

  const photo = [...(message.photo || [])]
    .filter((item) => item?.file_id)
    .sort((a, b) => Number(b.file_size || b.width || 0) - Number(a.file_size || a.width || 0))[0];
  if (photo) {
    return {
      ref: photo,
      name: `Telegram фото ${message.message_id}.jpg`,
      mimeType: "image/jpeg",
    };
  }

  return null;
}

export async function importTelegramAttachmentsFromUpdate(update: unknown, contactId: string): Promise<number> {
  const message = messageFromUpdate((update || {}) as TelegramUpdate);
  if (!message || !contactId) return 0;
  const attachment = attachmentFromMessage(message);
  if (!attachment) return 0;

  const token = getSetting(INTEGRATION_KEYS.telegramBotToken);
  if (!token) return 0;

  const fileInfo = await telegramApiRequest<TelegramGetFile>(token, "getFile", { file_id: attachment.ref.file_id });
  if (!fileInfo.ok || !fileInfo.result?.file_path) return 0;
  if (Number(fileInfo.result.file_size || attachment.ref.file_size || 0) > 20 * 1024 * 1024) return 0;

  const response = await fetch(`https://api.telegram.org/file/bot${token}/${fileInfo.result.file_path}`, { cache: "no-store" });
  if (!response.ok) return 0;
  const bytes = new Uint8Array(await response.arrayBuffer());
  const chatId = String(message.chat?.id || "telegram");
  const messageKey = `${chatId}:${message.message_id}`;
  const attachmentKey = attachment.ref.file_unique_id || fileInfo.result.file_unique_id || attachment.ref.file_id;

  try {
    const saved = saveClientDocument({
      contactId,
      kind: detectClientDocumentKind(attachment.name),
      name: attachment.name,
      mimeType: attachment.mimeType,
      bytes,
      sourceChannel: "telegram",
      sourceMessageId: messageKey,
      sourceAttachmentId: attachmentKey,
      sourceDirection: message.business_connection_id ? null : "incoming",
      createdAt: message.date ? new Date(message.date * 1000) : new Date(),
    });
    return saved ? 1 : 0;
  } catch (error) {
    console.warn("Telegram attachment skipped", attachment.name, error instanceof Error ? error.message : error);
    return 0;
  }
}
