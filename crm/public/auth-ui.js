const AUTH_TOKEN_KEY = "satori_crm_token";

function loginVisible() {
  return Boolean(document.querySelector("#login-form"));
}

function showLoginMessage(text) {
  const form = document.querySelector("#login-form");
  if (!form) return;
  let error = form.querySelector(".error");
  if (!error) {
    error = document.createElement("div");
    error.className = "error";
    const button = form.querySelector("button.primary");
    if (button) form.insertBefore(error, button);
    else form.appendChild(error);
  }
  error.textContent = text;
}

async function directLogin(form) {
  const input = form.querySelector('input[name="password"]');
  const button = form.querySelector("button.primary");
  const password = String(input?.value || "").trim();
  if (!password) {
    showLoginMessage("Введите пароль");
    input?.focus();
    return;
  }

  if (button) {
    button.disabled = true;
    button.textContent = "Входим…";
  }

  try {
    const loginResponse = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
      cache: "no-store",
    });
    const loginPayload = await loginResponse.json().catch(() => ({}));
    if (!loginResponse.ok) throw new Error(loginPayload.error || `Ошибка входа (${loginResponse.status})`);
    if (!loginPayload.token) throw new Error("Сервер не вернул сессию");

    const verify = await fetch("/api/bootstrap", {
      headers: { Authorization: `Bearer ${loginPayload.token}` },
      cache: "no-store",
    });
    if (!verify.ok) throw new Error(`Сессия не подтвердилась (${verify.status})`);

    localStorage.setItem(AUTH_TOKEN_KEY, loginPayload.token);
    location.reload();
  } catch (error) {
    showLoginMessage(error?.message || "Не удалось войти");
    if (button) {
      button.disabled = false;
      button.textContent = "Войти";
    }
  }
}

function enhanceLogin() {
  const form = document.querySelector("#login-form");
  if (!form || form.dataset.authEnhanced) return;
  form.dataset.authEnhanced = "1";
  form.noValidate = true;

  const input = form.querySelector('input[name="password"]');
  input?.removeAttribute("required");
  input?.addEventListener("input", () => {
    const error = form.querySelector(".error");
    if (error) error.remove();
  });

  // Capture the submit before the legacy app handler so only one request runs.
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    directLogin(form);
  }, true);
}

function syncAuthUi() {
  enhanceLogin();
  document.documentElement.classList.toggle("crm-login-visible", loginVisible() || !localStorage.getItem(AUTH_TOKEN_KEY));
}

// Do not remove/recreate floating controls here: other CRM modules own them.
// We only toggle a CSS state, avoiding a MutationObserver feedback loop.
const authObserver = new MutationObserver(() => queueMicrotask(syncAuthUi));
authObserver.observe(document.querySelector("#app") || document.body, { childList: true, subtree: true });
window.addEventListener("storage", syncAuthUi);
window.addEventListener("pageshow", syncAuthUi);
syncAuthUi();
