(function () {
  'use strict';
  var grid = document.querySelector('#latestPanelPodcast .latest-card-grid');
  if (!grid || !window.fetch) return;
  var template = grid.querySelector('.latest-podcast-card');
  if (!template) return;
  fetch('data/contents/index.json', { cache: 'no-store' })
    .then(function (res) { if (!res.ok) throw new Error('unavailable'); return res.json(); })
    .then(function (data) {
      (data.articles || []).filter(function (item) {
        return item.status === 'published' && item.content_type === 'podcast' && /^https:\/\/stand\.fm\/episodes\/[A-Za-z0-9_-]+(?:[?#].*)?$/.test(item.media_url || '');
      }).forEach(function (item) {
        var id = new URL(item.media_url).pathname;
        var card = Array.from(grid.querySelectorAll('a')).find(function (node) { return new URL(node.href).pathname === id; });
        if (!card) { card = template.cloneNode(true); grid.appendChild(card); }
        card.href = item.media_url;
        var match = String(item.title || '').match(/^(?:#|第)\s*(\d+)/);
        var prior = card.querySelector('.peek-date').textContent.match(/第(\d+)回/);
        var no = Number(item.episode_no) || Number(match && match[1]) || Number(prior && prior[1]);
        card.dataset.episodeNo = String(no || 0);
        var date = item.source_published_at || item.published_at || '';
        card.querySelector('.peek-date').textContent = (no ? '第' + no + '回 / ' : '') + date.replace(/-/g, '.');
        card.querySelector('strong').textContent = String(item.title || '').replace(/^(?:#|第)\s*\d+\s*(?:回)?\s*/, '');
      });
      Array.from(grid.querySelectorAll('a')).sort(function (a, b) {
        function number(card) { var match = card.querySelector('.peek-date').textContent.match(/第(\d+)回/); return Number(card.dataset.episodeNo || (match && match[1])) || 0; }
        return number(b) - number(a);
      }).forEach(function (card, index) { if (index < 3) grid.appendChild(card); else card.remove(); });
    }).catch(function () { /* Keep the static cards available when fetching fails. */ });
})();
