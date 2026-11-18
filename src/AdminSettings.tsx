import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Settings } from "lucide-react";

const services = [
  {
    id: "metrika", title: "Яндекс Метрика", label: "OAuth-токен с правом metrika:read",
    description: "Просмотры сайта, клики и рекламные расходы.",
    endpoint: "/api/admin/advertising/connection",
    help: "https://yandex.ru/dev/metrika/ru/intro/authorization",
  },
  {
    id: "direct", title: "Яндекс Директ", label: "OAuth-токен с правом direct:api",
    description: "Текущий остаток на общем рекламном счёте.",
    endpoint: "/api/admin/advertising/direct-connection",
    help: "https://yandex.ru/dev/direct/doc/ru/access-request",
  },
  {
    id: "dellin", title: "Деловые Линии", label: "API-ключ приложения",
    description: "Статус доставки по номеру накладной в проектах.",
    endpoint: "/api/admin/dellin-tracking/connection",
    help: "https://dev.dellin.ru/registration/",
  },
] as const;
type Service = typeof services[number];

function ConnectionCard({ service, token }: { service: Service; token: string }) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [attempt, retry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setChecking(true);
    setError("");
    const url = service.id === "dellin" ? service.endpoint : "/api/admin/advertising/connections";
    fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Не удалось проверить подключение.");
        const data = await response.json();
        const value = service.id === "dellin" ? data.configured : data[service.id];
        if (typeof value !== "boolean") throw new Error("Не удалось проверить подключение.");
        if (!controller.signal.aborted) setConfigured(value);
      }).catch((reason) => {
        if (!controller.signal.aborted) setError(reason.message);
      }).finally(() => {
        if (!controller.signal.aborted) setChecking(false);
      });
    return () => controller.abort();
  }, [token, service, attempt]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const secret = String(data.get("secret") || "").trim();
    const body = service.id === "dellin" ? { key: secret, waybill: data.get("waybill") } : { token: secret };
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(service.endpoint, {
        method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error || "Не удалось сохранить подключение.");
      }
      const result = response.status === 204 ? {} : await response.json();
      form.reset();
      setConfigured(true);
      setNotice(result.notice || "Подключение сохранено.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось сохранить подключение.");
    } finally {
      setSaving(false);
    }
  }

  return <section className="fa-card project-card settings-connection">
    <div className="project-card-head"><h2>{service.title}</h2><span className="project-status">
      {checking ? "Проверяем…" : configured === null ? "Статус недоступен" : configured ? "Ключ сохранён" : "Не подключено"}
    </span></div>
    <p className="project-muted">{service.description}</p>
    <form onSubmit={save} className="settings-connection-form">
      <fieldset disabled={saving}>
        <label className="project-field"><span>{service.label}</span>
          <input type="password" name="secret" required autoComplete="off" spellCheck={false} maxLength={service.id === "dellin" ? 128 : 512}
            placeholder={configured ? "Введите новый ключ для замены" : "Вставьте ключ"} />
        </label>
        {service.id === "dellin" && <label className="project-field"><span>Номер накладной для проверки (необязательно)</span>
          <input type="text" name="waybill" maxLength={64} />
        </label>}
        <div className="project-view-actions">
          <button type="submit" className="fa-primary">{saving ? "Проверяем…" : configured ? "Заменить ключ" : "Сохранить подключение"}</button>
          <a href={service.help} target="_blank" rel="noreferrer">Как получить ключ</a>
        </div>
      </fieldset>
    </form>
    {notice && <p className="project-notice" role="status">{notice}</p>}
    {error && <div className="fa-error" role="alert">{error}
      {configured === null && <button className="fa-outline-button" type="button" disabled={checking} onClick={() => retry((value) => value + 1)}>Повторить</button>}
    </div>}
  </section>;
}

export default function AdminSettings({ token }: { token: string }) {
  return <div className="projects-workspace">
    <div className="fa-page-head"><div><h1><Settings size={28} /> Настройки</h1><p>Подключения сервисов CRM.</p></div></div>
    <div className="settings-connections">
      {services.map((service) => <ConnectionCard key={service.id} service={service} token={token} />)}
    </div>
  </div>;
}
