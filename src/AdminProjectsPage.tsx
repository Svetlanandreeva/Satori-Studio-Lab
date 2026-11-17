import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Download, FolderOpen, Plus, Trash2, Upload } from "lucide-react";
import "./styles/admin-projects.css";

const endpoint = "/api/admin/projects";
const rubles = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

type Entry = { label: string; date: string; amount: number };
type ProjectFields = {
  name: string;
  contact: string;
  leadId: string;
  startDate: string;
  dueDate: string;
  budget: number | null;
  price: number | null;
  expenses: Entry[];
  payments: Entry[];
};
type DocumentFile = { id: string; name: string; size: number };
type Project = ProjectFields & { id: string; revision: number; documents: DocumentFile[] };
type DraftEntry = Omit<Entry, "amount"> & { amount: string; key: string };
type Draft = Omit<ProjectFields, "budget" | "price" | "expenses" | "payments"> & {
  budget: string;
  price: string;
  expenses: DraftEntry[];
  payments: DraftEntry[];
};
type ContactLead = { id: string; name?: string; company?: string; contact?: string; phone?: string; email?: string; isSpam?: boolean };

function toDraft(project?: Project): Draft {
  const rows = (entries: Entry[]) => entries.map((entry) => ({
    ...entry,
    amount: String(entry.amount / 100),
    key: crypto.randomUUID(),
  }));
  return {
    name: project?.name ?? "",
    contact: project?.contact ?? "",
    leadId: project?.leadId ?? "",
    startDate: project?.startDate ?? "",
    dueDate: project?.dueDate ?? "",
    budget: project?.budget != null ? String(project.budget / 100) : "",
    price: project?.price != null ? String(project.price / 100) : "",
    expenses: rows(project?.expenses ?? []),
    payments: rows(project?.payments ?? []),
  };
}

