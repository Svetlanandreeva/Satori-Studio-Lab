function normalizeDesignerHomeBlock() {
  const block = document.querySelector<HTMLElement>("section.satori-pro-home");
  if (!block) return;

  // The homepage layout CSS intentionally targets the original React sections
  // by section:nth-of-type(...). designerExperience used to inject an extra
  // <section> in the middle of that sequence, shifting Hits/Inspiration/Trust
  // onto the wrong rules. Keep the designer block, but make it neutral to the
  // section numbering used by the approved storefront layout.
  const replacement = document.createElement("div");
  for (const attr of Array.from(block.attributes)) {
    replacement.setAttribute(attr.name, attr.value);
  }
  while (block.firstChild) replacement.appendChild(block.firstChild);
  block.replaceWith(replacement);
}

export function startHomepageSectionStability() {
  if (window.location.pathname.startsWith("/admin")) return;

  normalizeDesignerHomeBlock();

  const root = document.getElementById("root");
  if (!root) return;

  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      normalizeDesignerHomeBlock();
    });
  });

  observer.observe(root, { childList: true, subtree: true });
  window.addEventListener("popstate", normalizeDesignerHomeBlock);
  window.addEventListener("satori-route-change", normalizeDesignerHomeBlock);
}
