type ProductLinkItem = { id: number; name: string };

let productsCache: ProductLinkItem[] | null = null;
let loading: Promise<ProductLinkItem[]> | null = null;

function productUrl(id: number) {
  return `${window.location.origin}/?p=${id}`;
}

async function loadProducts() {
  if (productsCache) return productsCache;
  if (loading) return loading;
  loading = fetch("/api/products")
    .then((r) => (r.ok ? r.json() : []))
    .catch(() => [])
    .then((items: ProductLinkItem[]) => {
      productsCache = Array.isArray(items) ? items.map((p) => ({ id: Number(p.id), name: String(p.name || "") })) : [];
      loading = null;
      return productsCache;
    });
  return loading;
}

function ensureStyles() {
  if (document.getElementById("satori-admin-product-link-styles")) return;
  const style = document.createElement("style");
  style.id = "satori-admin-product-link-styles";
  style.textContent = `
    .satori-product-link-actions{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
    .satori-product-link-actions a,.satori-product-link-actions button{height:34px;padding:0 12px;border-radius:17px;border:1px solid #d8cfc4;background:#fbf8f4;color:#1a1714;text-decoration:none;font:600 11px 'Inter',sans-serif;display:inline-flex;align-items:center;justify-content:center;white-space:nowrap}
    .satori-product-link-actions a:hover,.satori-product-link-actions button:hover{background:#f1e8de}
    .satori-product-url-box{margin:0 0 20px;background:#fbf8f4;border:1px solid #d8cfc4;border-radius:16px;padding:14px 16px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
    .satori-product-url-box span{font:600 10px 'Inter',sans-serif;letter-spacing:.06em;color:#a49384;width:100%}
    .satori-product-url-box input{flex:1;min-width:220px;height:40px;border:1px solid #d8cfc4;border-radius:12px;background:#f3eee7;color:#1a1714;padding:0 12px;font:12px 'Inter',sans-serif}
    .satori-product-url-box a,.satori-product-url-box button{height:40px;padding:0 14px;border-radius:20px;border:1px solid #d8cfc4;background:#fbf8f4;color:#1a1714;text-decoration:none;font:600 12px 'Inter',sans-serif;display:inline-flex;align-items:center;justify-content:center}
    @media(max-width:760px){.satori-product-url-box{padding:12px}.satori-product-url-box input{min-width:100%;width:100%}.satori-product-link-actions{min-width:170px}}
  `;
  document.head.appendChild(style);
}

function makeCopyButton(url: string) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Копировать";
  button.addEventListener("click", async (event) => {
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(url);
      const previous = button.textContent;
      button.textContent = "Скопировано";
      window.setTimeout(() => { button.textContent = previous; }, 1400);
    } catch {
      window.prompt("Ссылка на товар", url);
    }
  });
  return button;
}

async function enhanceProductsTable() {
  if (!window.location.pathname.startsWith("/admin")) return;
  const rows = Array.from(document.querySelectorAll<HTMLTableRowElement>(".admin-figma .fa-table-wrap tbody tr"));
  if (!rows.length) return;
  const products = await loadProducts();

  rows.forEach((row) => {
    if (row.querySelector(".satori-product-link-actions")) return;
    const name = row.querySelector<HTMLTableCellElement>("td:nth-child(2) b")?.textContent?.trim();
    if (!name) return;
    const product = products.find((p) => p.name === name);
    if (!product) return;
    const cell = row.lastElementChild as HTMLTableCellElement | null;
    if (!cell) return;

    const url = productUrl(product.id);
    const wrap = document.createElement("div");
    wrap.className = "satori-product-link-actions";

    const open = document.createElement("a");
    open.href = `/?p=${product.id}`;
    open.target = "_blank";
    open.rel = "noopener noreferrer";
    open.textContent = "Открыть";
    open.addEventListener("click", (event) => event.stopPropagation());

    wrap.append(open, makeCopyButton(url));
    cell.insertBefore(wrap, cell.firstChild);
  });
}

function enhanceProductEditor() {
  if (!window.location.pathname.startsWith("/admin")) return;
  const editor = document.querySelector<HTMLElement>(".admin-figma .fa-editor-page");
  if (!editor || editor.querySelector(".satori-product-url-box")) return;
  const meta = editor.querySelector<HTMLElement>(".fa-page-head p")?.textContent || "";
  const match = meta.match(/#(\d+)/);
  if (!match) return;
  const id = Number(match[1]);
  if (!Number.isFinite(id)) return;

  const url = productUrl(id);
  const box = document.createElement("div");
  box.className = "satori-product-url-box";

  const label = document.createElement("span");
  label.textContent = "ССЫЛКА НА ТОВАР";
  const input = document.createElement("input");
  input.readOnly = true;
  input.value = url;
  input.addEventListener("focus", () => input.select());
  const open = document.createElement("a");
  open.href = `/?p=${id}`;
  open.target = "_blank";
  open.rel = "noopener noreferrer";
  open.textContent = "Открыть";

  box.append(label, input, makeCopyButton(url), open);
  const head = editor.querySelector(".fa-page-head");
  head?.insertAdjacentElement("afterend", box);
}

function scan() {
  ensureStyles();
  void enhanceProductsTable();
  enhanceProductEditor();
}

export function startAdminProductLinks() {
  if (!window.location.pathname.startsWith("/admin")) return;
  const root = document.getElementById("root");
  if (!root) return;
  const observer = new MutationObserver(scan);
  observer.observe(root, { childList: true, subtree: true });
  window.setTimeout(scan, 0);
}
