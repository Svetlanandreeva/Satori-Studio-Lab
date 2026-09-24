import hero00 from "./naZakazOriginals/hero00.txt?raw";
import hero01to04 from "./naZakazOriginals/hero01_04.txt?raw";
import hero05to14 from "./naZakazOriginals/hero05_14.txt?raw";
import "./styles/na-zakaz-hq.css";

const PAGE_PATH = "/na-zakaz";
const HERO_ORIGINAL = `data:image/jpeg;base64,${hero00}${hero01to04}${hero05to14}`;
const CHANDELIER_ORIGINAL = "/na-zakaz/original/chandelier_on.jpg";

function cleanPath() {
  const path = window.location.pathname;
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

function applyOriginalMedia() {
  if (cleanPath() !== PAGE_PATH) return;
  const root = document.querySelector<HTMLElement>(".satori-nz-page");
  if (!root) return;

  const heroUrl = `url("${HERO_ORIGINAL}")`;
  const chandelierUrl = `url("${CHANDELIER_ORIGINAL}")`;

  root.style.setProperty("--satori-hq-hero", heroUrl);
  root.style.setProperty("--satori-hq-team", heroUrl);
  root.style.setProperty("--satori-hq-weld", heroUrl);
  root.style.setProperty("--satori-hq-chandelier", chandelierUrl);
  root.style.setProperty("--satori-hq-detail", chandelierUrl);
  root.dataset.satoriHqMedia = "1";
}

export function startNaZakazHqMedia() {
  if (window.location.pathname.startsWith("/admin")) return;
  const root = document.getElementById("root");
  if (!root) return;

  const schedule = () => requestAnimationFrame(applyOriginalMedia);
  new MutationObserver(schedule).observe(root, { childList: true, subtree: true });
  window.addEventListener("satori-route-change", schedule);
  window.addEventListener("pageshow", schedule);
  window.setTimeout(applyOriginalMedia, 0);
}
