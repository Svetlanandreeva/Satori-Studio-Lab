/**
 * Service worker веб-приложения. Ничего не кэширует из данных CRM (всегда свежие),
 * только показывает понятную страницу, если пропал интернет.
 * Старый /sw.js остаётся «самоудаляющимся» для браузеров со старой PWA.
 */
const SW = `
// v2: связь бывает рвётся на секунду (перезапуск сервера при обновлении, мобильная сеть) —
// сначала тихо пробуем ещё пару раз, и только потом показываем экран «нет связи»,
// который сам перезагрузит страницу, как только CRM снова ответит.
const OFFLINE = '<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Переподключаюсь · Satori CRM</title><body style="margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center;background:#f3f4f6;font:15px -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;color:#0f172a"><div style="text-align:center;padding:24px"><div id="t" style="font-size:18px;font-weight:600;margin-bottom:6px">Переподключаюсь к CRM…</div><div id="s" style="color:#64748b;margin-bottom:16px">Страница откроется сама, как только связь вернётся.</div><button onclick="location.reload()" style="border:0;border-radius:10px;background:#0f172a;color:#fff;padding:10px 18px;font:inherit;cursor:pointer">Обновить</button></div><script>if(!navigator.onLine){document.getElementById("t").textContent="Нет подключения к интернету"}var n=0;function p(){fetch("/login",{method:"HEAD",cache:"no-store"}).then(function(r){if(r.ok||r.status<500)location.reload();else t()}).catch(t)}function t(){n++;setTimeout(p,Math.min(15000,2000*n))}addEventListener("online",function(){location.reload()});t()</script></body></html>';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function withRetry(request) {
  let last;
  for (const delay of [0, 800, 2000]) {
    if (delay) await wait(delay);
    try { return await fetch(request); } catch (e) { last = e; }
  }
  throw last;
}
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate' || event.request.method !== 'GET') return;
  event.respondWith(withRetry(event.request).catch(() => new Response(OFFLINE, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } })));
});
`;

export function GET() {
  return new Response(SW, {
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "no-cache",
      "service-worker-allowed": "/",
    },
  });
}
