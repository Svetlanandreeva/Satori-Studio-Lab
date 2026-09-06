function isCompleteAddress(value: string) {
  const address = value.trim();
  const parts = address.split(/[\s,]+/).filter(Boolean);
  return address.length >= 8 && parts.length >= 2 && /\d/.test(address);
}

function enhanceAddressInput() {
  const labels = Array.from(document.querySelectorAll<HTMLLabelElement>("label"));
  const label = labels.find((node) => node.textContent?.trim().startsWith("АДРЕС"));
  if (!label) return;

  const input = label.parentElement?.querySelector<HTMLInputElement>("input") ?? label.querySelector<HTMLInputElement>("input");
  if (!input || input.dataset.satoriAddressGuard === "1") return;

  input.dataset.satoriAddressGuard = "1";
  input.required = true;
  input.placeholder = "Например: Чита, ул. Ленина, 12";
  input.autocomplete = "street-address";

  const validate = () => {
    const value = input.value.trim();
    if (!value) {
      input.setCustomValidity("Укажите адрес доставки");
    } else if (!isCompleteAddress(value)) {
      input.setCustomValidity("Укажите полный адрес: город, улицу и номер дома");
    } else {
      input.setCustomValidity("");
    }
  };

  input.addEventListener("input", validate);
  input.addEventListener("blur", validate);
  input.addEventListener("invalid", validate);
  validate();
}

export function startCheckoutAddressGuard() {
  if (window.location.pathname.startsWith("/admin")) return;
  const root = document.getElementById("root");
  if (!root) return;

  const observer = new MutationObserver(enhanceAddressInput);
  observer.observe(root, { childList: true, subtree: true });
  window.setTimeout(enhanceAddressInput, 0);
}
