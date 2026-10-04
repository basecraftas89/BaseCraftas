// Theme is applied in the head before paint; storage failures still allow switching.
const themeButton = document.querySelector('[data-theme-toggle]');
const applyTheme = theme => {
  document.documentElement.dataset.theme = theme;
  const dark = theme === 'dark';
  themeButton?.setAttribute('aria-pressed', String(dark));
  if (themeButton) themeButton.querySelector('[data-theme-label]').textContent = dark ? 'ライト表示へ' : 'ダーク表示へ';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#111e28' : '#f6f4ef');
};
applyTheme(document.documentElement.dataset.theme || 'dark');
themeButton?.addEventListener('click', () => {
  const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(theme);
  try { localStorage.setItem('sleeport-v2-theme', theme); } catch {}
});
window.addEventListener('storage', event => {
  if (event.key === 'sleeport-v2-theme') applyTheme(event.newValue === 'light' ? 'light' : 'dark');
});

// Release-specific document URLs keep links from reopening an older cached page.
if (/^https?:$/.test(location.protocol)) {
  document.querySelectorAll('a[href]').forEach(link => {
    const raw = link.getAttribute('href');
    const url = new URL(raw, location.href);
    if (raw.startsWith('#') || link.hasAttribute('download') || url.origin !== location.origin ||
        !url.pathname.endsWith('.html') || url.pathname.endsWith('/app.html')) return;
    url.searchParams.set('v', 'homepage-v2');
    link.href = url.href;
  });
}
const menu = document.querySelector('.mobile-menu');
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && menu?.open) {
    menu.open = false;
    menu.querySelector('summary').focus();
  }
});
document.addEventListener('click', event => {
  if (menu?.open && (!menu.contains(event.target) || event.target.closest('a'))) menu.open = false;
});
const library = document.querySelector('[data-library]');
if (library) {
  const grid = library.querySelector('[data-library-grid]');
  const cards = [...library.querySelectorAll('[data-read-card]')];
  const tag = library.querySelector('[data-library-tag]');
  const sort = library.querySelector('[data-library-sort]');
  const status = library.querySelector('[data-library-status]');
  const updateLibrary = () => {
    const selectedTag = tag.value;
    const selectedSort = sort.value;
    const visible = cards.filter(card => !selectedTag || card.dataset.tags.split('|').includes(selectedTag));
    cards.forEach(card => { card.hidden = !visible.includes(card); });
    [...grid.children].filter(child => child.matches('[data-read-card]')).sort((a, b) => {
      if (selectedSort === 'recommended') {
        return Number(b.dataset.recommended === 'true') - Number(a.dataset.recommended === 'true')
          || (Date.parse(b.dataset.date) || 0) - (Date.parse(a.dataset.date) || 0);
      }
      const aDate = Date.parse(a.dataset.date) || 0;
      const bDate = Date.parse(b.dataset.date) || 0;
      if (!aDate || !bDate) return Number(!aDate) - Number(!bDate);
      return selectedSort === 'oldest' ? aDate - bDate : bDate - aDate;
    }).forEach(card => grid.append(card));
    status.textContent = `${visible.length}件の読みもの`;
  };
  tag.addEventListener('change', updateLibrary);
  sort.addEventListener('change', updateLibrary);
  updateLibrary();
}

const learningLibrary = document.querySelector('[data-learning-library]');
if (learningLibrary) {
  const cards = [...learningLibrary.querySelectorAll('[data-learning-card]')];
  const sourceButtons = [...learningLibrary.querySelectorAll('[data-learning-source] button')];
  const categoryButtons = [...learningLibrary.querySelectorAll('[data-learning-category] button')];
  const videoTypeButtons = [...learningLibrary.querySelectorAll('[data-learning-video-type] button')];
  const status = learningLibrary.querySelector('[data-learning-status]');
  const grid = learningLibrary.querySelector('[data-learning-grid]');
  const sort = learningLibrary.querySelector('[data-learning-sort]');
  let selectedSource = '';
  const params = new URLSearchParams(location.search);
  let selectedCategory = categoryButtons.some(button => button.value === params.get('category')) ? params.get('category') : '';
  let selectedVideoType = videoTypeButtons.some(button => button.value === params.get('type')) ? params.get('type') : '';
  if (params.get('sort') === 'oldest') sort.value = 'oldest';

  const selectButton = (buttons, selected) => {
    buttons.forEach(button => button.setAttribute('aria-pressed', String(button.value === selected)));
  };
  const updateLearning = () => {
    selectButton(categoryButtons, selectedCategory);
    selectButton(videoTypeButtons, selectedVideoType);
    const url = new URL(location.href);
    for (const [key,value] of [['type',selectedVideoType],['category',selectedCategory],['sort',sort.value]]) {
      if (value && value !== 'newest') url.searchParams.set(key,value); else url.searchParams.delete(key);
    }
    history.replaceState(null,'',url);
    const visible = cards.filter(card => {
      const sourceMatch = !selectedSource || card.dataset.source === selectedSource;
      const categoryMatch = !selectedCategory || card.dataset.categories.split('|').includes(selectedCategory);
      const videoTypeMatch = !selectedVideoType || card.dataset.videoType === selectedVideoType;
      return sourceMatch && categoryMatch && videoTypeMatch;
    });
    cards.forEach(card => { card.hidden = !visible.includes(card); });
    if (sort && grid) {
      [...cards].sort((a, b) => {
        const aDate = Date.parse(a.dataset.date) || 0;
        const bDate = Date.parse(b.dataset.date) || 0;
        return sort.value === 'oldest' ? aDate - bDate : bDate - aDate;
      }).forEach(card => grid.append(card));
    }
    status.textContent = cards.length ? (visible.length ? `${visible.length}件のまなび` : 'この条件に合う動画はありません。テーマや動画の種類を変更してください。') : '動画の掲載を準備しています。最新の公開状況は公式YouTubeでご確認ください。';
  };

  sourceButtons.forEach(button => button.addEventListener('click', () => {
    selectedSource = button.value;
    selectButton(sourceButtons, selectedSource);
    updateLearning();
  }));
  categoryButtons.forEach(button => button.addEventListener('click', () => {
    selectedCategory = button.value;
    selectButton(categoryButtons, selectedCategory);
    updateLearning();
  }));
  videoTypeButtons.forEach(button => button.addEventListener('click', () => {
    selectedVideoType = button.value;
    selectButton(videoTypeButtons, selectedVideoType);
    updateLearning();
  }));
  sort?.addEventListener('change', updateLearning);
  updateLearning();
}

document.querySelectorAll('[data-shelf-sort]').forEach(select => {
  select.addEventListener('change', () => {
    const shelf = select.closest('.learning-shelf-section').querySelector('.learning-shelf');
    [...shelf.querySelectorAll('.learning-shelf-card')].sort((a,b) => {
      const difference = Date.parse(a.dataset.date) - Date.parse(b.dataset.date);
      return select.value === 'oldest' ? difference : -difference;
    }).forEach(card => shelf.append(card));
    shelf.scrollLeft = 0;
  });
});

const activityMenu = document.querySelector('.activity-menu');
document.addEventListener('click', event => {
  if (activityMenu?.open && (!activityMenu.contains(event.target) || event.target.closest('a'))) activityMenu.open = false;
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && activityMenu?.open) {
    activityMenu.open = false;
    activityMenu.querySelector('summary').focus();
  }
});
