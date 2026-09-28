const MAIN_PHONE = "+7 922 122-60-63";
const MAIN_PHONE_HREF = "+79221226063";
const MAIN_TELEGRAM_HANDLE = "Satori_Lab_Ural";
const MAIN_TELEGRAM_URL = `https://t.me/${MAIN_TELEGRAM_HANDLE}`;
const MAIN_WHATSAPP_URL = "https://wa.me/79221226063";
const EMAIL = "studiosatori@yandex.com";
const INSTAGRAM_URL = "https://instagram.com/_satori_studio_";
const VK_URL = "https://vk.ru/satory_lab";

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
    const next = value
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

function track(goal: string) {
  try { (window as any).ym?.(110458266, "reachGoal", goal); } catch {}
}

function makeLink(label: string, href: string, className: string, goal?: string) {
  const link = document.createElement("a");
  link.href = href;
  link.className = className;
  link.textContent = label;
  if (href.startsWith("http")) {
    link.target = "_blank";
    link.rel = "noopener noreferrer";
  }
  if (goal) link.addEventListener("click", () => track(goal));
  return link;
}

function ensureFooterStyles() {
  if (document.getElementById("satori-footer-contact-layout-styles")) return;
  const style = document.createElement("style");
  style.id = "satori-footer-contact-layout-styles";
  style.textContent = `
    .satori-footer-primary-contacts {
      margin-top: 18px;
      padding-top: 15px;
      border-top: 1px solid rgba(236,230,223,.12);
      display: flex;
      flex-direction: column;
      gap: 9px;
      max-width: 320px;
    }
    .satori-footer-primary-link {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      color: #ECE6DF;
      text-decoration: none;
      font: 500 12px/1.35 Inter, sans-serif;
      transition: color .2s ease, opacity .2s ease;
    }
    .satori-footer-primary-link::after {
      content: "↗";
      color: #8F8578;
      font-size: 12px;
    }
    .satori-footer-primary-link:hover { color: #fff; }

    .satori-footer-secondary-contacts,
    [data-satori-management-contact] {
      width: 100%;
      box-sizing: border-box;
    }
    .satori-footer-secondary-contacts {
      margin-top: 22px;
      padding-top: 16px;
      border-top: 1px solid rgba(236,230,223,.10);
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px 20px;
      font: 400 11px/1.4 Inter, sans-serif;
      color: #8F8578;
    }
    .satori-footer-secondary-link {
      color: #8F8578;
      text-decoration: none;
      transition: color .2s ease;
    }
    .satori-footer-secondary-link:hover { color: #ECE6DF; }

    [data-satori-management-contact] {
      margin-top: 10px;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 7px 14px;
      font: 400 10px/1.4 Inter, sans-serif;
      color: rgba(143,133,120,.78);
    }
    .satori-management-label {
      color: #8F8578;
      font-weight: 600;
      letter-spacing: .04em;
    }

    .satori-footer-admin-entry {
      margin-left: auto;
      color: rgba(143,133,120,.28);
      text-decoration: none;
      font: 400 8px/1 Inter, sans-serif;
      letter-spacing: .08em;
      text-transform: uppercase;
    }
    .satori-footer-admin-entry:hover { color: #8F8578; }

    @media (max-width: 767px) {
      .satori-footer-primary-contacts { max-width: none; }
      .satori-footer-secondary-contacts { gap: 10px 16px; }
      .satori-footer-admin-entry { margin-left: 0; width: 100%; padding-top: 4px; }
    }
  `;
  document.head.appendChild(style);
}

function findLegacyContactRow(footer: HTMLElement) {
  const candidates = Array.from(footer.querySelectorAll<HTMLDivElement>("div"));
  return candidates.find((row) => {
    if (row.id === "satori-footer-primary-contacts" || row.id === "satori-footer-secondary-contacts") return false;
    const links = Array.from(row.children).filter((child): child is HTMLAnchorElement => child instanceof HTMLAnchorElement);
    if (links.length < 4) return false;
    const hrefs = links.map((link) => link.getAttribute("href") || "");
    return hrefs.some((href) => href.includes("t.me/")) &&
      hrefs.some((href) => href.startsWith("mailto:")) &&
      hrefs.some((href) => href.startsWith("tel:"));
  }) || null;
}

function hideLegacyContactLabel(footer: HTMLElement) {
  Array.from(footer.querySelectorAll<HTMLElement>("p,span")).forEach((el) => {
    if (el.textContent?.trim().toUpperCase() === "КОНТАКТЫ") {
      el.style.display = "none";
    }
  });
}

function findNewsletterColumn(footer: HTMLElement): HTMLElement | null {
  const title = Array.from(footer.querySelectorAll<HTMLElement>("p")).find((el) =>
    el.textContent?.toUpperCase().includes("БУДЬТЕ В КУРСЕ НОВИНОК"),
  );
  return title?.parentElement as HTMLElement | null;
}

