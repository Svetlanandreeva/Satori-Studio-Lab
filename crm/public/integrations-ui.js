const TOKEN_KEY = "satori_crm_token";
const token = () => localStorage.getItem(TOKEN_KEY) || "";

async function channelApi(url, options = {}) {
  const headers = {
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
    ...(options.headers || {}),
  };
  const response = await fetch(url, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Ошибка интеграции");
  return data;
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function notify(text) {
  const el = document.createElement("div");
  el.className = "channel-toast";
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

function openDialog(html) {
  const dialog = document.createElement("dialog");
  dialog.className = "channel-dialog";
  dialog.innerHTML = `<div class="channel-modal">${html}</div>`;
  document.body.appendChild(dialog);
  dialog.addEventListener("close", () => dialog.remove());
  dialog.querySelectorAll("[data-channel-close]").forEach((button) => button.addEventListener("click", () => dialog.close()));
  dialog.showModal();
  return dialog;
}

function templateText(kind, name) {
  const client = name || "";
  if (kind === "estimate") return `Здравствуйте${client ? `, ${client}` : ""}! Это Satori. Расчёт по вашему проекту готов. Могу отправить детали и обсудить следующие шаги.`;
  if (kind === "ready") return `Здравствуйте${client ? `, ${client}` : ""}! Ваш заказ Satori готов. Давайте согласуем удобный способ и время получения / доставки.`;
  return `Здравствуйте${client ? `, ${client}` : ""}! Это Satori. Спасибо за обращение. Я посмотрела вашу заявку и готова уточнить детали проекта.`;
}

async function loadHistory(phone, telegram) {
  try {
    const params = new URLSearchParams();
    if (phone) params.set("phone", phone);
    if (telegram) params.set("telegram", telegram);
    return await channelApi(`/api/integrations/history?${params}`);
  } catch {
    return [];
  }
}

function historyHtml(items) {
  if (!items.length) return `<div class="channel-history-empty">Переписки через CRM пока нет.</div>`;
  return items.slice(0, 12).map((item) => {
    const base = item.channel === "whatsapp" ? "WhatsApp" : "Telegram";
    const provider = item.provider === "wazzup" ? " · Wazzup" : "";
    return `<div class="channel-history-item ${item.direction === "outbound" ? "out" : "in"}">
      <div><b>${base}${provider}</b><span>${item.direction === "outbound" ? "исходящее" : "входящее"}</span></div>
      <p>${escapeHtml(item.text || "(сообщение без текста)")}</p>
      <small>${item.createdAt ? new Date(item.createdAt).toLocaleString("ru-RU") : ""}</small>
    </div>`;
  }).join("");
}

async function openComposer({ channel, name, phone, telegram }) {
  const label = channel === "whatsapp" ? "WhatsApp" : "Telegram";
  const history = await loadHistory(phone, telegram);
  const dialog = openDialog(`
    <div class="channel-head"><div><div class="channel-kicker">SATORI / ${label.toUpperCase()}</div><h2>Сообщение клиенту</h2><p>${escapeHtml(name || phone || telegram || "Клиент")}</p></div><button data-channel-close>×</button></div>
    <div class="channel-templates">
      <button type="button" data-template="hello">Первичный ответ</button>
      <button type="button" data-template="estimate">Расчёт готов</button>
      <button type="button" data-template="ready">Заказ готов</button>
    </div>
    <form id="channel-send-form">
      <textarea name="text" rows="6" required>${escapeHtml(templateText("hello", name))}</textarea>
      <div class="channel-send-actions"><button type="button" class="secondary" data-channel-close>Отмена</button><button class="primary">Отправить в ${label}</button></div>
    </form>
    <div class="channel-history"><div class="channel-history-title">История</div>${historyHtml(history)}</div>
  `);

  const textarea = dialog.querySelector('textarea[name="text"]');
  dialog.querySelectorAll("[data-template]").forEach((button) => button.addEventListener("click", () => {
    textarea.value = templateText(button.dataset.template, name);
    textarea.focus();
  }));

  dialog.querySelector("#channel-send-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = event.submitter;
    submit.disabled = true;
    try {
      const result = await channelApi("/api/integrations/message", {
        method: "POST",
        body: JSON.stringify({ channel, name, phone, telegram, text: textarea.value }),
      });
      if (result.mode === "open" && result.url) {
        if (channel === "telegram") {
          await navigator.clipboard?.writeText(textarea.value).catch(() => {});
          notify("Текст скопирован — вставьте его в Telegram");
        }
        window.open(result.url, "_blank", "noopener,noreferrer");
      } else {
        notify(`Сообщение отправлено в ${label}${result.provider === "wazzup" ? " через Wazzup" : ""}`);
      }
      dialog.close();
    } catch (error) {
      notify(error.message);
    } finally {
      submit.disabled = false;
    }
  });
}

function getClientData(dialog) {
  const name = dialog.querySelector('input[name="name"]')?.value || dialog.querySelector("h2")?.textContent || "";
  const phone = dialog.querySelector('input[name="phone"]')?.value || "";
  const contact = dialog.querySelector('input[name="contact"]')?.value || "";
  const telegram = /(?:@|t\.me\/|^-?\d+$)/i.test(contact.trim()) ? contact.trim() : "";
  return { name: name.trim(), phone: phone.trim(), telegram };
}

function enhanceClientDialog(dialog) {
  if (dialog.dataset.channelEnhanced) return;
  if (!dialog.querySelector('input[name="phone"]') && !dialog.querySelector('input[name="contact"]')) return;
  dialog.dataset.channelEnhanced = "1";
  const modal = dialog.querySelector(".modal") || dialog.firstElementChild;
  const form = dialog.querySelector("form");
  if (!modal || !form) return;

  const actions = document.createElement("div");
  actions.className = "channel-client-actions";
  actions.innerHTML = `<button type="button" class="channel-wa">WhatsApp</button><button type="button" class="channel-tg">Telegram</button>`;
  form.parentNode.insertBefore(actions, form);

  actions.querySelector(".channel-wa").addEventListener("click", () => {
    const client = getClientData(dialog);
    if (!client.phone) return notify("У клиента не указан телефон");
    openComposer({ channel: "whatsapp", ...client });
  });
  actions.querySelector(".channel-tg").addEventListener("click", () => {
    const client = getClientData(dialog);
    if (!client.telegram) return notify("Укажите Telegram клиента в поле «Контакт»");
    openComposer({ channel: "telegram", ...client });
  });
}

function wazzupChannelsHtml(wz) {
  if (!wz?.configured) return `<small>Добавьте новый API-ключ Wazzup в <code>.env</code> на сервере.</small>`;
  if (wz.error) return `<small>${escapeHtml(wz.error)}</small>`;
  const channels = Array.isArray(wz.channels) ? wz.channels : [];
  if (!channels.length) return `<small>Ключ подключён, но каналов пока не найдено.</small>`;
  return `<small>${channels.map((item) => `${escapeHtml(item.transport)}: ${escapeHtml(item.plainId || item.channelId)} · ${escapeHtml(item.state)}`).join("<br>")}</small>`;
}

async function openIntegrationStatus() {
  let status;
  try { status = await channelApi("/api/integrations/status"); }
  catch (error) { return notify(error.message); }
  const wz = status.wazzup || {};
  const wa = status.whatsapp;
  const tg = status.telegram;
  const dialog = openDialog(`
    <div class="channel-head"><div><div class="channel-kicker">SATORI / CHANNELS</div><h2>Интеграции</h2><p>Wazzup, WhatsApp и Telegram</p></div><button data-channel-close>×</button></div>
    <div class="channel-status-grid">
      <section><div class="channel-status-icon">WZ</div><div><b>Wazzup</b><span>${wz.configured ? `${Number(wz.active || 0)} активных каналов` : "Не подключён"}</span>${wazzupChannelsHtml(wz)}</div></section>
      <section><div class="channel-status-icon">WA</div><div><b>WhatsApp</b><span>${wz.configured ? "Через Wazzup" : wa.configured ? "Cloud API подключён" : "Переход в WhatsApp"}</span><small>${wz.configured ? "Wazzup используется как основной транспорт" : wa.configured ? `Meta Graph ${escapeHtml(wa.graphVersion)}` : "Для прямой отправки добавьте ключи Meta"}</small></div></section>
      <section><div class="channel-status-icon">TG</div><div><b>Telegram</b><span>${wz.configured ? "Через Wazzup при наличии канала" : tg.configured ? "Bot API подключён" : "Переход в Telegram"}</span><small>${tg.ownerNotifications ? "Служебные уведомления владельцу включены" : "Служебные уведомления владельцу пока не настроены"}</small></div></section>
    </div>
    <div class="channel-send-actions">
      ${wz.configured ? '<button class="primary" id="setup-wazzup-webhook">Подключить webhook Wazzup</button>' : ""}
      ${tg.ownerNotifications ? '<button class="secondary" id="test-owner-tg">Тест Telegram</button>' : ""}
    </div>
    <div class="channel-note">Ключи хранятся только в <code>.env</code> на сервере и никогда не показываются в CRM. Входящие Wazzup попадают в историю клиента и доступны AI-менеджеру.</div>
  `);
  dialog.querySelector("#setup-wazzup-webhook")?.addEventListener("click", async (event) => {
    event.currentTarget.disabled = true;
    try {
      await channelApi("/api/integrations/wazzup/setup-webhook", { method: "POST", body: "{}" });
      notify("Webhook Wazzup подключён");
    } catch (error) { notify(error.message); }
    finally { event.currentTarget.disabled = false; }
  });
  dialog.querySelector("#test-owner-tg")?.addEventListener("click", async (event) => {
    event.currentTarget.disabled = true;
    try { await channelApi("/api/integrations/test-owner-telegram", { method: "POST", body: "{}" }); notify("Тест отправлен в Telegram"); }
    catch (error) { notify(error.message); }
    finally { event.currentTarget.disabled = false; }
  });
}

function ensureIntegrationButton() {
  if (document.querySelector("#crm-integrations-button")) return;
  if (!token()) return;
  const button = document.createElement("button");
  button.id = "crm-integrations-button";
  button.className = "channel-fab";
  button.innerHTML = `<span>●</span> Связь`;
  button.addEventListener("click", openIntegrationStatus);
  document.body.appendChild(button);
}

const observer = new MutationObserver(() => {
  document.querySelectorAll("dialog").forEach(enhanceClientDialog);
  ensureIntegrationButton();
});
observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener("storage", ensureIntegrationButton);
setInterval(ensureIntegrationButton, 1500);
ensureIntegrationButton();
