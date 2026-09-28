"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Search, UserPlus, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Stage = { id: string; name: string; isWon?: boolean; isLost?: boolean };
type ContactLite = { id: string; name: string; phone?: string | null; email?: string | null; company?: string | null };

export type DealDraft = {
  id?: string;
  title?: string;
  value?: number; // копейки
  stageId?: string | null;
  contactId?: string | null;
  contactName?: string | null;
  notes?: string | null;
};

const fieldClass = "h-10 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function toRubles(kopecks?: number) {
  const value = (Number(kopecks) || 0) / 100;
  return value ? String(value) : "";
}
function toKopecks(value: string) {
  return Math.max(0, Math.round((Number(value.replace(/\s/g, "").replace(",", ".")) || 0) * 100));
}

// Служебные метки в заметках (связь с письмом, заказом сайта и т.п.) не показываем,
// но обязательно сохраняем — иначе сделка потеряет связь с перепиской.
const MARKER = /\[[a-z][a-z0-9-]*:[^\]]+\]/gi;
function splitNotes(raw?: string | null) {
  const text = String(raw || "");
  const markers = text.match(MARKER) || [];
  return { markers, text: text.replace(MARKER, "").replace(/^\s+/, "").trim() };
}

let stageCache: Stage[] | null = null;
let contactCache: ContactLite[] | null = null;

export function invalidateDealDialogCache() {
  contactCache = null;
}

