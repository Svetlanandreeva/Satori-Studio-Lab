type FeaturedProduct = {
  id: number;
  name: string;
  category?: string;
  price: number;
  img: string;
  description?: string;
  badge?: string;
};

let productsPromise: Promise<FeaturedProduct[]> | null = null;

function loadProducts() {
  if (!productsPromise) {
    productsPromise = fetch("/api/products")
      .then((r) => {
        if (!r.ok) throw new Error(`products ${r.status}`);
        return r.json();
      })
      .then((data) => (Array.isArray(data) ? data : []))
      .catch(() => []);
  }
  return productsPromise;
}

const normalize = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleUpperCase("ru-RU");
const formatPrice = (price: number) =>
  new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(price);

function findFeaturedSection(): HTMLElement | null {
  return (
    Array.from(document.querySelectorAll<HTMLElement>("section")).find((section) => {
      const numbers = section.querySelector(".absolute.top-8.right-8");
      const title = section.querySelector("h2");
      return Boolean(numbers && title && section.textContent?.includes("ХИТ"));
    }) ?? null
  );
}

function productDetailsUrl(product: FeaturedProduct) {
  return `${window.location.pathname}?p=${encodeURIComponent(String(product.id))}`;
}

async function bindFeaturedSwitcher(section: HTMLElement) {
  if (section.dataset.hitSwitcherBound === "1") return;
  section.dataset.hitSwitcherBound = "1";

  const products = await loadProducts();
  if (!section.isConnected || products.length === 0) return;

  const card = section.firstElementChild as HTMLElement | null;
  const imagePanel = card?.children?.[0] as HTMLElement | undefined;
  const detailsPanel = card?.children?.[1] as HTMLElement | undefined;
  const numbers = detailsPanel?.querySelector<HTMLElement>(".absolute.top-8.right-8");
  const title = detailsPanel?.querySelector<HTMLElement>("h2");
  const description = title?.nextElementSibling as HTMLElement | null;
  const price = description?.nextElementSibling as HTMLElement | null;
  const detailsButton = detailsPanel?.querySelector<HTMLButtonElement>("button");
  const image = imagePanel?.querySelector<HTMLImageElement>("img");
  const picture = imagePanel?.querySelector<HTMLPictureElement>("picture");

  if (!numbers || !title || !description || !price || !image || !detailsButton) return;

  const currentName = normalize(title.textContent || "");
  const current = products.find((p) => normalize(p.name) === currentName)
    ?? products.find((p) => normalize(p.badge || "") === "ХИТ")
    ?? products[0];

  const firstSix = products.slice(0, 6);
  const hits = products.filter((p) => normalize(p.badge || "") === "ХИТ");
  const ordered = [current, ...hits, ...firstSix, ...products];
  const seen = new Set<number>();
  const candidates = ordered.filter((p) => {
    if (!p || seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  }).slice(0, 3);

  if (candidates.length === 0) return;

  numbers.classList.add("featured-hit-switcher");
  const numberItems = Array.from(numbers.children) as HTMLElement[];
  let activeIndex = 0;

  const render = (index: number) => {
    const product = candidates[index];
    if (!product) return;
    activeIndex = index;

    section.classList.add("featured-hit-switching");
    window.setTimeout(() => section.classList.remove("featured-hit-switching"), 180);

    title.textContent = product.name.toLocaleUpperCase("ru-RU");
    description.textContent = product.description || `${product.category || "Предмет"} ручной работы из студии Satori в Екатеринбурге.`;
    price.textContent = formatPrice(product.price);
    image.alt = product.name;
    image.src = product.img;
    image.removeAttribute("srcset");
    image.removeAttribute("sizes");

    if (picture) {
      picture.querySelectorAll("source").forEach((source) => {
        source.removeAttribute("srcset");
        source.setAttribute("srcset", product.img);
      });
    }

    numberItems.forEach((item, itemIndex) => {
      const enabled = Boolean(candidates[itemIndex]);
      item.style.display = enabled ? "flex" : "none";
      item.classList.toggle("is-active", itemIndex === index);
      item.setAttribute("aria-pressed", itemIndex === index ? "true" : "false");
    });

    detailsButton.dataset.productId = String(product.id);
    detailsButton.setAttribute("aria-label", `Подробнее о ${product.name}`);
  };

  numberItems.forEach((item, index) => {
    if (!candidates[index]) {
      item.style.display = "none";
      return;
    }
    item.setAttribute("role", "button");
    item.setAttribute("tabindex", "0");
    item.setAttribute("aria-label", `Показать хит ${index + 1}: ${candidates[index].name}`);
    item.addEventListener("click", () => render(index));
    item.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        render(index);
      }
    });
  });

  detailsButton.addEventListener(
    "click",
    (event) => {
      const selected = candidates[activeIndex];
      if (!selected) return;
      event.preventDefault();
      event.stopPropagation();
      (event as Event & { stopImmediatePropagation?: () => void }).stopImmediatePropagation?.();
      window.location.assign(productDetailsUrl(selected));
    },
    true,
  );

  render(0);
}

function scanForFeaturedSwitcher() {
  const section = findFeaturedSection();
  if (section) void bindFeaturedSwitcher(section);
}

export function startFeaturedSwitcher() {
  if (window.location.pathname.startsWith("/admin")) return;

  const root = document.getElementById("root");
  if (!root) return;

  const observer = new MutationObserver(() => scanForFeaturedSwitcher());
  observer.observe(root, { childList: true, subtree: true });

  window.addEventListener("popstate", () => window.setTimeout(scanForFeaturedSwitcher, 0));
  window.setTimeout(scanForFeaturedSwitcher, 0);
}
