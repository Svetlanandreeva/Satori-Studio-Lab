const ROUTES: Record<string, string> = {
  catalog: "/catalog",
  limited: "/limited",
  about: "/about",
  custom: "/custom",
  business: "/business",
  faq: "/faq",
  delivery: "/delivery",
};

const ROUTE_LABELS: Record<string, string[]> = {
  "/catalog": ["Каталог"],
  "/limited": ["Лимит. серия", "Лимитированная серия"],
  "/about": ["О студии"],
  "/custom": ["На заказ"],
  "/business": ["Бизнесу"],
  "/faq": ["FAQ"],
  "/delivery": ["Доставка и оплата", "Доставка"],
};

function norm(value: string | null | undefined) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function cleanPath(pathname = window.location.pathname) {
  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.slice(0, -1);
  return pathname;
}

function findButton(labels: string[]) {
  const wanted = labels.map((label) => label.toLowerCase());
  return Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((button) => {
    const text = norm(button.textContent).toLowerCase();
    return wanted.includes(text);
  });
}

function pushRoute(path: string, replace = false) {
  const current = cleanPath();
  if (current === path) return;
  if (replace) history.replaceState({}, "", path);
  else history.pushState({}, "", path);
  window.dispatchEvent(new Event("satori-route-change"));
}

/**
 * Product pages historically used ?p=ID. Keep that query for App.tsx so the
 * existing product loader works, while exposing a clean /product/ID URL to
 * people and search engines.
 */
export function prepareSeoRoute() {
  const match = cleanPath().match(/^\/product\/(\d+)$/);
  if (!match) return;
  const params = new URLSearchParams(window.location.search);
  if (!params.has("p")) {
    params.set("p", match[1]);
    history.replaceState({}, "", `${cleanPath()}?${params.toString()}${window.location.hash}`);
  }
}

function routeToCurrentPage() {
  const path = cleanPath();
  const labels = ROUTE_LABELS[path];
  if (!labels) return;

  let attempts = 0;
  const open = () => {
    const target = findButton(labels);
    if (target) {
      target.click();
      return;
    }
    if (++attempts < 30) window.setTimeout(open, 60);
  };
  window.setTimeout(open, 0);
}

function enhanceHero() {
  const heading = Array.from(document.querySelectorAll<HTMLElement>("h1,h2")).find(
    (el) => norm(el.textContent) === "Предметы, которые создают атмосферу",
  );
  if (!heading) return;

  const hero = heading.closest("section");
  if (!hero || hero.getAttribute("data-satori-sales-hero") === "1") return;
  hero.setAttribute("data-satori-sales-hero", "1");

  const paragraphs = Array.from(hero.querySelectorAll<HTMLParagraphElement>("p"));
  const subcopy = paragraphs.find((p) => {
    const text = norm(p.textContent);
    return text.includes("Декор, светильники") || text.includes("созданы в нашей мастерской");
  });
  if (subcopy) {
    subcopy.textContent = "Авторский свет, декор, мебель и интерьерные объекты. Создаём под заказ и комплектуем проекты — от собственной мастерской до фабрик в России и Китае.";
    subcopy.style.maxWidth = "660px";
  }

  const collectionButton = Array.from(hero.querySelectorAll<HTMLButtonElement>("button")).find(
    (button) => norm(button.textContent) === "Смотреть коллекцию",
  );
  const secondButton = Array.from(hero.querySelectorAll<HTMLButtonElement>("button")).find(
    (button) => norm(button.textContent) === "Новинки",
  );

  if (collectionButton) collectionButton.dataset.satoriRoute = "/catalog";

  if (secondButton) {
    secondButton.textContent = "Создать под заказ";
    secondButton.dataset.satoriHeroCustom = "1";
    secondButton.dataset.satoriRoute = "/custom";
  }

  const buttonRow = collectionButton?.parentElement;
  if (buttonRow && !hero.querySelector("[data-satori-business-cta]")) {
    // Keep the third CTA inside the same desktop row instead of forcing it to
    // 100% width, which pushed it below the Hero crop. On small screens it can
    // wrap naturally beneath the two main actions without changing Hero width.
    buttonRow.style.alignItems = "center";
    buttonRow.style.rowGap = "8px";

    const business = document.createElement("button");
    business.type = "button";
    business.dataset.satoriBusinessCta = "1";
    business.dataset.satoriRoute = "/business";
    business.textContent = "Для дизайнеров и бизнеса →";
    business.style.width = "auto";
    business.style.flex = "0 0 auto";
    business.style.marginTop = "0";
    business.style.padding = "10px 4px";
    business.style.border = "0";
    business.style.background = "transparent";
    business.style.color = "rgba(236,230,223,.82)";
    business.style.fontFamily = "Inter, sans-serif";
    business.style.fontSize = "11px";
    business.style.lineHeight = "1.2";
    business.style.whiteSpace = "nowrap";
    business.style.textAlign = "left";
    business.style.cursor = "pointer";
    buttonRow.appendChild(business);
  }
}

