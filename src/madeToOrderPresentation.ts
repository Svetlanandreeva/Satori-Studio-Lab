type ProductMeta = {
  id: number;
  inStock: boolean;
  description?: string;
};

const MADE_TO_ORDER_COPY = "Ручная работа под заказчика — срок изготовления 7–14 дней.";
let productsPromise: Promise<ProductMeta[]> | null = null;
let scanTimer: number | null = null;

function loadProducts() {
  if (!productsPromise) {
    productsPromise = fetch("/api/products", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => []);
  }
  return productsPromise;
}

function removeGridBanners() {
  document.querySelectorAll<HTMLElement>("span").forEach((span) => {
    const text = (span.textContent || "").trim();
    if (!/^Под заказ\s*[·•]/i.test(text)) return;

    const overlay = span.parentElement;
    if (
      overlay instanceof HTMLElement &&
      overlay.classList.contains("absolute") &&
      overlay.classList.contains("inset-0")
    ) {
      overlay.remove();
    } else {
      span.remove();
    }
  });
}

function currentProductId() {
  const pathMatch = window.location.pathname.match(/^\/product\/(\d+)\/?$/);
  if (pathMatch) {
    const id = Number(pathMatch[1]);
    return Number.isFinite(id) ? id : null;
  }

  const raw = new URLSearchParams(window.location.search).get("p");
  if (!raw) return null;
  const id = Number(raw);
  return Number.isFinite(id) ? id : null;
}

function removeExistingNote() {
  document.querySelectorAll(".satori-made-to-order-note").forEach((el) => el.remove());
}

function normalize(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

async function ensureProductDescriptionNote() {
  const productId = currentProductId();
  if (productId == null) {
    removeExistingNote();
    return;
  }

  const products = await loadProducts();
  const product = products.find((item) => Number(item.id) === productId);
  if (!product || product.inStock) {
    removeExistingNote();
    return;
  }

  if (document.querySelector(".satori-made-to-order-note")) return;

  const description = normalize(product.description || "");
  let anchor: HTMLElement | null = null;

  if (description) {
    const needle = description.slice(0, Math.min(48, description.length));
    anchor = Array.from(document.querySelectorAll<HTMLElement>("p")).find((p) =>
      normalize(p.textContent || "").includes(needle.slice(0, Math.min(28, needle.length))),
    ) ?? null;
  }

  if (!anchor) {
    const title = Array.from(document.querySelectorAll<HTMLElement>("h1, h2")).find((el) =>
      el.closest("main, #root") && el.textContent?.trim(),
    );
    anchor = title?.parentElement ?? null;
  }

  if (!anchor || !anchor.isConnected) return;

  const next = anchor.nextElementSibling as HTMLElement | null;
  const readMore = next && /читать полностью|свернуть/i.test(next.textContent || "") ? next : null;
  const note = document.createElement("p");
  note.className = "satori-made-to-order-note";
  note.textContent = MADE_TO_ORDER_COPY;
  Object.assign(note.style, {
    marginTop: "10px",
    marginBottom: "18px",
    fontFamily: "'Inter', sans-serif",
    fontSize: "13px",
    lineHeight: "1.55",
    color: "#6B6255",
  });

  (readMore ?? anchor).insertAdjacentElement("afterend", note);
}

function scan() {
  removeGridBanners();
  void ensureProductDescriptionNote();
}

function schedule() {
  if (scanTimer !== null) window.clearTimeout(scanTimer);
  scanTimer = window.setTimeout(() => {
    scanTimer = null;
    scan();
  }, 30);
}

export function startMadeToOrderPresentation() {
  const root = document.getElementById("root");
  if (!root || window.location.pathname.startsWith("/admin")) return;

  const observer = new MutationObserver(schedule);
  observer.observe(root, { childList: true, subtree: true });
  window.addEventListener("popstate", schedule);
  window.addEventListener("satori-route-change", schedule);
  window.setTimeout(scan, 0);
}
