"use client";
import {useEffect,useState} from "react";
import {useRouter} from "next/navigation";
import {toast} from "sonner";

export function DealManualEditor({dealId,value,stageId,stages,lossReason}:{dealId:string;value:number;stageId:string;stages:Array<{id:string;name:string;isLost:boolean}>;lossReason?:string|null}){
 const r=useRouter();
 const [v,setV]=useState(String((value||0)/100));
 const [received,setReceived]=useState("0");
 const [s,setS]=useState(stageId);
 const [reason,setReason]=useState(lossReason||"");
 const [busy,setBusy]=useState(false);
 const selected=stages.find(x=>x.id===s);
 useEffect(()=>{fetch("/api/deals/"+dealId,{cache:"no-store"}).then(x=>x.json()).then(data=>setReceived(String((Number(data?.economics?.receivedAmount)||0)/100))).catch(()=>{})},[dealId]);
 function rubles(value:string){return Math.max(0,Math.round((Number(value.replace(/\s/g,"").replace(",","."))||0)*100))}
 async function save(){
   setBusy(true);
   try{
     if(selected?.isLost&&!reason.trim())throw new Error("Укажи причину отказа");
     const res=await fetch("/api/deals/"+dealId,{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({
       value:rubles(v),receivedAmount:rubles(received),stageId:s,lossReason:selected?.isLost?reason:null
     })});
     if(!res.ok)throw new Error((await res.json()).error||"Не удалось сохранить");
     toast.success("Сохранено");
     r.refresh();
   }catch(e:any){toast.error(e.message)}finally{setBusy(false)}
 }
 return <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
   <div className="mb-3 text-sm font-semibold">Этап и оплата</div>
   <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]">
     <label className="text-xs text-slate-500">Оговоренная сумма, ₽<input value={v} onChange={e=>setV(e.target.value)} inputMode="decimal" className="mt-1 w-full rounded-xl border px-3 py-2 text-sm text-slate-900"/></label>
     <label className="text-xs text-slate-500">Получено от клиента, ₽<input value={received} onChange={e=>setReceived(e.target.value)} inputMode="decimal" className="mt-1 w-full rounded-xl border px-3 py-2 text-sm text-slate-900"/></label>
     <label className="text-xs text-slate-500">Статус<select value={s} onChange={e=>setS(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm text-slate-900">{stages.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
     <button onClick={save} disabled={busy} className="self-end rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50">{busy?"Сохраняю…":"Сохранить"}</button>
   </div>
   {selected?.isLost&&<label className="mt-3 block text-xs text-slate-500">Причина отказа<input value={reason} onChange={e=>setReason(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm text-slate-900" placeholder="Почему клиент отказался"/></label>}
   
 </div>
}
