const params = new URLSearchParams(window.location.search);
const requestedDeal = params.get("deal") || "";
let openedRequestedDeal = false;
let lastDealId = "";

function sourceNumber(dealId = "") {
  const match = String(dealId).match(/^(?:web|lead):(.+)$/);
  if (!match) return "";
  return `S-${match[1].replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

function decorateCards() {
  document.querySelectorAll(".deal[data-deal-id]").forEach((card) => {
    const id = card.dataset.dealId || "";
    const number = sourceNumber(id);
    if (!number) return;
    let badge = card.querySelector(".crm-source-number");
    if (!badge) {
      badge = document.createElement("div");
      badge.className = "crm-source-number";
      const source = card.querySelector(".source");
      if (source) source.insertAdjacentElement("afterend", badge);
      else card.prepend(badge);
    }
    badge.textContent = `№ ${number}`;
  });
}

function openDeepLink() {
  if (!requestedDeal || openedRequestedDeal) return;
  const card = [...document.querySelectorAll(".deal[data-deal-id]")].find((item) => item.dataset.dealId === requestedDeal);
  if (!card) return;
  openedRequestedDeal = true;
  lastDealId = requestedDeal;
  card.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
  setTimeout(() => card.click(), 100);
}

function decorateDialog() {
  const dialog = [...document.querySelectorAll("dialog[open]")].at(-1);
  if (!dialog || dialog.querySelector(".crm-dialog-number")) return;
  const number = sourceNumber(lastDealId || requestedDeal);
  if (!number) return;
  const title = dialog.querySelector(".modal-head h2");
  if (!title) return;
  const badge = document.createElement("div");
  badge.className = "crm-dialog-number";
  badge.textContent = `CRM № ${number}`;
  title.insertAdjacentElement("afterend", badge);
}

document.addEventListener("click", (event) => {
  const card = event.target.closest?.(".deal[data-deal-id]");
  if (card) lastDealId = card.dataset.dealId || "";
}, true);

const observer = new MutationObserver(() => {
  decorateCards();
  openDeepLink();
  decorateDialog();
});
observer.observe(document.documentElement, { childList: true, subtree: true });
decorateCards();
openDeepLink();
