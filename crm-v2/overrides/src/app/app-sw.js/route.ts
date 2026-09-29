/**
 * Service worker веб-приложения. Ничего не кэширует из данных CRM (всегда свежие),
 * только показывает понятную страницу, если пропал интернет.
 * Старый /sw.js остаётся «самоудаляющимся» для браузеров со старой PWA.
 */
const SW = `
const OFFLINE = '<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Нет сети · Satori CRM</title><body style="margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center;background:#f3f4f6;font:15px -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;color:#0f172a"><div style="text-align:center;padding:24px"><div style="font-size:18px;font-weight:600;margin-bottom:6px">Нет подключения к интернету</div><div style="color:#64748b;margin-bottom:16px">CRM откроется, как только связь вернётся.</div><button onclick="location.reload()" style="border:0;border-radius:10px;background:#0f172a;color:#fff;padding:10px 18px;font:inherit;cursor:pointer">Обновить</button></div></body></html>';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(fetch(event.request).catch(() => new Response(OFFLINE, { headers: { 'content-type': 'text/html; charset=utf-8' } })));
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
