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
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const loginResponse = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const loginPayload = await loginResponse.json().catch(() => ({}));
    if (!loginResponse.ok) throw new Error(loginPayload.error || `Ошибка входа (${loginResponse.status})`);
    if (!loginPayload.token) throw new Error("Сервер не вернул сессию");

    const verifyController = new AbortController();
    const verifyTimeout = setTimeout(() => verifyController.abort(), 12000);
    const verify = await fetch("/api/bootstrap", {
      headers: { Authorization: `Bearer ${loginPayload.token}` },
      cache: "no-store",
      signal: verifyController.signal,
    });
    clearTimeout(verifyTimeout);
    if (!verify.ok) throw new Error(`Сессия не подтвердилась (${verify.status})`);

    localStorage.setItem(AUTH_TOKEN_KEY, loginPayload.token);
    document.documentElement.classList.remove("crm-login-visible");
    location.replace(location.pathname + location.search);
  } catch (error) {
    const message = error?.name === "AbortError" ? "Сервер долго не отвечает. Попробуйте ещё раз." : (error?.message || "Не удалось войти");
    showLoginMessage(message);
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

const appRoot = document.querySelector("#app");
if (appRoot) {
  const authObserver = new MutationObserver(() => queueMicrotask(syncAuthUi));
  authObserver.observe(appRoot, { childList: true, subtree: true });
}
window.addEventListener("storage", syncAuthUi);
window.addEventListener("pageshow", syncAuthUi);
syncAuthUi();
