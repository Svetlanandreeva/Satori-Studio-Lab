import c00 from "./naZakazMedia/chunk00.txt?raw";
import c01 from "./naZakazMedia/chunk01.txt?raw";
import c02 from "./naZakazMedia/chunk02.txt?raw";
import c03 from "./naZakazMedia/chunk03.txt?raw";
import c04 from "./naZakazMedia/chunk04.txt?raw";
import c05 from "./naZakazMedia/chunk05.txt?raw";
import c06 from "./naZakazMedia/chunk06.txt?raw";
import c07 from "./naZakazMedia/chunk07.txt?raw";
import c08 from "./naZakazMedia/chunk08.txt?raw";
import c09 from "./naZakazMedia/chunk09.txt?raw";
import c10 from "./naZakazMedia/chunk10.txt?raw";

const PAGE_PATH = "/na-zakaz";
const REAL_SPRITE = `data:image/jpeg;base64,${[c00,c01,c02,c03,c04,c05,c06,c07,c08,c09,c10].join("")}`;

function cleanPath() {
  const path = window.location.pathname;
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

function tile(kind: "hero" | "chandelier" | "team" | "weld" | "detail", label: string, extra = "") {
  return `<div class="satori-nz-real-media satori-nz-real-${kind} ${extra}" role="img" aria-label="${label}"></div>`;
}

function upgradeHero(root: HTMLElement) {
  const hero = root.querySelector<HTMLElement>(".satori-nz-hero");
  const copy = hero?.querySelector<HTMLElement>(".satori-nz-hero-copy");
  if (!hero || !copy) return;
  hero.classList.add("satori-nz-real-hero");
  hero.style.removeProperty("--satori-nz-hero");

  const kicker = copy.querySelector<HTMLElement>(".satori-nz-kicker");
  if (kicker) kicker.textContent = "ПРОЕКТИРОВАНИЕ · ПРОИЗВОДСТВО · ДОСТАВКА";
  const lead = copy.querySelector<HTMLElement>(".satori-nz-lead");
  if (lead) lead.textContent = "Люстры, бра, торшеры, свет для ресторанов и крупные арт-объекты. Пришлите эскиз, фото или просто задачу — разработаем конструкцию и доведём до готового изделия.";
  const primary = copy.querySelector<HTMLAnchorElement>(".satori-nz-primary");
  if (primary) {
    primary.textContent = "Получить расчёт проекта";
    primary.insertAdjacentHTML("afterend", `<a class="satori-nz-hero-link" href="#portfolio-real">Посмотреть реальные работы →</a>`);
  }
  copy.insertAdjacentHTML("beforeend", `
    <div class="satori-nz-hero-proof">
      <span><b>от 1</b> экземпляра</span>
      <span><b>7–21</b> рабочий день</span>
      <span><b>по РФ</b> доставка</span>
    </div>
    <p class="satori-nz-hero-note">Ответим в течение рабочего дня · можно начать с одного фото</p>
  `);
}

function upgradeCards(root: HTMLElement) {
  const cards = Array.from(root.querySelectorAll<HTMLElement>(".satori-nz-photo-card"));
  const kinds = ["chandelier", "detail", "chandelier", "hero"] as const;
  cards.forEach((card, index) => {
    card.classList.add("satori-nz-card-real", `satori-nz-real-${kinds[index] || "hero"}`);
    card.querySelector("img")?.setAttribute("aria-hidden", "true");
  });
}

function addProductionProof(root: HTMLElement) {
  if (root.querySelector(".satori-nz-production-proof")) return;
  const process = root.querySelector<HTMLElement>("#kak-rabotaem");
  if (!process) return;
  process.insertAdjacentHTML("afterend", `
    <section class="satori-nz-section satori-nz-production-proof">
      <div class="satori-nz-production-copy">
        <p class="satori-nz-kicker">РЕАЛЬНОЕ ПРОИЗВОДСТВО</p>
        <h2>Не ограничены каталогом готовых светильников</h2>
        <p>Работаем с металлом, стеклом, камнем, полимерами и комбинированными конструкциями. Для сложных проектов подключаем производства и фабрики в России и Китае.</p>
        <div class="satori-nz-production-stats">
          <div><b>01</b><span>Прорабатываем конструкцию под реальное производство</span></div>
          <div><b>02</b><span>Показываем этапы изготовления и согласуем детали</span></div>
          <div><b>03</b><span>Берём на себя сборку, упаковку и доставку</span></div>
        </div>
      </div>
      <div class="satori-nz-production-media">
        ${tile("team", "Мастера собирают крупную световую конструкцию", "is-main")}
        ${tile("weld", "Производство металлической световой инсталляции")}
        ${tile("hero", "Крупная световая инсталляция в мастерской")}
      </div>
    </section>
  `);
}

function upgradePortfolio(root: HTMLElement) {
  const portfolio = root.querySelector<HTMLElement>(".satori-nz-portfolio");
  if (!portfolio) return;
  portfolio.id = "portfolio-real";
  const head = portfolio.querySelector<HTMLElement>(".satori-nz-section-head");
  if (head) head.innerHTML = `
    <div><p class="satori-nz-kicker satori-nz-kicker-dark">РЕАЛЬНЫЕ ПРОЕКТЫ</p><h2>От мастерской до готового света</h2></div>
    <p>Показываем не только красивый финал, но и то, как создаётся объект. Это реальные фото производства и выполненных заказов.</p>
  `;
  const grid = portfolio.querySelector<HTMLElement>(".satori-nz-work-grid");
  if (!grid) return;
  grid.className = "satori-nz-case-list";
  grid.innerHTML = `
    <article class="satori-nz-case satori-nz-case-dark">
      <div class="satori-nz-case-copy">
        <p class="satori-nz-case-no">КЕЙС 01 · ИНСТАЛЛЯЦИЯ</p>
        <h3>Крупноформатная световая конструкция</h3>
        <p>Задача: изготовить сложную металлическую форму по индивидуальному проекту — от каркаса и подгонки геометрии до ручной сборки и подготовки под свет.</p>
        <div class="satori-nz-case-tags"><span>металл</span><span>нестандартная геометрия</span><span>ручная сборка</span></div>
      </div>
      <div class="satori-nz-case-gallery satori-nz-case-installation">
        ${tile("hero", "Крупная металлическая световая инсталляция в производстве", "is-wide")}
        ${tile("team", "Сборка инсталляции мастерами")}
        ${tile("weld", "Сварочные работы над инсталляцией")}
      </div>
    </article>

    <article class="satori-nz-case satori-nz-case-light">
      <div class="satori-nz-case-copy">
        <p class="satori-nz-case-no">КЕЙС 02 · ЛЮСТРА</p>
        <h3>Многоуровневая люстра с полупрозрачными дисками</h3>
        <p>Задача: собрать выразительный подвесной объект с латунной конструкцией, полупрозрачными элементами и мягким рассеянным светом. Отдельно проработаны крепления, слои и световой сценарий.</p>
        <div class="satori-nz-case-tags"><span>индивидуальная сборка</span><span>латунная отделка</span><span>мягкий свет</span></div>
      </div>
      <div class="satori-nz-case-gallery satori-nz-case-chandelier">
        ${tile("chandelier", "Готовая многоуровневая люстра", "is-tall")}
        ${tile("detail", "Конструкция люстры и свет снизу", "is-tall")}
      </div>
    </article>
  `;
}

function upgradeB2B(root: HTMLElement) {
  const b2b = root.querySelector<HTMLElement>("#b2b");
  if (!b2b || b2b.querySelector(".satori-nz-b2b-real-photo")) return;
  b2b.insertAdjacentHTML("afterbegin", `${tile("team", "Команда производства за сборкой заказного светового объекта", "satori-nz-b2b-real-photo")}`);
  const main = b2b.querySelector<HTMLElement>(".satori-nz-b2b-main > p:last-of-type");
  if (main) main.textContent = "Работаем по договору, принимаем заказы от юрлиц и ИП, делаем единичные объекты и серийные партии. Дизайнерам и бюро помогаем с технической проработкой, прототипом, производством и поставкой.";
}

function upgradeForm(root: HTMLElement) {
  const section = root.querySelector<HTMLElement>("#zayavka");
  if (!section) return;
  const heading = section.querySelector<HTMLElement>(".satori-nz-form-copy h2");
  if (heading) heading.textContent = "Получите предварительный расчёт проекта";
  const text = section.querySelector<HTMLElement>(".satori-nz-form-copy > p:last-of-type");
  if (text) text.textContent = "Пришлите фото, эскиз или коротко опишите задачу. В ответ уточним конструкцию, предложим следующий шаг и сориентируем по стоимости и сроку.";
  const messengers = section.querySelector<HTMLElement>(".satori-nz-messengers");
  if (messengers && !section.querySelector(".satori-nz-form-benefits")) {
    messengers.insertAdjacentHTML("beforebegin", `
      <div class="satori-nz-form-benefits">
        <span>Ориентир по стоимости</span><span>Срок изготовления</span><span>Что нужно для старта</span>
      </div>
    `);
  }
  const submit = section.querySelector<HTMLButtonElement>(".satori-nz-submit");
  if (submit) submit.textContent = "Получить расчёт";
}

function bindNewAnchors(root: HTMLElement) {
  root.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach((link) => {
    if (link.dataset.nzSalesBound === "1") return;
    link.dataset.nzSalesBound = "1";
    link.addEventListener("click", (event) => {
      const id = (link.getAttribute("href") || "").slice(1);
      const target = document.getElementById(id);
      if (!target) return;
      event.preventDefault();
      history.replaceState({}, "", `${PAGE_PATH}#${id}`);
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

function upgrade() {
  if (cleanPath() !== PAGE_PATH) return;
  const root = document.querySelector<HTMLElement>(".satori-nz-page");
  if (!root || root.dataset.satoriSalesUpgrade === "1") return;
  root.dataset.satoriSalesUpgrade = "1";
  root.style.setProperty("--satori-real-sprite", `url("${REAL_SPRITE}")`);
  upgradeHero(root);
  upgradeCards(root);
  addProductionProof(root);
  upgradePortfolio(root);
  upgradeB2B(root);
  upgradeForm(root);
  bindNewAnchors(root);
}

export function startNaZakazSalesUpgrade() {
  if (window.location.pathname.startsWith("/admin")) return;
  const root = document.getElementById("root");
  if (!root) return;
  const schedule = () => requestAnimationFrame(upgrade);
  new MutationObserver(schedule).observe(root, { childList: true, subtree: true });
  window.addEventListener("satori-route-change", schedule);
  window.addEventListener("pageshow", schedule);
  window.setTimeout(upgrade, 0);
}
