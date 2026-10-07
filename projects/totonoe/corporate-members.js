(() => {
  const slider = document.getElementById('corporate-members');
  if (!slider) return;
  const prev = document.querySelector('[data-member-prev]');
  const next = document.querySelector('[data-member-next]');
  const update = () => {
    prev.disabled = slider.scrollLeft <= 2;
    next.disabled = slider.scrollLeft + slider.clientWidth >= slider.scrollWidth - 2;
  };
  const move = (direction) => {
    const card = slider.querySelector('.corp-member-card');
    const gap = parseFloat(getComputedStyle(slider).columnGap) || 0;
    slider.scrollBy({left: direction * (card.getBoundingClientRect().width + gap), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
  };
  prev.addEventListener('click', () => move(-1));
  next.addEventListener('click', () => move(1));
  slider.addEventListener('scroll', update, {passive:true});
  window.addEventListener('resize', update);
  update();
})();
