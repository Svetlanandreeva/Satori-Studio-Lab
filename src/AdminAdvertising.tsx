import { useEffect, useState } from "react";
import { BarChart3, Eye, MousePointer2, Receipt, Wallet } from "lucide-react";

const endpoint = "/api/admin/advertising";
const periods = { today: "Сегодня", "7": "7 дней", "30": "30 дней" } as const;
const periodOptions = ["today", "7", "30"] as const;
const format = new Intl.NumberFormat("ru-RU");
type Period = keyof typeof periods;
type Metric =
  | { status: "ok"; value: number; sampled: boolean }
  | { status: "setup" | "access" | "unavailable"; value: null };
type Report = { views: Metric; clicks: Metric; spend?: Metric };
type Balance =
  | { status: "ok"; value: number; currency: string }
  | { status: "setup" | "access" | "approval" | "account" | "unavailable"; value: null };

function money(value: number, currency: string) {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency }).format(value);
}

function metricValue(metric?: Metric, asMoney = false) {
  if (metric?.status !== "ok") return "—";
  return (metric.sampled ? "≈ " : "") + (asMoney ? money(metric.value, "RUB") : format.format(metric.value));
}

export default function AdminAdvertising({ token, openSettings }: { token: string; openSettings: () => void }) {
  const [period, setPeriod] = useState<Period>("7");
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [balanceRetry, retryBalance] = useState(0);

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

  useEffect(() => {
    const controller = new AbortController();
    setBalanceLoading(true);
    fetch(`${endpoint}/balance`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
      cache: "no-store",
    }).then(async (response) => {
      if (!response.ok) throw new Error();
      const data = await response.json() as Balance;
      if (!data?.status) throw new Error();
      if (!controller.signal.aborted) setBalance(data);
    }).catch(() => {
      if (!controller.signal.aborted) setBalance({ status: "unavailable", value: null });
    }).finally(() => {
      if (!controller.signal.aborted) setBalanceLoading(false);
    });
    return () => controller.abort();
  }, [token, balanceRetry]);

  const needsSetup = report?.views.status === "setup" || report?.views.status === "access";
  const needsDirectAccess = report?.views.status === "ok" && report.clicks.status === "access";
  const unavailable = [report?.clicks, report?.views, report?.spend].some((item) => item?.status === "unavailable");
  const directSetup = balance?.status === "setup" || balance?.status === "access" || balance?.status === "approval" || balance?.status === "account";

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
      <div><dt><Receipt size={16} /> Расходы на рекламу</dt><dd>{metricValue(report?.spend, true)}</dd><small>За выбранный период, без НДС</small></div>
      <div aria-busy={balanceLoading}><dt><Wallet size={16} /> Остаток в Директе</dt>
        <dd>{balance?.status === "ok" ? money(balance.value, balance.currency) : "—"}</dd><small>Текущий общий счёт</small>
      </div>
    </dl>
    {loading && <p className="overview-muted" role="status">Загрузка статистики…</p>}
    {(error || unavailable) && <div className="overview-ad-help">
      <p role="status">{error || "Часть данных пока недоступна."}</p>
      <button className="fa-outline-button" type="button" onClick={() => setRetry((number) => number + 1)}>Повторить</button>
    </div>}
    {(needsSetup || needsDirectAccess) && <div className="overview-ad-help">
      <p>{needsDirectAccess ? "Просмотры доступны. Для кликов и расходов нужен доступ к отчёту «Директ, расходы» в Метрике."
        : report?.views.status === "access" ? "Нужен токен с доступом на чтение к счётчику Satori."
          : "Подключите счётчик Satori, чтобы получать статистику."}</p>
      <button className="fa-outline-button" type="button" onClick={openSettings}>Открыть настройки</button>
    </div>}
    {report?.clicks.status === "ok" && <p className="overview-muted">Клики и расходы по кампаниям, связанным со счётчиком Satori.</p>}
    {directSetup && <div className="overview-ad-help">
      <p>{balance.status === "approval" ? "Яндекс ещё не одобрил доступ приложения к API Директа."
        : balance.status === "account" ? "Подключите токен рекламного аккаунта с одним общим счётом."
          : balance.status === "access" ? "Проверьте доступ токена к API Директа и рекламному аккаунту."
            : "Для текущего остатка подключите рекламный аккаунт Директа."}</p>
      <button className="fa-outline-button" type="button" onClick={openSettings}>Открыть настройки</button>
    </div>}
    {balance?.status === "unavailable" && <div className="overview-ad-help">
      <p>Остаток в Директе временно недоступен.</p>
      <button className="fa-outline-button" type="button" disabled={balanceLoading} onClick={() => retryBalance((number) => number + 1)}>Обновить остаток</button>
    </div>}

  </section>;
}
