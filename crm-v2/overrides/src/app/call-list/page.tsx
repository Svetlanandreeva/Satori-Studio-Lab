"use client";

import { useEffect, useState } from "react";
import { PhoneCall, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

type Prospect={id:string;name:string;phone?:string|null;notes?:string|null;qualification?:string;createdAt:string|number};

export default function CallListPage(){
 const [items,setItems]=useState<Prospect[]>([]); const [loading,setLoading]=useState(true);
 const load=()=>{setLoading(true);fetch("/api/contacts?callList=1",{cache:"no-store"}).then(r=>r.json()).then(d=>setItems(Array.isArray(d)?d:[])).finally(()=>setLoading(false));};
 useEffect(load,[]);
 return <div className="mx-auto max-w-[1480px] space-y-5 pb-10">
  <section className="flex items-end justify-between rounded-[28px] border border-slate-200/80 bg-white p-6 shadow-sm">
   <div><div className="mb-2 flex items-center gap-2 text-xs text-slate-400"><PhoneCall className="h-4 w-4"/>Проспекты</div><h1 className="text-3xl font-semibold tracking-tight">Список обзвона</h1><p className="mt-2 text-sm text-slate-500">Сюда автоматически попадает Need Number. В «Клиенты» контакт перейдёт только после подтверждённой заявки.</p></div>
   <Button variant="outline" onClick={load}><RefreshCw className="mr-2 h-4 w-4"/>Обновить</Button>
  </section>
  <section className="overflow-hidden rounded-[24px] border border-slate-200/80 bg-white shadow-sm">
   {loading?<div className="p-8 text-sm text-slate-400">Загрузка…</div>:items.length? <div className="divide-y divide-slate-100">{items.map(x=><a key={x.id} href={"/contacts/"+x.id} className="grid grid-cols-[1fr_auto] gap-4 p-5 hover:bg-slate-50"><div><div className="font-semibold text-slate-900">{x.name}</div><div className="mt-1 text-sm text-slate-500">{x.phone||"Без телефона"}</div><div className="mt-2 whitespace-pre-line text-xs text-slate-400">{x.notes||""}</div></div><span className="self-start rounded-full bg-amber-50 px-2.5 py-1 text-xs text-amber-700">К обзвону</span></a>)}</div>:<div className="p-12 text-center text-sm text-slate-400">Список обзвона пуст</div>}
  </section>
 </div>;
}
