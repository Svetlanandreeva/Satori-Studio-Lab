const AUTH_TOKEN_KEY = "satori_crm_token";
const FLOATING_CONTROLS = [
  "#crm-integrations-button",
  "#crm-ai-manager-button",
  "#crm-parser-history-button",
  ".channel-fab",
  ".ai-fab",
  ".parser-fab",
];

function loginVisible() {
  return Boolean(document.querySelector("#login-form"));
}

function removeFloatingControls() {
  document.querySelectorAll(FLOATING_CONTROLS.join(",")).forEach((el) => el.remove());
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

function clearLoginMessage() {
  document.querySelector("#login-form .error")?.remove();
}

async function performLogin(form, input, button) {
  const password = String(input?.value || "");
  if (!password.trim()) {
    showLoginMessage("Введите пароль");
    input?.focus();
    return;
  }

  clearLoginMessage();
  if (button) {
    button.disabled = true;
    button.dataset.originalText = button.textContent || "Войти";
    button.textContent = "Входим…";
  }

  try {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      cache: "no-store",
      credentials: "same-origin",
      body: JSON.stringify({ password }),
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.token) {
      throw new Error(data.error || `Не удалось войти (${response.status})`);
    }

    localStorage.setItem(AUTH_TOKEN_KEY, data.token);

    // Verify the new session before leaving the login screen. This catches
    // password/auth problems immediately instead of showing a blank CRM shell.
    const bootstrap = await fetch("/api/bootstrap", {
      headers: { Authorization: `Bearer ${data.token}`, "Cache-Control": "no-store" },
      cache: "no-store",
      credentials: "same-origin",
    });
    if (!bootstrap.ok) {
      localStorage.removeItem(AUTH_TOKEN_KEY);
      const payload = await bootstrap.json().catch(() => ({}));
      throw new Error(payload.error || `Сессия не подтвердилась (${bootstrap.status})`);
    }

    // Full reload deliberately avoids any stale module state left from the
    // previous invalid session on iOS Safari / Home Screen PWA.
    const url = new URL(window.location.href);
    url.searchParams.set("login", Date.now().toString());
    window.location.replace(url.toString());
  } catch (error) {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    showLoginMessage(error?.message || "Не удалось войти");
    input?.focus();
    if (button) {
      button.disabled = false;
      button.textContent = button.dataset.originalText || "Войти";
    }
  }
}

function enhanceLogin() {
  const form = document.querySelector("#login-form");
  if (!form || form.dataset.authEnhanced) return;
  form.dataset.authEnhanced = "1";
  form.noValidate = true;

  const input = form.querySelector('input[name="password"]');
  const button = form.querySelector("button.primary");
  input?.removeAttribute("required");
  button?.setAttribute("type", "submit");

  input?.addEventListener("input", clearLoginMessage);

  // Own the submit event completely. The original app handler remains as a
  // fallback in the bundle, but this capture handler prevents Safari/PWA race
  // conditions and performs the login request directly.
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    performLogin(form, input, event.submitter || button);
  }, true);

  button?.addEventListener("touchend", () => {
    // Do not submit here: Safari will emit click/submit after touchend. This
    // listener only ensures focus/keyboard state does not swallow the tap.
    input?.blur();
  }, { passive: true });
}

function syncAuthUi() {
  enhanceLogin();
  if (loginVisible() || !localStorage.getItem(AUTH_TOKEN_KEY)) removeFloatingControls();
}

const authObserver = new MutationObserver(syncAuthUi);
authObserver.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener("storage", syncAuthUi);
window.addEventListener("pageshow", syncAuthUi);
setInterval(syncAuthUi, 700);
syncAuthUi();
