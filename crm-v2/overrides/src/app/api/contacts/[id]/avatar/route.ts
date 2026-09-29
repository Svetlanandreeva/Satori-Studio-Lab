import fs from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { sqlite } from "@/db";
import { INTEGRATION_KEYS, getSetting, telegramApiRequest, telegramFileDownload } from "@/lib/satori-integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DB_PATH = process.env.CRM_DB_PATH || path.join(process.cwd(), "data", "crm.db");
const DIR = path.join(process.env.CRM_CLIENT_FILES_PATH || path.join(path.dirname(DB_PATH), "client-files"), "avatars");
// Прозрачная картинка вместо 404: под ней остаются инициалы, а в консоли нет ошибок.
const EMPTY = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
const empty = () => new NextResponse(EMPTY, { headers: { "content-type": "image/png", "cache-control": "private, max-age=3600" } });
const FRESH_MS = 7 * 24 * 3600 * 1000;
const MISS_MS = 24 * 3600 * 1000; // фото скрыто или его нет
const RETRY_MS = 30 * 60 * 1000; // сеть/Telegram не ответили — попробуем через полчаса

type Photo = { file_id: string; width?: number; file_size?: number };

/** Аватар клиента из Telegram (кэш на неделю; если фото скрыто — пробуем раз в сутки). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[\w-]{6,64}$/.test(id)) return empty();
  fs.mkdirSync(DIR, { recursive: true });
  const file = path.join(DIR, `${id}.jpg`);
  const miss = path.join(DIR, `${id}.none`);
  const serve = () => new NextResponse(fs.readFileSync(file), { headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=86400" } });
  const age = (p: string) => (fs.existsSync(p) ? Date.now() - fs.statSync(p).mtimeMs : Infinity);

  if (age(file) < FRESH_MS) return serve();
  const missAge = age(miss);
  const missIsHard = fs.existsSync(miss) && fs.readFileSync(miss, "utf8") === "none";
  if (missAge < (missIsHard ? MISS_MS : RETRY_MS)) return fs.existsSync(file) ? serve() : empty();

  const contact = sqlite.prepare("SELECT notes FROM contacts WHERE id=?").get(id) as { notes?: string } | undefined;
  const userId = String(contact?.notes || "").match(/\[telegram-chat:(-?\d+)\]/)?.[1];
  const token = getSetting(INTEGRATION_KEYS.telegramBotToken);
  try {
    if (!userId || Number(userId) < 0 || !token) throw new Error("no telegram user");
    const photos = await telegramApiRequest<{ photos?: Photo[][] }>(token, "getUserProfilePhotos", { user_id: Number(userId), limit: 1 });
    if (!photos.ok) throw new Error(`retry: ${photos.description || "telegram error"}`);
    const sizes = photos.result?.photos?.[0] || [];
    const pick = [...sizes].sort((a, b) => Number(a.width || 0) - Number(b.width || 0)).find((s) => Number(s.width || 0) >= 160) || sizes[sizes.length - 1];
    if (!pick) throw new Error("no photo");
    const info = await telegramApiRequest<{ file_path?: string }>(token, "getFile", { file_id: pick.file_id });
    if (!info.result?.file_path) throw new Error("no file");
    fs.writeFileSync(file, await telegramFileDownload(token, info.result.file_path));
    if (fs.existsSync(miss)) fs.unlinkSync(miss);
    return serve();
  } catch (error) {
    // «none» — у человека нет фото или оно скрыто; иначе это временная ошибка.
    const soft = error instanceof Error && /^retry:|timeout|ECONN|ENOTFOUND|EAI_AGAIN|HTTP/i.test(error.message);
    fs.writeFileSync(miss, soft ? "retry" : "none");
    return fs.existsSync(file) ? serve() : empty();
  }
}
