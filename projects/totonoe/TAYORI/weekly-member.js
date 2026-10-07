(() => {
  "use strict";

  const API_BASE = "/api/totonoe-member/api/weekly";
  const isLocalPreview = ["localhost", "127.0.0.1", ""].includes(location.hostname);
  const questionStorageKey = "totonoe-weekly-priority-question-preview-v1";
  const sampleFiles = [
    ["8_9_26.pdf", "1OVT0m9VeTNsLLHrAMkdAhkWQ_JDhvw9M", "2026-09-27"],
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
    curriculumNav: document.querySelector("#curriculumNavLink"),
    viewTitle: document.querySelector("#tayoriViewTitle")
  };

  Object.assign(elements, {
    questionComposer: document.querySelector("#questionComposer"),
    questionToggle: document.querySelector("#questionToggle"),
    questionToggleText: document.querySelector("#questionToggleText"),
    questionWeekRange: document.querySelector("#questionWeekRange"),
    questionFormWeekRange: document.querySelector("#questionFormWeekRange"),
    questionForm: document.querySelector("#priorityQuestionForm"),
    questionStatus: document.querySelector("#questionStatus"),
    questionSlotBadge: document.querySelector("#questionSlotBadge"),
    closeQuestionPanel: document.querySelector("#closeQuestionPanel"),
    questionError: document.querySelector("#questionFormError"),
    answerVideoList: document.querySelector("#answerVideoList"),
    answerVideoEmpty: document.querySelector("#answerVideoEmpty"),
  });

  let materials = [];
  let currentQuestion = null;
  let seminarStatusFilter = "all";
  let seminarTagFilter = "all";
  let answerCategoryFilter = "all";
  let questionSubmissionOpen = false;
  const viewTitles = { home: "ご案内", questions: "今週の優先質問", answers: "みんなの質問・回答動画", backnumbers: "バックナンバー", seminars: "セミナー" };

  function currentView() {
    const requested = new URLSearchParams(location.search).get("view") || "home";
    return Object.hasOwn(viewTitles, requested) ? requested : "home";
  }

  function renderView() {
    const view = currentView();
    const banner = document.querySelector("#tayoriWorldBanner");
    if (banner) banner.src = "../assets/member-banner-" + view + "-v2.webp";
    elements.viewTitle.textContent = viewTitles[view];
    document.title = viewTitles[view] + "｜TAYORI｜ToToNoE+";
    document.querySelectorAll("[data-tayori-view]").forEach((section) => { section.hidden = section.dataset.tayoriView !== view; });
    document.querySelectorAll("[data-tayori-tab]").forEach((link) => {
      if (link.dataset.tayoriTab === view) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
  }

  function navigateView(view) {
    if (!Object.hasOwn(viewTitles, view)) return;
    const url = new URL(location.href);
    if (view === "home") url.searchParams.delete("view");
    else url.searchParams.set("view", view);
    url.hash = "";
    history.pushState({ tayoriView: view }, "", url);
    renderView();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

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

  function seminarHasEnded(seminar) {
    const end = String(seminar.time || "").match(/[〜~–-](\d{1,2}:\d{2})/);
    const clock = end ? end[1].padStart(5, "0") : "23:59";
    const timestamp = Date.parse(String(seminar.date || "") + "T" + clock + ":00+09:00");
    return Number.isFinite(timestamp) && timestamp <= Date.now();
  }

  function safeSeminarUrl(value) {
    if (!value) return "";
    try {
      const url = new URL(value, location.href);
      return ["https:", "http:"].includes(url.protocol) ? url.href : "";
    } catch { return ""; }
  }

  function seminarCard(seminar) {
    const past = seminarHasEnded(seminar);
    const paid = seminar.price && seminar.price !== "無料";
    const card = document.createElement("article");
    card.className = "tayori-seminar-card" + (past ? " is-past" : "");
    const thumb = safeSeminarUrl(/^https?:\/\//.test(seminar.thumb || "") ? seminar.thumb : "../" + (seminar.thumb || "assets/og-image.jpg"));
    if (thumb) {
      const image = document.createElement("img");
      image.src = thumb;
      image.alt = "";
      image.loading = "lazy";
      image.width = 640;
      image.height = 360;
      card.append(image);
    }
    const body = document.createElement("div");
    body.className = "tayori-seminar-card-body";
    const badge = document.createElement("span");
    badge.className = "tayori-seminar-badge" + (past ? " is-past" : "");
    badge.textContent = past ? "開催終了" : "開催予定";
    const date = document.createElement("p");
    date.className = "tayori-seminar-date";
    date.textContent = [seminar.dateLabel || seminar.date, seminar.time].filter(Boolean).join("　");
    const title = document.createElement("h3");
    title.textContent = seminar.title || "セミナー";
    const speaker = document.createElement("p");
    speaker.className = "tayori-seminar-speaker";
    const speakerTypeLabel = seminar.speakerType === "team" ? "ToToNoE+運営メンバー" : seminar.speakerType === "external" ? "外部講師" : "";
    speaker.textContent = "講師：" + (seminar.speakerName || "確認中") + (speakerTypeLabel ? "（" + speakerTypeLabel + "）" : "");
    const price = document.createElement("p");
    price.className = "tayori-seminar-price";
    price.textContent = paid ? "一般参加費：" + seminar.price : "参加費：無料";
    body.append(badge, date, title, speaker, price);
    if (paid) {
      const condition = document.createElement("p");
      condition.className = "tayori-seminar-condition";
      condition.textContent = seminar.speakerType === "team" ? "TAYORI会員：追加料金なし" : seminar.speakerType === "external" ? "TAYORI会員：別途料金 ／ IROHA会員：追加料金なし" : "会員向け参加条件を確認中";
      body.append(condition);
    }
    const url = safeSeminarUrl(paid ? seminar.memberRegistrationUrl : seminar.url);
    if (url) {
      const link = document.createElement("a");
      link.className = "secondary-button";
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = paid ? "会員向け申込ページへ" : past ? "開催ページを見る" : "詳細・申込を見る";
      body.append(link);
    } else if (paid && !past) {
      const note = document.createElement("p");
      note.className = "tayori-seminar-condition";
      note.textContent = "会員向け申込方法は、運営からご案内します。";
      body.append(note);
    }
    card.append(body);
    return card;
  }

  function renderSeminars() {
    const seminars = Array.isArray(window.TOTONOE_SEMINARS) ? window.TOTONOE_SEMINARS : [];
    const statusWrap = document.querySelector("#seminarStatusFilters");
    const tagWrap = document.querySelector("#seminarTagFilters");
    const tags = [...new Set(seminars.flatMap((seminar) => Array.isArray(seminar.tags) ? seminar.tags : []))].sort((a, b) => String(a).localeCompare(String(b), "ja"));
    if (seminarTagFilter !== "all" && !tags.includes(seminarTagFilter)) seminarTagFilter = "all";
    statusWrap.replaceChildren(...[["all", "すべて"], ["upcoming", "開催予定"], ["past", "開催終了"]].map(([value, label]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.setAttribute("aria-pressed", String(seminarStatusFilter === value));
      button.addEventListener("click", () => { seminarStatusFilter = value; renderSeminars(); });
      return button;
    }));
    tagWrap.replaceChildren(...[["all", "すべて"], ...tags.map((tag) => [tag, tag])].map(([value, label]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.setAttribute("aria-pressed", String(seminarTagFilter === value));
      button.addEventListener("click", () => { seminarTagFilter = value; renderSeminars(); });
      return button;
    }));
    const sorted = seminars.filter((seminar) => {
      if (seminarStatusFilter === "upcoming" && seminarHasEnded(seminar)) return false;
      if (seminarStatusFilter === "past" && !seminarHasEnded(seminar)) return false;
      return seminarTagFilter === "all" || (Array.isArray(seminar.tags) && seminar.tags.includes(seminarTagFilter));
    }).sort((a, b) => {
      const pastDifference = Number(seminarHasEnded(a)) - Number(seminarHasEnded(b));
      return pastDifference || (seminarHasEnded(a) ? String(b.date).localeCompare(String(a.date)) : String(a.date).localeCompare(String(b.date)));
    });
    const free = sorted.filter((seminar) => seminar.price === "無料");
    const paid = sorted.filter((seminar) => seminar.price && seminar.price !== "無料");
    document.querySelector("#tayoriFreeSeminars")?.replaceChildren(...free.map(seminarCard));
    document.querySelector("#tayoriPaidSeminars")?.replaceChildren(...paid.map(seminarCard));
    const filtered = seminarStatusFilter !== "all" || seminarTagFilter !== "all";
    const freeEmpty = document.querySelector("#tayoriFreeEmpty");
    const paidEmpty = document.querySelector("#tayoriPaidEmpty");
    freeEmpty.hidden = free.length > 0;
    paidEmpty.hidden = paid.length > 0;
    freeEmpty.textContent = filtered ? "この条件に合う無料セミナーはありません。" : "現在ご案内できる無料セミナーはありません。";
    paidEmpty.textContent = filtered ? "この条件に合う有料セミナーはありません。" : "現在ご案内できる有料セミナーはありません。公開され次第、参加条件とともにここへ掲載します。";
  }

  function showMember(member, rows, preview = false) {
    const seenNames = new Set();
    materials = rows.slice()
      .sort((a, b) => new Date(b.published_at || 0) - new Date(a.published_at || 0))
      .filter((row) => {
        const name = String(row.file_name || "").toLowerCase();
        if (seenNames.has(name)) return false;
        seenNames.add(name);
        return true;
      });
    elements.loading.hidden = true;
    elements.blocked.hidden = true;
    elements.content.hidden = false;
    elements.preview.hidden = !preview;
    elements.status.className = "member-status is-active";
    elements.status.innerHTML = '<span class="status-dot" aria-hidden="true"></span><div><strong>' +
      (member?.staff_access ? "運営メンバー" : member?.has_curriculum_access ? "IROHA会員" : "TAYORI会員") + '</strong><small>' +
      (member?.current_period_end ? formatDate(member.current_period_end) + "まで有効" : "有効な会員です") + "</small></div>";
    updateCurriculumNavigation(Boolean(member?.has_curriculum_access));
    renderLatest();
    renderGrid();
    renderSeminars();
    loadPriorityQuestion();
    loadAnswerVideos();
    renderView();
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
    const start = new Date(weekStart + 'T00:00:00Z');
    const end = new Date(start); end.setUTCDate(start.getUTCDate() + 6);
    const label = date => date.getUTCFullYear() + '年' + (date.getUTCMonth() + 1) + '月' + date.getUTCDate() + '日';
    return label(start) + '（日）〜' + label(end) + '（土）';
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
    questionSubmissionOpen = typeof payload?.submission_open === 'boolean' ? payload.submission_open : true;
    const weekLabel = weekRangeLabel(payload?.week_start || localWeekStart());
    elements.questionWeekRange.textContent = weekLabel;
    elements.questionFormWeekRange.textContent = weekLabel;
    if (!currentQuestion) {
      elements.questionSlotBadge.textContent = questionSubmissionOpen ? "送信できます" : "受付時間外";
      elements.questionSlotBadge.className = "is-available";
      elements.questionStatus.textContent = questionSubmissionOpen ? "曜日を問わず、今週の質問を1枠送れます（日曜〜土曜・日本時間）。" : "受付状態を確認できません。ページを再読み込みしてください。";
      elements.questionToggleText.textContent = questionSubmissionOpen ? "質問を整理して送る" : "受付期間を確認";
      if (elements.questionComposer.open) {
        const locked = !questionSubmissionOpen || (currentQuestion && currentQuestion.status !== 'submitted');
        elements.questionForm.querySelectorAll('input, textarea, select').forEach(field => { field.disabled = Boolean(locked); });
        elements.questionForm.querySelector('button[type="submit"]').hidden = Boolean(locked);
      }
      return;
    }
    if (!questionSubmissionOpen) elements.questionStatus.textContent = "受付時間外です。送信済みの内容は確認できます。";
    const labels = { submitted: "受付済み", in_review: "回答準備中", answered: "回答済み", closed: "受付終了" };
    elements.questionSlotBadge.textContent = labels[currentQuestion.status] || "受付済み";
    elements.questionSlotBadge.className = "is-used";
    elements.questionStatus.textContent = (questionSubmissionOpen ? "今週の1枠は利用済みです。" : "受付時間外です。送信済みの内容は確認できます。") + (questionSubmissionOpen && currentQuestion.status === "submitted" ? "回答準備に入るまでは同じ質問を更新できます。" : "送信内容を確認できます。");
    elements.questionToggleText.textContent = questionSubmissionOpen && currentQuestion.status === "submitted" ? "質問を確認・更新" : "送信内容を確認";
    if (!elements.questionComposer.open) fillQuestionForm(currentQuestion);
    if (elements.questionComposer.open) {
        const locked = !questionSubmissionOpen || (currentQuestion && currentQuestion.status !== 'submitted');
        elements.questionForm.querySelectorAll('input, textarea, select').forEach(field => { field.disabled = Boolean(locked); });
        elements.questionForm.querySelector('button[type="submit"]').hidden = Boolean(locked);
      }
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

  function prepareQuestionPanel() {
    if (!elements.questionComposer.open) return;
    elements.questionError.textContent = "";

    const locked = !questionSubmissionOpen || (currentQuestion && currentQuestion.status !== "submitted");
    elements.questionForm.querySelectorAll("input, textarea, select").forEach((field) => { field.disabled = Boolean(locked); });
    elements.questionForm.querySelector('button[type="submit"]').hidden = Boolean(locked);
    elements.closeQuestionPanel.textContent = locked ? "閉じる" : "あとで入力する";
    openQuestionStep(1);
  }

  function closeQuestionPanel() {
    elements.questionComposer.open = false;
    elements.questionToggle.focus();
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
    if (!questionSubmissionOpen) {
      elements.questionError.textContent = "受付状態を再確認しています。";
      loadPriorityQuestion(); return;
    }
    const invalid = [...elements.questionForm.querySelectorAll("input, textarea, select")].find((field) => !field.disabled && !field.checkValidity());
    if (invalid) {
      const step = invalid.closest(".question-step");
      if (step) openQuestionStep(step.dataset.questionStep);
      invalid.reportValidity();
      return;
    }
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
      closeQuestionPanel();
      elements.questionStatus.textContent = "今週の優先質問を受け付けました。類似質問とまとめ、TAYORI会員全員が見られる回答動画として扱います。回答準備に入るまでは同じ質問を更新できます。";
    } catch (error) {
      elements.questionError.textContent = error.message;
    } finally {
      button.disabled = false;
      button.textContent = currentQuestion ? "今週の質問を更新" : "今週の質問として送る";
    }
  }

  const sampleAnswerVideos = [
    { category: "AI活用", question_topics: ["忙しい現場でAIを試すなら、どの仕事から始める？"], title: "小さく始めるAI活用の選び方", description: "最初の一歩を決めるための考え方を紹介する想定です。" },
    { category: "情報管理", question_topics: ["個人情報を入力せずに、AIで申し送りを要約するには？"], title: "安全に要約するための準備", description: "入力前に確認する項目を整理する想定です。" },
    { category: "資料づくり", question_topics: ["会議メモから議事録を作るとき、まず何を決めればいい？"], title: "議事録づくりの手順", description: "目的と残す情報を決める流れを示す想定です。" },
  ];

  function answerCategory(video) {
    if (video.category) return video.category;
    const text = [video.title, ...(video.question_topics || [])].join(" ");
    if (/個人情報|安全|情報管理|権限/.test(text)) return "情報管理";
    if (/議事録|資料|文章|要約/.test(text)) return "資料づくり";
    if (/AI|ChatGPT|生成AI/i.test(text)) return "AI活用";
    return "その他";
  }

  function applyAnswerFilter() {
    document.querySelectorAll("#answerCategoryFilters button").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.category === answerCategoryFilter)));
    document.querySelectorAll("#answerVideoList .answer-video-row, #answerSampleList .answer-video-row").forEach((card) => {
      card.hidden = answerCategoryFilter !== "all" && card.dataset.category !== answerCategoryFilter;
      if (card.hidden) card.querySelector("video")?.pause();
    });
    const visibleReal = document.querySelectorAll("#answerVideoList .answer-video-row:not([hidden])").length;
    elements.answerVideoEmpty.hidden = visibleReal > 0;
    elements.answerVideoEmpty.querySelector("p").textContent = answerCategoryFilter === "all"
      ? "類似質問をまとめた回答動画が公開されると、TAYORI会員全員がここから確認できます。"
      : "このテーマの公開済み回答動画はまだありません。";
  }

  function renderAnswerFilters() {
    const wrap = document.querySelector("#answerCategoryFilters");
    wrap.replaceChildren(...[["all", "すべて"], ["AI活用", "AI活用"], ["情報管理", "情報管理"], ["資料づくり", "資料づくり"], ["その他", "その他"]].map(([value, label]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.category = value;
      button.textContent = label;
      button.addEventListener("click", () => { answerCategoryFilter = value; applyAnswerFilter(); });
      return button;
    }));
    applyAnswerFilter();
  }

  function answerVideoCard(video, playback, sample = false) {
    const article = document.createElement("article");
    article.className = "answer-video-row" + (sample ? " is-sample" : "");
    article.dataset.category = answerCategory(video);
    const topics = Array.isArray(video.question_topics) ? video.question_topics.filter((topic) => typeof topic === "string" && topic.trim()) : [];
    const thumbnail = document.createElement("div");
    thumbnail.className = "answer-question-thumb";
    const eyebrow = document.createElement("small");
    eyebrow.textContent = sample ? "みなさまからの質問（サンプル）" : "みなさまからの質問";
    const question = document.createElement("strong");
    question.textContent = topics[0] || "質問テーマの公開準備中です";
    thumbnail.append(eyebrow, question);
    const body = document.createElement("div");
    body.className = "answer-video-card-body";
    const meta = document.createElement("span");
    meta.className = "answer-video-meta";
    meta.textContent = sample ? "架空のサンプル ・ " + video.category : formatDate(video.published_at) + " ・ " + answerCategory(video);
    const title = document.createElement("h3");
    title.textContent = video.title || "TAYORI回答動画";
    const summary = document.createElement("p");
    summary.textContent = video.description || "類似する優先質問をまとめた、会員共通の回答動画です。";
    body.append(meta, title, summary);
    if (topics.length > 1) {
      const extra = document.createElement("p");
      extra.textContent = "ほかの質問：" + topics.slice(1).join("／");
      body.append(extra);
    }
    const playButton = document.createElement("button");
    playButton.type = "button";
    playButton.disabled = true;
    playButton.textContent = sample ? "画面サンプル" : "再生準備中";
    if (!sample && playback === "secure_proxy" && video.playback_url) {
      playButton.disabled = false;
      playButton.textContent = "回答動画を再生";
      playButton.addEventListener("click", () => {
        const currentPlayer = article.querySelector("video");
        if (currentPlayer) {
          currentPlayer.pause();
          currentPlayer.removeAttribute("src");
          currentPlayer.load();
          currentPlayer.remove();
          playButton.textContent = "回答動画を再生";
          return;
        }
        const player = document.createElement("video");
        player.className = "answer-video-player";
        player.controls = true;
        player.playsInline = true;
        player.preload = "metadata";
        player.src = video.playback_url;
        player.setAttribute("aria-label", (video.title || "TAYORI回答動画") + "を再生");
        body.append(player);
        playButton.textContent = "閉じる";
        player.play().catch(() => {});
      });
    }
    body.append(playButton);
    article.append(thumbnail, body);
    return article;
  }

  function renderAnswerVideos(videos, playback) {
    elements.answerVideoList.replaceChildren(...videos.map((video) => answerVideoCard(video, playback)));
    elements.answerVideoEmpty.hidden = videos.length > 0;
    document.querySelector("#answerSampleList").replaceChildren(...sampleAnswerVideos.map((video) => answerVideoCard(video, "", true)));
    renderAnswerFilters();
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
  document.querySelectorAll('[data-tayori-tab], .tayori-next-links a, .guide-links a[href^="?view="], .guide-contact-note a[href^="?view="]').forEach((link) => link.addEventListener("click", (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    navigateView(new URL(link.href).searchParams.get("view") || "home");
  }));
  window.addEventListener("popstate", renderView);
  document.addEventListener("visibilitychange", () => { if (!document.hidden && !elements.content.hidden) loadPriorityQuestion(); });
  setInterval(() => { if (!document.hidden && !elements.content.hidden) loadPriorityQuestion(); }, 60000);
  window.addEventListener("totonoe:seminars-updated", () => {
    if (!elements.content.hidden) renderSeminars();
  });
  elements.questionComposer.addEventListener("toggle", prepareQuestionPanel);
  elements.closeQuestionPanel.addEventListener("click", closeQuestionPanel);
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
  const initialWeekLabel = weekRangeLabel(localWeekStart());
  elements.questionWeekRange.textContent = initialWeekLabel;
  elements.questionFormWeekRange.textContent = initialWeekLabel;
  load();
})();
