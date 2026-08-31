/* =========================================================
   週末のAI整え習慣 — セミナーページ
   ▼ 運用メモ（このコメントはサイト上には表示されません）
   　 新しい回を追加するときは、下の SEMINARS に1件追記してください。
   ========================================================= */
(function () {
  'use strict';

  /* ===================================================== */
  /*  セミナー設定（ここを編集）                             */
  /*  ・date は 'YYYY-MM-DD' 形式（並び替え・開催済み判定に使用） */
  /*  ・tags は任意。カード/モーダルにバッジとして表示され、
        タグフィルターにも自動で反映されます                    */
  /* ===================================================== */
  var SEMINARS = [
    {
      date: '2026-09-28',
      dateLabel: '2026年9月28日（月）',
      time: '20:00〜21:00',
      title: 'AIをあなたの理解者に。ChatGPT Workでできること。｜自分を知るAIから、仕事を任せられるAIへ',
      subtitle: '自分を知るAIから、仕事を任せられるAIへ',
      speakerName: '伊東 雅也',
      speakerTitle: '信愛整形外科医院／理学療法士',
      price: '無料',
      thumb: 'assets/seminar-2026-09-28-chatgpt-work.jpg',
      summary: 'ChatGPT Workをテーマに、AIへ文脈を渡し、自分の仕事を理解して一緒に進めるパートナーへ変えていく考え方を学ぶ回です。',
      url: 'https://therapis10.com/seminars/cmtd27exs0kn2eu0v76rxrjnf',
      tags: ['ChatGPT', '仕事活用', '自己理解']
    },
    {
      date: '2026-09-14',
      dateLabel: '2026年9月14日（月）',
      time: '21:00〜22:00',
      title: 'AI普段使い座談会｜日常編',
      subtitle: '暮らしの中にある、ちょっと便利なAI活用',
      speakerName: '神藤 俊希',
      speakerTitle: 'ToToNoE+／週末のAI整え習慣 運営',
      price: '無料',
      thumb: 'assets/seminar-2026-09-14-ai-zadankai-daily.jpg',
      summary: '献立、旅行、買い物、学び、予定整理など、仕事以外の日常で使える身近なAI活用を参加者同士で持ち寄る座談会です。',
      url: 'https://therapis10.com/seminars/cmt2f9fwk04up35z0nqc469up',
      tags: ['座談会', '日常活用']
    },
    {
      date: '2026-09-07',
      dateLabel: '2026年9月7日（月）',
      time: '21:00〜22:00',
      title: 'AI普段使い座談会｜仕事編',
      subtitle: '明日から試せる、仕事の中のAI活用',
      speakerName: '神藤 俊希',
      speakerTitle: 'ToToNoE+／週末のAI整え習慣 運営',
      price: '無料',
      thumb: 'assets/seminar-2026-09-07-ai-zadankai-work.jpg',
      summary: 'メール、文章整理、情報収集、資料作成、アイデア出し、タスク整理など、仕事の中で試せるAI活用を参加者同士で共有します。',
      url: 'https://therapis10.com/seminars/cmt2eyywq04da35z0c7qcxh9l',
      tags: ['座談会', '仕事活用']
    },
    {
      date: '2026-08-10',
      dateLabel: '2026年8月10日（月）',
      time: '20:00〜21:00',
      title: '現場を守るために。管理職と考える生成AIリテラシー入門',
      subtitle: '権限管理とデータ保存先の理解',
      speakerName: '梶原 祐輔',
      speakerTitle: '理学療法士／株式会社PLAST チーフ・DX担当',
      price: '無料',
      thumb: 'assets/seminar-2026-08-10-ai-literacy.jpg',
      summary: '生成AIを現場に取り入れるときに管理職が押さえておきたい、権限管理とデータ保存先の考え方を整理する回です。',
      url: 'https://therapis10.com/seminars/cmrzelrg500bkizfk0atnahxh',
      tags: ['AIリテラシー', '情報管理', '管理職向け']
    },
    {
      date: '2026-08-17',
      dateLabel: '2026年8月17日（月）',
      time: '20:00〜21:00',
      title: 'キャリアの可能性を広げる！自己ブランディングのためのGrokを活用したX運用術',
      subtitle: '',
      speakerName: '小島 健',
      speakerTitle: '運動器認定理学療法士／十全記念病院',
      price: '無料',
      thumb: 'assets/seminar-2026-08-17-grok-x-branding.jpg',
      summary: 'Grokを活用してX（旧Twitter）運用を効率化し、自己ブランディングやキャリアの可能性を広げるための実践術を紹介します。',
      url: 'https://therapis10.com/seminars/cmrzeqc6n00cwizfkc2z9wwnd',
      tags: ['ブランディング', 'Grok', 'X運用']
    }
  ];
  /* ===================================================== */

  /* ヘッダー・モバイルナビの処理は common.js に集約しました。
     （以前はこのファイルにも同じコードがありました） */

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function isPast(dateStr) {
    var d = new Date(dateStr + 'T23:59:59');
    return d.getTime() < Date.now();
  }

  /* ---------- 並び替え・開催状況の絞り込み ---------- */
  var ORDER_KEY = 'wa_seminars_order_v1';
  var STATUS_KEY = 'wa_seminars_status_v1';
  var TAG_KEY = 'wa_seminars_tag_v1';
  var semOrder = (function () {
    try { return localStorage.getItem(ORDER_KEY) || 'newest'; } catch (e) { return 'newest'; }
  })();
  var semStatus = (function () {
    try { return localStorage.getItem(STATUS_KEY) || 'all'; } catch (e) { return 'all'; }
  })();
  var semTag = (function () {
    try { return localStorage.getItem(TAG_KEY) || 'all'; } catch (e) { return 'all'; }
  })();

  /* 起動時に1回だけ呼ぶ：並び替えボタン・開催状況の絞り込みボタンを組み立てて、
     クリックの登録も1回だけ行う（アーカイブ動画タブ・Podcastタブと同じ考え方）。 */
  function initSemToolbar() {
    document.querySelectorAll('[data-sem-order]').forEach(function (b) {
      b.addEventListener('click', function () {
        semOrder = b.dataset.semOrder;
        try { localStorage.setItem(ORDER_KEY, semOrder); } catch (e) {}
        render();
      });
    });

    var statusWrap = document.getElementById('semStatusFilter');
    if (!statusWrap) return;

    var upcomingCount = SEMINARS.filter(function (s) { return !isPast(s.date); }).length;
    var pastCount = SEMINARS.filter(function (s) { return isPast(s.date); }).length;

    statusWrap.innerHTML =
      '<button type="button" class="range-btn" data-sem-status="all">すべて<span class="range-count">' + SEMINARS.length + '</span></button>' +
      '<button type="button" class="range-btn" data-sem-status="upcoming">開催予定<span class="range-count">' + upcomingCount + '</span></button>' +
      '<button type="button" class="range-btn" data-sem-status="past">開催終了<span class="range-count">' + pastCount + '</span></button>';

    statusWrap.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-sem-status]') : null;
      if (!b) return;
      semStatus = b.dataset.semStatus;
      try { localStorage.setItem(STATUS_KEY, semStatus); } catch (err) {}
      render();
    });

    initTagFilter();
  }

  function collectTags() {
    var seen = {};
    var list = [];
    SEMINARS.forEach(function (s) {
      (s.tags || []).forEach(function (tag) {
        if (!seen[tag]) { seen[tag] = true; list.push(tag); }
      });
    });
    return list;
  }

  function initTagFilter() {
    var wrap = document.getElementById('semTagFilter');
    if (!wrap) return;

    var tags = collectTags();
    if (semTag !== 'all' && tags.indexOf(semTag) === -1) {
      semTag = 'all';
      try { localStorage.setItem(TAG_KEY, semTag); } catch (e) {}
    }
    if (!tags.length) {
      var row = wrap.closest('.archive-toolbar-row');
      if (row) row.hidden = true;
      return;
    }

    wrap.innerHTML =
      '<button type="button" class="filter-btn active" data-sem-tag="all">すべて</button>' +
      tags.map(function (tag) {
        return '<button type="button" class="filter-btn" data-sem-tag="' + escapeHtml(tag) + '">' + escapeHtml(tag) + '</button>';
      }).join('');

    wrap.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-sem-tag]') : null;
      if (!b) return;
      semTag = b.dataset.semTag;
      try { localStorage.setItem(TAG_KEY, semTag); } catch (err) {}
      render();
    });
  }

  /* ---------- refs ---------- */
  var grid = document.getElementById('semGrid');
  var empty = document.getElementById('semEmpty');
  var modal = document.getElementById('semModal');
  var modalBody = document.getElementById('semModalBody');
  var modalClose = document.getElementById('semModalClose');

  function openModal(sem) {
    if (!modal || !modalBody) return;
    var past = isPast(sem.date);
    modalBody.innerHTML =
      '<figure class="sem-modal-thumb">' +
        '<img src="' + escapeHtml(sem.thumb) + '" alt="' + escapeHtml(sem.title) + '">' +
        (past ? '<span class="sem-badge sem-badge-past">開催終了</span>' : '<span class="sem-badge sem-badge-live">開催予定</span>') +
      '</figure>' +
      '<div class="sem-modal-content">' +
        '<p class="sem-modal-date">' + escapeHtml(sem.dateLabel) + '　' + escapeHtml(sem.time) + '</p>' +
        '<h3 class="sem-modal-title">' + escapeHtml(sem.title) + '</h3>' +
        (sem.subtitle ? '<p class="sem-modal-subtitle">' + escapeHtml(sem.subtitle) + '</p>' : '') +
        '<p class="sem-modal-summary">' + escapeHtml(sem.summary) + '</p>' +
        '<div class="sem-modal-speaker">' +
          '<span class="sem-speaker-name">' + escapeHtml(sem.speakerName) + '</span>' +
          '<span class="sem-speaker-title">' + escapeHtml(sem.speakerTitle) + '</span>' +
        '</div>' +
        (sem.tags && sem.tags.length ?
          '<ul class="sem-modal-tags">' + sem.tags.map(function (t) { return '<li>' + escapeHtml(t) + '</li>'; }).join('') + '</ul>'
          : '') +
        '<div class="sem-modal-cta">' +
          '<a href="' + escapeHtml(sem.url) + '" target="_blank" rel="noopener" class="btn btn-cta btn-lg">' +
            (past ? 'アーカイブを見る' : '無料で申し込む') +
          '</a>' +
          '<span class="sem-modal-price">参加費：' + escapeHtml(sem.price) + '</span>' +
        '</div>' +
      '</div>';
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('sem-lock');
  }

  function closeModal() {
    if (!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('sem-lock');
  }

  if (modalClose) modalClose.addEventListener('click', closeModal);
  if (modal) {
    modal.addEventListener('click', function (e) {
      if (e.target === modal || e.target.classList.contains('sem-modal-backdrop')) closeModal();
    });
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeModal();
  });

  /* ---------- render cards ---------- */
  function render() {
    if (!grid) return;

    // 並び替え・絞り込みボタンの見た目を同期
    document.querySelectorAll('[data-sem-order]').forEach(function (b) {
      b.classList.toggle('active', b.dataset.semOrder === semOrder);
    });
    document.querySelectorAll('#semStatusFilter [data-sem-status]').forEach(function (b) {
      b.classList.toggle('active', b.dataset.semStatus === semStatus);
    });
    document.querySelectorAll('#semTagFilter [data-sem-tag]').forEach(function (b) {
      b.classList.toggle('active', b.dataset.semTag === semTag);
    });

    var ordered = SEMINARS.slice();
    if (semStatus === 'upcoming') ordered = ordered.filter(function (s) { return !isPast(s.date); });
    else if (semStatus === 'past') ordered = ordered.filter(function (s) { return isPast(s.date); });
    if (semTag !== 'all') {
      ordered = ordered.filter(function (s) { return (s.tags || []).indexOf(semTag) !== -1; });
    }

    ordered.sort(function (a, b) {
      // 開催予定（0）を常に開催終了（1）より先＝左に表示する
      var aPast = isPast(a.date) ? 1 : 0;
      var bPast = isPast(b.date) ? 1 : 0;
      if (aPast !== bPast) return aPast - bPast;
      var diff = new Date(a.date) - new Date(b.date);
      return semOrder === 'oldest' ? diff : -diff;
    });

    var countEl = document.getElementById('semCount');
    if (countEl) countEl.textContent = ordered.length ? ('全' + ordered.length + '件') : '';

    if (!ordered.length) {
      grid.innerHTML = '';
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;

    grid.innerHTML = '';
    ordered.forEach(function (sem) {
      var past = isPast(sem.date);
      var card = document.createElement('article');
      card.className = 'sem-card' + (past ? ' is-past' : '');
      var tagChips = (sem.tags || []).slice(0, 4).map(function (tag) {
        return '<span>' + escapeHtml(tag) + '</span>';
      }).join('');

      card.innerHTML =
        '<button type="button" class="sem-card-thumb" aria-label="' + escapeHtml(sem.title) + 'の詳細を見る">' +
          '<img src="' + escapeHtml(sem.thumb) + '" alt="' + escapeHtml(sem.title) + '" loading="lazy">' +
          (past ? '<span class="sem-badge sem-badge-past">開催終了</span>' : '<span class="sem-badge sem-badge-live">開催予定</span>') +
        '</button>' +
        '<div class="sem-card-body">' +
          '<p class="sem-card-date">' + escapeHtml(sem.dateLabel) + '　' + escapeHtml(sem.time) + '</p>' +
          '<h3 class="sem-card-title">' + escapeHtml(sem.title) + '</h3>' +
          (sem.subtitle ? '<p class="sem-card-subtitle">' + escapeHtml(sem.subtitle) + '</p>' : '') +
          (tagChips ? '<div class="sem-card-tags">' + tagChips + '</div>' : '') +
          '<p class="sem-card-speaker">' + escapeHtml(sem.speakerName) + '　' + escapeHtml(sem.speakerTitle) + '</p>' +
          '<div class="sem-card-actions">' +
            '<button type="button" class="btn btn-ghost sem-detail">詳細を見る</button>' +
            '<a href="' + escapeHtml(sem.url) + '" target="_blank" rel="noopener" class="btn btn-cta sem-apply">' +
              (past ? 'アーカイブを見る' : '無料で申し込む') +
            '</a>' +
          '</div>' +
        '</div>';

      card.querySelector('.sem-detail').addEventListener('click', function () { openModal(sem); });
      card.querySelector('.sem-card-thumb').addEventListener('click', function () { openModal(sem); });

      grid.appendChild(card);
    });
  }

  initSemToolbar();
  render();
})();
