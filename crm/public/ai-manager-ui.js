const AI_TOKEN_KEY = "satori_crm_token";
const aiToken = () => localStorage.getItem(AI_TOKEN_KEY) || "";

async function aiApi(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(aiToken() ? { Authorization: `Bearer ${aiToken()}` } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Ошибка AI-менеджера");
  return data;
}

const aiEsc = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const aiDate = (value) => value ? new Date(value).toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

function aiToast(text) {
  const el = document.createElement("div");
  el.className = "ai-toast";
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

function aiDialog(html, wide = false) {
  const dialog = document.createElement("dialog");
  dialog.className = `ai-dialog${wide ? " ai-dialog-wide" : ""}`;
  dialog.innerHTML = `<div class="ai-modal">${html}</div>`;
  document.body.appendChild(dialog);
  dialog.addEventListener("close", () => dialog.remove());
  dialog.querySelectorAll("[data-ai-close]").forEach((button) => button.addEventListener("click", () => dialog.close()));
  dialog.showModal();
  return dialog;
}

function statusName(item) {
  if (item.dealId) return "Сделка";
  const map = {
    new: "Новый",
    draft_ready: "Черновик готов",
    contacted: "Связались",
    replied: "Ответил",
    qualified: "Квалифицирован",
    proposal: "Предложение",
    deal: "Сделка",
    human: "Нужен человек",
    stopped: "Остановлен",
    error: "Ошибка",
  };
  return map[item.status] || map[item.stage] || item.status || item.stage || "—";
}

function statusTone(item) {
  if (item.dealId || item.stage === "deal") return "deal";
  if (["human", "error"].includes(item.status)) return "warn";
  if (["stopped", "lost"].includes(item.status) || item.stage === "lost") return "stop";
  if (["replied", "qualified", "proposal"].includes(item.stage)) return "hot";
  return "neutral";
}

function statCard(label, value) {
  return `<div class="ai-stat"><span>${aiEsc(label)}</span><b>${Number(value || 0)}</b></div>`;
}

function contactCard(item) {
  return `<button class="ai-contact" data-ai-contact="${aiEsc(item.id)}">
    <div class="ai-contact-top"><div><b>${aiEsc(item.name || item.company || "Без имени")}</b><small>${aiEsc([item.role, item.company].filter(Boolean).join(" · "))}</small></div><span class="ai-status ai-${statusTone(item)}">${aiEsc(statusName(item))}</span></div>
    <div class="ai-contact-meta"><span>${aiEsc(item.competitor || item.source || "Парсер")}</span><strong>${Number(item.score || 0)}/100</strong></div>
    ${item.summary ? `<p>${aiEsc(item.summary)}</p>` : item.draft ? `<p>${aiEsc(item.draft)}</p>` : ""}
    <div class="ai-contact-foot"><span>${item.phone ? "WhatsApp" : item.telegram ? "Telegram" : "Нет канала"}</span><span>${aiDate(item.updatedAt || item.createdAt)}</span></div>
  </button>`;
}

async function openAiContact(id, refreshParent) {
  const snapshot = await aiApi("/api/ai-manager/");
  const item = snapshot.contacts.find((contact) => contact.id === id);
  if (!item) return aiToast("Контакт не найден");
  const dialog = aiDialog(`
    <div class="ai-head"><div><div class="ai-kicker">SATORI / AI SALES</div><h2>${aiEsc(item.name || item.company || "Контакт")}</h2><p>${aiEsc([item.role, item.company, item.competitor].filter(Boolean).join(" · "))}</p></div><button data-ai-close>×</button></div>
    <div class="ai-lead-strip"><span class="ai-status ai-${statusTone(item)}">${aiEsc(statusName(item))}</span><b>Score ${Number(item.score || 0)}/100</b><span>${item.attempts || 0} касаний</span></div>
    ${item.summary ? `<div class="ai-summary"><b>Что понял AI</b><p>${aiEsc(item.summary)}</p></div>` : ""}
    <label class="ai-field"><span>СЛЕДУЮЩЕЕ СООБЩЕНИЕ</span><textarea id="ai-draft" rows="6">${aiEsc(item.draft || "")}</textarea></label>
    <div class="ai-channel-actions">
      ${item.phone ? '<button class="ai-action ai-wa" data-ai-open="whatsapp">Открыть WhatsApp</button>' : ""}
      ${item.telegram ? '<button class="ai-action ai-tg" data-ai-open="telegram">Открыть Telegram</button>' : ""}
      <button class="ai-action" id="ai-save-draft">Сохранить текст</button>
    </div>
    <div class="ai-detail-grid">
      <div><span>Телефон</span><b>${aiEsc(item.phone || "—")}</b></div><div><span>Telegram</span><b>${aiEsc(item.telegram || "—")}</b></div>
      <div><span>Последнее действие</span><b>${aiDate(item.lastActionAt)}</b></div><div><span>Следующий follow-up</span><b>${aiDate(item.nextFollowUpAt)}</b></div>
    </div>
    ${item.stopReason ? `<div class="ai-warning">${aiEsc(item.stopReason)}</div>` : ""}
    <div class="ai-modal-actions">
      <button class="secondary" id="ai-pause">${item.paused ? "Возобновить" : "Пауза"}</button>
      ${!item.dealId ? '<button class="secondary" id="ai-make-deal">Создать сделку</button>' : `<span class="ai-deal-created">Сделка создана: ${aiEsc(item.dealTitle || item.dealId)}</span>`}
      <button class="primary" id="ai-mark-sent">Отметить отправленным</button>
    </div>
    <div class="ai-events"><div class="ai-events-title">История AI</div>${(item.events || []).slice(0, 12).map((event) => `<div><span>${aiEsc(event.type)}</span><small>${aiDate(event.at)}</small>${event.reason ? `<p>${aiEsc(event.reason)}</p>` : ""}</div>`).join("") || "<p>Пока нет действий.</p>"}</div>
  `, true);

  const draft = dialog.querySelector("#ai-draft");
  dialog.querySelector("#ai-save-draft").addEventListener("click", async () => {
    await aiApi(`/api/ai-manager/contacts/${encodeURIComponent(item.id)}`, { method: "PATCH", body: JSON.stringify({ draft: draft.value }) });
    aiToast("Черновик сохранён");
  });

  dialog.querySelectorAll("[data-ai-open]").forEach((button) => button.addEventListener("click", async () => {
    await aiApi(`/api/ai-manager/contacts/${encodeURIComponent(item.id)}`, { method: "PATCH", body: JSON.stringify({ draft: draft.value }) });
    const result = await aiApi(`/api/ai-manager/contacts/${encodeURIComponent(item.id)}/open?channel=${button.dataset.aiOpen}`);
    if (button.dataset.aiOpen === "telegram" && result.draft) {
      await navigator.clipboard?.writeText(result.draft).catch(() => {});
      aiToast("Текст скопирован — вставьте в Telegram");
    }
    if (result.url) window.open(result.url, "_blank", "noopener,noreferrer");
  }));

  dialog.querySelector("#ai-mark-sent").addEventListener("click", async () => {
    await aiApi(`/api/ai-manager/contacts/${encodeURIComponent(item.id)}`, { method: "PATCH", body: JSON.stringify({ draft: draft.value }) });
    await aiApi(`/api/ai-manager/contacts/${encodeURIComponent(item.id)}/manual-sent`, { method: "POST", body: JSON.stringify({ channel: item.phone ? "whatsapp" : "telegram" }) });
    aiToast("Касание записано");
    dialog.close();
    refreshParent?.();
  });

  dialog.querySelector("#ai-pause").addEventListener("click", async () => {
    await aiApi(`/api/ai-manager/contacts/${encodeURIComponent(item.id)}`, { method: "PATCH", body: JSON.stringify({ paused: !item.paused }) });
    dialog.close();
    refreshParent?.();
  });

  dialog.querySelector("#ai-make-deal")?.addEventListener("click", async () => {
    await aiApi(`/api/ai-manager/contacts/${encodeURIComponent(item.id)}/create-deal`, { method: "POST", body: JSON.stringify({}) });
    aiToast("Сделка добавлена в CRM");
    dialog.close();
    refreshParent?.();
  });
}

async function openAiManager() {
  const dialog = aiDialog(`<div class="ai-loading">Загружаю AI-менеджера…</div>`, true);

  async function render() {
    try {
      const data = await aiApi("/api/ai-manager/");
      const s = data.settings;
      dialog.querySelector(".ai-modal").innerHTML = `
        <div class="ai-head"><div><div class="ai-kicker">SATORI / AI SALES MANAGER</div><h2>Менеджер продаж</h2><p>Контакты парсера → диалог → квалификация → сделка</p></div><button data-ai-close>×</button></div>
        <div class="ai-control-card">
          <div><b>${s.configured ? "AI подключён" : "Нужен OPENAI_API_KEY"}</b><span>${aiEsc(s.model)} · ${aiEsc(s.businessHours)} · до ${s.dailyLimit} сообщений/день</span></div>
          <label class="ai-switch"><input id="ai-enabled" type="checkbox" ${s.enabled ? "checked" : ""}><span></span><em>Менеджер</em></label>
          <label class="ai-switch"><input id="ai-auto" type="checkbox" ${s.autoSend ? "checked" : ""}><span></span><em>Автоотправка</em></label>
          <button class="secondary" id="ai-run-now">Проверить сейчас</button>
        </div>
        ${!s.configured ? '<div class="ai-warning">Добавьте <code>OPENAI_API_KEY</code> в <code>.env</code> сервера. Без ключа контакты сохраняются, но AI не генерирует сообщения.</div>' : ""}
        ${s.autoSend && !s.whatsappColdAuto ? '<div class="ai-note">Холодный WhatsApp не будет отправляться автоматически, пока не задан одобренный <code>WHATSAPP_OUTREACH_TEMPLATE_NAME</code>. Черновики всё равно будут готовиться.</div>' : ""}
        <div class="ai-stats">${statCard("Всего", data.stats.total)}${statCard("Черновики", data.stats.draft)}${statCard("Ответили", data.stats.replied)}${statCard("Квалифицированы", data.stats.qualified)}${statCard("Сделки", data.stats.deal)}${statCard("Нужен человек", data.stats.human)}</div>
        <div class="ai-toolbar"><input id="ai-search" placeholder="Имя, компания, конкурент…"><select id="ai-filter"><option value="">Все статусы</option><option value="draft_ready">Черновик готов</option><option value="replied">Ответил</option><option value="qualified">Квалифицирован</option><option value="deal">Сделка</option><option value="human">Нужен человек</option><option value="stopped">Остановлен</option></select></div>
        <div class="ai-list" id="ai-list">${data.contacts.map(contactCard).join("") || '<div class="ai-empty">Контактов из парсера пока нет.</div>'}</div>
      `;
      dialog.querySelectorAll("[data-ai-close]").forEach((button) => button.addEventListener("click", () => dialog.close()));

      async function saveSettings() {
        await aiApi("/api/ai-manager/settings", { method: "PATCH", body: JSON.stringify({ enabled: dialog.querySelector("#ai-enabled").checked, autoSend: dialog.querySelector("#ai-auto").checked }) });
        aiToast("Настройки AI сохранены");
        render();
      }
      dialog.querySelector("#ai-enabled").addEventListener("change", saveSettings);
      dialog.querySelector("#ai-auto").addEventListener("change", saveSettings);
      dialog.querySelector("#ai-run-now").addEventListener("click", async () => {
        await aiApi("/api/ai-manager/run", { method: "POST", body: "{}" });
        aiToast("AI-менеджер запущен");
        setTimeout(render, 1200);
      });

      const search = dialog.querySelector("#ai-search");
      const filter = dialog.querySelector("#ai-filter");
      function filterCards() {
        const q = search.value.trim().toLowerCase();
        const status = filter.value;
        dialog.querySelectorAll("[data-ai-contact]").forEach((card) => {
          const item = data.contacts.find((x) => x.id === card.dataset.aiContact);
          const matchesText = !q || `${item?.name || ""} ${item?.company || ""} ${item?.role || ""} ${item?.competitor || ""} ${item?.summary || ""}`.toLowerCase().includes(q);
          const matchesStatus = !status || item?.status === status || item?.stage === status || (status === "deal" && item?.dealId);
          card.hidden = !(matchesText && matchesStatus);
        });
      }
      search.addEventListener("input", filterCards);
      filter.addEventListener("change", filterCards);
      dialog.querySelectorAll("[data-ai-contact]").forEach((card) => card.addEventListener("click", () => openAiContact(card.dataset.aiContact, render)));
    } catch (error) {
      dialog.querySelector(".ai-modal").innerHTML = `<div class="ai-head"><div><h2>AI-менеджер</h2></div><button data-ai-close>×</button></div><div class="ai-warning">${aiEsc(error.message)}</div>`;
      dialog.querySelector("[data-ai-close]").addEventListener("click", () => dialog.close());
    }
  }

  await render();
}

function ensureAiButton() {
  if (!aiToken() || document.querySelector("#crm-ai-manager-button")) return;
  const button = document.createElement("button");
  button.id = "crm-ai-manager-button";
  button.className = "ai-fab";
  button.innerHTML = `<span>✦</span> AI менеджер`;
  button.addEventListener("click", openAiManager);
  document.body.appendChild(button);
}

const aiObserver = new MutationObserver(ensureAiButton);
aiObserver.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener("storage", ensureAiButton);
setInterval(ensureAiButton, 1500);
ensureAiButton();
