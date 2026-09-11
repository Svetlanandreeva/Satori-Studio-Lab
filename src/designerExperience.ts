const DESIGNERS_PATH = "/designers";
const STYLE_ID = "satori-designer-experience-styles";

function norm(value: string | null | undefined) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function cleanPath() {
  const p = window.location.pathname;
  return p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p;
}

function findButton(labels: string[], root: ParentNode = document) {
  const wanted = labels.map((label) => label.toLowerCase());
  return Array.from(root.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
    wanted.includes(norm(button.textContent).toLowerCase()),
  );
}

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .satori-pro-wrap{margin:34px 0 44px;font-family:Inter,sans-serif;color:#1A1412}
    .satori-pro-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
    .satori-pro-card{background:#fff;border:1px solid rgba(0,0,0,.08);border-radius:18px;padding:22px;min-height:178px}
    .satori-pro-card--dark{background:#1B1714;color:#ECE6DF;border-color:rgba(255,255,255,.08)}
    .satori-pro-kicker{font-size:10px;font-weight:700;letter-spacing:.16em;color:#8F8578;margin:0 0 10px}
    .satori-pro-card--dark .satori-pro-kicker{color:#B3A89A}
    .satori-pro-title{font-family:'Playfair Display',serif;font-size:23px;line-height:1.18;font-weight:600;margin:0 0 10px}
    .satori-pro-copy{font-size:12px;line-height:1.7;color:#6B6255;margin:0}
    .satori-pro-card--dark .satori-pro-copy{color:#B3A89A}
    .satori-pro-pills{display:flex;flex-wrap:wrap;gap:8px;margin-top:18px}
    .satori-pro-pill{border:1px solid rgba(0,0,0,.12);border-radius:999px;padding:7px 10px;font-size:10px;line-height:1;color:#4F473F;background:rgba(255,255,255,.55)}
    .satori-pro-card--dark .satori-pro-pill{border-color:rgba(255,255,255,.15);color:#D8CFC5;background:rgba(255,255,255,.03)}
    .satori-pro-steps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:18px}
    .satori-pro-step{padding:18px;border-radius:15px;background:#F7F3EE;border:1px solid rgba(0,0,0,.07)}
    .satori-pro-step-n{font:700 9px/1 'IBM Plex Mono',monospace;color:#8F8578;margin-bottom:10px}
    .satori-pro-step-t{font-size:13px;font-weight:700;margin-bottom:5px}
    .satori-pro-step-d{font-size:11px;line-height:1.55;color:#6B6255}
    .satori-pro-cta{display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:999px;padding:13px 22px;background:#1A1412;color:#ECE6DF;font:700 12px/1 Inter,sans-serif;cursor:pointer}
    .satori-pro-cta:hover{filter:brightness(1.15)}
    .satori-pro-cta--light{background:#ECE6DF;color:#1A1412}
    .satori-pro-home{margin:0 24px 64px;padding:34px;border-radius:24px;background:linear-gradient(145deg,#171310,#2B2119);color:#ECE6DF}
    .satori-pro-home-inner{max-width:1180px;margin:0 auto}
    .satori-pro-home-head{display:flex;gap:28px;justify-content:space-between;align-items:end;margin-bottom:24px}
    .satori-pro-home h2{font-family:'Playfair Display',serif;font-size:30px;line-height:1.12;font-weight:600;max-width:680px;margin:0}
    .satori-pro-home p{color:#B3A89A;font-size:12px;line-height:1.65}
    .satori-pro-home .satori-pro-card{background:rgba(255,255,255,.045);border-color:rgba(255,255,255,.09);color:#ECE6DF}
    .satori-pro-home .satori-pro-copy{color:#B3A89A}
    .satori-pro-form-intro{margin:34px 0 18px;padding-top:30px;border-top:1px solid rgba(0,0,0,.09)}
    @media(min-width:768px){.satori-pro-home{margin-left:56px;margin-right:56px}}
    @media(min-width:1280px){.satori-pro-home{margin-left:clamp(56px,6vw,120px);margin-right:clamp(56px,6vw,120px)}}
    @media(max-width:767px){
      .satori-pro-grid,.satori-pro-steps{grid-template-columns:1fr}
      .satori-pro-home{margin:0 24px 44px;padding:24px 18px}
      .satori-pro-home-head{display:block}
      .satori-pro-home h2{font-size:25px;margin-bottom:12px}
      .satori-pro-card{min-height:0}
    }
  `;
  document.head.appendChild(style);
}

function openDesignersPage() {
  const business = findButton(["Бизнесу"]);
  if (business) business.click();
  history.replaceState({}, "", DESIGNERS_PATH);
  window.dispatchEvent(new Event("satori-route-change"));
  window.setTimeout(enhanceDesignerPage, 0);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function bindDesignerOpen(el: HTMLElement) {
  if (el.dataset.satoriDesignerBound === "1") return;
  el.dataset.satoriDesignerBound = "1";
  el.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    openDesignersPage();
  });
}

function ensureNavEntry() {
  const header = document.querySelector("header");
  if (!header) return;

  const nav = header.querySelector("nav");
  const businessDesktop = nav ? findButton(["Бизнесу"], nav) : undefined;
  if (nav && businessDesktop && !nav.querySelector("[data-satori-designers-nav]")) {
    const button = document.createElement("button");
    button.textContent = "Дизайнерам";
    button.className = businessDesktop.className;
    button.style.cssText = businessDesktop.style.cssText;
    button.dataset.satoriDesignersNav = "1";
    bindDesignerOpen(button);
    nav.insertBefore(button, businessDesktop);
  }

  const mobileBusiness = Array.from(header.querySelectorAll<HTMLButtonElement>("button")).find((button) => {
    return norm(button.textContent) === "Бизнесу" && button !== businessDesktop;
  });
  if (mobileBusiness && !mobileBusiness.parentElement?.querySelector("[data-satori-designers-mobile]")) {
    const button = document.createElement("button");
    button.textContent = "Дизайнерам";
    button.className = mobileBusiness.className;
    button.style.cssText = mobileBusiness.style.cssText;
    button.dataset.satoriDesignersMobile = "1";
    bindDesignerOpen(button);
    mobileBusiness.parentElement?.insertBefore(button, mobileBusiness);
  }
}

function enhanceHome() {
  if (cleanPath() !== "/") return;
  if (document.querySelector(".satori-pro-home")) return;

  const heading = Array.from(document.querySelectorAll<HTMLElement>("h2,h3")).find((el) => {
    const text = norm(el.textContent).toLowerCase();
    return text.includes("нет в каталоге") || text.includes("не нашли нужный объект");
  });
  const anchor = heading?.closest("section");
  if (!anchor) return;

  const section = document.createElement("section");
  section.className = "satori-pro-home";
  section.innerHTML = `
    <div class="satori-pro-home-inner">
      <div class="satori-pro-home-head">
        <div>
          <p class="satori-pro-kicker" style="color:#B3A89A">ДИЗАЙНЕРАМ И АРХИТЕКТОРАМ · РОССИЯ + КИТАЙ</p>
          <h2>Если нужного решения нет на рынке — мы найдём способ его реализовать.</h2>
        </div>
        <div style="max-width:360px">
          <p style="margin:0 0 14px">От референса и визуализации до готового предмета: свет, мебель, декор и нестандартные интерьерные объекты.</p>
          <button class="satori-pro-cta satori-pro-cta--light" data-satori-designer-open>Отправить проект на расчёт</button>
        </div>
      </div>
      <div class="satori-pro-grid">
        <article class="satori-pro-card"><p class="satori-pro-kicker">01 · НАЙТИ</p><h3 class="satori-pro-title">Подбор по референсу</h3><p class="satori-pro-copy">Ищем подходящее готовое решение у производств и фабрик в России и Китае с учётом размеров, материалов и бюджета.</p></article>
        <article class="satori-pro-card"><p class="satori-pro-kicker">02 · АДАПТИРОВАТЬ</p><h3 class="satori-pro-title">Изменить под проект</h3><p class="satori-pro-copy">Корректируем размер, цвет, фактуру, отделку, фурнитуру и конструктив, если готовая модель почти подходит.</p></article>
        <article class="satori-pro-card"><p class="satori-pro-kicker">03 · СОЗДАТЬ</p><h3 class="satori-pro-title">Произвести с нуля</h3><p class="satori-pro-copy">Технически прорабатываем идею, делаем 3D или прототип, подбираем технологию и организуем производство и поставку.</p></article>
      </div>
    </div>`;
  section.querySelectorAll<HTMLElement>("[data-satori-designer-open]").forEach(bindDesignerOpen);
  anchor.insertAdjacentElement("afterend", section);
}

function setDesignerMeta() {
  if (cleanPath() !== DESIGNERS_PATH) return;
  document.title = "Дизайнерам и архитекторам — производство и комплектация | SATORI";
  const description = "SATORI для дизайнеров и архитекторов: мебель, свет, декор и нестандартные интерьерные объекты по проекту. Подбор, адаптация и производство в России и Китае.";
  let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "description";
    document.head.appendChild(meta);
  }
  meta.content = description;
  let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement("link");
    canonical.rel = "canonical";
    document.head.appendChild(canonical);
  }
  canonical.href = `${window.location.origin}${DESIGNERS_PATH}`;
}

function enhanceDesignerForm(container: HTMLElement) {
  const form = container.querySelector<HTMLFormElement>("form");
  if (!form) return;

  if (!form.previousElementSibling?.classList.contains("satori-pro-form-intro")) {
    const intro = document.createElement("div");
    intro.className = "satori-pro-form-intro";
    intro.innerHTML = `
      <p class="satori-pro-kicker">РАСЧЁТ ПРОЕКТА</p>
      <h2 class="satori-pro-title" style="font-size:28px">Отправьте проект на предварительный расчёт</h2>
      <p class="satori-pro-copy" style="max-width:680px">Пришлите ссылку на PDF, Google Drive, визуализацию или референс и укажите ориентировочные размеры, количество и сроки. Вернёмся с уточнениями и следующим шагом в течение 24 часов.</p>`;
    form.insertAdjacentElement("beforebegin", intro);
  }

  const labels = Array.from(form.querySelectorAll<HTMLLabelElement>("label"));
  const commentLabel = labels.find((label) => norm(label.textContent) === "КОММЕНТАРИЙ");
  if (commentLabel) {
    commentLabel.textContent = "ССЫЛКА НА ПРОЕКТ / ОПИСАНИЕ ЗАДАЧИ";
    const block = commentLabel.parentElement;
    const textarea = block?.querySelector<HTMLTextAreaElement>("textarea");
    if (textarea) textarea.placeholder = "Ссылка на PDF / Google Drive / референс, размеры, материалы, сроки и пожелания...";
  }
  const volumeLabel = labels.find((label) => norm(label.textContent) === "ОРИЕНТИРОВОЧНЫЙ ОБЪЁМ");
  if (volumeLabel) volumeLabel.textContent = "ТИРАЖ / МАСШТАБ ПРОЕКТА";
  const typeLabel = labels.find((label) => norm(label.textContent) === "ТИП СОТРУДНИЧЕСТВА");
  if (typeLabel) typeLabel.textContent = "ФОРМАТ ЗАДАЧИ";
}

function enhanceDesignerPage() {
  if (cleanPath() !== DESIGNERS_PATH) return;
  setDesignerMeta();

  const heading = Array.from(document.querySelectorAll<HTMLHeadingElement>("h1")).find((el) => {
    const text = norm(el.textContent).toLowerCase();
    return text.includes("мебель и предметы для бизнеса") || text.includes("опт и корпоративные подарки") || text.includes("производство и комплектация для дизайнеров");
  });
  if (!heading) return;

  heading.textContent = "Производство и комплектация для дизайнеров и архитекторов";
  const container = heading.parentElement as HTMLElement | null;
  if (!container) return;

  const eyebrow = heading.previousElementSibling as HTMLElement | null;
  if (eyebrow?.tagName === "P") eyebrow.textContent = "— ДИЗАЙНЕРАМ И АРХИТЕКТОРАМ";
  const lead = heading.nextElementSibling as HTMLParagraphElement | null;
  if (lead?.tagName === "P") {
    lead.textContent = "Берём в работу референс, рендер, чертёж или идею. Подбираем готовое решение, адаптируем существующее или организуем производство с нуля — в собственной мастерской и у проверенных производств в России и Китае.";
    lead.style.maxWidth = "760px";
  }

  if (!container.querySelector(".satori-pro-wrap")) {
    const wrap = document.createElement("div");
    wrap.className = "satori-pro-wrap";
    wrap.innerHTML = `
      <section class="satori-pro-grid" aria-label="Варианты реализации проекта">
        <article class="satori-pro-card"><p class="satori-pro-kicker">НАЙТИ</p><h2 class="satori-pro-title">Готовое решение</h2><p class="satori-pro-copy">Подбираем предмет по визуализации, референсу, размерам и бюджету среди доступных производств и фабрик.</p><div class="satori-pro-pills"><span class="satori-pro-pill">референс</span><span class="satori-pro-pill">подбор аналогов</span><span class="satori-pro-pill">Россия + Китай</span></div></article>
        <article class="satori-pro-card"><p class="satori-pro-kicker">АДАПТИРОВАТЬ</p><h2 class="satori-pro-title">Изменить под проект</h2><p class="satori-pro-copy">Меняем габариты, материал, цвет, отделку, фурнитуру и отдельные элементы конструкции под конкретный интерьер.</p><div class="satori-pro-pills"><span class="satori-pro-pill">размер</span><span class="satori-pro-pill">материал</span><span class="satori-pro-pill">отделка</span></div></article>
        <article class="satori-pro-card satori-pro-card--dark"><p class="satori-pro-kicker">СОЗДАТЬ С НУЛЯ</p><h2 class="satori-pro-title">От идеи до готового объекта</h2><p class="satori-pro-copy">Разрабатываем конструкцию, 3D или прототип, выбираем технологию, производство и доводим проект до поставки.</p><div class="satori-pro-pills"><span class="satori-pro-pill">3D</span><span class="satori-pro-pill">прототип</span><span class="satori-pro-pill">тираж</span></div></article>
      </section>

      <section style="margin-top:42px">
        <p class="satori-pro-kicker">КАК РАБОТАЕМ</p>
        <h2 class="satori-pro-title" style="font-size:28px;max-width:720px">Один процесс вместо поиска отдельных подрядчиков</h2>
        <div class="satori-pro-steps">
          <div class="satori-pro-step"><div class="satori-pro-step-n">01</div><div class="satori-pro-step-t">Получаем проект</div><div class="satori-pro-step-d">Референс, рендер, чертёж, размеры, бюджет и сроки.</div></div>
          <div class="satori-pro-step"><div class="satori-pro-step-n">02</div><div class="satori-pro-step-t">Техническая проработка</div><div class="satori-pro-step-d">Определяем конструкцию, материал и технологию изготовления.</div></div>
          <div class="satori-pro-step"><div class="satori-pro-step-n">03</div><div class="satori-pro-step-t">Расчёт</div><div class="satori-pro-step-d">Сравниваем варианты реализации и подбираем решение под бюджет.</div></div>
          <div class="satori-pro-step"><div class="satori-pro-step-n">04</div><div class="satori-pro-step-t">3D / образец</div><div class="satori-pro-step-d">При необходимости согласуем модель, материал или тестовый образец.</div></div>
          <div class="satori-pro-step"><div class="satori-pro-step-n">05</div><div class="satori-pro-step-t">Производство + QC</div><div class="satori-pro-step-d">Контролируем согласованные параметры до отгрузки.</div></div>
          <div class="satori-pro-step"><div class="satori-pro-step-n">06</div><div class="satori-pro-step-t">Упаковка и доставка</div><div class="satori-pro-step-d">Организуем поставку готового заказа в Россию и по регионам.</div></div>
        </div>
      </section>

      <section class="satori-pro-grid" style="margin-top:42px">
        <article class="satori-pro-card satori-pro-card--dark" style="grid-column:span 2">
          <p class="satori-pro-kicker">ВОЗМОЖНОСТИ ПРОИЗВОДСТВА</p>
          <h2 class="satori-pro-title" style="font-size:28px">Не ограничены одним материалом или одной технологией</h2>
          <p class="satori-pro-copy" style="max-width:700px">Подбираем способ изготовления под задачу: ручная работа, 3D-печать, формование и литьё, дерево, текстиль, металл, стекло, фабричное производство и смешанные техники.</p>
          <div class="satori-pro-pills"><span class="satori-pro-pill">свет</span><span class="satori-pro-pill">мебель</span><span class="satori-pro-pill">декор</span><span class="satori-pro-pill">арт-объекты</span><span class="satori-pro-pill">текстиль</span><span class="satori-pro-pill">дерево</span><span class="satori-pro-pill">металл</span><span class="satori-pro-pill">стекло</span><span class="satori-pro-pill">смолы</span><span class="satori-pro-pill">полимеры</span></div>
        </article>
        <article class="satori-pro-card">
          <p class="satori-pro-kicker">КОНТРОЛЬ</p>
          <h2 class="satori-pro-title">До отгрузки, а не после</h2>
          <p class="satori-pro-copy">Согласуем ключевые параметры, проверяем образец или готовую партию, фиксируем замечания до отправки и продумываем безопасную упаковку.</p>
        </article>
      </section>

      <section class="satori-pro-grid" style="margin-top:12px">
        <article class="satori-pro-card"><p class="satori-pro-kicker">ОДИН КОНТАКТ</p><h2 class="satori-pro-title">Менеджер по проекту</h2><p class="satori-pro-copy">Один контакт для вопросов по подбору, производству, согласованиям и поставке.</p></article>
        <article class="satori-pro-card"><p class="satori-pro-kicker">ДЛЯ СМЕТЫ</p><h2 class="satori-pro-title">Предварительный расчёт</h2><p class="satori-pro-copy">Можно отправить даже сырой референс: поможем уточнить вводные и предложим варианты реализации.</p></article>
        <article class="satori-pro-card"><p class="satori-pro-kicker">ПАРТНЁРСТВО</p><h2 class="satori-pro-title">Условия для дизайнеров</h2><p class="satori-pro-copy">Партнёрские условия и формат постоянного сотрудничества обсуждаем индивидуально под объём и задачи студии.</p></article>
      </section>
    `;
    if (lead?.nextSibling) container.insertBefore(wrap, lead.nextSibling);
    else container.appendChild(wrap);
  }

  enhanceDesignerForm(container);
}

function ensureFooterLink() {
  const footer = document.querySelector("footer");
  if (!footer || footer.querySelector("[data-satori-designers-footer]")) return;
  const nav = footer.querySelector("nav") || footer;
  const link = document.createElement("a");
  link.href = DESIGNERS_PATH;
  link.textContent = "Дизайнерам и архитекторам";
  link.dataset.satoriDesignersFooter = "1";
  link.style.color = "inherit";
  link.style.textDecoration = "none";
  link.style.fontFamily = "Inter, sans-serif";
  link.style.fontSize = "11px";
  bindDesignerOpen(link);
  nav.appendChild(link);
}

function scan() {
  ensureStyles();
  ensureNavEntry();
  ensureFooterLink();
  enhanceHome();
  enhanceDesignerPage();
}

export function startDesignerExperience() {
  if (window.location.pathname.startsWith("/admin")) return;
  scan();
  const root = document.getElementById("root");
  if (!root) return;

  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      scan();
    });
  });
  observer.observe(root, { childList: true, subtree: true });
  window.addEventListener("popstate", scan);
  window.addEventListener("satori-route-change", scan);
}
