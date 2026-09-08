const BRIEF_TOKEN_KEY = "satori_crm_token";
const briefToken = () => localStorage.getItem(BRIEF_TOKEN_KEY) || "";

const FIELDS = [
  ["item", "Изделие / задача"],
  ["quantity", "Количество"],
  ["dimensions", "Размеры"],
  ["materials", "Материалы"],
  ["finish", "Цвет / фактура / покрытие"],
  ["construction", "Конструкция / крепление"],
  ["deadline", "Срок"],
  ["budget", "Бюджет"],
  ["delivery", "Доставка / город"],
  ["branding", "Брендинг / логотип"],
  ["packaging", "Упаковка"],
];
const CORE = ["item", "quantity", "dimensions", "materials", "deadline"];

let lastDealId = "";
let enhancing = false;
let badgeLoading = false;
let badgeLastAt = 0;

function bEsc(value = "") {
  return String(value).replace(/[&<>"']/g, (ch) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[ch]);
}

async function briefApi(url, options = {}) {
  const headers = {
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(briefToken() ? { Authorization: `Bearer ${briefToken()}` } : {}),
    ...(options.headers || {}),
  };
  const res = await fetch(url, { ...options, headers });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.error || "Ошибка ТЗ");
  return payload;
}

function emptyBrief() {
  return Object.fromEntries(FIELDS.map(([key]) => [key, ""]));
}

function normalizeBrief(value) {
  const src = value && typeof value === "object" ? value : {};
  const brief = emptyBrief();
  for (const [key] of FIELDS) brief[key] = String(src[key] || "").trim();
  brief.references = Array.isArray(src.references) ? src.references.filter(Boolean).map(String) : [];
  brief.notes = String(src.notes || "").trim();
  brief.confirmed = Boolean(src.confirmed);
  return brief;
}

function mergeBrief(primary, fallback) {
  const brief = normalizeBrief(primary);
  const other = normalizeBrief(fallback);
  for (const [key] of FIELDS) if (!brief[key] && other[key]) brief[key] = other[key];
  if (!brief.notes && other.notes) brief.notes = other.notes;
  brief.references = [...new Set([...(brief.references || []), ...(other.references || [])])];
  return brief;
}

function seedBrief(deal, aiLead) {
  let brief = mergeBrief(deal.brief, aiLead?.brief);
  const sourceText = `${deal.notes || ""}\n${aiLead?.summary || ""}`;
  if (!brief.item) brief.item = deal.title || "";
  if (!brief.deadline && deal.deadline) brief.deadline = deal.deadline;
  if (!brief.quantity) {
    const m = sourceText.match(/(?:количеств[оа]|тираж|qty)[^\d]{0,12}(\d{1,5})/i) || sourceText.match(/\b(\d{1,5})\s*(?:шт|штук)/i);
    if (m) brief.quantity = `${m[1]} шт.`;
  }
  if (!brief.dimensions) {
    const m = sourceText.match(/\b\d{1,4}(?:[.,]\d+)?\s*[xх×*]\s*\d{1,4}(?:[.,]\d+)?(?:\s*[xх×*]\s*\d{1,4}(?:[.,]\d+)?)?\s*(?:мм|см|м)?\b/i);
    if (m) brief.dimensions = m[0];
  }
  if (!brief.budget) {
    const m = sourceText.match(/(?:бюджет|до|около|ориентир)[^\d]{0,12}([\d\s]{3,})\s*(?:₽|руб|р\.)/i);
    if (m) brief.budget = `${m[1].replace(/\s+/g," ").trim()} ₽`;
  }
  return brief;
}

function progress(brief) {
  const normalized = normalizeBrief(brief);
  const filled = FIELDS.filter(([key]) => normalized[key]).length;
  const coreReady = CORE.every((key) => normalized[key]);
  return { filled, total: FIELDS.length, pct: Math.round((filled / FIELDS.length) * 100), ready: filled >= 8 && coreReady };
}

function briefStatusHtml(brief) {
  const p = progress(brief);
  return `<div class="brief-progress-row"><div><b>${p.filled}/${p.total}</b><span> параметров ТЗ</span></div><span class="brief-ready ${p.ready ? "yes" : "no"}">${p.ready ? "Готово к расчёту" : "Нужно уточнить"}</span></div><div class="brief-progress"><i style="width:${p.pct}%"></i></div>`;
}

function referenceRows(refs) {
  return (refs || []).map((url, i) => `<div class="brief-ref-row"><input name="reference_${i}" type="url" value="${bEsc(url)}" placeholder="https://…"><button type="button" data-remove-ref="${i}">×</button></div>`).join("");
}

function renderSection(deal, brief) {
  return `<section class="brief-section" data-brief-deal="${bEsc(deal.id)}">
    <div class="brief-title-row"><div><div class="brief-kicker">SATORI / ТЕХНИЧЕСКОЕ ЗАДАНИЕ</div><h3>ТЗ проекта</h3></div><button type="button" class="brief-secondary" data-brief-collapse>Свернуть</button></div>
    <div class="brief-status-wrap">${briefStatusHtml(brief)}</div>
    <div class="brief-grid">
      ${FIELDS.map(([key,label]) => `<label class="brief-field ${key === "item" || key === "materials" || key === "construction" ? "wide" : ""}"><span>${label}</span><textarea name="brief_${key}" rows="${key === "item" ? 2 : 1}">${bEsc(brief[key])}</textarea></label>`).join("")}
      <label class="brief-field wide"><span>Дополнительные пожелания</span><textarea name="brief_notes" rows="3">${bEsc(brief.notes)}</textarea></label>
      <div class="brief-field wide"><span>Референсы / файлы по ссылке</span><div class="brief-references">${referenceRows(brief.references)}</div><button type="button" class="brief-secondary" data-add-ref>+ Добавить ссылку</button></div>
      <label class="brief-confirm wide"><input type="checkbox" name="brief_confirmed" ${brief.confirmed ? "checked" : ""}><span>ТЗ подтверждено заказчиком</span></label>
    </div>
    <div class="brief-actions"><button type="button" class="brief-secondary" data-brief-copy>Скопировать ТЗ</button><button type="button" class="brief-primary" data-brief-save>Сохранить ТЗ</button></div>
  </section>`;
}

function collect(section) {
  const brief = emptyBrief();
  for (const [key] of FIELDS) brief[key] = section.querySelector(`[name="brief_${key}"]`)?.value.trim() || "";
  brief.notes = section.querySelector('[name="brief_notes"]')?.value.trim() || "";
  brief.confirmed = Boolean(section.querySelector('[name="brief_confirmed"]')?.checked);
  brief.references = [...section.querySelectorAll('.brief-references input')].map((i) => i.value.trim()).filter(Boolean);
  return brief;
}

function summaryText(brief) {
  const rows = FIELDS.filter(([key]) => brief[key]).map(([key,label]) => `${label}: ${brief[key]}`);
  if (brief.notes) rows.push(`Дополнительно: ${brief.notes}`);
  if (brief.references?.length) rows.push(`Референсы: ${brief.references.join(", ")}`);
  rows.push(`Статус: ${progress(brief).ready ? "готово к расчёту" : "требует уточнений"}${brief.confirmed ? ", подтверждено заказчиком" : ""}`);
  return rows.join("\n");
}

async function enhanceDealDialog(dialog) {
  if (enhancing || dialog.dataset.briefEnhanced || !lastDealId || !briefToken()) return;
  const form = dialog.querySelector("form#f");
  if (!form || !form.querySelector('[name="clientName"]') || !form.querySelector('[name="stage"]')) return;
  enhancing = true;
  try {
    const [bootstrap, aiData] = await Promise.all([
      briefApi("/api/bootstrap"),
      briefApi("/api/ai-manager/").catch(() => ({ contacts: [] })),
    ]);
    const deal = (bootstrap.deals || []).find((item) => item.id === lastDealId);
    if (!deal) return;
    dialog.dataset.briefEnhanced = "1";
    const aiLead = (aiData.contacts || []).find((item) => item.id === deal.sourceAiId || item.dealId === deal.id);
    let brief = seedBrief(deal, aiLead);
    const wrap = document.createElement("div");
    wrap.innerHTML = renderSection(deal, brief);
    const section = wrap.firstElementChild;
    form.parentNode.insertBefore(section, form.nextSibling);

    const refreshStatus = () => {
      brief = collect(section);
      section.querySelector(".brief-status-wrap").innerHTML = briefStatusHtml(brief);
    };
    section.addEventListener("input", refreshStatus);
    section.addEventListener("change", refreshStatus);

    section.querySelector("[data-add-ref]").addEventListener("click", () => {
      const row = document.createElement("div");
      row.className = "brief-ref-row";
      row.innerHTML = '<input type="url" placeholder="https://…"><button type="button">×</button>';
      row.querySelector("button").addEventListener("click", () => { row.remove(); refreshStatus(); });
      section.querySelector(".brief-references").appendChild(row);
      row.querySelector("input").focus();
    });
    section.querySelectorAll("[data-remove-ref]").forEach((button) => button.addEventListener("click", () => { button.closest(".brief-ref-row")?.remove(); refreshStatus(); }));
    section.querySelector("[data-brief-collapse]").addEventListener("click", (event) => {
      section.classList.toggle("collapsed");
      event.currentTarget.textContent = section.classList.contains("collapsed") ? "Развернуть" : "Свернуть";
    });
    section.querySelector("[data-brief-copy]").addEventListener("click", async () => {
      await navigator.clipboard?.writeText(summaryText(collect(section))).catch(() => {});
      eventToast("ТЗ скопировано");
    });
    section.querySelector("[data-brief-save]").addEventListener("click", async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      try {
        const current = collect(section);
        await briefApi(`/api/deals/${encodeURIComponent(deal.id)}`, { method: "PATCH", body: JSON.stringify({ brief: current }) });
        if (aiLead?.id) await briefApi(`/api/ai-manager/contacts/${encodeURIComponent(aiLead.id)}`, { method: "PATCH", body: JSON.stringify({ brief: current }) }).catch(() => {});
        eventToast(progress(current).ready ? "ТЗ сохранено — готово к расчёту" : "ТЗ сохранено");
        badgeLastAt = 0;
        decorateCards();
      } catch (error) { eventToast(error.message); }
      finally { button.disabled = false; }
    });
  } catch (error) {
    console.error("Brief UI:", error);
  } finally {
    enhancing = false;
  }
}

