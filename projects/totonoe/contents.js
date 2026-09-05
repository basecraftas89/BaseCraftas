/* =========================================================
   週末のAI整え習慣 — コンテンツページ
   Podcast（stand.fm）／学習資料／コラム／アーカイブ動画を
   1つのページにタブでまとめて表示します。

   ▼ Podcastを追加するとき
   下の EPISODES に1行足すだけです（stand.fmのURLを貼るだけでOK）。

   ▼ 学習資料を追加するとき
   下の CONTENTS に1件追記するだけです（Googleドライブの共有リンクを貼る）。

   ▼ コラムを追加するとき
   columns/ に記事HTMLを作り、下の COLUMNS に1件追記します。
   ========================================================= */
(function () {
  'use strict';

  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  };

  /* ヘッダー・モバイルナビの処理は common.js に集約しました。
     （以前はこのファイルにも同じコードがありました） */

  /* =====================================================
     Podcast（stand.fm 限定公開エピソード）
     ・新しい回は url に stand.fm のエピソードURLを貼って追加
     ・theme（任意）を入れるとカードに副題が表示されます
     ===================================================== */
  var EPISODES = [
    { url: 'https://stand.fm/episodes/6a405981f6da955ea231d2a6', no: 1, theme: 'AI相談の落とし穴〜安倍全監督の事例と医療現場のリスク〜', date: '5/30' },
    { url: 'https://stand.fm/episodes/6a4059c8ac08572069cc0537', no: 2, theme: 'AIに代替されるPT・選ばれるPT〜臨床とテクノロジーの境界線〜', date: '6/6' },
    { url: 'https://stand.fm/episodes/6a405a0cf6da955ea231d2b4', no: 3, theme: 'Claude最強モデル登場！Fable 5の実力とスクショアプリ開発', date: '6/13' },
    { url: 'https://stand.fm/episodes/6a405a81f6da955ea231d2c6', no: 4, theme: 'Claude最上位モデルが突然停止？性能進化とAI停止リスクに備える', date: '6/20' },
    { url: 'https://stand.fm/episodes/6a405ed967dded2eddb5eb93', no: 5, theme: 'どこまで入れて大丈夫？個人情報チェッカーで学ぶ医療AIリスク', date: '6/27' },
    { url: 'https://stand.fm/episodes/6a483bd107e378c56bc832b6', no: 6, theme: 'Claude Fable 5再開！迫る従量課金化と最上位AIの活用法', date: '7/4' },
    { url: 'https://stand.fm/episodes/6a516dc980a4752b43a0c567', no: 7, theme: 'GPT-5.6解禁と音声即時通訳！デジタル庁データから見る医療DX', date: '7/11' },
    { url: 'https://stand.fm/episodes/6a5aa5063f95b14bbd46428f', no: 8, theme: 'Gemini Notebook改名とGoogle Vids動画化', date: '7/18' },
    { url: 'https://stand.fm/episodes/6a63df4622340506b937e4bb', no: 9, theme: 'なぜ日本のDXは遅れる？厚労省セキュリティ研修と現場のリテラシー', date: '7/25' },
    { url: 'https://stand.fm/episodes/6a6d2976cc75729749e74c47', no: 10, theme: 'Google Lyriaでテーマ曲解禁！音楽生成AIの衝撃と実用性', date: '8/1' },
    { url: 'https://stand.fm/episodes/6a7655c7cd3fe770e9e785fb', no: 11, theme: 'AI時代のファイル管理術！命名規則とアクセス権限の設計ポイント', date: '8/8' },
    { url: 'https://stand.fm/episodes/6a7f9d48836d14834bf080f7', no: 12, theme: 'スプレッドシートAI化からGrok自己分析まで', date: '8/15' },
    { url: 'https://stand.fm/episodes/6a88cf4935c40266c30d32ff', no: 13, theme: 'Geminiの画像、実は「あのマーク」消せます！秘密の設定大公開', date: '8/22' },
    { url: 'https://stand.fm/episodes/6a921025ce0a6c53375389d8', no: 14, theme: 'Claude公式講座が日本語対応！1日10分で学べる最新AI活用術', date: '8/29' },
    { url: 'https://stand.fm/episodes/6a9b459df67f3111cf58409f', no: 15, theme: 'ChatGPT Workを活かすフォルダリング術！', date: '9/5' },
  ];
  // 既定の表示順： 'newest'（新しい回が上＝降順）/ 'oldest'（第1回が上＝昇順）
  var POD_ORDER = 'newest';

  var STORE_KEY = 'wa_podcast_watched_sfm_v1';
  var ORDER_KEY = 'wa_podcast_order_v1';
  var POD_RANGE_KEY = 'wa_podcast_range_v1';
  var currentOrder = (function () {
    try { return localStorage.getItem(ORDER_KEY) || POD_ORDER; } catch (e) { return POD_ORDER; }
  })();
  var podRange = null;   // 例：{ from: 1, to: 10 }（アーカイブ動画タブと同じ仕組み）

  var podList = document.getElementById('podList');

  function loadWatched() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; }
    catch (e) { return {}; }
  }
  function saveWatched(o) { try { localStorage.setItem(STORE_KEY, JSON.stringify(o)); } catch (e) {} }
  var watched = loadWatched();

  function episodeId(ep) {
    if (ep.id) return ep.id;
    var m = String(ep.url || '').match(/episodes\/([A-Za-z0-9]+)/);
    return m ? m[1] : '';
  }

  EPISODES.forEach(function (ep, i) {
    ep.id = episodeId(ep);
    if (!ep.no) ep.no = i + 1;
    ep.embed = 'https://stand.fm/embed/episodes/' + ep.id;
    ep.link = ep.url || ('https://stand.fm/episodes/' + ep.id);
  });

  function renderPodcast() {
    if (!podList) return;

    // 並び替えボタンの見た目を同期
    document.querySelectorAll('[data-order]').forEach(function (b) {
      b.classList.toggle('active', b.dataset.order === currentOrder);
    });
    document.querySelectorAll('#podRanges .range-btn').forEach(function (b) {
      var on = podRange
        ? (parseInt(b.dataset.from, 10) === podRange.from)
        : (b.dataset.from === 'all');
      b.classList.toggle('active', on);
    });

    podList.innerHTML = '';
    var ordered = EPISODES.slice();
    if (podRange) {
      ordered = ordered.filter(function (e) { return e.no >= podRange.from && e.no <= podRange.to; });
    }
    ordered.sort(function (a, b) {
      return currentOrder === 'oldest' ? a.no - b.no : b.no - a.no;
    });

    var podCount = document.getElementById('podCount');
    if (podCount) {
      podCount.textContent = podRange
        ? ('第' + podRange.from + '〜' + podRange.to + '回／' + ordered.length + '本')
        : ('全' + ordered.length + '回');
    }

    ordered.forEach(function (ep) {
      var card = document.createElement('article');
      card.className = 'pod-card stand';
      card.id = 'card-' + ep.id;
      card.setAttribute('role', 'listitem');

      card.innerHTML =
        '<div class="pod-head">' +
          '<span class="pod-no">第' + ep.no + '回</span>' +
          (ep.date ? '<span class="pod-date">' + esc(ep.date) + '</span>' : '') +
        '</div>' +
        (ep.theme ? '<h3 class="pod-theme">' + esc(ep.theme) + '</h3>' : '') +
        '<div class="sfm-embed">' +
          '<iframe src="' + ep.embed + '" loading="lazy" frameborder="0" height="190" width="100%" ' +
          'allow="autoplay; encrypted-media" allowtransparency="true" class="standfm-embed-iframe" ' +
          'title="第' + ep.no + '回 週末のAI整え習慣"></iframe>' +
        '</div>' +
        '<div class="pod-controls">' +
          '<button class="watch-btn">視聴済みにする</button>' +
          '<span class="pod-actions">' +
            '<a class="pod-link" href="' + ep.link + '" target="_blank" rel="noopener">stand.fmで開く ↗</a>' +
          '</span>' +
        '</div>';

      podList.appendChild(card);

      var watchBtn = card.querySelector('.watch-btn');
      function sync() {
        var done = !!watched[ep.id];
        card.classList.toggle('is-watched', done);
        watchBtn.classList.toggle('done', done);
        watchBtn.textContent = done ? '✓ 視聴済み' : '視聴済みにする';
      }
      watchBtn.addEventListener('click', function () {
        if (watched[ep.id]) delete watched[ep.id];
        else watched[ep.id] = Date.now();
        saveWatched(watched); sync();
      });
      sync();
    });

    podList.scrollLeft = 0;
    if (podList._updateNav) podList._updateNav();
  }

  /* [data-order] だけを見る（[data-arc-order] を持つアーカイブ動画タブの
     並び替えボタンとは class="sort-btn" を共有しているため、属性で区別しないと
     お互いのボタンを押したときにもう片方の表示順まで書き換わってしまいます） */
  function setupPodcastSort() {
    var btns = document.querySelectorAll('[data-order]');
    if (!btns.length) return;
    btns.forEach(function (b) {
      b.addEventListener('click', function () {
        currentOrder = b.dataset.order;
        try { localStorage.setItem(ORDER_KEY, currentOrder); } catch (e) {}
        renderPodcast();
      });
    });
  }

  /* 10回ごとのまとまりを自動で作る（アーカイブ動画タブと同じロジック） */
  function podcastRanges() {
    if (!EPISODES.length) return [];
    var max = Math.max.apply(null, EPISODES.map(function (e) { return e.no; }));
    var groups = [];
    for (var from = 1; from <= max; from += 10) {
      var to = from + 9;
      var count = EPISODES.filter(function (e) { return e.no >= from && e.no <= to; }).length;
      if (count) groups.push({ from: from, to: to, count: count });
    }
    return groups.reverse();   // 新しいまとまりを左に
  }

  function renderPodcastRangeButtons() {
    var wrap = document.getElementById('podRanges');
    if (!wrap) return;
    var groups = podcastRanges();
    var row = wrap.closest('.archive-toolbar-row');

    if (groups.length <= 1) {
      if (row) row.hidden = true;
      podRange = null;
      wrap.innerHTML = '';
      return;
    }
    if (row) row.hidden = false;

    wrap.innerHTML =
      '<button type="button" class="range-btn" data-from="all">すべて<span class="range-count">' + EPISODES.length + '</span></button>' +
      groups.map(function (g) {
        return '<button type="button" class="range-btn" data-from="' + g.from + '" data-to="' + g.to + '">' +
               '第' + g.from + '〜' + g.to + '回<span class="range-count">' + g.count + '</span></button>';
      }).join('');
  }

  /* 起動時に1回だけ呼ぶ：初期状態の復元＋クリックの登録（委譲）を行う。
     ボタンをクリックするたびに buildする方式だと、その都度リスナーが
     二重・三重に積み重なってしまうため、登録は最初の1回だけにしています。 */
  function initPodcastRanges() {
    var wrap = document.getElementById('podRanges');
    if (!wrap) return;

    var groups = podcastRanges();
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(POD_RANGE_KEY)); } catch (e) {}
    if (saved && saved.from) {
      podRange = groups.filter(function (g) { return g.from === saved.from; })[0] || null;
    } else {
      podRange = null;
    }

    renderPodcastRangeButtons();

    wrap.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('.range-btn') : null;
      if (!b) return;
      if (b.dataset.from === 'all') podRange = null;
      else podRange = { from: parseInt(b.dataset.from, 10), to: parseInt(b.dataset.to, 10) };
      try { localStorage.setItem(POD_RANGE_KEY, JSON.stringify(podRange)); } catch (err) {}
      renderPodcast();
    });
  }

  /* =====================================================
     学習コンテンツ
     ・編集するのは CONTENTS だけです

     ▼ タグについて（フィルターに使用・設定不要）
       tags: ['AIリテラシー'] のように、各エントリに好きなタグを書くだけです。
       別の場所に一覧を登録する必要はありません。実際に使われているタグから
       フィルターのボタンが自動で作られます。1件に複数タグも付けられます
       （例: tags: ['AIリテラシー', '情報セキュリティ']）。
       タグはカードには表示せず、絞り込み専用です（動画カードは特に
       サムネイル・タイトル・概要のみのシンプル表示にしています）。
       ※ PDF・スライドなど非動画カードのみ、タグを小さなラベルとしてカードにも表示します。

     ▼ 動画コンテンツ（YouTubeで運用）
       チャンネルダッシュボード： https://studio.youtube.com/channel/UCBaZSkwcG8jsj8_gEaHrQ4w

       1. YouTube Studioに動画をアップロードする（サムネイルもYouTube側で設定）。
       2. 動画のURL（例: https://youtu.be/8ubAUePSwY8）から、末尾のIDだけを取り出す
          （このカードの場合は "8ubAUePSwY8"）。
       3. 下の CONTENTS に youtubeId を持つエントリを1件追加する。type を '動画' にすると、
          YouTubeのサムネイル画像を使ったカードになり、タップするとその場で
          ポップアップ再生されます（セミナーページの詳細ポップアップと同じ構造）。
       4. このページのカード表示は「サムネイル・タイトル・概要（2文程度）」のみです。
          desc は長文にせず、2文程度に収めてください。

     ▼ PDF・スライドなど（サムネイルなし・Googleドライブ運用のまま）
       ルート： 「HPコンテンツ」 https://drive.google.com/drive/folders/14SgZ8A5yAS4RpGqVpFFAMG0xtY2BLw37
       youtubeId は付けず、url に共有リンク（「リンクを知っている全員が閲覧可」）を入れると、
       これまで通りテキストカード＋「資料を開く」リンクで表示されます。
     ===================================================== */

  // YouTubeの動画IDから、サムネイル画像・埋め込み再生用URLを組み立てるヘルパー
  function ytThumbUrl(id) {
    return 'https://img.youtube.com/vi/' + id + '/hqdefault.jpg';
  }
  function ytEmbedUrl(id) {
    return 'https://www.youtube-nocookie.com/embed/' + id;
  }

  var CONTENTS = [
    // 例）PDF・スライドなど（サムネイルなしのテキストカード）
    // {
    //   title: '生成AIリテラシー入門 振り返り資料',
    //   desc: '権限管理とデータ保存先の考え方を、出典リンク付きで整理した資料です。',
    //   tags: ['現場での運用'],                                // 好きなタグを書くだけでOK（複数可）
    //   date: '2026-08-10',
    //   type: 'スライド',                                     // スライド / PDF / シート など
    //   url: 'https://drive.google.com/file/d/xxxxxxxx/view',  // 「HPコンテンツ」フォルダ内のファイルの共有リンク
    //   source: '2026/8/10 セミナー'
    // },
    // 例）動画（YouTube・サムネイル付き・タップでポップアップ再生）
    // {
    //   title: '動画のタイトル',
    //   desc: '概要（2文程度）。',
    //   tags: ['AIリテラシー'],
    //   date: '2026-08-10',
    //   type: '動画',
    //   youtubeId: 'YouTube動画のID（例: 8ubAUePSwY8）',
    //   source: '出典・回のメモなど（任意）'
    // },

    // ▼ 追加済みの動画（date はYouTube側のアップロード日時をJST換算した実際の値です）
    {
      title: 'AI時代の"見えてしまう情報"',
      desc: 'Claudeなどの共有設定を誤ると、社内資料やお客様情報が検索エンジンから見つかる状態になってしまうことがあります。投稿前のチェックポイントや権限範囲の見直し方を紹介します。',
      tags: ['AIリテラシー'],
      date: '2026-07-29',
      type: '動画',
      youtubeId: '8ubAUePSwY8',
      source: '週末のAI整え習慣 今週のトピック③'
    },
    {
      // ※ desc はYouTube側に説明文が未設定だったため、タイトルから作成した仮の文章です。内容と違う場合は書き換えてください。
      title: 'デスクトップに癒しを！｜ペット機能で作業も効率化',
      desc: 'ChatGPTのCodexに追加された、デスクトップで動くペット機能を紹介します。癒されながら作業効率化にもつながる、ユニークな新機能です。',
      tags: ['ChatGPT', 'Codex'],
      date: '2026-08-14',
      type: '動画',
      youtubeId: 'BngbUoU48uM'
    },
    {
      // ※ desc はYouTube側に説明文が未設定だったため、タイトルから作成した仮の文章です。内容と違う場合は書き換えてください。
      title: 'AIで書いた文章がバレる時代へ。｜Claudeで生成した文章に透かし識別情報付与!?',
      desc: 'Claudeが生成した文章に透かし（識別情報）を付与する新機能について解説します。AIで書いた文章だと判別されやすくなる時代の変化と、現場での注意点を紹介します。',
      tags: ['AIリテラシー', 'Claude'],
      date: '2026-08-14',
      type: '動画',
      youtubeId: '8bExAMcMfyc'
    },
  ];
  /* date は「YouTube Studio → 動画の詳細」に表示されるアップロード日時（日本時間換算）を入れてください。
     新しい回を追加するときも、この date を基準に新しい順／古い順の並び替えが決まります。 */

  var LIB_ORDER_KEY = 'wa_library_order_v1';
  var libOrder = (function () {
    try { return localStorage.getItem(LIB_ORDER_KEY) || 'newest'; } catch (e) { return 'newest'; }
  })();

  function initLibrarySort() {
    var btns = document.querySelectorAll('[data-lib-order]');
    if (!btns.length) return;
    btns.forEach(function (b) {
      b.addEventListener('click', function () {
        libOrder = b.dataset.libOrder;
        try { localStorage.setItem(LIB_ORDER_KEY, libOrder); } catch (e) {}
        renderLibrary();
      });
    });
  }

  function formatDate(d) {
    var m = String(d || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? (m[1] + '.' + m[2] + '.' + m[3]) : '';
  }

  var grid = document.getElementById('contentGrid');
  var empty = document.getElementById('contentEmpty');
  var filterWrap = document.getElementById('contentFilter');
  var countEl = document.getElementById('contentCount');
  var currentTag = 'all';

  /* =====================================================
     コラム
     ・columns/ に個別記事を置き、COLUMNS に1件追記します
     ・image は未指定でもCSSの簡易サムネイルで表示されます
     ===================================================== */
  var COLUMNS = [
    {
      title: '道具を使う前に、仕事をほどく。',
      desc: '新しい道具を取り入れる前に、本質ではない仕事を見つける視点を整理します。まず業務をほどくことで、本当に整えるべき場所が見えやすくなります。',
      tags: ['AI活用', '業務整理'],
      date: '2026-09-04',
      url: 'columns/ai-yohaku.html',
      thumb: 'WORK'
    },
    {
      title: '週末の30分を、次の一歩に変える。',
      desc: '情報を知るだけで終わらせず、整え、置き換え、試すところまで進めるための週末サイクルについてまとめます。',
      tags: ['週末のAI整え習慣', '学び方'],
      date: '2026-09-01',
      url: 'columns/weekend-cycle.html',
      thumb: '30min'
    },
    {
      title: 'チームで整えると、学びは続きやすい。',
      desc: '一人で追いかけるAI情報を、チームで見立て直す。専門職同士が学びを続けるための関係性を考えます。',
      tags: ['チーム', '実践'],
      date: '2026-08-29',
      url: 'columns/team-learning.html',
      thumb: 'TEAM'
    }
  ];

  var COLUMN_ORDER_KEY = 'wa_column_order_v1';
  var columnOrder = (function () {
    try { return localStorage.getItem(COLUMN_ORDER_KEY) || 'newest'; } catch (e) { return 'newest'; }
  })();
  var columnGrid = document.getElementById('columnGrid');
  var columnFilterWrap = document.getElementById('columnFilter');
  var columnCountEl = document.getElementById('columnCount');
  var currentColumnTag = 'all';

  function collectColumnTags() {
    var seen = {};
    var list = [];
    COLUMNS.forEach(function (c) {
      (c.tags || []).forEach(function (t) {
        if (!seen[t]) { seen[t] = true; list.push(t); }
      });
    });
    return list;
  }

  function buildColumnFilter() {
    if (!columnFilterWrap) return;
    if (!COLUMNS.length) { columnFilterWrap.hidden = true; return; }
    var tags = collectColumnTags();
    if (!tags.length) { columnFilterWrap.hidden = true; return; }
    columnFilterWrap.hidden = false;

    var html = '<button type="button" class="filter-btn active" data-column-cat="all">すべて</button>';
    tags.forEach(function (tag) {
      html += '<button type="button" class="filter-btn" data-column-cat="' + esc(tag) + '">' + esc(tag) + '</button>';
    });
    columnFilterWrap.innerHTML = html;

    columnFilterWrap.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('.filter-btn') : null;
      if (!btn) return;
      currentColumnTag = btn.dataset.columnCat;
      columnFilterWrap.querySelectorAll('.filter-btn').forEach(function (b) {
        b.classList.toggle('active', b === btn);
      });
      renderColumns();
    });
  }

  function initColumnSort() {
    var btns = document.querySelectorAll('[data-column-order]');
    if (!btns.length) return;
    btns.forEach(function (b) {
      b.addEventListener('click', function () {
        columnOrder = b.dataset.columnOrder;
        try { localStorage.setItem(COLUMN_ORDER_KEY, columnOrder); } catch (e) {}
        renderColumns();
      });
    });
  }

  function renderColumns() {
    if (!columnGrid) return;
    document.querySelectorAll('[data-column-order]').forEach(function (b) {
      b.classList.toggle('active', b.dataset.columnOrder === columnOrder);
    });

    var list = COLUMNS.slice().sort(function (a, b) {
      var diff = new Date(a.date) - new Date(b.date);
      return columnOrder === 'oldest' ? diff : -diff;
    });
    if (currentColumnTag !== 'all') {
      list = list.filter(function (c) { return (c.tags || []).indexOf(currentColumnTag) !== -1; });
    }
    if (columnCountEl) columnCountEl.textContent = '全' + list.length + '件';

    columnGrid.innerHTML = '';
    list.forEach(function (c, i) {
      var tagChips = (c.tags || []).map(function (t) {
        return '<span class="content-cat">' + esc(t) + '</span>';
      }).join('');
      var card = document.createElement('article');
      card.className = 'content-card content-card-video column-card';
      card.innerHTML =
        '<a class="content-card-thumb column-thumb" href="' + esc(c.url) + '">' +
          (c.image
            ? '<img src="' + esc(c.image) + '" alt="' + esc(c.title) + '" loading="lazy" decoding="async">'
            : '<span class="column-thumb-art column-thumb-art-0' + ((i % 3) + 1) + '"><span>' + esc(c.thumb || 'COLUMN') + '</span></span>') +
        '</a>' +
        '<div class="content-card-body">' +
          '<div class="content-head">' + tagChips + '</div>' +
          '<h3 class="content-title">' + esc(c.title) + '</h3>' +
          '<p class="content-desc">' + esc(c.desc) + '</p>' +
          '<p class="content-meta"><span>' + formatDate(c.date) + '</span></p>' +
          '<a class="content-link" href="' + esc(c.url) + '">続きを読む</a>' +
        '</div>';
      columnGrid.appendChild(card);
    });
  }

  // 実際に CONTENTS で使われているタグだけを集めて、重複なく登場順に並べる
  function collectTags() {
    var seen = {};
    var list = [];
    CONTENTS.forEach(function (c) {
      (c.tags || []).forEach(function (t) {
        if (!seen[t]) { seen[t] = true; list.push(t); }
      });
    });
    return list;
  }

  function buildFilter() {
    if (!filterWrap) return;
    if (!CONTENTS.length) { filterWrap.hidden = true; return; }

    var tags = collectTags();
    var html = '<button type="button" class="filter-btn active" data-cat="all">すべて</button>';
    tags.forEach(function (tag) {
      html += '<button type="button" class="filter-btn" data-cat="' + esc(tag) + '">' + esc(tag) + '</button>';
    });
    filterWrap.innerHTML = html;

    filterWrap.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('.filter-btn') : null;
      if (!btn) return;
      currentTag = btn.dataset.cat;
      filterWrap.querySelectorAll('.filter-btn').forEach(function (b) {
        b.classList.toggle('active', b === btn);
      });
      renderLibrary();
    });
  }

  /* ---------- 動画ポップアップ（セミナーページの詳細モーダルと同じ構造） ---------- */
  var cvModal = document.getElementById('cvModal');
  var cvModalBody = document.getElementById('cvModalBody');
  var cvModalClose = document.getElementById('cvModalClose');

  function openVideoModal(c) {
    if (!cvModal || !cvModalBody) return;
    cvModalBody.innerHTML =
      '<div class="cv-video-wrap">' +
        '<iframe src="' + esc(ytEmbedUrl(c.youtubeId)) + '" title="' + esc(c.title) + '" loading="lazy" ' +
        'allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" ' +
        'allowfullscreen></iframe>' +
      '</div>' +
      '<div class="cv-modal-content">' +
        '<h3 class="cv-modal-title">' + esc(c.title) + '</h3>' +
        '<p class="cv-modal-desc">' + esc(c.desc) + '</p>' +
        (c.source ? '<p class="cv-modal-source">' + esc(c.source) + '</p>' : '') +
      '</div>';
    cvModal.classList.add('open');
    cvModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('cv-lock');
  }

  function closeVideoModal() {
    if (!cvModal) return;
    cvModal.classList.remove('open');
    cvModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('cv-lock');
    if (cvModalBody) cvModalBody.innerHTML = ''; // 再生停止
  }

  if (cvModalClose) cvModalClose.addEventListener('click', closeVideoModal);
  if (cvModal) {
    cvModal.addEventListener('click', function (e) {
      if (e.target === cvModal || e.target.classList.contains('cv-modal-backdrop')) closeVideoModal();
    });
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeVideoModal();
  });


  /* =====================================================
     アーカイブ動画（コメキャリメンバー限定）
     ─────────────────────────────────────────────────────
     ▼ 新しい回を追加するとき
       1. Googleドライブの「アーカイブ」フォルダに動画をアップロード
          https://drive.google.com/drive/folders/12YHtKFODi75v_W08xFACzm97DjFIUCjg
       2. その動画の共有リンクからIDだけを取り出す
          例）https://drive.google.com/file/d/★ここ★/view?usp=drivesdk
       3. 下の ARCHIVES の先頭に1件追記する
          ※ Drive APIから個別動画IDが取れない場合は、folderId を入れておくと
             フォルダを直接開く導線として表示されます。

     ▼ 権限について（重要）
       ・視聴できる人の管理は、このファイルではなく
         Googleドライブのフォルダ共有設定（Googleグループ）で行います。
       ・サイト側は一覧を出しているだけなので、
         権限のない人がリンクを踏むとGoogle側で止まります。
       ・フォルダ全体をグループに共有しておけば、
         中の動画は個別設定なしで自動的に同じ権限になります。
     ===================================================== */
  var ARCHIVES = [
    { no: 15, date: '2026-09-05', driveId: '1Nes5adTlWH5A4EhdJ4Lb2BWRuVg-mj0C',
      title: 'ChatGPT Workを活かすフォルダリング術！' },
    { no: 14, date: '2026-08-29', driveId: '1q895zrVq9EQ3qMaw8lBC6AVPOI2pWOiS',
      title: 'Claude公式講座が日本語対応！1日10分で学べる最新AI活用術' },
    { no: 13, date: '2026-08-22', driveId: '15iO7CRoYYqjM5LO76mhbjhOLH_9ieupD',
      title: 'スプレッドシートAI化からGrok自己分析まで' },
    { no: 12, date: '2026-08-15', driveId: '1L6oY82hoKJqsuh8V64iB1Y3oMjASwUo2',
      title: 'スプレッドシートAI化からGrok自己分析まで' },
    { no: 11, date: '2026-08-08', driveId: '19JlRjv3-MawZbyXcQKbzztXr_WZSiApV',
      title: 'AI時代のファイル管理術！命名規則とアクセス権限の設計ポイント' },
    { no: 10, date: '2026-08-01', driveId: '19pImfSYIR6lS3MITxcURnt5y2YpuDmfR',
      title: 'Google Lyriaでテーマ曲解禁！音楽生成AIの衝撃と実用性' },
    { no: 9,  date: '2026-07-25', driveId: '1Qar6VNKR01-1B3fuMO3RDEc_v4ik1xjQ',
      title: 'なぜ日本のDXは遅れる？厚労省セキュリティ研修と現場のリテラシー' },
    { no: 8,  date: '2026-07-18', driveId: '10p_53AOnfFlEdsoOzIzQpdwUQ7s8ZX_U',
      title: 'Gemini Notebook改名とGoogle Vids動画化' },
    { no: 7,  date: '2026-07-11', driveId: '11N2Fx1cpbihkURhaDmZtpiuSIxTtNyaR',
      title: 'GPT-5.6解禁と音声即時通訳！デジタル庁データから見る医療DX' },
    { no: 6,  date: '2026-07-04', driveId: '1LRUw9WD1gLvfxC4eZfxiTfdseK_Y0R7M',
      title: 'Claude Fable 5再開！迫る従量課金化と最上位AIの活用法' },
    { no: 5,  date: '2026-06-27', driveId: '1ulSmmmUHh9w_ePk1Wz3hjx5ALKsOBO6r',
      title: 'どこまで入れて大丈夫？個人情報チェッカーで学ぶ医療AIリスク' },
    { no: 4,  date: '2026-06-20', driveId: '1mBV8rtoHJ_aHujcA51PmxOz0nqCUICO2',
      title: 'Claude最上位モデルが突然停止？性能進化とAI停止リスクに備える' },
    { no: 3,  date: '2026-06-13', driveId: '1f3e5FVVSA1ow9HzpkXFDwfN7hvxPTpAb',
      title: 'Claude最強モデル登場！Fable 5の実力とスクショアプリ開発' },
    { no: 2,  date: '2026-06-06', driveId: '1yjHgBmJizI6mUPF8T7Gp-rTBhz-LZB8a',
      title: 'AIに代替されるPT・選ばれるPT〜臨床とテクノロジーの境界線〜' },
    { no: 1,  date: '2026-05-30', driveId: '1PaWhstQ-WKuUytCLo812HBUcHgo-OEhM',
      title: 'AI相談の落とし穴〜安倍全監督の事例と医療現場のリスク〜' }
  ];

  function driveEmbedUrl(id) { return 'https://drive.google.com/file/d/' + id + '/preview'; }
  function driveViewUrl(id)  { return 'https://drive.google.com/file/d/' + id + '/view'; }
  function driveFolderUrl(id) { return 'https://drive.google.com/drive/folders/' + id; }
  function archiveUrl(a) { return a.driveId ? driveViewUrl(a.driveId) : driveFolderUrl(a.folderId); }

  /* ---------- 並び替え・回数レンジ・横スライド ---------- */
  var ARC_ORDER_KEY = 'wa_archive_order_v1';
  var ARC_RANGE_KEY = 'wa_archive_range_v1';
  var arcOrder = (function () {
    try { return localStorage.getItem(ARC_ORDER_KEY) || 'newest'; } catch (e) { return 'newest'; }
  })();
  var arcRange = null;   // 例：{ from: 1, to: 10 }

  /* 10回ごとのまとまりを自動で作る（第1〜10回／第11〜20回…） */
  function archiveRanges() {
    if (!ARCHIVES.length) return [];
    var max = Math.max.apply(null, ARCHIVES.map(function (a) { return a.no; }));
    var groups = [];
    for (var from = 1; from <= max; from += 10) {
      var to = from + 9;
      var count = ARCHIVES.filter(function (a) { return a.no >= from && a.no <= to; }).length;
      if (count) groups.push({ from: from, to: to, count: count });
    }
    return groups.reverse();   // 新しいまとまりを左に
  }

  function renderArchiveRangeButtons() {
    var wrap = document.getElementById('archiveRanges');
    if (!wrap) return;
    var groups = archiveRanges();
    var row = wrap.closest('.archive-toolbar-row');

    // まとまりが1つだけなら、絞り込みは出さない（11回未満のとき）
    if (groups.length <= 1) {
      if (row) row.hidden = true;
      arcRange = null;
      wrap.innerHTML = '';
      return;
    }
    if (row) row.hidden = false;

    wrap.innerHTML =
      '<button type="button" class="range-btn" data-from="all">すべて<span class="range-count">' + ARCHIVES.length + '</span></button>' +
      groups.map(function (g) {
        return '<button type="button" class="range-btn" data-from="' + g.from + '" data-to="' + g.to + '">' +
               '第' + g.from + '〜' + g.to + '回<span class="range-count">' + g.count + '</span></button>';
      }).join('');
  }

  /* 起動時に1回だけ呼ぶ：初期状態の復元＋クリックの登録（委譲）を行う。
     以前は絞り込みボタンをクリックするたびにこの関数ごと呼び直しており、
     そのたびに click リスナーが新しく積み重なっていました（＝クリックのたびに
     処理が二重・三重に走る不具合）。登録は最初の1回だけにしています。 */
  function initArchiveRanges() {
    var wrap = document.getElementById('archiveRanges');
    if (!wrap) return;

    var groups = archiveRanges();
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(ARC_RANGE_KEY)); } catch (e) {}
    if (saved && saved.from) {
      arcRange = groups.filter(function (g) { return g.from === saved.from; })[0] || null;
    } else {
      arcRange = null;
    }

    renderArchiveRangeButtons();

    wrap.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('.range-btn') : null;
      if (!b) return;
      if (b.dataset.from === 'all') arcRange = null;
      else arcRange = { from: parseInt(b.dataset.from, 10), to: parseInt(b.dataset.to, 10) };
      try { localStorage.setItem(ARC_RANGE_KEY, JSON.stringify(arcRange)); } catch (err) {}
      renderArchive();
    });
  }

  function setupArchiveSort() {
    var btns = document.querySelectorAll('[data-arc-order]');
    if (!btns.length) return;
    btns.forEach(function (b) {
      b.addEventListener('click', function () {
        arcOrder = b.dataset.arcOrder;
        try { localStorage.setItem(ARC_ORDER_KEY, arcOrder); } catch (e) {}
        renderArchive();
      });
    });
  }

  /* =====================================================
     横スライドの一覧（アーカイブ動画／Podcast共通）
     ・左右の矢印ボタン、トラックパッド／マウスホイールの縦スクロール、
       指でのスワイプ（一覧自体が overflow-x:auto のため、ブラウザ標準の
       タッチスクロールがそのまま使えます）に対応しています。
     ===================================================== */
  function setupSlider(opts) {
    var track = document.getElementById(opts.trackId);
    var prev = document.getElementById(opts.prevId);
    var next = document.getElementById(opts.nextId);
    if (!track || !prev || !next) return;

    function step() {
      var card = track.querySelector(opts.cardSelector);
      return card ? card.getBoundingClientRect().width + 18 : 320;
    }

    /* なぜ scrollBy や scroll-behavior:smooth を使わないか
       ・CSSの scroll-behavior は html から継承されるため、トラック要素にも
         smooth が効いてしまい、scroll-snap と組み合わさるとスクロールが
         打ち消されて矢印がまったく動かなくなります（実機で確認済み）。
       ・requestAnimationFrame はタブが描画されていないと止まるため、
         「動作中フラグ」方式にすると二度と動かなくなることがあります。
       そこで setInterval で scrollLeft を直接動かし、最後は必ず目的地に
       着地させる形にしています。 */
    var timer = null;
    function animate(dx) {
      var max = track.scrollWidth - track.clientWidth;
      var target = Math.max(0, Math.min(track.scrollLeft + dx, max));
      if (timer) { clearInterval(timer); timer = null; }

      var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduced) { track.scrollLeft = target; return; }

      var from = track.scrollLeft, t0 = Date.now(), dur = 320;
      timer = setInterval(function () {
        var p = Math.min((Date.now() - t0) / dur, 1);
        var eased = 1 - Math.pow(1 - p, 3);
        track.scrollLeft = from + (target - from) * eased;
        if (p >= 1) {
          clearInterval(timer); timer = null;
          track.scrollLeft = target;   // 端数を残さず着地させる
        }
      }, 16);
    }

    prev.addEventListener('click', function () { animate(-step()); });
    next.addEventListener('click', function () { animate(step()); });

    // トラックパッド／マウスホイールの縦スクロールを横送りに変換
    track.addEventListener('wheel', function (e) {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;   // すでに横方向の操作はそのまま任せる
      var max = track.scrollWidth - track.clientWidth;
      if (max <= 0) return;
      e.preventDefault();
      track.scrollLeft = Math.max(0, Math.min(track.scrollLeft + e.deltaY, max));
    }, { passive: false });

    function updateNav() {
      var over = track.scrollWidth - track.clientWidth;
      prev.disabled = track.scrollLeft <= 4;
      next.disabled = track.scrollLeft >= over - 4;
      var hint = opts.hintId && document.getElementById(opts.hintId);
      if (hint) hint.hidden = over <= 4;      // 全部見えているときは案内を隠す
      prev.hidden = next.hidden = over <= 4;
    }
    track.addEventListener('scroll', updateNav, { passive: true });
    window.addEventListener('resize', updateNav);
    track._updateNav = updateNav;
    updateNav();
  }

  function renderArchive() {
    var grid = document.getElementById('archiveGrid');
    if (!grid) return;

    // 並び替えボタンの見た目を同期
    document.querySelectorAll('[data-arc-order]').forEach(function (b) {
      b.classList.toggle('active', b.dataset.arcOrder === arcOrder);
    });
    document.querySelectorAll('#archiveRanges .range-btn').forEach(function (b) {
      var on = arcRange
        ? (parseInt(b.dataset.from, 10) === arcRange.from)
        : (b.dataset.from === 'all');
      b.classList.toggle('active', on);
    });

    var list = ARCHIVES.slice();
    if (arcRange) {
      list = list.filter(function (a) { return a.no >= arcRange.from && a.no <= arcRange.to; });
    }
    list.sort(function (a, b) { return arcOrder === 'oldest' ? a.no - b.no : b.no - a.no; });

    var countEl = document.getElementById('archiveCount');
    if (countEl) {
      countEl.textContent = arcRange
        ? ('第' + arcRange.from + '〜' + arcRange.to + '回／' + list.length + '本')
        : ('全' + list.length + '回');
    }

    grid.innerHTML = '';
    list.forEach(function (a) {
      var card = document.createElement('article');
      card.className = 'archive-card';
      card.setAttribute('role', 'listitem');
      card.innerHTML =
        '<button type="button" class="archive-card-main" aria-label="第' + a.no + '回の録画を再生">' +
          '<span class="archive-badge"><span class="archive-lock" aria-hidden="true">\uD83D\uDD12</span>メンバー限定</span>' +
          '<span class="archive-no">第' + a.no + '回</span>' +
          '<span class="archive-date">' + formatDate(a.date) + '</span>' +
          '<span class="archive-title">' + esc(a.title) + '</span>' +
          '<span class="archive-play">' + (a.driveId ? '\u25B6 録画を見る' : 'Googleドライブで開く \u2197') + '</span>' +
        '</button>';
      card.querySelector('.archive-card-main')
          .addEventListener('click', function () { openArchiveModal(a); });
      grid.appendChild(card);
    });

    grid.scrollLeft = 0;
    if (grid._updateNav) grid._updateNav();
  }

  function openArchiveModal(a) {
    if (!cvModal || !cvModalBody) return;
    if (!a.driveId && a.folderId) {
      cvModalBody.innerHTML =
        '<div class="cv-modal-content">' +
          '<p class="cv-modal-meta">第' + a.no + '回　' + formatDate(a.date) + '　\uD83D\uDD12 コメキャリメンバー限定</p>' +
          '<h3 class="cv-modal-title">' + esc(a.title) + '</h3>' +
          '<div class="cv-fallback">' +
            '<p class="cv-fallback-title">\uD83D\uDD12 アーカイブ動画フォルダを開く</p>' +
            '<p class="cv-fallback-body">この回の動画は、Googleドライブのアーカイブ動画フォルダに格納されています。' +
              '視聴権限のあるGoogleアカウントでログインした状態で、下のリンクから対象回の動画を開いてください。</p>' +
            '<a class="cv-fallback-link" href="' + esc(archiveUrl(a)) + '" target="_blank" rel="noopener">Googleドライブで開く \u2197</a>' +
          '</div>' +
        '</div>';
      cvModal.classList.add('open');
      cvModal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('cv-lock');
      return;
    }
    cvModalBody.innerHTML =
      '<div class="cv-video-wrap">' +
        '<iframe src="' + esc(driveEmbedUrl(a.driveId)) + '" title="第' + a.no + '回 録画" ' +
        'allow="autoplay; encrypted-media; fullscreen" allowfullscreen loading="lazy"></iframe>' +
      '</div>' +
      '<div class="cv-modal-content">' +
        '<p class="cv-modal-meta">第' + a.no + '回　' + formatDate(a.date) + '　\uD83D\uDD12 コメキャリメンバー限定</p>' +
        '<h3 class="cv-modal-title">' + esc(a.title) + '</h3>' +
        '<div class="cv-fallback">' +
          '<p class="cv-fallback-title">\uD83D\uDD12 映像が表示されない場合</p>' +
          '<p class="cv-fallback-body">視聴権限のあるGoogleアカウントでログインしているかご確認ください。' +
            '別のアカウントでログイン中だと、再生画面が黒いままになることがあります。' +
            '下のリンクからGoogleドライブで直接開くと、権限の状態がはっきり分かります。</p>' +
          '<a class="cv-fallback-link" href="' + esc(driveViewUrl(a.driveId)) + '" target="_blank" rel="noopener">Googleドライブで開く \u2197</a>' +
        '</div>' +
      '</div>';
    cvModal.classList.add('open');
    cvModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('cv-lock');
  }

  function renderLibrary() {
    if (!grid) return;

    // 並び替えボタンの見た目を同期
    document.querySelectorAll('[data-lib-order]').forEach(function (b) {
      b.classList.toggle('active', b.dataset.libOrder === libOrder);
    });

    var list = CONTENTS.slice().sort(function (a, b) {
      var diff = new Date(a.date) - new Date(b.date);
      return libOrder === 'oldest' ? diff : -diff;
    });
    if (currentTag !== 'all') {
      list = list.filter(function (c) { return (c.tags || []).indexOf(currentTag) !== -1; });
    }

    if (countEl) {
      countEl.textContent = CONTENTS.length ? ('全' + CONTENTS.length + '件') : '';
    }

    if (!list.length) {
      grid.innerHTML = '';
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;

    grid.innerHTML = '';
    list.forEach(function (c) {
      var isVideo = !!c.youtubeId;
      var card = document.createElement('article');
      card.className = 'content-card' + (isVideo ? ' content-card-video' : '');

      if (isVideo) {
        // カード面はサムネイル・タイトル・概要（2文程度）のみを表示
        card.innerHTML =
          '<button type="button" class="content-card-thumb" aria-label="' + esc(c.title) + 'を再生">' +
            '<img src="' + esc(ytThumbUrl(c.youtubeId)) + '" alt="' + esc(c.title) + '" loading="lazy">' +
            '<span class="content-play-badge">▶ 動画を見る</span>' +
          '</button>' +
          '<div class="content-card-body">' +
            '<h3 class="content-title">' + esc(c.title) + '</h3>' +
            '<p class="content-desc">' + esc(c.desc) + '</p>' +
            '<p class="content-meta"><span>' + formatDate(c.date) + '</span></p>' +
          '</div>';
        card.querySelector('.content-card-thumb').addEventListener('click', function () { openVideoModal(c); });
      } else {
        var tagChips = (c.tags || []).map(function (t) {
          return '<span class="content-cat">' + esc(t) + '</span>';
        }).join('');
        card.innerHTML =
          '<div class="content-head">' +
            tagChips +
            (c.type ? '<span class="content-type">' + esc(c.type) + '</span>' : '') +
          '</div>' +
          '<h3 class="content-title">' + esc(c.title) + '</h3>' +
          '<p class="content-desc">' + esc(c.desc) + '</p>' +
          '<p class="content-meta">' +
            '<span>' + formatDate(c.date) + '</span>' +
            (c.source ? '<span>' + esc(c.source) + '</span>' : '') +
          '</p>' +
          '<a class="content-link" href="' + esc(c.url) + '" target="_blank" rel="noopener">' +
            '資料を開く ↗' +
          '</a>';
      }
      grid.appendChild(card);
    });
  }

  initPodcastRanges();
  setupPodcastSort();
  setupSlider({ trackId: 'podList', prevId: 'podPrev', nextId: 'podNext', cardSelector: '.pod-card', hintId: 'podHint' });
  renderPodcast();

  initLibrarySort();
  buildFilter();
  renderLibrary();

  initColumnSort();
  buildColumnFilter();
  renderColumns();

  initArchiveRanges();
  setupArchiveSort();
  setupSlider({ trackId: 'archiveGrid', prevId: 'arcPrev', nextId: 'arcNext', cardSelector: '.archive-card', hintId: 'archiveHint' });
  renderArchive();
})();
