const MAIN_PHONE = "+7 922 122-60-63";
const MAIN_PHONE_HREF = "+79221226063";
const MAIN_TELEGRAM_HANDLE = "Satori_Lab_Ural";
const MAIN_TELEGRAM_URL = `https://t.me/${MAIN_TELEGRAM_HANDLE}`;
const MAIN_WHATSAPP_URL = "https://wa.me/79221226063";

const MANAGEMENT_PHONE = "+7 993 519-51-41";
const MANAGEMENT_PHONE_HREF = "+79935195141";
const MANAGEMENT_TELEGRAM_HANDLE = "she_knows_s";
const MANAGEMENT_TELEGRAM_URL = `https://t.me/${MANAGEMENT_TELEGRAM_HANDLE}`;

function isManagementNode(node: Node) {
  const el = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
  return !!el?.closest("[data-satori-management-contact]");
}

function replaceVisibleContacts(root: ParentNode = document) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);

  for (const node of nodes) {
    if (isManagementNode(node)) continue;
    const value = node.nodeValue || "";
    let next = value
      .replaceAll(MANAGEMENT_PHONE, MAIN_PHONE)
      .replaceAll("+7 (993) 519-51-41", MAIN_PHONE)
      .replaceAll("+79935195141", MAIN_PHONE_HREF)
      .replaceAll(`@${MANAGEMENT_TELEGRAM_HANDLE}`, `@${MAIN_TELEGRAM_HANDLE}`)
      .replaceAll(MANAGEMENT_TELEGRAM_HANDLE, MAIN_TELEGRAM_HANDLE);
    if (next !== value) node.nodeValue = next;
  }

  document.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((anchor) => {
    if (anchor.closest("[data-satori-management-contact]")) return;
    const href = anchor.getAttribute("href") || "";
    if (href === `tel:${MANAGEMENT_PHONE_HREF}` || href === `tel:${MANAGEMENT_PHONE}`) {
      anchor.setAttribute("href", `tel:${MAIN_PHONE_HREF}`);
    } else if (href.includes("wa.me/79935195141")) {
      anchor.setAttribute("href", MAIN_WHATSAPP_URL);
    } else if (href.includes(`t.me/${MANAGEMENT_TELEGRAM_HANDLE}`)) {
      anchor.setAttribute("href", MAIN_TELEGRAM_URL);
    }
  });
}

function ensureManagementContact() {
  const footer = document.querySelector("footer");
  if (!footer || footer.querySelector("[data-satori-management-contact]")) return;

  const block = document.createElement("div");
  block.setAttribute("data-satori-management-contact", "true");
  block.style.cssText = [
    "margin:28px auto 0",
    "padding:18px 0 0",
    "border-top:1px solid rgba(236,230,223,.14)",
    "width:min(1180px,calc(100% - 40px))",
    "display:flex",
    "flex-wrap:wrap",
    "align-items:center",
    "gap:10px 18px",
    "font-family:Inter,sans-serif",
    "font-size:12px",
    "color:#B3A89A"
  ].join(";");

  const label = document.createElement("span");
  label.textContent = "Контакт руководства";
  label.style.cssText = "font-weight:600;color:#ECE6DF;letter-spacing:.04em";

  const phone = document.createElement("a");
  phone.href = `tel:${MANAGEMENT_PHONE_HREF}`;
  phone.textContent = MANAGEMENT_PHONE;
  phone.style.cssText = "color:inherit;text-decoration:none";

  const telegram = document.createElement("a");
  telegram.href = MANAGEMENT_TELEGRAM_URL;
  telegram.target = "_blank";
  telegram.rel = "noopener noreferrer";
  telegram.textContent = `Telegram @${MANAGEMENT_TELEGRAM_HANDLE}`;
  telegram.style.cssText = "color:inherit;text-decoration:none";

  block.append(label, phone, telegram);
  footer.appendChild(block);
}

function patch() {
  replaceVisibleContacts();
  ensureManagementContact();
}

export function startContactOverrides() {
  patch();

  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      patch();
    });
  };

  const observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["href"] });
  window.addEventListener("satori-route-change", schedule);
  window.addEventListener("popstate", schedule);
}
