(() => {
  const hero = document.querySelector('[data-character-hero]');
  if (!hero) return;

  const markers = [...hero.querySelectorAll('[data-hero-marker]')];
  const scenes = [...hero.querySelectorAll('[data-hero-scene]')];
  const copies = [...hero.querySelectorAll('[data-hero-copy]')];
  const progress = [...hero.querySelectorAll('[data-hero-progress]')];
  let activeIndex = -1;
  let frame = 0;

  const setActive = (nextIndex) => {
    const index = Math.max(0, Math.min(nextIndex, scenes.length - 1));
    if (index === activeIndex) return;
    activeIndex = index;
    hero.dataset.activeIndex = String(index);

    scenes.forEach((scene, sceneIndex) => {
      scene.classList.toggle('is-active', sceneIndex === index);
      scene.classList.toggle('is-past', sceneIndex < index);
    });
    copies.forEach((copy, copyIndex) => {
      const isActive = copyIndex === index;
      copy.classList.toggle('is-active', isActive);
      copy.setAttribute('aria-hidden', String(!isActive));
    });
    progress.forEach((item, itemIndex) => item.classList.toggle('is-active', itemIndex === index));
  };

  const update = () => {
    frame = 0;
    const focusLine = window.innerHeight * 0.52;
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;

    markers.forEach((marker, index) => {
      const rect = marker.getBoundingClientRect();
      const distance = Math.abs(rect.top + rect.height / 2 - focusLine);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });
    setActive(nearestIndex);
  };

  const requestUpdate = () => {
    if (frame) return;
    frame = window.requestAnimationFrame(update);
  };

  window.addEventListener('scroll', requestUpdate, { passive: true });
  window.addEventListener('resize', requestUpdate);
  update();
})();
