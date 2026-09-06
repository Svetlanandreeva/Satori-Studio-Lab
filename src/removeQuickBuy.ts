export function startRemoveQuickBuy() {
  const hideQuickBuy = () => {
    document.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
      if (button.textContent?.trim() === "Купить в 1 клик") {
        button.style.display = "none";
        button.setAttribute("aria-hidden", "true");
        button.tabIndex = -1;
      }
    });
  };

  hideQuickBuy();
  const observer = new MutationObserver(hideQuickBuy);
  observer.observe(document.body, { childList: true, subtree: true });
}
