import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Plus, Save, Trash2 } from "lucide-react";

const categories = ["Материалы", "Работа", "Подрядчики", "Упаковка", "Доставка", "Прочее"];
type Contact = { leadId: string; name: string; details: string };
type Expense = { title: string; category: string; kopecks: number };
type Project = {
  id: string;
  revision: number;
  title: string;
  units: number;
  contact: Contact;
  expenses: Expense[];
};
type LeadContact = { id: string; name?: string; company?: string; crmNumber?: string; isSpam?: boolean };
type DraftExpense = { key: number; title: string; category: string; amount: string };
type Draft = { title: string; units: string; contact: Contact; expenses: DraftExpense[] };
const api = "/api/admin/projects";
const currency = new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB" });
const rubles = (kopecks: number) => currency.format(kopecks / 100);
const total = (project: Project) => project.expenses.reduce((sum, expense) => sum + expense.kopecks, 0);

function parseKopecks(input: string) {
  const value = input.trim().replace(",", ".");
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(value)) return 0;
  const [rub, kop = ""] = value.split(".");
  return Number(rub) * 100 + Number(kop.padEnd(2, "0"));
}

function draftFrom(project: Project | null): Draft {
  return {
    title: project?.title ?? "",
    units: String(project?.units ?? 1),
    contact: project?.contact ?? { leadId: "", name: "", details: "" },
    expenses: project?.expenses.map((row, key) => ({
      key, title: row.title, category: row.category, amount: String(row.kopecks / 100),
    })) ?? [],
  };
}

