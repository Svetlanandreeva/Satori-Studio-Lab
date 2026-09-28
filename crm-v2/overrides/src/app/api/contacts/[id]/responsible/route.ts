import { NextRequest, NextResponse } from "next/server";
import { db, sqlite } from "@/db";
import { deals, pipelineStages, teamMembers } from "@/db/schema";
import { and, eq } from "drizzle-orm";

function settingKey(contactId:string){return `contact_owner:${contactId}`}
function savedOwner(contactId:string){try{return (sqlite.prepare("SELECT value FROM crm_settings WHERE key=?").get(settingKey(contactId)) as {value?:string}|undefined)?.value||null}catch{return null}}
function saveOwner(contactId:string,ownerId:string|null){if(!ownerId){sqlite.prepare("DELETE FROM crm_settings WHERE key=?").run(settingKey(contactId));return}sqlite.prepare("INSERT INTO crm_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(settingKey(contactId),ownerId)}

export async function GET(_request:NextRequest,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 const ownerId=savedOwner(id);
 const owner=ownerId?db.select().from(teamMembers).where(eq(teamMembers.id,ownerId)).get():null;
 return NextResponse.json({ownerId:owner?.id||null,ownerName:owner?.name||null,ownerRole:owner?.role||null});
}

export async function PUT(request:NextRequest,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 const body=await request.json() as Record<string,unknown>;
 const ownerId=String(body.ownerId||"").trim()||null;
 let owner=null as any;
 if(ownerId){owner=db.select().from(teamMembers).where(and(eq(teamMembers.id,ownerId),eq(teamMembers.active,true))).get();if(!owner)return NextResponse.json({error:"Ответственный не найден"},{status:400});}
 saveOwner(id,ownerId);
 const contactDeals=db.select({id:deals.id,stageId:deals.stageId}).from(deals).where(eq(deals.contactId,id)).all();
 const stages=db.select().from(pipelineStages).all();
 for(const deal of contactDeals){const stage=stages.find(s=>s.id===deal.stageId);if(stage?.isLost||stage?.isWon)continue;db.update(deals).set({ownerId,updatedAt:new Date()}).where(eq(deals.id,deal.id)).run();}
 return NextResponse.json({ownerId:owner?.id||null,ownerName:owner?.name||null,ownerRole:owner?.role||null,managerCommissionRate:owner?.role==="manager"?50:0});
}
