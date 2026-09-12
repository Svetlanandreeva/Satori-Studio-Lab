import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { sqlite } from "@/db";
import { listProjects } from "@/lib/projects";

export type TeamRole = "owner" | "manager" | "viewer";
export interface SessionActor {
  id: string;
  name: string;
  role: TeamRole;
}

const DEFAULT_CHECKLIST = [
  { key: "model", title: "3D-модель / макет", order: 10 },
  { key: "approval", title: "Согласование с клиентом", order: 20 },
  { key: "procurement", title: "Закупка материалов / комплектующих", order: 30 },
  { key: "production", title: "Производство / печать", order: 40 },
  { key: "finish", title: "Покраска / финишная обработка", order: 50 },
  { key: "quality", title: "Контроль качества", order: 60 },
  { key: "packing", title: "Упаковка", order: 70 },
] as const;

function rows<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T[] {
  return sqlite.prepare(sql).all(...params) as T[];
}

function row<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T | null {
  return (sqlite.prepare(sql).get(...params) as T | undefined) || null;
}

export function hashTeamPassword(password: string): string {
  const value = String(password || "");
  if (value.length < 8) throw new Error("Пароль сотрудника должен быть не короче 8 символов");
  const salt = randomBytes(16).toString("hex");
  const digest = scryptSync(value, salt, 32).toString("hex");
  return `scrypt$${salt}$${digest}`;
}

