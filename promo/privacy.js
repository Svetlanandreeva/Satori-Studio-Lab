(function () {
  const preferenceKey = 'satori_analytics_v1';
  let choice;
  try { choice = localStorage.getItem(preferenceKey); } catch {}

  let started = false;
  const counter = 110458266;
  window.satoriAnalyticsAllowed = () => choice !== 'necessary';

  function startAnalytics() {
    if (started) return;
    started = true;
    window.ym = window.ym || function () { (window.ym.a ||= []).push(arguments); };
    window.ym.l = Date.now();
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://mc.yandex.ru/metrika/tag.js?id=' + counter;
    if (!document.querySelector('script[data-satori-metrika]')) {
      script.dataset.satoriMetrika = '';
      document.head.append(script);
    }
    window.ym(counter, 'init', { clickmap: true, accurateTrackBounce: true, trackLinks: true });
    window.ym(counter, 'getClientID', id => {
      if (choice === 'necessary') return;
      try { localStorage.setItem('satori_cid', id); } catch {}
    });
  }

  const notice = document.createElement('aside');
  notice.className = 'cookie-notice';
  notice.setAttribute('aria-label', 'Настройки cookie');
  notice.hidden = Boolean(choice);
  notice.innerHTML = '<p>Сайт использует cookie и Яндекс Метрику для учёта посещений. Аналитику можно отключить. <a href="/promo/cookies.html">Подробнее</a></p><div><button type="button" data-choice="necessary">Отключить аналитику</button><button type="button" data-choice="allow">Хорошо</button></div>';
  document.body.append(notice);
  const settings = document.querySelector('[data-cookie-settings]');
  settings.hidden = false;
  settings.addEventListener('click', () => {
    notice.hidden = false;
    notice.querySelector('button').focus();
  });
  notice.addEventListener('click', event => {
    const value = event.target.closest('[data-choice]')?.dataset.choice;
    if (!value) return;
    choice = value;
    notice.hidden = true;
    try {
      localStorage.setItem(preferenceKey, value);
      if (value === 'necessary') {
        ['satori_utm', 'satori_yclid', 'satori_cid'].forEach(key => localStorage.removeItem(key));
      }
    } catch {}
    if (value === 'allow') {
      startAnalytics();
      window.dispatchEvent(new Event('satori-analytics-allowed'));
    }
    else if (started) {
      window.ym(counter, 'destruct');
      started = false;
    }
  });
  if (choice !== 'necessary') startAnalytics();
})();
