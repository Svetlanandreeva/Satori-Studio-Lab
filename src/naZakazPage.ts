type ProductMedia = {
  id?: number;
  name?: string;
  description?: string;
  price?: number;
  img?: string;
  imgs?: string[];
};

type GalleryMedia = { id?: string; url?: string };
type HeroMedia = { type?: string | null; url?: string | null; slides?: Array<{ type?: string; url?: string }> };
type MediaItem = { url: string; name?: string; description?: string };

const PAGE_PATH = "/na-zakaz";
const LEGACY_PATH = "/custom";
const TELEGRAM_URL = "https://t.me/she_knows_s";
const WHATSAPP_URL = "https://wa.me/79935195141";
const FALLBACK_REAL_IMAGE = "/uploads/808b2dea-fe9a-4a1d-a04c-b0df28a0947a.png";

let mediaPromise: Promise<MediaItem[]> | null = null;
let rendering = false;

function cleanPath() {
  const path = window.location.pathname;
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

function norm(value: string | null | undefined) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function escapeHtml(value: string | null | undefined) {
  return (value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function realUploadUrl(raw?: string | null) {
  if (!raw) return null;
  const url = raw.split("#")[0];
  if (!url.includes("/uploads/")) return null;
  return url;
}

function uniqueMedia(items: MediaItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.url;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function loadRealMedia() {
  if (mediaPromise) return mediaPromise;
  mediaPromise = Promise.all([
    fetch("/api/products", { cache: "no-store" }).then((r) => r.ok ? r.json() : []).catch(() => []),
    fetch("/api/gallery", { cache: "no-store" }).then((r) => r.ok ? r.json() : []).catch(() => []),
    fetch("/api/hero", { cache: "no-store" }).then((r) => r.ok ? r.json() : {}).catch(() => ({})),
  ]).then(([productsRaw, galleryRaw, heroRaw]) => {
    const products = (Array.isArray(productsRaw) ? productsRaw : []) as ProductMedia[];
    const gallery = (Array.isArray(galleryRaw) ? galleryRaw : []) as GalleryMedia[];
    const hero = (heroRaw || {}) as HeroMedia;

    const productItems: MediaItem[] = products
      .slice()
      .sort((a, b) => Number(b.price || 0) - Number(a.price || 0))
      .flatMap((product) => {
        const urls = [product.img, ...(product.imgs || [])]
          .map(realUploadUrl)
          .filter((url): url is string => Boolean(url));
        return urls.map((url) => ({
          url,
          name: product.name,
          description: product.description,
        }));
      });

    const galleryItems: MediaItem[] = gallery
      .map((item) => realUploadUrl(item.url))
      .filter((url): url is string => Boolean(url))
      .map((url) => ({ url }));

    const heroUrls = [
      hero.type === "image" ? hero.url : null,
      ...(hero.slides || []).filter((slide) => slide.type === "image").map((slide) => slide.url),
    ]
      .map(realUploadUrl)
      .filter((url): url is string => Boolean(url))
      .map((url) => ({ url }));

    return uniqueMedia([...productItems, ...galleryItems, ...heroUrls, { url: FALLBACK_REAL_IMAGE }]);
  });
  return mediaPromise;
}

function findCustomPageRoot() {
  const headings = Array.from(document.querySelectorAll<HTMLHeadingElement>("h1"));
  const heading = headings.find((el) => norm(el.textContent).toLowerCase() === "изделие на заказ");
  if (!heading) return null;
  return heading.closest<HTMLElement>(".pt-14.min-h-screen") || heading.parentElement?.parentElement || null;
}

function mediaAt(media: MediaItem[], index: number) {
  return media[index % Math.max(media.length, 1)] || { url: FALLBACK_REAL_IMAGE };
}

function portfolioCaption(item: MediaItem, index: number) {
  if (item.name) {
    return `Задача: изготовить «${item.name}» и довести форму до готового светового объекта.`;
  }
  const captions = [
    "Задача: разработать световой объект под размеры и характер пространства.",
    "Задача: собрать выразительный свет с индивидуальной формой и мягким свечением.",
    "Задача: адаптировать референс под реальное производство и безопасную электрику.",
    "Задача: сделать объект света, который работает и как функциональный свет, и как акцент.",
    "Задача: подобрать конструкцию и материал под заданный визуальный эффект.",
    "Задача: подготовить изделие к производству без потери исходной идеи.",
    "Задача: создать свет под конкретную зону интерьера и заданные габариты.",
    "Задача: собрать единый объект из формы, света и крепления под проект.",
    "Задача: реализовать нестандартную форму и довести её до готового изделия.",
  ];
  return captions[index % captions.length];
}

function buildPortfolio(media: MediaItem[]) {
  const count = Math.min(9, Math.max(6, media.length));
  const items = Array.from({ length: count }, (_, i) => mediaAt(media, i));
  return items.map((item, i) => `
    <article class="satori-nz-work">
      <div class="satori-nz-work-media"><img src="${escapeHtml(item.url)}" alt="Работа SATORI ${i + 1}" loading="lazy"></div>
      <p>${escapeHtml(portfolioCaption(item, i))}</p>
    </article>
  `).join("");
}

function pageMarkup(media: MediaItem[]) {
  const hero = mediaAt(media, 0);
  const cardImages = [1, 2, 3, 4].map((i) => mediaAt(media, i));
  return `
    <div class="satori-nz-page">
      <section class="satori-nz-hero" style="--satori-nz-hero:url('${escapeHtml(hero.url)}')">
        <div class="satori-nz-hero-shade"></div>
        <div class="satori-nz-hero-copy">
          <p class="satori-nz-kicker">SATORI · СВЕТ НА ЗАКАЗ</p>
          <h1>Сделаем любой свет на заказ: от лампы до инсталляции</h1>
          <p class="satori-nz-lead">Люстры, бра, торшеры, светильники для ресторанов и световые арт-объекты. По вашему эскизу или с нуля.</p>
          <a class="satori-nz-primary" href="#zayavka">Обсудить проект</a>
        </div>
      </section>

      <nav class="satori-nz-quick" aria-label="Быстрые ссылки по странице">
        <a href="#lyustry">Люстры</a>
        <a href="#horeca">HoReCa</a>
        <a href="#installyacii">Инсталляции</a>
        <a href="#kak-rabotaem">Как работаем</a>
        <a href="#b2b">Для бизнеса</a>
        <a href="#zayavka">Заявка</a>
      </nav>

      <section class="satori-nz-section satori-nz-what">
        <div class="satori-nz-section-head">
          <p class="satori-nz-kicker satori-nz-kicker-dark">ЧТО ДЕЛАЕМ</p>
          <h2>Свет от одного предмета до большой серии</h2>
        </div>
        <div class="satori-nz-card-grid">
          <article id="lyustry" class="satori-nz-photo-card">
            <img src="${escapeHtml(cardImages[0].url)}" alt="Люстры и подвесы на заказ" loading="lazy">
            <div><span>01</span><h3>Люстры и подвесы</h3></div>
          </article>
          <article class="satori-nz-photo-card">
            <img src="${escapeHtml(cardImages[1].url)}" alt="Бра, торшеры и настольные светильники на заказ" loading="lazy">
            <div><span>02</span><h3>Бра, торшеры и настольные</h3></div>
          </article>
          <article id="horeca" class="satori-nz-photo-card">
            <img src="${escapeHtml(cardImages[2].url)}" alt="Серийные светильники для ресторанов и отелей" loading="lazy">
            <div><span>03</span><h3>Для ресторанов и отелей серийно</h3></div>
          </article>
          <article id="installyacii" class="satori-nz-photo-card">
            <img src="${escapeHtml(cardImages[3].url)}" alt="Световые инсталляции и логотипы" loading="lazy">
            <div><span>04</span><h3>Инсталляции и световые логотипы</h3></div>
          </article>
        </div>
      </section>

      <section id="kak-rabotaem" class="satori-nz-section satori-nz-process">
        <div class="satori-nz-section-head satori-nz-section-head-row">
          <div><p class="satori-nz-kicker satori-nz-kicker-dark">КАК РАБОТАЕМ</p><h2>Понятный путь от идеи до монтажа</h2></div>
          <p>Срок зависит от конструкции, материала и тиража. До старта производства фиксируем этапы и календарь проекта.</p>
        </div>
        <div class="satori-nz-steps">
          <article><b>01</b><h3>Заявка</h3><p>Референс, размеры, задача.</p><small>1–2 рабочих дня</small></article>
          <article><b>02</b><h3>3D-макет</h3><p>Форма, узлы, свет и крепления.</p><small>2–5 рабочих дней</small></article>
          <article><b>03</b><h3>Образец</h3><p>Прототип или тест материала, если нужен.</p><small>3–7 рабочих дней</small></article>
          <article><b>04</b><h3>Производство</h3><p>Изготовление, сборка и проверка.</p><small>7–21 рабочий день</small></article>
          <article><b>05</b><h3>Доставка по РФ</h3><p>Упаковка и отправка выбранной службой.</p><small>2–7 дней</small></article>
        </div>
      </section>

      <section class="satori-nz-section satori-nz-portfolio">
        <div class="satori-nz-section-head satori-nz-section-head-row">
          <div><p class="satori-nz-kicker satori-nz-kicker-dark">ПОРТФОЛИО</p><h2>Реальные работы SATORI</h2></div>
          <p>Без фотостока: здесь используются только изображения, загруженные в каталог и галерею студии.</p>
        </div>
        <div class="satori-nz-work-grid">${buildPortfolio(media)}</div>
      </section>

      <section id="b2b" class="satori-nz-section satori-nz-b2b">
        <div class="satori-nz-b2b-main">
          <p class="satori-nz-kicker">ДЛЯ БИЗНЕСА И ДИЗАЙНЕРОВ</p>
          <h2>Можем быть производством внутри вашего проекта</h2>
          <p>Работаем по договору, принимаем заказы от юрлиц и ИП, делаем единичные объекты и серийные партии. Для дизайнеров и бюро — отдельные условия и сопровождение от технической проработки до поставки.</p>
          <a href="#zayavka" class="satori-nz-secondary">Отправить проект на расчёт</a>
        </div>
        <div class="satori-nz-b2b-notes">
          <div><span>01</span><b>От 1 экземпляра</b><p>Можно начать с одного объекта или прототипа.</p></div>
          <div><span>02</span><b>Серии под проект</b><p>Объём партии рассчитываем под технологию и срок.</p></div>
          <div><span>03</span><b>Документы</b><p>Фиксируем состав работ, стоимость и сроки в договоре.</p></div>
        </div>
      </section>

      <section class="satori-nz-section satori-nz-price">
        <div class="satori-nz-section-head">
          <p class="satori-nz-kicker satori-nz-kicker-dark">СКОЛЬКО СТОИТ</p>
          <h2>Ориентиры до расчёта проекта</h2>
          <p>Это не прайс: финальная стоимость зависит от размера, материала, электрики, сложности формы и тиража.</p>
        </div>
        <div class="satori-nz-price-grid">
          <article><span>НАСТОЛЬНЫЙ СВЕТ</span><strong>от 7 000 ₽</strong></article>
          <article><span>ЛЮСТРА / ПОДВЕС</span><strong>от 25 000 ₽</strong></article>
          <article><span>СЕРИЯ</span><strong>по расчёту</strong></article>
        </div>
      </section>

      <section id="zayavka" class="satori-nz-section satori-nz-form-section">
        <div class="satori-nz-form-copy">
          <p class="satori-nz-kicker satori-nz-kicker-dark">ОБСУДИТЬ ПРОЕКТ</p>
          <h2>Покажите, что хотите сделать</h2>
          <p>Можно прислать готовый эскиз, фото из интернета, рендер или описать идею словами. Мы вернёмся с уточнениями и следующим шагом.</p>
          <div class="satori-nz-messengers">
            <a href="${TELEGRAM_URL}" target="_blank" rel="noreferrer">Telegram</a>
            <a href="${WHATSAPP_URL}" target="_blank" rel="noreferrer">WhatsApp</a>
          </div>
        </div>
        <div class="satori-nz-form-card">
          <form id="satori-nz-form">
            <label>ИМЯ<input name="name" required autocomplete="name" placeholder="Как вас зовут"></label>
            <label>ТЕЛЕФОН ИЛИ МЕССЕНДЖЕР<input name="contact" required placeholder="+7 900 000-00-00 или @telegram"></label>
            <label>ЧТО ХОТИТЕ СДЕЛАТЬ<textarea name="idea" required rows="5" placeholder="Тип светильника, размеры, количество, где будет использоваться..."></textarea></label>
            <label class="satori-nz-file">ЭСКИЗ ИЛИ РЕФЕРЕНС <span>(НЕОБЯЗАТЕЛЬНО)</span><input name="reference" type="file" accept="image/jpeg,image/png,image/webp"><small>JPG, PNG или WEBP. Для заявки сохраняем облегчённое превью.</small></label>
            <label class="satori-nz-check"><input name="professional" type="checkbox"><span>Я от компании / дизайнер</span></label>
            <p class="satori-nz-form-status" aria-live="polite"></p>
            <button type="submit" class="satori-nz-primary satori-nz-submit">Отправить заявку</button>
            <p class="satori-nz-privacy">Отправляя форму, вы соглашаетесь с обработкой данных для ответа на заявку.</p>
          </form>
        </div>
      </section>

      <section class="satori-nz-section satori-nz-faq">
        <div class="satori-nz-section-head"><p class="satori-nz-kicker satori-nz-kicker-dark">FAQ</p><h2>Перед заявкой</h2></div>
        <div class="satori-nz-faq-list">
          <details><summary>Сколько занимает изготовление?</summary><p>Простой предмет обычно занимает от 2 недель. Сложная люстра, образец или серия — дольше. Точный срок фиксируем после технической проработки.</p></details>
          <details><summary>Какой минимальный заказ?</summary><p>От одного изделия. Для серийных проектов можем сначала сделать образец, а после согласования запустить партию.</p></details>
          <details><summary>Можно сделать по фото из интернета?</summary><p>Да. Фото или референс используем как отправную точку: адаптируем размеры, конструкцию, материал и электрику под реальное производство.</p></details>
          <details><summary>Как доставляете?</summary><p>Отправляем по России. Способ доставки и упаковку выбираем под габариты и хрупкость конкретного изделия.</p></details>
          <details><summary>Есть гарантия?</summary><p>На электрическую часть светильников — 1 год. Производственные дефекты разбираем отдельно и остаёмся на связи после получения заказа.</p></details>
        </div>
      </section>
    </div>
  `;
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Не удалось обработать изображение"));
    image.src = src;
  });
}

async function compactReference(file: File) {
  if (file.size > 8 * 1024 * 1024) throw new Error("Референс должен быть меньше 8 МБ");
  const source = await readFileAsDataUrl(file);
  const image = await loadImage(source);
  let scale = Math.min(1, 900 / Math.max(image.naturalWidth, image.naturalHeight));
  let quality = 0.68;
  let result = "";

  for (let attempt = 0; attempt < 7; attempt += 1) {
    const width = Math.max(280, Math.round(image.naturalWidth * scale));
    const height = Math.max(280, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Не удалось обработать изображение");
    ctx.fillStyle = "#f6f0e8";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);
    result = canvas.toDataURL("image/jpeg", quality);
    if (result.length <= 60000) return result;
    scale *= 0.82;
    quality = Math.max(0.38, quality - 0.07);
  }

  if (result.length > 72000) throw new Error("Не удалось уменьшить референс. Попробуйте более лёгкое изображение.");
  return result;
}

function scrollToHash() {
  const id = window.location.hash.replace(/^#/, "");
  if (!id) return;
  window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: "start" }), 80);
}