export function DealDialog({ open, onClose, initial, onSaved }: {
  open: boolean;
  onClose: () => void;
  initial?: DealDraft;
  onSaved?: (deal: { id: string }) => void;
}) {
  const router = useRouter();
  const editing = Boolean(initial?.id);
  const [stages, setStages] = useState<Stage[]>(stageCache || []);
  const [contacts, setContacts] = useState<ContactLite[]>(contactCache || []);
  const [title, setTitle] = useState("");
  const [value, setValue] = useState("");
  const [stageId, setStageId] = useState("");
  const [notes, setNotes] = useState("");
  const [contact, setContact] = useState<ContactLite | null>(null);
  const [query, setQuery] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [creatingContact, setCreatingContact] = useState(false);
  const [saving, setSaving] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(initial?.title || "");
    setValue(toRubles(initial?.value));
    setNotes(splitNotes(initial?.notes).text);
    setStageId(initial?.stageId || "");
    setContact(initial?.contactId ? { id: initial.contactId, name: initial.contactName || "Клиент" } : null);
    setQuery("");
    setNewPhone("");
    setCreatingContact(false);

    if (!stageCache) {
      fetch("/api/pipeline", { cache: "no-store" }).then((r) => r.json()).then((rows) => {
        stageCache = (Array.isArray(rows) ? rows : []).map((s: any) => ({ id: s.id, name: s.name, isWon: s.isWon, isLost: s.isLost }));
        setStages(stageCache);
      }).catch(() => {});
    }
    if (!contactCache) {
      fetch("/api/contacts?includeRejected=1", { cache: "no-store" }).then((r) => r.json()).then((rows) => {
        contactCache = (Array.isArray(rows) ? rows : []).map((c: any) => ({ id: c.id, name: c.name, phone: c.phone, email: c.email, company: c.company }));
        setContacts(contactCache);
      }).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const activeStages = useMemo(() => stages.filter((s) => !/песочниц|спам/i.test(s.name)), [stages]);
  useEffect(() => {
    if (open && !stageId && activeStages.length) setStageId(activeStages.find((s) => !s.isWon && !s.isLost)?.id || activeStages[0].id);
  }, [open, stageId, activeStages]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts.slice(0, 6);
    const digits = q.replace(/\D/g, "");
    return contacts.filter((c) =>
      [c.name, c.email, c.company].some((v) => String(v || "").toLowerCase().includes(q)) ||
      (digits.length >= 3 && String(c.phone || "").replace(/\D/g, "").includes(digits))
    ).slice(0, 6);
  }, [contacts, query]);

  const selectedStage = stages.find((s) => s.id === stageId);

  async function createContact(): Promise<ContactLite | null> {
    const name = query.trim();
    if (!name) { toast.error("Напиши имя нового клиента"); return null; }
    const res = await fetch("/api/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, phone: newPhone.trim() || undefined, source: "other", temperature: "warm" }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.id) throw new Error(data?.error || "Не удалось создать клиента");
    if (data.duplicate) toast.info(`Клиент с этим телефоном уже есть — сделка привязана к «${data.name}»`);
    const created = { id: data.id, name: data.name, phone: data.phone };
    contactCache = null;
    return created;
  }

  async function save() {
    if (!title.trim()) { toast.error("Назови сделку — например, «Люстра для кухни»"); titleRef.current?.focus(); return; }
    setSaving(true);
    try {
      let target = contact;
      if (!target) {
        if (!query.trim()) { toast.error("Выбери клиента или впиши имя нового"); return; }
        target = await createContact();
        if (!target) return;
      }
      if (selectedStage?.isLost && !editing) { toast.error("Нельзя сразу создать сделку в «Отказе» — выбери другой этап"); return; }

      const body: Record<string, unknown> = {
        title: title.trim(),
        value: toKopecks(value),
        contactId: target.id,
        notes: [...splitNotes(initial?.notes).markers, notes.trim()].filter(Boolean).join(" ") || null,
      };
      let res: Response;
      if (editing) {
        res = await fetch(`/api/deals/${initial!.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      } else {
        res = await fetch("/api/deals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, stageId, manual: true }) });
      }
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Не удалось сохранить сделку");
      toast.success(editing ? "Сделка сохранена" : "Сделка создана");
      onSaved?.({ id: data?.id || initial?.id });
      onClose();
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !saving && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{editing ? "Изменить сделку" : "Новая сделка"}</DialogTitle></DialogHeader>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <div className="space-y-1.5">
            <Label htmlFor="deal-title">Что заказывают *</Label>
            <Input id="deal-title" ref={titleRef} autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Например, 3 светильника для ресторана" />
          </div>

          <div className="space-y-1.5">
            <Label>Клиент *</Label>
            {contact ? (
              <div className="flex h-10 items-center justify-between rounded-lg border border-input bg-muted/40 px-3 text-sm">
                <span className="flex min-w-0 items-center gap-2"><Check className="h-4 w-4 shrink-0 text-emerald-600" /><span className="truncate font-medium">{contact.name}</span>{contact.phone && <span className="truncate text-xs text-muted-foreground">{contact.phone}</span>}</span>
                <button type="button" onClick={() => { setContact(null); setQuery(""); }} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Выбрать другого клиента"><X className="h-4 w-4" /></button>
              </div>
            ) : (
              <div className="rounded-lg border border-input">
                <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={query} onChange={(e) => { setQuery(e.target.value); setCreatingContact(false); }} placeholder="Имя, телефон или email" className="h-10 w-full rounded-t-lg bg-transparent pl-9 pr-3 text-sm outline-none" /></div>
                <div className="max-h-48 overflow-y-auto border-t">
                  {matches.map((c) => (
                    <button key={c.id} type="button" onClick={() => setContact(c)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted">
                      <span className="truncate font-medium">{c.name}</span>
                      <span className="shrink-0 truncate text-xs text-muted-foreground">{c.phone || c.email || c.company || ""}</span>
                    </button>
                  ))}
                  {query.trim() && (
                    <button type="button" onClick={() => setCreatingContact(true)} className="flex w-full items-center gap-2 border-t px-3 py-2 text-left text-sm font-medium text-violet-700 hover:bg-violet-50 dark:text-violet-300 dark:hover:bg-violet-500/10">
                      <UserPlus className="h-4 w-4" />Новый клиент «{query.trim()}»
                    </button>
                  )}
                  {!query.trim() && !matches.length && <div className="px-3 py-2 text-xs text-muted-foreground">Начни вводить имя — можно выбрать существующего или создать нового.</div>}
                </div>
                {creatingContact && (
                  <div className="border-t p-3">
                    <Label htmlFor="new-phone" className="text-xs">Телефон нового клиента (необязательно)</Label>
                    <Input id="new-phone" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="+7 900 000-00-00" className="mt-1" />
                    <p className="mt-1.5 text-[11px] text-muted-foreground">Клиент создастся вместе со сделкой.</p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="deal-value">Сумма, ₽</Label>
              <Input id="deal-value" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="deal-stage">Этап</Label>
              {editing ? (
                <div className="flex h-10 items-center rounded-lg border border-input bg-muted/40 px-3 text-sm text-muted-foreground">Меняется в карточке</div>
              ) : (
                <select id="deal-stage" value={stageId} onChange={(e) => setStageId(e.target.value)} className={fieldClass}>
                  {activeStages.filter((s) => !s.isLost).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="deal-notes">Заметка</Label>
            <Textarea id="deal-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Размеры, цвет, сроки, адрес доставки…" />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Отмена</Button>
            <Button type="submit" disabled={saving}>{saving ? "Сохраняю…" : editing ? "Сохранить" : "Создать сделку"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
