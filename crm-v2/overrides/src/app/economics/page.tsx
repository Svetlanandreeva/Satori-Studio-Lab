"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2,
  CalendarClock,
  Calculator,
  CheckCircle2,
  Edit3,
  Loader2,
  Percent as PercentIcon,
  Plus,
  Search,
  Trash2,
  WalletCards,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface EconomicsDeal {
  dealId: string;
  dealTitle: string;
  dealValue: number;
  contactId: string;
  contactName: string;
  company: string | null;
  stageName: string;
  calculationEnteredAt: number;
  receivedAmount: number;
  productionCost: number;
  paymentCommission: number;
  deliveryCost: number;
  packagingCost: number;
  contractorCost: number;
  taxCost: number;
  otherCost: number;
  economicsNotes: string | null;
  totalCost: number;
  profit: number;
  margin: number;
  unpaid: number;
}

interface ClientEconomics {
  contactId: string;
  contactName: string;
  company: string | null;
  deals: number;
  receivedAmount: number;
  totalCost: number;
  profit: number;
  margin: number;
}

interface FixedExpense {
  id: string;
  month: string;
  name: string;
  category: string;
  amount: number;
  expenseType: "fixed" | "percent" | string;
  percentRate: number;
  percentBaseAmount: number;
  dueDate: string | null;
  paidAt: string | null;
  paymentStatus: "paid" | "overdue" | "due_today" | "due_soon" | "upcoming" | "no_date";
  daysToPayment: number | null;
  notes: string | null;
}

interface EconomicsPayload {
  deals: EconomicsDeal[];
  clients: ClientEconomics[];
  totals: {
    dealValue: number;
    receivedAmount: number;
    totalCost: number;
    profit: number;
    margin: number;
  };
  fixedExpenses: {
    month: string;
    items: FixedExpense[];
    total: number;
    paidTotal: number;
    unpaidTotal: number;
  };
}

interface FormState {
  receivedAmount: string;
  productionCost: string;
  paymentCommission: string;
  deliveryCost: string;
  packagingCost: string;
  contractorCost: string;
  taxCost: string;
  otherCost: string;
  notes: string;
}

const emptyForm: FormState = {
  receivedAmount: "",
  productionCost: "",
  paymentCommission: "",
  deliveryCost: "",
  packagingCost: "",
  contractorCost: "",
  taxCost: "",
  otherCost: "",
  notes: "",
};

const expenseCategories: Record<string, string> = {
  server: "Сервер / IT",
  ads: "Реклама",
  subscriptions: "Подписки / сервисы",
  rent: "Аренда",
  utilities: "Электричество / коммунальные",
  salary: "Команда / зарплаты",
  accounting: "Бухгалтерия",
  taxes: "Налоги",
  other: "Прочее",
};

