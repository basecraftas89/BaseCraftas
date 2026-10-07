(function () {
  'use strict';
  var track = document.getElementById('challengeTrack');
  if (!track) return;
  var cards = Array.from(track.querySelectorAll('.weekly-challenge'));
  var prev = document.getElementById('challengePrev');
  var next = document.getElementById('challengeNext');
  var dots = document.getElementById('challengeDots');
  var position = document.getElementById('challengePosition');
  var current = 0;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  cards.forEach(function (card, i) {
    card.setAttribute('role', 'group');
    card.setAttribute('aria-roledescription', 'スライド');
    card.setAttribute('aria-label', (i + 1) + ' / ' + cards.length);
    var dot = document.createElement('button');
    dot.type = 'button'; dot.className = 'challenge-dot';
    dot.setAttribute('aria-label', (i + 1) + 'つ目の悩みを見る');
    dot.addEventListener('click', function () { go(i); });
    dots.appendChild(dot);
  });
  function update() {
    current = cards.reduce(function (best, card, i) {
      return Math.abs(card.offsetLeft - cards[0].offsetLeft - track.scrollLeft) < Math.abs(cards[best].offsetLeft - cards[0].offsetLeft - track.scrollLeft) ? i : best;
    }, 0);
    prev.disabled = current === 0; next.disabled = current === cards.length - 1;
    position.textContent = (current + 1) + ' / ' + cards.length;
    Array.from(dots.children).forEach(function (dot, i) { dot.setAttribute('aria-current', i === current ? 'true' : 'false'); });
  }
  function go(i) {
    i = Math.max(0, Math.min(cards.length - 1, i));
    track.scrollTo({left: cards[i].offsetLeft - cards[0].offsetLeft, behavior: reduced ? 'auto' : 'smooth'});
  }
  prev.addEventListener('click', function () { go(current - 1); });
  next.addEventListener('click', function () { go(current + 1); });
  track.addEventListener('keydown', function (event) {
    if (event.target !== track) return;
    if (event.key === 'ArrowRight') go(current + 1);
    else if (event.key === 'ArrowLeft') go(current - 1);
    else if (event.key === 'Home') go(0);
    else if (event.key === 'End') go(cards.length - 1);
    else return;
    event.preventDefault();
  });
  track.addEventListener('scroll', update, {passive: true});
  window.addEventListener('resize', function () { go(current); });
  var carousel = track.closest('.weekly-challenge-carousel');
  var paused = reduced;
  var hovering = false;
  var touching = false;
  var timer;
  var toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'challenge-autoplay';
  carousel.appendChild(toggle);
  function stop() { window.clearInterval(timer); timer = null; }
  function start() {
    stop();
    if (paused || hovering || touching || document.hidden || carousel.contains(document.activeElement)) return;
    timer = window.setInterval(function () { go((current + 1) % cards.length); }, 2000);
  }
  function renderToggle() {
    toggle.textContent = paused ? '自動切替を再開' : '自動切替を停止';
    toggle.setAttribute('aria-label', toggle.textContent);
    position.setAttribute('aria-live', paused ? 'polite' : 'off');
  }
  toggle.addEventListener('click', function () { paused = !paused; renderToggle(); start(); });
  carousel.addEventListener('mouseenter', function () { hovering = true; stop(); });
  carousel.addEventListener('mouseleave', function () { hovering = false; start(); });
  carousel.addEventListener('focusin', stop);
  carousel.addEventListener('focusout', function () { window.setTimeout(start, 0); });
  track.addEventListener('pointerdown', function () { touching = true; stop(); }, {passive: true});
  window.addEventListener('pointerup', function () { if (touching) { touching = false; start(); } }, {passive: true});
  window.addEventListener('pointercancel', function () { touching = false; start(); }, {passive: true});
  document.addEventListener('visibilitychange', start);
  update();
  renderToggle();
  start();
})();
