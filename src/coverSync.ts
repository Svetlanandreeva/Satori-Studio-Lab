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
  const i = url.indexOf(marker);
  if (i < 0) return null;
  const slot = Number(url.slice(i + marker.length));
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

function setStyleIfDifferent(el: HTMLElement, property: string, value: string) {
  if (el.style.getPropertyValue(property) !== value) {
    el.style.setProperty(property, value);
  }
}

function applyHome(urls: Array<string | null>) {
  const section = findFeatureStrip();
  if (!section) return;
  const grid = section.firstElementChild as HTMLElement | null;
  const cards = grid ? Array.from(grid.children).filter((el): el is HTMLElement => el instanceof HTMLElement) : [];

  cards.slice(0, HOME_COUNT).forEach((card, slot) => {
    const url = urls[slot];
    if (!url) {
      if (card.dataset.satoriFreshCover === "1") {
        card.style.removeProperty("background-image");
        card.style.removeProperty("background-size");
        card.style.removeProperty("background-position");
        card.style.removeProperty("background-repeat");
        delete card.dataset.satoriFreshCover;
        card.classList.remove("satori-home-feature-has-cover");
      }
      return;
    }

    const safeUrl = url.replace(/"/g, "%22");
    const backgroundImage = `linear-gradient(180deg, rgba(20,15,12,.16) 0%, rgba(20,15,12,.70) 100%), url("${safeUrl}")`;

    // These cards are rendered by React with an inline `background` shorthand.
    // A later React render (for example when scroll-reveal becomes visible)
    // can overwrite background-image. Keep this operation idempotent so the
    // style observer below can safely restore the cover without causing a loop.
    setStyleIfDifferent(card, "background-image", backgroundImage);
    setStyleIfDifferent(card, "background-size", "cover");
    setStyleIfDifferent(card, "background-position", "center");
    setStyleIfDifferent(card, "background-repeat", "no-repeat");

    card.dataset.satoriFreshCover = "1";
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

    // Avoid removing/reinserting the same image on every sync; doing so would
    // retrigger the MutationObserver continuously.
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

  const observer = new MutationObserver(() => schedule(false));
  observer.observe(root, {
    childList: true,
    subtree: true,
    // React can replace the cards' inline background shorthand without adding
    // or removing DOM nodes. Watching style changes lets us restore uploaded
    // covers immediately after such rerenders.
    attributes: true,
    attributeFilter: ["style"],
  });

  window.addEventListener("pageshow", () => schedule(true));
  window.addEventListener("focus", () => schedule(true));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") schedule(true);
  });

  // Keep an already-open desktop/tablet page in sync with changes made from
  // the mobile admin without requiring a hard refresh.
  window.setInterval(() => {
    if (document.visibilityState === "visible") schedule(true);
  }, 30000);

  schedule(true);
}
