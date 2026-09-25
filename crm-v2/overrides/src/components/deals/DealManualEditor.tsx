"use client";
import {useState} from "react";
import {useRouter} from "next/navigation";

export function DealManualEditor({dealId,value,receivedAmount,stageId,stages,lossReason}:{dealId:string;value:number;receivedAmount:number;stageId:string;stages:Array<{id:string;name:string;isLost:boolean}>;lossReason?:string|null}){
 const r=useRouter();
 const [v,setV]=useState(String((value||0)/100));
 const [received,setReceived]=useState(String((receivedAmount||0)/100));
 const [s,setS]=useState(stageId);
 const [reason,setReason]=useState(lossReason||"");
 const [busy,setBusy]=useState(false);
 const selected=stages.find(x=>x.id===s);
 function rubles(value:string){return Math.max(0,Math.round((Number(value.replace(/\s/g,"").replace(",","."))||0)*100))}
 async function save(){
   setBusy(true);
   try{
     const res=await fetch("/api/deals/"+dealId,{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({
       value:rubles(v),receivedAmount:rubles(received),stageId:s,lossReason:selected?.isLost?reason:null
     })});
     if(!res.ok)throw new Error((await res.json()).error||"Не удалось сохранить");
     r.refresh();
   }catch(e:any){alert(e.message)}finally{setBusy(false)}
 }
 return <div className="rounded-[24px] border border-slate-200/80 bg-white p-4 shadow-sm">
   <div className="mb-3 text-sm font-semibold">Управление сделкой</div>
   <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]">
     <label className="text-xs text-slate-500">Оговоренная сумма, ₽<input value={v} onChange={e=>setV(e.target.value)} inputMode="decimal" className="mt-1 w-full rounded-xl border px-3 py-2 text-sm text-slate-900"/></label>
     <label className="text-xs text-slate-500">Получено от клиента, ₽<input value={received} onChange={e=>setReceived(e.target.value)} inputMode="decimal" className="mt-1 w-full rounded-xl border px-3 py-2 text-sm text-slate-900"/></label>
     <label className="text-xs text-slate-500">Статус<select value={s} onChange={e=>setS(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm text-slate-900">{stages.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
     <button onClick={save} disabled={busy} className="self-end rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50">{busy?"Сохраняю…":"Сохранить"}</button>
   </div>
   {selected?.isLost&&<label className="mt-3 block text-xs text-slate-500">Причина отказа<input value={reason} onChange={e=>setReason(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm text-slate-900" placeholder="Почему клиент отказался"/></label>}
   <p className="mt-2 text-[11px] text-slate-400">Статус и обе суммы меняются только вручную. AI их не перезаписывает.</p>
 </div>
}