function bindPage(root: HTMLElement) {
  root.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach((link) => {
    link.addEventListener("click", (event) => {
      const hash = link.getAttribute("href") || "";
      const target = document.getElementById(hash.slice(1));
      if (!target) return;
      event.preventDefault();
      history.replaceState({}, "", `${PAGE_PATH}${hash}`);
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  const form = root.querySelector<HTMLFormElement>("#satori-nz-form");
  if (!form) return;
  const status = form.querySelector<HTMLElement>(".satori-nz-form-status");
  const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submit?.disabled) return;
    if (submit) submit.disabled = true;
    if (status) { status.textContent = "Отправляем…"; status.className = "satori-nz-form-status"; }

    try {
      const data = new FormData(form);
      const name = String(data.get("name") || "").trim();
      const contact = String(data.get("contact") || "").trim();
      const idea = String(data.get("idea") || "").trim();
      const professional = data.get("professional") === "on";
      const file = data.get("reference") instanceof File ? data.get("reference") as File : null;
      let referenceDataUrl: string | undefined;
      let referenceName: string | undefined;
      if (file && file.size > 0) {
        referenceDataUrl = await compactReference(file);
        referenceName = file.name;
      }

      const ideaWithMeta = [
        idea,
        professional ? "Клиент: компания / дизайнер." : "",
        referenceName ? `Референс прикреплён: ${referenceName}.` : "",
      ].filter(Boolean).join("\n\n");

      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "custom",
          name,
          phone: contact,
          contact,
          idea: ideaWithMeta,
          professional,
          referenceName,
          referenceDataUrl,
          source: "na-zakaz",
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Не удалось отправить заявку");

      (window as any).ym?.(110458266, "reachGoal", "lead_custom_submitted");
      form.reset();
      if (status) {
        status.textContent = "Заявка отправлена. Свяжемся с вами и уточним детали проекта.";
        status.className = "satori-nz-form-status is-success";
      }
    } catch (error) {
      if (status) {
        status.textContent = error instanceof Error ? error.message : "Не удалось отправить заявку";
        status.className = "satori-nz-form-status is-error";
      }
    } finally {
      if (submit) submit.disabled = false;
    }
  });
}

async function enhanceNaZakazPage() {
  const path = cleanPath();
  if (path !== PAGE_PATH && path !== LEGACY_PATH) return;
  const target = findCustomPageRoot();
  if (!target || target.querySelector(".satori-nz-page") || rendering) return;

  rendering = true;
  try {
    const media = await loadRealMedia();
    if (!target.isConnected || (cleanPath() !== PAGE_PATH && cleanPath() !== LEGACY_PATH)) return;
    target.innerHTML = pageMarkup(media);
    target.dataset.satoriNaZakaz = "1";
    bindPage(target);
    scrollToHash();
  } finally {
    rendering = false;
  }
}

export function startNaZakazPage() {
  if (window.location.pathname.startsWith("/admin")) return;
  void enhanceNaZakazPage();

  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      void enhanceNaZakazPage();
    });
  };

  const root = document.getElementById("root");
  if (root) new MutationObserver(schedule).observe(root, { childList: true, subtree: true });
  window.addEventListener("satori-route-change", schedule);
  window.addEventListener("hashchange", scrollToHash);
  window.addEventListener("pageshow", schedule);
}
