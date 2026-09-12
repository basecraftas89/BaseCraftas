(function () {
  'use strict';

  var tabs = Array.from(document.querySelectorAll('[data-media-tab]'));
  var panels = Array.from(document.querySelectorAll('.weekend-media-panel'));
  if (!tabs.length || !panels.length) return;

  function selectMedia(name, updateHash) {
    var selected = tabs.find(function (tab) { return tab.dataset.mediaTab === name; });
    if (!selected) return;

    tabs.forEach(function (tab) {
      var active = tab === selected;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
      tab.tabIndex = active ? 0 : -1;
    });

    panels.forEach(function (panel) {
      panel.hidden = panel.id !== name;
    });

    if (updateHash && window.history && window.history.replaceState) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search + '#' + name);
    }

    window.requestAnimationFrame(function () {
      var track = document.getElementById(name === 'archive' ? 'archiveGrid' : 'podList');
      if (track && typeof track._updateNav === 'function') track._updateNav();
    });
  }

  tabs.forEach(function (tab, index) {
    tab.addEventListener('click', function () {
      selectMedia(tab.dataset.mediaTab, true);
    });
    tab.addEventListener('keydown', function (event) {
      var next = index;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      else return;
      event.preventDefault();
      tabs[next].focus();
      selectMedia(tabs[next].dataset.mediaTab, true);
    });
  });

  function selectFromHash() {
    var name = window.location.hash.slice(1);
    selectMedia(name === 'archive' ? 'archive' : 'podcast', false);
  }

  window.addEventListener('hashchange', selectFromHash);
  selectFromHash();
}());
