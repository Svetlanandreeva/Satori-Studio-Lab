const PAGE_PATH = "/na-zakaz";

// Exact user-provided originals. The hero JPEG is split into raw base64 chunks in
// GitHub only to keep the source repository/API happy; the browser reconstructs
// the original bytes without resizing or recompression.
const HERO_CHUNKS = [
  "https://raw.githubusercontent.com/Svetlanandreeva/Satori-Studio-Lab/fix-na-zakaz-hq-originals/src/naZakazHeroOriginal/h00.txt",
  "https://raw.githubusercontent.com/Svetlanandreeva/Satori-Studio-Lab/c33fc41ea9bf6f0d34181d255f7f800469471703/src/naZakazOriginals/hero01_04.txt",
  "https://raw.githubusercontent.com/Svetlanandreeva/Satori-Studio-Lab/c33fc41ea9bf6f0d34181d255f7f800469471703/src/naZakazOriginals/hero05_14.txt",
];

const CHANDELIER_ORIGINAL =
  "https://raw.githubusercontent.com/Svetlanandreeva/Satori-Studio-Lab/c33fc41ea9bf6f0d34181d255f7f800469471703/public/na-zakaz/original/chandelier_on.jpg";

let heroPromise: Promise<string | null> | null = null;

function cleanPath() {
  const path = window.location.pathname;
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

async function getOriginalHero() {
  if (heroPromise) return heroPromise;
  heroPromise = Promise.all(
    HERO_CHUNKS.map((url) =>
      fetch(url, { cache: "force-cache" }).then((response) => {
        if (!response.ok) throw new Error(`Failed to load original media: ${response.status}`);
        return response.text();
      }),
    ),
  )
    .then((parts) => `data:image/jpeg;base64,${parts.join("").replace(/\s+/g, "")}`)
    .catch((error) => {
      console.warn("SATORI original /na-zakaz media unavailable", error);
      return null;
    });
  return heroPromise;
}

function imageUrl(value: string) {
  return `url("${value}")`;
}

async function applyOriginalMedia() {
  if (cleanPath() !== PAGE_PATH) return;
  const root = document.querySelector<HTMLElement>(".satori-nz-page");
  if (!root) return;

  const hero = await getOriginalHero();
  if (cleanPath() !== PAGE_PATH || !root.isConnected) return;

  if (hero) {
    const heroUrl = imageUrl(hero);
    root.style.setProperty("--satori-original-hero", heroUrl);
    root.style.setProperty("--satori-original-team", heroUrl);
    root.style.setProperty("--satori-original-weld", heroUrl);
  }

  const chandelierUrl = imageUrl(CHANDELIER_ORIGINAL);
  root.style.setProperty("--satori-original-chandelier", chandelierUrl);
  root.style.setProperty("--satori-original-detail", chandelierUrl);
  root.dataset.satoriOriginalMedia = "1";
}

export function startNaZakazOriginalMedia() {
  if (window.location.pathname.startsWith("/admin")) return;
  const appRoot = document.getElementById("root");
  if (!appRoot) return;

  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      void applyOriginalMedia();
    });
  };

  new MutationObserver(schedule).observe(appRoot, { childList: true, subtree: true });
  window.addEventListener("satori-route-change", schedule);
  window.addEventListener("pageshow", schedule);
  window.setTimeout(schedule, 0);
}
