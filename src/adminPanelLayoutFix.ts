function relocateAdminPanels() {
  if (!window.location.pathname.startsWith("/admin")) return;

  const host = document.getElementById("satori-admin-extra-host");
  if (!host) return;

  const coverPanel = document.getElementById("satori-home-cover-admin");
  const inspirationPanel = document.getElementById("satori-inspiration-cover-admin");

  if (coverPanel && coverPanel.parentElement !== host) {
    host.appendChild(coverPanel);
  }
  if (inspirationPanel && inspirationPanel.parentElement !== host) {
    host.appendChild(inspirationPanel);
  }

  const placeholder = host.querySelector<HTMLElement>(":scope > p");
  if (placeholder) placeholder.style.display = "none";
}

function ensureAdminPanelLayoutStyles() {
  if (document.getElementById("satori-admin-panel-layout-fix")) return;
  const style = document.createElement("style");
  style.id = "satori-admin-panel-layout-fix";
  style.textContent = `
    .admin-figma .fa-home-grid { align-items: start; }
    .admin-figma #satori-admin-extra-host {
      width: 100%;
      display: grid;
      grid-template-columns: 1fr;
      gap: 18px;
      margin-top: 24px;
    }
    .admin-figma #satori-admin-extra-host > .satori-cover-admin-panel {
      width: 100%;
      margin-top: 0;
    }
    .admin-figma #satori-admin-extra-host .satori-cover-admin-grid {
      width: 100%;
    }
    @media (max-width: 760px) {
      .admin-figma #satori-admin-extra-host { margin-top: 14px; gap: 14px; }
    }
  `;
  document.head.appendChild(style);
}

export function startAdminPanelLayoutFix() {
  if (!window.location.pathname.startsWith("/admin")) return;
  const root = document.getElementById("root");
  if (!root) return;

  ensureAdminPanelLayoutStyles();
  const scan = () => window.requestAnimationFrame(relocateAdminPanels);
  const observer = new MutationObserver(scan);
  observer.observe(root, { childList: true, subtree: true });
  window.addEventListener("popstate", scan);
  window.setTimeout(relocateAdminPanels, 0);
}
