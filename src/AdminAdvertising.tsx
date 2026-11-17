import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { BarChart3, Eye, MousePointer2 } from "lucide-react";

const endpoint = "/api/admin/advertising";
const periods = { today: "Сегодня", "7": "7 дней", "30": "30 дней" } as const;
const periodOptions = ["today", "7", "30"] as const;
const format = new Intl.NumberFormat("ru-RU");
type Period = keyof typeof periods;
type Metric =
  | { status: "ok"; value: number; sampled: boolean }
  | { status: "setup" | "access" | "unavailable"; value: null };
type Report = { views: Metric; clicks: Metric };

function metricValue(metric?: Metric) {
  if (metric?.status !== "ok") return "—";
  return (metric.sampled ? "≈ " : "") + format.format(metric.value);
}

export default function AdminAdvertising({ token }: { token: string }) {
  const [period, setPeriod] = useState<Period>("7");
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [showConnection, setShowConnection] = useState(false);
  const [connectionError, setConnectionError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setReport(null);
    fetch(`${endpoint}?period=${period}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
      cache: "no-store",
    }).then(async (response) => {
      if (!response.ok) throw new Error();
      const data = await response.json() as Report;
      if (!data.views || !data.clicks) throw new Error();
      if (!controller.signal.aborted) setReport(data);
    }).catch(() => {
      if (!controller.signal.aborted) setError("Не удалось загрузить статистику.");
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [token, period, retry]);

  async function connect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const value = new FormData(form).get("token");
    setSaving(true);
    setConnectionError("");
    try {
      const response = await fetch(`${endpoint}/connection`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ token: value }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error || "Не удалось подключить Метрику.");
      }
      form.reset();
      setShowConnection(false);
      setRetry((number) => number + 1);
    } catch (reason) {
      setConnectionError(reason instanceof Error ? reason.message : "Не удалось подключить Метрику.");
    } finally {
      setSaving(false);
    }
  }

  const needsSetup = report?.views.status === "setup" || report?.views.status === "access";
  const needsDirectAccess = report?.views.status === "ok" && report.clicks.status === "access";
  const unavailable = report?.clicks.status === "unavailable" || report?.views.status === "unavailable";

  return <section className="overview-card overview-advertising" aria-labelledby="overview-advertising-title">
    <header className="overview-card-head">
      <h2 id="overview-advertising-title"><BarChart3 size={19} /> Реклама</h2>
      <div className="overview-range" role="group" aria-label="Период статистики рекламы">
        {periodOptions.map((item) => <button key={item} type="button" aria-pressed={item === period} onClick={() => {
          if (item === period) return;
          setReport(null);
          setLoading(true);
          setPeriod(item);
        }}>{periods[item]}</button>)}
      </div>
    </header>
    <dl className="overview-ad-metrics" aria-busy={loading}>
      <div><dt><Eye size={16} /> Просмотры сайта</dt><dd>{metricValue(report?.views)}</dd></div>
      <div><dt><MousePointer2 size={16} /> Клики из Директа</dt><dd>{metricValue(report?.clicks)}</dd></div>
    </dl>
    {loading && <p className="overview-muted" role="status">Загрузка статистики…</p>}
    {(error || unavailable) && <div className="overview-ad-help">
      <p role="status">{error || "Часть данных пока недоступна."}</p>
      <button className="fa-outline-button" type="button" onClick={() => setRetry((number) => number + 1)}>Повторить</button>
    </div>}
    {(needsSetup || needsDirectAccess) && <div className="overview-ad-help">
      <p>{needsDirectAccess ? "Просмотры доступны. Для кликов нужен доступ к отчёту «Директ, расходы» в Метрике."
        : report?.views.status === "access" ? "Нужен токен с доступом на чтение к счётчику Satori."
          : "Подключите счётчик Satori, чтобы получать статистику."}</p>
      <button className="fa-outline-button" type="button" aria-expanded={showConnection} onClick={() => {
        setConnectionError("");
        setShowConnection((visible) => !visible);
      }}>{showConnection ? "Закрыть настройки" : "Подключить Метрику"}</button>
    </div>}
    {report?.clicks.status === "ok" && <p className="overview-muted">Клики по кампаниям, связанным со счётчиком Satori, из отчёта «Директ, расходы».</p>}
    {showConnection && <form className="overview-ad-connect" onSubmit={connect}>
      <label><span>OAuth-токен Метрики с правом чтения</span>
        <input name="token" type="password" autoComplete="off" spellCheck={false} required maxLength={512} disabled={saving} />
      </label>
      <button type="submit" className="fa-primary" disabled={saving}>{saving ? "Проверяем…" : "Сохранить подключение"}</button>
      <a href="https://yandex.ru/dev/metrika/ru/intro/authorization" target="_blank" rel="noreferrer">Как получить токен</a>
      {connectionError && <p className="fa-error" role="alert">{connectionError}</p>}
    </form>}
  </section>;
}
