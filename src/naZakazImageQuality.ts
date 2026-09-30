type ProductMedia = {
  img?: string;
  imgs?: string[];
};

type GalleryMedia = { url?: string };
type HeroMedia = { type?: string | null; url?: string | null; slides?: Array<{ type?: string; url?: string }> };

type PreferredMedia = {
  hero: string[];
  gallery: string[];
  products: string[];
};

const PAGE_PATHS = new Set(["/na-zakaz", "/custom"]);
let mediaPromise: Promise<PreferredMedia> | null = null;
let scheduled = false;

function cleanPath() {
  const path = window.location.pathname;
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

function uploadUrl(raw?: string | null) {
  if (!raw) return null;
  const clean = raw.split("#")[0].split("?")[0];
  const match = clean.match(/\/uploads\/[a-zA-Z0-9._-]+$/);
  return match ? match[0] : null;
}

function unique(values: Array<string | null>) {
  const seen = new Set<string>();
  return values.filter((value): value is string => {
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

async function fetchJson(url: string, fallback: unknown) {
  try {
    const response = await fetch(url, { cache: "no-store" });
    return response.ok ? response.json() : fallback;
  } catch {
    return fallback;
  }
}

async function getPreferredMedia() {
  if (mediaPromise) return mediaPromise;
  mediaPromise = Promise.all([
    fetchJson("/api/products", []),
    fetchJson("/api/gallery", []),
    fetchJson("/api/hero", {}),
  ]).then(([productsRaw, galleryRaw, heroRaw]) => {
    const products = (Array.isArray(productsRaw) ? productsRaw : []) as ProductMedia[];
    const gallery = (Array.isArray(galleryRaw) ? galleryRaw : []) as GalleryMedia[];
    const hero = (heroRaw || {}) as HeroMedia;

    const heroUrls = unique([
      hero.type === "image" ? uploadUrl(hero.url) : null,
      ...(hero.slides || []).filter((slide) => slide.type === "image").map((slide) => uploadUrl(slide.url)),
    ]);
    const galleryUrls = unique(gallery.map((item) => uploadUrl(item.url)));
    const productUrls = unique(products.flatMap((product) => [
      uploadUrl(product.img),
      ...(product.imgs || []).map(uploadUrl),
    ]));

    return { hero: heroUrls, gallery: galleryUrls, products: productUrls };
  });
  return mediaPromise;
}

function applyImage(image: HTMLImageElement, url: string) {
  if (!url || image.getAttribute("src") === url) return;
  image.src = url;
  image.removeAttribute("srcset");
  image.decoding = "async";
  image.style.imageRendering = "auto";
}

async function upgradeNaZakazImages() {
  if (!PAGE_PATHS.has(cleanPath())) return;
  const page = document.querySelector<HTMLElement>(".satori-nz-page");
  if (!page || page.dataset.satoriImageQuality === "2") return;

  const media = await getPreferredMedia();
  if (!page.isConnected || !PAGE_PATHS.has(cleanPath())) return;

  // The old custom page picked product thumbnails first and stretched them into a 1344px hero.
  // Prefer the site's dedicated hero originals, then gallery originals, and only then product media.
  const ordered = unique([...media.hero, ...media.gallery, ...media.products]);
  if (!ordered.length) return;

  const used = new Set<string>();
  const heroUrl = media.hero[0] || media.gallery[0] || media.products[0];
  const hero = page.querySelector<HTMLElement>(".satori-nz-hero");
  if (hero && heroUrl) {
    hero.style.setProperty("--satori-nz-hero", `url("${heroUrl}")`);
    hero.style.backgroundPosition = "center";
    used.add(heroUrl);
  }

  // Large category cards should use originals from the curated gallery before catalog thumbnails.
  const cardPool = unique([
    ...media.gallery,
    ...media.hero.slice(1),
    ...media.products,
  ]).filter((url) => !used.has(url));
  const cards = Array.from(page.querySelectorAll<HTMLImageElement>(".satori-nz-photo-card img"));
  cards.forEach((image, index) => {
    const url = cardPool[index];
    if (!url) return;
    applyImage(image, url);
    used.add(url);
  });

  // Portfolio stays tied to its original captions where possible. We only replace visibly tiny
  // sources after the browser knows their intrinsic size, using unused full gallery originals.
  const portfolioPool = media.gallery.filter((url) => !used.has(url));
  const portfolio = Array.from(page.querySelectorAll<HTMLImageElement>(".satori-nz-work-media img"));
  portfolio.forEach((image, index) => {
    const maybeUpgrade = () => {
      if (image.naturalWidth >= 1000 && image.naturalHeight >= 700) return;
      const url = portfolioPool[index];
      if (url) applyImage(image, url);
    };
    if (image.complete) maybeUpgrade();
    else image.addEventListener("load", maybeUpgrade, { once: true });
  });

  page.dataset.satoriImageQuality = "2";
}

function scheduleUpgrade() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    void upgradeNaZakazImages();
  });
}

export function startNaZakazImageQuality() {
  if (window.location.pathname.startsWith("/admin")) return;
  scheduleUpgrade();
  const root = document.getElementById("root");
  if (root) new MutationObserver(scheduleUpgrade).observe(root, { childList: true, subtree: true });
  window.addEventListener("satori-route-change", scheduleUpgrade);
  window.addEventListener("pageshow", scheduleUpgrade);
}
