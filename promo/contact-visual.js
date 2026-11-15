(function () {
  const canPreview = window.matchMedia('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)');
  const preview = document.querySelector('.contact-preview');
  const image = preview.querySelector('img');

  function positionPreview(event) {
    const x = Math.min(event.clientX + 24, window.innerWidth - preview.offsetWidth - 12);
    const y = Math.min(event.clientY + 18, window.innerHeight - preview.offsetHeight - 12);
    preview.style.transform = `translate(${Math.max(12, x)}px, ${Math.max(12, y)}px)`;
  }

  document.querySelectorAll('.contact-channels [data-image]').forEach(link => {
    link.addEventListener('pointerenter', event => {
      if (!canPreview.matches || event.pointerType !== 'mouse') return;
      image.src = '/promo/img/works/' + link.dataset.image;
      preview.hidden = false;
      positionPreview(event);
      preview.classList.add('is-visible');
    });
    link.addEventListener('pointermove', event => {
      if (preview.classList.contains('is-visible')) positionPreview(event);
    });
    link.addEventListener('pointerleave', () => preview.classList.remove('is-visible'));
  });
})();
