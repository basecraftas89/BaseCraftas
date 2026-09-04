/* =========================================================
   週末のAI整え習慣 — BGM再生（ページを切り替えても鳴り続ける）

   静的サイト（ページ遷移のたびにHTMLを読み込み直す作り）のため、
   本当の意味で「音を途切れさせない」ことはできません。その代わり、
   ・再生中かどうか
   ・再生していた位置（秒）
   をlocalStorageに保存しておき、次のページの読み込み時に自動で
   同じ位置から再生を再開することで、体感として鳴り続けているように
   見せています。

   なお、ブラウザの自動再生ポリシー上、最初の1回はボタンを押す操作が
   必要です。一度押すと「このサイトでは音を鳴らしてよい」と
   ブラウザ側に記憶されるため、以降のページ遷移では操作なしで
   自動的に再生が続きます（Chrome / Edge / Safari で確認済みですが、
   ブラウザ・設定によっては引き続きボタンを押す必要がある場合があります。
   その場合もボタンを押した位置から続きが再生されます）。
   ========================================================= */
(function () {
  'use strict';

  var audio = document.getElementById('bgmAudio');
  var btn = document.getElementById('bgmToggle');
  if (!audio || !btn) return;

  var PLAYING_KEY = 'wa_bgm_playing_v1';
  var TIME_KEY = 'wa_bgm_time_v1';

  function setPlayingUI(on) {
    btn.classList.toggle('is-playing', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    var label = btn.querySelector('.bgm-label');
    if (label) label.textContent = on ? '曲を停止' : '曲を再生';
  }

  function saveState(playing) {
    try {
      localStorage.setItem(PLAYING_KEY, playing ? '1' : '0');
      localStorage.setItem(TIME_KEY, String(audio.currentTime || 0));
    } catch (e) {}
  }

  function loadState() {
    try {
      return {
        playing: localStorage.getItem(PLAYING_KEY) === '1',
        time: parseFloat(localStorage.getItem(TIME_KEY)) || 0
      };
    } catch (e) {
      return { playing: false, time: 0 };
    }
  }

  function tryResume() {
    var st = loadState();
    if (!st.playing) return;
    if (st.time > 0) {
      try { audio.currentTime = st.time; } catch (e) {}
    }
    var p = audio.play();
    if (p && typeof p.then === 'function') {
      p.then(function () { setPlayingUI(true); })
        .catch(function () {
          // 自動再生がブロックされた場合：見た目は「再生」表示に戻し、
          // ボタンを押せば保存しておいた位置から再開できるようにする
          setPlayingUI(false);
        });
    }
  }

  btn.addEventListener('click', function () {
    if (audio.paused) {
      var p = audio.play();
      if (p && typeof p.then === 'function') {
        p.then(function () { setPlayingUI(true); saveState(true); })
          .catch(function () { setPlayingUI(false); });
      } else {
        setPlayingUI(true);
        saveState(true);
      }
    } else {
      audio.pause();
      setPlayingUI(false);
      saveState(false);
    }
  });

  audio.addEventListener('play', function () { saveState(true); });
  audio.addEventListener('pause', function () { saveState(false); });

  // 再生位置を定期的に保存（ページ遷移時になるべく近い位置から再開するため）
  setInterval(function () {
    if (!audio.paused) saveState(true);
  }, 1000);

  window.addEventListener('pagehide', function () {
    saveState(!audio.paused);
  });

  tryResume();
})();
