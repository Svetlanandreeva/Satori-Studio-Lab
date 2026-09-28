const normalizeCopy = (value: string) => value.replace(/\s+/g, " ").trim();

const COPY_REPLACEMENTS = new Map<string, string>([
  [
    "Расскажите об идее — обсудим детали, согласуем 3D-модель до начала производства.",
    "Расскажите об идее — подберём материал и технологию под задачу, сделаем эскиз или прототип и согласуем производство.",
  ],
  [
    "Разработаем и произведём предмет интерьера под ваш проект — светильник, декор, малую мебель или другую форму.",
    "Разработаем, подберём или произведём предмет под ваш проект — от светильника и декора до мебели. Работаем со своей мастерской и фабриками в России и Китае, можем взять на себя изготовление и поставку.",
  ],
  [
    "Форма, материал, конструкция и вариант производства.",
    "Форма, материал, конструкция и способ производства — под задачу, фактуру и сценарий использования.",
  ],
  [
    "3D-СТУДИЯ · ЕКАТЕРИНБУРГ",
    "СТУДИЯ ПРЕДМЕТНОГО ДИЗАЙНА · ЕКАТЕРИНБУРГ",
  ],
  [
    "«Сатори» — японское слово для мгновенного озарения. Каждое изделие: от 3D-модели в Nomad Sculpt до финишной обработки руками мастера.",
    "SATORI — студия предметного дизайна и интерьерных объектов. Мы создаём свет, декор, мебель и небольшие предметы для пространства, сочетая ручную работу, разные материалы и проверенное производство.",
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
    "Шлифовка, грунтование, покраска. Здесь изделие получает свой финальный характер.",
    "Собираем, шлифуем, окрашиваем и доводим детали вручную — здесь предмет получает финальный характер.",
  ],
  [
    "Опт и корпоративные подарки",
    "Мебель и предметы для бизнеса",
  ],
  [
    "Поставляем авторские 3D-объекты магазинам и шоурумам, а также делаем брендированные подарки для компаний — от небольшой партии до постоянного сотрудничества.",
    "Комплектуем интерьерные проекты для бизнеса: мебель, свет, декор и брендированные предметы. Работаем с проверенными фабриками в России и Китае — можем найти готовое решение, адаптировать его под ваш проект или изготовить с нуля по дизайну, размерам, материалам и цвету.",
  ],
  [
    "Опт — магазинам и шоурумам",
    "Мебель, опт и комплектация",
  ],
  [
    "Поставляем готовые коллекции и позволяем формировать ассортимент под ваш формат.",
    "Подбираем готовые модели или организуем изготовление мебели и интерьерных объектов под проект — от одного акцентного предмета до комплектации пространства.",
  ],
  ["От 10 изделий — скидка 15%", "Подбор по референсу, размерам, материалам и бюджету"],
  ["От 30 изделий — скидка 25%", "Изготовление по вашему дизайну или разработка с нуля"],
  ["Индивидуальные условия для постоянных партнёров", "Фабрики и производство в России и Китае"],
  ["Отсрочка платежа обсуждается отдельно", "Контроль образцов, логистика и поставка в Россию"],
  [
    "Предметы интерьера собственного производства. Создаём вещи, которые остаются надолго.",
    "Интерьерные объекты и мебель для частных и коммерческих пространств. Собственное производство и проверенные фабрики в России и Китае.",
  ],
  ["Насколько прочны изделия из PLA?", "Из каких материалов вы работаете?"],
  [
    "PLA — биопластик на основе кукурузного крахмала. Достаточно прочен для декоративных объектов. Не рекомендуем оставлять на прямом солнце — деформируется при +60°C.",
    "Подбираем материал под задачу: пластики и композиты, дерево, ткань, глина, смолы, металл, стекло и смешанные техники. Для мебели также подбираем отделку, фурнитуру и фабрику под бюджет и проект.",
  ],
  ["Можно ли использовать снаружи?", "Можно ли использовать изделия на улице?"],
  [
    "Изделия из PLA — только для помещений. Для улицы есть PETG или ASA — напишите нам, обсудим.",
    "Зависит от материала, конструкции и покрытия. Для уличного использования подбираем устойчивые материалы и заранее учитываем влагу, солнце и перепады температуры.",
  ],
  [
    "Протирайте сухой или слегка влажной тканью. Не мойте в посудомойке, не замачивайте, не ставьте рядом с источниками тепла.",
    "Уход зависит от материала. Для каждого изделия указываем рекомендации; большинству предметов достаточно сухой или слегка влажной мягкой ткани.",
  ],
  ["Видно ли слои от принтера?", "Можно ли изменить цвет, размер или материал?"],
  [
    "На готовых изделиях слои минимальны — слой 0,1–0,15мм + финишная обработка. Для полностью гладкой поверхности — смоляная печать или дополнительная шлифовка.",
    "Да. Для многих моделей можно изменить цвет, масштаб, фактуру, материал, отделку и фурнитуру. Если нужна более серьёзная адаптация — оформим это как индивидуальный заказ.",
  ],
].map(([from, to]) => [normalizeCopy(from), to]));

function replaceText(root: ParentNode = document) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let node: Node | null;

  while ((node = walker.nextNode())) {
    if (node instanceof Text) nodes.push(node);
  }

  for (const textNode of nodes) {
    const raw = textNode.nodeValue;
    if (!raw) continue;
    const current = normalizeCopy(raw);
    if (!current) continue;
    const replacement = COPY_REPLACEMENTS.get(current);
    if (!replacement) continue;
    textNode.nodeValue = replacement;
  }
}

