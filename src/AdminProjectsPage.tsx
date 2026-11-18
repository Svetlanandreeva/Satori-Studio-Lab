import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { ArrowLeft, Download, Pencil, Plus, Trash2, Upload } from "lucide-react";
import "./styles/admin-projects.css";
import ProjectShipment, { normalizeWaybill, ProjectDeliveryStatus } from "./ProjectShipment";

const endpoint = "/api/admin/projects";
const rubles = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

export const projectStatuses = {
  "": "Без статуса",
  planned: "Запланирован",
  "in-progress": "В работе",
  "on-hold": "Приостановлен",
  done: "Завершён",
  canceled: "Отменён",
};
const stepStatuses = { pending: "Не начат", "in-progress": "В работе", done: "Готов" };
const commonSteps = ["Корпус", "Стекло", "Покраска"];

type ProjectStatus = keyof typeof projectStatuses;
type StepStatus = keyof typeof stepStatuses;
type Step = { name: string; status: StepStatus; notes: string };
type DraftStep = Step & { key: string };
type Entry = { label: string; date: string; amount: number };
type Contact = { name: string; details: string };
type DraftContact = Contact & { key: string };
type ProjectFields = {
  name: string;
  status?: ProjectStatus;
  notes?: string;
  steps?: Step[];
  contacts: Contact[];
  leadId: string;
  orderId?: string;
  startDate: string;
  dueDate: string;
  shipmentDate?: string;
  waybill?: string;
  budget: number | null;
  price: number | null;
  expenses: Entry[];
  payments: Entry[];
};
type DocumentFile = { id: string; name: string; size: number; createdAt?: string };
export type Project = ProjectFields & { id: string; revision: number; documents: DocumentFile[] };
type DraftEntry = Omit<Entry, "amount"> & { amount: string; key: string };
type Draft = Omit<ProjectFields, "status" | "notes" | "steps" | "contacts" | "budget" | "price" | "expenses" | "payments" | "shipmentDate" | "waybill"> & {
  orderId: string;
  status: ProjectStatus;
  notes: string;
  steps: DraftStep[];
  contacts: DraftContact[];
  budget: string;
  price: string;
  expenses: DraftEntry[];
  payments: DraftEntry[];
  shipmentDate: string;
  waybill: string;
};
type ProjectOrder = { id: string; crmNumber?: string; customer?: { name?: string }; items?: { name?: string }[] };
const orderLabel = (order: ProjectOrder) => [order.crmNumber || `#${order.id.slice(0, 8)}`, order.customer?.name, order.items?.map((item) => item.name).filter(Boolean).join(", ")].filter(Boolean).join(" · ");

type ContactLead = { id: string; name?: string; company?: string; contact?: string; phone?: string; email?: string; isSpam?: boolean };

function draftContact(contact: Contact = { name: "", details: "" }): DraftContact {
  return { ...contact, key: crypto.randomUUID() };
}

