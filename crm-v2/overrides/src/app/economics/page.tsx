"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, Calculator, CheckCircle2, Edit3, Eye, Loader2, Plus, Search, Trash2, WalletCards } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface EconomicsDeal {
  dealId: string; dealTitle: string; dealValue: number; contactId: string; contactName: string; company: string | null; stageName: string;
  receivedAmount: number; productionCost: number; paymentCommission: number; paymentCommissionRate: number; deliveryCost: number;
  packagingCost: number; contractorCost: number; taxCost: number; otherCost: number; economicsNotes: string | null;
  directCost: number; profitBeforeManager: number; managerCommission: number; managerCommissionRate: number;
  totalCost: number; profit: number; margin: number; unpaid: number;
}

interface FixedExpense {
  id: string; month: string; name: string; category: string; amount: number; expenseType: string; percentRate: number;
  percentBaseAmount: number; dueDate: string | null; paidAt: string | null; recurringMonthly: boolean; recurringSeriesId: string | null;
  baseMonth: string | null; paymentStatus: string; daysToPayment: number | null; notes: string | null;
}

interface EconomicsPayload {
  deals: EconomicsDeal[];
  totals: { dealValue: number; receivedAmount: number; directCost: number; managerCommission: number; managerCommissionRate: number; totalCost: number; profitBeforeManager: number; profit: number; margin: number };
  fixedExpenses: { month: string; items: FixedExpense[]; total: number; paidTotal: number; unpaidTotal: number; taxBase?: { baseMonth: string; amount: number } };
  taxBase: { baseMonth: string; amount: number };
}

interface FormState {
  receivedAmount: string; productionCost: string; paymentCommissionRate: string; deliveryCost: string; packagingCost: string;
  contractorCost: string; taxCost: string; otherCost: string; notes: string;
}

const emptyForm: FormState = { receivedAmount: "", productionCost: "", paymentCommissionRate: "", deliveryCost: "", packagingCost: "", contractorCost: "", taxCost: "", otherCost: "", notes: "" };
const MANAGER_COMMISSION_RATE = 50;

const expenseCategories: Record<string, string> = {
  salary: "Фиксированные зарплаты", ads: "Реклама за месяц", server: "Сервер / IT", subscriptions: "Подписки / сервисы",
  rent: "Аренда", utilities: "Коммунальные", accounting: "Бухгалтерия", taxes: "Налоги", other: "Прочее",
};

function browserMonth() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; }
function browserDate() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function rubles(cents: number) { return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format((Number(cents) || 0) / 100); }
function toRubles(cents: number) { const value = (Number(cents) || 0) / 100; return value ? String(value) : ""; }
function toCents(value: string) { const number = Number(value.replace(/\s/g, "").replace(",", ".")); return Number.isFinite(number) && number > 0 ? Math.round(number * 100) : 0; }
function numericRate(value: string) { const n = Number(value.replace(",", ".")); return Number.isFinite(n) && n > 0 ? n : 0; }
function percent(value: number) { return `${(Number(value) || 0).toLocaleString("ru-RU", { maximumFractionDigits: 2 })}%`; }
function formatDate(value: string | null) { if (!value) return "—"; const [y, m, d] = value.split("-").map(Number); return y && m && d ? new Intl.DateTimeFormat("ru-RU").format(new Date(y, m - 1, d)) : value; }
function monthLabel(value: string | null) { if (!value) return "—"; const [y, m] = value.split("-").map(Number); return new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(new Date(y, m - 1, 1)); }
function profitClass(value: number) { return value > 0 ? "text-emerald-700" : value < 0 ? "text-red-700" : "text-muted-foreground"; }

function expenseStatus(expense: FixedExpense) {
  if (expense.paidAt) return { label: `Оплачено ${formatDate(expense.paidAt)}`, className: "border-emerald-300 bg-emerald-50 text-emerald-700" };
  if (expense.paymentStatus === "overdue") return { label: `Просрочено ${Math.abs(expense.daysToPayment || 0)} дн.`, className: "border-red-300 bg-red-50 text-red-700" };
  if (expense.paymentStatus === "due_today") return { label: "Оплатить сегодня", className: "border-red-300 bg-red-50 text-red-700" };
  if (expense.paymentStatus === "due_soon") return { label: `Через ${expense.daysToPayment} дн.`, className: "border-amber-300 bg-amber-50 text-amber-700" };
  if (expense.dueDate) return { label: `До ${formatDate(expense.dueDate)}`, className: "border-slate-300 bg-slate-50 text-slate-600" };
  return { label: "Без даты", className: "border-slate-300 bg-slate-50 text-slate-600" };
}

