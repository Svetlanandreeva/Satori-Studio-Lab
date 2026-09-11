const DESIGNERS_PATH = "/designers";
const STYLE_ID = "satori-designer-readability-styles";

function cleanPath() {
  const path = window.location.pathname;
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    body.satori-designers-readable .satori-designers-hero {
      max-width: 1240px !important;
      padding-top: 58px !important;
    }
    body.satori-designers-readable .satori-designers-eyebrow {
      color: #756c61 !important;
      font-size: 10px !important;
      line-height: 1.4 !important;
      letter-spacing: .24em !important;
      margin-bottom: 14px !important;
    }
    body.satori-designers-readable .satori-designers-title {
      max-width: 920px !important;
      margin: 0 0 20px !important;
      font-size: clamp(38px, 3.5vw, 56px) !important;
      line-height: 1.04 !important;
      letter-spacing: -0.035em !important;
      text-wrap: balance;
    }
    body.satori-designers-readable .satori-designers-lead {
      max-width: 780px !important;
      margin-bottom: 40px !important;
      color: #5f574e !important;
      font-size: 15px !important;
      line-height: 1.65 !important;
      font-weight: 400 !important;
    }
    body.satori-designers-readable .satori-pro-wrap {
      max-width: 1180px;
      margin-top: 0 !important;
    }
    body.satori-designers-readable .satori-pro-grid {
      gap: 16px !important;
    }
    body.satori-designers-readable .satori-pro-card {
      padding: 26px !important;
      min-height: 0 !important;
      border-color: rgba(48, 38, 28, .12) !important;
    }
    body.satori-designers-readable .satori-pro-kicker {
      color: #756c61 !important;
      font-size: 10px !important;
      line-height: 1.35 !important;
      letter-spacing: .14em !important;
      margin-bottom: 12px !important;
    }
    body.satori-designers-readable .satori-pro-card--dark .satori-pro-kicker {
      color: #c0b6ab !important;
    }
    body.satori-designers-readable .satori-pro-title {
      font-size: 22px !important;
      line-height: 1.2 !important;
      letter-spacing: -0.015em !important;
      margin-bottom: 12px !important;
    }
    body.satori-designers-readable .satori-pro-copy {
      color: #5f574e !important;
      font-size: 13.5px !important;
      line-height: 1.65 !important;
    }
    body.satori-designers-readable .satori-pro-card--dark .satori-pro-copy {
      color: #c8beb4 !important;
    }
    body.satori-designers-readable .satori-pro-pill {
      font-size: 10.5px !important;
      padding: 7px 11px !important;
    }
    body.satori-designers-readable .satori-pro-step {
      padding: 20px !important;
    }
    body.satori-designers-readable .satori-pro-step-t {
      font-size: 14px !important;
      line-height: 1.35 !important;
    }
    body.satori-designers-readable .satori-pro-step-d {
      color: #625a50 !important;
      font-size: 12px !important;
      line-height: 1.6 !important;
    }
    @media (max-width: 767px) {
      body.satori-designers-readable .satori-designers-hero {
        padding-top: 36px !important;
      }
      body.satori-designers-readable .satori-designers-title {
        max-width: 100% !important;
        font-size: clamp(34px, 10vw, 44px) !important;
        line-height: 1.02 !important;
      }
      body.satori-designers-readable .satori-designers-lead {
        font-size: 14px !important;
        margin-bottom: 30px !important;
      }
      body.satori-designers-readable .satori-pro-card {
        padding: 22px !important;
      }
    }
  `;
  document.head.appendChild(style);
}

function apply() {
  if (cleanPath() !== DESIGNERS_PATH) {
    document.body.classList.remove("satori-designers-readable");
    return;
  }

  ensureStyles();
  document.body.classList.add("satori-designers-readable");

  const heading = Array.from(document.querySelectorAll<HTMLHeadingElement>("h1")).find((el) =>
    (el.textContent || "").toLowerCase().includes("дизайнер"),
  );
  if (!heading) return;

  heading.textContent = "Производство для дизайнеров и архитекторов";
  heading.classList.add("satori-designers-title");

  const container = heading.parentElement;
  if (container) container.classList.add("satori-designers-hero");

  const eyebrow = heading.previousElementSibling as HTMLElement | null;
  if (eyebrow?.tagName === "P") eyebrow.classList.add("satori-designers-eyebrow");

  const lead = heading.nextElementSibling as HTMLParagraphElement | null;
  if (lead?.tagName === "P") {
    lead.textContent = "Подбираем, адаптируем и производим мебель, свет, декор и нестандартные объекты по вашему проекту. Собственная мастерская и проверенные производства в России и Китае — от референса до готовой поставки.";
    lead.classList.add("satori-designers-lead");
  }
}

export function startDesignerReadability() {
  if (window.location.pathname.startsWith("/admin")) return;
  apply();

  const root = document.getElementById("root");
  if (!root) return;

  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      apply();
    });
  });
  observer.observe(root, { childList: true, subtree: true });
  window.addEventListener("popstate", apply);
  window.addEventListener("satori-route-change", apply);
}
