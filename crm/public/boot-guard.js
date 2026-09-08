const APP_ID = "app";
const TOKEN_KEY = "satori_crm_token";

function recoveryScreen(message = "CRM не смогла загрузить основную панель") {
  const root = document.getElementById(APP_ID);
  if (!root || root.children.length) return;
  root.innerHTML = `
    <div class="login">
      <div class="login-card">
        <div class="brand">SATORI</div>
        <div class="eyebrow">LAB / CRM</div>
        <h1>Не удалось загрузить CRM</h1>
        <p>${String(message).replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}</p>
        <button class="primary" id="crm-retry">Обновить</button>
        <button class="secondary" id="crm-reset-session" style="width:100%;margin-top:10px">Войти заново</button>
      </div>
    </div>`;
  document.getElementById("crm-retry")?.addEventListener("click", () => location.reload());
  document.getElementById("crm-reset-session")?.addEventListener("click", () => {
    localStorage.removeItem(TOKEN_KEY);
    location.reload();
  });
}

window.addEventListener("error", (event) => {
  if (!document.getElementById(APP_ID)?.children.length) recoveryScreen(event.message || "Ошибка JavaScript");
});
window.addEventListener("unhandledrejection", (event) => {
  if (!document.getElementById(APP_ID)?.children.length) recoveryScreen(event.reason?.message || "Ошибка загрузки данных");
});

setTimeout(() => {
  if (!document.getElementById(APP_ID)?.children.length) recoveryScreen("Сервер CRM не ответил вовремя. Попробуйте обновить страницу или войти заново.");
}, 7000);