export default function EconomicsPage() {
  const [data, setData] = useState<EconomicsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [viewing, setViewing] = useState<EconomicsDeal | null>(null);
  const [editing, setEditing] = useState<EconomicsDeal | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [month, setMonth] = useState(browserMonth);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [expenseSaving, setExpenseSaving] = useState(false);
  const [expenseName, setExpenseName] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseCategory, setExpenseCategory] = useState("other");
  const [expenseNotes, setExpenseNotes] = useState("");
  const [expenseType, setExpenseType] = useState<"fixed" | "percent">("fixed");
  const [expenseRate, setExpenseRate] = useState("");
  const [expenseBase, setExpenseBase] = useState("");
  const [expenseDueDate, setExpenseDueDate] = useState("");
  const [expenseRecurring, setExpenseRecurring] = useState(true);
  const [paymentBusy, setPaymentBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/economics?month=${encodeURIComponent(month)}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Не удалось загрузить экономику");
      setData(payload);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Ошибка загрузки экономики"); }
    finally { setLoading(false); }
  }, [month]);

  useEffect(() => { void load(); }, [load]);

  const visibleDeals = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!data) return [];
    return q ? data.deals.filter((deal) => [deal.dealTitle, deal.contactName, deal.company, deal.stageName].filter(Boolean).some((x) => String(x).toLowerCase().includes(q))) : data.deals;
  }, [data, search]);

  const openDeal = (deal: EconomicsDeal) => {
    setEditing(deal);
    setForm({ receivedAmount: toRubles(deal.receivedAmount), productionCost: toRubles(deal.productionCost), paymentCommissionRate: deal.paymentCommissionRate ? String(deal.paymentCommissionRate) : "", deliveryCost: toRubles(deal.deliveryCost), packagingCost: toRubles(deal.packagingCost), contractorCost: toRubles(deal.contractorCost), taxCost: toRubles(deal.taxCost), otherCost: toRubles(deal.otherCost), notes: deal.economicsNotes || "" });
  };

  const dealPreview = useMemo(() => {
    const received = toCents(form.receivedAmount);
    const acquiring = Math.round((received * numericRate(form.paymentCommissionRate)) / 100);
    const directCosts = toCents(form.productionCost) + acquiring + toCents(form.deliveryCost) + toCents(form.packagingCost) + toCents(form.contractorCost) + toCents(form.taxCost) + toCents(form.otherCost);
    const profitBeforeManager = received - directCosts;
    const managerCommission = Math.max(0, Math.round(profitBeforeManager * MANAGER_COMMISSION_RATE / 100));
    const costs = directCosts + managerCommission;
    const profit = received - costs;
    return { acquiring, directCosts, profitBeforeManager, managerCommission, costs, profit, margin: received > 0 ? (profit / received) * 100 : 0 };
  }, [form]);

  async function saveDeal() {
    if (!editing) return;
    setSaving(true);
    try {
      const response = await fetch("/api/economics", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({
        dealId: editing.dealId, receivedAmount: toCents(form.receivedAmount), productionCost: toCents(form.productionCost), paymentCommissionRate: numericRate(form.paymentCommissionRate),
        deliveryCost: toCents(form.deliveryCost), packagingCost: toCents(form.packagingCost), contractorCost: toCents(form.contractorCost), taxCost: toCents(form.taxCost), otherCost: toCents(form.otherCost), notes: form.notes,
      }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "Не удалось сохранить расчёт");
      setEditing(null); toast.success("Экономика сделки сохранена"); await load();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Ошибка сохранения"); }
    finally { setSaving(false); }
  }

  function resetExpense() {
    setExpenseName(""); setExpenseAmount(""); setExpenseCategory("other"); setExpenseNotes(""); setExpenseType("fixed"); setExpenseRate(""); setExpenseBase(""); setExpenseDueDate(""); setExpenseRecurring(true);
  }

  function preset(category: string) {
    setExpenseCategory(category);
    setExpenseRecurring(true);
    if (category === "salary") { setExpenseName("Фиксированные зарплаты"); setExpenseType("fixed"); }
    if (category === "ads") { setExpenseName("Реклама за месяц"); setExpenseType("fixed"); }
    if (category === "server") { setExpenseName("Сервер"); setExpenseType("fixed"); }
    if (category === "taxes") { setExpenseName("Налог"); setExpenseType("percent"); }
  }

  const taxMode = expenseCategory === "taxes" && expenseType === "percent";
  const percentBaseCents = taxMode ? Number(data?.taxBase?.amount || 0) : toCents(expenseBase);
  const expensePreview = expenseType === "percent" ? Math.round((percentBaseCents * numericRate(expenseRate)) / 100) : toCents(expenseAmount);

  async function addExpense() {
    if (!expenseName.trim()) return toast.error("Укажи название расхода");
    setExpenseSaving(true);
    try {
      const response = await fetch("/api/economics", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
        month, name: expenseName, category: expenseCategory, amount: toCents(expenseAmount), expenseType, percentRate: numericRate(expenseRate), percentBaseAmount: toCents(expenseBase), dueDate: expenseDueDate || null, recurringMonthly: expenseRecurring, notes: expenseNotes,
      }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "Не удалось добавить расход");
      setExpenseOpen(false); resetExpense(); toast.success(expenseRecurring ? "Ежемесячный расход добавлен" : "Разовый расход добавлен"); await load();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Ошибка сохранения расхода"); }
    finally { setExpenseSaving(false); }
  }

  async function markPaid(expense: FixedExpense) {
    setPaymentBusy(expense.id);
    try {
      const response = await fetch("/api/economics", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ expenseId: expense.id, paidAt: expense.paidAt ? null : browserDate() }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "Не удалось изменить оплату"); await load();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Ошибка оплаты"); }
    finally { setPaymentBusy(null); }
  }

  async function removeExpense(id: string) {
    try {
      const response = await fetch(`/api/economics?expenseId=${encodeURIComponent(id)}`, { method: "DELETE" });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "Не удалось удалить расход");
      toast.success("Расход удалён; ежемесячное повторение остановлено"); await load();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Ошибка удаления расхода"); }
  }

  if (loading && !data) return <div className="flex min-h-80 items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Загрузка экономики...</div>;

  const totals = data?.totals || { dealValue: 0, receivedAmount: 0, directCost: 0, managerCommission: 0, managerCommissionRate: MANAGER_COMMISSION_RATE, totalCost: 0, profitBeforeManager: 0, profit: 0, margin: 0 };
  const fixed = data?.fixedExpenses || { month, items: [], total: 0, paidTotal: 0, unpaidTotal: 0 };
  const netProfit = totals.profit - fixed.total;

  return <div className="space-y-6">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div><div className="flex items-center gap-2"><Calculator className="h-6 w-6" /><h1 className="text-2xl font-bold tracking-tight">Экономика</h1></div><p className="mt-1 text-sm text-muted-foreground">Фактические оплаты, прямые расходы, зарплата менеджера и ежемесячные расходы бизнеса.</p></div>
      <div className="relative w-full lg:w-96"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="Клиент или сделка..." value={search} onChange={(e) => setSearch(e.target.value)} /></div>
    </div>

    <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
      <Stat label="Получено от клиентов" value={rubles(totals.receivedAmount)} note={`Сумма сделок: ${rubles(totals.dealValue)}`} />
      <Stat label="Прямые расходы" value={rubles(totals.directCost)} note="Материалы, доставка, производство и т.д." />
      <Stat label="Зарплата / комиссия менеджера" value={rubles(totals.managerCommission)} note={`${totals.managerCommissionRate || MANAGER_COMMISSION_RATE}% от прибыли после прямых расходов`} />
      <Stat label="Постоянные расходы месяца" value={rubles(fixed.total)} note={`Оплачено: ${rubles(fixed.paidTotal)}`} />
      <Stat label="Чистый результат компании" value={rubles(netProfit)} note={`После менеджера, до постоянных: ${rubles(totals.profit)}`} tone={profitClass(netProfit)} />
    </div>

    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Building2 className="h-4 w-4" />Ежемесячные расходы бизнеса</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Input type="month" className="w-48" value={month} onChange={(e) => setMonth(e.target.value)} />
          <Button onClick={() => setExpenseOpen(true)}><Plus className="mr-2 h-4 w-4" />Добавить расход</Button>
        </div>
        <div className="rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">
          Постоянный расход создаётся один раз и дальше переносится по месяцам автоматически. Если срок первого платежа стоит, например, до 12 октября для сентября, в октябре следующая дата станет 12 ноября. Налог в выбранном месяце считается с выручки <b>предыдущего месяца</b>.
        </div>
        <div className="grid grid-cols-3 gap-3"><Mini label="Начислено" value={rubles(fixed.total)} /><Mini label="Оплачено" value={rubles(fixed.paidTotal)} good /><Mini label="К оплате" value={rubles(fixed.unpaidTotal)} /></div>
        <div className="space-y-2">
          {fixed.items.map((expense) => {
            const status = expenseStatus(expense);
            return <div key={expense.id} className="flex flex-col gap-3 rounded-lg border p-3 lg:flex-row lg:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{expense.name}</span><Badge variant="outline">{expenseCategories[expense.category] || expense.category}</Badge>{expense.recurringMonthly && <Badge variant="secondary">Ежемесячно</Badge>}<Badge variant="outline" className={status.className}>{status.label}</Badge></div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {expense.category === "taxes" && expense.expenseType === "percent" ? <>Налог за {monthLabel(expense.baseMonth)} · база {rubles(expense.percentBaseAmount)} · ставка {percent(expense.percentRate)}</> : expense.expenseType === "percent" ? <>{percent(expense.percentRate)} от {rubles(expense.percentBaseAmount)}</> : expense.dueDate ? <>Срок оплаты: {formatDate(expense.dueDate)}</> : <>Фиксированный расход</>}
                </div>
              </div>
              <div className="text-lg font-semibold">{rubles(expense.amount)}</div>
              <Button variant="outline" size="sm" disabled={paymentBusy === expense.id} onClick={() => void markPaid(expense)}>{paymentBusy === expense.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}{expense.paidAt ? "Снять оплату" : "Оплачено сегодня"}</Button>
              <Button variant="ghost" size="icon" onClick={() => void removeExpense(expense.id)} title={expense.recurringMonthly ? "Удалить и остановить повторение" : "Удалить"}><Trash2 className="h-4 w-4 text-red-600" /></Button>
            </div>;
          })}
          {!fixed.items.length && <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Расходов на этот месяц пока нет.</div>}
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2 text-base"><WalletCards className="h-4 w-4" />Экономика по сделкам после «Расчёта»</CardTitle></CardHeader>
      <CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted/50 text-xs text-muted-foreground"><tr><th className="p-3 text-left">Клиент / сделка</th><th className="p-3 text-right">Сумма</th><th className="p-3 text-right">Получено</th><th className="p-3 text-right">Эквайринг</th><th className="p-3 text-right">Прямые расходы</th><th className="p-3 text-right">Менеджер 50%</th><th className="p-3 text-right">Компания</th><th className="p-3 text-right">Маржа</th><th className="p-3"></th></tr></thead><tbody>
        {visibleDeals.map((deal) => <tr key={deal.dealId} className="border-t hover:bg-muted/20"><td className="p-3"><Link href={`/contacts/${deal.contactId}`} className="font-medium hover:underline">{deal.contactName}</Link><div className="text-xs text-muted-foreground">{deal.dealTitle} · {deal.stageName}</div></td><td className="p-3 text-right">{rubles(deal.dealValue)}</td><td className="p-3 text-right">{rubles(deal.receivedAmount)}</td><td className="p-3 text-right">{percent(deal.paymentCommissionRate)}<div className="text-xs text-muted-foreground">{rubles(deal.paymentCommission)}</div></td><td className="p-3 text-right"><button type="button" onClick={() => setViewing(deal)} className="font-medium underline-offset-4 hover:underline">{rubles(deal.directCost)}</button></td><td className="p-3 text-right font-medium text-violet-700">{rubles(deal.managerCommission)}</td><td className={`p-3 text-right font-medium ${profitClass(deal.profit)}`}>{rubles(deal.profit)}</td><td className="p-3 text-right">{percent(deal.margin)}</td><td className="p-3"><div className="flex justify-end gap-2"><Button variant="ghost" size="sm" onClick={() => setViewing(deal)}><Eye className="mr-2 h-4 w-4" />Посмотреть</Button><Button variant="outline" size="sm" onClick={() => openDeal(deal)}><Edit3 className="mr-2 h-4 w-4" />Изменить</Button></div></td></tr>)}
      </tbody></table></div></CardContent>
    </Card>

    <Dialog open={Boolean(viewing)} onOpenChange={(open) => !open && setViewing(null)}>
      <DialogContent className="flex max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-2xl flex-col overflow-hidden p-0 sm:max-h-[calc(100dvh-3rem)] sm:w-full">
        <DialogHeader className="shrink-0 border-b px-5 py-4 pr-12 sm:px-6">
          <DialogTitle>Разбор экономики сделки</DialogTitle>
          <DialogDescription>{viewing ? `${viewing.contactName} · ${viewing.dealTitle} · ${viewing.stageName}` : ""}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5">
          {viewing && <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Mini label="Сумма сделки" value={rubles(viewing.dealValue)} />
              <Mini label="Получено" value={rubles(viewing.receivedAmount)} good />
              <Mini label="Осталось получить" value={rubles(viewing.unpaid)} />
              <Mini label="Маржа компании" value={percent(viewing.margin)} good={viewing.profit >= 0} />
            </div>

            <div className="overflow-hidden rounded-xl border">
              <div className="border-b bg-muted/40 px-4 py-3"><div className="font-medium">Из чего сложились расходы</div><div className="mt-0.5 text-xs text-muted-foreground">Только расходы этой сделки. Постоянные расходы бизнеса считаются отдельно.</div></div>
              <div className="divide-y">
                <BreakdownRow label="Производство / материалы" value={viewing.productionCost} />
                <BreakdownRow label={`Эквайринг · ${percent(viewing.paymentCommissionRate)}`} value={viewing.paymentCommission} />
                <BreakdownRow label="Доставка" value={viewing.deliveryCost} />
                <BreakdownRow label="Упаковка" value={viewing.packagingCost} />
                <BreakdownRow label="Подрядчики" value={viewing.contractorCost} />
                <BreakdownRow label="Налог / сбор по сделке" value={viewing.taxCost} />
                <BreakdownRow label="Прочее" value={viewing.otherCost} />
                <BreakdownRow label="Прямые расходы итого" value={viewing.directCost} strong />
              </div>
            </div>

            <div className="rounded-xl border bg-slate-50/70 p-4">
              <div className="mb-3 text-sm font-medium">Как получилась прибыль</div>
              <div className="space-y-2 text-sm">
                <FormulaRow label="Получено от клиента" value={viewing.receivedAmount} />
                <FormulaRow label="− Прямые расходы" value={-viewing.directCost} />
                <FormulaRow label="= Прибыль до менеджера" value={viewing.profitBeforeManager} strong />
                <FormulaRow label={`− Менеджер ${viewing.managerCommissionRate || MANAGER_COMMISSION_RATE}%`} value={-viewing.managerCommission} tone="violet" />
                <div className="my-2 border-t" />
                <FormulaRow label="= Остаётся компании" value={viewing.profit} strong tone={viewing.profit >= 0 ? "green" : "red"} />
              </div>
            </div>

            {viewing.economicsNotes && <div className="rounded-xl border bg-muted/20 p-4"><div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Комментарий</div><div className="mt-2 whitespace-pre-wrap text-sm">{viewing.economicsNotes}</div></div>}
          </div>}
        </div>
        <DialogFooter className="shrink-0 border-t bg-background px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>{viewing && <Link href={`/contacts/${viewing.contactId}`}><Button variant="ghost" className="w-full sm:w-auto">Открыть клиента</Button></Link>}</div>
            <div className="flex gap-2"><Button variant="outline" className="flex-1 sm:flex-none" onClick={() => setViewing(null)}>Закрыть</Button>{viewing && <Button className="flex-1 sm:flex-none" onClick={() => { const deal = viewing; setViewing(null); openDeal(deal); }}><Edit3 className="mr-2 h-4 w-4" />Изменить</Button>}</div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={expenseOpen} onOpenChange={(open) => { setExpenseOpen(open); if (!open) resetExpense(); }}><DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle>Добавить расход</DialogTitle><DialogDescription>Фиксированные зарплаты, реклама, сервер, подписки и налоги. Комиссия менеджера по сделкам считается автоматически отдельно.</DialogDescription></DialogHeader>
      <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" onClick={() => preset("salary")}>Зарплаты</Button><Button type="button" variant="outline" size="sm" onClick={() => preset("ads")}>Реклама</Button><Button type="button" variant="outline" size="sm" onClick={() => preset("server")}>Сервер</Button><Button type="button" variant="outline" size="sm" onClick={() => preset("taxes")}>Налог</Button></div>
      <div className="grid gap-4 sm:grid-cols-2"><Field label="Название"><Input value={expenseName} onChange={(e) => setExpenseName(e.target.value)} placeholder="Например, таргет" /></Field><Field label="Категория"><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={expenseCategory} onChange={(e) => { const value = e.target.value; setExpenseCategory(value); if (value === "taxes") setExpenseType("percent"); }}>{Object.entries(expenseCategories).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field></div>
      <div className="grid grid-cols-2 gap-2"><Button type="button" variant={expenseType === "fixed" ? "default" : "outline"} onClick={() => expenseCategory !== "taxes" && setExpenseType("fixed")}>Фиксированная сумма</Button><Button type="button" variant={expenseType === "percent" ? "default" : "outline"} onClick={() => setExpenseType("percent")}>Процент</Button></div>
      {expenseType === "fixed" ? <MoneyField label="Сумма" value={expenseAmount} onChange={setExpenseAmount} /> : <div className="grid gap-4 sm:grid-cols-2"><Field label="Ставка, %"><Input inputMode="decimal" value={expenseRate} onChange={(e) => setExpenseRate(e.target.value)} placeholder="6" /></Field>{taxMode ? <div className="rounded-lg border bg-muted/30 p-3"><div className="text-xs text-muted-foreground">Налоговая база автоматически</div><div className="mt-1 font-semibold">{rubles(percentBaseCents)}</div><div className="text-xs text-muted-foreground">выручка за {monthLabel(data?.taxBase?.baseMonth || null)}</div></div> : <MoneyField label="База для процента" value={expenseBase} onChange={setExpenseBase} />}<div className="sm:col-span-2 rounded-lg border bg-muted/30 p-3"><div className="text-xs text-muted-foreground">Будет начислено</div><div className="mt-1 text-xl font-bold">{rubles(expensePreview)}</div></div></div>}
      <Field label="Оплатить до"><Input type="date" value={expenseDueDate} onChange={(e) => setExpenseDueDate(e.target.value)} /></Field>
      <label className="flex items-start gap-3 rounded-lg border p-3"><input type="checkbox" className="mt-1" checked={expenseRecurring} onChange={(e) => setExpenseRecurring(e.target.checked)} /><span><span className="block text-sm font-medium">Повторять каждый месяц</span><span className="text-xs text-muted-foreground">Сумма, ставка и день оплаты будут переноситься автоматически. Отметка «оплачено» каждый месяц начинается заново.</span></span></label>
      <Field label="Комментарий"><textarea className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm" value={expenseNotes} onChange={(e) => setExpenseNotes(e.target.value)} /></Field>
      <DialogFooter><Button variant="outline" onClick={() => setExpenseOpen(false)}>Отмена</Button><Button onClick={() => void addExpense()} disabled={expenseSaving}>{expenseSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Добавить</Button></DialogFooter>
    </DialogContent></Dialog>

    <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}><DialogContent className="sm:max-w-2xl"><DialogHeader><DialogTitle>Экономика сделки</DialogTitle><DialogDescription>{editing ? `${editing.contactName} · ${editing.dealTitle}` : ""}. Зарплата / комиссия менеджера считается автоматически: 50% от положительной прибыли после всех прямых расходов.</DialogDescription></DialogHeader>
      <div className="grid gap-4 sm:grid-cols-2"><MoneyField label="Получено" value={form.receivedAmount} onChange={(v) => setForm((s) => ({ ...s, receivedAmount: v }))} /><MoneyField label="Производство / материалы" value={form.productionCost} onChange={(v) => setForm((s) => ({ ...s, productionCost: v }))} /><Field label="Эквайринг, %"><Input inputMode="decimal" value={form.paymentCommissionRate} onChange={(e) => setForm((s) => ({ ...s, paymentCommissionRate: e.target.value }))} placeholder="2.5" /><div className="mt-1 text-xs text-muted-foreground">Комиссия: {rubles(dealPreview.acquiring)}</div></Field><MoneyField label="Доставка" value={form.deliveryCost} onChange={(v) => setForm((s) => ({ ...s, deliveryCost: v }))} /><MoneyField label="Упаковка" value={form.packagingCost} onChange={(v) => setForm((s) => ({ ...s, packagingCost: v }))} /><MoneyField label="Подрядчики" value={form.contractorCost} onChange={(v) => setForm((s) => ({ ...s, contractorCost: v }))} /><MoneyField label="Налог/сбор по конкретной сделке" value={form.taxCost} onChange={(v) => setForm((s) => ({ ...s, taxCost: v }))} /><MoneyField label="Прочее" value={form.otherCost} onChange={(v) => setForm((s) => ({ ...s, otherCost: v }))} /></div>
      <div className="rounded-lg border border-violet-200 bg-violet-50/50 p-3 text-sm text-violet-900">Комиссия менеджера = 50% от остатка после производства/материалов, эквайринга, доставки, упаковки, подрядчиков, сборов и прочих прямых расходов. Если заказ уже в минусе, комиссия не начисляется.</div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5"><Mini label="Прямые расходы" value={rubles(dealPreview.directCosts)} /><Mini label="До менеджера" value={rubles(dealPreview.profitBeforeManager)} good={dealPreview.profitBeforeManager >= 0} /><Mini label="Менеджер 50%" value={rubles(dealPreview.managerCommission)} /><Mini label="Компания" value={rubles(dealPreview.profit)} good={dealPreview.profit >= 0} /><Mini label="Маржа компании" value={percent(dealPreview.margin)} /></div>
      <Field label="Комментарий"><textarea className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm" value={form.notes} onChange={(e) => setForm((s) => ({ ...s, notes: e.target.value }))} /></Field>
      <DialogFooter><Button variant="outline" onClick={() => setEditing(null)}>Отмена</Button><Button onClick={() => void saveDeal()} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Сохранить</Button></DialogFooter>
    </DialogContent></Dialog>
  </div>;
}

function Stat({ label, value, note, tone = "" }: { label: string; value: string; note: string; tone?: string }) { return <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">{label}</div><div className={`mt-1 text-2xl font-bold ${tone}`}>{value}</div><div className="mt-1 text-xs text-muted-foreground">{note}</div></CardContent></Card>; }
function Mini({ label, value, good = false }: { label: string; value: string; good?: boolean }) { return <div className="rounded-lg border bg-background p-3"><div className="text-xs text-muted-foreground">{label}</div><div className={`mt-1 text-lg font-semibold ${good ? "text-emerald-700" : ""}`}>{value}</div></div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-2"><Label>{label}</Label>{children}</div>; }
function MoneyField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <Field label={label}><div className="relative"><Input inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} placeholder="0" className="pr-8" /><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">₽</span></div></Field>; }
function BreakdownRow({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) { return <div className={`flex items-center justify-between gap-4 px-4 py-3 ${strong ? "bg-muted/25 font-semibold" : ""}`}><span className="text-sm text-muted-foreground">{label}</span><span className="text-sm tabular-nums">{rubles(value)}</span></div>; }
function FormulaRow({ label, value, strong = false, tone }: { label: string; value: number; strong?: boolean; tone?: "violet" | "green" | "red" }) { const toneClass = tone === "violet" ? "text-violet-700" : tone === "green" ? "text-emerald-700" : tone === "red" ? "text-red-700" : ""; return <div className={`flex items-center justify-between gap-4 ${strong ? "font-semibold" : ""}`}><span className="text-muted-foreground">{label}</span><span className={`tabular-nums ${toneClass}`}>{value < 0 ? `−${rubles(Math.abs(value))}` : rubles(value)}</span></div>; }
