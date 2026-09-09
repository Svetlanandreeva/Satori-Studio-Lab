const NAV_LABELS = [
  "каталог", "лимит. серия", "о студии", "на заказ", "бизнесу", "faq",
  "смотреть коллекцию", "новинки", "создать под заказ", "для дизайнеров и бизнеса",
  "смотреть всё", "смотреть все", "подробнее",
  "обсудить объект", "перейти в каталог", "лимитированная серия"
];

function norm(value: string | null | undefined) {
  return (value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function isInternalLink(el: HTMLAnchorElement) {
  const href = el.getAttribute("href") || "";
  if (!href || href.startsWith("#")) return false;
  if (href.startsWith("/")) return true;
  try {
    const url = new URL(href, window.location.href);
    return url.origin === window.location.origin;
  } catch {
    return false;
  }
}

function isNavigationTarget(target: EventTarget | null) {
  const el = target instanceof Element ? target.closest("a,button") : null;
  if (!el) return false;
  if (el instanceof HTMLAnchorElement && isInternalLink(el)) return true;
  const text = norm(el.textContent);
  return NAV_LABELS.some((label) => text === label || text.startsWith(label + " "));
}

function ensureLayer() {
  let layer = document.getElementById("satori-page-transition-layer");
  if (!layer) {
    layer = document.createElement("div");
    layer.id = "satori-page-transition-layer";
    layer.setAttribute("aria-hidden", "true");
    document.body.appendChild(layer);
  }
  return layer;
}

function runPageTransition() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const layer = ensureLayer();
  layer.classList.remove("is-active", "is-leaving");
  void layer.offsetWidth;
  layer.classList.add("is-active");
  document.documentElement.classList.add("satori-page-is-changing");

  window.setTimeout(() => {
    layer.classList.add("is-leaving");
    document.documentElement.classList.remove("satori-page-is-changing");
  }, 190);
  window.setTimeout(() => {
    layer.classList.remove("is-active", "is-leaving");
  }, 620);
}

let revealObserver: IntersectionObserver | null = null;

function isHomePage() {
  const root = document.getElementById("root");
  if (!root) return false;
  const text = root.textContent || "";
  return text.includes("Предметы, которые создают атмосферу") && text.includes("Смотреть коллекцию");
}

function setupHomeReveals() {
  if (!isHomePage()) return;
  const root = document.getElementById("root");
  if (!root) return;

  if (!revealObserver) {
    revealObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const el = entry.target as HTMLElement;
        el.classList.add("is-visible");
        revealObserver?.unobserve(el);
      }
    }, { threshold: 0.08, rootMargin: "0px 0px -7% 0px" });
  }

  const candidates = Array.from(root.querySelectorAll<HTMLElement>("main section, main > div > section, footer"));
  candidates.forEach((el, index) => {
    if (el.dataset.satoriReveal === "1") return;
    // Hero already has its own media motion; keep it immediately visible.
    if (index === 0 && el.textContent?.includes("Предметы, которые создают атмосферу")) return;
    el.dataset.satoriReveal = "1";
    el.classList.add("satori-home-reveal");
    revealObserver?.observe(el);
  });
}

export function startPageTransitions() {
  if (window.location.pathname.startsWith("/admin")) return;
  ensureLayer();
  setupHomeReveals();

  document.addEventListener("click", (event) => {
    if (isNavigationTarget(event.target)) runPageTransition();
  }, true);

  const root = document.getElementById("root");
  if (!root) return;
  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      setupHomeReveals();
    });
  });
  observer.observe(root, { childList: true, subtree: true });
}
