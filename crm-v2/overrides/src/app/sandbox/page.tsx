"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArchiveX, ExternalLink, Loader2, RotateCcw, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface SandboxContact {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  source: string;
  qualification: string;
  notes: string | null;
  createdAt: string | number | Date;
}

interface SandboxDeal {
  id: string;
  title: string;
  value: number;
  contactId: string;
  stageName: string | null;
}

export default function SandboxPage() {
  const [contacts, setContacts] = useState<SandboxContact[]>([]);
  const [deals, setDeals] = useState<SandboxDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [contactsResponse, dealsResponse] = await Promise.all([
        fetch("/api/contacts?includeSpam=1", { cache: "no-store" }),
        fetch("/api/deals?includeSandbox=1", { cache: "no-store" }),
      ]);
      if (!contactsResponse.ok || !dealsResponse.ok) {
        throw new Error("Не удалось загрузить Песочницу");
      }
      const contactData = (await contactsResponse.json()) as SandboxContact[];
      const dealData = (await dealsResponse.json()) as SandboxDeal[];
      setContacts(contactData.filter((contact) => contact.qualification === "spam" || contact.qualification === "ignore"));
      setDeals(dealData.filter((deal) => deal.stageName === "Песочница / Спам"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка загрузки Песочницы");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return contacts;
    return contacts.filter((contact) =>
      [contact.name, contact.email, contact.phone, contact.company, contact.source]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  }, [contacts, search]);

  const restore = async (contact: SandboxContact) => {
    setBusy(contact.id);
    try {
      const response = await fetch(`/api/contacts/${contact.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ qualification: "working" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось вернуть лид");
      toast.success(`${contact.name}: возвращён в работу`);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка восстановления");
    } finally {
      setBusy(null);
    }
  };

  const remove = async (contact: SandboxContact) => {
    if (!window.confirm(`Удалить «${contact.name}» навсегда вместе со сделками и историей?`)) return;
    setBusy(contact.id);
    try {
      const response = await fetch(`/api/contacts/${contact.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось удалить лид");
      toast.success(`${contact.name}: удалён из CRM`);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка удаления");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ArchiveX className="h-6 w-6 text-red-700" />
            <h1 className="text-2xl font-bold tracking-tight">Песочница</h1>
            <Badge variant="outline">{contacts.length}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Игнор и спам убраны из основной воронки, экономики и активных проектов, но историю можно вернуть в работу.
          </p>
        </div>
        <div className="relative w-full lg:w-80">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Поиск в Песочнице..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-56 items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Загрузка...
        </div>
      ) : visible.length === 0 ? (
        <Card>
          <CardContent className="py-14 text-center text-muted-foreground">
            Песочница пуста. Клиент попадёт сюда после статуса «Игнор» или «Спам».
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {visible.map((contact) => {
            const contactDeals = deals.filter((deal) => deal.contactId === contact.id);
            const ignored = contact.qualification === "ignore";
            return (
              <Card key={contact.id} className={ignored ? "border-zinc-200" : "border-red-100"}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle className="truncate text-base">{contact.name}</CardTitle>
                      <div className="mt-1 flex flex-wrap gap-2">
                        <Badge variant={ignored ? "outline" : "destructive"}>{ignored ? "Игнор" : "Спам"}</Badge>
                        {contact.source && <Badge variant="outline">{contact.source}</Badge>}
                      </div>
                    </div>
                    <Link
                      href={`/contacts/${contact.id}`}
                      className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm hover:bg-muted"
                    >
                      <ExternalLink className="h-4 w-4" /> Открыть
                    </Link>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                    <div><span className="text-muted-foreground">Телефон:</span> {contact.phone || "—"}</div>
                    <div><span className="text-muted-foreground">Email:</span> {contact.email || "—"}</div>
                    <div><span className="text-muted-foreground">Компания:</span> {contact.company || "—"}</div>
                    <div><span className="text-muted-foreground">Сделок:</span> {contactDeals.length}</div>
                  </div>

                  {contactDeals.length > 0 && (
                    <div className="rounded-lg bg-muted/50 p-3 text-sm">
                      <div className="mb-2 font-medium">Что лежит в Песочнице</div>
                      <div className="space-y-1 text-muted-foreground">
                        {contactDeals.map((deal) => (
                          <div key={deal.id} className="flex items-center justify-between gap-3">
                            <span className="truncate">{deal.title}</span>
                            <span className="shrink-0">{(Number(deal.value || 0) / 100).toLocaleString("ru-RU")} ₽</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 border-t pt-4">
                    <Button
                      variant="outline"
                      onClick={() => restore(contact)}
                      disabled={busy !== null}
                    >
                      {busy === contact.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
                      Вернуть в работу
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => remove(contact)}
                      disabled={busy !== null}
                    >
                      <Trash2 className="mr-2 h-4 w-4" /> Удалить навсегда
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