function bindSemanticRoutes() {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("button"));
  for (const button of buttons) {
    if (button.dataset.satoriSemanticRouteBound === "1") continue;
    const text = norm(button.textContent).toLowerCase();
    let route: string | undefined;

    if (text === "каталог" || text === "смотреть коллекцию" || text === "смотреть всё" || text === "смотреть все" || text === "перейти в каталог") route = ROUTES.catalog;
    else if (text === "лимит. серия" || text === "лимитированная серия") route = ROUTES.limited;
    else if (text === "о студии") route = ROUTES.about;
    else if (text === "на заказ" || text === "обсудить объект" || text === "создать под заказ") route = ROUTES.custom;
    else if (text === "бизнесу" || text === "для дизайнеров и бизнеса →") route = ROUTES.business;
    else if (text === "faq") route = ROUTES.faq;

    if (!route) continue;
    button.dataset.satoriSemanticRouteBound = "1";
    button.dataset.satoriRoute = route;
  }
}

function handleNavigationClick(event: MouseEvent) {
  const target = event.target instanceof Element ? event.target.closest<HTMLElement>("button,a") : null;
  if (!target) return;

  const route = target.dataset.satoriRoute;
  if (!route) return;

  // The second Hero button used to open Catalog in React. Override that one
  // click and delegate to the real "На заказ" navigation button instead.
  if (target.dataset.satoriHeroCustom === "1" || target.dataset.satoriBusinessCta === "1") {
    event.preventDefault();
    event.stopPropagation();
    const labels = route === "/business" ? ROUTE_LABELS["/business"] : ROUTE_LABELS["/custom"];
    const destination = findButton(labels);
    if (destination && destination !== target) destination.click();
    pushRoute(route);
    return;
  }

  pushRoute(route);
}

function addCrawlableSectionLinks() {
  if (document.getElementById("satori-seo-section-links")) return;
  const footer = document.querySelector("footer");
  if (!footer) return;

  const nav = document.createElement("nav");
  nav.id = "satori-seo-section-links";
  nav.setAttribute("aria-label", "Разделы SATORI");
  nav.style.display = "flex";
  nav.style.flexWrap = "wrap";
  nav.style.gap = "10px 18px";
  nav.style.marginTop = "20px";
  nav.style.fontFamily = "Inter, sans-serif";
  nav.style.fontSize = "11px";
  nav.style.opacity = ".72";

  const links: Array<[string, string]> = [
    ["Каталог", "/catalog"],
    ["На заказ", "/custom"],
    ["Для бизнеса", "/business"],
    ["О студии", "/about"],
    ["FAQ", "/faq"],
  ];
  for (const [label, href] of links) {
    const link = document.createElement("a");
    link.href = href;
    link.textContent = label;
    link.style.color = "inherit";
    link.style.textDecoration = "none";
    nav.appendChild(link);
  }
  footer.appendChild(nav);
}

export function startSeoRoutes() {
  if (window.location.pathname.startsWith("/admin")) return;

  routeToCurrentPage();
  enhanceHero();
  bindSemanticRoutes();
  addCrawlableSectionLinks();

  document.addEventListener("click", handleNavigationClick, true);

  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      enhanceHero();
      bindSemanticRoutes();
      addCrawlableSectionLinks();
    });
  });
  const root = document.getElementById("root");
  if (root) observer.observe(root, { childList: true, subtree: true });

  window.addEventListener("popstate", () => window.location.reload());
}