"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ActivityForm } from "@/components/activities/ActivityForm";
import { ContactForm } from "./ContactForm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  AlertCircle, ArrowLeft, Building2, CalendarDays, Check, Copy, Download, FileText, Mail,
  MessageCircle, Pencil, Phone, Plus, ReceiptText, Sparkles, Trash2, Upload, WalletCards,
} from "lucide-react";
import { toast } from "sonner";

type Doc = {
  id: string;
  kind: string;
  name: string;
  mimeType?: string | null;
  sizeBytes: number;
  createdAt: number;
  sourceChannel?: string | null;
  sourceDirection?: string | null;
};
type Insight = { id: string; severity: string; category: string; title: string; detail: string; actionUrl?: string | null };
type Deal = {
  id: string; title: string; value: number; probability: number; stageName: string | null; stageColor: string | null; isWon?: boolean | null; isLost?: boolean | null;
  receivedAmount: number; directCost: number; profitBeforeManager: number; managerCommission: number; managerCommissionRate: number; totalCost: number; profit: number; margin: number;
  project?: { contractDeadline?: string | null; deadlineStatus?: string; daysRemaining?: number | null; overdueDays?: number; orderedAt?: string | null } | null;
};
type Activity = { id: string; type: string; description: string; scheduledAt?: number | Date | null; completedAt?: number | Date | null; createdAt: number | Date };
type Contact = { id: string; name: string; email: string | null; phone: string | null; company: string | null; source: string; temperature: string; qualification?: string | null; score: number; notes: string | null; createdAt: number | Date };

interface Props { contact: Contact; deals: Deal[]; activities: Activity[]; documents: Doc[]; assistantInsights: Insight[]; }

function money(value: number) { return `${Math.round((value || 0) / 100).toLocaleString("ru-RU")} ₽`; }
function date(value: number | Date | string) {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium" }).format(d);
}
function relative(value: number | Date) {
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  const days = Math.floor((Date.now() - ms) / 86_400_000);
  if (days <= 0) return "сегодня"; if (days === 1) return "вчера"; if (days < 7) return `${days} дн. назад`; return date(value);
}
function sourceLabel(value: string) {
  const map: Record<string, string> = { need_number: "Парсер / Need Number", website: "Сайт", order: "Сайт", telegram: "Telegram-бот", telegram_account: "Личный Telegram", ads: "Реклама", instagram: "Instagram", linkedin: "LinkedIn", referral: "Рекомендации", other: "Другое", otro: "Другое" };
  return map[value] || value || "Не указан";
}
function bytes(value: number) { return value > 1024 * 1024 ? `${(value / 1024 / 1024).toFixed(1)} МБ` : `${Math.max(1, Math.round(value / 1024))} КБ`; }
function documentKindLabel(kind: string) {
  if (kind === "contract") return "Договор";
  if (kind === "commercial_offer") return "КП";
  if (kind === "invoice") return "Счёт";
  if (kind === "specification") return "Спецификация";
  if (kind === "brief") return "ТЗ / бриф";
  return "Документ";
}
function documentSourceLabel(doc: Doc) {
  if (doc.sourceChannel === "email") return doc.sourceDirection === "outgoing" ? "Почта · отправлено" : "Почта · получено";
  if (doc.sourceChannel === "telegram") return doc.sourceDirection === "outgoing" ? "Telegram · отправлено" : "Telegram · получено";
  return "Добавлен вручную";
}
function visibleContactNotes(notes: string | null): string {
  return String(notes || "")
    .split("\n")
    .filter((line) => !/^\[(?:legacy-contact|store-customer-order|telegram-chat|telegram-business):/i.test(line.trim()))
    .join("\n")
    .trim();
}
function activityDisplay(description: string): { text: string; paymentFailure: boolean } {
  const paymentFailure = /^\[store-payment-failed:[^\]]+\]/i.test(description.trim());
  return {
    paymentFailure,
    text: description.replace(/^\[store-payment-failed:[^\]]+\]\s*/i, "").trim(),
  };
}

