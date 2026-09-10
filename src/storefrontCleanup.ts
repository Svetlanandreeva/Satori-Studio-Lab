const normalize = (value: string) => value.replace(/\s+/g, " ").trim();

const LEGACY_COPY = new Map<string, string>([
  ["3D-СТУДИЯ · ЕКАТЕРИНБУРГ", "СТУДИЯ ПРЕДМЕТНОГО ДИЗАЙНА · ЕКАТЕРИНБУРГ"],
  [
    "«Сатори» — японское слово для мгновенного озарения. Каждое изделие: от 3D-модели в Nomad Sculpt до финишной обработки руками мастера.",
    "SATORI — студия предметного дизайна и интерьерных объектов. Создаём свет, декор, мебель и предметы для пространства, сочетая ручную работу, разные материалы и проверенное производство.",
  ],
  ["Концепция в Nomad Sculpt", "Идея и эскиз"],
  [
    "Органическое 3D-лепление на iPad — как настоящая скульптура, только цифровая.",
    "Разбираем задачу, пропорции, характер предмета и то, как он будет жить в пространстве.",
  ],
  ["Подготовка к печати", "Материал и технология"],
  [
    "Модель оптимизируется: стенки, поддержки, ориентация — всё влияет на прочность.",
    "Подбираем материал и способ изготовления под форму, тактильность, прочность и бюджет.",
  ],
  ["3D-печать", "Изготовление"],
  [
    "FDM или смоляная печать в зависимости от объекта. Слой за слоем.",
    "Ручная работа, формование, литьё, шитьё, печать, сборка или фабричное производство — в зависимости от предмета и тиража.",
  ],
  [
    "Расскажите об идее — обсудим детали, согласуем 3D-модель до начала производства.",
    "Расскажите об идее — подберём материал и технологию, согласуем внешний вид, размеры и производство.",
  ],
  ["Опт и корпоративные подарки", "Мебель и предметы для бизнеса"],
  [
    "Поставляем авторские 3D-объекты магазинам и шоурумам, а также делаем брендированные подарки для компаний — от небольшой партии до постоянного сотрудничества.",
    "Комплектуем интерьерные проекты для бизнеса: мебель, свет, декор и брендированные предметы. Работаем со своей мастерской и фабриками в России и Китае — от единичного объекта до тиража и комплексной поставки.",
  ],
]);

const DELIVERY_OLD = "Стоимость доставки рассчитывается при оформлении заказа и зависит от региона и веса.";
const DELIVERY_NEW = "Стоимость доставки рассчитывается отдельно после оформления заказа и зависит от региона, способа доставки и веса. Перед отправкой согласуем стоимость с вами.";

function replaceLegacyCopy(root: ParentNode = document) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (node instanceof Text) nodes.push(node);
  }

  for (const textNode of nodes) {
    const raw = textNode.nodeValue;
    if (!raw) continue;

    const replacement = LEGACY_COPY.get(normalize(raw));
    if (replacement) {
      textNode.nodeValue = replacement;
      continue;
    }

    let updated = raw;
    if (updated.includes(DELIVERY_OLD)) updated = updated.replace(DELIVERY_OLD, DELIVERY_NEW);
    updated = updated.replace(/©\s*2024\s+Сатори/g, `© ${new Date().getFullYear()} Сатори`);
    if (updated !== raw) textNode.nodeValue = updated;
  }
}

function removeQuickBuy() {
  document.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
    if (normalize(button.textContent || "") === "Купить в 1 клик") button.remove();
  });
}

function removeBrandVideoLink() {
  document.querySelectorAll<HTMLElement>("span").forEach((span) => {
    if (normalize(span.textContent || "") !== "Смотреть видео о бренде") return;
    const floating = span.closest<HTMLElement>("div.absolute");
    (floating ?? span).remove();
  });
}

function removeFloatingTelegram() {
  document.querySelectorAll<HTMLAnchorElement>('a[href*="t.me/she_knows_s"]').forEach((link) => {
    // Telegram remains available in the footer/contact block. Only the floating
    // fixed CTA is removed from the storefront.
    if (link.classList.contains("fixed") || getComputedStyle(link).position === "fixed") link.remove();
  });
}

function silenceLegacyHeroMediaWhenCarouselIsActive() {
  document.querySelectorAll<HTMLElement>(".satori-hero-carousel-layer").forEach((carousel) => {
    const host = carousel.parentElement;
    if (!host) return;
    Array.from(host.children).forEach((child) => {
      if (child === carousel) return;
      if (child.matches("picture, video, img")) {
        const el = child as HTMLElement;
        el.style.opacity = "0";
        el.style.pointerEvents = "none";
        if (el instanceof HTMLVideoElement) {
          el.loop = false;
          el.pause();
        }
      }
    });
  });
}

function scan() {
  replaceLegacyCopy();
  removeQuickBuy();
  removeBrandVideoLink();
  removeFloatingTelegram();
  silenceLegacyHeroMediaWhenCarouselIsActive();
}

let scheduled = false;
function scheduleScan() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    scan();
  });
}

export function startStorefrontCleanup() {
  if (window.location.pathname.startsWith("/admin")) return;
  const root = document.getElementById("root");
  if (!root) return;

  scan();
  const observer = new MutationObserver(scheduleScan);
  observer.observe(root, { childList: true, subtree: true, characterData: true });
  window.addEventListener("popstate", scheduleScan);
  window.addEventListener("pageshow", scheduleScan);
}
