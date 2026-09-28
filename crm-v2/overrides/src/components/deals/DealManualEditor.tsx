"use client";
import {useEffect,useState} from "react";
import {useRouter} from "next/navigation";

function inputDate(value: unknown){
 if(!value)return "";
 const d=new Date(String(value));
 if(Number.isNaN(d.getTime()))return String(value).slice(0,10);
 const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,"0"),day=String(d.getDate()).padStart(2,"0");
 return `${y}-${m}-${day}`;
}

export function DealManualEditor({dealId,value,stageId,stages,lossReason}:{dealId:string;value:number;stageId:string;stages:Array<{id:string;name:string;isLost:boolean}>;lossReason?:string|null}){
 const r=useRouter();
 const [v,setV]=useState(String((value||0)/100));
 const [received,setReceived]=useState("0");
 const [paymentDate,setPaymentDate]=useState("");
 const [deadline,setDeadline]=useState("");
 const [s,setS]=useState(stageId);
 const [reason,setReason]=useState(lossReason||"");
 const [busy,setBusy]=useState(false);
 const selected=stages.find(x=>x.id===s);
 useEffect(()=>{fetch("/api/deals/"+dealId,{cache:"no-store"}).then(x=>x.json()).then(data=>{
   setReceived(String((Number(data?.economics?.receivedAmount)||0)/100));
   setPaymentDate(String(data?.paymentReceivedAt||""));
   setDeadline(inputDate(data?.expectedClose));
 }).catch(()=>{})},[dealId]);
 function rubles(value:string){return Math.max(0,Math.round((Number(value.replace(/\s/g,"").replace(",","."))||0)*100))}
 async function save(){
   setBusy(true);
   try{
     const res=await fetch("/api/deals/"+dealId,{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({
       value:rubles(v),receivedAmount:rubles(received),paymentReceivedAt:paymentDate||null,expectedClose:deadline||null,stageId:s,lossReason:selected?.isLost?reason:null
     })});
     if(!res.ok)throw new Error((await res.json()).error||"Не удалось сохранить");
     r.refresh();
   }catch(e:any){alert(e.message)}finally{setBusy(false)}
 }
 return <div className="studio-card p-4 sm:p-5">
   <div className="mb-1 text-sm font-semibold">Заказ, деньги и сроки</div>
   <p className="mb-4 text-xs text-slate-400">Сумма — сколько выставлено клиенту. Оплата — сколько реально поступило. Дата оплаты фиксирует старт оплаченного производства, дедлайн попадает в календарь.</p>
   <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
     <label className="text-xs text-slate-500">Сумма сделки, ₽<input value={v} onChange={e=>setV(e.target.value)} inputMode="decimal" className="mt-1 w-full rounded-xl border border-black/[.07] bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-violet-300 dark:border-white/[.09] dark:bg-white/[.04] dark:text-white"/></label>
     <label className="text-xs text-slate-500">Получено, ₽<input value={received} onChange={e=>setReceived(e.target.value)} inputMode="decimal" className="mt-1 w-full rounded-xl border border-black/[.07] bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-violet-300 dark:border-white/[.09] dark:bg-white/[.04] dark:text-white"/></label>
     <label className="text-xs text-slate-500">Дата получения оплаты<input type="date" value={paymentDate} onChange={e=>setPaymentDate(e.target.value)} className="mt-1 w-full rounded-xl border border-black/[.07] bg-white px-3 py-2.5 text-sm text-slate-900 outline-none dark:border-white/[.09] dark:bg-white/[.04] dark:text-white"/></label>
     <label className="text-xs text-slate-500">Дедлайн проекта<input type="date" value={deadline} onChange={e=>setDeadline(e.target.value)} className="mt-1 w-full rounded-xl border border-black/[.07] bg-white px-3 py-2.5 text-sm text-slate-900 outline-none dark:border-white/[.09] dark:bg-white/[.04] dark:text-white"/></label>
     <label className="text-xs text-slate-500">Этап<select value={s} onChange={e=>setS(e.target.value)} className="mt-1 w-full rounded-xl border border-black/[.07] bg-white px-3 py-2.5 text-sm text-slate-900 outline-none dark:border-white/[.09] dark:bg-[#1b1e24] dark:text-white">{stages.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
   </div>
   {selected?.isLost&&<label className="mt-3 block text-xs text-slate-500">Причина отказа<input value={reason} onChange={e=>setReason(e.target.value)} className="mt-1 w-full rounded-xl border border-black/[.07] px-3 py-2.5 text-sm text-slate-900" placeholder="Почему клиент отказался"/></label>}
   <div className="mt-4 flex justify-end"><button onClick={save} disabled={busy} className="rounded-xl bg-[#17191f] px-5 py-2.5 text-sm font-medium text-white transition hover:-translate-y-px disabled:opacity-50 dark:bg-white dark:text-[#17191f]">{busy?"Сохраняю…":"Сохранить изменения"}</button></div>
 </div>
}
