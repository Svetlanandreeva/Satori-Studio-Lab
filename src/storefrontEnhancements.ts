type HeroSlide = { type: "image" | "video"; url: string };
type HeroPayload = { type?: "image" | "video" | null; url?: string | null; slides?: HeroSlide[] };
type GalleryItem = { id?: string; url?: string };

type HomeCoverEntry = GalleryItem & { slot: number; baseUrl: string };

const HERO_IMAGE_DURATION_MS = 6500;
const HOME_COVER_MARKER = "#home-cover-";
const HOME_COVER_LABELS = [
  "Собственное производство",
  "Материалы",
  "Для профессионалов",
] as const;

let homeCoverCache: Array<HomeCoverEntry | null> | null = null;
let homeCoverRequest: Promise<Array<HomeCoverEntry | null>> | null = null;

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

  // The homepage carousel uses ONLY files uploaded through the Hero control in
  // the admin panel. The regular inspiration gallery is intentionally separate.
  if (Array.isArray(hero.slides) && hero.slides.length) {
    return uniqueSlides(
      hero.slides.filter(
        (slide): slide is HeroSlide =>
          Boolean(slide?.url) && (slide?.type === "image" || slide?.type === "video"),
      ),
    ).slice(0, 8);
  }

  // Backward compatibility with the old one-file hero format.
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
    // Important: do NOT loop inside a multi-slide carousel. The next slide is
    // shown only after the uploaded video reaches its natural end.
    video.loop = false;
    video.playsInline = true;
    video.preload = "auto";
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
      const media = child as HTMLMediaElement;
      media.style.opacity = "0";
      media.style.pointerEvents = "none";
      if (media instanceof HTMLVideoElement) media.pause();
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
  let activeFrame = frameA;
  let standbyFrame = frameB;
  let imageTimer: number | null = null;
  let generation = 0;

  const clearSchedule = () => {
    if (imageTimer !== null) {
      window.clearTimeout(imageTimer);
      imageTimer = null;
    }
    generation += 1;
  };

  const mount = (frame: HTMLElement, slide: HeroSlide) => {
    const media = createMedia(slide);
    frame.replaceChildren(media);
    return media;
  };

  const scheduleNext = (media: HTMLElement, slide: HeroSlide) => {
    clearSchedule();
    const scheduledGeneration = generation;

    const advance = () => {
      if (scheduledGeneration !== generation) return;
      render((activeIndex + 1) % slides.length);
    };

    if (slide.type === "video" && media instanceof HTMLVideoElement) {
      media.currentTime = 0;
      media.onended = advance;
      media.onerror = () => {
        if (scheduledGeneration !== generation) return;
        imageTimer = window.setTimeout(advance, 1200);
      };
      // Muted inline video is allowed to autoplay in modern browsers. Calling
      // play explicitly also restarts it cleanly after the crossfade mount.
      void media.play().catch(() => {
        // If autoplay is unexpectedly blocked, don't freeze the whole homepage.
        if (scheduledGeneration !== generation) return;
        imageTimer = window.setTimeout(advance, HERO_IMAGE_DURATION_MS);
      });
      return;
    }

    imageTimer = window.setTimeout(advance, HERO_IMAGE_DURATION_MS);
  };

  const render = (nextIndex: number) => {
    if (nextIndex === activeIndex && activeFrame.childElementCount > 0) return;

    clearSchedule();
    const oldFrame = activeFrame;
    const nextFrame = standbyFrame;
    const nextSlide = slides[nextIndex];
    const nextMedia = mount(nextFrame, nextSlide);

    requestAnimationFrame(() => {
      nextFrame.classList.add("is-active");
      oldFrame.classList.remove("is-active");
      const oldVideo = oldFrame.querySelector("video");
      if (oldVideo) oldVideo.pause();
    });

    activeFrame = nextFrame;
    standbyFrame = oldFrame;
    activeIndex = nextIndex;
    scheduleNext(nextMedia, nextSlide);
  };

  const firstMedia = mount(frameA, slides[0]);
  scheduleNext(firstMedia, slides[0]);
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

function parseHomeCover(item: GalleryItem): HomeCoverEntry | null {
  if (!item.url) return null;
  const markerIndex = item.url.indexOf(HOME_COVER_MARKER);
  if (markerIndex < 0) return null;
  const slot = Number(item.url.slice(markerIndex + HOME_COVER_MARKER.length));
  if (!Number.isInteger(slot) || slot < 0 || slot >= HOME_COVER_LABELS.length) return null;
  return {
    ...item,
    slot,
    baseUrl: item.url.slice(0, markerIndex),
  };
}

