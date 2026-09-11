(() => {
  "use strict";
  const store = window.TOTONOE_CURRICULUM_STORE;
  if (!store) return;
  const adminState = store.readAdminState();
  const requestedId = new URLSearchParams(location.search).get("id");
  const lesson = adminState.lessons.find((item) => item.id === requestedId) || adminState.lessons[0];
  const videoRoot = document.querySelector("#lessonVideo");
  const assetsRoot = document.querySelector("#lessonAssets");
  const form = document.querySelector("#completionForm");
  const error = document.querySelector("#completionError");
  const status = document.querySelector("#completionStatus");

  function appendAsset(label, id) {
    if (!id) return;
    const link = document.createElement("a");
    link.href = `https://drive.google.com/file/d/${id}/view`;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = label;
    assetsRoot.append(link);
  }

  if (!lesson) {
    document.querySelector("#lessonTitle").textContent = "教材が見つかりません";
    videoRoot.innerHTML = '<div class="video-empty"><span class="material-symbols-rounded" aria-hidden="true">error</span><h2>教材を選び直してください</h2></div>';
    form.hidden = true;
    return;
  }

  document.title = `${lesson.title}｜ToToNoE+ IROHA`;
  document.querySelector("#lessonEyebrow").textContent = `${lesson.code} / ${lesson.tool}`;
  document.querySelector("#lessonTitle").textContent = lesson.title;
  document.querySelector("#lessonMeta").textContent = `${lesson.module}・${lesson.level}・約${lesson.estimatedMinutes}分`;
  document.querySelector("#lessonAccess").textContent = lesson.accessTier === "free_preview" ? "無料体験" : "IROHA会員向け";
  const previewUrl = store.drivePreviewUrl(lesson.providerAssetId);
  if (previewUrl) {
    const iframe = document.createElement("iframe");
    iframe.src = previewUrl;
    iframe.title = `${lesson.title} 動画`;
    iframe.allow = "autoplay; fullscreen";
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    videoRoot.append(iframe);
  } else {
    videoRoot.innerHTML = '<div class="video-empty"><span class="material-symbols-rounded" aria-hidden="true">video_library</span><h2>動画は準備中です</h2><p>教材管理画面でGoogle Driveの動画ファイルを登録すると、ここに表示されます。</p></div>';
  }
  appendAsset("文字起こしPDF", lesson.transcriptAssetId);
  appendAsset("ワークシートPDF", lesson.worksheetAssetId);

  const learnerState = store.readLearnerState();
  learnerState.lessonProgress ||= {};
  const saved = learnerState.lessonProgress[lesson.id];
  if (saved) {
    form.elements.understood.checked = true;
    form.elements.action.value = saved.action || "";
    status.textContent = `完了済み（${new Date(saved.completedAt).toLocaleDateString("ja-JP")}）`;
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    error.textContent = "";
    if (!form.elements.understood.checked || !form.elements.action.value.trim()) { error.textContent = "理解確認と、実務で試すことを入力してください。"; return; }
    learnerState.lessonProgress[lesson.id] = { status: "completed", action: form.elements.action.value.trim(), completedAt: new Date().toISOString() };
    store.writeLearnerState(learnerState);
    status.textContent = `完了済み（${new Date().toLocaleDateString("ja-JP")}）`;
    const toast = document.querySelector("#toast");
    toast.textContent = "レッスンの完了を保存しました";
    toast.classList.add("is-visible");
    setTimeout(() => toast.classList.remove("is-visible"), 2500);
  });
})();
