type LeadWithReference = {
  id: string;
  type: "custom" | "business";
  name?: string;
  company?: string;
  phone?: string;
  contact?: string;
  referenceName?: string;
  referenceDataUrl?: string;
};

const TOKEN_KEY = "satori_admin_token";
let cache: LeadWithReference[] = [];
let loadedAt = 0;
let loading: Promise<LeadWithReference[]> | null = null;

function norm(value: string | null | undefined) {
  return (value || "").replace(/\s+/g, " ").trim();
}

async function loadLeads() {
  if (cache.length && Date.now() - loadedAt < 30000) return cache;
  if (loading) return loading;
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return [];
  loading = fetch("/api/admin/leads", { headers: { Authorization: `Bearer ${token}` } })
    .then((r) => r.ok ? r.json() : [])
    .then((list) => {
      cache = Array.isArray(list) ? list : [];
      loadedAt = Date.now();
      return cache;
    })
    .catch(() => [])
    .finally(() => { loading = null; });
  return loading;
}

function selectedLeadIdentity(detail: HTMLElement) {
  const title = norm(detail.querySelector("h2")?.textContent);
  const headings = Array.from(detail.querySelectorAll<HTMLElement>("h3")).map((el) => norm(el.textContent));
  const contactLine = headings[0] || "";
  return { title, contactLine };
}

function findMatchingLead(leads: LeadWithReference[], detail: HTMLElement) {
  const { title, contactLine } = selectedLeadIdentity(detail);
  return leads.find((lead) => {
    if (lead.type !== "custom") return false;
    const label = norm(lead.name || lead.company);
    if (!label || label !== title) return false;
    const candidates = [lead.phone, lead.contact].map(norm).filter(Boolean);
    return !candidates.length || candidates.some((value) => contactLine.includes(value));
  });
}

function injectReference(detail: HTMLElement, lead: LeadWithReference) {
  detail.querySelector(".satori-admin-reference")?.remove();
  if (!lead.referenceDataUrl) return;

  const block = document.createElement("div");
  block.className = "satori-admin-reference";
  block.style.cssText = "margin:18px 0 6px;padding-top:16px;border-top:1px solid rgba(255,255,255,.09);font-family:Inter,sans-serif";

  const label = document.createElement("div");
  label.textContent = "РЕФЕРЕНС";
  label.style.cssText = "margin-bottom:10px;color:#94877a;font-size:9px;font-weight:700;letter-spacing:.13em";

  const preview = document.createElement("a");
  preview.href = lead.referenceDataUrl;
  preview.download = lead.referenceName || "reference.jpg";
  preview.target = "_blank";
  preview.rel = "noreferrer";
  preview.style.cssText = "display:block;overflow:hidden;border:1px solid rgba(255,255,255,.10);border-radius:14px;background:#171310;color:inherit;text-decoration:none";

  const image = document.createElement("img");
  image.src = lead.referenceDataUrl;
  image.alt = lead.referenceName || "Референс к заявке";
  image.style.cssText = "display:block;width:100%;max-height:260px;object-fit:cover";

  const caption = document.createElement("span");
  caption.textContent = lead.referenceName ? `Открыть / скачать · ${lead.referenceName}` : "Открыть / скачать референс";
  caption.style.cssText = "display:block;padding:11px 12px;color:#d7c8b8;font-size:11px";

  preview.append(image, caption);
  block.append(label, preview);

  const idea = detail.querySelector(".fa-idea");
  if (idea) idea.insertAdjacentElement("afterend", block);
  else detail.appendChild(block);
}

async function scan() {
  if (!window.location.pathname.startsWith("/admin")) return;
  const detail = document.querySelector<HTMLElement>(".fa-leads-split .fa-detail");
  if (!detail) return;
  const identity = JSON.stringify(selectedLeadIdentity(detail));
  if (detail.dataset.satoriReferenceIdentity === identity) return;
  detail.dataset.satoriReferenceIdentity = identity;
  const leads = await loadLeads();
  if (!detail.isConnected) return;
  const lead = findMatchingLead(leads, detail);
  detail.querySelector(".satori-admin-reference")?.remove();
  if (lead) injectReference(detail, lead);
}

export function startAdminLeadReference() {
  if (!window.location.pathname.startsWith("/admin")) return;
  const root = document.getElementById("root");
  if (!root) return;
  void scan();
  let scheduled = false;
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      void scan();
    });
  }).observe(root, { childList: true, subtree: true, characterData: true });
}
