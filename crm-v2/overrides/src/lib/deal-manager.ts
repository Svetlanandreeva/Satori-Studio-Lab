import { sqlite } from "@/db";

export function getDealOwner(dealId: string) {
  try {
    return (sqlite.prepare(`SELECT tm.id,tm.name,tm.role FROM deals d LEFT JOIN team_members tm ON tm.id=d.owner_id WHERE d.id=?`).get(dealId) as {id:string;name:string;role:string}|undefined) || null;
  } catch { return null; }
}

export function isManagerDeal(dealId: string) {
  return getDealOwner(dealId)?.role === "manager";
}
