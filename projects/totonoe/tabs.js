/* =========================================================
   週末のAI整え習慣 — 汎用タブ切替
   contents.html（Podcast／学習コンテンツ）と
   faq.html（参加について／内容について／セミナーについて／資料・コンテンツについて）
   の両方で使う共通スクリプトです。

   マークアップのルール：
   - タブボタンをまとめる要素に class="tab-group"
   - 各ボタンは class="tab-btn" data-target="対象パネルのid"
   - 対象パネルは class="tab-panel" id="対象id"
   （1ページに tab-group は1つを想定しています）
   ========================================================= */
(function () {
  'use strict';

  function getPanels(group) {
    var btns = group.querySelectorAll('.tab-btn');
    var panels = [];
    for (var i = 0; i < btns.length; i++) {
      var el = document.getElementById(btns[i].dataset.target);
      if (el) panels.push(el);
    }
    return panels;
  }

  function activate(group, targetId, updateHash) {
    var buttons = group.querySelectorAll('.tab-btn');
    buttons.forEach(function (b) {
      var on = b.dataset.target === targetId;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    getPanels(group).forEach(function (p) {
      p.hidden = p.id !== targetId;
    });
    if (updateHash !== false) {
      try { history.replaceState(null, '', '#' + targetId); } catch (e) { /* no-op */ }
    }
  }

  var groups = document.querySelectorAll('.tab-group');
  groups.forEach(function (group) {
    var buttons = group.querySelectorAll('.tab-btn');
    if (!buttons.length) return;

    buttons.forEach(function (b) {
      b.addEventListener('click', function () {
        activate(group, b.dataset.target);
      });
    });

    // 初期表示：URLハッシュが対象パネルなら反映、それ以外は先頭タブ
    var hash = (location.hash || '').replace('#', '');
    var ids = Array.prototype.map.call(buttons, function (b) { return b.dataset.target; });
    var initial = ids.indexOf(hash) !== -1 ? hash : ids[0];
    activate(group, initial, false);
  });

  /* タブ以外の要素（例：資料0件のときの「Podcastを聴く」ボタン）から
     タブを切り替えるためのフック。data-tab-switch="対象id" を付けるだけ */
  document.querySelectorAll('[data-tab-switch]').forEach(function (el) {
    el.addEventListener('click', function (e) {
      e.preventDefault();
      var targetId = el.getAttribute('data-tab-switch');
      var group = document.querySelector('.tab-group');
      if (!group || !document.getElementById(targetId)) return;
      activate(group, targetId);
      if (group.scrollIntoView) group.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
})();
