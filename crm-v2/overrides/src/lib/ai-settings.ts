import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const DB_PATH = process.env.CRM_DB_PATH || path.join(process.cwd(), "data", "crm.db");
const sqlite = new Database(DB_PATH, { timeout: 15000 });
try { sqlite.pragma("journal_mode = WAL"); } catch {}

sqlite.exec(`CREATE TABLE IF NOT EXISTS crm_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);

const secret = crypto.createHash("sha256").update(String(process.env.CRM_SECRET || process.env.SESSION_SECRET || DB_PATH)).digest();
function encrypt(value:string){
  const iv=crypto.randomBytes(12); const cipher=crypto.createCipheriv("aes-256-gcm",secret,iv);
  const body=Buffer.concat([cipher.update(value,"utf8"),cipher.final()]); const tag=cipher.getAuthTag();
  return Buffer.concat([iv,tag,body]).toString("base64");
}
function decrypt(value:string){
  const b=Buffer.from(value,"base64"); const iv=b.subarray(0,12), tag=b.subarray(12,28), body=b.subarray(28);
  const d=crypto.createDecipheriv("aes-256-gcm",secret,iv); d.setAuthTag(tag);
  return Buffer.concat([d.update(body),d.final()]).toString("utf8");
}
function row(key:string){return sqlite.prepare("SELECT value FROM crm_settings WHERE key=?").get(key) as {value?:string}|undefined}
export function getOpenAiKey(){
  const env=String(process.env.OPENAI_API_KEY||"").trim(); if(env) return env;
  const v=row("openai_api_key_encrypted")?.value; if(!v)return ""; try{return decrypt(v)}catch{return ""}
}
export function openAiSettings(){
  const key=getOpenAiKey(); const model=row("openai_crm_model")?.value || process.env.OPENAI_CRM_MODEL || "gpt-5.4-mini";
  return {configured:Boolean(key),masked:key?`${key.slice(0,7)}••••••••${key.slice(-4)}`:"",model};
}
export function saveOpenAiSettings(key:string,model?:string){
  if(key.trim()) sqlite.prepare("INSERT INTO crm_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run("openai_api_key_encrypted",encrypt(key.trim()));
  if(model) sqlite.prepare("INSERT INTO crm_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run("openai_crm_model",model);
  return openAiSettings();
}
export function clearOpenAiKey(){sqlite.prepare("DELETE FROM crm_settings WHERE key='openai_api_key_encrypted'").run()}
