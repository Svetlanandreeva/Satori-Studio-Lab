const METRIKA_COUNTER_ID = 110458266;

function currentUrl() {
  return window.location.href;
}

export function startMetrikaSpaTracking() {
  if (window.location.pathname.startsWith("/admin")) return;

  // The initial page view is sent by the Yandex.Metrika tag in index.html.
  // Here we only report client-side URL changes produced by the SPA router.
  let lastTrackedUrl = currentUrl();
  let scheduled = false;

  const track = () => {
    scheduled = false;
    const url = currentUrl();
    if (url === lastTrackedUrl) return;
    lastTrackedUrl = url;

    const ym = (window as any).ym;
    if (typeof ym !== "function") return;
    ym(METRIKA_COUNTER_ID, "hit", url, {
      title: document.title,
      referer: document.referrer,
    });
  };

  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    // Let React/SEO helpers update title/canonical before the virtual pageview.
    window.setTimeout(track, 0);
  };

  const originalPushState = history.pushState.bind(history);
  history.pushState = ((...args: Parameters<History["pushState"]>) => {
    originalPushState(...args);
    schedule();
  }) as History["pushState"];

  const originalReplaceState = history.replaceState.bind(history);
  history.replaceState = ((...args: Parameters<History["replaceState"]>) => {
    originalReplaceState(...args);
    schedule();
  }) as History["replaceState"];

  window.addEventListener("satori-route-change", schedule);
}
