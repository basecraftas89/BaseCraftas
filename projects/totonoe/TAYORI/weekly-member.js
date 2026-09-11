(() => {
  "use strict";

  const API_BASE = "/api/totonoe-member/api/weekly";
  const isLocalPreview = ["localhost", "127.0.0.1", ""].includes(location.hostname);
  const questionStorageKey = "totonoe-weekly-priority-question-preview-v1";
  const sampleFiles = [
    ["8_9_5.pdf", "1dbgVG8cMH6GTSdULdYcs2Pw1ceBef0Q1", "2026-09-05"],
    ["8_8_29.pdf", "1_20elq4S-WvSIZKFMZEFGqoafWwVv3mi", "2026-08-29"],
    ["8_8_22.pdf", "1Cu33wrv8TaSDwmbkIaMW34VNDNnF06XU", "2026-08-22"],
    ["8_8_15.pdf", "15_QJhMGGV62Ya8R4Qmyy29VbirS0USyG", "2026-08-15"],
    ["8_8_8.pdf", "1_Qf1mSi9zAicjXTpRc7chmCYVRktRWr1", "2026-08-08"],
    ["8_8_1.pdf", "1S3m7yCZ0so1NZyT7WrqWTtbkHh3EdDZp", "2026-08-01"],
    ["8_7_25.pdf", "19Ze9uqhDpg0oXcirSfijMXzC3JEXSmu4", "2026-07-25"],
    ["8_7_18.pdf", "19tqcXadZN96sUbRXs39LKkqAH_IcpYMK", "2026-07-18"],
    ["8_7_11.pdf", "1NPJYciLz3Wzp4Q4Z6WQWNRTy_Ivgctzn", "2026-07-11"],
    ["8_7_4.pdf", "1JPtzxuerxCaaOz0omxjxRzzxFE1Pz8dE", "2026-07-04"],
    ["8_6_27.pdf", "1SRloXmIOxZ8gV4vG3EK8tvxaxnndXjyT", "2026-06-27"],
    ["8_6_20.pdf", "1Z-QfmlKKxkjG4XZG6kCnKrTzbfbEkzjS", "2026-06-20"],
    ["8_6_13.pdf", "12JJxMnpRMJmSZVnSLjHzEtuq4ninwUvU", "2026-06-13"],
    ["8_6_6.pdf", "1DnnRonzbRAN6ng8zPStY2jWVNUjUtJ4n", "2026-06-06"],
    ["8_5_30.pdf", "1-X4tMb8Av1zZuRw3M15zjKI3RZa6vxcU", "2026-05-30"]
  ];
  const sampleMaterials = sampleFiles.map(([fileName, driveId, publishedAt], index) => ({
    id: "preview-" + index,
    title: fileName.replace(/\.pdf$/i, "").replaceAll("_", " / "),
    file_name: fileName,
    mime_type: "application/pdf",
    size_bytes: 2800000 + index * 173000,
    published_at: publishedAt + "T00:00:00Z",
    web_view_link: "https://drive.google.com/file/d/" + driveId + "/view",
    download_url: "https://drive.google.com/uc?export=download&id=" + driveId
  }));

  const elements = {
    loading: document.querySelector("#loadingState"),
    blocked: document.querySelector("#blockedState"),
    blockedTitle: document.querySelector("#blockedTitle"),
    blockedMessage: document.querySelector("#blockedMessage"),
    content: document.querySelector("#memberContent"),
    status: document.querySelector("#memberStatus"),
    preview: document.querySelector("#previewBanner"),
    latestDate: document.querySelector("#latestDate"),
    latestTitle: document.querySelector("#latestTitle"),
    latestDescription: document.querySelector("#latestDescription"),
    latestMeta: document.querySelector("#latestMeta"),
    viewLatest: document.querySelector("#viewLatest"),
    downloadLatest: document.querySelector("#downloadLatest"),
    search: document.querySelector("#materialSearch"),
    sort: document.querySelector("#materialSort"),
    grid: document.querySelector("#materialGrid"),
    empty: document.querySelector("#emptyState"),
    curriculumNav: document.querySelector("#curriculumNavLink")
  };

  Object.assign(elements, {
    questionDialog: document.querySelector("#priorityQuestionDialog"),
    questionForm: document.querySelector("#priorityQuestionForm"),
    questionStatus: document.querySelector("#questionStatus"),
    questionSlotBadge: document.querySelector("#questionSlotBadge"),
    openQuestionDialog: document.querySelector("#openQuestionDialog"),
    closeQuestionDialog: document.querySelector("#closeQuestionDialog"),
    cancelQuestionDialog: document.querySelector("#cancelQuestionDialog"),
    questionError: document.querySelector("#questionFormError"),
    answerVideoList: document.querySelector("#answerVideoList"),
    answerVideoEmpty: document.querySelector("#answerVideoEmpty"),
  });

  let materials = [];
  let currentQuestion = null;

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "公開日未設定";
    return new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "long", day: "numeric" }).format(date);
  }

  function formatBytes(value) {
    const bytes = Number(value || 0);
    if (!bytes) return "PDF";
    return (bytes / 1024 / 1024).toFixed(1) + " MB";
  }

  function showMember(member, rows, preview = false) {
    materials = rows.slice().sort((a, b) => new Date(b.published_at || 0) - new Date(a.published_at || 0));
    elements.loading.hidden = true;
    elements.blocked.hidden = true;
    elements.content.hidden = false;
    elements.preview.hidden = !preview;
    elements.status.className = "member-status is-active";
    elements.status.innerHTML = '<span class="status-dot" aria-hidden="true"></span><div><strong>' +
      (member?.has_curriculum_access ? "IROHA会員" : "TAYORI会員") + '</strong><small>' +
      (member?.current_period_end ? formatDate(member.current_period_end) + "まで有効" : "有効な会員です") + "</small></div>";
    updateCurriculumNavigation(Boolean(member?.has_curriculum_access));
    renderLatest();
    renderGrid();
    loadPriorityQuestion();
    loadAnswerVideos();
  }

  function updateCurriculumNavigation(canOpen) {
    if (!elements.curriculumNav) return;
    elements.curriculumNav.classList.toggle("is-locked", !canOpen);
    elements.curriculumNav.toggleAttribute("aria-disabled", !canOpen);
    elements.curriculumNav.title = canOpen ? "IROHAを開く" : "IROHAへの登録が必要です";
    let badge = elements.curriculumNav.querySelector(".nav-lock");
    if (!canOpen && !badge) {
      badge = document.createElement("span");
      badge.className = "material-symbols-rounded nav-lock";
      badge.setAttribute("aria-hidden", "true");
      badge.textContent = "lock";
      elements.curriculumNav.append(badge);
    }
    if (canOpen && badge) badge.remove();
    elements.curriculumNav.onclick = canOpen ? null : (event) => {
      event.preventDefault();
      document.querySelector("#memberStatus")?.scrollIntoView({ behavior: "smooth", block: "center" });
    };
  }

  function showBlocked(status) {
    elements.loading.hidden = true;
    elements.content.hidden = true;
    elements.blocked.hidden = false;
    elements.status.className = "member-status is-blocked";
    elements.status.innerHTML = '<span class="status-dot" aria-hidden="true"></span><div><strong>利用できません</strong><small>契約状態をご確認ください</small></div>';
    if (status === 401) {
      elements.blockedTitle.textContent = "TAYORI会員ページへログインしてください";
      elements.blockedMessage.textContent = "登録時のメールアドレスでログインすると、資料を確認できます。";
    } else {
      elements.blockedTitle.textContent = "TAYORIの利用期間が終了しています";
      elements.blockedMessage.textContent = "再登録すると、最新号とすべてのバックナンバーを確認できます。";
    }
  }

  function openMaterial(material, mode) {
    if (!material) return;
    if (isLocalPreview && material.id.startsWith("preview-")) {
      window.open(mode === "download" ? material.download_url : material.web_view_link, "_blank", "noopener,noreferrer");
      return;
    }
    const target = API_BASE + "/materials/" + encodeURIComponent(material.id) + "/open?mode=" + mode;
    window.open(target, "_blank", "noopener,noreferrer");
  }

  function renderLatest() {
    const latest = materials[0];
    if (!latest) {
      elements.latestTitle.textContent = "資料の公開をお待ちください";
      elements.latestDescription.textContent = "新しい資料が追加されると、ここへ表示されます。";
      elements.viewLatest.disabled = true;
      elements.downloadLatest.disabled = true;
      return;
    }
    elements.latestDate.textContent = formatDate(latest.published_at);
    elements.latestTitle.textContent = latest.title || latest.file_name || "ToToNoE+ TAYORI";
    elements.latestDescription.textContent = latest.description || "今週の重要なAIトピックを、仕事に使える形で整理した資料です。";
    elements.latestMeta.textContent = formatBytes(latest.size_bytes) + " ・ PDF";
    elements.viewLatest.onclick = () => openMaterial(latest, "view");
    elements.downloadLatest.onclick = () => openMaterial(latest, "download");
  }

  function materialRow(material) {
    const article = document.createElement("article");
    const date = materialDate(material);
    const weekday = new Intl.DateTimeFormat("ja-JP", { weekday: "short" }).format(date);
    article.className = "material-row";
    article.innerHTML =
      '<time class="material-date" datetime="' + date.toISOString() + '"><strong>' + date.getDate() + '</strong><span>日（' + weekday + "）</span></time>" +
      '<div class="material-copy"><h3></h3><p>PDF ・ ' + formatBytes(material.size_bytes) + "</p></div>" +
      '<div class="material-actions"><button type="button" data-mode="view">読む</button><button type="button" data-mode="download">ダウンロード</button></div>';
    article.querySelector("h3").textContent = material.title || material.file_name || "TAYORI資料";
    article.querySelector('[data-mode="view"]').addEventListener("click", () => openMaterial(material, "view"));
    article.querySelector('[data-mode="download"]').addEventListener("click", () => openMaterial(material, "download"));
    return article;
  }

  function materialDate(material) {
    const value = new Date(material.published_at || 0);
    return Number.isNaN(value.getTime()) ? new Date(0) : value;
  }

  function renderGrid() {
    const keyword = elements.search.value.trim().toLocaleLowerCase("ja");
    const direction = elements.sort.value === "asc" ? 1 : -1;
    const rows = materials.slice(1)
      .filter((item) => {
        return !keyword || [item.title, item.file_name].some((value) => String(value || "").toLocaleLowerCase("ja").includes(keyword));
      })
      .sort((a, b) => direction * (materialDate(a) - materialDate(b)));
    const grouped = new Map();
    rows.forEach((item) => {
      const date = materialDate(item);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      if (!grouped.has(year)) grouped.set(year, new Map());
      if (!grouped.get(year).has(month)) grouped.get(year).set(month, []);
      grouped.get(year).get(month).push(item);
    });
    const yearGroups = [];
    grouped.forEach((months, year) => {
      const yearDetails = document.createElement("details");
      yearDetails.className = "archive-year";
      yearDetails.open = Boolean(keyword) || year === [...grouped.keys()][0];
      const count = [...months.values()].reduce((sum, monthRows) => sum + monthRows.length, 0);
      yearDetails.innerHTML = '<summary><span><strong>' + year + '年</strong><small>' + count + '件</small></span><span class="material-symbols-rounded" aria-hidden="true">expand_more</span></summary>';
      const monthList = document.createElement("div");
      monthList.className = "archive-month-list";
      months.forEach((monthRows, month) => {
        const monthDetails = document.createElement("details");
        monthDetails.className = "archive-month";
        monthDetails.open = Boolean(keyword) || month === [...months.keys()][0];
        monthDetails.innerHTML = '<summary><span><strong>' + month + '月</strong><small>' + monthRows.length + '件</small></span><span class="material-symbols-rounded" aria-hidden="true">expand_more</span></summary>';
        const rowList = document.createElement("div");
        rowList.className = "material-row-list";
        rowList.append(...monthRows.map(materialRow));
        monthDetails.append(rowList);
        monthList.append(monthDetails);
      });
      yearDetails.append(monthList);
      yearGroups.push(yearDetails);
    });
    elements.grid.replaceChildren(...yearGroups);
    elements.empty.hidden = rows.length > 0;
  }

  function localWeekStart() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
    return [start.getFullYear(), String(start.getMonth() + 1).padStart(2, "0"), String(start.getDate()).padStart(2, "0")].join("-");
  }

  function weekRangeLabel(weekStart) {
    const start = new Date(weekStart + "T12:00:00");
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return (start.getMonth() + 1) + "月" + start.getDate() + "日〜" + (end.getMonth() + 1) + "月" + end.getDate() + "日";
  }

  function fillQuestionForm(question) {
    if (!elements.questionForm || !question) return;
    ["situation", "goal", "attempts", "blocker", "question", "use_by", "answer_format"].forEach((name) => {
      if (elements.questionForm.elements[name]) elements.questionForm.elements[name].value = question[name] || (name === "answer_format" ? "demonstration" : "");
    });
    elements.questionForm.elements.privacy_confirmed.checked = true;
    elements.questionForm.elements.video_consent.checked = true;
  }

  function renderQuestionState(payload) {
    currentQuestion = payload?.question || null;
    const weekLabel = weekRangeLabel(payload?.week_start || localWeekStart());
    if (!currentQuestion) {
      elements.questionSlotBadge.textContent = "1枠利用できます";
      elements.questionSlotBadge.className = "is-available";
      elements.questionStatus.textContent = weekLabel + "の質問を受け付けています。";
      elements.openQuestionDialog.textContent = "質問を整理して送る";
      return;
    }
    const labels = { submitted: "受付済み", in_review: "回答準備中", answered: "回答済み", closed: "受付終了" };
    elements.questionSlotBadge.textContent = labels[currentQuestion.status] || "受付済み";
    elements.questionSlotBadge.className = "is-used";
    elements.questionStatus.textContent = "質問：" + currentQuestion.question;
    elements.openQuestionDialog.textContent = currentQuestion.status === "submitted" ? "質問を確認・更新" : "送信内容を確認";
    fillQuestionForm(currentQuestion);
  }

  function readLocalQuestion() {
    try {
      const saved = JSON.parse(localStorage.getItem(questionStorageKey) || "null");
      return saved?.week_start === localWeekStart() ? saved : null;
    } catch {
      return null;
    }
  }

  async function loadPriorityQuestion() {
    if (isLocalPreview) return renderQuestionState({ week_start: localWeekStart(), question: readLocalQuestion() });
    try {
      const response = await fetch(API_BASE + "/priority-question", { credentials: "same-origin", headers: { accept: "application/json" } });
      if (!response.ok) throw new Error("質問枠を確認できませんでした");
      renderQuestionState(await response.json());
    } catch (error) {
      elements.questionStatus.textContent = error.message;
    }
  }

  function openQuestionStep(stepNumber) {
    elements.questionForm.querySelectorAll(".question-step").forEach((details) => { details.open = Number(details.dataset.questionStep) === Number(stepNumber); });
    elements.questionForm.querySelectorAll(".question-progress span").forEach((item, index) => item.classList.toggle("is-current", index + 1 === Number(stepNumber)));
  }

  function openQuestionDialog() {
    elements.questionError.textContent = "";
    if (!currentQuestion) elements.questionForm.reset();
    else fillQuestionForm(currentQuestion);
    const locked = currentQuestion && currentQuestion.status !== "submitted";
    elements.questionForm.querySelectorAll("input, textarea, select").forEach((field) => { field.disabled = Boolean(locked); });
    elements.questionForm.querySelector('button[type="submit"]').hidden = Boolean(locked);
    openQuestionStep(1);
    elements.questionDialog.showModal();
  }

  function closeQuestionDialog() {
    elements.questionDialog.close();
  }

  function questionPayload() {
    const data = new FormData(elements.questionForm);
    return {
      situation: String(data.get("situation") || ""),
      goal: String(data.get("goal") || ""),
      attempts: String(data.get("attempts") || ""),
      blocker: String(data.get("blocker") || ""),
      question: String(data.get("question") || ""),
      use_by: String(data.get("use_by") || ""),
      answer_format: String(data.get("answer_format") || "demonstration"),
      privacy_confirmed: data.get("privacy_confirmed") === "on",
      video_consent: data.get("video_consent") === "on",
    };
  }

  async function savePriorityQuestion(event) {
    event.preventDefault();
    elements.questionError.textContent = "";
    if (!elements.questionForm.reportValidity()) return;
    const button = elements.questionForm.querySelector('button[type="submit"]');
    const payload = questionPayload();
    button.disabled = true;
    button.textContent = "送信しています…";
    try {
      let result;
      if (isLocalPreview) {
        const now = new Date().toISOString();
        const previous = readLocalQuestion();
        const question = { ...payload, id: previous?.id || "preview-question", week_start: localWeekStart(), status: "submitted", created_at: previous?.created_at || now, updated_at: now };
        localStorage.setItem(questionStorageKey, JSON.stringify(question));
        result = { week_start: question.week_start, question };
      } else {
        const response = await fetch(API_BASE + "/priority-question", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(payload) });
        const body = await response.json();
        if (!response.ok) throw new Error(body.message || "質問を送信できませんでした");
        result = body;
      }
      renderQuestionState(result);
      closeQuestionDialog();
      elements.questionStatus.textContent = "今週の優先質問を受け付けました。類似質問とまとめ、TAYORI会員全員が見られる回答動画として扱います。回答準備に入るまでは更新できます。";
    } catch (error) {
      elements.questionError.textContent = error.message;
    } finally {
      button.disabled = false;
      button.textContent = currentQuestion ? "今週の質問を更新" : "今週の質問として送る";
    }
  }

  function renderAnswerVideos(videos, playback) {
    elements.answerVideoList.replaceChildren();
    elements.answerVideoEmpty.hidden = videos.length > 0;
    videos.forEach((video) => {
      const article = document.createElement("article");
      article.className = "answer-video-row";
      article.innerHTML = '<span class="material-symbols-rounded" aria-hidden="true">play_circle</span><div><time></time><h3></h3><p></p></div><button type="button" disabled>再生準備中</button>';
      article.querySelector("time").textContent = formatDate(video.published_at);
      article.querySelector("h3").textContent = video.title || "TAYORI回答動画";
      article.querySelector("p").textContent = video.description || "類似する優先質問をまとめた、TAYORI会員共通の解説・回答動画";
      const playButton = article.querySelector("button");
      if (playback === "secure_proxy" && video.playback_url) {
        playButton.disabled = false;
        playButton.textContent = "再生する";
        playButton.addEventListener("click", () => {
          const currentPlayer = article.querySelector("video");
          if (currentPlayer) {
            currentPlayer.pause();
            currentPlayer.removeAttribute("src");
            currentPlayer.load();
            currentPlayer.remove();
            playButton.textContent = "再生する";
            return;
          }
          const player = document.createElement("video");
          player.className = "answer-video-player";
          player.controls = true;
          player.playsInline = true;
          player.preload = "metadata";
          player.src = video.playback_url;
          player.setAttribute("aria-label", (video.title || "TAYORI回答動画") + "を再生");
          article.append(player);
          playButton.textContent = "閉じる";
          player.play().catch(() => {});
        });
      }
      elements.answerVideoList.append(article);
    });
  }

  async function loadAnswerVideos() {
    if (isLocalPreview) return renderAnswerVideos([], "secure_proxy");
    try {
      const response = await fetch(API_BASE + "/answer-videos", { credentials: "same-origin", headers: { accept: "application/json" } });
      if (!response.ok) throw new Error("回答動画を確認できませんでした");
      const payload = await response.json();
      renderAnswerVideos(payload.videos || [], payload.playback);
    } catch (error) {
      elements.answerVideoEmpty.querySelector("p").textContent = error.message;
    }
  }

  async function load() {
    try {
      const response = await fetch(API_BASE + "/materials", { credentials: "same-origin", headers: { accept: "application/json" } });
      if (!response.ok) {
        if (isLocalPreview) return showMember({ status: "preview", has_curriculum_access: new URLSearchParams(location.search).get("plan") !== "weekly" }, sampleMaterials, true);
        return showBlocked(response.status);
      }
      const payload = await response.json();
      showMember(payload.membership, payload.materials || []);
    } catch (_error) {
      if (isLocalPreview) return showMember({ status: "preview", has_curriculum_access: new URLSearchParams(location.search).get("plan") !== "weekly" }, sampleMaterials, true);
      showBlocked(503);
    }
  }

  elements.search.addEventListener("input", renderGrid);
  elements.sort.addEventListener("change", renderGrid);
  elements.openQuestionDialog.addEventListener("click", openQuestionDialog);
  elements.closeQuestionDialog.addEventListener("click", closeQuestionDialog);
  elements.cancelQuestionDialog.addEventListener("click", closeQuestionDialog);
  elements.questionForm.addEventListener("submit", savePriorityQuestion);
  elements.questionForm.querySelectorAll("[data-question-next]").forEach((button) => button.addEventListener("click", () => {
    const step = button.closest(".question-step");
    const invalid = [...step.querySelectorAll("input, textarea, select")].find((field) => !field.checkValidity());
    if (invalid) return invalid.reportValidity();
    openQuestionStep(button.dataset.questionNext);
  }));
  elements.questionForm.querySelectorAll(".question-step").forEach((details) => details.addEventListener("toggle", () => {
    if (details.open) openQuestionStep(details.dataset.questionStep);
  }));
  load();
})();
