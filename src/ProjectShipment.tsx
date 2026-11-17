import { useEffect, useState } from "react";
import { Copy, ExternalLink, Truck } from "lucide-react";

const endpoint = "/api/admin/dellin-tracking";
const publicTracker = "https://www.dellin.ru/tracker/";
const widget = "https://widgets.dellin.ru/tracker?info=0&delivery=0&extraparams=0&internal=1";

type Tracking =
  | { status: "ok"; label: string; date: string }
  | { status: "access" | "setup" | "not-found" | "invalid" | "unavailable" };

const messages = {
  setup: "Для автоматического статуса подключите API-ключ Деловых Линий.",
  access: "Деловые Линии отклонили ключ. Проверьте подключение.",
  "not-found": "Перевозчик не нашёл отправление по этому номеру или нашёл несколько. Проверьте номер накладной.",
  invalid: "Проверьте номер накладной.",
  unavailable: "Не удалось получить статус. Попробуйте ещё раз или откройте трекер.",
};

export function normalizeWaybill(value: string) {
  return value.trim().replace(/\s+/g, "").replace(/[–—‑]/g, "-");
}

function statusDate(date: string) {
  const value = new Date(date);
  return Number.isFinite(+value) ? new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Yekaterinburg",
  }).format(value) : "";
}

export default function ProjectShipment({ token, date, waybill, savedWaybill, onDate, onWaybill }: {
  token: string;
  date: string;
  waybill: string;
  savedWaybill: string;
  onDate?: (date: string) => void;
  onWaybill?: (waybill: string) => void;
}) {
  const [result, setResult] = useState<{ number: string; tracking: Tracking } | null>(null);
  const [lookup, setLookup] = useState({ number: savedWaybill, attempt: 0 });
  const [loading, setLoading] = useState(Boolean(savedWaybill));
  const [settings, setSettings] = useState(false);
  const [showWidget, setShowWidget] = useState(false);
  const [key, setKey] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const number = normalizeWaybill(waybill);
  const editable = Boolean(onDate && onWaybill);
  const status = result?.number === number ? result.tracking : null;
  const pending = loading && lookup.number === number;

  useEffect(() => {
    if (!lookup.number) return;
    const controller = new AbortController();
    setLoading(true);
    fetch(`${endpoint}?waybill=${encodeURIComponent(lookup.number)}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: controller.signal,
    }).then(async (response) => {
      const data = await response.json() as Tracking;
      if (!data?.status) throw new Error();
      if (!controller.signal.aborted) setResult({ number: lookup.number, tracking: data });
    }).catch(() => {
      if (!controller.signal.aborted) setResult({ number: lookup.number, tracking: { status: "unavailable" } });
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [lookup, token]);

  async function connect() {
    if (!key.trim() || !number || connecting) return;
    setConnecting(true);
    setError("");
    try {
      const response = await fetch(`${endpoint}/connection`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ key: key.trim(), waybill: number }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось подключить Деловые Линии.");
      setResult({ number, tracking: data });
      setKey("");
      setSettings(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось подключить Деловые Линии.");
    } finally {
      setConnecting(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(number);
      setCopied(true);
    } catch {
      setError("Не удалось скопировать номер автоматически. Выделите его в поле «Номер накладной».");
    }
  }

  return <section className="fa-card project-card">
    <div className="project-card-head"><h2 className="project-shipment-title"><Truck size={18} /> Отгрузка</h2></div>
    {editable ? <div className="project-form-grid">
      <label className="project-field"><span>Дата отгрузки</span>
        <input type="date" value={date} onChange={(event) => onDate?.(event.target.value)} />
      </label>
      <label className="project-field"><span>Номер накладной Деловых Линий</span>
        <input value={waybill} maxLength={64} onChange={(event) => {
          onWaybill?.(event.target.value);
          setCopied(false);
          setError("");
        }} />
      </label>
    </div> : <dl className="project-summary-details">
      <div><dt>Дата отгрузки</dt><dd>{date ? date.split("-").reverse().join(".") : "—"}</dd></div>
      <div><dt>Накладная Деловых Линий</dt><dd>{number || "—"}</dd></div>
    </dl>}
    {number && <>
      <div className="project-shipment-actions">
        <button type="button" className="fa-outline-button" disabled={pending || connecting} onClick={() => {
          setError("");
          setLookup((current) => ({ number, attempt: current.attempt + 1 }));
        }}>Обновить статус</button>
        <button type="button" className="fa-outline-button" onClick={copy}><Copy size={15} /> {copied ? "Скопировано" : "Копировать номер"}</button>
        <button type="button" className="fa-outline-button" aria-expanded={showWidget} onClick={() => setShowWidget((value) => !value)}>
          {showWidget ? "Скрыть трекер" : "Открыть трекер"}
        </button>
      </div>
      {pending && <p className="project-muted" role="status">Проверяем статус…</p>}
      {!pending && status?.status === "ok" && <p className="project-shipment-status" role="status">
        <strong>{status.label}</strong><span>{statusDate(status.date)}</span>
      </p>}
      {!pending && status && status.status !== "ok" && <p className="project-muted" role="status">
        {!editable && status.status === "setup" ? "Автоматический статус можно подключить при редактировании проекта." : messages[status.status]}
      </p>}
      {editable && (status?.status === "setup" || status?.status === "access") && <button type="button" className="fa-outline-button project-tracking-setup" aria-expanded={settings} onClick={() => setSettings((value) => !value)}>
        {settings ? "Закрыть настройки" : "Подключить Деловые Линии"}
      </button>}
      {editable && settings && <div className="project-shipment-actions">
        <label className="project-field"><span>API-ключ Деловых Линий</span>
          <input type="password" value={key} maxLength={36} autoComplete="off" onChange={(event) => setKey(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }} />
        </label>
        <button type="button" className="fa-primary" disabled={connecting || !key.trim()} onClick={connect}>
          {connecting ? "Проверяем ключ…" : "Сохранить подключение"}
        </button>
        <a href="https://dev.dellin.ru/registration/" target="_blank" rel="noreferrer">Получить API-ключ</a>
      </div>}
      {showWidget && <div className="project-tracker">
        <p className="project-muted">Вставьте номер накладной в официальный трекер.</p>
        <iframe title="Трекер Деловых Линий" src={widget} loading="lazy" />
        <a href={publicTracker} target="_blank" rel="noreferrer">Открыть на сайте перевозчика <ExternalLink size={13} /></a>
      </div>}
      {error && <p className="fa-error" role="alert">{error}</p>}
    </>}
  </section>;
}
