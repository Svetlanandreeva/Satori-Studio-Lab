import { useEffect, useState } from "react";
import { ArrowUpRight, CalendarDays, ClipboardList, FileText, FolderOpen, Inbox, Wallet } from "lucide-react";
import { dateLabel, money, projectStatuses } from "./AdminProjectsPage";
import AdminAdvertising from "./AdminAdvertising";
import type { Project } from "./AdminProjectsPage";
import "./styles/admin-overview.css";

const zone = "Asia/Yekaterinburg";
const dateFormat = new Intl.DateTimeFormat("sv-SE", { timeZone: zone, dateStyle: "short" });
const headingDate = new Intl.DateTimeFormat("ru-RU", { timeZone: zone, day: "numeric", month: "long", year: "numeric" });
const dayMs = 86400000;
type DateRange = 14 | 30;
type Destination = "leads" | "orders" | "projects";

function shiftDate(date: string, days: number) {
  return new Date(Date.parse(date) + days * dayMs).toISOString().slice(0, 10);
}

function isOpen(project: Project) {
  return project.status !== "done" && project.status !== "canceled";
}

function total(entries: Project["payments"]) {
  return entries.reduce((sum, entry) => sum + entry.amount, 0);
}

function Schedule({ projects, today, open }: { projects: Project[]; today: string; open: (id: string) => void }) {
  const [range, setRange] = useState<DateRange>(14);
  const end = shiftDate(today, range - 1);
  const slots = projects.flatMap((project) => {
    const start = project.startDate || project.dueDate;
    const finish = project.dueDate || project.startDate;
    if (!start || !finish || start > end || finish < today) return [];
    const offset = Math.max(0, (Date.parse(start) - Date.parse(today)) / dayMs);
    const until = Math.min(range - 1, (Date.parse(finish) - Date.parse(today)) / dayMs);
    return [{ project, start, finish, offset, length: until - offset + 1 }];
  }).sort((a, b) => a.finish.localeCompare(b.finish));
  const ticks = [0, Math.floor(range / 3), Math.floor(2 * range / 3), range - 1];

  return <section className="overview-card overview-schedule">
    <header className="overview-card-head">
      <h2><CalendarDays size={19} /> Сроки проектов</h2>
      <div className="overview-range" role="group" aria-label="Период календаря">
        {([14, 30] as const).map((days) => <button type="button" key={days} aria-pressed={range === days} onClick={() => setRange(days)}>
          {days} дней
        </button>)}
      </div>
    </header>
    {slots.length === 0 ? <p className="overview-empty">На ближайшие {range} дней нет открытых проектов с датами.</p> : <>
      <div className="overview-ticks" aria-hidden="true">
        {ticks.map((index) => <span key={index} style={{ left: `${100 * index / (range - 1)}%` }}>{dateLabel(shiftDate(today, index)).slice(0, 5)}</span>)}
      </div>
      <div className="overview-timeline">
        {slots.slice(0, 6).map(({ project, offset, length }) => <button type="button" className="overview-timeline-row" key={project.id} onClick={() => open(project.id)}>
          <span><strong>{project.name}</strong><small>{project.dueDate ? `До ${dateLabel(project.dueDate)}` : `Старт ${dateLabel(project.startDate)}`}</small></span>
          <span className="overview-track" aria-hidden="true">
            <span style={{ left: `${100 * offset / range}%`, width: `${100 * length / range}%` }} />
          </span>
        </button>)}
      </div>
      {slots.length > 6 && <p className="overview-muted">Показано 6 из {slots.length} проектов за период.</p>}
    </>}
  </section>;
}

