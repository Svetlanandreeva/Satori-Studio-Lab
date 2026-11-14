(function () {
  var film = document.querySelector('.hero-film video');
  if (film && film.canPlayType('video/mp4')) {
    var filmToggle = document.querySelector('.hero-film-toggle');
    var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    function playFilm() { film.play().catch(function () {}); }
    filmToggle.hidden = false;
    filmToggle.addEventListener('click', function () {
      if (film.paused) playFilm(); else film.pause();
    });
    film.addEventListener('playing', function () { filmToggle.textContent = 'Пауза'; });
    film.addEventListener('pause', function () { filmToggle.textContent = 'Воспроизвести видео'; });
    film.addEventListener('error', function () { filmToggle.hidden = true; }, true);
    if (!reducedMotion.matches) playFilm();
  }

  if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    var timelineObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('step-visible');
        timelineObserver.unobserve(entry.target);
      });
    }, { threshold: 0.25 });
    document.querySelectorAll('.process-timeline > li').forEach(function (step) {
      timelineObserver.observe(step);
    });
  }

  var COUNTER = 110458266;
  function goal(name) { try { window.ym && window.ym(COUNTER, 'reachGoal', name); } catch (e) {} }

  // Метки рекламы: сохраняем при первом заходе, прикладываем к заявке
  function tracking() {
    var out = {};
    try {
      var p = new URLSearchParams(location.search);
      var saved = JSON.parse(localStorage.getItem('satori_utm') || '{}');
      ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term'].forEach(function (k) {
        var v = p.get(k); if (v) saved[k] = v.slice(0, 200);
      });
      if (Object.keys(saved).length) localStorage.setItem('satori_utm', JSON.stringify(saved));
      for (var k in saved) out[k] = saved[k];
      var y = p.get('yclid'); if (y) localStorage.setItem('satori_yclid', y);
      y = y || localStorage.getItem('satori_yclid'); if (y) out.yclid = y;
      var c = localStorage.getItem('satori_cid'); if (c) out.clientId = c;
    } catch (e) {}
    return out;
  }
  tracking();
  try { window.ym(COUNTER, 'getClientID', function (id) { try { localStorage.setItem('satori_cid', id); } catch (e) {} }); } catch (e) {}

  document.querySelectorAll('[data-goal]').forEach(function (a) {
    a.addEventListener('click', function () { goal(a.getAttribute('data-goal')); });
  });

  function validContact(v) { return v.replace(/\D/g, '').length >= 10 || /^@?[a-zA-Z][\w.]{3,}$/.test(v) || v.indexOf('@') > 0; }

  function send(payload) {
    payload.type = 'custom';
    payload.tracking = tracking();
    return fetch('/api/leads', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (p) {
        if (!r.ok || p.ok !== true) throw new Error(p.error || 'Не удалось отправить заявку. Напишите нам в Telegram.');
        goal('lead_custom_submitted');
      });
    });
  }

  // «Хочу похожий»: на главной подставляем работу в форму, с каталога ведём на главную
  var form = document.getElementById('lead-form');
  function wantLike(name) {
    goal('like_click');
    if (!form) { location.href = '/?like=' + encodeURIComponent(name) + '#zayavka'; return; }
    var t = form.elements.idea, line = 'Хочу похожий светильник: ' + name + '.';
    if (t.value.indexOf(line) === -1) t.value = line + (t.value ? '\n' + t.value : '');
    document.getElementById('zayavka').scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(function () { try { form.elements.name.focus({ preventScroll: true }); } catch (e) {} }, 500);
  }
  try {
    var like = new URLSearchParams(location.search).get('like');
    if (like && form) form.elements.idea.value = 'Хочу похожий светильник: ' + like.slice(0, 80) + '.';
  } catch (e) {}

  // Просмотр фото
  var lb = document.getElementById('lb'), lbImg = lb && lb.querySelector('img'), lbName = '';
  function closeLb() { lb.classList.remove('on'); lbImg.removeAttribute('src'); }
  if (lb) {
    lb.addEventListener('click', function (e) { if (e.target === lb || e.target.classList.contains('x')) closeLb(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && lb.classList.contains('on')) closeLb(); });
    lb.querySelector('[data-like-lb]').addEventListener('click', function () { closeLb(); wantLike(lbName); });
  }
  document.addEventListener('click', function (e) {
    var f = e.target.closest && e.target.closest('.works figure');
    if (!f) return;
    var name = f.getAttribute('data-name') || 'из каталога';
    if (e.target.classList.contains('like')) { wantLike(name); return; }
    var img = f.querySelector('img');
    if (lb && img) { lbName = name; lbImg.src = img.currentSrc || img.src; lbImg.alt = img.alt; lb.classList.add('on'); }
  });

  if (!form) return;

  // Уменьшаем фото перед отправкой: сервер принимает не больше ~100 КБ
  function compact(file) {
    return new Promise(function (resolve, reject) {
      if (file.size > 8 * 1024 * 1024) return reject(new Error('Фото должно быть меньше 8 МБ'));
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('Не удалось прочитать файл')); };
      reader.onload = function () {
        var image = new Image();
        image.onerror = function () { reject(new Error('Не удалось обработать изображение')); };
        image.onload = function () {
          var scale = Math.min(1, 900 / Math.max(image.naturalWidth, image.naturalHeight)), q = 0.68, result = '';
          for (var i = 0; i < 7; i++) {
            var cv = document.createElement('canvas');
            cv.width = Math.max(280, Math.round(image.naturalWidth * scale));
            cv.height = Math.max(280, Math.round(image.naturalHeight * scale));
            var ctx = cv.getContext('2d');
            ctx.fillStyle = '#f6f0e8'; ctx.fillRect(0, 0, cv.width, cv.height);
            ctx.drawImage(image, 0, 0, cv.width, cv.height);
            result = cv.toDataURL('image/jpeg', q);
            if (result.length <= 60000) return resolve(result);
            scale *= 0.82; q = Math.max(0.38, q - 0.07);
          }
          if (result.length > 72000) return reject(new Error('Не удалось уменьшить фото. Отправьте заявку без него и пришлите фото в мессенджер.'));
          resolve(result);
        };
        image.src = String(reader.result || '');
      };
      reader.readAsDataURL(file);
    });
  }

  var status = form.querySelector('.status');
  var button = form.querySelector('button');
  function say(text, cls) { status.textContent = text; status.className = 'status' + (cls ? ' ' + cls : ''); }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (button.disabled) return;
    var d = new FormData(form);
    var name = String(d.get('name') || '').trim();
    var contact = String(d.get('contact') || '').trim();
    var idea = String(d.get('idea') || '').trim();
    var file = d.get('reference');
    if (!name) { say('Напишите, как к вам обращаться', 'err'); form.elements.name.focus(); return; }
    if (!validContact(contact)) { say('Укажите телефон или ник в мессенджере', 'err'); form.elements.contact.focus(); return; }
    button.disabled = true; say('Отправляем…');

    var ready = (file && file.size > 0) ? compact(file) : Promise.resolve(undefined);
    ready.then(function (dataUrl) {
      var refName = dataUrl ? file.name : undefined;
      return send({
        name: name, phone: contact, contact: contact,
        idea: [idea, refName ? 'Референс прикреплён: ' + refName + '.' : ''].filter(Boolean).join('\n\n'),
        referenceName: refName, referenceDataUrl: dataUrl, source: 'promo'
      });
    }).then(function () {
      form.reset();
      say('Заявка отправлена. Свяжемся с вами в течение рабочего дня.', 'ok');
    }).catch(function (err) {
      say((err && err.message) || 'Не удалось отправить заявку. Напишите нам в Telegram или позвоните.', 'err');
    }).then(function () { button.disabled = false; });
  });
})();