export function ContactDetailClient({ contact, deals, activities, documents: initialDocuments, assistantInsights }: Props) {
  const router = useRouter();
  const [showEdit, setShowEdit] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const [documents, setDocuments] = useState(initialDocuments);
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState("contract");
  const [uploading, setUploading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const totalReceived = deals.reduce((s, x) => s + Number(x.receivedAmount || 0), 0);
  const totalDirectCost = deals.reduce((s, x) => s + Number(x.directCost || 0), 0);
  const totalManagerCommission = deals.reduce((s, x) => s + Number(x.managerCommission || 0), 0);
  const totalProfit = deals.reduce((s, x) => s + Number(x.profit || 0), 0);
  const margin = totalReceived > 0 ? (totalProfit / totalReceived) * 100 : 0;
  const contracts = documents.filter((x) => x.kind === "contract");
  const proposals = documents.filter((x) => x.kind === "commercial_offer");
  const contactNotes = visibleContactNotes(contact.notes);

  const copy = async (value: string, key: string) => {
    await navigator.clipboard.writeText(value); setCopied(key); toast.success("Скопировано"); setTimeout(() => setCopied(null), 1200);
  };

  const reloadDocuments = async () => {
    const res = await fetch(`/api/contacts/${contact.id}/documents`, { cache: "no-store" });
    const data = await res.json(); if (res.ok) setDocuments(data.documents || []);
  };

  const upload = async () => {
    if (!file) return toast.error("Выберите файл");
    setUploading(true);
    try {
      const form = new FormData(); form.set("file", file); form.set("kind", kind);
      const res = await fetch(`/api/contacts/${contact.id}/documents`, { method: "POST", body: form });
      const data = await res.json(); if (!res.ok) throw new Error(data.error || "Не удалось загрузить файл");
      setFile(null); await reloadDocuments();
      toast.success(kind === "contract" ? "Договор добавлен" : kind === "commercial_offer" ? "КП добавлено" : "Документ добавлен");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Ошибка загрузки"); }
    finally { setUploading(false); }
  };

  const removeDocument = async (id: string) => {
    if (!confirm("Удалить документ из карточки клиента?")) return;
    const res = await fetch(`/api/contacts/${contact.id}/documents/${id}`, { method: "DELETE" });
    if (res.ok) { await reloadDocuments(); toast.success("Документ удалён"); } else toast.error("Не удалось удалить документ");
  };

  const deleteContact = async () => {
    if (!confirm("Удалить клиента и связанные данные? Действие нельзя отменить.")) return;
    const res = await fetch(`/api/contacts/${contact.id}`, { method: "DELETE" });
    if (!res.ok) return toast.error("Не удалось удалить клиента");
    router.push("/contacts");
  };

  return (
    <div className="space-y-6 max-w-[1500px]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
        <Button variant="ghost" size="icon" onClick={() => router.push("/contacts")}><ArrowLeft className="h-5 w-5" /></Button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><h1 className="truncate text-3xl font-semibold tracking-tight">{contact.name}</h1>
            <Badge variant={contact.temperature === "hot" ? "default" : "outline"}>{contact.temperature === "hot" ? "Горячий" : contact.temperature === "warm" ? "Тёплый" : "Холодный"}</Badge>
            {contact.qualification && <Badge variant="secondary">{contact.qualification === "qualified" ? "Квалифицирован" : contact.qualification}</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{sourceLabel(contact.source)} · score {contact.score}/100 · клиент с {date(contact.createdAt)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/inbox?contact=${contact.id}`}><Button variant="outline"><MessageCircle className="mr-2 h-4 w-4" />Сообщения</Button></Link>
          <Button variant="outline" onClick={() => setShowEdit(true)}><Pencil className="mr-2 h-4 w-4" />Изменить</Button>
          <Button variant="ghost" onClick={deleteContact}><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>

      {assistantInsights.length > 0 && <Card className="border-amber-200 bg-amber-50/30"><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Sparkles className="h-4 w-4" />Помощник по этому клиенту</CardTitle></CardHeader><CardContent className="space-y-2">
        {assistantInsights.map(x => <div key={x.id} className="flex gap-3 rounded-lg bg-background/70 p-3"><AlertCircle className={`mt-0.5 h-4 w-4 shrink-0 ${x.severity === "critical" ? "text-red-600" : "text-amber-600"}`} /><div><div className="text-sm font-medium">{x.title}</div><div className="text-sm text-muted-foreground">{x.detail}</div></div></div>)}
      </CardContent></Card>}

      <div className="grid gap-6 xl:grid-cols-[.8fr_1.2fr]">
        <div className="space-y-6">
          <Card><CardHeader><CardTitle className="text-base">Контакты и компания</CardTitle></CardHeader><CardContent className="space-y-3 text-sm">
            {contact.company && <Row icon={Building2} value={contact.company} />}
            {contact.phone && <ContactRow icon={Phone} value={contact.phone} onCopy={() => copy(contact.phone!, "phone")} copied={copied === "phone"} href={`tel:${contact.phone}`} />}
            {contact.email && <ContactRow icon={Mail} value={contact.email} onCopy={() => copy(contact.email!, "email")} copied={copied === "email"} href={`mailto:${contact.email}`} />}
            <Row icon={CalendarDays} value={`Создан ${date(contact.createdAt)}`} />
            {contactNotes && <div className="mt-3 whitespace-pre-wrap rounded-xl bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">{contactNotes}</div>}
          </CardContent></Card>

          <Card className={contracts.length ? "" : "border-amber-200"}><CardHeader><div className="flex flex-wrap items-center justify-between gap-2"><CardTitle className="flex items-center gap-2 text-base"><ReceiptText className="h-4 w-4" />Документы клиента</CardTitle><div className="flex gap-1.5">{proposals.length > 0 && <Badge variant="secondary">КП {proposals.length}</Badge>}{contracts.length ? <Badge variant="secondary">Договор загружен</Badge> : <Badge variant="outline">Нет договора</Badge>}</div></div></CardHeader><CardContent className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-[150px_1fr_auto]">
              <select className="h-10 rounded-md border bg-background px-3 text-sm" value={kind} onChange={(e) => setKind(e.target.value)}><option value="contract">Договор</option><option value="commercial_offer">КП</option><option value="specification">Спецификация</option><option value="invoice">Счёт</option><option value="brief">ТЗ / бриф</option><option value="other">Другое</option></select>
              <Input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.jpg,.jpeg,.png,.webp,.heic,.zip,.rar,.7z,.stl,.step,.stp,.3mf" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              <Button onClick={upload} disabled={uploading || !file}><Upload className="mr-2 h-4 w-4" />Загрузить</Button>
            </div>
            <p className="text-xs text-muted-foreground">КП и договор можно добавить вручную. Вложения из связанной почты и Telegram будут появляться здесь автоматически.</p>
            {!documents.length ? <p className="text-sm text-muted-foreground">Здесь будут КП, договор, ТЗ, спецификации, счета и файлы из переписки.</p> : <div className="space-y-2">{documents.map(doc => <div key={doc.id} className="flex items-center gap-3 rounded-xl border p-3"><FileText className="h-4 w-4 shrink-0 text-muted-foreground" /><div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{doc.name}</div><div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground"><span>{documentKindLabel(doc.kind)} · {bytes(doc.sizeBytes)}</span><Badge variant="outline" className="h-5 px-1.5 text-[10px] font-normal">{documentSourceLabel(doc)}</Badge></div></div><a href={`/api/contacts/${contact.id}/documents/${doc.id}`}><Button variant="ghost" size="icon"><Download className="h-4 w-4" /></Button></a><Button variant="ghost" size="icon" onClick={() => removeDocument(doc.id)}><Trash2 className="h-4 w-4" /></Button></div>)}</div>}
          </CardContent></Card>
        </div>

        <div className="space-y-6">
          <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><WalletCards className="h-4 w-4" />Сделки и экономика</CardTitle></CardHeader><CardContent>
            <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-5"><Mini label="Поступило" value={money(totalReceived)} /><Mini label="Прямые расходы" value={money(totalDirectCost)} /><Mini label="Менеджер 50%" value={money(totalManagerCommission)} /><Mini label="Прибыль компании" value={money(totalProfit)} /><Mini label="Маржа компании" value={totalReceived ? `${margin.toFixed(1)}%` : "—"} /></div>
            {!deals.length ? <p className="text-sm text-muted-foreground">Сделок пока нет.</p> : <div className="space-y-3">{deals.map(deal => <Link href={`/deals/${deal.id}`} key={deal.id}><div className="rounded-xl border p-4 transition-colors hover:bg-muted/30"><div className="flex items-start justify-between gap-4"><div><div className="font-medium">{deal.title}</div><div className="mt-1 text-xs text-muted-foreground">{deal.stageName || "Без этапа"}{deal.project?.contractDeadline ? ` · срок ${deal.project.contractDeadline}` : ""}</div><div className="mt-2 text-xs text-muted-foreground">Поступило {money(deal.receivedAmount)} · прямые расходы {money(deal.directCost)} · менеджер {money(deal.managerCommission)} · компании {money(deal.profit)}</div></div><div className="text-right"><div className="font-semibold">{money(deal.value)}</div>{deal.receivedAmount > 0 && <div className={`text-xs ${deal.margin < 25 ? "text-amber-700" : "text-muted-foreground"}`}>маржа компании {deal.margin.toFixed(1)}%</div>}</div></div></div></Link>)}</div>}
          </CardContent></Card>

          <Card><CardHeader><div className="flex items-center justify-between"><CardTitle className="text-base">История клиента</CardTitle><Button variant="outline" size="sm" onClick={() => setShowActivity(true)}><Plus className="mr-1 h-4 w-4" />Добавить</Button></div></CardHeader><CardContent>
            {!activities.length ? <p className="text-sm text-muted-foreground">Активности пока нет.</p> : <div className="space-y-4">{activities.slice(0, 30).map(a => { const display = activityDisplay(a.description); return <div key={a.id} className="flex gap-3"><div className="mt-1 rounded-full bg-muted p-2"><FileText className="h-3.5 w-3.5" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><div className="text-sm whitespace-pre-wrap">{display.text}</div>{display.paymentFailure && <Badge variant="outline" className="text-[10px]">Попытка оплаты · не сделка</Badge>}</div><div className="mt-1 text-xs text-muted-foreground">{a.type} · {relative(a.createdAt)}</div></div></div>; })}</div>}
          </CardContent></Card>
        </div>
      </div>

      <ContactForm open={showEdit} onClose={() => { setShowEdit(false); router.refresh(); }} initialData={{ id: contact.id, name: contact.name, email: contact.email || "", phone: contact.phone || "", company: contact.company || "", source: contact.source, temperature: contact.temperature as "cold" | "warm" | "hot", notes: contact.notes || "" }} />
      <ActivityForm open={showActivity} onClose={() => { setShowActivity(false); router.refresh(); }} preselectedContactId={contact.id} />
    </div>
  );
}

function Row({ icon: Icon, value }: { icon: typeof Phone; value: string }) { return <div className="flex items-center gap-3"><Icon className="h-4 w-4 shrink-0 text-muted-foreground" /><span>{value}</span></div>; }
function ContactRow({ icon: Icon, value, href, copied, onCopy }: { icon: typeof Phone; value: string; href: string; copied: boolean; onCopy: () => void }) { return <div className="flex items-center gap-3"><Icon className="h-4 w-4 shrink-0 text-muted-foreground" /><a className="min-w-0 flex-1 truncate hover:underline" href={href}>{value}</a><button onClick={onCopy} className="rounded-md p-1.5 hover:bg-muted">{copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}</button></div>; }
function Mini({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-muted/40 p-3"><div className="text-[11px] text-muted-foreground">{label}</div><div className="mt-1 text-lg font-semibold">{value}</div></div>; }