async function loadHomeCovers(force = false): Promise<Array<HomeCoverEntry | null>> {
  if (!force && homeCoverCache) return homeCoverCache;
  if (!force && homeCoverRequest) return homeCoverRequest;

  homeCoverRequest = fetch("/api/gallery")
    .then((r) => (r.ok ? r.json() : []))
    .catch(() => [])
    .then((gallery: GalleryItem[]) => {
      const entries: Array<HomeCoverEntry | null> = HOME_COVER_LABELS.map(() => null);
      for (const item of Array.isArray(gallery) ? gallery : []) {
        const cover = parseHomeCover(item);
        if (cover && !entries[cover.slot]) entries[cover.slot] = cover;
      }
      homeCoverCache = entries;
      homeCoverRequest = null;
      return entries;
    });

  return homeCoverRequest;
}

function findFeatureStrip(): HTMLElement | null {
  return Array.from(document.querySelectorAll<HTMLElement>("section")).find((section) =>
    section.textContent?.includes("Полный цикл создания от идеи до предмета") &&
    section.textContent?.includes("Материалы под задачу, форму и фактуру") &&
    section.textContent?.includes("Индивидуальные решения для ваших проектов"),
  ) ?? null;
}

async function applyHomeFeatureCovers(force = false) {
  const section = findFeatureStrip();
  if (!section) return;
  if (!force && section.dataset.satoriCoversApplied === "1") return;

  const covers = await loadHomeCovers(force);
  if (!section.isConnected) return;
  const grid = section.firstElementChild as HTMLElement | null;
  const cards = grid ? Array.from(grid.children).filter((el): el is HTMLElement => el instanceof HTMLElement) : [];

  cards.slice(0, HOME_COVER_LABELS.length).forEach((card, slot) => {
    const cover = covers[slot];
    card.classList.toggle("satori-home-feature-has-cover", Boolean(cover));
    if (!cover) return;
    const safeUrl = cover.baseUrl.replace(/"/g, "%22");
    card.style.backgroundImage = `linear-gradient(180deg, rgba(20,15,12,.16) 0%, rgba(20,15,12,.70) 100%), url("${safeUrl}")`;
    card.style.backgroundSize = "cover";
    card.style.backgroundPosition = "center";
    card.style.backgroundRepeat = "no-repeat";
  });

  section.dataset.satoriCoversApplied = "1";
}

function hideCoverStorageItems() {
  document.querySelectorAll<HTMLImageElement>(`img[src*="${HOME_COVER_MARKER}"]`).forEach((img) => {
    const tile = img.closest<HTMLElement>(".aspect-square, .relative.group");
    if (tile && !tile.closest("#satori-home-cover-admin")) tile.style.display = "none";
  });
}

function getAdminToken() {
  try {
    return localStorage.getItem("satori_admin_token") || "";
  } catch {
    return "";
  }
}

async function uploadAdminImage(file: File, token: string) {
  const form = new FormData();
  form.append("photo", file);
  const res = await fetch("/api/admin/upload", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || "Не удалось загрузить файл");
  const data = await res.json();
  if (!data?.url) throw new Error("Сервер не вернул URL файла");
  return String(data.url);
}

async function saveCoverSlot(slot: number, file: File, panel: HTMLElement) {
  const token = getAdminToken();
  if (!token) return;
  const status = panel.querySelector<HTMLElement>(`[data-cover-status="${slot}"]`);
  if (status) status.textContent = "Загрузка…";

  try {
    const current = (await loadHomeCovers(true))[slot];
    const uploadedUrl = await uploadAdminImage(file, token);
    const markedUrl = `${uploadedUrl}${HOME_COVER_MARKER}${slot}`;

    const addRes = await fetch("/api/admin/gallery", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url: markedUrl }),
    });
    if (!addRes.ok) throw new Error((await addRes.json().catch(() => null))?.error || "Не удалось сохранить заставку");

    if (current?.id) {
      await fetch(`/api/admin/gallery/${encodeURIComponent(current.id)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => null);
    }

    homeCoverCache = null;
    const feature = findFeatureStrip();
    if (feature) delete feature.dataset.satoriCoversApplied;
    await renderAdminCoverPanel(panel, true);
    await applyHomeFeatureCovers(true);
  } catch (err) {
    if (status) status.textContent = err instanceof Error ? err.message : "Ошибка загрузки";
  }
}

async function removeCoverSlot(slot: number, panel: HTMLElement) {
  const token = getAdminToken();
  if (!token) return;
  const current = (await loadHomeCovers(true))[slot];
  if (!current?.id) return;
  const status = panel.querySelector<HTMLElement>(`[data-cover-status="${slot}"]`);
  if (status) status.textContent = "Удаление…";

  const res = await fetch(`/api/admin/gallery/${encodeURIComponent(current.id)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    if (status) status.textContent = "Не удалось удалить";
    return;
  }

  homeCoverCache = null;
  await renderAdminCoverPanel(panel, true);
}

async function renderAdminCoverPanel(panel: HTMLElement, force = false) {
  const covers = await loadHomeCovers(force);
  if (!panel.isConnected) return;

  panel.replaceChildren();
  const title = document.createElement("div");
  title.className = "satori-cover-admin-title";
  title.textContent = "Заставки блоков под Hero";
  const note = document.createElement("p");
  note.className = "satori-cover-admin-note";
  note.textContent = "Здесь можно отдельно менять изображения трёх карточек сразу под главным экраном. Лучше загружать горизонтальные фото без текста.";
  panel.append(title, note);

  const grid = document.createElement("div");
  grid.className = "satori-cover-admin-grid";
  panel.appendChild(grid);

  HOME_COVER_LABELS.forEach((label, slot) => {
    const cover = covers[slot];
    const card = document.createElement("div");
    card.className = "satori-cover-admin-card";

    const preview = document.createElement("div");
    preview.className = "satori-cover-admin-preview";
    if (cover?.baseUrl) {
      const img = document.createElement("img");
      img.src = cover.baseUrl;
      img.alt = "";
      preview.appendChild(img);
    } else {
      const empty = document.createElement("span");
      empty.textContent = "Без фото";
      preview.appendChild(empty);
    }

    const name = document.createElement("strong");
    name.textContent = `${slot + 1}. ${label}`;

    const actions = document.createElement("div");
    actions.className = "satori-cover-admin-actions";
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.hidden = true;
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      input.value = "";
      if (file) void saveCoverSlot(slot, file, panel);
    });

    const upload = document.createElement("button");
    upload.type = "button";
    upload.textContent = cover ? "Заменить" : "Загрузить";
    upload.addEventListener("click", () => input.click());
    actions.append(upload, input);

    if (cover) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "is-secondary";
      remove.textContent = "Убрать";
      remove.addEventListener("click", () => void removeCoverSlot(slot, panel));
      actions.appendChild(remove);
    }

    const status = document.createElement("small");
    status.dataset.coverStatus = String(slot);
    status.textContent = cover ? "Заставка установлена" : "Используется стандартный фон";

    card.append(preview, name, actions, status);
    grid.appendChild(card);
  });
}

