type GalleryItem = { id?: string; url?: string };

type CoverSet = {
  home: Array<string | null>;
  inspiration: Array<string | null>;
};

const HOME_MARKER = "#home-cover-";
const INSP_MARKER = "#inspiration-cover-";
const HOME_COUNT = 3;
const INSP_COUNT = 4;

let cached: CoverSet | null = null;
let pending: Promise<CoverSet> | null = null;
let lastFetch = 0;
let scanTimer: number | null = null;

function parseSlot(url: string, marker: string, count: number) {
  // Accept both the raw fragment form we currently save and an encoded fragment
  // form in case a proxy/browser ever serialises # as %23.
  const candidates = [marker, marker.replace("#", "%23")];
  let i = -1;
  let matched = marker;
  for (const candidate of candidates) {
    i = url.indexOf(candidate);
    if (i >= 0) {
      matched = candidate;
      break;
    }
  }
  if (i < 0) return null;
  const slot = Number(url.slice(i + matched.length));
  if (!Number.isInteger(slot) || slot < 0 || slot >= count) return null;
  return { slot, baseUrl: url.slice(0, i) };
}

async function loadFresh(force = false): Promise<CoverSet> {
  const now = Date.now();
  if (!force && cached && now - lastFetch < 2000) return cached;
  if (pending) return pending;

  pending = fetch(`/api/gallery?covers=${now}`, { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : []))
    .catch(() => [])
    .then((items: GalleryItem[]) => {
      const home: Array<string | null> = Array(HOME_COUNT).fill(null);
      const inspiration: Array<string | null> = Array(INSP_COUNT).fill(null);

      for (const item of Array.isArray(items) ? items : []) {
        if (!item?.url) continue;

        const h = parseSlot(item.url, HOME_MARKER, HOME_COUNT);
        if (h && !home[h.slot]) home[h.slot] = h.baseUrl;

        const i = parseSlot(item.url, INSP_MARKER, INSP_COUNT);
        if (i && !inspiration[i.slot]) inspiration[i.slot] = i.baseUrl;
      }

      cached = { home, inspiration };
      lastFetch = Date.now();
      pending = null;
      return cached;
    });

  return pending;
}

function findFeatureStrip() {
  return Array.from(document.querySelectorAll<HTMLElement>("section")).find((section) =>
    section.textContent?.includes("Полный цикл создания от идеи до предмета") &&
    section.textContent?.includes("Материалы под задачу, форму и фактуру") &&
    section.textContent?.includes("Индивидуальные решения для ваших проектов"),
  ) ?? null;
}

function findInspirationSection() {
  return Array.from(document.querySelectorAll<HTMLElement>("section")).find((section) =>
    section.querySelector("h2")?.textContent?.includes("Вдохновение для вашего пространства"),
  ) ?? null;
}

function ensureCoverStyles() {
  if (document.getElementById("satori-live-cover-styles")) return;
  const style = document.createElement("style");
  style.id = "satori-live-cover-styles";
  style.textContent = `
    /* The three blocks under Hero have a React-owned inline background shorthand.
       Do not fight that shorthand. Draw the admin image in a separate pseudo layer
       above it, so React can rerender as often as it wants without erasing the cover. */
    [data-satori-fresh-cover="1"] {
      position: relative !important;
      overflow: hidden !important;
      isolation: isolate !important;
    }
    [data-satori-fresh-cover="1"]::before {
      content: "";
      position: absolute;
      inset: 0;
      z-index: 0;
      background-image: var(--satori-home-cover-image) !important;
      background-size: cover !important;
      background-position: center !important;
      background-repeat: no-repeat !important;
      pointer-events: none;
    }
    [data-satori-fresh-cover="1"]::after {
      content: "";
      position: absolute;
      inset: 0;
      z-index: 1;
      background: linear-gradient(180deg, rgba(20,15,12,.13) 0%, rgba(20,15,12,.72) 100%);
      pointer-events: none;
    }
    [data-satori-fresh-cover="1"] > * {
      position: relative !important;
      z-index: 2 !important;
    }
    [data-satori-fresh-cover="1"] p,
    [data-satori-fresh-cover="1"] h2,
    [data-satori-fresh-cover="1"] h3,
    [data-satori-fresh-cover="1"] span {
      color: #f3ece5 !important;
    }
  `;
  document.head.appendChild(style);
}

