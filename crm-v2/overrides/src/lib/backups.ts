import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { DB_PATH } from "@/db";

const BACKUP_DIR = process.env.CRM_BACKUP_PATH || path.join(path.dirname(DB_PATH), "backups");
const RESTORE_MARKER = `${DB_PATH}.restore-pending`;
const KEEP_DAYS = Math.max(7, Number(process.env.CRM_BACKUP_KEEP_DAYS || 30));

function ensureDir() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function safeName(value: string) {
  const name = path.basename(String(value || ""));
  if (!/^crm-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}(?:-[a-z0-9_-]+)?\.db$/i.test(name)) {
    throw new Error("Некорректное имя резервной копии");
  }
  return name;
}

function pruneBackups() {
  ensureDir();
  const cutoff = Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000;
  for (const item of fs.readdirSync(BACKUP_DIR)) {
    if (!item.endsWith(".db")) continue;
    const full = path.join(BACKUP_DIR, item);
    try {
      const stat = fs.statSync(full);
      if (stat.mtimeMs < cutoff) fs.rmSync(full, { force: true });
    } catch {}
  }
}

export async function createBackup(label = "auto") {
  ensureDir();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").replace("Z", "");
  const suffix = String(label || "auto").toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24);
  const name = `crm-${stamp}${suffix ? `-${suffix}` : ""}.db`;
  const target = path.join(BACKUP_DIR, name);
  const source = new Database(DB_PATH, { readonly: true, fileMustExist: true, timeout: 15000 });
  try {
    await source.backup(target);
  } finally {
    source.close();
  }
  const verify = new Database(target, { readonly: true, fileMustExist: true });
  try {
    const check = verify.pragma("quick_check", { simple: true });
    if (String(check).toLowerCase() !== "ok") throw new Error(`Backup integrity check failed: ${check}`);
  } finally {
    verify.close();
  }
  pruneBackups();
  return backupInfo(name);
}

function backupInfo(name: string) {
  const full = path.join(BACKUP_DIR, name);
  const stat = fs.statSync(full);
  return {
    name,
    size: stat.size,
    createdAt: stat.mtimeMs,
    path: full,
  };
}

export function listBackups() {
  ensureDir();
  return fs.readdirSync(BACKUP_DIR)
    .filter((name) => name.endsWith(".db"))
    .map((name) => {
      try { return backupInfo(name); } catch { return null; }
    })
    .filter(Boolean)
    .sort((a: any, b: any) => b.createdAt - a.createdAt);
}

export function backupFile(name: string) {
  ensureDir();
  const clean = safeName(name);
  const full = path.join(BACKUP_DIR, clean);
  if (!fs.existsSync(full)) throw new Error("Резервная копия не найдена");
  return full;
}

export function requestRestore(name: string) {
  const full = backupFile(name);
  const check = new Database(full, { readonly: true, fileMustExist: true });
  try {
    const integrity = check.pragma("quick_check", { simple: true });
    if (String(integrity).toLowerCase() !== "ok") throw new Error("Резервная копия повреждена");
  } finally {
    check.close();
  }
  fs.writeFileSync(RESTORE_MARKER, full, "utf8");
  return { scheduled: true, name: path.basename(full) };
}
