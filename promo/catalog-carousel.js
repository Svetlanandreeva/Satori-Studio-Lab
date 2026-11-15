/* Компактные карусели каталога. Существующий просмотр фото и
   обработчики «Хочу похожий» из app.js остаются без изменений. */
(function () {
  'use strict';
  var galleries = document.querySelectorAll('.studio-catalog .group .works');

  galleries.forEach(function (track, galleryIndex) {
    var slides = Array.from(track.querySelectorAll(':scope > figure'));
    if (slides.length < 2) return;

    var group = track.closest('.group');
    var title = group && group.querySelector('h2');
    var name = title ? title.textContent.trim() : 'проекта';
    track.classList.add('catalog-carousel-track');
    track.tabIndex = 0;
    track.setAttribute('role', 'region');
    track.setAttribute('aria-roledescription', 'карусель');
    track.setAttribute('aria-label', 'Фотографии: ' + name);
    track.id = 'catalog-carousel-' + (galleryIndex + 1);

    slides.forEach(function (slide, index) {
      slide.setAttribute('aria-label', 'Фото ' + (index + 1) + ' из ' + slides.length);
      if (galleryIndex === 0 && index > 0) {
        var img = slide.querySelector('img');
        if (img) img.loading = 'lazy';
      }
    });

    var controls = document.createElement('div');
    controls.className = 'catalog-carousel-controls';
    var count = document.createElement('span');
    count.className = 'catalog-carousel-count';
    count.setAttribute('aria-live', 'off');

    function makeArrow(symbol, label, className) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'catalog-carousel-arrow ' + className;
      button.textContent = symbol;
      button.setAttribute('aria-label', label + ': ' + name);
      button.setAttribute('aria-controls', track.id);
      return button;
    }

    var previous = makeArrow('‹', 'Предыдущее фото', 'catalog-carousel-prev');
    var next = makeArrow('›', 'Следующее фото', 'catalog-carousel-next');
    controls.append(count, previous, next);
    track.insertAdjacentElement('afterend', controls);

    function itemStep() {
      var gap = parseFloat(getComputedStyle(track).columnGap) || 0;
      return slides[0].getBoundingClientRect().width + gap;
    }

    function updateControls() {
      var maxScroll = Math.max(0, track.scrollWidth - track.clientWidth);
      var position = Math.max(0, track.scrollLeft);
      var step = itemStep();
      var current = step > 0 ? Math.min(slides.length, Math.round(position / step) + 1) : 1;
      count.textContent = String(current).padStart(2, '0') + ' / ' +
        String(slides.length).padStart(2, '0');
      controls.hidden = maxScroll < 2;
      previous.disabled = position < 2;
      next.disabled = position >= maxScroll - 2;
    }

    function move(direction) {
      var step = itemStep();
      if (!step) return;
      var current = Math.round(track.scrollLeft / step);
      var target = Math.max(0, Math.min(
        track.scrollWidth - track.clientWidth,
        (current + direction) * step
      ));
      track.scrollTo({
        left: target,
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'
      });
    }

    previous.addEventListener('click', function () { move(-1); });
    next.addEventListener('click', function () { move(1); });
    track.addEventListener('keydown', function (event) {
      if (event.key === 'ArrowRight') { event.preventDefault(); move(1); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1); }
    });

    var pending = false;
    track.addEventListener('scroll', function () {
      if (pending) return;
      pending = true;
      requestAnimationFrame(function () {
        pending = false;
        updateControls();
      });
    }, { passive: true });
    window.addEventListener('resize', updateControls, { passive: true });
    updateControls();
  });
})();