function applyHome(urls: Array<string | null>) {
  const section = findFeatureStrip();
  if (!section) return;
  const grid = section.firstElementChild as HTMLElement | null;
  const cards = grid ? Array.from(grid.children).filter((el): el is HTMLElement => el instanceof HTMLElement) : [];

  cards.slice(0, HOME_COUNT).forEach((card, slot) => {
    const url = urls[slot];
    if (!url) {
      card.removeAttribute("data-satori-fresh-cover");
      card.style.removeProperty("--satori-home-cover-image");
      card.classList.remove("satori-home-feature-has-cover");
      return;
    }

    const safeUrl = url.replace(/"/g, "%22");
    const coverValue = `url("${safeUrl}")`;
    if (card.style.getPropertyValue("--satori-home-cover-image") !== coverValue) {
      card.style.setProperty("--satori-home-cover-image", coverValue);
    }
    if (card.getAttribute("data-satori-fresh-cover") !== "1") {
      card.setAttribute("data-satori-fresh-cover", "1");
    }
    card.classList.add("satori-home-feature-has-cover");
  });
}

function applyInspiration(urls: Array<string | null>) {
  const section = findInspirationSection();
  if (!section) return;
  const grid = Array.from(section.children).find((el) => el instanceof HTMLElement && el.classList.contains("grid")) as HTMLElement | undefined;
  const cards = grid ? Array.from(grid.children).filter((el): el is HTMLButtonElement => el instanceof HTMLButtonElement) : [];

  cards.slice(0, INSP_COUNT).forEach((card, slot) => {
    const url = urls[slot];
    const current = card.querySelector<HTMLImageElement>(".satori-fresh-inspiration-cover");
    const nativeMedia = card.querySelectorAll<HTMLElement>(":scope > picture, :scope > img:not(.satori-inspiration-cover-image):not(.satori-fresh-inspiration-cover)");

    if (!url) {
      current?.remove();
      nativeMedia.forEach((media) => media.style.removeProperty("display"));
      return;
    }

    nativeMedia.forEach((media) => {
      if (media.style.getPropertyValue("display") !== "none" || media.style.getPropertyPriority("display") !== "important") {
        media.style.setProperty("display", "none", "important");
      }
    });
    card.querySelectorAll(".satori-inspiration-cover-image").forEach((el) => el.remove());

    if (current && current.getAttribute("src") === url) return;
    current?.remove();

    const img = document.createElement("img");
    img.src = url;
    img.alt = "";
    img.className = "satori-fresh-inspiration-cover";
    Object.assign(img.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      objectFit: "cover",
      display: "block",
      zIndex: "0",
    });
    card.insertBefore(img, card.firstChild);
  });
}

async function sync(force = false) {
  if (window.location.pathname.startsWith("/admin")) return;
  const covers = await loadFresh(force);
  applyHome(covers.home);
  applyInspiration(covers.inspiration);
}

function schedule(force = false) {
  if (scanTimer !== null) window.clearTimeout(scanTimer);
  scanTimer = window.setTimeout(() => {
    scanTimer = null;
    void sync(force);
  }, 60);
}

export function startCoverSync() {
  if (window.location.pathname.startsWith("/admin")) return;
  const root = document.getElementById("root");
  if (!root) return;

  ensureCoverStyles();

  const observer = new MutationObserver(() => schedule(false));
  observer.observe(root, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["style", "class"],
  });

  window.addEventListener("pageshow", () => schedule(true));
  window.addEventListener("focus", () => schedule(true));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") schedule(true);
  });

  window.setInterval(() => {
    if (document.visibilityState === "visible") schedule(true);
  }, 15000);

  schedule(true);
}
