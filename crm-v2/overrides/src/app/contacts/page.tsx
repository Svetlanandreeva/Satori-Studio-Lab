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
  const loadContacts=()=>{setLoading(true);fetch("/api/contacts",{cache:"no-store"}).then(r=>r.json()).then(data=>setContacts(Array.isArray(data)?data:[])).finally(()=>setLoading(false))};
  useEffect(()=>{loadContacts();if(new URLSearchParams(window.location.search).get("new")==="1")setShowForm(true)},[]);
  return <div className="mx-auto max-w-[1400px] space-y-4 pb-10">
    <div className="flex flex-wrap items-center gap-3"><h1 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">Клиенты</h1><Button onClick={()=>setShowForm(true)} className="ml-auto rounded-xl"><Plus className="mr-1.5 h-4 w-4"/>Новый клиент</Button></div>
    {loading?<div className="studio-card p-4"><div className="space-y-2">{[...Array(6)].map((_,i)=><div key={i} className="h-16 animate-pulse rounded-2xl bg-black/[.035] dark:bg-white/[.05]"/>)}</div></div>:<ContactsTable contacts={contacts} onChanged={loadContacts}/>}
    <ContactForm open={showForm} onClose={()=>{setShowForm(false);loadContacts()}}/>
  </div>
}
