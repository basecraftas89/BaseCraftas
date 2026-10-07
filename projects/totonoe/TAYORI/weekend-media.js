(() => {
  'use strict';
  const root = document.querySelector('.member-weekend-library');
  if (!root) return;
  const tabs = [...root.querySelectorAll('[data-weekend-mode]')];
  const status = root.querySelector('#weekendLibraryStatus');
  const sortButtons = [...root.querySelectorAll('[data-weekend-sort]')];
  const ranges = root.querySelector('#weekendLibraryRanges');
  let order = 'desc';
  let rangeStart = 1;
  let data = {archives: [], podcasts: []};
  let loaded = false;
  let loading = false;
  function stopPlayers() { root.querySelectorAll('video').forEach(video => { video.pause(); video.removeAttribute('src'); video.load(); video.remove(); }); root.querySelectorAll('iframe').forEach(frame => frame.remove()); root.querySelectorAll('.weekend-library-list details[open]').forEach(detail => { detail.open = false; }); }
  function select(mode, focus = false) {
    stopPlayers();
    tabs.forEach(tab => {
      const active = tab.dataset.weekendMode === mode;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      document.getElementById(tab.getAttribute('aria-controls')).hidden = !active;
      if (active && focus) tab.focus();
    });
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => select(tab.dataset.weekendMode));
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      select(tabs[next].dataset.weekendMode, true);
    });
  });
  function render(items, mode) {
    const list = document.getElementById(mode === 'archive' ? 'weekendArchiveList' : 'weekendPodcastList');
    list.replaceChildren();
    items.filter(item => item.no >= rangeStart && item.no < rangeStart + 10).sort((a, b) => order === 'asc' ? a.no - b.no : b.no - a.no).forEach(item => {
      if (!/^[A-Za-z0-9_-]+$/.test(item.id || '')) return;
      const detail = document.createElement('details');
      const summary = document.createElement('summary');
      const number = document.createElement('span'); number.className = 'weekend-episode-number'; number.textContent = `第${item.no}回`;
      const copy = document.createElement('span');
      const title = document.createElement('strong'); title.textContent = item.title;
      const date = document.createElement('time'); date.className = 'weekend-episode-date'; date.dateTime = item.date; date.textContent = item.date.replace(/-/g, '/');
      copy.append(title, date); summary.append(number, copy); detail.append(summary);
      const player = document.createElement('div'); player.className = 'weekend-episode-player'; detail.append(player);
      detail.addEventListener('toggle', () => {
        player.querySelectorAll("video").forEach(video => { video.pause(); video.removeAttribute("src"); video.load(); });
        player.replaceChildren();
        if (!detail.open) return;
        list.querySelectorAll('details').forEach(other => { if (other !== detail) other.open = false; });
        if (mode === 'archive') {
          const video = document.createElement('video');
          video.controls = true; video.preload = 'metadata'; video.playsInline = true;
          video.setAttribute('aria-label', `第${item.no}回 ${item.title}`);
          video.src = `/api/totonoe-member/api/weekly/archives/${encodeURIComponent(item.id)}/stream`;
          const message = document.createElement('p'); message.className = 'weekend-playback-error'; message.hidden = true;
          video.addEventListener('error', () => { message.hidden = false; message.textContent = '再生できませんでした。会員ログイン状態をご確認ください。'; });
          player.append(video, message);
        } else {
          const frame = document.createElement('iframe'); frame.title = `第${item.no}回 ${item.title}`;
          frame.src = `https://stand.fm/embed/episodes/${item.id}`;
          frame.allow = 'autoplay; encrypted-media; fullscreen'; frame.allowFullscreen = true; player.append(frame);
          const link = document.createElement('a'); link.textContent = 'stand.fmで聴く';
          link.href = `https://stand.fm/episodes/${item.id}`; link.target = '_blank'; link.rel = 'noopener noreferrer'; player.append(link);
        }
      });
      list.append(detail);
    });
    if (!list.children.length) list.textContent = '公開された回がありません。';
  }
  function renderLists() {
    stopPlayers();
    render(data.archives || [], 'archive');
    render(data.podcasts || [], 'podcast');
  }
  function renderRanges() {
    const numbers = [...(data.archives || []), ...(data.podcasts || [])].map(item => Number(item.no)).filter(no => Number.isInteger(no) && no > 0);
    const max = Math.max(1, ...numbers);
    rangeStart = Math.floor((max - 1) / 10) * 10 + 1;
    ranges.replaceChildren();
    for (let start = 1; start <= max; start += 10) {
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = `第${start}〜${start + 9}回`;
      button.dataset.weekendRange = String(start);
      button.setAttribute('aria-pressed', String(start === rangeStart));
      button.addEventListener('click', () => {
        rangeStart = start;
        ranges.querySelectorAll('button').forEach(other => other.setAttribute('aria-pressed', String(Number(other.dataset.weekendRange) === start)));
        renderLists();
      });
      ranges.append(button);
    }
  }
  async function load() {
    if (!root.open || root.closest('[data-tayori-view], [data-iroha-view]').hidden || loaded || loading) return;
    loading = true; status.textContent = '過去回を読み込んでいます…';
    try {
      const response = await fetch('/projects/totonoe/TAYORI/weekend-media.json?v=20261003d', {cache: 'no-store'});
      if (!response.ok) throw new Error('unavailable');
      data = await response.json();
      renderRanges(); renderLists();
      loaded = true; status.textContent = '';
    } catch { status.textContent = '過去回を読み込めませんでした。ページを再読み込みしてください。'; }
    finally { loading = false; }
  }
  new MutationObserver(() => { if (root.closest('[data-tayori-view], [data-iroha-view]').hidden) stopPlayers(); else load(); }).observe(root.closest('[data-tayori-view], [data-iroha-view]'), {attributes: true, attributeFilter: ['hidden']});
  root.addEventListener("toggle", () => { if (root.open) load(); else stopPlayers(); });
  sortButtons.forEach(button => button.addEventListener('click', () => {
    order = button.dataset.weekendSort;
    sortButtons.forEach(other => other.setAttribute('aria-pressed', String(other === button)));
    renderLists();
  }));
  load();
})();