export default function AdminProjects({
  token, leads, onUnauthorized, onDirtyChange,
}: { token: string; leads: LeadContact[]; onUnauthorized: () => void; onDirtyChange: (dirty: boolean) => void }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [opened, setOpened] = useState<Project | null | undefined>(undefined);
  const [draft, setDraft] = useState<Draft>(draftFrom(null));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [reload, setReload] = useState(0);
  const dirty = JSON.stringify(draft) !== JSON.stringify(draftFrom(opened ?? null));
  useEffect(() => { onDirtyChange(dirty || saving); }, [dirty, saving, onDirtyChange]);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      try {
        const response = await fetch(api, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal });
        if (response.status === 401) return onUnauthorized();
        if (!response.ok) throw new Error("Не удалось загрузить проекты.");
        setProjects(await response.json());
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Не удалось загрузить проекты.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [token, reload, onUnauthorized]);

  function open(project: Project | null) {
    if (dirty && !window.confirm("В проекте есть несохранённые изменения. Закрыть его?")) return;
    setOpened(project);
    setDraft(draftFrom(project));
    setSaved(false);
    setError("");
  }

  function changeExpense(key: number, changes: Partial<DraftExpense>) {
    setDraft((current) => ({
      ...current, expenses: current.expenses.map((row) => row.key === key ? { ...row, ...changes } : row),
    }));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const expenses = draft.expenses.map(({ title, category, amount }) => ({ title, category, kopecks: parseKopecks(amount) }));
    if (expenses.some((row) => row.kopecks <= 0 || row.kopecks > 100_000_000_000)) {
      setError("Укажите сумму каждой затраты в рублях. Можно ввести до двух знаков после запятой.");
      return;
    }
    setError("");
    setSaving(true);
    setSaved(false);
    try {
      const response = await fetch(opened ? `${api}/${opened.id}` : api, {
        method: opened ? "PUT" : "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ title: draft.title, units: Number(draft.units), contact: draft.contact, expenses, revision: opened?.revision }),
      });
      if (response.status === 401) return onUnauthorized();
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status === 409) setReload((value) => value + 1);
        throw new Error(data?.error || "Не удалось сохранить проект.");
      }
      const project: Project = data;
      setProjects((current) => [project, ...current.filter((item) => item.id !== project.id)]);
      setOpened(project);
      setDraft(draftFrom(project));
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось сохранить проект.");
    } finally {
      setSaving(false);
    }
  }

  const leadOptions = leads.filter((lead) => !lead.isSpam || lead.id === draft.contact.leadId);
  const subtotal = draft.expenses.reduce((sum, row) => sum + parseKopecks(row.amount), 0);
  const units = Number(draft.units);
  return <section className="fa-projects">
    <div className="fa-project-heading">
      <div><h1>Проекты</h1><p>Контакты, расходы и себестоимость</p></div>
      <button className="fa-primary" type="button" disabled={loading || saving} onClick={() => open(null)}><Plus size={16}/> Новый проект</button>
    </div>
    {error && <div className="fa-error" role="alert">{error}</div>}
    {loading && opened === undefined ? <p role="status">Загрузка проектов…</p> : <div className="fa-project-layout">
      <aside className="fa-project-list" aria-label="Список проектов">
        {projects.length === 0 && <p>{error ? "Список недоступен." : "Проектов пока нет."}</p>}
        {error && opened === undefined && <button type="button" onClick={() => { setError(""); setReload((value) => value + 1); }}>Повторить загрузку</button>}
        {projects.map((project) => <button key={project.id} type="button" aria-pressed={opened?.id === project.id} disabled={saving} onClick={() => open(project)}>
          <strong>{project.title}</strong><span>{project.contact.name}</span><b>{rubles(total(project))}</b>
        </button>)}
      </aside>
      {opened === undefined ? <div className="fa-project-empty">Выберите проект или создайте новый.</div> :
        <form onSubmit={save} className="fa-project-form">
          <fieldset disabled={saving}>
            <h2>{opened ? "Карточка проекта" : "Новый проект"}</h2>
            <div className="fa-project-fields">
              <label>Название проекта<input required maxLength={200} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Например, 18 лайтбоксов"/></label>
              <label>Количество изделий<input required type="number" min="1" max="1000000" value={draft.units} onChange={(event) => setDraft({ ...draft, units: event.target.value })}/></label>
            </div>
            <label>Контакт<select value={draft.contact.leadId} onChange={(event) => {
              const lead = leads.find((item) => item.id === event.target.value);
              setDraft({ ...draft, contact: { leadId: lead?.id ?? "", name: lead?.name || lead?.company || "", details: "" } });
            }}>
              <option value="">Ввести контакт вручную</option>
              {draft.contact.leadId && !leadOptions.some((lead) => lead.id === draft.contact.leadId) && <option value={draft.contact.leadId}>{draft.contact.name}</option>}
              {leadOptions.map((lead) => <option key={lead.id} value={lead.id}>
                {[lead.name || lead.company || "Контакт", lead.crmNumber].filter(Boolean).join(" · ")}
              </option>)}
            </select></label>
            {draft.contact.leadId ? draft.contact.details && <p>{draft.contact.details}</p> : <div className="fa-project-fields">
              <label>Имя или компания<input required maxLength={200} value={draft.contact.name} onChange={(event) => setDraft({ ...draft, contact: { ...draft.contact, name: event.target.value } })}/></label>
              <label>Телефон, почта или мессенджер<input required maxLength={400} value={draft.contact.details} onChange={(event) => setDraft({ ...draft, contact: { ...draft.contact, details: event.target.value } })}/></label>
            </div>}
            <div className="fa-project-expenses">
              <h2>Расходы</h2>
              {draft.expenses.length === 0 && <p>Добавьте затраты на материалы, работу, упаковку или доставку.</p>}
              {draft.expenses.map((row) => <div className="fa-project-expense" key={row.key}>
                <label>Статья расхода<input required maxLength={200} value={row.title} onChange={(event) => changeExpense(row.key, { title: event.target.value })} placeholder="Например, лист поликарбоната"/></label>
                <label>Категория<select value={row.category} onChange={(event) => changeExpense(row.key, { category: event.target.value })}>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
                <label>Сумма, ₽<input required inputMode="decimal" maxLength={14} value={row.amount} onChange={(event) => changeExpense(row.key, { amount: event.target.value })} placeholder="0,00"/></label>
                <button type="button" aria-label={row.title ? `Удалить расход «${row.title}»` : "Удалить расход"} onClick={() => setDraft((current) => ({ ...current, expenses: current.expenses.filter((item) => item.key !== row.key) }))}><Trash2 size={16}/></button>
              </div>)}
              <button type="button" className="fa-project-add" disabled={draft.expenses.length >= 200} onClick={() => setDraft((current) => ({
                ...current,
                expenses: [...current.expenses, { key: (current.expenses.at(-1)?.key ?? -1) + 1, title: "", category: categories[0], amount: "" }],
              }))}><Plus size={16}/> Добавить расход</button>
            </div>
            <div className="fa-project-totals">
              <div><span>Себестоимость проекта</span><strong>{rubles(subtotal)}</strong></div>
              <div><span>Себестоимость одного изделия</span><strong>{Number.isInteger(units) && units > 0 ? rubles(Math.round(subtotal / units)) : "—"}</strong></div>
            </div>
            <div className="fa-project-save">
              <button className="fa-primary" type="submit"><Save size={16}/> {saving ? "Сохраняем…" : "Сохранить проект"}</button>
              {saved && !dirty && <span role="status">Проект сохранён</span>}
            </div>
          </fieldset>
        </form>}
    </div>}
  </section>;
}
