const APP_ROOT = document.querySelector("#app");
let extensionsLoaded = false;

async function loadExtensions() {
  if (extensionsLoaded) return;
  if (!APP_ROOT?.querySelector(".shell")) return;
  extensionsLoaded = true;
  try {
    await Promise.all([
      import("/integrations-ui.js?v=postauth1"),
      import("/parser-history-ui.js?v=postauth1"),
      import("/ai-manager-ui.js?v=postauth1"),
      import("/brief-ui.js?v=postauth1"),
      import("/source-link-ui.js?v=postauth1"),
    ]);
  } catch (error) {
    console.error("CRM extensions failed to load:", error);
  }
}

if (APP_ROOT) {
  const observer = new MutationObserver(() => {
    if (!APP_ROOT.querySelector(".shell")) return;
    observer.disconnect();
    queueMicrotask(loadExtensions);
  });
  observer.observe(APP_ROOT, { childList: true, subtree: true });
}

loadExtensions();
