type SeoProduct = {
  id: number;
  name: string;
  category?: string;
  price?: number;
  img?: string;
  imgs?: string[];
  description?: string;
  inStock?: boolean;
  lead?: string;
};

const SITE_URL = "https://satorilabural.ru";
const ROOT_TITLE = "SATORI — светильники, декор и мебель на заказ";
const ROOT_DESCRIPTION = "SATORI — интерьерная студия: авторские светильники, декор и мебель на заказ. Индивидуальный дизайн, производство в России и Китае, доставка по России.";

function absoluteUrl(url?: string) {
  if (!url) return `${SITE_URL}/og-image.png`;
  try { return new URL(url, SITE_URL).toString(); } catch { return `${SITE_URL}/og-image.png`; }
}

function setMeta(selector: string, attribute: string, value: string) {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement("meta");
    const match = selector.match(/meta\[(name|property)="([^"]+)"\]/);
    if (match) element.setAttribute(match[1], match[2]);
    document.head.appendChild(element);
  }
  element.setAttribute(attribute, value);
}

function setCanonical(url: string) {
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "canonical";
    document.head.appendChild(link);
  }
  link.href = url;
}

function setJsonLd(id: string, data: unknown) {
  let script = document.head.querySelector<HTMLScriptElement>(`script[data-seo-id="${id}"]`);
  if (!script) {
    script = document.createElement("script");
    script.type = "application/ld+json";
    script.dataset.seoId = id;
    document.head.appendChild(script);
  }
  script.textContent = JSON.stringify(data);
}

function removeJsonLd(id: string) {
  document.head.querySelector(`script[data-seo-id="${id}"]`)?.remove();
}

function rootSeo() {
  document.title = ROOT_TITLE;
  setMeta('meta[name="description"]', "content", ROOT_DESCRIPTION);
  setMeta('meta[property="og:type"]', "content", "website");
  setMeta('meta[property="og:title"]', "content", "SATORI — интерьерная студия и предметы на заказ");
  setMeta('meta[property="og:description"]', "content", "Авторские светильники, декор, мебель и интерьерные объекты. Индивидуальный дизайн, производство в России и Китае, доставка по России.");
  setMeta('meta[property="og:image"]', "content", `${SITE_URL}/og-image.png`);
  setMeta('meta[property="og:url"]', "content", `${SITE_URL}/`);
  setMeta('meta[name="twitter:title"]', "content", ROOT_TITLE);
  setMeta('meta[name="twitter:description"]', "content", "Интерьерная студия SATORI: авторские предметы, индивидуальный дизайн и производство под проект.");
  setMeta('meta[name="twitter:image"]', "content", `${SITE_URL}/og-image.png`);
  setCanonical(`${SITE_URL}/`);
  removeJsonLd("product");
}

function productSeo(product: SeoProduct) {
  const canonical = `${SITE_URL}/?p=${encodeURIComponent(String(product.id))}`;
  const title = `${product.name} — ${product.category || "предмет интерьера"} | SATORI`;
  const fallback = `${product.name} от SATORI. Авторский предмет интерьера, ручная работа и производство под заказ с доставкой по России.`;
  const description = (product.description || fallback).replace(/\s+/g, " ").trim().slice(0, 170);
  const image = absoluteUrl(product.img || product.imgs?.[0]);

  document.title = title;
  setMeta('meta[name="description"]', "content", description);
  setMeta('meta[property="og:type"]', "content", "product");
  setMeta('meta[property="og:title"]', "content", title);
  setMeta('meta[property="og:description"]', "content", description);
  setMeta('meta[property="og:image"]', "content", image);
  setMeta('meta[property="og:url"]', "content", canonical);
  setMeta('meta[name="twitter:title"]', "content", title);
  setMeta('meta[name="twitter:description"]', "content", description);
  setMeta('meta[name="twitter:image"]', "content", image);
  setCanonical(canonical);

  setJsonLd("product", {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${canonical}#product`,
    name: product.name,
    description,
    category: product.category,
    image: [image, ...(product.imgs || []).map(absoluteUrl)].filter((v, i, arr) => arr.indexOf(v) === i),
    sku: String(product.id),
    brand: { "@type": "Brand", name: "SATORI" },
    offers: typeof product.price === "number" ? {
      "@type": "Offer",
      url: canonical,
      priceCurrency: "RUB",
      price: product.price,
      availability: product.inStock
        ? "https://schema.org/InStock"
        : "https://schema.org/PreOrder",
      seller: { "@id": `${SITE_URL}/#organization` }
    } : undefined
  });
}

function addCrawlableProductLinks(products: SeoProduct[]) {
  const cards = Array.from(document.querySelectorAll<HTMLElement>(".cursor-pointer.group"));
  for (const card of cards) {
    if (card.querySelector("a[data-product-seo-link]")) continue;
    const product = products.find((p) => {
      const text = card.textContent?.replace(/\s+/g, " ").trim().toLowerCase() || "";
      return text.includes(p.name.toLowerCase());
    });
    if (!product) continue;

    const titleNode = Array.from(card.querySelectorAll<HTMLElement>("p,h2,h3")).find((el) =>
      el.textContent?.trim().toLowerCase() === product.name.toLowerCase() ||
      el.textContent?.trim().toLowerCase() === product.name.toUpperCase().toLowerCase()
    );
    if (!titleNode || titleNode.querySelector("a")) continue;

    const anchor = document.createElement("a");
    anchor.href = `/?p=${encodeURIComponent(String(product.id))}`;
    anchor.dataset.productSeoLink = "1";
    anchor.textContent = titleNode.textContent || product.name;
    anchor.style.color = "inherit";
    anchor.style.textDecoration = "none";
    anchor.addEventListener("click", (event) => event.stopPropagation());
    titleNode.textContent = "";
    titleNode.appendChild(anchor);
  }
}

export function startSeoEnhancements() {
  if (window.location.pathname.startsWith("/admin")) {
    setMeta('meta[name="robots"]', "content", "noindex,nofollow,noarchive");
    return;
  }

  let products: SeoProduct[] = [];

  const apply = () => {
    const productId = new URLSearchParams(window.location.search).get("p");
    if (productId && products.length) {
      const product = products.find((p) => String(p.id) === productId);
      if (product) productSeo(product);
      else rootSeo();
    } else {
      rootSeo();
    }
    if (products.length) addCrawlableProductLinks(products);
  };

  fetch("/api/products")
    .then((response) => response.ok ? response.json() : [])
    .then((list: SeoProduct[]) => {
      products = Array.isArray(list) ? list : [];
      setJsonLd("catalog", {
        "@context": "https://schema.org",
        "@type": "ItemList",
        name: "Каталог SATORI",
        itemListElement: products.slice(0, 50).map((product, index) => ({
          "@type": "ListItem",
          position: index + 1,
          url: `${SITE_URL}/?p=${encodeURIComponent(String(product.id))}`,
          name: product.name
        }))
      });
      apply();
    })
    .catch(() => apply());

  const observer = new MutationObserver(() => {
    if (products.length) addCrawlableProductLinks(products);
  });
  const root = document.getElementById("root");
  if (root) observer.observe(root, { childList: true, subtree: true });

  window.addEventListener("popstate", apply);
  window.addEventListener("pageshow", apply);
  window.setTimeout(apply, 0);
}
