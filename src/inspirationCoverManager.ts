type GalleryItem = { id?: string; url?: string };
type InspirationCover = GalleryItem & { slot: number; baseUrl: string };

const INSPIRATION_MARKER = "#inspiration-cover-";
const INSPIRATION_LABELS = [
  "Тихий свет",
  "Объекты и фактуры",
  "Малые формы",
  "Детали пространства",
] as const;

let coverCache: Array<InspirationCover | null> | null = null;
let coverRequest: Promise<Array<InspirationCover | null>> | null = null;

function getAdminToken() {
  try {
    return localStorage.getItem("satori_admin_token") || "";
  } catch {
    return "";
  }
}

function parseCover(item: GalleryItem): InspirationCover | null {
  if (!item.url) return null;
  const markerIndex = item.url.indexOf(INSPIRATION_MARKER);
  if (markerIndex < 0) return null;
  const slot = Number(item.url.slice(markerIndex + INSPIRATION_MARKER.length));
  if (!Number.isInteger(slot) || slot < 0 || slot >= INSPIRATION_LABELS.length) return null;
  return { ...item, slot, baseUrl: item.url.slice(0, markerIndex) };
}

async function loadCovers(force = false): Promise<Array<InspirationCover | null>> {
  if (!force && coverCache) return coverCache;
  if (!force && coverRequest) return coverRequest;

  coverRequest = fetch("/api/gallery")
    .then((r) => (r.ok ? r.json() : []))
    .catch(() => [])
    .then((items: GalleryItem[]) => {
      const next: Array<InspirationCover | null> = INSPIRATION_LABELS.map(() => null);
      for (const item of Array.isArray(items) ? items : []) {
        const cover = parseCover(item);
        if (cover && !next[cover.slot]) next[cover.slot] = cover;
      }
      coverCache = next;
      coverRequest = null;
      return next;
    });

  return coverRequest;
}

function findInspirationSection(): HTMLElement | null {
  return Array.from(document.querySelectorAll<HTMLElement>("section")).find((section) =>
    section.querySelector("h2")?.textContent?.includes("Вдохновение для вашего пространства"),
  ) ?? null;
}

