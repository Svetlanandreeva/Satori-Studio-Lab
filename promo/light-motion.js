(function () {
  if (!('IntersectionObserver' in window) ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('studio-light-on');
      observer.unobserve(entry.target);
    }
  }, { threshold: 0.12 });

  const targets = document.querySelectorAll(
    'main h1, main .head h2, .detail-grid > article, .project-example, .category, .collab-card, .sourcing-panel, .studio-story figure, .process-drawings figure, .group h2'
  );
  targets.forEach(target => observer.observe(target));
})();
