const COPY_REPLACEMENTS = new Map<string, string>([
  [
    "Расскажите об идее — обсудим детали, согласуем 3D-модель до начала производства.",
    "Расскажите об идее — подберём материал и технологию под задачу, сделаем эскиз или прототип и согласуем производство.",
  ],
  [
    "Разработаем и произведём предмет интерьера под ваш проект — светильник, декор, малую мебель или другую форму.",
    "Разработаем и произведём почти любой объект под ваш проект. Работаем с 3D-печатью, тканью, глиной и другими материалами — технологию подбираем под задачу.",
  ],
  [
    "Форма, материал, конструкция и вариант производства.",
    "Материал, технология, конструкция и способ производства — от ткани и глины до 3D-печати и смешанных техник.",
  ],
]);

function replaceText(root: ParentNode = document) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let node: Node | null;

  while ((node = walker.nextNode())) {
    if (node instanceof Text) nodes.push(node);
  }

  for (const textNode of nodes) {
    const current = textNode.nodeValue?.trim();
    if (!current) continue;
    const replacement = COPY_REPLACEMENTS.get(current);
    if (!replacement) continue;
    textNode.nodeValue = textNode.nodeValue!.replace(current, replacement);
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
    "Не ограничиваемся одной технологией: текстиль, глина, 3D-печать, комбинированные материалы и ручная работа. Сначала смотрим на задачу, затем выбираем лучший способ её реализовать.";
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

function scan() {
  replaceText(document.getElementById("root") ?? document);
  broadenCustomPage();
}

export function startBrandCopyEnhancements() {
  const root = document.getElementById("root");
  if (!root) return;

  scan();
  const observer = new MutationObserver(() => scan());
  observer.observe(root, { childList: true, subtree: true, characterData: true });
  window.addEventListener("popstate", () => window.setTimeout(scan, 0));
}
