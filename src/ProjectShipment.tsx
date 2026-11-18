import { useEffect, useState } from "react";
import { Copy, RefreshCw, Truck } from "lucide-react";

const endpoint = "/api/admin/dellin-tracking";
const refreshInterval = 60_000;

type Tracking =
  | { status: "ok"; label: string; date: string }
  | { status: "access" | "forbidden" | "authorization" | "blocked" | "setup" | "not-found" | "invalid" | "unavailable"; message?: string };

const messages = {
  access: "Деловые Линии сообщили, что ключ недействителен или заблокирован. Проверьте подключение.",
  forbidden: "У ключа нет доступа к истории статусов. Обратитесь в api_support@dellin.ru.",
  authorization: "Перевозчик запросил дополнительную авторизацию. Проверьте доступ к API в настройках.",
  blocked: "Доступ к API перевозчика с сервера сайта ограничен. Обратитесь в api_support@dellin.ru.",
  "not-found": "Перевозчик не нашёл отправление по этому номеру или нашёл несколько. Проверьте номер накладной.",
  invalid: "Проверьте номер накладной.",
  unavailable: "Не удалось получить статус. Статус будет запрошен повторно автоматически.",
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

function useShipmentTracking(token: string, waybill: string, editable = false) {
  const [result, setResult] = useState<{
    number: string; tracking: Tracking; checkedAt: string;
    lastSuccess?: { label: string; date: string };
  } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(false);
  const number = normalizeWaybill(waybill);
  const validNumber = number.length <= 64 && /\d/.test(number) && /^[\p{L}\d]+(?:-[\p{L}\d]+)*$/u.test(number);
  const current = result?.number === number ? result : null;
  const status = current?.tracking;
  const latest = status?.status === "ok" ? status : current?.lastSuccess;

  useEffect(() => {
    if (!validNumber) { setLoading(false); return; }
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let inFlight = false;

    async function update() {
      if (controller.signal.aborted || inFlight) return;
      clearTimeout(timer);
      if (document.visibilityState === "hidden") {
        timer = setTimeout(update, refreshInterval);
        return;
      }
      inFlight = true;
      setLoading(true);
      let tracking: Tracking;
      try {
        const response = await fetch(`${endpoint}?waybill=${encodeURIComponent(number)}`, {
          headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: controller.signal,
        });
        if (!response.ok) throw new Error();
        tracking = await response.json() as Tracking;
        if (!tracking?.status) throw new Error();
      } catch {
        tracking = { status: "unavailable" };
      }
      inFlight = false;
      if (controller.signal.aborted) return;
      setResult((previous) => ({ number, tracking, checkedAt: new Date().toISOString(),
        lastSuccess: tracking.status === "ok" ? { label: tracking.label, date: tracking.date }
          : previous?.number === number ? previous.lastSuccess : undefined,
      }));
      setLoading(false);
      timer = setTimeout(update, refreshInterval);
    }

    function visible() {
      if (document.visibilityState !== "hidden") void update();
    }
    setLoading(true);
    timer = setTimeout(update, editable ? 700 : 0);
    document.addEventListener("visibilitychange", visible);
    return () => {
      controller.abort();
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [number, validNumber, token, attempt, editable]);

  return { current, status, latest, number, validNumber, loading, refresh: () => setAttempt((value) => value + 1) };
}

export function ProjectDeliveryStatus({ token, waybill }: { token: string; waybill: string }) {
  const { current, status, latest, number, validNumber, loading } = useShipmentTracking(token, waybill);
  const problem = status && status.status !== "ok"
    ? status.status === "setup" ? "Подключите Деловые Линии в настройках CRM." : status.message || messages[status.status] : "";
  const short = status?.status === "setup" ? "Не подключено"
    : status?.status === "not-found" ? "Отправление не найдено"
    : status?.status === "access" ? "Проверьте ключ"
    : status?.status === "forbidden" || status?.status === "authorization" || status?.status === "blocked" ? "Доступ к API ограничен"
    : "Статус временно недоступен";
  return <span className="project-list-delivery" role="status"
    title={[problem, current && `Последняя проверка: ${statusDate(current.checkedAt)}`].filter(Boolean).join(" ")}>
    <Truck size={14} aria-hidden="true" />
    <span>Доставка:</span>
    <span className="project-delivery-label" data-state={latest ? "ok" : "pending"}>
      {!number ? "Накладная не указана" : !validNumber ? "Проверьте номер накладной"
        : latest ? latest.label : loading || !status ? "Получаем статус…" : short}
    </span>
    {latest && <span>{statusDate(latest.date)}{status?.status !== "ok" ? " · последний полученный статус" : ""}</span>}
    {number && <span>Накладная {number}</span>}
    {latest && problem && <span>{short}</span>}
  </span>;
}

export default function ProjectShipment({ token, date, waybill, onDate, onWaybill }: {
  token: string;
  date: string;
  waybill: string;
  onDate?: (date: string) => void;
  onWaybill?: (waybill: string) => void;
}) {
  const editable = Boolean(onDate && onWaybill);
  const { current, status, latest, number, validNumber, loading, refresh } = useShipmentTracking(token, waybill, editable);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(number);
      setCopied(true);
    } catch {
      setError("Не удалось скопировать номер автоматически. Выделите и скопируйте его вручную.");
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
        <button type="button" className="fa-outline-button" disabled={loading || !validNumber} onClick={() => {
          setError("");
          refresh();
        }}><RefreshCw size={15} /> {loading ? "Обновляем…" : "Обновить статус"}</button>
        <button type="button" className="fa-outline-button" onClick={copy}><Copy size={15} /> {copied ? "Скопировано" : "Копировать номер"}</button>
      </div>
      {!validNumber && <p className="project-muted" role="status">Проверьте номер накладной.</p>}
      {loading && !latest && <p className="project-muted" role="status">Получаем статус Деловых Линий…</p>}
      {latest && <div className="project-shipment-status" role="status">
        {status?.status !== "ok" && <small>Последний полученный статус</small>}
        <strong>{latest.label}</strong><span>{statusDate(latest.date)}</span>
      </div>}
      {!loading && status && status.status !== "ok" && status.status !== "setup" && <p className="project-muted" role="status">{status.message || messages[status.status]}</p>}
      {status?.status === "setup" && <p className="project-muted">Сохраните ключ Деловых Линий в разделе «Настройки» CRM. После подключения статус появится здесь автоматически.</p>}
      {validNumber && <p className="project-muted">
        Автообновление каждую минуту, пока карточка открыта.
        {current && ` Последняя проверка: ${statusDate(current.checkedAt)}.`}
      </p>}
      {error && <p className="fa-error" role="alert">{error}</p>}
    </>}
  </section>;
}