function verifyTeamPassword(password: string, stored: string | null): boolean {
  if (!stored) return false;
  const [kind, salt, expectedHex] = stored.split("$");
  if (kind !== "scrypt" || !salt || !expectedHex) return false;
  const actual = scryptSync(String(password || ""), salt, 32);
  const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function authenticateTeamMember(login: string, password: string): SessionActor | null {
  const normalized = String(login || "").trim().toLowerCase();
  if (!normalized) return null;
  const member = row<{
    id: string; name: string; role: string; active: number; password_hash: string | null;
  }>("SELECT id,name,role,active,password_hash FROM team_members WHERE lower(login)=? LIMIT 1", normalized);
  if (!member || !member.active || !verifyTeamPassword(password, member.password_hash)) return null;
  const role: TeamRole = member.role === "owner" || member.role === "viewer" ? member.role : "manager";
  return { id: member.id, name: member.name, role };
}

export function listTeamMembers() {
  return rows<{
    id: string; name: string; login: string | null; role: TeamRole; active: number; createdAt: number; updatedAt: number;
  }>(`SELECT id,name,login,role,active,created_at AS createdAt,updated_at AS updatedAt
      FROM team_members ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END, name`)
    .map((item) => ({ ...item, active: Boolean(item.active) }));
}

export function createTeamMember(input: { name: string; login: string; password: string; role?: string }) {
  const name = String(input.name || "").trim();
  const login = String(input.login || "").trim().toLowerCase();
  if (!name) throw new Error("Укажите имя сотрудника");
  if (!/^[a-z0-9._-]{3,40}$/i.test(login)) throw new Error("Логин: 3–40 символов, латиница, цифры, точка, дефис или подчёркивание");
  const existing = row("SELECT id FROM team_members WHERE lower(login)=?", login);
  if (existing) throw new Error("Такой логин уже используется");
  const role: TeamRole = input.role === "viewer" || input.role === "owner" ? input.role : "manager";
  const now = Date.now();
  const id = crypto.randomUUID();
  sqlite.prepare(`INSERT INTO team_members(id,name,login,password_hash,role,active,created_at,updated_at)
    VALUES(?,?,?,?,?,1,?,?)`).run(id, name, login, hashTeamPassword(input.password), role, now, now);
  return listTeamMembers().find((item) => item.id === id) || null;
}

export function updateTeamMember(input: { id: string; name?: string; login?: string; password?: string; role?: string; active?: boolean }) {
  const current = row<{ id: string; name: string; login: string | null; role: string; active: number }>(
    "SELECT id,name,login,role,active FROM team_members WHERE id=?", input.id
  );
  if (!current) throw new Error("Сотрудник не найден");
  if (current.id === "owner" && input.active === false) throw new Error("Основного владельца нельзя отключить");
  const name = input.name === undefined ? current.name : String(input.name || "").trim();
  const login = input.login === undefined ? current.login : (String(input.login || "").trim().toLowerCase() || null);
  const role: TeamRole = input.role === undefined
    ? (current.role as TeamRole)
    : input.role === "owner" || input.role === "viewer" ? input.role : "manager";
  const passwordHash = input.password ? hashTeamPassword(input.password) : null;
  if (login) {
    const duplicate = row<{ id: string }>("SELECT id FROM team_members WHERE lower(login)=? AND id<>? LIMIT 1", login, input.id);
    if (duplicate) throw new Error("Такой логин уже используется");
  }
  if (passwordHash) {
    sqlite.prepare("UPDATE team_members SET name=?,login=?,role=?,active=?,password_hash=?,updated_at=? WHERE id=?")
      .run(name, login, role, input.active === undefined ? current.active : input.active ? 1 : 0, passwordHash, Date.now(), input.id);
  } else {
    sqlite.prepare("UPDATE team_members SET name=?,login=?,role=?,active=?,updated_at=? WHERE id=?")
      .run(name, login, role, input.active === undefined ? current.active : input.active ? 1 : 0, Date.now(), input.id);
  }
  return listTeamMembers().find((item) => item.id === input.id) || null;
}

export function deleteTeamMember(id: string) {
  if (id === "owner") throw new Error("Основного владельца нельзя удалить");
  const used = row<{ count: number }>("SELECT COUNT(*) AS count FROM deals WHERE owner_id=?", id)?.count || 0;
  if (used > 0) throw new Error("Сначала переназначьте сделки этого сотрудника");
  sqlite.prepare("UPDATE activities SET owner_id=NULL WHERE owner_id=?").run(id);
  return sqlite.prepare("DELETE FROM team_members WHERE id=?").run(id).changes > 0;
}

export function writeAuditLog(actor: SessionActor | null, action: string, entityType: string, entityId?: string | null, details?: unknown) {
  try {
    sqlite.prepare(`INSERT INTO audit_log(id,actor_id,actor_name,action,entity_type,entity_id,details,created_at)
      VALUES(?,?,?,?,?,?,?,?)`).run(
      crypto.randomUUID(), actor?.id || null, actor?.name || null, action, entityType, entityId || null,
      details === undefined ? null : JSON.stringify(details), Date.now()
    );
  } catch (error) {
    console.error("CRM audit log failed", error);
  }
}

export function listAuditLog(limit = 80) {
  return rows(`SELECT id,actor_id AS actorId,actor_name AS actorName,action,entity_type AS entityType,
      entity_id AS entityId,details,created_at AS createdAt FROM audit_log ORDER BY created_at DESC LIMIT ?`, Math.max(1, Math.min(300, limit)));
}

export function annotateLatestStageHistory(dealId: string, input: { reason?: string | null; changedBy?: string | null }) {
  const latest = row<{ id: string }>("SELECT id FROM deal_stage_history WHERE deal_id=? ORDER BY created_at DESC,id DESC LIMIT 1", dealId);
  if (!latest) return;
  sqlite.prepare("UPDATE deal_stage_history SET reason=COALESCE(?,reason),changed_by=COALESCE(?,changed_by) WHERE id=?")
    .run(input.reason || null, input.changedBy || null, latest.id);
}

export function listDealHistory(dealId: string) {
  return rows(`SELECT h.id,h.deal_id AS dealId,h.from_stage_id AS fromStageId,h.to_stage_id AS toStageId,
      fs.name AS fromStage,ts.name AS toStage,h.reason,h.changed_by AS changedBy,
      tm.name AS changedByName,h.created_at AS createdAt
    FROM deal_stage_history h
    LEFT JOIN pipeline_stages fs ON fs.id=h.from_stage_id
    LEFT JOIN pipeline_stages ts ON ts.id=h.to_stage_id
    LEFT JOIN team_members tm ON tm.id=h.changed_by
    WHERE h.deal_id=? ORDER BY h.created_at ASC,h.id ASC`, dealId);
}

export function listTemplates() {
  return rows(`SELECT id,title,channel,body,sort_order AS sortOrder,created_at AS createdAt,updated_at AS updatedAt
    FROM message_templates ORDER BY sort_order ASC,title ASC`);
}

export function saveTemplate(input: { id?: string; title: string; channel?: string; body: string; sortOrder?: number }) {
  const title = String(input.title || "").trim();
  const body = String(input.body || "").trim();
  if (!title || !body) throw new Error("Укажите название и текст шаблона");
  const channel = ["all", "email", "telegram"].includes(String(input.channel)) ? String(input.channel) : "all";
  const sortOrder = Number.isFinite(Number(input.sortOrder)) ? Number(input.sortOrder) : 100;
  const now = Date.now();
  if (input.id) {
    sqlite.prepare("UPDATE message_templates SET title=?,channel=?,body=?,sort_order=?,updated_at=? WHERE id=?")
      .run(title, channel, body, sortOrder, now, input.id);
    return listTemplates().find((item: any) => item.id === input.id) || null;
  }
  const id = crypto.randomUUID();
  sqlite.prepare("INSERT INTO message_templates(id,title,channel,body,sort_order,created_at,updated_at) VALUES(?,?,?,?,?,?,?)")
    .run(id, title, channel, body, sortOrder, now, now);
  return listTemplates().find((item: any) => item.id === id) || null;
}

export function deleteTemplate(id: string) {
  return sqlite.prepare("DELETE FROM message_templates WHERE id=?").run(id).changes > 0;
}

export function ensureProjectChecklist(dealId: string) {
  const existing = rows<{ key: string }>("SELECT key FROM project_checklist WHERE deal_id=?", dealId);
  const keys = new Set(existing.map((item) => item.key));
  const insert = sqlite.prepare("INSERT OR IGNORE INTO project_checklist(id,deal_id,key,title,done,sort_order,updated_at) VALUES(?,?,?,?,0,?,?)");
  for (const step of DEFAULT_CHECKLIST) {
    if (!keys.has(step.key)) insert.run(crypto.randomUUID(), dealId, step.key, step.title, step.order, Date.now());
  }
}

export function listProjectChecklist(dealId: string) {
  ensureProjectChecklist(dealId);
  return rows(`SELECT id,deal_id AS dealId,key,title,done,sort_order AS sortOrder,updated_at AS updatedAt
    FROM project_checklist WHERE deal_id=? ORDER BY sort_order ASC`, dealId)
    .map((item: any) => ({ ...item, done: Boolean(item.done) }));
}

export function setChecklistItem(input: { dealId: string; key: string; done: boolean }) {
  ensureProjectChecklist(input.dealId);
  sqlite.prepare("UPDATE project_checklist SET done=?,updated_at=? WHERE deal_id=? AND key=?")
    .run(input.done ? 1 : 0, Date.now(), input.dealId, input.key);
  return listProjectChecklist(input.dealId);
}

export function listProductionProjects() {
  const projects = listProjects() as Array<Record<string, unknown>>;
  return projects.map((project) => {
    const dealId = String(project.dealId || "");
    const checklist = dealId ? listProjectChecklist(dealId) : [];
    const completed = checklist.filter((item: any) => item.done).length;
    return {
      ...project,
      checklist,
      checklistProgress: checklist.length ? Math.round((completed / checklist.length) * 100) : 0,
    };
  });
}

export function mergeContacts(sourceId: string, targetId: string, actor: SessionActor | null = null) {
  if (!sourceId || !targetId || sourceId === targetId) throw new Error("Выберите двух разных клиентов");
  const source = row<any>("SELECT * FROM contacts WHERE id=?", sourceId);
  const target = row<any>("SELECT * FROM contacts WHERE id=?", targetId);
  if (!source || !target) throw new Error("Клиент не найден");

  const transaction = sqlite.transaction(() => {
    const mergedNotes = [target.notes, source.notes]
      .filter((value, index, all) => value && all.indexOf(value) === index)
      .join("\n\n");
    sqlite.prepare(`UPDATE contacts SET
      name=CASE WHEN length(trim(name))>0 THEN name ELSE ? END,
      email=COALESCE(NULLIF(email,''),?),phone=COALESCE(NULLIF(phone,''),?),company=COALESCE(NULLIF(company,''),?),
      notes=?,score=MAX(score,?),temperature=CASE WHEN temperature='hot' OR ?='hot' THEN 'hot' WHEN temperature='warm' OR ?='warm' THEN 'warm' ELSE temperature END,
      qualification=CASE WHEN qualification<>'new' THEN qualification ELSE ? END,updated_at=? WHERE id=?`)
      .run(source.name, source.email, source.phone, source.company, mergedNotes || null, Number(source.score || 0), source.temperature, source.temperature, source.qualification || "new", Date.now(), targetId);
    sqlite.prepare("UPDATE deals SET contact_id=? WHERE contact_id=?").run(targetId, sourceId);
    sqlite.prepare("UPDATE activities SET contact_id=? WHERE contact_id=?").run(targetId, sourceId);
    sqlite.prepare("UPDATE email_threads SET contact_id=? WHERE contact_id=?").run(targetId, sourceId);
    try { sqlite.prepare("UPDATE client_documents SET contact_id=? WHERE contact_id=?").run(targetId, sourceId); } catch {}
    sqlite.prepare("DELETE FROM contacts WHERE id=?").run(sourceId);
  });
  transaction();
  writeAuditLog(actor, "merge_contacts", "contact", targetId, { sourceId, sourceName: source.name, targetName: target.name });
  return row("SELECT * FROM contacts WHERE id=?", targetId);
}

export function searchCrm(query: string) {
  const q = String(query || "").trim().toLowerCase();
  if (q.length < 2) return [];
  const like = `%${q}%`;
  const results: Array<Record<string, unknown>> = [];

  for (const item of rows<any>(`SELECT c.id,c.name,c.email,c.phone,c.company,c.source,
      d.id AS dealId,d.title AS dealTitle,ps.name AS stageName
    FROM contacts c LEFT JOIN deals d ON d.id=(SELECT d2.id FROM deals d2 JOIN pipeline_stages p2 ON p2.id=d2.stage_id
      WHERE d2.contact_id=c.id ORDER BY p2.is_lost ASC,p2.is_won ASC,d2.updated_at DESC LIMIT 1)
    LEFT JOIN pipeline_stages ps ON ps.id=d.stage_id
    WHERE lower(c.name) LIKE ? OR lower(COALESCE(c.email,'')) LIKE ? OR lower(COALESCE(c.phone,'')) LIKE ? OR lower(COALESCE(c.company,'')) LIKE ?
    LIMIT 8`, like, like, like, like)) {
    results.push({ type: "contact", id: item.id, title: item.name, subtitle: [item.company, item.email || item.phone, item.stageName].filter(Boolean).join(" · "), href: `/contacts/${item.id}` });
  }

  for (const item of rows<any>(`SELECT d.id,d.title,d.value,c.name AS contactName,ps.name AS stageName
    FROM deals d JOIN contacts c ON c.id=d.contact_id JOIN pipeline_stages ps ON ps.id=d.stage_id
    WHERE lower(d.title) LIKE ? OR lower(c.name) LIKE ? LIMIT 8`, like, like)) {
    results.push({ type: "deal", id: item.id, title: item.title, subtitle: `${item.contactName} · ${item.stageName}`, href: `/deals/${item.id}` });
  }

  for (const item of rows<any>(`SELECT id,remote_name AS remoteName,remote_email AS remoteEmail,subject,last_snippet AS lastSnippet
    FROM email_threads WHERE lower(remote_email) LIKE ? OR lower(COALESCE(remote_name,'')) LIKE ? OR lower(subject) LIKE ? OR lower(COALESCE(last_snippet,'')) LIKE ? LIMIT 6`, like, like, like, like)) {
    results.push({ type: "message", id: item.id, title: item.remoteName || item.remoteEmail, subtitle: item.subject, href: `/inbox?thread=email:${item.id}` });
  }

  try {
    for (const project of (listProjects() as Array<Record<string, unknown>>).filter((project) =>
      [project.title, project.contactName, project.company, project.phone, project.email, project.trackingCode]
        .filter(Boolean).some((value) => String(value).toLowerCase().includes(q))
    ).slice(0, 6)) {
      results.push({ type: "project", id: String(project.dealId), title: String(project.title || "Проект"), subtitle: `${project.contactName || ""} · ${project.stageName || ""}`, href: `/production?deal=${project.dealId}` });
    }
  } catch {}

  const seen = new Set<string>();
  return results.filter((item) => {
    const key = `${item.type}:${item.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 20);
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

export function getAnalyticsSnapshot() {
  const contacts = rows<any>("SELECT id,source FROM contacts WHERE qualification NOT IN ('spam','ignore')");
  const deals = rows<any>(`SELECT d.id,d.contact_id AS contactId,d.value,d.loss_reason AS lossReason,d.created_at AS createdAt,d.updated_at AS updatedAt,
    ps.name AS stageName,ps.is_won AS isWon,ps.is_lost AS isLost,c.source
    FROM deals d JOIN pipeline_stages ps ON ps.id=d.stage_id JOIN contacts c ON c.id=d.contact_id
    WHERE c.qualification NOT IN ('spam','ignore')`);
  const won = deals.filter((item) => item.isWon);
  const lost = deals.filter((item) => item.isLost);
  const active = deals.filter((item) => !item.isWon && !item.isLost);
  const projects = listProjects() as Array<Record<string, unknown>>;
  const projectMap = new Map(projects.map((item) => [String(item.dealId || ""), item]));

  const sourceMap = new Map<string, { source: string; contacts: number; deals: number; won: number; revenue: number; profit: number }>();
  for (const contact of contacts) {
    const source = String(contact.source || "other");
    const bucket = sourceMap.get(source) || { source, contacts: 0, deals: 0, won: 0, revenue: 0, profit: 0 };
    bucket.contacts += 1;
    sourceMap.set(source, bucket);
  }
  for (const deal of deals) {
    const source = String(deal.source || "other");
    const bucket = sourceMap.get(source) || { source, contacts: 0, deals: 0, won: 0, revenue: 0, profit: 0 };
    bucket.deals += 1;
    if (deal.isWon) bucket.won += 1;
    const project = projectMap.get(String(deal.id));
    bucket.revenue += Number(project?.receivedAmount || 0);
    bucket.profit += Number(project?.profit || 0);
    sourceMap.set(source, bucket);
  }

  const history = rows<any>(`SELECT h.deal_id AS dealId,h.to_stage_id AS toStageId,h.created_at AS createdAt,ps.name AS stageName
    FROM deal_stage_history h LEFT JOIN pipeline_stages ps ON ps.id=h.to_stage_id ORDER BY h.deal_id,h.created_at ASC`);
  const byDeal = new Map<string, any[]>();
  for (const item of history) {
    const bucket = byDeal.get(item.dealId) || [];
    bucket.push(item);
    byDeal.set(item.dealId, bucket);
  }
  const durationMap = new Map<string, number[]>();
  for (const [, items] of byDeal) {
    for (let index = 0; index < items.length - 1; index += 1) {
      const current = items[index];
      const next = items[index + 1];
      const hours = Math.max(0, (Number(next.createdAt) - Number(current.createdAt)) / 3_600_000);
      if (!current.stageName || hours > 24 * 365) continue;
      const bucket = durationMap.get(current.stageName) || [];
      bucket.push(hours);
      durationMap.set(current.stageName, bucket);
    }
  }

  const lossMap = new Map<string, number>();
  for (const deal of lost) {
    const reason = String(deal.lossReason || "Не указана");
    lossMap.set(reason, (lossMap.get(reason) || 0) + 1);
  }

  const responseMinutes: number[] = [];
  try {
    const messages = rows<any>("SELECT thread_id AS threadId,direction,received_at AS receivedAt FROM email_messages ORDER BY thread_id,received_at ASC");
    const threadMap = new Map<string, any[]>();
    for (const message of messages) { const bucket = threadMap.get(message.threadId) || []; bucket.push(message); threadMap.set(message.threadId, bucket); }
    for (const [, items] of threadMap) {
      for (let index = 0; index < items.length; index += 1) {
        if (items[index].direction !== "incoming") continue;
        const outgoing = items.slice(index + 1).find((item) => item.direction === "outgoing");
        if (!outgoing) continue;
        const minutes = (Number(outgoing.receivedAt) - Number(items[index].receivedAt)) / 60_000;
        if (minutes >= 0 && minutes <= 60 * 24 * 7) responseMinutes.push(minutes);
      }
    }
  } catch {}

  const revenue = projects.reduce((sum, item) => sum + Number(item.receivedAmount || 0), 0);
  const profit = projects.reduce((sum, item) => sum + Number(item.profit || 0), 0);
  const avgCheck = won.length ? won.reduce((sum, item) => sum + Number(item.value || 0), 0) / won.length : 0;

  return {
    totals: {
      contacts: contacts.length,
      activeDeals: active.length,
      wonDeals: won.length,
      lostDeals: lost.length,
      conversion: deals.length ? (won.length / deals.length) * 100 : 0,
      avgCheck,
      revenue,
      profit,
      avgFirstResponseMinutes: average(responseMinutes),
    },
    sources: Array.from(sourceMap.values()).map((item) => ({ ...item, conversion: item.deals ? (item.won / item.deals) * 100 : 0 })).sort((a, b) => b.deals - a.deals),
    stageDurations: Array.from(durationMap.entries()).map(([stage, values]) => ({ stage, avgHours: average(values), samples: values.length })),
    lossReasons: Array.from(lossMap.entries()).map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
  };
}