function kopecks(value: string) {
  if (!value.trim()) return 0;
  const normalized = value.replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return NaN;
  const [whole, fraction = ""] = normalized.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

function sum(entries: DraftEntry[]) {
  return entries.reduce((total, entry) => total + kopecks(entry.amount), 0);
}

function money(amount: number) {
  return Number.isSafeInteger(amount) ? rubles.format(amount / 100) : "—";
}

function dateLabel(value: string) {
  return value ? value.split("-").reverse().join(".") : "—";
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="project-field"><span>{label}</span>{children}</label>;
}

function Entries({ kind, entries, onChange }: {
  kind: "expenses" | "payments";
  entries: DraftEntry[];
  onChange: (entries: DraftEntry[]) => void;
}) {
  const expenses = kind === "expenses";
  const title = expenses ? "Покупки и расходы" : "Оплаты от клиента";
  const label = expenses ? "Что куплено" : "За что оплата";
  const add = expenses ? "Добавить покупку" : "Добавить оплату";
  function update(key: string, patch: Partial<DraftEntry>) {
    onChange(entries.map((entry) => entry.key === key ? { ...entry, ...patch } : entry));
  }

  return <section className="fa-card project-card">
    <div className="project-card-head">
      <h2>{title}</h2>
      <button className="fa-outline-button" type="button" disabled={entries.length >= 200}
        onClick={() => onChange([...entries, { key: crypto.randomUUID(), label: "", date: "", amount: "" }])}>
        <Plus size={16} /> {add}
      </button>
    </div>
    {entries.length === 0 && <p className="project-muted">{expenses ? "Покупок пока нет." : "Оплат пока нет."}</p>}
    {entries.map((entry) => <div className="project-entry" key={entry.key}>
      <Field label={label}>
        <input value={entry.label} required={expenses} maxLength={200}
          placeholder={expenses ? "Например, латунь" : "Например, предоплата"}
          onChange={(event) => update(entry.key, { label: event.target.value })} />
      </Field>
      <Field label="Дата">
        <input type="date" value={entry.date} onChange={(event) => update(entry.key, { date: event.target.value })} />
      </Field>
      <Field label="Сумма, ₽">
        <input inputMode="decimal" required value={entry.amount} maxLength={18}
          onChange={(event) => update(entry.key, { amount: event.target.value })} />
      </Field>
      <button className="fa-outline-button project-icon" type="button"
        aria-label={expenses ? "Удалить покупку" : "Удалить оплату"}
        onClick={() => onChange(entries.filter((item) => item.key !== entry.key))}>
        <Trash2 size={16} />
      </button>
    </div>)}
  </section>;
}

export default function AdminProjectsPage({ token, leads, onDirtyChange }: {
  token: string;
  leads: ContactLead[];
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selected, setSelected] = useState<Project | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);

  async function request(path: string, options: RequestInit = {}) {
    const headers = new Headers(options.headers);
    headers.set("Authorization", `Bearer ${token}`);
    const response = await fetch(endpoint + path, { ...options, headers, cache: "no-store" });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      const fallback = response.status === 401 ? "Сессия истекла. Войдите в админку заново."
        : response.status === 413 ? "Сервер не принял файл из-за его размера."
        : "Не удалось выполнить действие. Попробуйте ещё раз.";
      throw new Error(data?.error || fallback);
    }
    return response;
  }

  useEffect(() => {
    const controller = new AbortController();
    setBusy(true);
    setError("");
    request("", { signal: controller.signal }).then(async (response) => {
      const items = await response.json();
      if (!Array.isArray(items)) throw new Error("Не удалось загрузить список проектов.");
      if (!controller.signal.aborted) setProjects(items);
    }).catch((reason: Error) => {
      if (!controller.signal.aborted) setError(reason.message);
    }).finally(() => {
      if (!controller.signal.aborted) setBusy(false);
    });
    return () => controller.abort();
  }, [token, reload]);

  function markDirty(value: boolean) {
    setDirty(value);
    onDirtyChange(value);
  }

  useEffect(() => {
    if (!dirty) return;
    function beforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  function open(project?: Project) {
    if (dirty && !window.confirm("Открыть другой проект без сохранения изменений?")) return;
    setSelected(project ?? null);
    setDraft(toDraft(project));
    markDirty(false);
    setError("");
    setNotice("");
  }

  function edit(patch: Partial<Draft>) {
    setDraft((current) => current && { ...current, ...patch });
    markDirty(true);
    setNotice("");
  }

  function replaceProject(project: Project) {
    setSelected(project);
    setProjects((items) => items.some((item) => item.id === project.id)
      ? items.map((item) => item.id === project.id ? project : item)
      : [project, ...items]);
  }

  async function run(action: () => Promise<void>, success = "") {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      setNotice(success);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось выполнить действие.");
    } finally {
      setBusy(false);
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft || busy) return;
    const serializeRows = (rows: DraftEntry[]) => rows.map(({ label, date, amount }) => ({
      label, date, amount: kopecks(amount),
    }));
    const payload = {
      ...draft,
      budget: draft.budget.trim() ? kopecks(draft.budget) : null,
      price: draft.price.trim() ? kopecks(draft.price) : null,
      expenses: serializeRows(draft.expenses),
      payments: serializeRows(draft.payments),
      revision: selected?.revision,
    };
    if ((payload.budget !== null && !Number.isSafeInteger(payload.budget))
      || (payload.price !== null && !Number.isSafeInteger(payload.price))
      || [...payload.expenses, ...payload.payments].some(({ amount }) => !Number.isSafeInteger(amount) || amount <= 0)) {
      setError("Введите суммы в рублях, до двух знаков после запятой. Суммы покупок и оплат должны быть больше нуля.");
      return;
    }
    await run(async () => {
      const response = await request(selected ? `/${selected.id}` : "", {
        method: selected ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const project: Project = await response.json();
      replaceProject(project);
      setDraft(toDraft(project));
      markDirty(false);
    }, "Проект сохранён.");
  }

  async function addDocument(project: Project, file: File) {
    await run(async () => {
      const body = new FormData();
      body.append("file", file);
      const response = await request(`/${project.id}/documents`, { method: "POST", body });
      const document: DocumentFile = await response.json();
      replaceProject({ ...project, documents: [...project.documents, document] });
    }, "Документ загружен.");
  }

  async function downloadDocument(project: Project, file: DocumentFile) {
    await run(async () => {
      const response = await request(`/${project.id}/documents/${file.id}`);
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = file.name;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    });
  }

  async function removeDocument(project: Project, file: DocumentFile) {
    if (!window.confirm(`Удалить документ «${file.name}»?`)) return;
    await run(async () => {
      await request(`/${project.id}/documents/${file.id}`, { method: "DELETE" });
      replaceProject({ ...project, documents: project.documents.filter((item) => item.id !== file.id) });
    }, "Документ удалён.");
  }

  const contactOptions = leads.filter((lead) => !lead.isSpam);
  const spent = draft ? sum(draft.expenses) : 0;
  const received = draft ? sum(draft.payments) : 0;
  const budgetLeft = draft ? kopecks(draft.budget) - spent : 0;
  const paymentLeft = draft ? Math.max(0, kopecks(draft.price) - received) : 0;
  const overpaid = draft ? received - kopecks(draft.price) : 0;

  return <div className="projects-workspace">
    <div className="fa-page-head">
      <div><h1>Проекты</h1><p>Бюджет, покупки, оплаты и документы по каждому заказу.</p></div>
      <button className="fa-outline-button" type="button" disabled={busy} onClick={() => open()}>
        <Plus size={16} /> Новый проект
      </button>
    </div>
    {error && <div className="fa-error" role="alert">{error}
      {!draft && <button className="fa-outline-button" type="button" disabled={busy} onClick={() => setReload((id) => id + 1)}>Повторить</button>}
    </div>}
    {notice && <p className="project-notice" role="status">{notice}</p>}
    <div className="projects-layout">
      <section className="fa-card project-card projects-list" aria-label="Список проектов">
        <h2>Все проекты</h2>
        {projects.length === 0 && <p className="project-muted">{busy ? "Загрузка…" : "Проектов пока нет."}</p>}
        {projects.map((project) => <button className="project-list-item" key={project.id} type="button" disabled={busy}
          aria-pressed={selected?.id === project.id} onClick={() => open(project)}>
          <strong>{project.name}</strong>
          <span>{project.contact || (project.dueDate ? `До ${dateLabel(project.dueDate)}` : "Открыть проект")}</span>
        </button>)}
      </section>
      {draft ? <form className="project-editor" onSubmit={save}>
        <div className="project-metrics">
          <div className="fa-stat"><span>Потрачено · себестоимость</span><b>{money(spent)}</b></div>
          <div className="fa-stat"><span>Остаток бюджета</span><b>{draft.budget ? money(budgetLeft) : "—"}</b>{budgetLeft < 0 && draft.budget && <small>Превышен бюджет</small>}</div>
          <div className="fa-stat"><span>Получено от клиента</span><b>{money(received)}</b></div>
          <div className="fa-stat"><span>Осталось получить</span><b>{draft.price ? money(paymentLeft) : "—"}</b>{overpaid > 0 && draft.price && <small>Переплата {money(overpaid)}</small>}</div>
        </div>
        <fieldset className="project-fields" disabled={busy}>
          <section className="fa-card project-card">
            <div className="project-card-head"><h2>{selected ? "Карточка проекта" : "Новый проект"}</h2></div>
            <div className="project-form-grid">
              <Field label="Название проекта"><input required maxLength={200} value={draft.name} onChange={(event) => edit({ name: event.target.value })} /></Field>
              <Field label="Контакт клиента"><input maxLength={200} value={draft.contact} onChange={(event) => edit({ contact: event.target.value })} /></Field>
              <Field label="Заявка с сайта">
                <select value={draft.leadId} onChange={(event) => {
                  const leadId = event.target.value;
                  const lead = contactOptions.find((item) => item.id === leadId);
                  edit({ leadId, contact: draft.contact || lead?.contact || lead?.phone || lead?.email || lead?.name || "" });
                }}>
                  <option value="">Без привязки</option>
                  {draft.leadId && !contactOptions.some((item) => item.id === draft.leadId) && <option value={draft.leadId}>Ранее привязанная заявка</option>}
                  {contactOptions.map((lead) => <option key={lead.id} value={lead.id}>
                    {[lead.name || lead.company, lead.contact || lead.phone || lead.email].filter(Boolean).join(" · ") || `Заявка ${lead.id.slice(0, 8)}`}
                  </option>)}
                </select>
              </Field>
              <Field label="Дата начала"><input type="date" value={draft.startDate} onChange={(event) => edit({ startDate: event.target.value })} /></Field>
              <Field label="Срок сдачи"><input type="date" min={draft.startDate || undefined} value={draft.dueDate} onChange={(event) => edit({ dueDate: event.target.value })} /></Field>
              <Field label="Бюджет расходов, ₽"><input inputMode="decimal" maxLength={18} value={draft.budget} onChange={(event) => edit({ budget: event.target.value })} /></Field>
              <Field label="Сумма по договору, ₽"><input inputMode="decimal" maxLength={18} value={draft.price} onChange={(event) => edit({ price: event.target.value })} /></Field>
            </div>
          </section>
          <Entries kind="expenses" entries={draft.expenses} onChange={(expenses) => edit({ expenses })} />
          <Entries kind="payments" entries={draft.payments} onChange={(payments) => edit({ payments })} />
          <section className="fa-card project-card">
            <div className="project-card-head">
              <h2>Документы</h2>
              {selected && <label className="fa-outline-button project-upload">
                <Upload size={16} /> Загрузить файл
                <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.jpg,.jpeg,.png,.webp,.heic,.dwg,.dxf,.step,.stp"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!file) return;
                    if (file.size > 10 * 1024 * 1024) return setError("Размер файла не должен превышать 10 МБ.");
                    void addDocument(selected, file);
                  }} />
              </label>}
            </div>
            <p className="project-muted">{selected ? "Договоры, счета, фото и чертежи. До 10 МБ на файл." : "Сохраните проект, чтобы прикрепить файлы."}</p>
            {selected?.documents.map((file) => <div className="project-document" key={file.id}>
              <span>{file.name}<small>{Math.ceil(file.size / 1024)} КБ</small></span>
              <button className="fa-outline-button project-icon" type="button" aria-label={`Скачать ${file.name}`} onClick={() => void downloadDocument(selected, file)}><Download size={16} /></button>
              <button className="fa-outline-button project-icon" type="button" aria-label={`Удалить ${file.name}`} onClick={() => void removeDocument(selected, file)}><Trash2 size={16} /></button>
            </div>)}
          </section>
          <div className="project-save">
            {dirty && <span className="project-muted">Есть несохранённые изменения</span>}
            <button className="fa-primary" type="submit">Сохранить проект</button>
          </div>
        </fieldset>
      </form> : <div className="fa-card project-card project-empty">
        <FolderOpen size={30} aria-hidden="true" />
        <p>Выберите проект или создайте новый.</p>
      </div>}
    </div>
  </div>;
}
