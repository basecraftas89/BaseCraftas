(() => {
  'use strict';
  const carousel = document.querySelector('.corp-challenge-carousel');
  if (!carousel) return;
  const slides = [...carousel.querySelectorAll('.corp-challenge-slide')];
  const controls = carousel.querySelector('.corp-challenge-controls');
  const dots = carousel.querySelector('.corp-challenge-dots');
  const position = carousel.querySelector('.corp-challenge-position');
  const toggle = carousel.querySelector('.corp-autoplay');
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let current = 0, paused = motion.matches, hovering = false, timer = null;
  const buttons = slides.map((slide, i) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-label', `${i + 1}つ目の課題を見る`);
    button.addEventListener('click', () => go(i));
    dots.appendChild(button);
    return button;
  });
  function render() {
    slides.forEach((slide, i) => { slide.hidden = i !== current; });
    buttons.forEach((button, i) => button.setAttribute('aria-current', String(i === current)));
    position.textContent = `${current + 1} / ${slides.length}`;
    position.setAttribute('aria-live', paused ? 'polite' : 'off');
    toggle.textContent = paused ? '自動切替を再開' : '自動切替を停止';
  }
  function stop() { window.clearInterval(timer); timer = null; }
  function start() {
    stop();
    if (paused || hovering || document.hidden || carousel.contains(document.activeElement)) return;
    timer = window.setInterval(() => { current = (current + 1) % slides.length; render(); }, 2000);
  }
  function go(i) { current = (i + slides.length) % slides.length; render(); start(); }
  carousel.querySelector('[data-corp-prev]').addEventListener('click', () => go(current - 1));
  carousel.querySelector('[data-corp-next]').addEventListener('click', () => go(current + 1));
  toggle.addEventListener('click', () => { paused = !paused; render(); start(); });
  carousel.addEventListener('mouseenter', () => { hovering = true; stop(); });
  carousel.addEventListener('mouseleave', () => { hovering = false; start(); });
  carousel.addEventListener('focusin', stop);
  carousel.addEventListener('focusout', () => window.setTimeout(start, 0));
  carousel.addEventListener('keydown', e => {
    if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    e.preventDefault(); go(current + (e.key === 'ArrowRight' ? 1 : -1));
  });
  document.addEventListener('visibilitychange', start);
  motion.addEventListener('change', () => { paused = motion.matches; render(); start(); });
  controls.hidden = false;
  carousel.classList.add('is-enhanced');
  render(); start();
})();
