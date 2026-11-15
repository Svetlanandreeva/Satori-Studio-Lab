(function () {
  const story = document.querySelector('.designer-story');
  if (!story) return;

  const scenes = [...story.querySelectorAll('.designer-scene')];
  const controls = story.querySelector('.designer-story-controls');
  const back = story.querySelector('[data-story-back]');
  const next = story.querySelector('[data-story-next]');
  const play = story.querySelector('[data-story-play]');
  const counter = story.querySelector('[data-story-counter]');
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const sceneDuration = 4400;
  let current = 0;
  let timer;
  let playing = false;
  let finished = false;

  function render() {
    scenes.forEach((scene, index) => { scene.hidden = index !== current; });
    counter.textContent = `Шаг ${current + 1} из ${scenes.length}`;
    back.disabled = current === 0;
    next.disabled = current === scenes.length - 1;
    play.textContent = playing ? 'Пауза' : finished || current === scenes.length - 1 ? 'Повторить' : 'Воспроизвести';
  }

  function schedule() {
    clearTimeout(timer);
    if (!playing) return;
    timer = setTimeout(() => {
      if (current === scenes.length - 1) {
        playing = false;
        finished = true;
      } else {
        current += 1;
      }
      render();
      schedule();
    }, sceneDuration);
  }

  function turn(offset) {
    playing = false;
    finished = false;
    current += offset;
    render();
    schedule();
  }

  story.classList.add('is-enhanced');
  controls.hidden = false;
  render();
  back.addEventListener('click', () => turn(-1));
  next.addEventListener('click', () => turn(1));
  play.addEventListener('click', () => {
    if (!playing && (finished || current === scenes.length - 1)) current = 0;
    finished = false;
    playing = !playing;
    render();
    schedule();
  });

  if (motion.matches || !('IntersectionObserver' in window)) return;
  const observer = new IntersectionObserver(entries => {
    if (!entries.some(entry => entry.isIntersecting)) return;
    observer.disconnect();
    if (current !== 0 || playing || finished) return;
    playing = true;
    render();
    schedule();
  }, { threshold: 0.55 });
  observer.observe(story);
  controls.addEventListener('click', () => observer.disconnect(), { once: true });
})();
