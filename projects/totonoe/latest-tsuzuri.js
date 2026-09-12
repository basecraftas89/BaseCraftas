(function () {
  'use strict';

  var grid = document.getElementById('latestTsuzuriGrid');
  var empty = document.getElementById('latestTsuzuriEmpty');
  if (!grid || !window.fetch) return;

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>\"]/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char];
    });
  }

  function date(value) {
    var match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return match ? match[1] + '.' + match[2] + '.' + match[3] : '';
  }

  fetch('data/contents/index.json', { cache: 'no-store' })
    .then(function (response) { return response.ok ? response.json() : { articles: [] }; })
    .then(function (data) {
      var items = (data.articles || []).filter(function (item) {
        return item.status === 'published' && (item.content_type || 'column') === 'column';
      }).sort(function (a, b) {
        return String(b.published_at || b.updated_at || '').localeCompare(String(a.published_at || a.updated_at || ''));
      }).slice(0, 4);
      if (!items.length) return;
      empty.hidden = true;
      grid.innerHTML = items.map(function (item) {
        var image = item.hero_url ? '<img src="' + esc(item.hero_url) + '" alt="' + esc(item.title) + '" loading="lazy" decoding="async">' : '<span class="column-thumb-art column-thumb-art-01" aria-hidden="true"><span>TSUZURI</span></span>';
        return '<a class="latest-visual-card latest-column-card" href="' + esc(item.url || ('tsuzuri/' + item.slug + '.html')) + '">' + image + '<span class="peek-date">' + esc(date(item.published_at || item.updated_at)) + ' / つづり｜TSUZURI</span><strong>' + esc(item.title) + '</strong></a>';
      }).join('');
    })
    .catch(function () {});
})();
