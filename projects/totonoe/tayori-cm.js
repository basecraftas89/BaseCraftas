(() => {
  const open = document.querySelector('.tayori-cm-open');
  const dialog = document.getElementById('tayoriCmDialog');
  const player = document.getElementById('tayoriCmPlayer');
  if (!open || !dialog || !player) return;
  open.addEventListener('click', () => {
    const bgm = document.getElementById('bgmAudio');
    if (bgm && !bgm.paused) document.getElementById('bgmToggle')?.click();
    const frame = document.createElement('iframe');
    frame.src = 'https://www.youtube-nocookie.com/embed/N9iBoVLKGa0?autoplay=1&playsinline=1';
    frame.title = 'たより｜TAYORI CM';
    frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    frame.allowFullscreen = true;
    player.replaceChildren(frame);
    dialog.showModal();
    document.body.classList.add('tayori-cm-active');
  });
  dialog.querySelector('.tayori-cm-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    const rect = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
  });
  dialog.addEventListener('close', () => {
    player.replaceChildren();
    document.body.classList.remove('tayori-cm-active');
    open.focus();
  });
  window.addEventListener('pagehide', () => { player.replaceChildren(); });
})();
