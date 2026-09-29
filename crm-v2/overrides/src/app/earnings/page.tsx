import Link from "next/link";
import { sqlite } from "@/db";
import { isOwner, pageActor } from "@/lib/access";
import { managerEarnings } from "@/lib/earnings";
import { EarningsOwnerTools, DeletePayout } from "@/components/earnings/EarningsOwnerTools";

export const dynamic = "force-dynamic";

const rub = (kop: number) => new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format((Number(kop) || 0) / 100);
const day = (d: string | null) => (d ? new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`)) : "—");

/** «Заработано»: доля менеджера от прибыли его проектов и выплаты. */
export default async function EarningsPage({ searchParams }: { searchParams?: Promise<{ member?: string }> }) {
  const actor = await pageActor();
  const owner = isOwner(actor);
  const managers = owner ? (sqlite.prepare("SELECT id, name FROM team_members WHERE active=1 AND role='manager' ORDER BY name").all() as Array<{ id: string; name: string }>) : [];
  const asked = String((await searchParams)?.member || "");
  const memberId = owner ? (managers.find((m) => m.id === asked)?.id || managers[0]?.id || "") : actor.id;
  const name = owner ? managers.find((m) => m.id === memberId)?.name : actor.name;

  if (!memberId) {
    return (
      <div className="mx-auto max-w-[1100px] space-y-4 pb-10">
        <h1 className="text-2xl font-semibold tracking-tight">Заработано</h1>
        <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-[14px] text-slate-500">Менеджеров пока нет. Добавь сотрудника с ролью «Менеджер» в «Ещё → Контроль», и здесь появится его заработок.</div>
      </div>
    );
  }

  const e = managerEarnings(memberId);
  const t = e.totals;
  return (
    <div className="mx-auto max-w-[1100px] space-y-5 pb-10">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">Заработано</h1>
        {owner && managers.length > 1 && (
          <div className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1 text-[13px] dark:border-white/[.08] dark:bg-[#16181d]">
            {managers.map((m) => <Link key={m.id} href={`/earnings?member=${m.id}`} className={`rounded-lg px-3 py-1 ${m.id === memberId ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "text-slate-600 hover:bg-slate-100"}`}>{m.name}</Link>)}
          </div>
        )}
        {owner && managers.length === 1 && <span className="text-[14px] text-slate-500">{name}</span>}
        <span className="text-[13px] text-slate-400">{e.rate}% от прибыли проекта</span>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="К выплате" value={rub(Math.max(0, t.due))} hint={t.due < 0 ? `аванс ${rub(-t.due)} — закроется будущими проектами` : "начислено минус выплачено"} strong />
        <Kpi label="Начислено" value={rub(t.earned)} hint="по завершённым проектам" />
        <Kpi label="Ожидается" value={rub(t.pending)} hint="проекты ещё в работе — сумма может измениться" />
        <Kpi label="Выплачено" value={rub(t.paid)} hint={`${e.payouts.length} выплат`} />
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-white/[.08] dark:bg-[#16181d]">
        <div className="border-b border-slate-100 px-5 py-3.5 dark:border-white/[.06]"><h2 className="text-[15px] font-semibold">Проекты{owner ? "" : " с оплатой"}</h2><p className="mt-0.5 text-[12px] text-slate-400">Прибыль = получено от клиента − затраты по проекту. Доля считается от неё; пока проект не завершён, затраты могут добавиться.</p></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[13px]">
            <thead className="text-[11.5px] text-slate-500"><tr className="border-b border-slate-100 dark:border-white/[.06]">
              <th className="px-5 py-2.5 text-left font-medium">Проект</th><th className="px-4 py-2.5 text-left font-medium">Оплата</th><th className="px-4 py-2.5 text-right font-medium">Получено</th>
              {owner && <><th className="px-4 py-2.5 text-right font-medium">Затраты</th><th className="px-4 py-2.5 text-right font-medium">Прибыль</th></>}
              <th className="px-5 py-2.5 text-right font-medium">Доля {e.rate}%</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/[.06]">
              {e.deals.map((d) => (
                <tr key={d.dealId}>
                  <td className="px-5 py-2.5"><Link href={`/deals/${d.dealId}`} className="font-medium hover:underline">{d.title}</Link><div className="text-[11.5px] text-slate-400">{d.client || "—"} · {d.done ? "завершён" : d.stage || "в работе"}</div></td>
                  <td className="px-4 py-2.5 text-slate-500">{day(d.paidAt)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{rub(d.received)}</td>
                  {owner && <><td className="px-4 py-2.5 text-right tabular-nums text-slate-500">{rub(d.directCost)}</td><td className={`px-4 py-2.5 text-right tabular-nums ${d.profit < 0 ? "text-rose-600" : ""}`}>{rub(d.profit)}</td></>}
                  <td className="px-5 py-2.5 text-right"><span className="font-semibold tabular-nums">{rub(d.share)}</span>{!d.done && <div className="text-[11px] text-amber-700">предварительно</div>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!e.deals.length && <div className="p-8 text-center text-[13px] text-slate-400">Пока нет проектов с оплатой, где {owner ? "он" : "ты"} ответственный.</div>}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-white/[.08] dark:bg-[#16181d]">
        <div className="border-b border-slate-100 px-5 py-3.5 dark:border-white/[.06]"><h2 className="text-[15px] font-semibold">Выплаты</h2></div>
        {owner && <div className="border-b border-slate-100 p-5 dark:border-white/[.06]"><EarningsOwnerTools memberId={memberId} rate={e.rate} due={t.due} /></div>}
        <div className="divide-y divide-slate-100 dark:divide-white/[.06]">
          {e.payouts.map((p) => (
            <div key={p.id} className="flex items-center gap-3 px-5 py-2.5 text-[13px]">
              <span className="w-28 text-slate-500">{day(p.paidAt)}</span>
              <span className="min-w-0 flex-1 truncate text-slate-600 dark:text-slate-300">{p.note || "Выплата"}</span>
              <span className="font-semibold tabular-nums">{rub(p.amount)}</span>
              {owner && <DeletePayout id={p.id} />}
            </div>
          ))}
          {!e.payouts.length && <div className="px-5 py-6 text-center text-[13px] text-slate-400">Выплат ещё не было.</div>}
        </div>
      </section>
    </div>
  );
}

function Kpi({ label, value, hint, strong }: { label: string; value: string; hint: string; strong?: boolean }) {
  return <div className={`rounded-2xl border px-4 py-3 shadow-sm ${strong ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-500/25 dark:bg-emerald-500/[.07]" : "border-slate-200/80 bg-white dark:border-white/[.08] dark:bg-[#16181d]"}`}><div className="text-[12px] text-slate-500">{label}</div><div className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{value}</div><div className="mt-0.5 truncate text-[11.5px] text-slate-400" title={hint}>{hint}</div></div>;
}