function toDraft(project?: Project): Draft {
  const rows = (entries: Entry[]) => entries.map((entry) => ({
    ...entry,
    amount: String(entry.amount / 100),
    key: crypto.randomUUID(),
  }));
  return {
    name: project?.name ?? "",
    status: project ? project.status ?? "" : "planned",
    notes: project?.notes ?? "",
    steps: (project?.steps ?? []).map((step) => ({ ...step, key: crypto.randomUUID() })),
    contacts: (project?.contacts ?? []).map(draftContact),
    leadId: project?.leadId ?? "",
    orderId: project?.orderId ?? "",
    startDate: project?.startDate ?? "",
    dueDate: project?.dueDate ?? "",
    shipmentDate: project?.shipmentDate ?? "",
    waybill: project?.waybill ?? "",
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

export function money(amount: number) {
  return Number.isSafeInteger(amount) ? rubles.format(amount / 100) : "—";
}

export function dateLabel(value: string) {
  return value ? value.split("-").reverse().join(".") : "—";
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="project-field"><span>{label}</span>{children}</label>;
}

function ProjectMetrics({ spent, received, budget, price }: {
  spent: number; received: number; budget: number | null; price: number | null;
}) {
  const budgetLeft = budget === null ? null : budget - spent;
  const paymentLeft = price === null ? null : Math.max(0, price - received);
  const overpaid = price === null ? 0 : received - price;
  return <div className="project-metrics">
    <div className="fa-stat"><span>Потрачено · себестоимость</span><b>{money(spent)}</b></div>
    <div className="fa-stat"><span>Остаток бюджета</span><b>{budgetLeft === null ? "—" : money(budgetLeft)}</b>
      {budgetLeft !== null && budgetLeft < 0 && <small>Превышен бюджет</small>}
    </div>
    <div className="fa-stat"><span>Получено от клиента</span><b>{money(received)}</b></div>
    <div className="fa-stat"><span>Осталось получить</span><b>{paymentLeft === null ? "—" : money(paymentLeft)}</b>
      {overpaid > 0 && <small>Переплата {money(overpaid)}</small>}
    </div>
  </div>;
}

function EntryHistory({ title, entries }: { title: string; entries: Entry[] }) {
  return <details className="fa-card project-card project-history">
    <summary>{title} <small>{entries.length}</small></summary>
    {entries.length ? <ul className="project-summary-rows">
      {entries.map((entry, index) => <li key={index}>
        <div><strong>{entry.label || "Оплата"}</strong>{entry.date && <small>{dateLabel(entry.date)}</small>}</div>
        <b>{money(entry.amount)}</b>
      </li>)}
    </ul> : <p className="project-muted">Записей пока нет.</p>}
  </details>;
}

function ProjectSummary({ project, orders, token, busy, download }: {
  project: Project; orders: ProjectOrder[]; token: string; busy: boolean; download: (file: DocumentFile) => void;
}) {
  const steps = project.steps ?? [];
  const contacts = project.contacts ?? [];
  const done = steps.filter((step) => step.status === "done").length;
  return <div className="project-summary">
    <ProjectMetrics budget={project.budget} price={project.price}
      spent={project.expenses.reduce((total, item) => total + item.amount, 0)}
      received={project.payments.reduce((total, item) => total + item.amount, 0)} />
    <div className="project-summary-grid">
      <section className="fa-card project-card">
        <div className="project-card-head">
          <h2>О проекте</h2>
          <span className="project-status" data-status={project.status || "unset"}>{projectStatuses[project.status ?? ""]}</span>
        </div>
        <dl className="project-summary-details">
          <div><dt>Заказ</dt><dd>{project.orderId ? orderLabel(orders.find((order) => order.id === project.orderId) ?? { id: project.orderId }) : "Пока не привязан"}</dd></div>
          <div><dt>Дата начала</dt><dd>{dateLabel(project.startDate)}</dd></div>
          <div><dt>Срок сдачи</dt><dd>{dateLabel(project.dueDate)}</dd></div>
          <div><dt>Бюджет расходов</dt><dd>{project.budget == null ? "—" : money(project.budget)}</dd></div>
          <div><dt>Сумма по договору</dt><dd>{project.price == null ? "—" : money(project.price)}</dd></div>
        </dl>
        {project.notes && <p className="project-summary-notes">{project.notes}</p>}
      </section>
      <ProjectShipment key={project.id} token={token} date={project.shipmentDate ?? ""}
        waybill={project.waybill ?? ""} />
      <section className="fa-card project-card">
        <div className="project-card-head"><h2>Этапы работы</h2>{steps.length > 0 && <small>Готово {done} из {steps.length}</small>}</div>
        {steps.length ? <ul className="project-summary-rows">{steps.map((step, index) => <li key={index}>
          <div><strong>{step.name}</strong>{step.notes && <small>{step.notes}</small>}</div>
          <span className="project-status" data-status={step.status}>{stepStatuses[step.status]}</span>
        </li>)}</ul> : <p className="project-muted">Этапы ещё не добавлены.</p>}
      </section>
      <section className="fa-card project-card">
        <h2>Контакты</h2>
        {contacts.length ? <ul className="project-summary-rows">{contacts.map((contact, index) => <li key={index}>
          <div>{contact.name && <strong>{contact.name}</strong>}{contact.details && <span>{contact.details}</span>}</div>
        </li>)}</ul> : <p className="project-muted">Контакты ещё не добавлены.</p>}
      </section>
      <EntryHistory title="Покупки и расходы" entries={project.expenses} />
      <EntryHistory title="Оплаты от клиента" entries={project.payments} />
      <section className="fa-card project-card project-wide-field">
        <h2>Документы</h2>
        {project.documents.length ? <ul className="project-summary-rows">{project.documents.map((file) => <li key={file.id}>
          <div><strong>{file.name}</strong><small>{Math.ceil(file.size / 1024)} КБ</small></div>
          <button className="fa-outline-button project-icon" type="button" disabled={busy} aria-label={`Скачать ${file.name}`} onClick={() => download(file)}>
            <Download size={16} />
          </button>
        </li>)}</ul> : <p className="project-muted">Документы ещё не загружены.</p>}
      </section>
    </div>
  </div>;
}

function WorkSteps({ steps, onChange }: { steps: DraftStep[]; onChange: (steps: DraftStep[]) => void }) {
  const done = steps.filter((step) => step.status === "done").length;
  const remaining = steps.length - done;
  const presets = commonSteps.filter((name) => !steps.some((step) => step.name.trim().toLowerCase() === name.toLowerCase()));

  function add(name = "") {
    onChange([...steps, { key: crypto.randomUUID(), name, status: "pending", notes: "" }]);
  }

  function update(key: string, patch: Partial<Step>) {
    onChange(steps.map((item) => item.key === key ? { ...item, ...patch } : item));
  }

  return <section className="fa-card project-card">
    <div className="project-card-head">
      <div>
        <h2>Этапы работы</h2>
        {steps.length > 0 && <p className="project-muted">Готово: {done} из {steps.length} · Осталось: {remaining}</p>}
      </div>
      <button className="fa-outline-button" type="button" disabled={steps.length >= 50} onClick={() => add()}>
        <Plus size={16} /> Добавить этап
      </button>
    </div>
    {presets.length > 0 && steps.length < 50 && <div className="project-step-presets" role="group" aria-label="Быстрое добавление этапа">
      {presets.map((name) => <button className="fa-outline-button" type="button" key={name} onClick={() => add(name)}>
        <Plus size={14} /> {name}
      </button>)}
    </div>}
    {steps.map((step, index) => <div className="project-step" key={step.key}>
      <Field label="Название этапа">
        <input required maxLength={200} value={step.name} placeholder="Например, упаковка"
          onChange={(event) => update(step.key, { name: event.target.value })} />
      </Field>
      <Field label="Статус этапа">
        <select value={step.status} onChange={(event) => update(step.key, { status: event.target.value as StepStatus })}>
          {Object.entries(stepStatuses).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
        </select>
      </Field>
      <button className="fa-outline-button project-icon" type="button" aria-label={`Удалить этап ${step.name || index + 1}`}
        onClick={() => onChange(steps.filter((item) => item.key !== step.key))}><Trash2 size={16} /></button>
      <div className="project-wide-field">
        <Field label="Комментарий к этапу">
          <textarea rows={2} maxLength={1000} value={step.notes} onChange={(event) => update(step.key, { notes: event.target.value })} />
        </Field>
      </div>
    </div>)}
  </section>;
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

export default function AdminProjectsPage({ token, leads, orders, onOrderChanged, onDirtyChange, initialProjectId }: {
  token: string;
  leads: ContactLead[];
  orders: ProjectOrder[];
  onOrderChanged: () => void;
  onDirtyChange: (dirty: boolean) => void;
  initialProjectId?: string;
}) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selected, setSelected] = useState<Project | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const creationId = useRef(crypto.randomUUID());
  const view = draft ? "edit" : selected ? "summary" : "list";
  const projectId = selected?.id;

  useEffect(() => {
    window.scrollTo(0, 0);
    heading.current?.focus({ preventScroll: true });
  }, [view, projectId]);

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
      if (controller.signal.aborted) return;
      setProjects(items);
      if (initialProjectId) {
        const project = items.find((item: Project) => item.id === initialProjectId);
        if (!project) throw new Error("Проект не найден.");
        setSelected(project);
      }
    }).catch((reason: Error) => {
      if (!controller.signal.aborted) setError(reason.message);
    }).finally(() => {
      if (!controller.signal.aborted) setBusy(false);
    });
    return () => controller.abort();
  }, [token, reload, initialProjectId]);

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

  function startEditing(project?: Project) {
    if (!project) creationId.current = crypto.randomUUID();
    setDraft(toDraft(project));
    markDirty(false);
    setError("");
    setNotice("");
  }

  function showList() {
    setSelected(null);
    setDraft(null);
    markDirty(false);
  }

  function edit(patch: Partial<Draft>) {
    setDraft((current) => current && { ...current, ...patch });
    markDirty(true);
    setNotice("");
  }

  function updateContact(contacts: DraftContact[], key: string, patch: Partial<Contact>) {
    edit({ contacts: contacts.map((item) => item.key === key ? { ...item, ...patch } : item) });
  }

  function updateProjectList(project: Project) {
    setProjects((items) => items.some((item) => item.id === project.id)
      ? items.map((item) => item.id === project.id ? project : item)
      : [project, ...items]);
  }

  function replaceProject(project: Project) {
    setSelected(project);
    updateProjectList(project);
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
      waybill: normalizeWaybill(draft.waybill),
      contacts: draft.contacts.map(({ name, details }) => ({ name: name.trim(), details: details.trim() }))
        .filter(({ name, details }) => name || details),
      steps: draft.steps.map(({ name, status, notes }) => ({ name, status, notes })),
      budget: draft.budget.trim() ? kopecks(draft.budget) : null,
      price: draft.price.trim() ? kopecks(draft.price) : null,
      expenses: serializeRows(draft.expenses),
      payments: serializeRows(draft.payments),
      revision: selected?.revision,
      requestId: selected ? undefined : creationId.current,
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
      updateProjectList(project);
      showList();
      onOrderChanged();
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
  function linkLead(leadId: string, contacts: DraftContact[]) {
    const lead = contactOptions.find((item) => item.id === leadId);
    const name = (lead?.name || lead?.company || "").trim().slice(0, 200);
    const details = (lead?.contact || [lead?.phone, lead?.email].filter(Boolean).join(" · ")).trim().slice(0, 200);
    if ((name || details) && !contacts.some((contact) => contact.name.trim() || contact.details.trim())) {
      contacts = [draftContact({ name, details })];
    }
    edit({ leadId, contacts });
  }

  return <div className="projects-workspace">
    <div className="fa-page-head">
      <div>
        <h1 ref={heading} tabIndex={-1}>{draft ? selected ? "Редактирование проекта" : "Новый проект" : selected?.name ?? "Проекты"}</h1>
        {draft && selected && <p>{selected.name}</p>}
      </div>
      {view === "list" ? <button className="fa-outline-button" type="button" disabled={busy} onClick={() => startEditing()}>
        <Plus size={16} /> Новый проект
      </button> : <div className="project-view-actions">
        <button className="fa-outline-button" type="button" disabled={busy} onClick={() => {
        if (dirty && !window.confirm("Выйти из редактирования без сохранения изменений?")) return;
        setError("");
        setNotice("");
        if (draft && selected) {
          setDraft(null);
          markDirty(false);
        } else showList();
        }}>
          <ArrowLeft size={16} /> {draft && selected ? "К сводке" : "К списку"}
        </button>
        {selected && !draft && <button className="fa-primary" type="button" disabled={busy} onClick={() => startEditing(selected)}>
          <Pencil size={16} /> Редактировать
        </button>}
      </div>}
    </div>
    {error && <div className="fa-error" role="alert">{error}
      {view === "list" && <button className="fa-outline-button" type="button" disabled={busy} onClick={() => setReload((id) => id + 1)}>Повторить</button>}
    </div>}
    {notice && <p className="project-notice" role="status">{notice}</p>}
    {view === "list" && <section className="fa-card project-card projects-list" aria-label="Список проектов">
        <h2>Все проекты</h2>
        {projects.length === 0 && <p className="project-muted">{busy ? "Загрузка…" : "Проектов пока нет."}</p>}
        {projects.map((project) => {
          const [first, ...otherContacts] = project.contacts ?? [];
          const contact = first?.name || first?.details;
          const steps = project.steps ?? [];
          const done = steps.filter((step) => step.status === "done").length;
          return <button className="project-list-item" key={project.id} type="button" disabled={busy}
            onClick={() => {
              setSelected(project);
              setError("");
              setNotice("");
            }}>
            <strong>{project.name}</strong>
            <span className="project-list-work">
              <small className="project-status" data-status={project.status || "unset"}>{projectStatuses[project.status ?? ""]}</small>
              {steps.length > 0 && <small>Этапы: {done}/{steps.length}</small>}
            </span>
            <span>{contact ? `${contact}${otherContacts.length ? ` +${otherContacts.length}` : ""}`
              : project.dueDate ? `До ${dateLabel(project.dueDate)}` : "Открыть проект"}</span>
            {project.shipmentDate && <span>Отгрузка: {dateLabel(project.shipmentDate)}</span>}
            <ProjectDeliveryStatus token={token} waybill={project.waybill ?? ""} />
          </button>;
        })}
      </section>}
      {selected && !draft && <ProjectSummary project={selected} orders={orders} token={token} busy={busy} download={(file) => void downloadDocument(selected, file)} />}
      {draft && <form className="project-editor" onSubmit={save}>
        <ProjectMetrics spent={sum(draft.expenses)} received={sum(draft.payments)}
          budget={draft.budget.trim() ? kopecks(draft.budget) : null} price={draft.price.trim() ? kopecks(draft.price) : null} />
        <fieldset className="project-fields" disabled={busy}>
          <section className="fa-card project-card">
            <div className="project-card-head"><h2>Данные проекта</h2></div>
            <div className="project-form-grid">
              <Field label="Название проекта"><input required maxLength={200} value={draft.name} onChange={(event) => edit({ name: event.target.value })} /></Field>
              <Field label="Статус проекта">
                <select value={draft.status} onChange={(event) => edit({ status: event.target.value as ProjectStatus })}>
                  {Object.entries(projectStatuses).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                </select>
              </Field>
              <Field label="Заказ">
                <select value={draft.orderId} onChange={(event) => edit({ orderId: event.target.value })}>
                  <option value="">Создать новый заказ автоматически</option>
                  {draft.orderId && !orders.some((order) => order.id === draft.orderId) && <option value={draft.orderId}>Привязанный заказ #{draft.orderId.slice(0, 8)}</option>}
                  {orders.map((order) => <option key={order.id} value={order.id}>{orderLabel(order)}</option>)}
                </select>
                <small>Выберите существующий заказ или оставьте автоматическое создание при сохранении.</small>
              </Field>
              <Field label="Заявка с сайта">
                <select value={draft.leadId} onChange={(event) => linkLead(event.target.value, draft.contacts)}>
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
              <div className="project-wide-field">
                <Field label="Комментарий к проекту">
                  <textarea rows={3} maxLength={4000} value={draft.notes} placeholder="Подробности заказа и договорённости"
                    onChange={(event) => edit({ notes: event.target.value })} />
                </Field>
              </div>
            </div>
          </section>
          <ProjectShipment key={selected?.id ?? "new"} token={token} date={draft.shipmentDate} waybill={draft.waybill}
            onDate={(shipmentDate) => edit({ shipmentDate })} onWaybill={(waybill) => edit({ waybill })} />
          <WorkSteps steps={draft.steps} onChange={(steps) => edit({ steps })} />
          <section className="fa-card project-card">
            <div className="project-card-head">
              <h2>Контакты</h2>
              <button className="fa-outline-button" type="button" disabled={draft.contacts.length >= 30}
                onClick={() => edit({ contacts: [...draft.contacts, draftContact()] })}>
                <Plus size={16} /> Добавить контакт
              </button>
            </div>
            {draft.contacts.map((contact, index) => <div className="project-contact" key={contact.key}>
              <Field label="Имя или роль">
                <input maxLength={200} value={contact.name} placeholder="Например, дизайнер"
                  onChange={(event) => updateContact(draft.contacts, contact.key, { name: event.target.value })} />
              </Field>
              <Field label="Телефон, почта или мессенджер">
                <input maxLength={200} value={contact.details}
                  onChange={(event) => updateContact(draft.contacts, contact.key, { details: event.target.value })} />
              </Field>
              <button className="fa-outline-button project-icon" type="button" aria-label={`Удалить контакт ${index + 1}`}
                onClick={() => edit({ contacts: draft.contacts.filter((item) => item.key !== contact.key) })}>
                <Trash2 size={16} />
              </button>
            </div>)}
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
            <p className="project-muted">{selected ? "Договоры, счета, фото и чертежи. До 10 МБ на файл." : "Чтобы прикрепить файлы, сохраните проект и снова откройте редактирование из сводки."}</p>
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
      </form>}
  </div>;
}
