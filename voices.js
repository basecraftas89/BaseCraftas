/* =========================================================
   週末のAI整え習慣 — 参加者の声 ＆ アンケート集計

   ▼ データの出どころ（2段構え）
     1. config.js の SURVEY_CSV_URL に公開CSVのURLが入っていれば、
        そちらを読み込みます（アンケートが増えると自動で更新されます）。
     2. URLが未設定、または読み込みに失敗した場合は、
        このファイル下部の FALLBACK を表示します。

   ▼ 掲載ルール（重要）
     ・氏名・メールアドレス・所属は一切載せません。
     ・属性は「年代／性別／参加スタイル」までに留めています。
     ・本文中の個人名は伏せ字にするか、その一文を削っています。
   ========================================================= */
(function () {
  'use strict';

  var CFG = window.WA_CONFIG || {};
  var REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var currentDomain = 'care';
  var currentData = null;
  var APPLY_LINKS = {
    care: {
      url: CFG.APPLY_URL || 'https://therapis10.com/seminars/cmr5gtjs30be14do38qlsolpu',
      label: '医療・介護向けの朝活に申し込む',
      note: '医療・介護職向けの申込ページへ移動します。'
    },
    occupational: {
      url: 'https://peatix.com/group/16590893',
      label: '産業保健向けの朝活に申し込む',
      note: '産業保健領域向けのPeatixページへ移動します。',
      empty: '産業保健向けの参加者アンケートは現在準備中です。公開できるデータが整い次第、こちらに反映します。'
    }
  };

  /* =====================================================
     同梱データ（CSV未設定時に使われます）
     ===================================================== */
  var FALLBACK = {
    stats: {
      responses: 124,       // 回答数（第2回〜第14回の累計）
      satisfaction: 8.4,    // 平均満足度（10点満点／加重平均）
      nagara: 37.9,         // 「ながら参加」の割合（%／加重平均・概算）
      sessions: 14          // 開催回数
    },
    voices: [
      {
        text: 'いつもありがとうございます！これまでの朝活習慣にこの勉強会が加わり、有意義な時間を送ることができています。個人的には毎回最低一つは実践することを目標にしています！',
        age: '40代', gender: '男性', style: '移動しながら参加', score: 10, domain: 'care'
      },
      {
        text: 'Googleワークスペース活用術で、共有をグループ化できるなど、マメ知識的な事がしれてありがたいです。知っていると知らないでは、手間が全然違いますね。',
        age: '40代', gender: '女性', style: '画面に集中して参加', score: 8, domain: 'care'
      },
      {
        text: '毎週毎週AIの進化を聞いていると、追っかけてないと置いて行かれる感がすごいなと改めて思いました。',
        age: '40代', gender: '男性', style: '画面に集中して参加', score: 10, domain: 'care'
      },
      {
        text: 'AIが何ができるかを分からないので、これから学んでいきたいと思います。Google Workspaceというものを使ったことがないので、使ってみたいと思いました。',
        age: '40代', gender: '男性', style: '画面に集中して参加', score: 8, domain: 'care'
      },
      {
        text: '音声機能のデモンストレーションが良かったです。実臨床でも試したいですが、対話の中でうっかり口が滑って患者さんやスタッフの名前などをしゃべってしまいそうで怖いですね。',
        age: '40代', gender: '男性', style: '移動しながら参加', score: 10, domain: 'care'
      },
      {
        text: '個人情報の取り扱いは個々の意識を高めると同時に組織全体でも共有しないといけないと改めて感じました。いつも、多くの学びを提供して頂きありがとうございます！',
        age: '40代', gender: '男性', style: '画面に集中して参加', score: 10, domain: 'care'
      },
      {
        text: '皆さんの情報感度の広範さにはいつもたいへん刺激になっています。厚労省の情報セキュリティ研修の事は全く知りませんでした。まずはそこから取り組んでみます！',
        age: '40代', gender: '男性', style: '画面に集中して参加', score: 7, domain: 'care'
      },
      {
        text: '音声入力でここまで翻訳できてしまうことは知らなかったので、言語的転換が必要な時に使ってみます！',
        age: '40代', gender: '男性', style: '画面に集中して参加', score: 7, domain: 'care'
      },
      {
        text: '有意義な朝活の時間を提供して頂きありがとうございます。AI普及について、管理業務を行っているスタッフの生存価値は常に見出していかないと感じました。',
        age: '40代', gender: '男性', style: '画面に集中して参加', score: 10, domain: 'care'
      },
      {
        text: 'Googleワークスペース活用法をもっと詳しく聞きたくなりました。勤怠管理やシフト調整などの管理業務が効率よくできたらいいなと思います。',
        age: '40代', gender: '女性', style: '画面に集中して参加', score: 10, domain: 'care'
      }
    ]
  };

  /* =====================================================
     CSVパーサ（引用符・カンマ・改行に対応）
     ===================================================== */
  function parseCSV(text) {
    var rows = [];
    var row = [];
    var field = '';
    var inQuotes = false;

    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else field += c;
      } else {
        if (c === '"') inQuotes = true;
        else if (c === ',') { row.push(field); field = ''; }
        else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
        else if (c === '\r') { /* 無視 */ }
        else field += c;
      }
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (v) { return String(v).trim() !== ''; }); });
  }

  /* 公開シートの想定フォーマット
     type | v1        | v2               | v3     | v4
     -----+-----------+------------------+--------+-----
     stat | responses | 92               |        |
     stat | satisfaction | 8.2           |        |
     voice| 本文       | 40代・男性        | 参加スタイル | 10
  */
  function rowsToData(rows) {
    var out = { stats: {}, voices: [] };
    rows.forEach(function (r) {
      var type = String(r[0] || '').trim().toLowerCase();
      if (type === 'stat') {
        var key = String(r[1] || '').trim();
        var val = parseFloat(String(r[2] || '').replace(/[^\d.\-]/g, ''));
        if (key && !isNaN(val)) out.stats[key] = val;
      } else if (type === 'voice') {
        var text = String(r[1] || '').trim();
        if (!text) return;
        var attr = String(r[2] || '').trim();     // 例：40代・男性
        var parts = attr.split(/[・･\/／]/);
        out.voices.push({
          text: text,
          age: (parts[0] || '').trim(),
          gender: (parts[1] || '').trim(),
          style: String(r[3] || '').trim(),
          score: parseFloat(String(r[4] || '').replace(/[^\d.]/g, '')) || null,
          domain: String(r[5] || 'care').trim() || 'care'
        });
      }
    });
    return out;
  }

  /* =====================================================
     描画
     ===================================================== */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function renderStats(stats) {
    var sec = document.getElementById('voices');
    var note = document.getElementById('surveyNote');
    if (currentDomain !== 'care') {
      if (sec) sec.classList.add('no-domain-data');
      if (note) note.textContent = (APPLY_LINKS[currentDomain] || APPLY_LINKS.occupational).empty;
      return;
    }
    if (sec) sec.classList.remove('no-domain-data');

    var map = {
      responses: { el: 'statResponses', dec: 0 },
      satisfaction: { el: 'statSatisfaction', dec: 1 },
      nagara: { el: 'statNagara', dec: 1 },
      sessions: { el: 'statSessions', dec: 0 }
    };
    Object.keys(map).forEach(function (key) {
      var node = document.getElementById(map[key].el);
      if (!node) return;
      var v = stats[key];
      if (typeof v !== 'number' || isNaN(v)) return;
      node.textContent = v.toFixed(map[key].dec);
    });

    if (note && CFG.SURVEY_NOTE) note.textContent = CFG.SURVEY_NOTE;
  }

  var slides = [];
  var current = 0;
  var timer = null;

  function getDomainVoices(voices) {
    return (voices || []).filter(function (v) {
      return !v.domain || v.domain === currentDomain;
    });
  }

  function renderDomainCta() {
    var link = document.getElementById('voiceApplyLink');
    var note = document.getElementById('voiceCtaNote');
    var data = APPLY_LINKS[currentDomain] || APPLY_LINKS.care;
    if (link) {
      link.href = data.url;
      link.textContent = data.label;
    }
    if (note) note.textContent = data.note;
  }

  function bindDomainTabs() {
    var tabs = document.querySelectorAll('[data-voice-domain]');
    if (!tabs.length) return;
    Array.prototype.forEach.call(tabs, function (tab) {
      if (tab.dataset.bound === 'true') return;
      tab.dataset.bound = 'true';
      tab.addEventListener('click', function () {
        currentDomain = tab.dataset.voiceDomain || 'care';
        Array.prototype.forEach.call(tabs, function (t) {
          var active = t.dataset.voiceDomain === currentDomain;
          t.classList.toggle('active', active);
          t.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        renderDomainCta();
        if (currentData) {
          renderStats(currentData.stats || {});
          renderVoices(currentData.voices || []);
        }
      });
    });
  }

  function renderVoices(voices) {
    var track = document.getElementById('voiceTrack');
    var dotsWrap = document.getElementById('voiceDots');
    if (!track) return;

    voices = getDomainVoices(voices);

    if (!voices.length) {
      var data = APPLY_LINKS[currentDomain] || APPLY_LINKS.occupational;
      stop();
      track.innerHTML = '<div class="voice-empty" role="status">' + esc(data.empty || '現在、表示できる参加者の声はありません。') + '</div>';
      slides = [];
      if (dotsWrap) dotsWrap.innerHTML = '';
      var emptyPrev = document.getElementById('voicePrev');
      var emptyNext = document.getElementById('voiceNext');
      if (emptyPrev) emptyPrev.hidden = true;
      if (emptyNext) emptyNext.hidden = true;
      return;
    }
    var navPrev = document.getElementById('voicePrev');
    var navNext = document.getElementById('voiceNext');
    if (navPrev) navPrev.hidden = false;
    if (navNext) navNext.hidden = false;

    track.innerHTML = voices.map(function (v, i) {
      var attr = [v.age, v.gender].filter(Boolean).join('・');
      return '' +
        '<figure class="voice-card" role="group" aria-roledescription="スライド" ' +
             'aria-label="' + (i + 1) + ' / ' + voices.length + '">' +
          '<blockquote class="voice-text">' + esc(v.text) + '</blockquote>' +
          '<figcaption class="voice-meta">' +
            (attr ? '<span class="voice-attr">' + esc(attr) + '</span>' : '') +
            (v.style ? '<span class="voice-style">' + esc(v.style) + '</span>' : '') +
            (v.score ? '<span class="voice-score" aria-label="満足度 ' + v.score + ' / 10">満足度 <b>' + esc(v.score) + '</b>/10</span>' : '') +
          '</figcaption>' +
        '</figure>';
    }).join('');

    slides = Array.prototype.slice.call(track.children);

    if (dotsWrap) {
      dotsWrap.innerHTML = voices.map(function (v, i) {
        return '<button type="button" class="voice-dot" data-i="' + i + '" aria-label="' + (i + 1) + '件目の声を表示"></button>';
      }).join('');
      dotsWrap.onclick = function (e) {
        var b = e.target.closest ? e.target.closest('.voice-dot') : null;
        if (!b) return;
        go(parseInt(b.dataset.i, 10));
        restart();
      };
    }

    var prev = document.getElementById('voicePrev');
    var next = document.getElementById('voiceNext');
    if (prev) prev.onclick = function () { go(current - 1); restart(); };
    if (next) next.onclick = function () { go(current + 1); restart(); };

    // スワイプ
    var x0 = null;
    track.ontouchstart = function (e) { x0 = e.touches[0].clientX; };
    track.ontouchend = function (e) {
      if (x0 === null) return;
      var dx = e.changedTouches[0].clientX - x0;
      if (Math.abs(dx) > 40) { go(current + (dx < 0 ? 1 : -1)); restart(); }
      x0 = null;
    };

    // ホバー・フォーカス中は自動送りを止める
    var viewport = document.getElementById('voiceViewport');
    if (viewport) {
      viewport.onmouseenter = function () { stop(); };
      viewport.onfocusin = function () { stop(); };
      viewport.onmouseleave = function () { restart(); };
      viewport.onfocusout = function () { restart(); };
    }

    go(0);
    restart();
  }

  function go(i) {
    if (!slides.length) return;
    current = (i + slides.length) % slides.length;
    slides.forEach(function (el, n) {
      el.classList.toggle('active', n === current);
      el.setAttribute('aria-hidden', n === current ? 'false' : 'true');
    });
    var dots = document.querySelectorAll('.voice-dot');
    Array.prototype.forEach.call(dots, function (d, n) {
      d.classList.toggle('active', n === current);
      d.setAttribute('aria-current', n === current ? 'true' : 'false');
    });
  }

  function stop() { if (timer) { clearInterval(timer); timer = null; } }
  function restart() {
    stop();
    var F = CFG.FEATURES || {};
    if (F.voicesAutoplay === false || REDUCED || slides.length < 2) return;
    timer = setInterval(function () { go(current + 1); }, 6500);
  }

  /* =====================================================
     起動
     ===================================================== */
  function apply(data) {
    currentData = data;
    renderStats(data.stats || {});
    bindDomainTabs();
    renderDomainCta();
    renderVoices(data.voices || []);
  }

  function boot() {
    if (!document.getElementById('voices')) return;

    // まず同梱データで即座に描画（何も見えない時間をつくらない）
    apply(FALLBACK);

    var url = CFG.SURVEY_CSV_URL;
    if (!url) return;

    fetch(url, { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.text();
      })
      .then(function (text) {
        var data = rowsToData(parseCSV(text));
        // 中身が取れたときだけ差し替える（空CSVで表示が消えるのを防ぐ）
        if (data.voices.length || Object.keys(data.stats).length) {
          apply({
            stats: Object.keys(data.stats).length ? data.stats : FALLBACK.stats,
            voices: data.voices.length ? data.voices : FALLBACK.voices
          });
        }
      })
      .catch(function (e) {
        // 失敗しても同梱データが表示されたままなので、ユーザー体験は壊れません
        if (window.console) console.warn('[voices] 集計CSVを読み込めませんでした:', e.message);
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
