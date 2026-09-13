(function () {
  'use strict';

  var grid = document.getElementById('characterStoriesGrid');
  if (!grid || !window.fetch) return;

  function articleUrl(item) {
    var value = item.url || ('tsuzuri/' + item.slug + '/');
    return /^(?:[a-z]+:|\/|\.\.\/)/i.test(value) ? value : '../' + value;
  }

  function imageUrl(value) {
    var url = String(value || '');
    if (!url) return '';
    if (/^(?:data:|https?:|\/|\.\.\/)/i.test(url)) return url;
    return '../' + url.replace(/^\.\//, '');
  }

  function storyLabel(item) {
    var actor = item.main_actor && item.main_actor.name;
    return actor ? actor + 'の物語' : 'キャラクターの物語';
  }

  function buildCard(item) {
    var article = document.createElement('article');
    article.className = 'story-card';
    var link = document.createElement('a');
    link.href = articleUrl(item);
    var image = document.createElement('img');
    image.src = imageUrl(item.hero_url);
    image.alt = item.title || 'キャラクターの物語';
    image.loading = 'lazy';
    var copy = document.createElement('div');
    var label = document.createElement('p');
    label.textContent = storyLabel(item);
    var title = document.createElement('h3');
    title.textContent = item.title || '無題の物語';
    var action = document.createElement('span');
    action.textContent = '読む →';
    copy.append(label, title, action);
    link.append(image, copy);
    article.appendChild(link);
    return article;
  }

  fetch('../data/contents/index.json', { cache: 'no-store' })
    .then(function (response) { return response.ok ? response.json() : Promise.reject(new Error('content_index')); })
    .then(function (data) {
      var stories = (data.articles || []).filter(function (item) {
        return item.status === 'published' && (item.destination === 'characters' || item.category === 'character-story');
      });
      if (!stories.length) return;
      grid.replaceChildren();
      stories.forEach(function (item) { grid.appendChild(buildCard(item)); });
    })
    .catch(function () {
      // Keep the hand-authored cards as a resilient fallback.
    });
})();
