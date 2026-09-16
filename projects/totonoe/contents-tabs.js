(function () {
  'use strict';
  var tabs = Array.from(document.querySelectorAll('[data-content-tab]'));
  var panels = Array.from(document.querySelectorAll('.contents-panel'));
  if (!tabs.length) return;
  function select(name, updateHash) {
    if (!tabs.some(function (tab) { return tab.dataset.contentTab === name; })) name = 'seminars';
    tabs.forEach(function (tab) {
      var selected = tab.dataset.contentTab === name;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    panels.forEach(function (panel) { panel.hidden = panel.id !== name; });
    if (updateHash) window.history.replaceState(null, '', window.location.pathname + window.location.search + '#' + name);
    window.requestAnimationFrame(function () {
      var track = document.getElementById(name === 'archive' ? 'archiveGrid' : 'podList');
      if (track && track._updateNav) track._updateNav();
    });
  }
  tabs.forEach(function (tab, index) {
    tab.addEventListener('click', function () { select(tab.dataset.contentTab, true); });
    tab.addEventListener('keydown', function (event) {
      var next;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      else return;
      event.preventDefault();
      tabs[next].focus(); select(tabs[next].dataset.contentTab, true);
    });
  });
  window.addEventListener('hashchange', function () { select(window.location.hash.slice(1), false); });
  select(window.location.hash.slice(1), false);
}());
