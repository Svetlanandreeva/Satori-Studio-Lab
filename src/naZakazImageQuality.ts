type ProductMedia = {
  img?: string;
  imgs?: string[];
};

type GalleryMedia = { url?: string };
type HeroMedia = { type?: string | null; url?: string | null; slides?: Array<{ type?: string; url?: string }> };
type ProbedImage = { url: string; width: number; height: number; area: number; aspect: number };

const PAGE_PATHS = new Set(["/na-zakaz", "/custom"]);
const MAX_CANDIDATES = 36;
const PROBE_TIMEOUT_MS = 7000;

let qualityPromise: Promise<ProbedImage[]> | null = null;
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

async function collectCandidateUrls() {
  const [productsRaw, galleryRaw, heroRaw] = await Promise.all([
    fetchJson("/api/products", []),
    fetchJson("/api/gallery", []),
    fetchJson("/api/hero", {}),
  ]);

  const products = (Array.isArray(productsRaw) ? productsRaw : []) as ProductMedia[];
  const gallery = (Array.isArray(galleryRaw) ? galleryRaw : []) as GalleryMedia[];
  const hero = (heroRaw || {}) as HeroMedia;

  return unique([
    hero.type === "image" ? uploadUrl(hero.url) : null,
    ...(hero.slides || []).filter((slide) => slide.type === "image").map((slide) => uploadUrl(slide.url)),
    ...products.flatMap((product) => [uploadUrl(product.img), ...(product.imgs || []).map(uploadUrl)]),
    ...gallery.map((item) => uploadUrl(item.url)),
  ]).slice(0, MAX_CANDIDATES);
}

function probeImage(url: string) {
  return new Promise<ProbedImage | null>((resolve) => {
    const image = new Image();
    let settled = false;
    const finish = (value: ProbedImage | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(value);
    };
    const timer = window.setTimeout(() => finish(null), PROBE_TIMEOUT_MS);
    image.decoding = "async";
    image.onload = () => {
      const width = image.naturalWidth || 0;
      const height = image.naturalHeight || 0;
      if (!width || !height) return finish(null);
      finish({ url, width, height, area: width * height, aspect: width / height });
    };
    image.onerror = () => finish(null);
    image.src = url;
  });
}

async function getQualityPool() {
  if (!qualityPromise) {
    qualityPromise = collectCandidateUrls()
      .then((urls) => Promise.all(urls.map(probeImage)))
      .then((items) => items.filter((item): item is ProbedImage => Boolean(item)))
      .then((items) => items.sort((a, b) => b.area - a.area));
  }
  return qualityPromise;
}

function currentHeroUrl(hero: HTMLElement) {
  const raw = hero.style.getPropertyValue("--satori-nz-hero");
  const match = raw.match(/url\(["']?([^"')]+)["']?\)/i);
  return uploadUrl(match?.[1]);
}

function pickHero(pool: ProbedImage[], used: Set<string>, current?: ProbedImage) {
  const preferred = pool
    .filter((item) => !used.has(item.url))
    .filter((item) => item.width >= 1600 && item.height >= 850 && item.aspect >= 1.25 && item.aspect <= 2.5)
    .sort((a, b) => {
      const aFit = 1 - Math.min(Math.abs(a.aspect - 2.0), 1) * 0.25;
      const bFit = 1 - Math.min(Math.abs(b.aspect - 2.0), 1) * 0.25;
      return (b.area * bFit) - (a.area * aFit);
    });
  const candidate = preferred[0] || pool.find((item) => !used.has(item.url) && item.width >= 1400 && item.height >= 800);
  if (!candidate) return null;
  if (current && current.width >= 1600 && current.height >= 850 && current.area >= candidate.area * 0.72) return null;
  return candidate;
}

function pickForImage(pool: ProbedImage[], used: Set<string>, current: ProbedImage | undefined, minShortSide: number) {
  if (current && Math.min(current.width, current.height) >= minShortSide) return null;
  const candidate = pool.find((item) => !used.has(item.url) && Math.min(item.width, item.height) >= minShortSide);
  if (!candidate) return null;
  if (current && candidate.area < current.area * 1.25) return null;
  return candidate;
}

async function upgradeNaZakazImages() {
  if (!PAGE_PATHS.has(cleanPath())) return;
  const page = document.querySelector<HTMLElement>(".satori-nz-page");
  if (!page || page.dataset.satoriImageQuality === "1") return;

  const pool = await getQualityPool();
  if (!pool.length || !page.isConnected || !PAGE_PATHS.has(cleanPath())) return;

  const byUrl = new Map(pool.map((item) => [item.url, item]));
  const used = new Set<string>();

  const hero = page.querySelector<HTMLElement>(".satori-nz-hero");
  if (hero) {
    const currentUrl = currentHeroUrl(hero);
    if (currentUrl) used.add(currentUrl);
    const current = currentUrl ? byUrl.get(currentUrl) : undefined;
    const replacement = pickHero(pool, used, current);
    if (replacement) {
      hero.style.setProperty("--satori-nz-hero", `url("${replacement.url}")`);
      used.add(replacement.url);
    }
  }

  const cards = Array.from(page.querySelectorAll<HTMLImageElement>(".satori-nz-photo-card img"));
  for (const image of cards) {
    const currentUrl = uploadUrl(image.getAttribute("src"));
    if (currentUrl) used.add(currentUrl);
    const replacement = pickForImage(pool, used, currentUrl ? byUrl.get(currentUrl) : undefined, 900);
    if (replacement) {
      image.src = replacement.url;
      image.removeAttribute("srcset");
      image.decoding = "async";
      used.add(replacement.url);
    }
  }

  const portfolio = Array.from(page.querySelectorAll<HTMLImageElement>(".satori-nz-work-media img"));
  for (const image of portfolio) {
    const currentUrl = uploadUrl(image.getAttribute("src"));
    if (currentUrl) used.add(currentUrl);
    const replacement = pickForImage(pool, used, currentUrl ? byUrl.get(currentUrl) : undefined, 850);
    if (replacement) {
      image.src = replacement.url;
      image.removeAttribute("srcset");
      image.decoding = "async";
      used.add(replacement.url);
    }
  }

  page.dataset.satoriImageQuality = "1";
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
