"use client";

import { useEffect, useState } from "react";
import { ContactsTable } from "@/components/contacts/ContactsTable";
import { ContactForm } from "@/components/contacts/ContactForm";
import { Button } from "@/components/ui/button";
import { Plus, Users } from "lucide-react";
import type { Contact } from "@/types";

export default function ContactsPage(){
  const [contacts,setContacts]=useState<Contact[]>([]);
  const [showForm,setShowForm]=useState(false);
  const [loading,setLoading]=useState(true);
  const loadContacts=()=>{setLoading(true);fetch("/api/contacts",{cache:"no-store"}).then(r=>r.json()).then(data=>setContacts(Array.isArray(data)?data:[])).finally(()=>setLoading(false))};
  useEffect(()=>{loadContacts()},[]);
  return <div className="mx-auto max-w-[1500px] space-y-5 pb-10">
    <section className="studio-card p-6 sm:p-7"><div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div><div className="studio-label mb-3">Клиентская база</div><h1 className="studio-title text-3xl font-semibold tracking-[-.04em] sm:text-4xl">Клиенты</h1><p className="studio-muted mt-2 max-w-xl text-sm leading-6">Здесь остаются уже существующие клиенты, их сделки, переписка по почте и Telegram, документы и задачи.</p></div><Button onClick={()=>setShowForm(true)} className="studio-gradient h-11 rounded-xl border-0 px-4 text-white shadow-[0_10px_25px_rgba(130,95,255,.18)] hover:opacity-95"><Plus className="mr-2 h-4 w-4"/>Добавить клиента</Button></div></section>
    {loading?<div className="studio-card p-4"><div className="space-y-2">{[...Array(6)].map((_,i)=><div key={i} className="h-16 animate-pulse rounded-2xl bg-black/[.035] dark:bg-white/[.05]"/>)}</div></div>:<div className="studio-card overflow-hidden p-1"><ContactsTable contacts={contacts}/></div>}
    <ContactForm open={showForm} onClose={()=>{setShowForm(false);loadContacts()}}/>
  </div>
}
