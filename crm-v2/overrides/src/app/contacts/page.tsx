"use client";

import { useEffect, useState } from "react";
import { ContactsTable } from "@/components/contacts/ContactsTable";
import { ContactForm } from "@/components/contacts/ContactForm";
import { Button } from "@/components/ui/button";
import { Plus, Users } from "lucide-react";
import type { Contact } from "@/types";

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadContacts = () => {
    setLoading(true);
    fetch("/api/contacts", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => setContacts(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadContacts(); }, []);

  return (
    <div className="mx-auto max-w-[1480px] space-y-5 pb-10">
      <section className="flex flex-col gap-4 rounded-[28px] border border-slate-200/80 bg-white p-5 shadow-sm sm:flex-row sm:items-end sm:justify-between sm:p-7">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[12px] font-medium text-slate-400"><Users className="h-4 w-4" /> Клиентская база</div>
          <h1 className="text-3xl font-semibold tracking-[-0.035em] text-slate-950">Клиенты</h1>
          <p className="mt-2 max-w-xl text-[15px] leading-6 text-slate-500">Контакты, переписка, сделки, документы и вся история работы с человеком — в одной карточке.</p>
        </div>
        <Button onClick={() => setShowForm(true)} className="h-11 rounded-xl px-4">
          <Plus className="mr-2 h-4 w-4" /> Добавить клиента
        </Button>
      </section>

      {loading ? (
        <div className="rounded-[24px] border border-slate-200/80 bg-white p-4 shadow-sm">
          <div className="space-y-2">{[...Array(6)].map((_, i) => <div key={i} className="h-16 animate-pulse rounded-2xl bg-slate-100" />)}</div>
        </div>
      ) : <ContactsTable contacts={contacts} />}

      <ContactForm open={showForm} onClose={() => { setShowForm(false); loadContacts(); }} />
    </div>
  );
}
