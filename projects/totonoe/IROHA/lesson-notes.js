(() => {
  'use strict';
  const base = '/api/totonoe-member/api/curriculum/notes';
  const local = ['', 'localhost', '127.0.0.1'].includes(location.hostname);
  async function request(url, payload) {
    const response = await fetch(url, { method:payload ? 'POST':'GET',credentials:'same-origin',headers:{accept:'application/json',...(payload ? {'content-type':'application/json'}:{})},...(payload ? {body:JSON.stringify(payload)}:{}) });
    const result = await response.json();
    if (!response.ok) throw Object.assign(new Error(result.error || 'notes_unavailable'),{status:response.status,note:result.note});
    return result;
  }
  window.TOTONOE_LESSON_NOTES = Object.freeze({ local,
    load:lessonId => request(base+'/'+encodeURIComponent(lessonId)),
    save:payload => request(base,payload),
    list:offset => request(base+'?offset='+(offset || 0)),
  });
  const root = document.querySelector('#irohaNotesList');
  if (!root) return;
  const status = document.querySelector('#irohaNotesStatus');
  const more = document.querySelector('#irohaNotesMore');
  const retry = document.querySelector('#irohaNotesRetry');
  let offset = 0;
  let loading = false;
  let loaded = false;
  const seen = new Set();
  function card(note) {
    const item = document.createElement('details');
    item.className = 'iroha-saved-note';
    const summary = document.createElement('summary');
    const heading = document.createElement('strong');
    heading.textContent = note.title || note.lessonId;
    const meta = document.createElement('span');
    const date = Date.parse(note.updatedAt);
    meta.textContent = [note.curriculumTitle,Number.isNaN(date) ? '' : new Date(date).toLocaleString('ja-JP')].filter(Boolean).join(' ・ ');
    summary.append(heading,meta);
    const body = document.createElement('div');
    body.className = 'iroha-saved-note-body';
    [['学んだこと・気づいたこと','takeaway'],['疑問点','doubts'],['次に試すこと','action']].forEach(([label,key]) => {
      if (!note[key]) return;
      const title = document.createElement('h4');
      title.textContent = label;
      const text = document.createElement('p');
      text.textContent = note[key];
      body.append(title,text);
    });
    const link = document.createElement('a');
    link.href = 'lesson.html?id='+encodeURIComponent(note.lessonId);
    link.textContent = 'レッスンを開く';
    body.append(link);
    item.append(summary,body);
    return item;
  }
  function localNotes() {
    const store = window.TOTONOE_CURRICULUM_STORE;
    const state = store.readLearnerState();
    const lessons = store.readAdminState().lessons;
    return [...new Set([...Object.keys(state.lessonProgress || {}),...Object.keys(state.lessonDrafts || {})])].map(lessonId => {
      const record = {...state.lessonProgress?.[lessonId],...state.lessonDrafts?.[lessonId]};
      const lesson = lessons.find(item => item.id === lessonId);
      return { ...record,lessonId,title:record.title || lesson?.title || (lessonId === 'claude-basic-layout-preview' ? 'Claude 基礎（画面確認用）':lessonId),curriculumTitle:lesson ? store.lessonCurriculumTitle(lesson):'',updatedAt:record.updatedAt || record.completedAt || '' };
    }).filter(note => note.takeaway || note.doubts || note.action).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async function load(reset = false) {
    if (loading) return;
    if (loaded && !reset && offset === null) return;
    loading = true;
    more.disabled = true;
    retry.hidden = true;
    status.textContent = '受講メモを読み込んでいます…';
    try {
      const result = local ? {notes:localNotes(),nextOffset:null} : await window.TOTONOE_LESSON_NOTES.list(reset ? 0:offset);
      if (reset) { root.replaceChildren(); seen.clear(); }
      result.notes.forEach(note => { if (!seen.has(note.lessonId)) { root.append(card(note)); seen.add(note.lessonId); } });
      offset = result.nextOffset;
      more.hidden = offset === null;
      loaded = true;
      status.textContent = local ? 'ローカル確認用です。このブラウザで保存したメモを表示しています。' : seen.size ? '会員アカウントに保存したメモです。動画名を押すと内容が開きます。':'まだ受講メモはありません。レッスン画面でメモを保存すると、ここに表示されます。';
    } catch (_) {
      status.textContent = '受講メモを読み込めませんでした。ログイン状態と通信をご確認ください。';
      retry.hidden = false;
    } finally { loading = false; more.disabled = false; }
  }
  more.addEventListener('click',() => load());
  retry.addEventListener('click',() => load(true));
  window.addEventListener('totonoe:iroha-view',event => { if (event.detail === 'history') load(true); });
  if (new URLSearchParams(location.search).get('view') === 'history') load(true);
})();
