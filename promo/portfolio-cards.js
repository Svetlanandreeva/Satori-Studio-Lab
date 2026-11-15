/* Satori portfolio: project cards carousel with dedicated photo viewer.
   Source HTML stays in the page for indexing and no-JavaScript fallback. */
(async function () {
  'use strict';

  const section = document.querySelector('.studio-catalog .catalog-projects-section');
  const root = section && section.querySelector('.wrap');
  if (!root) return;

  // The HTML gallery remains a complete fallback while the admin API is
  // unavailable (or before the backend deployment has finished).
  try {
    const response = await fetch('/api/portfolio', { cache: 'no-store' });
    if (response.ok) {
      const payload = await response.json();
      if (Array.isArray(payload.projects) && payload.projects.length) {
        const freshGroups = document.createDocumentFragment();
        payload.projects.forEach(project => {
          if (!project || !Array.isArray(project.images) || !project.images.length) return;
          const group = document.createElement('div');
          group.className = 'group';
          const heading = document.createElement('h2');
          heading.id = String(project.id || '');
          heading.textContent = String(project.title || 'Работа Satori');
          group.append(heading);
          (project.descriptions || []).forEach(description => {
            const paragraph = document.createElement('p');
            paragraph.className = 'sub';
            paragraph.textContent = String(description);
            group.append(paragraph);
          });
          const works = document.createElement('div');
          works.className = 'works';
          project.images.forEach(photo => {
            if (!photo || !photo.url) return;
            const figure = document.createElement('figure');
            figure.dataset.name = project.title;
            const image = document.createElement('img');
            image.src = String(photo.url);
            image.alt = String(photo.alt || project.title);
            image.loading = 'lazy';
            const like = document.createElement('button');
            like.type = 'button';
            like.className = 'like';
            like.textContent = 'Хочу похожий';
            figure.append(image, like);
            works.append(figure);
          });
          group.append(works);
          freshGroups.append(group);
        });
        if (freshGroups.childElementCount) {
          Array.from(root.children)
            .filter(el => el.classList.contains('group'))
            .forEach(group => group.remove());
          root.append(freshGroups);
        }
      }
    }
  } catch (_) { /* Keep the existing static catalog if API is unavailable. */ }

  const groups = Array.from(root.children).filter(el => el.classList.contains('group'));
  if (!groups.length) return;

  function make(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  const projects = groups.map((group, index) => {
    const heading = group.querySelector('h2');
    const title = heading ? heading.textContent.trim() : 'Работа Satori';
    const anchor = heading && heading.id ? heading.id : 'satori-project-' + (index + 1);
    if (heading && heading.id) heading.removeAttribute('id');
    const description = Array.from(group.querySelectorAll(':scope > p.sub'))
      .map(p => p.textContent.trim()).filter(Boolean);
    const photos = Array.from(group.querySelectorAll('.works figure')).map(figure => {
      const img = figure.querySelector('img');
      return img ? {
        src: img.getAttribute('src'),
        alt: img.getAttribute('alt') || title + ' — Satori',
        like: figure.querySelector('.like')
      } : null;
    }).filter(Boolean);
    return { title, anchor, description, photos, number: index + 1 };
  }).filter(project => project.photos.length > 0);

  if (!projects.length) return;

  const source = make('div', 'portfolio-originals');
  source.hidden = true;
  groups.forEach(group => source.append(group));

  const heading = make('div', 'portfolio-toolbar');
  const summary = make('div', 'portfolio-toolbar-copy');
  summary.append(make('p', 'portfolio-toolbar-kicker', 'ПРОЕКТЫ SATORI · ' + projects.length + ' РАБОТ'));
  summary.append(make('p', 'portfolio-toolbar-hint', 'Листайте проекты и открывайте фотографии в полном размере'));
  const actions = make('div', 'portfolio-toolbar-actions');
  const counter = make('span', 'portfolio-project-counter');
  counter.setAttribute('aria-live', 'polite');

  function arrow(direction, label, className) {
    const button = make('button', 'portfolio-arrow ' + className, direction === -1 ? 'Назад' : 'Далее');
    button.type = 'button';
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-controls', 'portfolio-project-track');
    return button;
  }
  const previous = arrow(-1, 'Предыдущий проект', 'portfolio-prev');
  const next = arrow(1, 'Следующий проект', 'portfolio-next');
  actions.append(counter, previous, next);
  heading.append(summary, actions);

  const rail = make('div', 'portfolio-project-track');
  rail.id = 'portfolio-project-track';
  rail.tabIndex = 0;
  rail.setAttribute('role', 'region');
  rail.setAttribute('aria-roledescription', 'карусель');
  rail.setAttribute('aria-label', 'Проекты и работы студии Satori');

  function makeProjectCard(project) {
    const card = make('article', 'portfolio-project-card');
    card.id = project.anchor;
    const media = make('div', 'portfolio-project-media');
    const cover = make('button', 'portfolio-project-cover');
    let activePhoto = 0;
    cover.type = 'button';
    cover.setAttribute('aria-label', 'Открыть фотографии: ' + project.title);
    const image = make('img');
    image.src = project.photos[0].src;
    image.alt = project.photos[0].alt;
    image.loading = project.number < 3 ? 'eager' : 'lazy';
    image.decoding = 'async';
    const photoCount = make('span', 'portfolio-photo-count');
    cover.append(image);
    let coverSwipe = null;
    let suppressCoverClickUntil = 0;
    cover.addEventListener('touchstart', event => {
      if (event.touches.length === 1) {
        coverSwipe = { x: event.touches[0].clientX, y: event.touches[0].clientY };
      }
    }, { passive: true });
    cover.addEventListener('touchend', event => {
      if (!coverSwipe || !event.changedTouches.length || project.photos.length < 2) return;
      const dx = event.changedTouches[0].clientX - coverSwipe.x;
      const dy = event.changedTouches[0].clientY - coverSwipe.y;
      coverSwipe = null;
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        suppressCoverClickUntil = Date.now() + 650;
        setPhoto(activePhoto + (dx < 0 ? 1 : -1));
      }
    }, { passive: true });
    cover.addEventListener('click', event => {
      if (Date.now() < suppressCoverClickUntil) {
        event.preventDefault();
        return;
      }
      openProject(project, activePhoto);
    });
    media.append(cover, photoCount);
    function setPhoto(index) {
      activePhoto = (index + project.photos.length) % project.photos.length;
      const photo = project.photos[activePhoto];
      image.src = photo.src;
      image.alt = photo.alt + ' — ракурс ' + (activePhoto + 1);
      photoCount.textContent = (activePhoto + 1) + ' / ' + project.photos.length;
    }
    setPhoto(0);

    const copy = make('div', 'portfolio-project-copy');
    const number = make('p', 'portfolio-project-index',
      'ПРОЕКТ ' + String(project.number).padStart(2, '0') + ' / ' + String(projects.length).padStart(2, '0'));
    const title = make('h2', 'portfolio-project-title', project.title);
    copy.append(number, title);
    const descriptions = project.description.length ? project.description :
      ['Индивидуальный проект студии Satori. Детали исполнения и размеры для нового заказа обсудим отдельно.'];
    // Show a concise preview on the card; keep the full original texts in
    // the hidden source gallery and in the server-side project record.
    copy.append(make('p', 'portfolio-project-description', descriptions.join(' ')));

    const cardBottom = make('div', 'portfolio-project-bottom');
    const galleryLink = make('button', 'portfolio-gallery-link',
      'Смотреть фото (' + project.photos.length + ')');
    galleryLink.type = 'button';
    galleryLink.addEventListener('click', () => openProject(project, activePhoto));
    const like = make('a', 'portfolio-project-like', 'Хочу похожий');
    like.href = '/?like=' + encodeURIComponent(project.title) + '#zayavka';
    like.addEventListener('click', function (event) {
      dispatchLike(event, project);
    });
    cardBottom.append(like, galleryLink);
    copy.append(cardBottom);
    card.append(media, copy);
    return card;
  }

  function dispatchLike(event, project) {
    if (event && (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey)) return;
    const original = project.photos[0].like;
    if (original) {
      if (event) event.preventDefault();
      original.click(); // Retains existing "like_click" conversion goal in app.js.
    }
  }

  projects.forEach(project => rail.append(makeProjectCard(project)));
  root.append(heading, rail, source);

  const cards = Array.from(rail.children);
  // Desktop: 3 cards, tablet: 2 cards, mobile: 1 card.
  // The actual visible number comes from CSS card width instead of a
  // hardcoded breakpoint, so carousel pages always align with the layout.
  function visibleCount() {
    if (!cards.length) return 1;
    const gap = parseFloat(getComputedStyle(rail).columnGap) || 0;
    const width = cards[0].getBoundingClientRect().width;
    return width ? Math.max(1, Math.min(cards.length,
      Math.round((rail.clientWidth + gap) / (width + gap)))) : 1;
  }
  function pageStarts() {
    const visible = visibleCount();
    const pageTotal = Math.ceil(cards.length / visible);
    return Array.from({ length: pageTotal }, (_, index) =>
      Math.min(index * visible, Math.max(0, cards.length - visible)));
  }
  function currentPage() {
    const left = rail.getBoundingClientRect().left;
    const starts = pageStarts();
    let best = 0;
    let distance = Infinity;
    starts.forEach((cardIndex, index) => {
      const delta = Math.abs(cards[cardIndex].getBoundingClientRect().left - left);
      if (delta < distance) { best = index; distance = delta; }
    });
    return best;
  }
  function updateNavigation() {
    const starts = pageStarts();
    const page = currentPage();
    const first = starts[page];
    const last = Math.min(cards.length, first + visibleCount());
    counter.textContent =
      String(first + 1).padStart(2, '0') +
      (first + 1 !== last ? '–' + String(last).padStart(2, '0') : '') +
      ' / ' + String(cards.length).padStart(2, '0');
    previous.disabled = page === 0;
    next.disabled = page === starts.length - 1;
  }
  function goToPage(page) {
    const starts = pageStarts();
    const index = starts[Math.max(0, Math.min(page, starts.length - 1))];
    const target = cards[index];
    if (!target) return;
    rail.scrollTo({
      left: rail.scrollLeft + target.getBoundingClientRect().left -
        rail.getBoundingClientRect().left,
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    });
  }
  previous.addEventListener('click', () => goToPage(currentPage() - 1));
  next.addEventListener('click', () => goToPage(currentPage() + 1));
  rail.addEventListener('keydown', function (event) {
    if (event.target !== rail) return;
    if (event.key === 'ArrowRight') { event.preventDefault(); goToPage(currentPage() + 1); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); goToPage(currentPage() - 1); }
  });
  let pending = false;
  rail.addEventListener('scroll', function () {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; updateNavigation(); });
  }, { passive: true });
  window.addEventListener('resize', updateNavigation, { passive: true });
  updateNavigation();

  const dialog = make('dialog', 'portfolio-viewer');
  dialog.setAttribute('aria-label', 'Галерея проекта Satori');
  dialog.innerHTML = `
    <div class="portfolio-viewer-shell">
      <div class="portfolio-viewer-header">
        <div><span class="portfolio-viewer-eyebrow">ГАЛЕРЕЯ ПРОЕКТА</span>
        <h2 class="portfolio-viewer-title"></h2></div>
        <button class="portfolio-viewer-close" type="button" aria-label="Закрыть галерею">×</button>
      </div>
      <div class="portfolio-viewer-stage">
        <button class="portfolio-viewer-back" type="button" aria-label="Предыдущее фото">‹</button>
        <img class="portfolio-viewer-image" alt="">
        <button class="portfolio-viewer-forward" type="button" aria-label="Следующее фото">›</button>
      </div>
      <div class="portfolio-viewer-footer">
        <div class="portfolio-viewer-meta">
          <span class="portfolio-viewer-position"></span>
          <a class="portfolio-viewer-original" href="#" target="_blank" rel="noopener">Открыть оригинал ↗</a>
        </div>
        <div class="portfolio-viewer-thumbnails" aria-label="Выбрать фотографию"></div>
        <a class="portfolio-viewer-like" href="/#zayavka">Хочу похожий ↗</a>
      </div>
    </div>`;
  document.body.append(dialog);
  const viewerTitle = dialog.querySelector('.portfolio-viewer-title');
  const viewerImage = dialog.querySelector('.portfolio-viewer-image');
  const viewerPos = dialog.querySelector('.portfolio-viewer-position');
  const viewerOriginal = dialog.querySelector('.portfolio-viewer-original');
  const viewerThumbs = dialog.querySelector('.portfolio-viewer-thumbnails');
  const viewerLike = dialog.querySelector('.portfolio-viewer-like');
  const viewerPrev = dialog.querySelector('.portfolio-viewer-back');
  const viewerNext = dialog.querySelector('.portfolio-viewer-forward');
  let currentProject = null;
  let currentPhoto = 0;

  function showPhoto(index) {
    if (!currentProject) return;
    currentPhoto = (index + currentProject.photos.length) % currentProject.photos.length;
    const photo = currentProject.photos[currentPhoto];
    viewerImage.src = photo.src;
    viewerImage.alt = photo.alt + ', фотография ' + (currentPhoto + 1);
    viewerOriginal.href = photo.src;
    viewerPos.textContent = String(currentPhoto + 1).padStart(2, '0') + ' / ' +
      String(currentProject.photos.length).padStart(2, '0');
    viewerPrev.disabled = currentProject.photos.length < 2;
    viewerNext.disabled = currentProject.photos.length < 2;
    Array.from(viewerThumbs.children).forEach((thumb, index) => {
      const active = index === currentPhoto;
      thumb.setAttribute('aria-current', String(active));
      if (active) thumb.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
  }

  function openProject(project, index) {
    if (!dialog.showModal) {
      window.open(project.photos[index].src, '_blank', 'noopener');
      return;
    }
    currentProject = project;
    viewerTitle.textContent = project.title;
    viewerLike.href = '/?like=' + encodeURIComponent(project.title) + '#zayavka';
    viewerThumbs.replaceChildren();
    project.photos.forEach((photo, i) => {
      const button = make('button', 'portfolio-viewer-thumbnail');
      button.type = 'button';
      button.setAttribute('aria-label', 'Фото ' + (i + 1));
      const image = make('img');
      image.src = photo.src;
      image.alt = '';
      image.loading = 'lazy';
      button.append(image);
      button.addEventListener('click', () => showPhoto(i));
      viewerThumbs.append(button);
    });
    dialog.showModal();
    showPhoto(index);
  }

  dialog.querySelector('.portfolio-viewer-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', () => {
    viewerImage.removeAttribute('src');
    viewerThumbs.replaceChildren();
    currentProject = null;
  });
  viewerPrev.addEventListener('click', () => showPhoto(currentPhoto - 1));
  viewerNext.addEventListener('click', () => showPhoto(currentPhoto + 1));
  dialog.addEventListener('keydown', event => {
    if (!currentProject) return;
    if (event.key === 'ArrowRight') { event.preventDefault(); showPhoto(currentPhoto + 1); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); showPhoto(currentPhoto - 1); }
  });
  viewerLike.addEventListener('click', event => {
    if (!currentProject) return;
    dispatchLike(event, currentProject);
  });

  let touchStartX = null;
  const stage = dialog.querySelector('.portfolio-viewer-stage');
  stage.addEventListener('touchstart', event => {
    if (event.touches.length === 1) touchStartX = event.touches[0].clientX;
  }, { passive: true });
  stage.addEventListener('touchend', event => {
    if (touchStartX === null || !event.changedTouches.length) return;
    const distance = event.changedTouches[0].clientX - touchStartX;
    touchStartX = null;
    if (Math.abs(distance) > 55 && currentProject) showPhoto(currentPhoto + (distance < 0 ? 1 : -1));
  }, { passive: true });

  // Support existing links from the Business and Process pages to individual projects.
  if (location.hash) {
    const target = cards.find(card => '#' + card.id === location.hash);
    if (target) {
      goToPage(Math.floor(cards.indexOf(target) / visibleCount()));
      setTimeout(() => section.scrollIntoView({ block: 'start' }), 0);
    }
  }
})();
