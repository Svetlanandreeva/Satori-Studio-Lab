type HeroSlide = { type: "image" | "video"; url: string };

type GalleryItem = { id?: string; url?: string };

function uniqueSlides(slides: HeroSlide[]) {
  const seen = new Set<string>();
  return slides.filter((slide) => {
    if (!slide.url || seen.has(slide.url)) return false;
    seen.add(slide.url);
    return true;
  });
}

async function loadHeroSlides(): Promise<HeroSlide[]> {
  const [hero, gallery] = await Promise.all([
    fetch("/api/hero").then((r) => (r.ok ? r.json() : null)).catch(() => null),
    fetch("/api/gallery").then((r) => (r.ok ? r.json() : [])).catch(() => []),
  ]);

  const slides: HeroSlide[] = [];
  if (hero?.url && (hero.type === "image" || hero.type === "video")) {
    slides.push({ type: hero.type, url: hero.url });
  }

  if (Array.isArray(gallery)) {
    (gallery as GalleryItem[])
      .map((item) => item?.url)
      .filter((url): url is string => Boolean(url))
      .slice(0, 6)
      .forEach((url) => slides.push({ type: "image", url }));
  }

  return uniqueSlides(slides).slice(0, 3);
}

function findHomeHero(): HTMLElement | null {
  return (
    Array.from(document.querySelectorAll<HTMLElement>("section")).find((section) =>
      section.textContent?.includes("ПРЕДМЕТНЫЙ ДИЗАЙН") && section.querySelector("h1"),
    ) ?? null
  );
}

function createMedia(slide: HeroSlide): HTMLElement {
  if (slide.type === "video") {
    const video = document.createElement("video");
    video.src = slide.url;
    video.autoplay = true;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = "metadata";
    return video;
  }

  const img = document.createElement("img");
  img.src = slide.url;
  img.alt = "";
  img.decoding = "async";
  img.loading = "eager";
  return img;
}

async function enhanceHero(heroSection: HTMLElement) {
  if (heroSection.dataset.heroCarouselBound === "1") return;
  heroSection.dataset.heroCarouselBound = "1";

  const slides = await loadHeroSlides();
  if (!heroSection.isConnected || slides.length < 2) return;

  const heroCard = heroSection.firstElementChild as HTMLElement | null;
  const mediaHost = heroCard?.querySelector<HTMLElement>(":scope > div.absolute.inset-0");
  if (!heroCard || !mediaHost) return;

  mediaHost.classList.add("satori-hero-carousel-host");

  Array.from(mediaHost.children).forEach((child) => {
    if (child.matches("picture, video, img")) {
      (child as HTMLElement).style.opacity = "0";
      (child as HTMLElement).style.pointerEvents = "none";
    }
  });

  const carouselLayer = document.createElement("div");
  carouselLayer.className = "satori-hero-carousel-layer";
  const frameA = document.createElement("div");
  const frameB = document.createElement("div");
  frameA.className = "satori-hero-carousel-frame is-active";
  frameB.className = "satori-hero-carousel-frame";
  carouselLayer.append(frameA, frameB);

  const overlay = Array.from(mediaHost.children).find(
    (child) => child instanceof HTMLElement && child.classList.contains("absolute") && child.classList.contains("inset-0") && child.tagName === "DIV",
  );
  mediaHost.insertBefore(carouselLayer, overlay ?? mediaHost.firstChild);

  let activeIndex = 0;
  let showingA = true;

  const mount = (frame: HTMLElement, slide: HeroSlide) => {
    frame.replaceChildren(createMedia(slide));
  };

  const render = (nextIndex: number) => {
    if (nextIndex === activeIndex && frameA.childElementCount + frameB.childElementCount > 0) return;
    const nextFrame = showingA ? frameB : frameA;
    const currentFrame = showingA ? frameA : frameB;
    mount(nextFrame, slides[nextIndex]);
    requestAnimationFrame(() => {
      nextFrame.classList.add("is-active");
      currentFrame.classList.remove("is-active");
    });
    activeIndex = nextIndex;
    showingA = !showingA;
  };

  mount(frameA, slides[0]);
  window.setInterval(() => render((activeIndex + 1) % slides.length), 6500);
}

function ensureAdminLink() {
  const header = document.querySelector<HTMLElement>("#root > div > header");
  const right = header?.querySelector<HTMLElement>(":scope > div:first-child > div:last-child");
  if (!right || right.querySelector(".satori-admin-top-link")) return;

  const link = document.createElement("a");
  link.href = "/admin";
  link.className = "satori-admin-top-link";
  link.textContent = "АДМИН";
  link.setAttribute("aria-label", "Вход в админ-панель SATORI");
  right.insertBefore(link, right.firstChild);
}

function scan() {
  ensureAdminLink();
  const hero = findHomeHero();
  if (hero) void enhanceHero(hero);
}

export function startStorefrontEnhancements() {
  if (window.location.pathname.startsWith("/admin")) return;
  const root = document.getElementById("root");
  if (!root) return;

  const observer = new MutationObserver(scan);
  observer.observe(root, { childList: true, subtree: true });
  window.addEventListener("popstate", () => window.setTimeout(scan, 0));
  window.setTimeout(scan, 0);
}
