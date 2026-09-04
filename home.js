(function () {
  'use strict';

  var tabButtons = Array.prototype.slice.call(document.querySelectorAll('[data-latest-tab]'));
  var panels = Array.prototype.slice.call(document.querySelectorAll('[data-latest-panel]'));

  function setLatestPanel(key) {
    tabButtons.forEach(function (button) {
      var active = button.dataset.latestTab === key;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });

    panels.forEach(function (panel) {
      var active = panel.dataset.latestPanel === key;
      panel.hidden = !active;
      panel.classList.toggle('active', active);
      if (active) {
        var track = panel.querySelector('[data-auto-scroll]');
        if (track) track.scrollLeft = 0;
      }
    });
  }

  tabButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      setLatestPanel(button.dataset.latestTab);
    });
  });

  if (tabButtons.length) setLatestPanel(tabButtons[0].dataset.latestTab);

  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var tracks = Array.prototype.slice.call(document.querySelectorAll('[data-auto-scroll]'));
  if (!tracks.length) return;

  tracks.forEach(function (track) {
    var direction = 1;
    var paused = false;
    var last = 0;

    function hasOverflow() {
      if (track.closest('[hidden]')) return false;
      return track.scrollWidth > track.clientWidth + 8;
    }

    function step(timestamp) {
      if (!last) last = timestamp;
      var delta = timestamp - last;
      last = timestamp;

      if (!paused && hasOverflow()) {
        var max = track.scrollWidth - track.clientWidth;
        track.scrollLeft += direction * delta * 0.018;
        if (track.scrollLeft >= max - 1) direction = -1;
        if (track.scrollLeft <= 1) direction = 1;
      }

      window.requestAnimationFrame(step);
    }

    ['mouseenter', 'focusin', 'touchstart', 'pointerdown'].forEach(function (eventName) {
      track.addEventListener(eventName, function () { paused = true; }, { passive: true });
    });
    ['mouseleave', 'focusout'].forEach(function (eventName) {
      track.addEventListener(eventName, function () { paused = false; }, { passive: true });
    });

    window.requestAnimationFrame(step);
  });
})();