async function decorateCards() {
  if (!briefToken() || badgeLoading || Date.now() - badgeLastAt < 1400 || !document.querySelector(".deal[data-deal-id]")) return;
  badgeLoading = true;
  badgeLastAt = Date.now();
  try {
    const payload = await briefApi("/api/bootstrap");
    const byId = new Map((payload.deals || []).map((deal) => [deal.id, deal]));
    document.querySelectorAll(".deal[data-deal-id]").forEach((card) => {
      const deal = byId.get(card.dataset.dealId);
      if (!deal) return;
      const p = progress(deal.brief);
      let badge = card.querySelector(".brief-card-badge");
      if (!badge) {
        badge = document.createElement("div");
        badge.className = "brief-card-badge";
        card.appendChild(badge);
      }
      badge.classList.toggle("ready", p.ready);
      badge.textContent = p.ready ? `ТЗ ${p.filled}/${p.total} · Готово` : `ТЗ ${p.filled}/${p.total}`;
    });
  } catch {}
  finally { badgeLoading = false; }
}

function eventToast(text) {
  const el = document.createElement("div");
  el.className = "brief-toast";
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}

document.addEventListener("click", (event) => {
  const card = event.target.closest?.(".deal[data-deal-id]");
  if (card) lastDealId = card.dataset.dealId || "";
}, true);

const briefObserver = new MutationObserver(() => {
  document.querySelectorAll("dialog[open]").forEach((dialog) => enhanceDealDialog(dialog));
  decorateCards();
});
briefObserver.observe(document.documentElement, { childList: true, subtree: true });
setInterval(decorateCards, 3500);
decorateCards();
