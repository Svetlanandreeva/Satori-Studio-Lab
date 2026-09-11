"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Calculator, Edit3, Loader2, Search, TrendingDown, TrendingUp, WalletCards } from "lucide-react";
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
  return `${(Number(value) || 0).toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%`;
}

function profitClass(value: number): string {
  if (value > 0) return "text-emerald-700";
  if (value < 0) return "text-red-700";
  return "text-muted-foreground";
}

export default function EconomicsPage() {
  const [data, setData] = useState<EconomicsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<EconomicsDeal | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/economics", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Не удалось загрузить экономику");
      setData(payload as EconomicsPayload);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка загрузки экономики");
    } finally {
      setLoading(false);
    }
  }, []);

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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Calculator className="h-6 w-6" />
            <h1 className="text-2xl font-bold tracking-tight">Экономика</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Фактическая прибыль: считаем только реально полученные деньги и реальные расходы.
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
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Получено от клиентов</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{rubles(totals.receivedAmount)}</div><p className="mt-1 text-xs text-muted-foreground">Сумма сделок: {rubles(totals.dealValue)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Все реальные расходы</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{rubles(totals.totalCost)}</div><p className="mt-1 text-xs text-muted-foreground">Производство + комиссии + логистика + прочее</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Чистая прибыль</CardTitle></CardHeader>
          <CardContent><div className={`text-2xl font-bold ${profitClass(totals.profit)}`}>{rubles(totals.profit)}</div><p className="mt-1 text-xs text-muted-foreground">Получено минус все расходы</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Маржа</CardTitle></CardHeader>
          <CardContent><div className={`text-2xl font-bold ${profitClass(totals.profit)}`}>{percent(totals.margin)}</div><p className="mt-1 text-xs text-muted-foreground">От фактически полученной выручки</p></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><WalletCards className="h-5 w-5" /> Экономика по сделкам</CardTitle>
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
                  <tr><td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">Ничего не найдено</td></tr>
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
                  <Badge variant={client.profit >= 0 ? "outline" : "destructive"}>{percent(client.margin)}</Badge>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
                  <div><div className="text-xs text-muted-foreground">Получено</div><div className="font-medium">{rubles(client.receivedAmount)}</div></div>
                  <div><div className="text-xs text-muted-foreground">Расходы</div><div className="font-medium">{rubles(client.totalCost)}</div></div>
                  <div><div className="text-xs text-muted-foreground">Прибыль</div><div className={`font-semibold ${profitClass(client.profit)}`}>{rubles(client.profit)}</div></div>
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
            <MoneyField label="Налоги" value={form.taxCost} onChange={(value) => setForm((current) => ({ ...current, taxCost: value }))} />
            <MoneyField label="Прочие издержки" value={form.otherCost} onChange={(value) => setForm((current) => ({ ...current, otherCost: value }))} />
          </div>

          <div className="grid grid-cols-1 gap-3 rounded-xl border bg-muted/30 p-4 sm:grid-cols-3">
            <div><div className="text-xs text-muted-foreground">Все расходы</div><div className="text-lg font-semibold">{rubles(preview.costs)}</div></div>
            <div><div className="text-xs text-muted-foreground">Чистая прибыль</div><div className={`text-lg font-semibold ${profitClass(preview.profit)}`}>{rubles(preview.profit)}</div></div>
            <div><div className="text-xs text-muted-foreground">Маржа</div><div className={`text-lg font-semibold ${profitClass(preview.profit)}`}>{percent(preview.margin)}</div></div>
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
