const TOKEN_KEY = "satori_admin_token";

let newOrdersCount = 0;
let refreshTimer: number | null = null;
let observer: MutationObserver | null = null;

function isNewOrder(order: any) {
  return !String(order?.fulfillmentStatus ?? "").trim();
}

function applyCount() {
  const admin = document.querySelector<HTMLElement>(".admin-figma");
  if (!admin) return;

  // Sidebar: the number beside “Заказы” is an attention counter, not total orders.
  const orderButton = Array.from(admin.querySelectorAll<HTMLButtonElement>(".fa-sidebar nav button"))
    .find((button) => button.querySelector("span")?.textContent?.trim() === "Заказы");

  if (orderButton) {
    let badge = orderButton.querySelector<HTMLElement>(":scope > b");
    if (newOrdersCount > 0) {
      if (!badge) {
        badge = document.createElement("b");
        orderButton.appendChild(badge);
      }
      if (badge.textContent !== String(newOrdersCount)) badge.textContent = String(newOrdersCount);
      badge.hidden = false;
    } else if (badge) {
      badge.remove();
    }
  }

  // Keep the “НОВЫЕ” summary card in sync with the same rule.
  const stat = Array.from(admin.querySelectorAll<HTMLElement>(".fa-stat"))
    .find((card) => card.querySelector("span")?.textContent?.trim() === "НОВЫЕ");
  const value = stat?.querySelector<HTMLElement>("b");
  if (value && value.textContent !== String(newOrdersCount)) value.textContent = String(newOrdersCount);
}

async function refreshCount() {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) {
    newOrdersCount = 0;
    applyCount();
    return;
  }

  try {
    const response = await fetch("/api/admin/orders", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!response.ok) return;
    const data = await response.json();
    const orders = Array.isArray(data) ? data : Array.isArray(data?.orders) ? data.orders : [];
    newOrdersCount = orders.filter(isNewOrder).length;
    applyCount();
  } catch {
    // Leave the last known counter in place if the request temporarily fails.
  }
}

function scheduleRefresh(delay = 350) {
  if (refreshTimer !== null) window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(() => {
    refreshTimer = null;
    refreshCount();
  }, delay);
}

export function startAdminOrderCounters() {
  if (!window.location.pathname.startsWith("/admin")) return;

  observer = new MutationObserver(() => applyCount());
  observer.observe(document.body, { childList: true, subtree: true });

  document.addEventListener("click", (event) => {
    const target = event.target as Element | null;
    if (!target) return;

    // Recalculate after an order status is saved, or when returning to Orders.
    if (target.closest(".fa-detail .fa-primary") || target.closest(".fa-sidebar nav button")) {
      scheduleRefresh();
    }
  });

  window.addEventListener("focus", () => scheduleRefresh(0));
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) scheduleRefresh(0);
  });

  scheduleRefresh(0);
}
