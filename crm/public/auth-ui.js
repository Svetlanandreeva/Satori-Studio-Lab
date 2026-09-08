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

function enhanceLogin() {
  const form = document.querySelector("#login-form");
  if (!form || form.dataset.authEnhanced) return;
  form.dataset.authEnhanced = "1";
  form.noValidate = true;

  const input = form.querySelector('input[name="password"]');
  input?.removeAttribute("required");
  input?.addEventListener("input", () => {
    const error = form.querySelector(".error");
    if (error?.textContent === "Введите пароль") error.remove();
  });

  form.addEventListener("submit", (event) => {
    const password = String(input?.value || "").trim();
    if (password) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    showLoginMessage("Введите пароль");
    input?.focus();
  }, true);
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
