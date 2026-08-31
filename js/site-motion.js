(function () {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.body.classList.add('js-reveal');

  const root = document.documentElement;
  const updateScrollProgress = () => {
    const max = Math.max(1, document.body.scrollHeight - window.innerHeight);
    root.style.setProperty('--scroll-progress', Math.min(1, window.scrollY / max).toFixed(4));
  };
  updateScrollProgress();
  window.addEventListener('scroll', updateScrollProgress, { passive: true });
  window.addEventListener('resize', updateScrollProgress);

  const revealItems = Array.from(document.querySelectorAll('.reveal'));
  revealItems.forEach((el, index) => {
    el.style.setProperty('--reveal-delay', `${Math.min(index % 4, 3) * 18}ms`);
  });

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
    revealItems.forEach((el) => observer.observe(el));
  } else {
    revealItems.forEach((el) => el.classList.add('visible'));
  }

  if (reduceMotion) return;
})();
