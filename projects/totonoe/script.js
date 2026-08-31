/* ===== 週末のAI整え習慣 — top page interactions ===== */
(function () {
  'use strict';

  /* ---------- Header: scroll shadow + mobile nav ---------- */
  var header = document.getElementById('siteHeader');
  var nav = document.getElementById('siteNav');
  var toggle = document.getElementById('navToggle');

  if (header) {
    window.addEventListener('scroll', function () {
      header.classList.toggle('scrolled', window.scrollY > 8);
    });
  }
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.setAttribute('aria-label', open ? 'メニューを閉じる' : 'メニューを開く');
    });
    nav.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') {
        nav.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* ---------- Reveal on scroll ---------- */
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.style.opacity = 1;
          en.target.style.transform = 'none';
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.12 });
    document.querySelectorAll('.benefit-card, .tl-item, .problem-list li').forEach(function (el, i) {
      el.style.opacity = 0;
      el.style.transform = 'translateY(16px)';
      el.style.transition = 'opacity .5s ease ' + (i % 6 * 0.04) + 's, transform .5s ease ' + (i % 6 * 0.04) + 's';
      io.observe(el);
    });
  }
})();