function browserMonth(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function browserDate(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function rubles(cents: number): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format((Number(cents) || 0) / 100);
}

function toRubles(cents: number): string {
  const value = (Number(cents) || 0) / 100;
  return value ? String(value) : "";
}

function toCents(value: string): number {
  const normalized = value.replace(/\s/g, "").replace(",", ".");
  const number = Number(normalized);
  return Number.isFinite(number) && number > 0 ? Math.round(number * 100) : 0;
}

function percent(value: number): string {
  return `${(Number(value) || 0).toLocaleString("ru-RU", { maximumFractionDigits: 2 })}%`;
}

function profitClass(value: number): string {
  if (value > 0) return "text-emerald-700";
  if (value < 0) return "text-red-700";
  return "text-muted-foreground";
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("ru-RU").format(new Date(year, month - 1, day));
}

function expenseStatus(expense: FixedExpense): { label: string; className: string } {
  if (expense.paidAt) {
    return { label: `Оплачено ${formatDate(expense.paidAt)}`, className: "border-emerald-300 bg-emerald-50 text-emerald-700" };
  }
  if (expense.paymentStatus === "overdue") {
    return { label: `Просрочено ${Math.abs(expense.daysToPayment || 0)} дн.`, className: "border-red-300 bg-red-50 text-red-700" };
  }
  if (expense.paymentStatus === "due_today") {
    return { label: "Оплатить сегодня", className: "border-red-300 bg-red-50 text-red-700" };
  }
  if (expense.paymentStatus === "due_soon") {
    return { label: `Через ${expense.daysToPayment} дн.`, className: "border-amber-300 bg-amber-50 text-amber-700" };
  }
  if (expense.dueDate) {
    return { label: `До ${formatDate(expense.dueDate)}`, className: "border-slate-300 bg-slate-50 text-slate-600" };
  }
  return { label: "Без даты", className: "border-slate-300 bg-slate-50 text-slate-600" };
}

export default function EconomicsPage() {
  const [data, setData] = useState<EconomicsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
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
  const [expensePaidAt, setExpensePaidAt] = useState("");
  const [paymentBusy, setPaymentBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/economics?month=${encodeURIComponent(month)}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Не удалось загрузить экономику");
      setData(payload as EconomicsPayload);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка загрузки экономики");
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

  const openDeal = (deal: EconomicsDeal) => {
    setEditing(deal);
    setForm({
      receivedAmount: toRubles(deal.receivedAmount),
      productionCost: toRubles(deal.productionCost),
      paymentCommission: toRubles(deal.paymentCommission),
      deliveryCost: toRubles(deal.deliveryCost),
      packagingCost: toRubles(deal.packagingCost),
      contractorCost: toRubles(deal.contractorCost),
      taxCost: toRubles(deal.taxCost),
      otherCost: toRubles(deal.otherCost),
      notes: deal.economicsNotes || "",
    });
  };

  const preview = useMemo(() => {
    const received = toCents(form.receivedAmount);
    const costs =
      toCents(form.productionCost) +
      toCents(form.paymentCommission) +
      toCents(form.deliveryCost) +
      toCents(form.packagingCost) +
      toCents(form.contractorCost) +
      toCents(form.taxCost) +
      toCents(form.otherCost);
    const profit = received - costs;
    return {
      received,
      costs,
      profit,
      margin: received > 0 ? (profit / received) * 100 : 0,
    };
  }, [form]);

  const expensePreview = useMemo(() => {
    if (expenseType === "fixed") return toCents(expenseAmount);
    const rate = Number(expenseRate.replace(",", ".")) || 0;
    return Math.round((toCents(expenseBase) * rate) / 100);
  }, [expenseAmount, expenseBase, expenseRate, expenseType]);

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const response = await fetch("/api/economics", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          dealId: editing.dealId,
          receivedAmount: toCents(form.receivedAmount),
          productionCost: toCents(form.productionCost),
          paymentCommission: toCents(form.paymentCommission),
          deliveryCost: toCents(form.deliveryCost),
          packagingCost: toCents(form.packagingCost),
          contractorCost: toCents(form.contractorCost),
          taxCost: toCents(form.taxCost),
          otherCost: toCents(form.otherCost),
          notes: form.notes,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Не удалось сохранить расчёт");
      toast.success("Экономика сделки сохранена");
      setEditing(null);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  };

  const resetExpenseForm = () => {
    setExpenseName("");
    setExpenseAmount("");
    setExpenseCategory("other");
    setExpenseNotes("");
    setExpenseType("fixed");
    setExpenseRate("");
    setExpenseBase("");
    setExpenseDueDate("");
    setExpensePaidAt("");
  };

  const addFixedExpense = async () => {
    if (!expenseName.trim()) {
      toast.error("Укажи название расхода");
      return;
    }
    setExpenseSaving(true);
    try {
      const response = await fetch("/api/economics", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          month,
          name: expenseName,
          category: expenseCategory,
          amount: toCents(expenseAmount),
          expenseType,
          percentRate: Number(expenseRate.replace(",", ".")) || 0,
          percentBaseAmount: toCents(expenseBase),
          dueDate: expenseDueDate || null,
          paidAt: expensePaidAt || null,
          notes: expenseNotes,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Не удалось добавить расход");
      toast.success("Постоянный расход добавлен");
      setExpenseOpen(false);
      resetExpenseForm();
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка сохранения расхода");
    } finally {
      setExpenseSaving(false);
    }
  };

  const markPaid = async (expense: FixedExpense) => {
    setPaymentBusy(expense.id);
    try {
      const response = await fetch("/api/economics", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expenseId: expense.id, paidAt: expense.paidAt ? null : browserDate() }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Не удалось изменить оплату");
      toast.success(expense.paidAt ? "Отметка оплаты снята" : "Расход отмечен оплаченным");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка оплаты");
    } finally {
      setPaymentBusy(null);
    }
  };

  const removeFixedExpense = async (id: string) => {
    try {
      const response = await fetch(`/api/economics?expenseId=${encodeURIComponent(id)}`, { method: "DELETE" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Не удалось удалить расход");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка удаления расхода");
    }
  };

  const visibleDeals = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!data) return [];
    if (!query) return data.deals;
    return data.deals.filter((deal) =>
      [deal.dealTitle, deal.contactName, deal.company, deal.stageName]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  }, [data, search]);

  if (loading && !data) {
    return (
      <div className="flex min-h-80 items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Загрузка экономики...
      </div>
    );
  }

  const totals = data?.totals || { dealValue: 0, receivedAmount: 0, totalCost: 0, profit: 0, margin: 0 };
  const fixed = data?.fixedExpenses || { month, items: [], total: 0, paidTotal: 0, unpaidTotal: 0 };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Calculator className="h-6 w-6" />
            <h1 className="text-2xl font-bold tracking-tight">Экономика</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            В расчёты попадают только сделки, которые дошли до этапа «Расчёт». «Игнор» и спам автоматически убираются в Песочницу.
          </p>
        </div>
        <div className="relative w-full xl:w-96">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Поиск по клиенту или сделке..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Summary label="Получено от клиентов" value={rubles(totals.receivedAmount)} note={`Сумма сделок: ${rubles(totals.dealValue)}`} />
        <Summary label="Реальные расходы по заказам" value={rubles(totals.totalCost)} note="Производство + комиссии + логистика + прочее" />
        <Summary label="Прибыль по заказам" value={rubles(totals.profit)} note="До постоянных расходов бизнеса" className={profitClass(totals.profit)} />
        <Summary label="Маржа" value={percent(totals.margin)} note="От фактически полученной выручки" className={profitClass(totals.profit)} />
      </div>

      <Card>
        <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" /> Постоянные расходы бизнеса</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">Фиксированные платежи, налоги в процентах, срок оплаты и фактическая дата оплаты.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="w-full sm:w-44" />
            <Button onClick={() => setExpenseOpen(true)}><Plus className="mr-2 h-4 w-4" /> Добавить расход</Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            <MiniSummary label="Начислено за месяц" value={rubles(fixed.total)} />
            <MiniSummary label="Оплачено" value={rubles(fixed.paidTotal)} positive />
            <MiniSummary label="К оплате" value={rubles(fixed.unpaidTotal)} />
          </div>

          <div className="space-y-2">
            {fixed.items.map((expense) => {
              const status = expenseStatus(expense);
              return (
                <div key={expense.id} className="flex flex-col gap-3 rounded-lg border p-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-medium">{expense.name}</div>
                      {expense.expenseType === "percent" && (
                        <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">
                          <PercentIcon className="mr-1 h-3 w-3" /> {percent(expense.percentRate)} от {rubles(expense.percentBaseAmount)}
                        </Badge>
                      )}
                      <Badge variant="outline" className={status.className}>{status.label}</Badge>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {expenseCategories[expense.category] || expense.category}
                      {expense.dueDate ? ` · оплатить до ${formatDate(expense.dueDate)}` : ""}
                      {expense.notes ? ` · ${expense.notes}` : ""}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 lg:justify-end">
                    <div className="mr-2 text-lg font-semibold">{rubles(expense.amount)}</div>
                    <Button variant="outline" size="sm" onClick={() => markPaid(expense)} disabled={paymentBusy === expense.id}>
                      {paymentBusy === expense.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                      {expense.paidAt ? "Снять оплату" : "Оплачено сегодня"}
                    </Button>
                    <Button variant="ghost" size="icon-sm" onClick={() => removeFixedExpense(expense.id)} aria-label="Удалить расход">
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </div>
                </div>
              );
            })}
            {fixed.items.length === 0 && (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                За этот месяц постоянные расходы ещё не внесены.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><WalletCards className="h-5 w-5" /> Экономика по сделкам после «Расчёта»</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="border-y bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Клиент / сделка</th>
                  <th className="px-4 py-3 text-right">Сумма сделки</th>
                  <th className="px-4 py-3 text-right">Получено</th>
                  <th className="px-4 py-3 text-right">Расходы</th>
                  <th className="px-4 py-3 text-right">Прибыль</th>
                  <th className="px-4 py-3 text-right">Маржа</th>
                  <th className="px-4 py-3 text-right">Не получено</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {visibleDeals.map((deal) => (
                  <tr key={deal.dealId} className="hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <Link href={`/contacts/${deal.contactId}`} className="font-medium hover:underline">{deal.contactName}</Link>
                      <div className="text-xs text-muted-foreground">{deal.dealTitle} · {deal.stageName}</div>
                    </td>
                    <td className="px-4 py-3 text-right">{rubles(deal.dealValue)}</td>
                    <td className="px-4 py-3 text-right font-medium">{rubles(deal.receivedAmount)}</td>
                    <td className="px-4 py-3 text-right">{rubles(deal.totalCost)}</td>
                    <td className={`px-4 py-3 text-right font-semibold ${profitClass(deal.profit)}`}>{rubles(deal.profit)}</td>
                    <td className={`px-4 py-3 text-right ${profitClass(deal.profit)}`}>{percent(deal.margin)}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{rubles(deal.unpaid)}</td>
                    <td className="px-4 py-3 text-right"><Button size="sm" variant="outline" onClick={() => openDeal(deal)}><Edit3 className="mr-2 h-4 w-4" /> Посчитать</Button></td>
                  </tr>
                ))}
                {visibleDeals.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">Пока нет сделок, дошедших до этапа «Расчёт»</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Реальная прибыль по клиентам</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {(data?.clients || []).map((client) => (
              <Link key={client.contactId} href={`/contacts/${client.contactId}`} className="rounded-lg border p-4 transition-colors hover:bg-muted/30">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="font-semibold">{client.contactName}</div>
                    <div className="text-xs text-muted-foreground">{client.company || `${client.deals} сделок`}</div>
                  </div>
                  <Badge variant="outline">{percent(client.margin)}</Badge>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
                  <MiniValue label="Получено" value={rubles(client.receivedAmount)} />
                  <MiniValue label="Расходы" value={rubles(client.totalCost)} />
                  <MiniValue label="Прибыль" value={rubles(client.profit)} className={profitClass(client.profit)} />
                </div>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Экономика сделки</DialogTitle>
            <DialogDescription>
              {editing ? `${editing.contactName} · ${editing.dealTitle}` : ""}. Вводи фактические суммы в рублях.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <MoneyField label="Получено от клиента" value={form.receivedAmount} onChange={(value) => setForm((current) => ({ ...current, receivedAmount: value }))} emphasis />
            <MoneyField label="Производство" value={form.productionCost} onChange={(value) => setForm((current) => ({ ...current, productionCost: value }))} />
            <MoneyField label="Комиссия банка / эквайринга" value={form.paymentCommission} onChange={(value) => setForm((current) => ({ ...current, paymentCommission: value }))} />
            <MoneyField label="Доставка / логистика" value={form.deliveryCost} onChange={(value) => setForm((current) => ({ ...current, deliveryCost: value }))} />
            <MoneyField label="Упаковка" value={form.packagingCost} onChange={(value) => setForm((current) => ({ ...current, packagingCost: value }))} />
            <MoneyField label="Подрядчики" value={form.contractorCost} onChange={(value) => setForm((current) => ({ ...current, contractorCost: value }))} />
            <MoneyField label="Налоги по конкретному заказу" value={form.taxCost} onChange={(value) => setForm((current) => ({ ...current, taxCost: value }))} />
            <MoneyField label="Прочие издержки" value={form.otherCost} onChange={(value) => setForm((current) => ({ ...current, otherCost: value }))} />
          </div>

          <div className="grid grid-cols-1 gap-3 rounded-xl border bg-muted/30 p-4 sm:grid-cols-3">
            <MiniValue label="Все расходы" value={rubles(preview.costs)} />
            <MiniValue label="Чистая прибыль" value={rubles(preview.profit)} className={profitClass(preview.profit)} />
            <MiniValue label="Маржа" value={percent(preview.margin)} className={profitClass(preview.profit)} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="economics-notes">Комментарий к расходам</Label>
            <textarea
              id="economics-notes"
              className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              value={form.notes}
              onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
              placeholder="Например: производство 20 шт., доставка до Екатеринбурга, комиссия ЮKassa..."
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>Отмена</Button>
            <Button onClick={save} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Сохранить расчёт</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={expenseOpen} onOpenChange={(open) => { setExpenseOpen(open); if (!open) resetExpenseForm(); }}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Постоянный расход</DialogTitle>
            <DialogDescription>Фиксированный платёж или процентный налог за {month}.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted/40 p-1">
              <button
                type="button"
                className={`rounded-md px-3 py-2 text-sm font-medium ${expenseType === "fixed" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
                onClick={() => setExpenseType("fixed")}
              >
                Фиксированная сумма
              </button>
              <button
                type="button"
                className={`rounded-md px-3 py-2 text-sm font-medium ${expenseType === "percent" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
                onClick={() => { setExpenseType("percent"); if (expenseCategory === "other") setExpenseCategory("taxes"); }}
              >
                Процент / налог
              </button>
            </div>

            <div className="space-y-2">
              <Label htmlFor="expense-name">Название</Label>
              <Input id="expense-name" value={expenseName} onChange={(event) => setExpenseName(event.target.value)} placeholder={expenseType === "percent" ? "Например: УСН 6%" : "Например: сервер CRM"} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="expense-category">Категория</Label>
              <select
                id="expense-category"
                value={expenseCategory}
                onChange={(event) => setExpenseCategory(event.target.value)}
                className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              >
                {Object.entries(expenseCategories).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>

            {expenseType === "fixed" ? (
              <MoneyField label="Сумма" value={expenseAmount} onChange={setExpenseAmount} emphasis />
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Ставка налога, %</Label>
                  <div className="relative">
                    <Input inputMode="decimal" value={expenseRate} onChange={(event) => setExpenseRate(event.target.value)} placeholder="6" className="pr-9" />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                  </div>
                </div>
                <MoneyField label="База для налога" value={expenseBase} onChange={setExpenseBase} />
                <div className="sm:col-span-2 rounded-lg border bg-muted/30 p-3">
                  <div className="text-xs text-muted-foreground">Начислено по ставке</div>
                  <div className="mt-1 text-xl font-bold">{rubles(expensePreview)}</div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="expense-due">Оплатить до</Label>
                <Input id="expense-due" type="date" value={expenseDueDate} onChange={(event) => setExpenseDueDate(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="expense-paid">Дата оплаты</Label>
                <Input id="expense-paid" type="date" value={expensePaidAt} onChange={(event) => setExpensePaidAt(event.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="expense-notes">Комментарий</Label>
              <Input id="expense-notes" value={expenseNotes} onChange={(event) => setExpenseNotes(event.target.value)} placeholder="Необязательно" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setExpenseOpen(false)} disabled={expenseSaving}>Отмена</Button>
            <Button onClick={addFixedExpense} disabled={expenseSaving}>{expenseSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Добавить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Summary({ label, value, note, className = "" }: { label: string; value: string; note: string; className?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{label}</CardTitle></CardHeader>
      <CardContent><div className={`text-2xl font-bold ${className}`}>{value}</div><p className="mt-1 text-xs text-muted-foreground">{note}</p></CardContent>
    </Card>
  );
}

function MiniSummary({ label, value, positive = false }: { label: string; value: string; positive?: boolean }) {
  return (
    <div className="rounded-xl border bg-muted/20 p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 text-xl font-bold ${positive ? "text-emerald-700" : ""}`}>{value}</div>
    </div>
  );
}

function MiniValue({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 font-medium ${className}`}>{value}</div>
    </div>
  );
}

function MoneyField({ label, value, onChange, emphasis = false }: { label: string; value: string; onChange: (value: string) => void; emphasis?: boolean }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="relative">
        <Input
          inputMode="decimal"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="0"
          className={`pr-9 ${emphasis ? "font-semibold" : ""}`}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">₽</span>
      </div>
    </div>
  );
}
