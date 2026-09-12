const TELEGRAM_URL = "https://t.me/Satori_Lab_Ural";

function trackTelegram() {
  try { (window as any).ym?.(110458266, "reachGoal", "telegram_click"); } catch {}
}

function ensureStyles() {
  if (document.getElementById("satori-header-contact-styles")) return;
  const style = document.createElement("style");
  style.id = "satori-header-contact-styles";
  style.textContent = `
    .satori-header-contact {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 38px;
      padding: 0 18px;
      border-radius: 999px;
      background: #181411;
      color: #F4EEE6;
      text-decoration: none;
      white-space: nowrap;
      font: 600 12px/1 Inter, sans-serif;
      letter-spacing: .01em;
      transition: transform .18s ease, background-color .18s ease, opacity .18s ease;
      box-shadow: 0 1px 0 rgba(255,255,255,.08) inset;
    }
    .satori-header-contact:hover { background: #2A231E; }
    .satori-header-contact:active { transform: scale(.97); }

    @media (max-width: 767px) {
      .satori-header-contact {
        min-height: 34px;
        padding: 0 12px;
        font-size: 10px;
      }
    }

    @media (max-width: 390px) {
      .satori-header-contact {
        min-height: 32px;
        padding: 0 10px;
        font-size: 9px;
      }
    }
  `;
  document.head.appendChild(style);
}

function ensureButton() {
  const header = document.querySelector<HTMLElement>("header");
  if (!header) return;

  const cartButton = Array.from(header.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
    (button.getAttribute("aria-label") || "").startsWith("Корзина"),
  );
  if (!cartButton?.parentElement) return;

  let link = header.querySelector<HTMLAnchorElement>(".satori-header-contact");
  if (!link) {
    link = document.createElement("a");
    link.className = "satori-header-contact";
    link.href = TELEGRAM_URL;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Связаться";
    link.setAttribute("aria-label", "Связаться с SATORI в Telegram");
    link.addEventListener("click", trackTelegram);
  }

  if (link.parentElement !== cartButton.parentElement || link.nextElementSibling !== cartButton) {
    cartButton.parentElement.insertBefore(link, cartButton);
  }
}

function patch() {
  ensureStyles();
  ensureButton();
}

export function startHeaderContactButton() {
  patch();

  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      patch();
    });
  };

  const observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-label"] });
  window.addEventListener("satori-route-change", schedule);
  window.addEventListener("popstate", schedule);
}