function updateAdminHeroCopy() {
  const paragraph = Array.from(document.querySelectorAll<HTMLParagraphElement>("p")).find((p) =>
    p.textContent?.includes("Фото или видео, которое показывается фоном на главном экране"),
  );
  if (paragraph && paragraph.dataset.satoriHeroCopyUpdated !== "1") {
    paragraph.dataset.satoriHeroCopyUpdated = "1";
    paragraph.textContent = "Фото и видео для карусели главного экрана. Фото показываются несколько секунд, а каждое видео проигрывается полностью до конца — только после этого карусель переключается дальше.";
  }
}

function ensureAdminCoverPanel() {
  if (!window.location.pathname.startsWith("/admin")) return;
  if (!getAdminToken()) return;
  if (document.getElementById("satori-home-cover-admin")) return;

  updateAdminHeroCopy();
  const heroCopy = Array.from(document.querySelectorAll<HTMLParagraphElement>("p")).find((p) =>
    p.textContent?.includes("карусели главного экрана") || p.textContent?.includes("главном экране сайта"),
  );
  const host = heroCopy?.parentElement;
  if (!host) return;

  const panel = document.createElement("div");
  panel.id = "satori-home-cover-admin";
  panel.className = "satori-cover-admin-panel";
  host.appendChild(panel);
  void renderAdminCoverPanel(panel);
}

function scanStorefront() {
  ensureAdminLink();
  ensureCustomOrderStyles();
  enhanceCustomOrderBlock();
  hideCoverStorageItems();
  void applyHomeFeatureCovers();
  const hero = findHomeHero();
  if (hero) void enhanceHero(hero);
}

function scanAdmin() {
  updateAdminHeroCopy();
  ensureAdminCoverPanel();
  hideCoverStorageItems();
}

export function startStorefrontEnhancements() {
  const root = document.getElementById("root");
  if (!root) return;

  const scan = window.location.pathname.startsWith("/admin") ? scanAdmin : scanStorefront;
  const observer = new MutationObserver(scan);
  observer.observe(root, { childList: true, subtree: true });
  window.addEventListener("popstate", () => window.setTimeout(scan, 0));
  window.setTimeout(scan, 0);
}
