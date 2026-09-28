import { sqlite } from "@/db";

/**
 * Удаление сделки/клиента без падений на FOREIGN KEY.
 *
 * В базе много таблиц, созданных разными модулями (экономика, закупки,
 * доставка, AI, документы…). Часть из них ссылается на deals/contacts без
 * ON DELETE CASCADE, поэтому простой DELETE падал с ошибкой 500.
 * Здесь связи находятся динамически через PRAGMA foreign_key_list:
 * обязательные ссылки удаляются вместе с записью, необязательные обнуляются.
 * Таблицы с колонкой deal_id / contact_id без FK тоже чистятся от «сирот».
 */

type Fk = { table: string; column: string; notNull: boolean };

const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;

function userTables(): string[] {
  return (sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as Array<{ name: string }>).map((r) => r.name);
}

function referencesTo(target: string): Fk[] {
  const out: Fk[] = [];
  for (const table of userTables()) {
    const fks = sqlite.prepare(`PRAGMA foreign_key_list(${quote(table)})`).all() as Array<{ table: string; from: string }>;
    const cols = sqlite.prepare(`PRAGMA table_info(${quote(table)})`).all() as Array<{ name: string; notnull: number }>;
    for (const fk of fks) {
      if (fk.table !== target) continue;
      const col = cols.find((c) => c.name === fk.from);
      out.push({ table, column: fk.from, notNull: Boolean(col?.notnull) });
    }
  }
  return out;
}

function looseColumns(column: string, exclude: Set<string>): Array<{ table: string; notNull: boolean }> {
  const out: Array<{ table: string; notNull: boolean }> = [];
  for (const table of userTables()) {
    if (exclude.has(table)) continue;
    const cols = sqlite.prepare(`PRAGMA table_info(${quote(table)})`).all() as Array<{ name: string; notnull: number; pk: number }>;
    const col = cols.find((c) => c.name === column);
    if (col) out.push({ table, notNull: Boolean(col.notnull || col.pk) });
  }
  return out;
}

function detach(target: "deals" | "contacts", ids: string[]) {
  if (!ids.length) return;
  const refs = referencesTo(target);
  const marks = ids.map(() => "?").join(",");
  for (const ref of refs) {
    if (ref.table === "deals" && target === "contacts") continue; // сделки клиента удаляются явно
    if (ref.notNull) sqlite.prepare(`DELETE FROM ${quote(ref.table)} WHERE ${quote(ref.column)} IN (${marks})`).run(...ids);
    else sqlite.prepare(`UPDATE ${quote(ref.table)} SET ${quote(ref.column)}=NULL WHERE ${quote(ref.column)} IN (${marks})`).run(...ids);
  }
  const column = target === "deals" ? "deal_id" : "contact_id";
  const skip = new Set<string>([target, ...refs.map((r) => r.table)]);
  if (target === "contacts") skip.add("deals");
  for (const { table, notNull } of looseColumns(column, skip)) {
    // Переписку (сообщения, письма) не теряем: если ссылка необязательная — просто отвязываем.
    if (notNull) sqlite.prepare(`DELETE FROM ${quote(table)} WHERE ${quote(column)} IN (${marks})`).run(...ids);
    else sqlite.prepare(`UPDATE ${quote(table)} SET ${quote(column)}=NULL WHERE ${quote(column)} IN (${marks})`).run(...ids);
  }
}

export function deleteDealsCascade(ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return 0;
  const run = sqlite.transaction(() => {
    detach("deals", unique);
    const marks = unique.map(() => "?").join(",");
    return Number(sqlite.prepare(`DELETE FROM deals WHERE id IN (${marks})`).run(...unique).changes || 0);
  });
  return run();
}

export function deleteContactsCascade(ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return { contacts: 0, deals: 0 };
  const run = sqlite.transaction(() => {
    const marks = unique.map(() => "?").join(",");
    const dealIds = (sqlite.prepare(`SELECT id FROM deals WHERE contact_id IN (${marks})`).all(...unique) as Array<{ id: string }>).map((r) => r.id);
    if (dealIds.length) {
      detach("deals", dealIds);
      sqlite.prepare(`DELETE FROM deals WHERE id IN (${dealIds.map(() => "?").join(",")})`).run(...dealIds);
    }
    detach("contacts", unique);
    const removed = Number(sqlite.prepare(`DELETE FROM contacts WHERE id IN (${marks})`).run(...unique).changes || 0);
    return { contacts: removed, deals: dealIds.length };
  });
  return run();
}