async function applyInspirationCovers(force = false) {
  if (window.location.pathname.startsWith("/admin")) return;
  const section = findInspirationSection();
  if (!section) return;
  if (!force && section.dataset.satoriInspirationCovers === "1") return;

  const covers = await loadCovers(force);
  if (!section.isConnected) return;

  const grid = Array.from(section.children).find((el) => el instanceof HTMLElement && el.classList.contains("grid")) as HTMLElement | undefined;
  const cards = grid ? Array.from(grid.children).filter((el): el is HTMLButtonElement => el instanceof HTMLButtonElement) : [];

  cards.slice(0, INSPIRATION_LABELS.length).forEach((card, slot) => {
    card.querySelectorAll<HTMLElement>(":scope > picture, :scope > img:not(.satori-inspiration-cover-image)").forEach((media) => {
      media.style.removeProperty("display");
    });
    card.querySelectorAll(".satori-inspiration-cover-image").forEach((el) => el.remove());

    const cover = covers[slot];
    if (!cover) return;

    card.querySelectorAll<HTMLElement>(":scope > picture, :scope > img:not(.satori-inspiration-cover-image)").forEach((media) => {
      media.style.setProperty("display", "none", "important");
    });

    const img = document.createElement("img");
    img.src = cover.baseUrl;
    img.alt = INSPIRATION_LABELS[slot];
    img.className = "satori-inspiration-cover-image";
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

  section.dataset.satoriInspirationCovers = "1";
}

async function uploadImage(file: File, token: string) {
  const form = new FormData();
  form.append("photo", file);
  const res = await fetch("/api/admin/upload", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.url) throw new Error(data?.error || "Не удалось загрузить изображение");
  return String(data.url);
}

async function saveSlot(slot: number, file: File, panel: HTMLElement) {
  const token = getAdminToken();
  if (!token) return;
  const status = panel.querySelector<HTMLElement>(`[data-inspiration-status="${slot}"]`);
  if (status) status.textContent = "Загрузка…";

  try {
    const current = (await loadCovers(true))[slot];
    const uploadedUrl = await uploadImage(file, token);
    const addRes = await fetch("/api/admin/gallery", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url: `${uploadedUrl}${INSPIRATION_MARKER}${slot}` }),
    });
    if (!addRes.ok) throw new Error((await addRes.json().catch(() => null))?.error || "Не удалось сохранить заставку");

    if (current?.id) {
      await fetch(`/api/admin/gallery/${current.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => null);
    }

    coverCache = null;
    await renderAdminPanel(panel, true);
  } catch (err) {
    if (status) status.textContent = err instanceof Error ? err.message : "Ошибка загрузки";
  }
}

async function removeSlot(slot: number, panel: HTMLElement) {
  const token = getAdminToken();
  if (!token) return;
  const current = (await loadCovers(true))[slot];
  if (!current?.id) return;

  const res = await fetch(`/api/admin/gallery/${current.id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return;
  coverCache = null;
  await renderAdminPanel(panel, true);
}

async function renderAdminPanel(panel: HTMLElement, force = false) {
  const covers = await loadCovers(force);
  if (!panel.isConnected) return;
  panel.replaceChildren();

  const title = document.createElement("div");
  title.className = "satori-cover-admin-title";
  title.textContent = "Заставки блока «Вдохновение для вашего пространства»";

  const note = document.createElement("p");
  note.className = "satori-cover-admin-note";
  note.textContent = "Здесь можно отдельно заменить изображения четырёх карточек на главной. Загруженные сюда картинки не попадают в обычную галерею сайта.";

  const grid = document.createElement("div");
  grid.className = "satori-cover-admin-grid satori-inspiration-admin-grid";

  INSPIRATION_LABELS.forEach((label, slot) => {
    const cover = covers[slot];
    const card = document.createElement("div");
    card.className = "satori-cover-admin-card";

    const preview = document.createElement("div");
    preview.className = "satori-cover-admin-preview";
    if (cover) {
      const img = document.createElement("img");
      img.src = cover.baseUrl;
      img.alt = label;
      preview.appendChild(img);
    } else {
      preview.textContent = "Используется текущее фото товара";
    }

    const name = document.createElement("strong");
    name.textContent = `${String(slot + 1).padStart(2, "0")} · ${label}`;

    const actions = document.createElement("div");
    actions.className = "satori-cover-admin-actions";
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.hidden = true;
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      input.value = "";
      if (file) void saveSlot(slot, file, panel);
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
      remove.addEventListener("click", () => void removeSlot(slot, panel));
      actions.appendChild(remove);
    }

    const status = document.createElement("small");
    status.dataset.inspirationStatus = String(slot);
    status.textContent = cover ? "Своя заставка установлена" : "По умолчанию берётся изображение товара";

    card.append(preview, name, actions, status);
    grid.appendChild(card);
  });

  panel.append(title, note, grid);
}

function hideStorageItems() {
  document.querySelectorAll<HTMLImageElement>(`img[src*="${INSPIRATION_MARKER}"]`).forEach((img) => {
    const tile = img.closest<HTMLElement>(".aspect-square, .relative.group");
    if (tile && !tile.closest("#satori-inspiration-cover-admin")) tile.style.display = "none";
  });
}

function ensureAdminPanel() {
  if (!window.location.pathname.startsWith("/admin") || !getAdminToken()) return;
  if (document.getElementById("satori-inspiration-cover-admin")) return;

  const previous = document.getElementById("satori-home-cover-admin");
  const heroCopy = Array.from(document.querySelectorAll<HTMLParagraphElement>("p")).find((p) =>
    p.textContent?.includes("карусели главного экрана") || p.textContent?.includes("главном экране сайта"),
  );
  const host = previous?.parentElement ?? heroCopy?.parentElement;
  if (!host) return;

  const panel = document.createElement("div");
  panel.id = "satori-inspiration-cover-admin";
  panel.className = "satori-cover-admin-panel";
  if (previous?.parentElement === host) previous.insertAdjacentElement("afterend", panel);
  else host.appendChild(panel);
  void renderAdminPanel(panel);
}

function ensureStyles() {
  if (document.getElementById("satori-inspiration-admin-styles")) return;
  const style = document.createElement("style");
  style.id = "satori-inspiration-admin-styles";
  style.textContent = `
    .satori-inspiration-admin-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    @media (max-width: 1100px) { .satori-inspiration-admin-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 820px) { .satori-inspiration-admin-grid { grid-template-columns: 1fr; } }
  `;
  document.head.appendChild(style);
}

function scan() {
  ensureStyles();
  hideStorageItems();
  ensureAdminPanel();
  void applyInspirationCovers();
}

export function startInspirationCoverManager() {
  const root = document.getElementById("root");
  if (!root) return;
  const observer = new MutationObserver(scan);
  observer.observe(root, { childList: true, subtree: true });
  window.setTimeout(scan, 0);
}
