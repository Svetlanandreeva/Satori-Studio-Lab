type HeroSlide = { type: "image" | "video"; url: string };
type HeroPayload = { type?: "image" | "video" | null; url?: string | null; slides?: HeroSlide[] };

function uniqueSlides(slides: HeroSlide[]) {
  const seen = new Set<string>();
  return slides.filter((slide) => {
    if (!slide.url || seen.has(slide.url)) return false;
    seen.add(slide.url);
    return true;
  });
}

async function loadHeroSlides(): Promise<HeroSlide[]> {
  const hero = await fetch("/api/hero")
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null) as HeroPayload | null;

  if (!hero) return [];

  // The homepage carousel must use ONLY media uploaded through the Hero block
  // in the admin panel. Do not mix in /api/gallery (that gallery is used by the
  // inspiration section and can contain unrelated photos).
  if (Array.isArray(hero.slides) && hero.slides.length) {
    return uniqueSlides(
      hero.slides.filter(
        (slide): slide is HeroSlide =>
          Boolean(slide?.url) && (slide?.type === "image" || slide?.type === "video"),
      ),
    ).slice(0, 8);
  }

  // Backward compatibility while the persisted hero.json is still in the old
  // single-file format. After the next admin upload the server stores `slides`.
  if (hero.url && (hero.type === "image" || hero.type === "video")) {
    return [{ type: hero.type, url: hero.url }];
  }

  return [];
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

function ensureCustomOrderStyles() {
  if (document.getElementById("satori-custom-order-polish")) return;
  const style = document.createElement("style");
  style.id = "satori-custom-order-polish";
  style.textContent = `
    .satori-custom-order-card {
      display: grid !important;
      grid-template-columns: minmax(0, .9fr) minmax(420px, 1.1fr) !important;
      align-items: stretch !important;
      gap: clamp(36px, 4vw, 68px) !important;
      padding: clamp(36px, 4vw, 56px) !important;
      border-radius: 32px !important;
      min-height: 0 !important;
    }
    .satori-custom-order-card > div:first-child {
      min-width: 0 !important;
      display: flex !important;
      flex-direction: column !important;
      justify-content: center !important;
    }
    .satori-custom-order-card > div:first-child h2 {
      max-width: 9.5ch !important;
      margin: 14px 0 20px !important;
      font-size: clamp(42px, 3.7vw, 58px) !important;
      line-height: .98 !important;
      letter-spacing: -.025em !important;
    }
    .satori-custom-order-card > div:first-child p:not(:first-child) {
      max-width: 500px !important;
      margin-bottom: 24px !important;
      font-size: 14px !important;
      line-height: 1.55 !important;
    }
    .satori-custom-order-card > div:last-child {
      min-width: 0 !important;
      margin: 0 !important;
      padding: 30px 34px !important;
      border-radius: 24px !important;
      display: flex !important;
      align-items: center !important;
    }
    .satori-custom-order-card > div:last-child > div {
      width: 100% !important;
      gap: 0 !important;
    }
    .satori-custom-order-card > div:last-child > div > div {
      padding: 19px 0 !important;
      align-items: flex-start !important;
    }
    .satori-custom-order-card > div:last-child > div > div + div {
      border-top: 1px solid rgba(240,234,226,.10) !important;
    }
    .satori-custom-order-card > div:last-child > div > div > div > div:first-child {
      font-size: 15px !important;
      line-height: 1.25 !important;
    }
    .satori-custom-order-card > div:last-child > div > div > div > div:last-child {
      margin-top: 6px !important;
      font-size: 13px !important;
      line-height: 1.45 !important;
      max-width: 520px !important;
    }
    @media (max-width: 900px) {
      .satori-custom-order-card {
        grid-template-columns: 1fr !important;
        gap: 28px !important;
        padding: 28px !important;
      }
      .satori-custom-order-card > div:first-child h2 {
        max-width: 12ch !important;
        font-size: clamp(38px, 10vw, 52px) !important;
      }
      .satori-custom-order-card > div:last-child {
        padding: 22px 24px !important;
      }
    }
  `;
  document.head.appendChild(style);
}

function enhanceCustomOrderBlock() {
  const section = Array.from(document.querySelectorAll<HTMLElement>("section")).find((item) =>
    item.textContent?.includes("Нужен объект, которого нет в каталоге?"),
  );
  const card = section?.firstElementChild as HTMLElement | null;
  if (!card || card.classList.contains("satori-custom-order-card")) return;
  card.classList.add("satori-custom-order-card");
}

function scan() {
  ensureAdminLink();
  ensureCustomOrderStyles();
  enhanceCustomOrderBlock();
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