function ensureFooterContactLayout() {
  const footer = document.querySelector<HTMLElement>("footer");
  if (!footer) return;

  const legacyRow = findLegacyContactRow(footer);
  if (legacyRow) legacyRow.style.setProperty("display", "none", "important");
  hideLegacyContactLabel(footer);

  let primary = footer.querySelector<HTMLElement>("#satori-footer-primary-contacts");
  if (!primary) {
    primary = document.createElement("div");
    primary.id = "satori-footer-primary-contacts";
    primary.className = "satori-footer-primary-contacts";
    primary.append(
      makeLink(`Telegram @${MAIN_TELEGRAM_HANDLE}`, MAIN_TELEGRAM_URL, "satori-footer-primary-link", "telegram_click"),
      makeLink(EMAIL, `mailto:${EMAIL}`, "satori-footer-primary-link"),
    );
  }

  const newsletter = findNewsletterColumn(footer);
  if (newsletter && primary.parentElement !== newsletter) newsletter.appendChild(primary);
  else if (!newsletter && !primary.isConnected) footer.prepend(primary);

  let secondary = footer.querySelector<HTMLElement>("#satori-footer-secondary-contacts");
  if (!secondary) {
    secondary = document.createElement("div");
    secondary.id = "satori-footer-secondary-contacts";
    secondary.className = "satori-footer-secondary-contacts";
    secondary.append(
      makeLink(MAIN_PHONE, `tel:${MAIN_PHONE_HREF}`, "satori-footer-secondary-link", "phone_click"),
      makeLink("WhatsApp", MAIN_WHATSAPP_URL, "satori-footer-secondary-link", "whatsapp_click"),
      makeLink("ВКонтакте", VK_URL, "satori-footer-secondary-link"),
      makeLink("Instagram", INSTAGRAM_URL, "satori-footer-secondary-link"),
    );
  }

  const sellerLine = Array.from(footer.querySelectorAll<HTMLElement>("p")).find((el) =>
    el.textContent?.trim().startsWith("Продавец:"),
  );
  if (sellerLine?.parentElement && secondary.parentElement !== sellerLine.parentElement) {
    sellerLine.parentElement.insertBefore(secondary, sellerLine);
  } else if (!secondary.isConnected) {
    footer.appendChild(secondary);
  }
}

function ensureManagementContact() {
  const footer = document.querySelector<HTMLElement>("footer");
  if (!footer) return;

  let block = footer.querySelector<HTMLElement>("[data-satori-management-contact]");
  if (!block) {
    block = document.createElement("div");
    block.setAttribute("data-satori-management-contact", "true");

    const label = document.createElement("span");
    label.className = "satori-management-label";
    label.textContent = "Руководство";

    const phone = makeLink(MANAGEMENT_PHONE, `tel:${MANAGEMENT_PHONE_HREF}`, "satori-footer-secondary-link");
    const telegram = makeLink(`Telegram @${MANAGEMENT_TELEGRAM_HANDLE}`, MANAGEMENT_TELEGRAM_URL, "satori-footer-secondary-link");
    block.append(label, phone, telegram);
  }

  const secondary = footer.querySelector<HTMLElement>("#satori-footer-secondary-contacts");
  if (secondary?.parentElement && block.parentElement !== secondary.parentElement) {
    secondary.insertAdjacentElement("afterend", block);
  } else if (!block.isConnected) {
    footer.appendChild(block);
  }
}

function hideFloatingTelegram() {
  document.querySelectorAll<HTMLAnchorElement>('a[href*="t.me/"]').forEach((link) => {
    if (link.closest("footer")) return;
    if (link.classList.contains("fixed") || getComputedStyle(link).position === "fixed") {
      link.style.setProperty("display", "none", "important");
    }
  });
}

function ensurePrivateAdminEntry() {
  const footer = document.querySelector<HTMLElement>("footer");

  document.querySelectorAll<HTMLAnchorElement>('a[href="/admin"], a[href^="/admin?"]').forEach((link) => {
    if (link.dataset.satoriPrivateAdmin === "1") return;
    link.style.setProperty("display", "none", "important");
  });
  document.querySelectorAll<HTMLElement>(".satori-admin-top-link").forEach((link) => {
    link.style.setProperty("display", "none", "important");
  });

  if (!footer) return;

  let ownerMode = false;
  try { ownerMode = Boolean(localStorage.getItem("satori_admin_token")); } catch {}
  try { ownerMode = ownerMode || new URLSearchParams(window.location.search).get("admin") === "1"; } catch {}

  const existing = footer.querySelector<HTMLAnchorElement>('[data-satori-private-admin="1"]');
  if (!ownerMode) {
    existing?.remove();
    return;
  }
  if (existing) return;

  const host = footer.querySelector<HTMLElement>("#satori-footer-secondary-contacts") || footer;
  const admin = document.createElement("a");
  admin.href = "/admin";
  admin.dataset.satoriPrivateAdmin = "1";
  admin.className = "satori-footer-admin-entry";
  admin.textContent = "Вход";
  admin.setAttribute("aria-label", "Вход в админ-панель");
  host.appendChild(admin);
}

function patch() {
  replaceVisibleContacts();
  ensureFooterStyles();
  ensureFooterContactLayout();
  ensureManagementContact();
  hideFloatingTelegram();
  ensurePrivateAdminEntry();
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
