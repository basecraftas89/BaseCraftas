(async () => {
  "use strict";
  const store = window.TOTONOE_CURRICULUM_STORE;
  if (!store) return;
  const delivery=window.TOTONOE_DELIVERY;
  const deliveryResult=delivery ? await delivery.ready : null;
  if(deliveryResult?.error) {
    document.querySelector('#lessonTitle').textContent='教材を読み込めませんでした';
    document.querySelector('#lessonVideoNote').textContent='ログイン状態と通信を確認し、再読み込みしてください。';
    document.querySelector('#completionForm').hidden=true;
    return;
  }
  const adminState = store.readAdminState();
  const requestedId = new URLSearchParams(location.search).get("id");
  const previewLesson = !requestedId && ["", "localhost", "127.0.0.1"].includes(location.hostname) ? {
    id: "claude-basic-layout-preview", code: "CLA-PREVIEW-01", categoryId: "llm", curriculumTitle: "Claude", tool: "Claude",
    level: "基礎", module: "01_基礎", title: "9:30 TAYORI共有（画面確認用）", estimatedMinutes: null,
    accessTier: "curriculum_all_access", folderStage: "delivery", workflowStatus: "published",
    videoFileName: "9:30 TAYORI共有.mp4", providerAssetId: "1LJP_caa6k9A-v1H7gCBmSpDdZqNQ8A87"
  } : null;
  if (previewLesson) adminState.lessons.push(previewLesson);
  const lesson = previewLesson || adminState.lessons.find((item) => item.id === requestedId) || (!requestedId ? adminState.lessons.find(item=>item.allowed!==false) : null);
  const videoRoot = document.querySelector("#lessonVideo");
  const assetsRoot = document.querySelector("#lessonAssets");
  const form = document.querySelector("#completionForm");
  const error = document.querySelector("#completionError");
  const status = document.querySelector("#completionStatus");
  const draftStatus = document.querySelector("#lessonDraftStatus");
  const notesToggle = document.querySelector("#toggleLessonNotes");
  const notesLabel = document.querySelector("#toggleLessonNotesLabel");
  const stage = document.querySelector("#lessonStage");
  const videoNote = document.querySelector("#lessonVideoNote");
  const completeButton = document.querySelector("#completeLessonButton");
  const notesClient = window.TOTONOE_LESSON_NOTES;
  const localNotes = ['', 'localhost', '127.0.0.1'].includes(location.hostname);
  const saveButton = document.querySelector('#saveLessonDraft');
  let remoteNote = null;
  let remoteReady = false;
  let conflictNote = null;
  let conflict = false;
  let inFlight = null;
  let lastAttempt = null;
  let dirty = false;
  let autosaveTimer;

  function hideNotesForUnavailableLesson() {
    form.hidden = true;
    notesToggle.hidden = true;
    stage.classList.remove("is-notes-open");
  }

  function appendAsset(label, id) {
    if (!store.drivePreviewUrl(id)) return;
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
    hideNotesForUnavailableLesson();
    return;
  }

  document.title = `${lesson.title}｜ToToNoE+ IROHA`;
  const category = store.categories.find((item) => item.id === store.lessonCategoryId(lesson));
  document.querySelector("#lessonEyebrow").textContent = `${lesson.code} / ${category?.label || "カリキュラム"}`;
  document.querySelector("#lessonTitle").textContent = lesson.title;
  document.querySelector("#lessonMeta").textContent = [store.lessonCurriculumTitle(lesson), lesson.module, lesson.level, lesson.estimatedMinutes ? `約${lesson.estimatedMinutes}分` : ""].filter(Boolean).join("・");
  document.querySelector("#lessonAccess").textContent = previewLesson ? "画面確認用" : lesson.accessTier === "free_preview" ? "無料体験" : "IROHA会員向け";
  const previewUrl = store.drivePreviewUrl(lesson.providerAssetId);
  const available = store.isPublishedLesson(lesson);
  const siblings = previewLesson ? [previewLesson] : store.sortLessons(adminState.lessons.filter((item) => store.lessonCurriculumKey(item) === store.lessonCurriculumKey(lesson) && store.isPublishedLesson(item)));
  const index = siblings.findIndex((item) => item.id === lesson.id);
  const navigation = document.querySelector("#lessonNavigation");
  const learnerState = store.readLearnerState();
  learnerState.lessonProgress ||= {};
  if (available && !store.lessonUnlockState(siblings, lesson.id, learnerState.lessonProgress).allowed) {
    const first = store.lessonUnlockState(siblings, lesson.id, learnerState.lessonProgress).firstIncomplete;
    videoRoot.innerHTML = '<div class="video-empty"><span class="material-symbols-rounded" aria-hidden="true">lock</span><h2>前のレッスンから進めてください</h2><p>動画ごとの学習アウトプットを保存すると、次の動画が開きます。</p></div>';
    hideNotesForUnavailableLesson();
    if (first) {
      const link = document.createElement("a");
      link.href = `lesson.html?id=${encodeURIComponent(first.id)}`;
      link.textContent = `続きから学ぶ：${first.title}`;
      navigation.append(link);
    }
    return;
  }
  let videoEnded = false;
  const streamUrl = (() => {
    if (!lesson.playbackUrl || !/^https?:$/.test(location.protocol)) return null;
    try {
      const url = new URL(lesson.playbackUrl, location.href);
      return url.origin === location.origin && url.pathname.startsWith("/api/totonoe-member/api/curriculum/media/") ? url.href : null;
    } catch (_) { return null; }
  })();
  if (available && streamUrl) {
    const video = document.createElement("video");
    video.src = streamUrl;
    video.controls = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.setAttribute("aria-label", `${lesson.title} 動画`);
    videoRoot.append(video);
    if(!localNotes && delivery && window.TOTONOE_ATTACH_PLAYBACK) {
      video.controls=false;
      try {
        await window.TOTONOE_ATTACH_PLAYBACK(video,lesson,()=>{
          videoEnded=true;completeButton.disabled=false;
          videoNote.textContent='動画の最後までの視聴を保存しました。アウトプットを保存して次へ進めます。';
        },()=>{completeButton.disabled=true;videoNote.textContent='再生記録を保存できませんでした。メモを保存し、再読み込みして続きから再開してください。';});
        video.controls=true;
      } catch(_) {video.removeAttribute('src');videoNote.textContent='動画を開始できませんでした。ログイン状態と通信を確認して再読み込みしてください。';}
    } else {
    let furthestWatched = 0;
    video.addEventListener("timeupdate", () => {
      if (!video.seeking) furthestWatched = Math.max(furthestWatched, video.currentTime);
    });
    video.addEventListener("seeking", () => {
      if (video.currentTime > furthestWatched + 1) video.currentTime = furthestWatched;
    });
    video.addEventListener("ended", () => {
      if (!Number.isFinite(video.duration) || video.duration <= 0 || furthestWatched < video.duration - 1) return;
      let playedSeconds = 0;
      for (let index = 0; index < video.played.length; index += 1) playedSeconds += video.played.end(index) - video.played.start(index);
      if (playedSeconds < video.duration - 1) return;
      videoEnded = true;
      completeButton.disabled = false;
      videoNote.textContent = "動画の最後までの視聴を確認しました。アウトプットを保存できます。";
    });
    }
    videoNote.textContent = "動画の最後まで視聴すると、アウトプットを保存できます。";
  } else if (available) {
    const iframe = document.createElement("iframe");
    iframe.src = previewUrl;
    iframe.title = `${lesson.title} 動画`;
    iframe.allow = "autoplay; fullscreen";
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    videoRoot.append(iframe);
    videoNote.textContent = "現在のDrive動画は再生終了を検知できないため、次のレッスンは解放されません。メモは保存できます。";
  } else {
    videoRoot.innerHTML = '<div class="video-empty"><span class="material-symbols-rounded" aria-hidden="true">video_library</span><h2>動画は準備中です</h2><p>教材管理画面でGoogle Driveの動画ファイルを登録すると、ここに表示されます。</p></div>';
  }
  if (!available) { hideNotesForUnavailableLesson(); return; }
  notesToggle.addEventListener("click", () => {
    form.hidden = !form.hidden;
    stage.classList.toggle("is-notes-open", !form.hidden);
    notesToggle.setAttribute("aria-expanded", String(!form.hidden));
    notesLabel.textContent = form.hidden ? "メモを表示" : "メモを収納";
  });
  appendAsset("文字起こしPDF", lesson.transcriptAssetId);
  appendAsset("ワークシートPDF", lesson.worksheetAssetId);

  const favoriteButton = document.querySelector("#favoriteLessonButton");
  const favoriteLabel = document.querySelector("#favoriteLessonLabel");
  favoriteButton.hidden = false;
  function renderFavorite() {
    const active = Boolean(learnerState.lessonFavorites?.[lesson.id]);
    favoriteButton.classList.toggle("is-favorite", active);
    favoriteButton.setAttribute("aria-pressed", String(active));
    favoriteLabel.textContent = active ? "お気に入り登録済み" : "お気に入りに追加";
  }
  renderFavorite();
  favoriteButton.addEventListener("click", () => {
    learnerState.lessonFavorites ||= {};
    if (learnerState.lessonFavorites[lesson.id]) delete learnerState.lessonFavorites[lesson.id];
    else learnerState.lessonFavorites[lesson.id] = true;
    store.writeLearnerState(learnerState);
    renderFavorite();
  });

  function renderNavigation() {
    navigation.replaceChildren();
    [[index - 1, "前のレッスン"], [index + 1, "次のレッスン"]].forEach(([position, label]) => {
      const target = siblings[position];
      if (!target) return;
      if (!store.lessonUnlockState(siblings, target.id, learnerState.lessonProgress).allowed) {
        const locked = document.createElement("span");
        locked.className = "lesson-navigation-locked";
        locked.textContent = `${label}：動画終了・アウトプット保存後に開放`;
        navigation.append(locked);
        return;
      }
      const link = document.createElement("a");
      link.href = `lesson.html?id=${encodeURIComponent(target.id)}`;
      link.textContent = `${label}：${target.title}`;
      navigation.append(link);
    });
  }
  renderNavigation();
  const saved = learnerState.lessonProgress[lesson.id];
  if (!localNotes && store.isCompletedLessonProgress(saved)) {
    status.textContent = saved.completedAt ? `完了済み（${new Date(saved.completedAt).toLocaleDateString("ja-JP")}）` : "完了済み";
    videoNote.textContent = "動画視聴とアウトプット保存は完了しています。";
  }
  if (localNotes && store.isCompletedLessonProgress(saved)) {
    form.elements.takeaway.value = saved.takeaway || "";
    form.elements.doubts.value = saved.doubts || "";
    form.elements.action.value = saved.action || "";
    if (saved.playbackCompletedAt) { videoEnded = true; completeButton.disabled = false; }
    status.textContent = saved.completedAt ? `完了済み（${new Date(saved.completedAt).toLocaleDateString("ja-JP")}）` : "完了済み";
    draftStatus.textContent = "保存済みのアウトプットを表示しています。";
  }
  const draft = localNotes ? learnerState.lessonDrafts?.[lesson.id] : null;
  if (draft) {
    form.elements.takeaway.value = draft.takeaway || "";
    form.elements.doubts.value = draft.doubts || "";
    form.elements.action.value = draft.action || "";
    draftStatus.textContent = "入力途中のメモを復元しました。";
  }

  const noteText = () => ({ takeaway:form.elements.takeaway.value, doubts:form.elements.doubts.value, action:form.elements.action.value });
  const snapshotKey = value => JSON.stringify([value?.takeaway || '',value?.doubts || '',value?.action || '']);
  async function loadRemoteNotes() {
    saveButton.disabled = true;
    [...form.querySelectorAll('textarea')].forEach(field => { field.disabled = true; });
    draftStatus.textContent = '会員アカウントのメモを読み込んでいます…';
    try {
      if (!notesClient) throw new Error('notes_client_unavailable');
      const result = await notesClient.load(lesson.id);
      remoteNote = result.note;
      ['takeaway','doubts','action'].forEach(key => { form.elements[key].value = remoteNote?.[key] || ''; });
      remoteReady = true;
      draftStatus.textContent = remoteNote ? '会員アカウントに保存したメモを復元しました。':'入力後に会員アカウントへ自動保存します。';
      saveButton.textContent = 'メモを保存';
      [...form.querySelectorAll('textarea')].forEach(field => { field.disabled = false; });
      return true;
    } catch (_) {
      draftStatus.textContent = 'メモを読み込めませんでした。通信とログイン状態を確認して再接続してください。';
      saveButton.textContent = '再接続';
      return false;
    } finally { saveButton.disabled = false; }
  }
  document.querySelector('.lesson-note-heading > p').textContent = localNotes
    ? 'ローカル確認用です。メモはこのブラウザに保存されます。'
    : 'メモは会員アカウントに保存されます。運営メンバーも学習支援のために確認できます。';
  if (!localNotes) await loadRemoteNotes();
  async function saveDraft(explicit = false) {
    if (!localNotes) {
      clearTimeout(autosaveTimer);
      if (!remoteReady) { if (explicit) await loadRemoteNotes(); return false; }
      if (conflict && !explicit) return false;
      if (inFlight) { await inFlight; return saveDraft(explicit); }
      if (conflict) { remoteNote = conflictNote; conflict = false; lastAttempt = null; }
      const values = noteText();
      if (!dirty && snapshotKey(values) === snapshotKey(remoteNote)) {
        draftStatus.textContent = remoteNote ? '会員アカウントに保存済みです。':'メモを入力すると保存できます。';
        return Boolean(remoteNote);
      }
      const key = snapshotKey(values);
      if (!lastAttempt || lastAttempt.key !== key || lastAttempt.payload.baseRevision !== (remoteNote?.revision || 0)) {
        lastAttempt = { key,payload:{ ...values,lessonId:lesson.id,title:lesson.title,category:category?.label || '',curriculumTitle:store.lessonCurriculumTitle(lesson),
          baseRevision:remoteNote?.revision || 0, mutationId:crypto.randomUUID(),saveKind:explicit ? 'manual':'autosave' } };
      }
      const attempt = lastAttempt;
      draftStatus.textContent = 'メモを保存しています…';
      saveButton.disabled = true;
      inFlight = (async () => {
        try {
          const result = await notesClient.save(attempt.payload);
          remoteNote = result.note;
          lastAttempt = null;
          dirty = snapshotKey(noteText()) !== attempt.key;
          draftStatus.textContent = result.sheetSync === 'synced' ? '会員メモと管理シートに保存しました。':'会員メモを保存しました。管理シートは反映待ちです。';
          saveButton.textContent = 'メモを保存';
          if (dirty) autosaveTimer = setTimeout(() => saveDraft(),4000);
          return true;
        } catch (error) {
          if (error.status === 409) {
            conflict = true;
            conflictNote = error.note;
            draftStatus.textContent = '別の画面でメモが更新されました。入力内容は残しています。この内容で上書きする場合は「この内容で更新」を押してください。';
            saveButton.textContent = 'この内容で更新';
          } else {
            draftStatus.textContent = '保存できませんでした。入力内容はこの画面に残しています。通信を確認して「メモを保存」を押してください。';
          }
          return false;
        } finally { inFlight = null; saveButton.disabled = false; }
      })();
      return inFlight;
    }
    if (!form.elements.takeaway.value.trim() && !form.elements.doubts.value.trim() && !form.elements.action.value.trim()) {
      if (learnerState.lessonDrafts) delete learnerState.lessonDrafts[lesson.id];
      try {
        store.writeLearnerState(learnerState);
        draftStatus.textContent = explicit ? "メモを入力してください。" : "入力途中のメモを消去しました。";
      } catch (_) {
        draftStatus.textContent = "メモを保存できませんでした。ブラウザの保存設定を確認してください。";
      }
      return;
    }
    learnerState.lessonDrafts ||= {};
    learnerState.lessonDrafts[lesson.id] = {
      takeaway: form.elements.takeaway.value,
      doubts: form.elements.doubts.value,
      action: form.elements.action.value,
      title: lesson.title,
      curriculumTitle: store.lessonCurriculumTitle(lesson),
      updatedAt: new Date().toISOString()
    };
    try {
      store.writeLearnerState(learnerState);
      draftStatus.textContent = explicit ? "メモを保存しました。" : "入力途中のメモをこのブラウザに保存しました。";
    } catch (_) {
      draftStatus.textContent = "メモを保存できませんでした。ブラウザの保存設定を確認してください。";
    }
    return true;
  }
  form.addEventListener("input", (event) => {
    if (!event.target.matches('textarea[name="takeaway"], textarea[name="doubts"], textarea[name="action"]')) return;
    if (localNotes) saveDraft();
    else { dirty = true; draftStatus.textContent = '入力中です。入力が落ち着くと自動保存します。'; clearTimeout(autosaveTimer); if (!conflict) autosaveTimer = setTimeout(() => saveDraft(),4000); }
  });
  document.querySelector("#saveLessonDraft").addEventListener("click", () => saveDraft(true));

  window.addEventListener('beforeunload',event => { if (!localNotes && dirty) { event.preventDefault(); event.returnValue = ''; } });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    error.textContent = "";
    if (!videoEnded || !streamUrl) { error.textContent = "動画の最後までの視聴を確認できていません。現在のDrive動画では次のレッスンを解放できません。"; return; }
    if (!form.elements.takeaway.value.trim() || !form.elements.action.value.trim()) { error.textContent = "学んだこと・次に試すことを入力してください。"; return; }
    if (!localNotes && !await saveDraft(true)) { error.textContent = 'メモを保存してから進めてください。'; return; }
    if(!localNotes && delivery) {
      completeButton.disabled=true;
      try {
        await delivery.api('/lessons/'+encodeURIComponent(lesson.id)+'/complete',{});
        await delivery.refresh();
        Object.assign(learnerState.lessonProgress,store.readLearnerState().lessonProgress);
        status.textContent='完了済み';draftStatus.textContent='アウトプットとレッスン完了を保存しました。';
        renderNavigation();
      }catch(_){error.textContent='完了を保存できませんでした。通信を確認してもう一度お試しください。';}
      finally{completeButton.disabled=false;}
      return;
    }
    const completedAt = new Date().toISOString();
    learnerState.lessonProgress[lesson.id] = { status: "completed", takeaway: form.elements.takeaway.value.trim(), doubts: form.elements.doubts.value.trim(), action: form.elements.action.value.trim(), playbackCompletedAt: saved?.playbackCompletedAt || completedAt, completedAt, badgeEligible: !previewLesson, title: lesson.title, tool: lesson.tool || category?.label || "IROHA", categoryId: store.lessonCategoryId(lesson), curriculumTitle: store.lessonCurriculumTitle(lesson) };
    if (learnerState.lessonDrafts) delete learnerState.lessonDrafts[lesson.id];
    learnerState.certificates = store.buildAchievementModel(adminState, learnerState).certificateState;
    store.writeLearnerState(learnerState);
    status.textContent = `完了済み（${new Date().toLocaleDateString("ja-JP")}）`;
    draftStatus.textContent = "アウトプットを保存しました。";
    renderNavigation();
    const toast = document.querySelector("#toast");
    toast.textContent = "レッスンの完了を保存しました";
    toast.classList.add("is-visible");
    setTimeout(() => toast.classList.remove("is-visible"), 2500);
  });
})();
