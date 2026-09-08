type SiteOrder = {
  id: string;
  createdAt?: string;
  promoCode?: string | null;
  fulfillmentStatus?: string;
  crmStatus?: string;
  crmNumber?: string;
  crmId?: string;
  customer?: { name?: string };
};

type SiteLead = {
  id: string;
  createdAt?: string;
  type?: string;
  name?: string;
  company?: string;
  crmStatus?: string;
  crmNumber?: string;
  crmId?: string;
};

type SummaryRow = {
  id: string;
  name: string;
  date: string;
  status: string;
  code: string;
  crmNumber: string;
  crmId: string;
};

const TOKEN_KEY = "satori_admin_token";
const CRM_BASE = String((import.meta as any).env?.VITE_CRM_URL || "https://crm.satorilabural.ru").replace(/\/$/, "");

let observer: MutationObserver | null = null;
let currentPage = "";
let loading = false;
let lastLoadedAt = 0;
let lastRows: SummaryRow[] = [];

function esc(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char] || char);
}

function fmtDate(value?: string) {
  if (!value) return "—";
  return new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fallbackNumber(id: string) {
  return `S-${String(id || "").replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

function crmUrl(crmId: string) {
  return `${CRM_BASE}/?deal=${encodeURIComponent(crmId)}`;
}

async function api<T>(url: string): Promise<T> {
  const token = localStorage.getItem(TOKEN_KEY) || "";
  const response = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!response.ok) throw new Error("Не удалось получить данные CRM");
  return response.json();
}

function getPage() {
  const main = document.querySelector<HTMLElement>(".admin-figma main");
  const title = main?.querySelector(".fa-page-head h1")?.textContent?.trim() || "";
  if (title === "Заказы") return { main, page: "orders" as const };
  if (title === "Заявки") return { main, page: "leads" as const };
  return { main, page: "" as const };
}

function ensureContainer(main: HTMLElement) {
  let container = main.querySelector<HTMLElement>("#fa-crm-site-summary");
  if (!container) {
    container = document.createElement("section");
    container.id = "fa-crm-site-summary";
    container.className = "fa-card fa-crm-site-summary";
    const head = main.querySelector(".fa-page-head");
    head?.insertAdjacentElement("afterend", container);
  }
  return container;
}

function rowsSignature(rows: SummaryRow[], page: "orders" | "leads") {
  return `${page}:${rows.map((row) => [row.id, row.name, row.date, row.status, row.code, row.crmNumber].join("|")).join(";")}`;
}

function renderRows(container: HTMLElement, rows: SummaryRow[], page: "orders" | "leads") {
  const signature = rowsSignature(rows, page);
  if (container.dataset.signature === signature) return;
  container.dataset.signature = signature;
  const noun = page === "orders" ? "Заказов" : "Заявок";
  container.innerHTML = `
    <div class="fa-crm-summary-head">
      <div><span>SATORI / CRM</span><b>${noun}: ${rows.length}</b></div>
      <a class="fa-crm-open-all" href="${esc(CRM_BASE)}" target="_blank" rel="noreferrer">Открыть CRM ↗</a>
    </div>
    <div class="fa-crm-summary-table-wrap">
      <table class="fa-crm-summary-table">
        <thead><tr><th>ИМЯ</th><th>ДАТА</th><th>СТАТУС</th><th>КОД ПРИМЕНЁН</th><th>№ В CRM</th><th></th></tr></thead>
        <tbody>${rows.map((row) => `
          <tr>
            <td data-label="Имя"><b>${esc(row.name)}</b></td>
            <td data-label="Дата">${esc(row.date)}</td>
            <td data-label="Статус"><span class="fa-crm-status">${esc(row.status)}</span></td>
            <td data-label="Код">${row.code !== "—" ? `<code>${esc(row.code)}</code>` : "—"}</td>
            <td data-label="№ в CRM"><b class="fa-crm-number">${esc(row.crmNumber)}</b></td>
            <td><a class="fa-crm-row-open" href="${esc(crmUrl(row.crmId))}" target="_blank" rel="noreferrer">Открыть ↗</a></td>
          </tr>`).join("") || `<tr><td colspan="6" class="fa-crm-empty">Пока нет записей</td></tr>`}</tbody>
      </table>
    </div>`;
}

async function loadRows(page: "orders" | "leads") {
  if (page === "orders") {
    const orders = await api<SiteOrder[]>("/api/admin/orders");
    return orders.map((order): SummaryRow => ({
      id: order.id,
      name: order.customer?.name || "Клиент",
      date: fmtDate(order.createdAt),
      status: order.crmStatus || order.fulfillmentStatus || "Новый запрос",
      code: order.promoCode || "—",
      crmNumber: order.crmNumber || fallbackNumber(order.id),
      crmId: order.crmId || `web:${order.id}`,
    }));
  }

  const leads = await api<SiteLead[]>("/api/admin/leads");
  return leads.map((lead): SummaryRow => ({
    id: lead.id,
    name: lead.company || lead.name || "Клиент",
    date: fmtDate(lead.createdAt),
    status: lead.crmStatus || "Новый запрос",
    code: "—",
    crmNumber: lead.crmNumber || fallbackNumber(lead.id),
    crmId: lead.crmId || `lead:${lead.id}`,
  }));
}

async function refresh(force = false) {
  const { main, page } = getPage();
  if (!main || !page) {
    document.querySelectorAll(".fa-crm-summary-mode").forEach((el) => el.classList.remove("fa-crm-summary-mode"));
    document.getElementById("fa-crm-site-summary")?.remove();
    currentPage = "";
    return;
  }

  main.classList.add("fa-crm-summary-mode");
  const subtitle = main.querySelector<HTMLElement>(".fa-page-head p");
  const subtitleText = "Работа по заявкам ведётся в Satori CRM. На сайте остаётся только служебная сводка.";
  if (subtitle && subtitle.textContent !== subtitleText) subtitle.textContent = subtitleText;
  const container = ensureContainer(main);

  if (currentPage !== page) {
    currentPage = page;
    lastLoadedAt = 0;
    lastRows = [];
    delete container.dataset.signature;
  }

  if (lastRows.length) renderRows(container, lastRows, page);
  if (loading || (!force && Date.now() - lastLoadedAt < 4000)) return;

  loading = true;
  if (!lastRows.length) {
    delete container.dataset.signature;
    container.innerHTML = '<div class="fa-crm-loading">Загружаем данные CRM…</div>';
  }
  try {
    const rows = await loadRows(page);
    if (getPage().page !== page) return;
    lastRows = rows;
    lastLoadedAt = Date.now();
    renderRows(container, rows, page);
  } catch (error) {
    delete container.dataset.signature;
    container.innerHTML = `<div class="fa-crm-error">${esc(error instanceof Error ? error.message : "Ошибка загрузки")}</div>`;
  } finally {
    loading = false;
  }
}

export function startAdminCrmSummary() {
  if (!window.location.pathname.startsWith("/admin")) return;

  let timer = 0;
  const schedule = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => refresh(false), 40);
  };

  observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList: true, subtree: true });
  window.setInterval(() => refresh(true), 5000);
  refresh(true);
}
