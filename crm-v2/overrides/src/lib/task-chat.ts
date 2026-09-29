import { sqlite } from "@/db";

/**
 * Чат по задаче: владелец и менеджер уточняют, что именно нужно сделать.
 * task_reads — когда человек последний раз открывал чат (для отметки «новое»).
 */
let ready = false;
export function ensureTaskChat() {
  if (ready) return;
  sqlite.exec(`CREATE TABLE IF NOT EXISTS task_comments (
      id TEXT PRIMARY KEY, task_id TEXT NOT NULL, author_id TEXT NOT NULL, author_name TEXT NOT NULL, text TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments(task_id, created_at);
    CREATE TABLE IF NOT EXISTS task_reads (task_id TEXT NOT NULL, member_id TEXT NOT NULL, read_at INTEGER NOT NULL, PRIMARY KEY (task_id, member_id));`);
  const cols = sqlite.prepare("PRAGMA table_info(activities)").all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === "created_by")) sqlite.exec("ALTER TABLE activities ADD COLUMN created_by TEXT");
  ready = true;
}

export type Comment = { id: string; authorId: string; authorName: string; text: string; createdAt: number };

export function listComments(taskId: string): Comment[] {
  ensureTaskChat();
  return sqlite.prepare("SELECT id, author_id AS authorId, author_name AS authorName, text, created_at AS createdAt FROM task_comments WHERE task_id=? ORDER BY created_at").all(taskId) as Comment[];
}

export function addComment(taskId: string, author: { id: string; name: string }, text: string): Comment {
  ensureTaskChat();
  const t = text.trim().slice(0, 4000);
  if (!t) throw new Error("Пустое сообщение");
  const c = { id: crypto.randomUUID(), authorId: author.id, authorName: author.name, text: t, createdAt: Date.now() };
  sqlite.prepare("INSERT INTO task_comments(id, task_id, author_id, author_name, text, created_at) VALUES(?,?,?,?,?,?)").run(c.id, taskId, c.authorId, c.authorName, c.text, c.createdAt);
  markRead(taskId, author.id);
  return c;
}

export function markRead(taskId: string, memberId: string) {
  ensureTaskChat();
  sqlite.prepare("INSERT INTO task_reads(task_id, member_id, read_at) VALUES(?,?,?) ON CONFLICT(task_id, member_id) DO UPDATE SET read_at=excluded.read_at").run(taskId, memberId, Date.now());
}

/** Сколько сообщений и сколько новых (от другого человека после последнего прочтения). */
export function commentStats(memberId: string): Map<string, { count: number; unread: number }> {
  ensureTaskChat();
  const rows = sqlite.prepare(`SELECT c.task_id AS taskId, COUNT(*) AS count,
      SUM(CASE WHEN c.author_id<>? AND c.created_at > COALESCE(r.read_at, 0) THEN 1 ELSE 0 END) AS unread
    FROM task_comments c LEFT JOIN task_reads r ON r.task_id=c.task_id AND r.member_id=? GROUP BY c.task_id`).all(memberId, memberId) as Array<{ taskId: string; count: number; unread: number }>;
  return new Map(rows.map((r) => [r.taskId, { count: Number(r.count), unread: Number(r.unread) }]));
}

/** Менеджер работает только со своими задачами; владелец — со всеми. */
export function canAccessTask(actor: { id: string; role: string }, task: { ownerId: string | null }) {
  return actor.role === "owner" || task.ownerId === actor.id;
}
