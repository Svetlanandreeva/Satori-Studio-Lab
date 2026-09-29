"use client";

import { useEffect, useState } from "react";
import { ContactsTable } from "@/components/contacts/ContactsTable";
import { ContactForm } from "@/components/contacts/ContactForm";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import type { Contact } from "@/types";

export default function ContactsPage(){
  const [contacts,setContacts]=useState<Contact[]>([]);
  const [showForm,setShowForm]=useState(false);
  const [loading,setLoading]=useState(true);
  const [tab,setTab]=useState<"clients"|"contractors">("clients");
  const loadContacts=(t=tab)=>{setLoading(true);fetch(t==="contractors"?"/api/contacts?contractors=1":"/api/contacts",{cache:"no-store"}).then(r=>r.json()).then(data=>setContacts(Array.isArray(data)?data:[])).finally(()=>setLoading(false))};
  useEffect(()=>{loadContacts();if(new URLSearchParams(window.location.search).get("new")==="1")setShowForm(true)},[]);
  return <div className="mx-auto max-w-[1400px] space-y-4 pb-10">
    <div className="flex flex-wrap items-center gap-3"><h1 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">{tab==="contractors"?"Подрядчики":"Клиенты"}</h1><div className="flex rounded-xl bg-slate-100 p-0.5 text-sm dark:bg-white/[.06]">{([["clients","Клиенты"],["contractors","Подрядчики"]] as const).map(([v,l])=><button key={v} onClick={()=>{setTab(v);loadContacts(v)}} className={`rounded-lg px-3 py-1 ${tab===v?"bg-white font-medium shadow-sm dark:bg-white/[.12]":"text-slate-500"}`}>{l}</button>)}</div><Button onClick={()=>setShowForm(true)} className="ml-auto rounded-xl"><Plus className="mr-1.5 h-4 w-4"/>Новый клиент</Button></div>
    {loading?<div className="studio-card p-4"><div className="space-y-2">{[...Array(6)].map((_,i)=><div key={i} className="h-16 animate-pulse rounded-2xl bg-black/[.035] dark:bg-white/[.05]"/>)}</div></div>:<ContactsTable contacts={contacts} onChanged={()=>loadContacts()}/>}
    <ContactForm open={showForm} onClose={()=>{setShowForm(false);loadContacts()}}/>
  </div>
}
