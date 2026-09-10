function normalize(value: string | null | undefined) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function isCompleteAddress(value: string) {
  const address = value.trim();
  const parts = address.split(/[\s,]+/).filter(Boolean);
  return address.length >= 8 && parts.length >= 2 && /\d/.test(address);
}

function digits(value: string) {
  return value.replace(/\D/g, "");
}

function findCheckoutForm() {
  return Array.from(document.querySelectorAll<HTMLFormElement>("form")).find((form) =>
    normalize(form.textContent).includes("СПОСОБ ДОСТАВКИ"),
  ) ?? null;
}

function inputByLabel(form: HTMLFormElement, startsWith: string) {
  const label = Array.from(form.querySelectorAll<HTMLLabelElement>("label")).find((node) =>
    normalize(node.textContent).startsWith(startsWith),
  );
  if (!label) return null;
  return label.parentElement?.querySelector<HTMLInputElement>("input") ?? label.querySelector<HTMLInputElement>("input");
}

function bindPhone(input: HTMLInputElement | null) {
  if (!input || input.dataset.satoriPhoneGuard === "1") return;
  input.dataset.satoriPhoneGuard = "1";
  input.type = "tel";
  input.autocomplete = "tel";
  input.inputMode = "tel";
  input.placeholder = "+7 900 000-00-00";

  const validate = () => {
    const count = digits(input.value).length;
    input.setCustomValidity(count >= 10 && count <= 15 ? "" : "Проверьте номер телефона");
  };
  input.addEventListener("input", validate);
  input.addEventListener("blur", validate);
  input.addEventListener("invalid", validate);
  validate();
}

function bindAddress(input: HTMLInputElement | null) {
  if (!input || input.dataset.satoriAddressGuard === "1") return;
  input.dataset.satoriAddressGuard = "1";
  input.required = true;
  input.placeholder = "Например: Чита, ул. Ленина, 12";
  input.autocomplete = "street-address";

  const validate = () => {
    const value = input.value.trim();
    if (!value) input.setCustomValidity("Укажите адрес доставки");
    else if (!isCompleteAddress(value)) input.setCustomValidity("Укажите полный адрес: город, улицу и номер дома");
    else input.setCustomValidity("");
  };

  input.addEventListener("input", validate);
  input.addEventListener("blur", validate);
  input.addEventListener("invalid", validate);
  validate();
}

function bindPostalCode(input: HTMLInputElement | null, deliverySelect: HTMLSelectElement | null) {
  if (!input) return;
  input.autocomplete = "postal-code";
  input.inputMode = "numeric";
  input.maxLength = 6;
  input.placeholder = "620000";

  const validate = () => {
    const value = input.value.trim();
    const russianPost = deliverySelect?.value === "Почта России";
    input.required = Boolean(russianPost);
    if (russianPost && !/^\d{6}$/.test(value)) {
      input.setCustomValidity("Для Почты России укажите индекс из 6 цифр");
    } else if (value && !/^\d{6}$/.test(value)) {
      input.setCustomValidity("Индекс должен состоять из 6 цифр");
    } else {
      input.setCustomValidity("");
    }
  };

  if (input.dataset.satoriPostalGuard !== "1") {
    input.dataset.satoriPostalGuard = "1";
    input.addEventListener("input", validate);
    input.addEventListener("blur", validate);
    input.addEventListener("invalid", validate);
    deliverySelect?.addEventListener("change", validate);
  }
  validate();
}

function ensureDeliveryNote(form: HTMLFormElement, deliverySelect: HTMLSelectElement | null) {
  if (!deliverySelect) return;
  let note = form.querySelector<HTMLElement>(".satori-checkout-delivery-note");
  if (!note) {
    note = document.createElement("p");
    note.className = "satori-checkout-delivery-note";
    Object.assign(note.style, {
      margin: "-4px 0 2px",
      padding: "11px 12px",
      border: "1px solid rgba(240,234,226,.10)",
      borderRadius: "10px",
      fontFamily: "Inter, sans-serif",
      fontSize: "11px",
      lineHeight: "1.5",
      color: "#B3A89A",
      background: "rgba(255,255,255,.025)",
    });
    deliverySelect.parentElement?.insertAdjacentElement("afterend", note);
  }

  const render = () => {
    if (deliverySelect.value.startsWith("Самовывоз")) {
      note!.textContent = "Самовывоз в Екатеринбурге. Точный адрес и удобное время согласуем после оформления заказа.";
    } else {
      note!.textContent = "Сейчас оплачивается стоимость товаров. Доставку рассчитаем отдельно по адресу и согласуем с вами перед отправкой.";
    }
  };
  if (deliverySelect.dataset.satoriDeliveryNoteBound !== "1") {
    deliverySelect.dataset.satoriDeliveryNoteBound = "1";
    deliverySelect.addEventListener("change", render);
  }
  render();
}

function enhanceCheckout() {
  const form = findCheckoutForm();
  if (!form) return;

  form.style.paddingBottom = "calc(28px + env(safe-area-inset-bottom, 0px))";

  const name = inputByLabel(form, "ИМЯ");
  if (name) {
    name.autocomplete = "name";
    name.minLength = 2;
  }

  const phone = inputByLabel(form, "ТЕЛЕФОН");
  bindPhone(phone);

  const email = inputByLabel(form, "EMAIL");
  if (email) {
    email.type = "email";
    email.autocomplete = "email";
    email.inputMode = "email";
  }

  const deliverySelect = Array.from(form.querySelectorAll<HTMLSelectElement>("select")).find((select) =>
    Array.from(select.options).some((option) => option.textContent?.includes("СДЭК")),
  ) ?? null;

  const address = inputByLabel(form, "АДРЕС");
  bindAddress(address);

  const apartment = inputByLabel(form, "КВАРТИРА/ОФИС");
  if (apartment) apartment.autocomplete = "address-line2";

  const postal = inputByLabel(form, "ИНДЕКС");
  bindPostalCode(postal, deliverySelect);
  ensureDeliveryNote(form, deliverySelect);
}

export function startCheckoutAddressGuard() {
  if (window.location.pathname.startsWith("/admin")) return;
  const root = document.getElementById("root");
  if (!root) return;

  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      enhanceCheckout();
    });
  };

  const observer = new MutationObserver(schedule);
  observer.observe(root, { childList: true, subtree: true });
  window.setTimeout(enhanceCheckout, 0);
}