function broadenCustomPage() {
  const heading = Array.from(document.querySelectorAll<HTMLElement>("h1, h2")).find(
    (el) => el.textContent?.trim() === "Изделие на заказ",
  );
  if (!heading) return;

  const container = heading.parentElement;
  if (!container || container.querySelector(".satori-custom-capabilities")) return;

  const note = document.createElement("p");
  note.className = "satori-custom-capabilities";
  note.textContent =
    "Работаем как предметная студия: мебель, текстиль, глина, дерево, пластики, композиты, металл, стекло, ручная сборка и смешанные техники. Для мебели и серийных задач подключаем проверенные фабрики в России и Китае — от подбора решения до производства и доставки.";
  note.style.margin = "-18px 0 32px";
  note.style.maxWidth = "760px";
  note.style.fontFamily = "Inter, sans-serif";
  note.style.fontSize = "13px";
  note.style.lineHeight = "1.65";
  note.style.color = "#6B6255";

  const intro = heading.nextElementSibling;
  if (intro?.nextSibling) container.insertBefore(note, intro.nextSibling);
  else container.appendChild(note);
}

function broadenBusinessPage() {
  const heading = Array.from(document.querySelectorAll<HTMLElement>("h1")).find((el) => {
    const text = normalizeCopy(el.textContent || "");
    return text === "Мебель и предметы для бизнеса" || text === "Опт и корпоративные подарки";
  });
  if (!heading) return;

  const container = heading.parentElement;
  if (!container) return;

  const oldStatLabel = Array.from(container.querySelectorAll<HTMLElement>("p")).find(
    (el) => normalizeCopy(el.textContent || "") === "принтер в студии",
  );
  if (oldStatLabel) {
    const statCard = oldStatLabel.parentElement;
    const statLines = statCard?.querySelectorAll<HTMLElement>("p");
    if (statLines && statLines.length >= 2) {
      statLines[0].textContent = "RU + CN";
      statLines[1].textContent = "фабрики и производство";
    }
  }

  if (!container.querySelector(".satori-factory-network")) {
    const panel = document.createElement("section");
    panel.className = "satori-factory-network";
    panel.style.margin = "-12px 0 36px";
    panel.style.padding = "24px";
    panel.style.border = "1px solid rgba(0,0,0,0.09)";
    panel.style.borderRadius = "18px";
    panel.style.background = "#fff";
    panel.innerHTML = `
      <p style="font-family:Inter,sans-serif;font-size:10px;font-weight:600;letter-spacing:.18em;color:#8F8578;margin:0 0 10px">ПРОИЗВОДСТВО И КОМПЛЕКТАЦИЯ</p>
      <h2 style="font-family:'Playfair Display',serif;font-size:24px;line-height:1.2;font-weight:600;color:#1A1412;margin:0 0 12px">Россия + Китай</h2>
      <p style="font-family:Inter,sans-serif;font-size:13px;line-height:1.7;color:#6B6255;max-width:760px;margin:0 0 18px">Работаем с фабриками в России и Китае. Можем подобрать готовую мебель по референсу, адаптировать модель под проект или изготовить её с нуля — в нужных размерах, материалах, цвете, отделке и комплектации. Берём на себя подбор производства, образцы, согласование и логистику в Россию.</p>
      <div style="display:flex;flex-wrap:wrap;gap:8px">
        <span style="font-family:Inter,sans-serif;font-size:11px;color:#1A1412;border:1px solid rgba(0,0,0,.12);border-radius:999px;padding:7px 11px">мебель под проект</span>
        <span style="font-family:Inter,sans-serif;font-size:11px;color:#1A1412;border:1px solid rgba(0,0,0,.12);border-radius:999px;padding:7px 11px">Россия</span>
        <span style="font-family:Inter,sans-serif;font-size:11px;color:#1A1412;border:1px solid rgba(0,0,0,.12);border-radius:999px;padding:7px 11px">Китай</span>
        <span style="font-family:Inter,sans-serif;font-size:11px;color:#1A1412;border:1px solid rgba(0,0,0,.12);border-radius:999px;padding:7px 11px">по вашему дизайну</span>
        <span style="font-family:Inter,sans-serif;font-size:11px;color:#1A1412;border:1px solid rgba(0,0,0,.12);border-radius:999px;padding:7px 11px">логистика под ключ</span>
      </div>
    `;

    const intro = heading.nextElementSibling;
    if (intro) intro.insertAdjacentElement("afterend", panel);
    else container.appendChild(panel);
  }

  const typeLabel = Array.from(container.querySelectorAll<HTMLElement>("label")).find(
    (el) => normalizeCopy(el.textContent || "") === "ТИП СОТРУДНИЧЕСТВА",
  );
  const select = typeLabel?.parentElement?.querySelector<HTMLSelectElement>("select");
  if (select) {
    ["Мебель / комплектация", "Производство по дизайну", "Поставка из Китая"].forEach((value) => {
      if (!Array.from(select.options).some((o) => o.value === value)) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        option.style.background = "#fff";
        select.appendChild(option);
      }
    });
  }
}

function scan() {
  replaceText(document.getElementById("root") ?? document);
  broadenCustomPage();
  broadenBusinessPage();
}

export function startBrandCopyEnhancements() {
  const root = document.getElementById("root");
  if (!root) return;

  scan();
  const observer = new MutationObserver(() => scan());
  observer.observe(root, { childList: true, subtree: true, characterData: true });
  window.addEventListener("popstate", () => window.setTimeout(scan, 0));
}
