/* =========================================================
   週末のAI整え習慣 — 全ページ共通スクリプト
   ・ヘッダー／モバイルナビ
   ・申込URLの一括差し込み（config.js の APPLY_URL）
   ・次回開催までのカウントダウン
   ・モバイル下部の固定CTA
   ・週間サイクルの「今日ここ」ハイライト

   ※ 編集が必要になるのは基本的に config.js だけです。
   ========================================================= */
(function () {
  'use strict';

  var CFG = window.WA_CONFIG || {};
  var F = CFG.FEATURES || {};
  var REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  /* =====================================================
     1. ヘッダー：スクロール影 ＋ モバイルナビ
     ===================================================== */
  function initHeader() {
    var header = document.getElementById('siteHeader');
    var nav = document.getElementById('siteNav');
    var toggle = document.getElementById('navToggle');

    if (header) {
      var onScroll = function () {
        header.classList.toggle('scrolled', window.scrollY > 8);
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }

    if (toggle && nav) {
      toggle.addEventListener('click', function () {
        var open = nav.classList.toggle('open');
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        toggle.setAttribute('aria-label', open ? 'メニューを閉じる' : 'メニューを開く');
      });
      nav.addEventListener('click', function (e) {
        if (e.target.tagName === 'A') {
          nav.classList.remove('open');
          toggle.setAttribute('aria-expanded', 'false');
          toggle.setAttribute('aria-label', 'メニューを開く');
        }
      });
      // Escapeで閉じる
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && nav.classList.contains('open')) {
          nav.classList.remove('open');
          toggle.setAttribute('aria-expanded', 'false');
        }
      });
    }
  }

  /* =====================================================
     2. 申込URLの一括差し込み
     　 HTML側で href="#apply" もしくは data-apply を付けた
     　 リンクに、config.js の APPLY_URL を流し込みます。
     　 data-apply の値は流入元ラベル（?from=◯◯）になります。
     ===================================================== */
  function initApplyLinks() {
    var url = CFG.APPLY_URL;
    if (!url) return;

    $$('a[data-apply]').forEach(function (a) {
      var from = a.getAttribute('data-apply');
      var href = url;
      if (from) href += (url.indexOf('?') === -1 ? '?' : '&') + 'from=' + encodeURIComponent(from);
      a.setAttribute('href', href);
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener');
    });
  }

  /* =====================================================
     3. 次回開催までのカウントダウン
     　 「毎週土曜6:00」は規則的なので、日時データの更新は不要です。
     　 日本時間（JST）基準で計算します。
     ===================================================== */
  function jstNow() {
    var d = new Date();
    // ローカル時刻をUTCに戻してから +9時間 ＝ JSTの壁時計時刻
    return new Date(d.getTime() + d.getTimezoneOffset() * 60000 + 9 * 3600000);
  }

  function nextMeeting(from) {
    var m = CFG.MEETING || { weekday: 6, hour: 6, minute: 0, durationMin: 30 };
    var start = new Date(from.getTime());
    start.setHours(m.hour, m.minute, 0, 0);

    var diffDays = (m.weekday - start.getDay() + 7) % 7;
    start.setDate(start.getDate() + diffDays);

    var end = new Date(start.getTime() + (m.durationMin || 30) * 60000);

    // すでに終わっていたら翌週へ
    if (from.getTime() >= end.getTime()) {
      start.setDate(start.getDate() + 7);
      end = new Date(start.getTime() + (m.durationMin || 30) * 60000);
    }
    return { start: start, end: end };
  }

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  /* 数字だけを更新する（毎秒DOMを作り直さないため、アニメーションが途切れません） */
  function buildFull(el) {
    el.innerHTML =
      '<span class="cd-label"><span class="cd-label-ico" aria-hidden="true">\u23F0</span>次回の朝活まで</span>' +
      '<span class="cd-clock">' +
        '<span class="cd-unit cd-unit-day" hidden><b>0</b><i>\u65E5</i></span>' +
        '<span class="cd-unit"><b>00</b><i>\u6642\u9593</i></span>' +
        '<span class="cd-unit"><b>00</b><i>\u5206</i></span>' +
        '<span class="cd-unit cd-unit-sec"><b>00</b><i>\u79D2</i></span>' +
      '</span>' +
      '<span class="cd-when">\u6BCE\u9031\u571F\u66DC \u671D6:00\u301C\uFF0F30\u5206\uFF0F\u53C2\u52A0\u7121\u6599</span>';
    var units = el.querySelectorAll('.cd-unit');
    el._cd = {
      mode: 'full',
      day: units[0], dayN: units[0].querySelector('b'),
      hourN: units[1].querySelector('b'),
      minN: units[2].querySelector('b'),
      sec: units[3], secN: units[3].querySelector('b'),
      last: null
    };
  }

  function buildCompact(el) {
    el.innerHTML = '<span class="cd-c-label">次回まで</span><span class="cd-c-value">--</span>';
    el._cd = { mode: 'compact', value: el.querySelector('.cd-c-value'), last: null };
  }

  function buildLive(el) {
    el.innerHTML =
      '<span class="cd-live"><span class="cd-live-dot" aria-hidden="true"></span>いま開催中です</span>' +
      '<span class="cd-when">土曜 朝6:00〜6:30／参加無料</span>';
    el._cd = { mode: 'live' };
  }

  function initCountdown() {
    if (F.countdown === false) return;
    var nodes = $$('[data-countdown]');
    if (!nodes.length) return;

    function tick() {
      var now = jstNow();
      var mt = nextMeeting(now);
      var live = now >= mt.start && now < mt.end;
      var ms = mt.start - now;

      var days = Math.floor(ms / 86400000);
      var hours = Math.floor((ms % 86400000) / 3600000);
      var mins = Math.floor((ms % 3600000) / 60000);
      var secs = Math.floor((ms % 60000) / 1000);

      nodes.forEach(function (el) {
        var compact = el.getAttribute('data-countdown') === 'compact';
        var want = live ? 'live' : (compact ? 'compact' : 'full');

        el.classList.toggle('is-live', live);
        el.classList.toggle('countdown-compact', compact && !live);

        if (!el._cd || el._cd.mode !== want) {
          if (want === 'live') buildLive(el);
          else if (want === 'compact') buildCompact(el);
          else buildFull(el);
        }
        if (want === 'live') return;

        var c = el._cd;
        if (c.mode === 'compact') {
          c.value.textContent =
            (days > 0 ? days + '日 ' : '') + pad(hours) + ':' + pad(mins) + ':' + pad(secs);
          return;
        }

        c.day.hidden = days <= 0;
        if (days > 0) c.dayN.textContent = String(days);
        c.hourN.textContent = pad(hours);
        c.minN.textContent = pad(mins);
        c.secN.textContent = pad(secs);

        // 秒が変わったときだけ、めくれる動きを付ける
        if (c.last !== secs && !REDUCED) {
          c.sec.classList.remove('tick');
          void c.sec.offsetWidth;   // アニメーションを再生させるためのリセット
          c.sec.classList.add('tick');
        }
        c.last = secs;
      });
    }

    tick();
    setInterval(tick, 1000);
  }

  /* =====================================================
     4. モバイル下部の固定CTA
     　 ヒーローを過ぎたら出現、最終CTAに届いたら退場します。
     ===================================================== */
  function initStickyCta() {
    if (F.stickyCta === false) return;
    var bar = document.getElementById('stickyCta');
    if (!bar) return;

    var showAfter = $('#hero') || $('.page-hero') || $('.sem-hero');
    var hideAt = $('.final-cta') || $('.pod-cta-banner') || $('.site-footer');

    function update() {
      var y = window.scrollY;
      var showPoint = showAfter ? showAfter.offsetTop + showAfter.offsetHeight - 120 : 400;
      var hidePoint = hideAt ? hideAt.offsetTop - window.innerHeight * 0.6 : Infinity;
      bar.classList.toggle('show', y > showPoint && y < hidePoint);
    }
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
  }

  /* =====================================================
     5. 週間サイクルの「今日ここ」ハイライト
     　 .timeline > .tl-item に data-days="0,6"（曜日番号）を付けると、
     　 その曜日に訪問したとき .is-today が付きます。
     ===================================================== */
  function initTimelineToday() {
    if (F.timelineToday === false) return;
    var items = $$('.timeline .tl-item[data-days]');
    if (!items.length) return;

    var today = jstNow().getDay();
    var names = ['日', '月', '火', '水', '木', '金', '土'];
    var hit = null;

    items.forEach(function (el) {
      if (hit) return;
      var days = (el.getAttribute('data-days') || '').split(',').map(function (s) { return parseInt(s, 10); });
      if (days.indexOf(today) !== -1) hit = el;
    });
    if (!hit) return;

    var list = hit.closest ? hit.closest('.timeline') : hit.parentNode;
    if (list) list.classList.add('has-today');
    hit.classList.add('is-today');

    // 吹き出し（今日の曜日を出して「自分ごと」にする）
    var balloon = document.createElement('span');
    balloon.className = 'tl-today-badge';
    balloon.innerHTML =
      '<span class="tl-today-dot" aria-hidden="true"></span>' +
      '<span class="tl-today-text">今日は' + names[today] + '曜／ここです</span>';
    hit.appendChild(balloon);

    // 画面に入ったタイミングで「ポンッ」と出す
    if ('IntersectionObserver' in window && !REDUCED) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          hit.classList.add('pop');
          io.unobserve(en.target);
        });
      }, { threshold: 0.35 });
      io.observe(hit);
    } else {
      hit.classList.add('pop');
    }
  }

  /* =====================================================
     起動
     ===================================================== */
  function boot() {
    initHeader();
    initApplyLinks();
    initCountdown();
    initStickyCta();
    initTimelineToday();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
