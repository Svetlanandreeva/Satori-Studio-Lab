import { sqlite } from "@/db";
import { saveClientDocument, type ClientDocumentRecord } from "@/lib/client-documents";
import { INTEGRATION_KEYS, getSetting, telegramApiRequest, telegramFileDownload } from "@/lib/satori-integrations";

/**
 * Медиа из Telegram (фото, видео, голосовые, документы). В самом сообщении храним
 * file_id служебной строкой [tg-media:…], а файл скачиваем в карточку клиента —
 * сразу при получении и повторно по запросу, если с первого раза не вышло.
 */
export type TelegramMedia = { kind: string; fileId: string; uniqueId?: string; name: string; mime: string | null; size?: number };

type Ref = { file_id: string; file_unique_id?: string; file_name?: string; mime_type?: string; file_size?: number; width?: number };
type Msg = { message_id: number; photo?: Ref[]; document?: Ref; video?: Ref; voice?: Ref; audio?: Ref; video_note?: Ref; animation?: Ref; sticker?: Ref & { is_animated?: boolean; is_video?: boolean } };

export function mediaFromMessage(m: Msg): TelegramMedia | null {
  const id = m.message_id;
  const pick = (kind: string, r: Ref | undefined, name: string, mime: string | null): TelegramMedia | null =>
    r?.file_id ? { kind, fileId: r.file_id, uniqueId: r.file_unique_id, name: r.file_name || name, mime: r.mime_type || mime, size: r.file_size } : null;
  if (m.photo?.length) {
    const best = [...m.photo].sort((a, b) => Number(b.file_size || b.width || 0) - Number(a.file_size || a.width || 0))[0];
    return pick("photo", best, `Фото ${id}.jpg`, "image/jpeg");
  }
  return pick("video", m.video, `Видео ${id}.mp4`, "video/mp4")
    || pick("voice", m.voice, `Голосовое ${id}.ogg`, "audio/ogg")
    || pick("video_note", m.video_note, `Кружок ${id}.mp4`, "video/mp4")
    || pick("audio", m.audio, `Аудио ${id}.mp3`, "audio/mpeg")
    || pick("animation", m.animation, `Анимация ${id}.mp4`, "video/mp4")
    || (m.sticker && !m.sticker.is_animated ? pick("sticker", m.sticker, `Стикер ${id}.${m.sticker.is_video ? "webm" : "webp"}`, m.sticker.is_video ? "video/webm" : "image/webp") : null)
    || pick("document", m.document, `Файл ${id}`, null);
}

export const encodeMedia = (m: TelegramMedia) => `[tg-media:${Buffer.from(JSON.stringify(m)).toString("base64url")}]`;
export function decodeMedia(description: string): TelegramMedia | null {
  const raw = String(description || "").match(/\[tg-media:([A-Za-z0-9_-]+)\]/)?.[1];
  if (!raw) return null;
  try { return JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as TelegramMedia; } catch { return null; }
}
export const stripMediaMarker = (text: string) => String(text || "").replace(/\n?\[tg-media:[A-Za-z0-9_-]+\]/g, "").trim();

/** Скачивает медиа сообщения (activity id вида tg:<chat>:<message>) в файлы клиента. */
export async function ensureTelegramMedia(activityId: string, direction: "incoming" | "outgoing" = "incoming"): Promise<ClientDocumentRecord> {
  const row = sqlite.prepare("SELECT id, contact_id AS contactId, description, created_at AS createdAt FROM activities WHERE id=?").get(activityId) as { id: string; contactId: string; description: string; createdAt: number } | undefined;
  if (!row) throw new Error("Сообщение не найдено");
  const media = decodeMedia(row.description);
  if (!media) throw new Error("Файл пришёл до обновления CRM — его можно открыть только в Telegram");
  const sourceMessageId = activityId.replace(/^tg:/, "");
  const existing = sqlite.prepare(`SELECT id, contact_id AS contactId, kind, name, stored_name AS storedName, mime_type AS mimeType, size_bytes AS sizeBytes, created_at AS createdAt,
      source_channel AS sourceChannel, source_message_id AS sourceMessageId FROM client_documents WHERE contact_id=? AND source_channel='telegram' AND source_message_id=? LIMIT 1`).get(row.contactId, sourceMessageId) as ClientDocumentRecord | undefined;
  if (existing) return existing;
  if (Number(media.size || 0) > 20 * 1024 * 1024) throw new Error("Файл больше 20 МБ — Telegram не отдаёт такие боту, откройте его в Telegram");
  const token = getSetting(INTEGRATION_KEYS.telegramBotToken);
  if (!token) throw new Error("Не настроен Telegram-бот");
  const info = await telegramApiRequest<{ file_path?: string; file_size?: number }>(token, "getFile", { file_id: media.fileId });
  if (!info.ok || !info.result?.file_path) throw new Error(`Telegram не отдал файл: ${info.description || "нет пути к файлу"}`);
  const bytes = await telegramFileDownload(token, info.result.file_path);
  const ext = info.result.file_path.split(".").pop();
  let name = media.name;
  if (!/\.[a-z0-9]{2,4}$/i.test(name) && ext) name = `${name}.${ext}`;
  const saved = saveClientDocument({
    contactId: row.contactId, kind: "other", name, mimeType: media.mime, bytes: new Uint8Array(bytes),
    sourceChannel: "telegram", sourceMessageId, sourceAttachmentId: media.uniqueId || media.fileId, sourceDirection: direction,
    createdAt: new Date(Number(row.createdAt) > 1e12 ? Number(row.createdAt) : Number(row.createdAt) * 1000),
  });
  if (!saved) throw new Error("Не удалось сохранить файл");
  return saved as ClientDocumentRecord;
}
