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

type RouteSeo = {
  title: string;
  description: string;
};

const SITE_URL = "https://satorilabural.ru";
const ROOT_TITLE = "SATORI — светильники, декор и мебель на заказ";
const ROOT_DESCRIPTION = "SATORI — интерьерная студия: авторские светильники, декор и мебель на заказ. Индивидуальный дизайн, производство в России и Китае, доставка по России.";

const ROUTE_SEO: Record<string, RouteSeo> = {
  "/": {
    title: ROOT_TITLE,
    description: ROOT_DESCRIPTION,
  },
  "/catalog": {
    title: "Авторские светильники, декор и предметы интерьера | SATORI",
    description: "Каталог SATORI: авторские светильники, декор, украшения и интерьерные объекты. Ручная работа, небольшие серии и доставка по России.",
  },
  "/limited": {
    title: "Лимитированные предметы интерьера | SATORI",
    description: "Лимитированные серии SATORI: свет, декор и коллекционные интерьерные объекты небольшими тиражами.",
  },
  "/custom": {
    title: "Мебель и предметы интерьера на заказ | SATORI",
    description: "Создадим мебель, свет, декор или интерьерный объект под ваш проект. Материалы, размеры, цвет и отделка под задачу; производство в России и Китае.",
  },
  "/business": {
    title: "Мебель и интерьерные объекты для бизнеса | SATORI",
    description: "SATORI для дизайнеров и бизнеса: мебель, свет, декор, комплектация и индивидуальные тиражи. Производство и фабрики в России и Китае.",
  },
  "/about": {
    title: "О студии предметного дизайна SATORI",
    description: "SATORI — студия предметного дизайна и интерьерных объектов. Создаём авторский свет, декор, мебель и изделия под проект.",
  },
  "/faq": {
    title: "Вопросы об изготовлении и заказе | SATORI",
    description: "Ответы SATORI о материалах, индивидуальном изготовлении, сроках, оплате, доставке и уходе за интерьерными объектами.",
  },
  "/delivery": {
    title: "Оплата и доставка | SATORI",
    description: "Условия оплаты и доставки заказов SATORI по Екатеринбургу и России: способы доставки, сроки и получение заказа.",
  },
};

function cleanPath() {
  const pathname = window.location.pathname;
  return pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

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

function sectionSeo() {
  const path = cleanPath();
  const seo = ROUTE_SEO[path] || ROUTE_SEO["/"];
  const canonicalPath = ROUTE_SEO[path] ? path : "/";
  const canonical = `${SITE_URL}${canonicalPath === "/" ? "/" : canonicalPath}`;

  document.title = seo.title;
  setMeta('meta[name="description"]', "content", seo.description);
  setMeta('meta[name="robots"]', "content", "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1");
  setMeta('meta[property="og:type"]', "content", "website");
  setMeta('meta[property="og:title"]', "content", seo.title);
  setMeta('meta[property="og:description"]', "content", seo.description);
  setMeta('meta[property="og:image"]', "content", `${SITE_URL}/og-image.png`);
  setMeta('meta[property="og:url"]', "content", canonical);
  setMeta('meta[name="twitter:title"]', "content", seo.title);
  setMeta('meta[name="twitter:description"]', "content", seo.description);
  setMeta('meta[name="twitter:image"]', "content", `${SITE_URL}/og-image.png`);
  setCanonical(canonical);
  removeJsonLd("product");
}

function productSeo(product: SeoProduct) {
  const canonical = `${SITE_URL}/product/${encodeURIComponent(String(product.id))}`;
  const title = `${product.name} — ${product.category || "предмет интерьера"} | SATORI`;
  const fallback = `${product.name} от SATORI. Авторский предмет интерьера, ручная работа и производство под заказ с доставкой по России.`;
  const description = (product.description || fallback).replace(/\s+/g, " ").trim().slice(0, 170);
  const image = absoluteUrl(product.img || product.imgs?.[0]);

  document.title = title;
  setMeta('meta[name="description"]', "content", description);
  setMeta('meta[name="robots"]', "content", "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1");
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

function currentProductId() {
  const pathMatch = cleanPath().match(/^\/product\/(\d+)$/);
  if (pathMatch) return pathMatch[1];
  return new URLSearchParams(window.location.search).get("p");
}

function addCrawlableProductLinks(products: SeoProduct[]) {
  const cards = Array.from(document.querySelectorAll<HTMLElement>(".cursor-pointer.group"));
  for (const card of cards) {
    const product = products.find((p) => {
      const text = card.textContent?.replace(/\s+/g, " ").trim().toLowerCase() || "";
      return text.includes(p.name.toLowerCase());
    });
    if (!product) continue;

    if (card.dataset.productSeoBound !== "1") {
      card.dataset.productSeoBound = "1";
      card.dataset.productSeoId = String(product.id);
      card.addEventListener("click", () => {
        const next = `/product/${encodeURIComponent(String(product.id))}`;
        if (cleanPath() !== next) {
          history.pushState({}, "", next);
          window.dispatchEvent(new Event("satori-route-change"));
        }
      });
    }

    if (card.querySelector("a[data-product-seo-link]")) continue;
    const titleNode = Array.from(card.querySelectorAll<HTMLElement>("p,h2,h3")).find((el) =>
      el.textContent?.trim().toLowerCase() === product.name.toLowerCase() ||
      el.textContent?.trim().toLowerCase() === product.name.toUpperCase().toLowerCase()
    );
    if (!titleNode || titleNode.querySelector("a")) continue;

    const anchor = document.createElement("a");
    anchor.href = `/product/${encodeURIComponent(String(product.id))}`;
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
    const productId = currentProductId();
    if (productId && products.length) {
      const product = products.find((p) => String(p.id) === productId);
      if (product) productSeo(product);
      else sectionSeo();
    } else {
      sectionSeo();
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
        itemListElement: products.slice(0, 100).map((product, index) => ({
          "@type": "ListItem",
          position: index + 1,
          url: `${SITE_URL}/product/${encodeURIComponent(String(product.id))}`,
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
  window.addEventListener("satori-route-change", apply);
  window.setTimeout(apply, 0);
}
