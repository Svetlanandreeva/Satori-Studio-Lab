"use client";
import { useEffect,useRef,useState } from "react";
import { Loader2,MessageCircle,Send } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DealConversation({contactId,threadId}:{contactId:string;threadId?:string|null}){
 const [detail,setDetail]=useState<any>(null),[draft,setDraft]=useState(""),[busy,setBusy]=useState(false);const end=useRef<HTMLDivElement|null>(null);
 async function load(){
   if(threadId){
     const r=await fetch(`/api/inbox/${encodeURIComponent(threadId)}`,{cache:"no-store"});
     if(r.ok){const d=await r.json();setDetail({channel:"email",id:threadId,messages:d.messages||[],title:d.contact?.name||d.thread?.remoteName||"Клиент"});setTimeout(()=>end.current?.scrollIntoView({block:"end"}),20);return;}
   }
   const lists=await Promise.all([fetch("/api/inbox?filter=client",{cache:"no-store"}).then(r=>r.json()),fetch("/api/messages/telegram",{cache:"no-store"}).then(r=>r.json())]);
   const email=(lists[0].threads||[]).find((x:any)=>x.contactId===contactId);const tg=(lists[1].threads||[]).find((x:any)=>(x.contactId||x.id)===contactId);const chosen=tg?{channel:"telegram",id:tg.id}:email?{channel:"email",id:email.id}:null;
   if(!chosen){setDetail({empty:true});return;}
   const r=await fetch(chosen.channel==="telegram"?`/api/messages/telegram/${encodeURIComponent(chosen.id)}`:`/api/inbox/${encodeURIComponent(chosen.id)}`,{cache:"no-store"});const d=await r.json();setDetail({channel:chosen.channel,id:chosen.id,messages:d.messages||[],title:d.contact?.name||d.thread?.remoteName||"Клиент"});setTimeout(()=>end.current?.scrollIntoView({block:"end"}),20);
 }
 useEffect(()=>{void load()},[contactId,threadId]);
 async function send(){if(!draft.trim()||!detail?.id)return;setBusy(true);try{const r=detail.channel==="telegram"?await fetch("/api/integrations/telegram/reply",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({contactId,text:draft})}):await fetch(`/api/inbox/${encodeURIComponent(detail.id)}/reply`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({message:draft})});if(r.ok){setDraft("");await load();}}finally{setBusy(false)}}
 return <div className="flex h-[680px] min-h-0 flex-col overflow-hidden rounded-[24px] border border-slate-200/80 bg-white shadow-sm"><div className="border-b px-5 py-4"><div className="flex items-center gap-2 font-semibold"><MessageCircle className="h-4 w-4"/>Диалог с клиентом</div><div className="mt-1 text-xs text-slate-400">{detail?.channel==="telegram"?"Telegram":detail?.channel==="email"?"Почта":"Переписка"}</div></div><div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/60 p-4">{!detail?<div className="flex h-full items-center justify-center"><Loader2 className="h-5 w-5 animate-spin"/></div>:detail.empty?<div className="flex h-full items-center justify-center text-sm text-slate-400">Переписка с этой сделкой пока не найдена.</div>:<div className="space-y-2">{detail.messages.map((m:any)=><div key={m.id} className={`flex ${m.direction==="outgoing"?"justify-end":"justify-start"}`}><div className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap ${m.direction==="outgoing"?"bg-slate-900 text-white":"border bg-white text-slate-700"}`}>{m.bodyText||"—"}</div></div>)}<div ref={end}/></div>}</div>{detail&&!detail.empty&&<div className="border-t p-3"><div className="flex gap-2"><textarea value={draft} onChange={e=>setDraft(e.target.value)} rows={2} placeholder="Ответить клиенту…" className="min-h-[62px] flex-1 resize-none rounded-xl border px-3 py-2 text-sm outline-none"/><Button onClick={()=>void send()} disabled={busy||!draft.trim()} className="h-auto">{busy?<Loader2 className="h-4 w-4 animate-spin"/>:<Send className="h-4 w-4"/>}</Button></div></div>}</div>
}
