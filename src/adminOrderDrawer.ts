let orderDrawerOpen = false;
let observer: MutationObserver | null = null;

function getOrderSplit() {
  return document.querySelector<HTMLElement>(".admin-figma .fa-split");
}

function ensureBackdrop() {
  let backdrop = document.getElementById("fa-order-drawer-backdrop");
  if (!backdrop) {
    backdrop = document.createElement("button");
    backdrop.id = "fa-order-drawer-backdrop";
    backdrop.type = "button";
    backdrop.setAttribute("aria-label", "Закрыть заказ");
    backdrop.addEventListener("click", () => {
      orderDrawerOpen = false;
      syncOrderDrawer();
    });
    document.body.appendChild(backdrop);
  }
  return backdrop;
}

function ensureCloseButton(detail: HTMLElement) {
  if (detail.querySelector(".fa-order-drawer-close")) return;
  const close = document.createElement("button");
  close.type = "button";
  close.className = "fa-order-drawer-close";
  close.setAttribute("aria-label", "Закрыть заказ");
  close.innerHTML = "×";
  close.addEventListener("click", (event) => {
    event.stopPropagation();
    orderDrawerOpen = false;
    syncOrderDrawer();
  });
  detail.prepend(close);
}

function syncOrderDrawer() {
  const split = getOrderSplit();
  const backdrop = ensureBackdrop();

  if (!split) {
    backdrop.classList.remove("is-open");
    return;
  }

  const detail = split.querySelector<HTMLElement>(":scope > .fa-detail");
  if (detail) ensureCloseButton(detail);

  split.classList.toggle("fa-order-drawer-open", orderDrawerOpen && !!detail);
  backdrop.classList.toggle("is-open", orderDrawerOpen && !!detail);
  document.documentElement.classList.toggle("fa-order-drawer-lock", orderDrawerOpen && !!detail);
}

export function startAdminOrderDrawer() {
  if (!window.location.pathname.startsWith("/admin")) return;

  document.addEventListener("click", (event) => {
    const target = event.target as Element | null;
    if (!target) return;

    const row = target.closest(".admin-figma .fa-split .fa-table-wrap tbody tr");
    if (row) {
      orderDrawerOpen = true;
      requestAnimationFrame(syncOrderDrawer);
      setTimeout(syncOrderDrawer, 0);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && orderDrawerOpen) {
      orderDrawerOpen = false;
      syncOrderDrawer();
    }
  });

  observer = new MutationObserver(syncOrderDrawer);
  observer.observe(document.body, { childList: true, subtree: true });
  syncOrderDrawer();
}
