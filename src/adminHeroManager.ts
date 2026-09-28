type HeroSlide = { type: "image" | "video"; url: string };
type HeroPayload = { type?: "image" | "video" | null; url?: string | null; slides?: HeroSlide[] };

function getAdminToken() {
  try {
    return localStorage.getItem("satori_admin_token") || "";
  } catch {
    return "";
  }
}

function normalizeSlides(hero: HeroPayload | null): HeroSlide[] {
  if (!hero) return [];
  const seen = new Set<string>();
  const slides: HeroSlide[] = [];
  const source = Array.isArray(hero.slides) && hero.slides.length
    ? hero.slides
    : (hero.url && (hero.type === "image" || hero.type === "video") ? [{ type: hero.type, url: hero.url }] : []);

  for (const slide of source) {
    if (!slide?.url || (slide.type !== "image" && slide.type !== "video") || seen.has(slide.url)) continue;
    seen.add(slide.url);
    slides.push({ type: slide.type, url: slide.url });
  }
  return slides.slice(0, 8);
}

async function fetchHero(): Promise<HeroPayload | null> {
  return fetch("/api/hero")
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
}

async function uploadMedia(file: File, token: string): Promise<string> {
  const form = new FormData();
  form.append("photo", file);
  const res = await fetch("/api/admin/upload", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.url) throw new Error(data?.error || "Не удалось загрузить файл");
  return String(data.url);
}

async function addFiles(files: File[], panel: HTMLElement) {
  const token = getAdminToken();
  if (!token || !files.length) return;
  const status = panel.querySelector<HTMLElement>("[data-hero-media-status]");
  if (status) status.textContent = "Загрузка…";

  try {
    // The backend prepends each newly uploaded item. Reverse the selection so
    // the order chosen in the file picker remains the visible carousel order.
    for (const file of [...files].reverse()) {
      const url = await uploadMedia(file, token);
      const type: HeroSlide["type"] = file.type.startsWith("video/") ? "video" : "image";
      const res = await fetch("/api/admin/hero", {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ type, url }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || "Не удалось сохранить медиа");
    }
    await renderHeroMediaPanel(panel);
  } catch (err) {
    if (status) status.textContent = err instanceof Error ? err.message : "Ошибка загрузки";
  }
}

async function clearHero(panel: HTMLElement) {
  const token = getAdminToken();
  if (!token || !confirm("Удалить все фото и видео из карусели Hero?")) return;
  const res = await fetch("/api/admin/hero", {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ type: null, url: null }),
  });
  if (res.ok) await renderHeroMediaPanel(panel);
}

async function renderHeroMediaPanel(panel: HTMLElement) {
  const hero = await fetchHero();
  if (!panel.isConnected) return;
  const slides = normalizeSlides(hero);

  panel.replaceChildren();

  const header = document.createElement("div");
  header.className = "satori-hero-media-admin-header";
  const copy = document.createElement("div");
  const title = document.createElement("div");
  title.className = "satori-cover-admin-title";
  title.textContent = "Медиа карусели Hero";
  const note = document.createElement("p");
  note.className = "satori-cover-admin-note";
  note.textContent = "Добавляйте несколько фото и видео. Фото переключаются автоматически, а видео всегда проигрываются полностью до конца. Максимум — 8 файлов.";
  copy.append(title, note);

  const actions = document.createElement("div");
  actions.className = "satori-hero-media-actions";
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*,video/mp4,video/webm,video/quicktime";
  input.multiple = true;
  input.hidden = true;
  input.addEventListener("change", () => {
    const files = Array.from(input.files ?? []);
    input.value = "";
    if (files.length) void addFiles(files, panel);
  });

  const add = document.createElement("button");
  add.type = "button";
  add.className = "satori-hero-media-add";
  add.textContent = "+ Добавить фото/видео";
  add.addEventListener("click", () => input.click());
  actions.append(add, input);

  if (slides.length) {
    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "satori-hero-media-clear";
    clear.textContent = "Очистить всё";
    clear.addEventListener("click", () => void clearHero(panel));
    actions.appendChild(clear);
  }
  header.append(copy, actions);
  panel.appendChild(header);

  const status = document.createElement("div");
  status.dataset.heroMediaStatus = "1";
  status.className = "satori-hero-media-status";
  status.textContent = slides.length ? `${slides.length} из 8 файлов в карусели` : "Карусель пока пустая";
  panel.appendChild(status);

  if (!slides.length) return;

  const grid = document.createElement("div");
  grid.className = "satori-hero-media-grid";
  slides.forEach((slide, index) => {
    const card = document.createElement("div");
    card.className = "satori-hero-media-card";
    const preview = document.createElement("div");
    preview.className = "satori-hero-media-preview";
    if (slide.type === "video") {
      const video = document.createElement("video");
      video.src = slide.url;
      video.muted = true;
      video.playsInline = true;
      video.preload = "metadata";
      preview.appendChild(video);
    } else {
      const img = document.createElement("img");
      img.src = slide.url;
      img.alt = "";
      preview.appendChild(img);
    }
    const meta = document.createElement("div");
    meta.className = "satori-hero-media-meta";
    meta.textContent = `${String(index + 1).padStart(2, "0")} · ${slide.type === "video" ? "Видео" : "Фото"}`;
    card.append(preview, meta);
    grid.appendChild(card);
  });
  panel.appendChild(grid);
}

function findHeroAdminHost(): HTMLElement | null {
  const paragraph = Array.from(document.querySelectorAll<HTMLParagraphElement>("p")).find((p) =>
    p.textContent?.includes("Фото или видео, которое показывается фоном на главном экране") ||
    p.textContent?.includes("Фото и видео для карусели главного экрана"),
  );
  return paragraph?.parentElement ?? null;
}

function hideLegacyHeroUploader(host: HTMLElement) {
  const legacyInput = host.querySelector<HTMLInputElement>('input[type="file"][accept*="video/mp4"]');
  const legacyLabel = legacyInput?.closest<HTMLElement>("label");
  if (legacyLabel) legacyLabel.classList.add("satori-legacy-hero-upload-hidden");
  const legacyPreview = legacyLabel?.nextElementSibling as HTMLElement | null;
  if (legacyPreview) legacyPreview.classList.add("satori-legacy-hero-preview-hidden");
}

function scanAdminHero() {
  if (!window.location.pathname.startsWith("/admin") || !getAdminToken()) return;
  const host = findHeroAdminHost();
  if (!host) return;
  hideLegacyHeroUploader(host);

  let panel = document.getElementById("satori-hero-media-admin");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "satori-hero-media-admin";
    panel.className = "satori-hero-media-admin";
    const coverPanel = document.getElementById("satori-home-cover-admin");
    host.insertBefore(panel, coverPanel ?? null);
    void renderHeroMediaPanel(panel);
  }
}

export function startAdminHeroManager() {
  if (!window.location.pathname.startsWith("/admin")) return;
  const root = document.getElementById("root");
  if (!root) return;
  const observer = new MutationObserver(scanAdminHero);
  observer.observe(root, { childList: true, subtree: true });
  window.setTimeout(scanAdminHero, 0);
}