export default function AdminOverview({ token, unread, newOrders, go, openProject }: {
  token: string;
  unread: number;
  newOrders: number;
  go: (destination: Destination) => void;
  openProject: (id: string) => void;
}) {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState("");
  const [attempt, retry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setError("");
    fetch("/api/admin/projects", {
      signal: controller.signal, cache: "no-store", headers: { Authorization: `Bearer ${token}` },
    }).then(async (response) => {
      if (!response.ok) throw new Error("Не удалось загрузить проекты.");
      const items = await response.json();
      if (!Array.isArray(items)) throw new Error("Не удалось загрузить проекты.");
      if (!controller.signal.aborted) setProjects(items);
    }).catch(() => {
      if (!controller.signal.aborted) setError("Не удалось загрузить проекты.");
    });
    return () => controller.abort();
  }, [token, attempt]);

  const now = new Date();
  const today = dateFormat.format(now);
  const open = (projects ?? []).filter(isOpen);
  const overdue = open.filter((project) => project.dueDate && project.dueDate < today);
  const ordered = [...open].sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999"));
  const finance = (projects ?? []).reduce((summary, project) => {
    const received = total(project.payments);
    summary.received += received;
    summary.spent += total(project.expenses);
    if (isOpen(project) && project.price != null) summary.toReceive += Math.max(0, project.price - received);
    return summary;
  }, { received: 0, spent: 0, toReceive: 0 });
  const documents = (projects ?? []).flatMap((project) => project.documents.map((file) => ({ ...file, project })))
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "")).slice(0, 4);

  return <div className="admin-overview">
    <div className="fa-page-head">
      <div><h1>Дашборд</h1><p>{headingDate.format(now)}</p></div>
    </div>
    <div className="overview-shortcuts">
      <button type="button" className="overview-card overview-counter" onClick={() => go("projects")}>
        <span><FolderOpen size={17} /> Открытые проекты <ArrowUpRight size={15} /></span>
        <strong>{projects ? open.length : "—"}</strong>
        {overdue.length > 0 && <small>Просрочено: {overdue.length}</small>}
      </button>
      <button type="button" className="overview-card overview-counter" onClick={() => go("leads")}>
        <span><Inbox size={17} /> Непрочитанные заявки <ArrowUpRight size={15} /></span>
        <strong>{unread}</strong>
      </button>
      <button type="button" className="overview-card overview-counter" onClick={() => go("orders")}>
        <span><ClipboardList size={17} /> Новые заказы <ArrowUpRight size={15} /></span>
        <strong>{newOrders}</strong>
      </button>
    </div>
    <AdminAdvertising token={token} />
    {error && <div className="fa-error overview-error" role="alert">{error}<button type="button" className="fa-outline-button" onClick={() => retry((number) => number + 1)}>Повторить</button></div>}
    {!projects && !error && <p className="overview-empty" role="status">Загрузка проектов…</p>}
    {projects && <div className="overview-grid">
      <Schedule projects={open} today={today} open={openProject} />
      <section className="overview-card overview-finance">
        <header className="overview-card-head"><h2><Wallet size={19} /> Финансы проектов</h2></header>
        <p className="overview-finance-total"><span>К получению по открытым проектам</span><b>{money(finance.toReceive)}</b></p>
        <dl><div><dt>Получено</dt><dd>{money(finance.received)}</dd></div><div><dt>Потрачено</dt><dd>{money(finance.spent)}</dd></div></dl>
      </section>
      <section className="overview-card overview-documents">
        <header className="overview-card-head"><h2><FileText size={19} /> Документы проектов</h2></header>
        {documents.length ? <ul>{documents.map((file) => <li key={file.id}>
          <button type="button" onClick={() => openProject(file.project.id)}>
            <FileText size={17} aria-hidden="true" />
            <span><b>{file.name}</b><small>{file.project.name}</small></span>
            <ArrowUpRight size={15} aria-hidden="true" />
          </button>
        </li>)}</ul> : <p className="overview-empty">К проектам пока нет прикреплённых файлов.</p>}
      </section>
      <section className="overview-card overview-progress">
        <header className="overview-card-head">
          <h2>Ход работ</h2>
          <button className="overview-text-button" type="button" onClick={() => go("projects")}>Все проекты <ArrowUpRight size={16} /></button>
        </header>
        {ordered.length ? <div className="overview-progress-list">{ordered.slice(0, 6).map((project) => {
          const steps = project.steps ?? [];
          const done = steps.filter((step) => step.status === "done").length;
          return <button type="button" className="overview-progress-item" key={project.id} onClick={() => openProject(project.id)}>
            <strong>{project.name} <ArrowUpRight size={15} /></strong>
            <span>{projectStatuses[project.status ?? ""]}{project.dueDate && project.dueDate < today ? " · Просрочен" : ""}</span>
            {steps.length ? <><progress max={steps.length} value={done} aria-label={`Готово этапов: ${done} из ${steps.length}`} /><small>Готово {done} из {steps.length}</small></>
              : <small>Этапы ещё не добавлены</small>}
          </button>;
        })}</div> : <p className="overview-empty">Открытых проектов пока нет.</p>}
      </section>
    </div>}
  </div>;
}
