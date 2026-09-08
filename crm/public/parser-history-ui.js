const PARSER_TOKEN_KEY = "satori_crm_token";
const parserToken = () => localStorage.getItem(PARSER_TOKEN_KEY) || "";

async function parserApi(url, options = {}) {
  const headers = {
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(parserToken() ? { Authorization: `Bearer ${parserToken()}` } : {}),
    ...(options.headers || {}),
  };
  const response = await fetch(url, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Ошибка истории парсера");
  return data;
}

const parserEsc = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const parserDate = (value) => value ? new Date(value).toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

function parserToast(text) {
  const el = document.createElement("div");
  el.className = "parser-toast";
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

function statusLabel(status) {
  return ({ running: "В работе", completed: "Готово", failed: "Ошибка", cancelled: "Остановлен" })[status] || status || "—";
}

function runRows(runs) {
  if (!runs.length) return `<div class="parser-empty"><b>История пока пустая</b><span>После первого запуска парсера здесь появится конкурент, источник, количество найденных контактов, дубли и ошибки.</span></div>`;
  return runs.map((run) => `<button class="parser-run" data-parser-run="${parserEsc(run.id)}">
    <div class="parser-run-main"><b>${parserEsc(run.competitor || "Без названия")}</b><span>${parserEsc(run.source || run.sourceUrl || "Источник не указан")}</span></div>
    <div><span class="parser-status ${parserEsc(run.status)}">${statusLabel(run.status)}</span></div>
    <div class="parser-metric"><b>${Number(run.found || 0)}</b><span>найдено</span></div>
    <div class="parser-metric"><b>${Number(run.newContacts || 0)}</b><span>новых</span></div>
    <div class="parser-metric"><b>${Number(run.duplicates || 0)}</b><span>дубли</span></div>
    <div class="parser-run-date">${parserDate(run.startedAt)}</div>
  </button>`).join("");
}

function contactRows(contacts = []) {
  if (!contacts.length) return `<div class="parser-empty compact"><span>Контакты в этом запуске не сохранены.</span></div>`;
  return contacts.map((contact) => `<div class="parser-contact">
    <div><b>${parserEsc(contact.name || contact.company || "Контакт")}</b><span>${parserEsc([contact.role, contact.company].filter(Boolean).join(" · "))}</span></div>
    <div>${parserEsc(contact.phone || "—")}</div>
    <div>${parserEsc(contact.email || contact.telegram || "—")}</div>
    <div><span class="parser-contact-state ${contact.importedToCrm ? "imported" : ""}">${contact.importedToCrm ? "В CRM" : parserEsc(contact.status || "Новый")}</span></div>
  </div>`).join("");
}

async function openRunDetails(run) {
  const dialog = document.createElement("dialog");
  dialog.className = "parser-detail-dialog";
  dialog.innerHTML = `<div class="parser-detail">
    <div class="parser-detail-head"><div><div class="parser-kicker">PARSER / RUN</div><h2>${parserEsc(run.competitor || "Запуск")}</h2><p>${parserEsc(run.source || run.sourceUrl || "")}</p></div><button data-parser-close>×</button></div>
    <div class="parser-detail-stats">
      <div><span>Найдено</span><b>${Number(run.found || 0)}</b></div>
      <div><span>Новых</span><b>${Number(run.newContacts || 0)}</b></div>
      <div><span>Дублей</span><b>${Number(run.duplicates || 0)}</b></div>
      <div><span>Ошибок</span><b>${Number(run.errors || 0)}</b></div>
    </div>
    <div class="parser-detail-meta">
      <span>Старт: ${parserDate(run.startedAt)}</span>
      <span>Финиш: ${parserDate(run.finishedAt)}</span>
      ${run.query ? `<span>Запрос: ${parserEsc(run.query)}</span>` : ""}
      ${run.sourceUrl ? `<a href="${parserEsc(run.sourceUrl)}" target="_blank" rel="noopener noreferrer">Открыть источник ↗</a>` : ""}
    </div>
    ${run.errorMessage ? `<div class="parser-error">${parserEsc(run.errorMessage)}</div>` : ""}
    ${run.notes ? `<div class="parser-notes">${parserEsc(run.notes)}</div>` : ""}
    <div class="parser-contact-list"><div class="parser-contact head"><div>Контакт</div><div>Телефон</div><div>Email / Telegram</div><div>Статус</div></div>${contactRows(run.contacts)}</div>
  </div>`;
  document.body.appendChild(dialog);
  dialog.querySelector("[data-parser-close]").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => dialog.remove());
  dialog.showModal();
}

async function openParserHistory() {
  let payload;
  try { payload = await parserApi("/api/parser-history"); }
  catch (error) { return parserToast(error.message); }

  const dialog = document.createElement("dialog");
  dialog.className = "parser-history-dialog";
  const stats = payload.stats || {};
  dialog.innerHTML = `<div class="parser-history">
    <header class="parser-head"><div><div class="parser-kicker">SATORI / CONTACT PARSER</div><h1>История парсинга</h1><p>Все запуски парсера конкурентов и найденные контакты.</p></div><button data-parser-close>×</button></header>
    <section class="parser-summary">
      <div><span>Запусков</span><b>${Number(stats.runs || 0)}</b></div>
      <div><span>Найдено</span><b>${Number(stats.found || 0)}</b></div>
      <div><span>Новых</span><b>${Number(stats.newContacts || 0)}</b></div>
      <div><span>Дублей</span><b>${Number(stats.duplicates || 0)}</b></div>
    </section>
    <div class="parser-toolbar"><input id="parser-search" placeholder="Конкурент или источник…"><select id="parser-status"><option value="">Все статусы</option><option value="running">В работе</option><option value="completed">Готово</option><option value="failed">Ошибка</option><option value="cancelled">Остановлен</option></select></div>
    <div class="parser-runs" id="parser-runs">${runRows(payload.runs || [])}</div>
  </div>`;
  document.body.appendChild(dialog);
  dialog.querySelector("[data-parser-close]").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => dialog.remove());
  dialog.showModal();

  let allRuns = payload.runs || [];
  const renderFiltered = () => {
    const q = dialog.querySelector("#parser-search").value.trim().toLowerCase();
    const status = dialog.querySelector("#parser-status").value;
    const filtered = allRuns.filter((run) => {
      if (status && run.status !== status) return false;
      if (q && !`${run.competitor || ""} ${run.source || ""} ${run.sourceUrl || ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
    dialog.querySelector("#parser-runs").innerHTML = runRows(filtered);
    bindRows();
  };
  const bindRows = () => dialog.querySelectorAll("[data-parser-run]").forEach((button) => button.addEventListener("click", () => {
    const run = allRuns.find((item) => item.id === button.dataset.parserRun);
    if (run) openRunDetails(run);
  }));
  dialog.querySelector("#parser-search").addEventListener("input", renderFiltered);
  dialog.querySelector("#parser-status").addEventListener("change", renderFiltered);
  bindRows();
}

function ensureParserButton() {
  if (!parserToken() || document.querySelector("#crm-parser-history-button")) return;
  const button = document.createElement("button");
  button.id = "crm-parser-history-button";
  button.className = "parser-fab";
  button.innerHTML = `<span>⌕</span> Парсер`;
  button.addEventListener("click", openParserHistory);
  document.body.appendChild(button);
}

const parserObserver = new MutationObserver(ensureParserButton);
parserObserver.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener("storage", ensureParserButton);
setInterval(ensureParserButton, 1500);
ensureParserButton();
