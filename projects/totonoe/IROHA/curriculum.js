(() => {
  "use strict";

  const config = window.TOTONOE_CURRICULUM;
  const yen = new Intl.NumberFormat("ja-JP");
  const storageKey = "totonoe-curriculum-preview-v1";
  const lessons = [
    "ChatGPTとは何か",
    "安全に使うための基本",
    "良いプロンプトの考え方",
    "プロンプトを仕事の型にする",
    "議事録・記録の作成を効率化する",
    "利用者・家族への説明文を作る",
    "多職種連携での活用",
  ];

  function showToast(message) {
    const toast = document.querySelector("#toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("is-visible");
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => toast.classList.remove("is-visible"), 2600);
  }

  function getSunday(date) {
    const start = new Date(date);
    start.setHours(12, 0, 0, 0);
    start.setDate(start.getDate() - start.getDay());
    return start;
  }

  function formatDate(date) {
    return `${date.getMonth() + 1}/${date.getDate()}`;
  }

  function formatISODate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return year + "-" + month + "-" + day;
  }

  function getCurrentDate() {
    const current = new Date();
    const localHosts = ["127.0.0.1", "localhost"];
    const previewDate = new URLSearchParams(window.location.search).get("previewDate");
    if (!localHosts.includes(window.location.hostname) || !/^\d{4}-\d{2}-\d{2}$/.test(previewDate || "")) return current;
    const candidate = new Date(previewDate + "T12:00:00");
    return Number.isNaN(candidate.getTime()) ? current : candidate;
  }

  function sameDate(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function loadState() {
    const fallback = { plannedDays: [1, 4, 5], weeklyMinutes: 60, dailyMinutes: 20, completedDays: [], nextWeekPlan: null };
    try {
      return { ...fallback, ...JSON.parse(localStorage.getItem(storageKey) || "{}") };
    } catch {
      return fallback;
    }
  }

  function saveState(state) {
    localStorage.setItem(storageKey, JSON.stringify(state));
  }

  function setupPricing() {
    const panel = document.querySelector(".price-panel");
    if (!panel || !config) return;

    let billing = "monthly";
    let audience = "therapist";

    function apiErrorMessage(code) {
      const messages = {
        invalid_email: "メールアドレスの形式をご確認ください。",
        too_many_requests: "短時間に送信回数が上限に達しました。10分ほど待ってからお試しください。",
        auth_email_delivery_failed: "認証メールを送信できませんでした。時間をおいて再度お試しください。",
        invalid_auth_code: "認証コードが一致しません。",
        auth_code_expired: "認証コードの有効期限が切れました。もう一度送信してください。",
        therapist_verification_required: "セラピスト料金の利用には資格確認が必要です。先に資格確認をお申し込みください。",
        qualification_already_pending: "資格確認はすでに審査中です。",
        qualification_already_verified: "資格確認は完了しています。",
        file_required: "資格証明画像を選択してください。",
        profession_required: "資格・職種を選択してください。",
        applicant_name_required: "資格証明書に記載された氏名を入力してください。",
        privacy_consent_required: "資格画像の利用目的と削除方針への同意が必要です。",
        unsupported_image_type: "JPEG・PNG・WebP・GIF形式の画像を選択してください。",
        invalid_image_content: "画像ファイルを確認できませんでした。別の画像を選択してください。",
        image_too_large: "画像は2MB以内にしてください。",
        subscription_already_exists: "このメールアドレスには利用中の契約があります。マイページからご確認ください。",
        tayori_included_in_iroha: "TAYORIはIROHAに含まれているため、追加契約は不要です。",
        stripe_checkout_not_enabled: "現在は決済機能の最終準備中です。受付開始までしばらくお待ちください。",
      };
      return messages[code] || "処理を完了できませんでした。時間をおいて再度お試しください。";
    }

    async function api(path, options = {}) {
      const isFormData = options.body instanceof FormData;
      const response = await fetch(`${config.apiBase}${path}`, {
        credentials: "same-origin",
        ...options,
        headers: { ...(isFormData ? {} : { "content-type": "application/json" }), ...(options.headers || {}) },
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw Object.assign(new Error(apiErrorMessage(result.error)), { code: result.error, status: response.status });
      return result;
    }

    function update() {
      const recurring = config.plans.curriculum.monthly;
      document.querySelector("#priceAudienceLabel").textContent = "職種共通プラン";
      document.querySelector("#priceOriginal").textContent = "0";
      document.querySelector("#priceDiscount").textContent = "";
      document.querySelector("#campaignPrice").hidden = true;
      document.querySelector("#specialPriceLabel").hidden = true;
      document.querySelector("#priceTotal").textContent = "0";
      document.querySelector("#recurringPrice").textContent = yen.format(recurring);
      document.querySelector("#recurringUnit").textContent = "円／月（税込）";
      document.querySelector("#entryFeeNote").textContent = "入会費・再入会費はかかりません";
      document.querySelector("#subscriptionStartNote").textContent = "初回は30日間無料";
      document.querySelector("#priceBreakdown").innerHTML = `<strong>月額${yen.format(recurring)}円（税込）のみ。</strong>入会費・再入会費はかかりません。初回の無料期間終了後から月額料金が始まります。`;
      document.querySelectorAll("[data-billing]").forEach((button) => {
        button.hidden = button.dataset.billing !== "monthly";
        const active = button.dataset.billing === "monthly";
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", String(active));
      });
      document.querySelectorAll("[data-audience]").forEach((button) => {
        const active = button.dataset.audience === audience;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", String(active));
      });
    }

    document.querySelectorAll("[data-billing]").forEach((button) => button.addEventListener("click", () => {
      billing = "monthly";
      update();
    }));
    document.querySelectorAll("[data-audience]").forEach((button) => button.addEventListener("click", () => {
      audience = button.dataset.audience;
      update();
    }));

    const dialog = document.querySelector("#checkoutPreview");
    const emailForm = document.querySelector("#emailAuthForm");
    const codeForm = document.querySelector("#codeAuthForm");
    const qualificationForm = document.querySelector("#qualificationForm");
    const qualificationPending = document.querySelector("#qualificationPending");
    const error = document.querySelector("#authError");
    let verifiedEmail = "";
    let checkoutRequestId = "";

    function setAuthStep(step) {
      emailForm.hidden = step !== "email";
      codeForm.hidden = step !== "code";
      qualificationForm.hidden = step !== "qualification";
      qualificationPending.hidden = step !== "pending";
      error.textContent = "";
      window.setTimeout(() => {
        if (step === "email") emailForm.elements.email.focus();
        if (step === "code") codeForm.elements.code.focus();
        if (step === "qualification") qualificationForm.elements.profession.focus();
      }, 20);
    }

    function setBusy(form, busy) {
      form.querySelectorAll("button, input, select").forEach((element) => { element.disabled = busy; });
    }

    document.querySelector("[data-preview-action]")?.addEventListener("click", () => {
      if (!config.purchaseEnabled) return;
      const type = audience === "therapist" ? "セラピスト" : "一般";
      const period = "月額2,980円";
      const campaignApplies = Boolean(config.campaign) && billing === config.campaign.plan && audience === config.campaign.audience;
      const campaignText = "・入会費・再入会費なし";
      document.querySelector("#checkoutSummary").textContent = `${type}・${period}${campaignText}のお申し込みです。`;
      checkoutRequestId = crypto.randomUUID();
      setAuthStep("email");
      dialog?.showModal();
    });
    document.querySelectorAll("[data-dialog-close]").forEach((button) => button.addEventListener("click", () => dialog?.close()));
    document.querySelector("[data-auth-back]")?.addEventListener("click", () => setAuthStep("email"));

    emailForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      error.textContent = "";
      setBusy(emailForm, true);
      try {
        verifiedEmail = emailForm.elements.email.value.trim();
        const result = await api("/api/customer/auth/request-code", {
          method: "POST",
          body: JSON.stringify({ email: verifiedEmail }),
        });
        setAuthStep("code");
        if (result.dev_code && ["localhost", "127.0.0.1"].includes(window.location.hostname)) {
          codeForm.elements.code.value = result.dev_code;
        }
      } catch (apiError) {
        error.textContent = apiError.message;
      } finally {
        setBusy(emailForm, false);
      }
    });

    codeForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      error.textContent = "";
      setBusy(codeForm, true);
      try {
        await api("/api/customer/auth/verify-code", {
          method: "POST",
          body: JSON.stringify({ email: verifiedEmail, code: codeForm.elements.code.value }),
        });
        if (audience === "therapist") {
          const qualification = await api("/api/customer/qualification", { method: "GET" });
          if (qualification.therapist_status !== "verified") {
            if (qualification.display_name) qualificationForm.elements.applicant_name.value = qualification.display_name;
            setAuthStep(qualification.therapist_status === "pending" ? "pending" : "qualification");
            return;
          }
        }
        const checkout = await api("/api/customer/billing/checkout", {
          method: "POST",
          body: JSON.stringify({
            request_id: checkoutRequestId,
            plan_code: "curriculum_monthly",
            audience_type: audience,
          }),
        });
        window.location.assign(checkout.checkout_url);
      } catch (apiError) {
        error.textContent = apiError.message;
      } finally {
        setBusy(codeForm, false);
      }
    });

    qualificationForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      error.textContent = "";
      setBusy(qualificationForm, true);
      try {
        const form = new FormData(qualificationForm);
        await api("/api/customer/qualification", { method: "POST", body: form });
        qualificationForm.reset();
        setAuthStep("pending");
      } catch (apiError) {
        error.textContent = apiError.message;
      } finally {
        setBusy(qualificationForm, false);
      }
    });
    update();
  }

  async function setupDashboard() {
    const weekDays = document.querySelector("#weekDays");
    if (!weekDays) return;
    if(window.TOTONOE_DELIVERY) {
      const result=await window.TOTONOE_DELIVERY.ready;
      if(result?.error) {
        const message=document.createElement('p');message.textContent='教材と履歴を読み込めませんでした。ログイン状態と通信を確認して再読み込みしてください。';
        document.querySelector('#irohaCurrentLearningList')?.replaceChildren(message);
        return;
      }
      if(result?.staffAccess) {
        const link=document.createElement('a');link.href='lesson.html?preview=claude';link.textContent='運営専用：動画・メモの接続確認';link.className='lesson-notes-history-link';
        document.querySelector('#irohaNotesPanel')?.append(link);
      }
    }

    const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
    const now = getCurrentDate();
    const sunday = getSunday(now);
    const saturday = new Date(sunday);
    saturday.setDate(sunday.getDate() + 6);
    const nextSunday = new Date(sunday);
    nextSunday.setDate(sunday.getDate() + 7);
    const currentWeekKey = formatISODate(sunday);
    const nextWeekKey = formatISODate(nextSunday);
    const previousSunday = new Date(sunday);
    previousSunday.setDate(sunday.getDate() - 7);
    const previousWeekKey = formatISODate(previousSunday);
    const state = loadState();

    const viewMeta = {
      progress: ["学習管理", "目標・学習計画・振り返りを、無理のないペースで。"],
      goals: ["目標設定", "今週の小さな一歩と、取り組む理由を決めましょう。"],
      curriculum: ["カリキュラムを探す", "学びたい分野から講座を選びましょう。"],
      history: ["学習履歴", "修了バッジとカリキュラムの修了証を確認できます。"],
      seminars: ["セミナー", "開催情報とIROHA会員向けの参加条件を確認できます。"],
    };
    function currentView() {
      const requested = new URLSearchParams(location.search).get("view") || "curriculum";
      if (requested === "plan") return "progress";
      return Object.hasOwn(viewMeta, requested) ? requested : "curriculum";
    }
    function renderView() {
      const view = currentView();
      const banner = document.querySelector("#irohaWorldBanner");
      if (banner) banner.src = "../assets/member-banner-" + ({progress:"management",goals:"goals",seminars:"seminars"}[view] || view) + (["goals", "curriculum"].includes(view) ? "-v3.webp" : "-v2.webp");
      document.querySelector(".iroha-banner-hero")?.setAttribute("data-view", view);
      document.querySelectorAll("[data-iroha-view]").forEach((section) => { section.hidden = section.dataset.irohaView !== view; });
      document.querySelectorAll("[data-iroha-view-link]").forEach((link) => {
        const active = link.dataset.irohaViewLink === view;
        link.classList.toggle("is-active", active);
        if (active) link.setAttribute("aria-current", "page"); else link.removeAttribute("aria-current");
      });
      document.querySelector("#irohaViewTitle").textContent = viewMeta[view][0];
      document.title = viewMeta[view][0] + "｜ToToNoE+ IROHA";
      window.dispatchEvent(new CustomEvent('totonoe:iroha-view', { detail:view }));
      if (view === "history") renderAchievements();
      if (view === "seminars") renderSeminars();
    }
    function safeSeminarUrl(value) {
      if (!value) return "";
      try {
        const url = new URL(value, location.href);
        return ["https:", "http:"].includes(url.protocol) ? url.href : "";
      } catch { return ""; }
    }
    function safeSeminarImageUrl(value) {
      if (!value) return "";
      try {
        const url = new URL(value, new URL("../", location.href));
        return ["https:", "http:", ...(location.protocol === "file:" ? ["file:"] : [])].includes(url.protocol) ? url.href : "";
      } catch { return ""; }
    }
    let seminarStatusFilter = "all";
    let seminarTagFilter = "all";
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
      condition.textContent = ["team", "external"].includes(seminar.speakerType) ? "IROHA会員：追加料金なし" : "会員向け参加条件を確認中";
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

    window.addEventListener("totonoe:seminars-updated", () => {
      if (currentView() === "seminars") renderSeminars();
    });
    function renderAchievements() {
      const store = window.TOTONOE_CURRICULUM_STORE;
      if (!store) return;
      const learner = store.readLearnerState();
      const admin = store.readAdminState();
      const model = store.buildAchievementModel(admin, learner);
      if (JSON.stringify(learner.certificates || {}) !== JSON.stringify(model.certificateState)) {
        learner.certificates = model.certificateState;
        store.writeLearnerState(learner);
      }
      const dateLabel = (value) => value && !Number.isNaN(Date.parse(value)) ? new Date(value).toLocaleDateString("ja-JP") : "記録日未設定";
      const badgeArtwork = (categoryId) => {
        const visual = store.badgeVisualForCategory(categoryId);
        const emblem = document.createElement("span");
        emblem.className = "iroha-badge-emblem";
        emblem.dataset.category = visual.categoryId;
        const artwork = document.createElement("img");
        artwork.className = "iroha-badge-artwork";
        artwork.src = visual.artwork;
        artwork.alt = "";
        artwork.width = 512;
        artwork.height = 512;
        artwork.loading = "lazy";
        emblem.append(artwork);
        return emblem;
      };
      const appendBadge = (root, categoryId, heading, detail, { status = "", isCertificate = false } = {}) => {
        const card = document.createElement("article");
        card.className = `iroha-badge-card${status ? ` is-${status}` : ""}${isCertificate ? " is-certificate" : ""}`;
        const title = document.createElement("strong");
        title.textContent = heading;
        const meta = document.createElement("small");
        meta.textContent = detail;
        card.append(badgeArtwork(categoryId));
        if (status) {
          const state = document.createElement("span");
          state.className = "iroha-badge-state";
          const icon = document.createElement("span");
          icon.className = "material-symbols-rounded";
          icon.setAttribute("aria-hidden", "true");
          icon.textContent = status === "earned" ? "check_circle" : "lock";
          state.append(icon, document.createTextNode(status === "earned" ? "取得済み" : status === "locked" ? "未取得" : "教材準備中"));
          card.append(state);
        }
        card.append(title, meta);
        root.append(card);
      };
      const badgeRoot = document.querySelector("#irohaBadgeList");
      const collectionRoot = document.querySelector("#irohaBadgeCollectionList");
      const certificateRoot = document.querySelector("#irohaCertificateList");
      badgeRoot.replaceChildren();
      collectionRoot.replaceChildren();
      certificateRoot.replaceChildren();
      store.categories.forEach((category) => {
        const completedCount = model.badges.filter((badge) => badge.categoryId === category.id).length;
        const hasPublishedLesson = admin.lessons.some((lesson) => store.isPublishedLesson(lesson) && store.lessonCategoryId(lesson) === category.id);
        const status = completedCount ? "earned" : hasPublishedLesson ? "locked" : "unavailable";
        const detail = completedCount ? `${completedCount}件のレッスンを修了` : hasPublishedLesson ? "公開レッスンの修了で解放" : "公開教材の準備中";
        appendBadge(collectionRoot, category.id, category.label, detail, { status });
      });
      model.badges.forEach((item) => appendBadge(badgeRoot, item.categoryId, item.title, `${item.tool} ・ ${dateLabel(item.completedAt)} 修了`));
      model.certificates.forEach((item) => appendBadge(certificateRoot, item.key.split(":")[0], `${item.title || item.tool} カリキュラム修了証`, `${dateLabel(item.issuedAt)} 取得 ・ プレビュー`, { isCertificate: true }));
      document.querySelector("#irohaBadgeCount").textContent = String(model.badges.length);
      document.querySelector("#irohaCertificateCount").textContent = String(model.certificates.length);
      document.querySelector("#irohaBadgeEmpty").hidden = model.badges.length > 0;
      document.querySelector("#irohaCertificateEmpty").hidden = model.certificates.length > 0;
    }
    document.querySelectorAll("[data-iroha-view-link]").forEach((link) => link.addEventListener("click", (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
      event.preventDefault();
      const url = new URL(link.href);
      if (url.search !== location.search) history.pushState({}, "", url);
      renderView();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }));
    window.addEventListener("popstate", renderView);
    renderView();

    state.studySessions = Array.isArray(state.studySessions) ? state.studySessions : [];
    state.learningLogs = Array.isArray(state.learningLogs) ? state.learningLogs : [];
    state.learningGoals = state.learningGoals && typeof state.learningGoals === "object" ? state.learningGoals : {};
    state.weeklyReviews = state.weeklyReviews && typeof state.weeklyReviews === "object" ? state.weeklyReviews : {};
    state.weeklyReflections = state.weeklyReflections && typeof state.weeklyReflections === "object" ? state.weeklyReflections : {};

    state.studySessions.forEach((session, index) => {
      if (!session.id) session.id = (state.progressWeekStart || currentWeekKey) + "-legacy-" + index + "-" + session.date;
      if (!state.learningLogs.some((log) => log.id === session.id)) {
        state.learningLogs.push({ ...session, weekStart: state.progressWeekStart || currentWeekKey });
      }
    });
    if (state.progressWeekStart !== currentWeekKey) {
      state.progressWeekStart = currentWeekKey;
      state.studySessions = [];
      state.weeklyCompletedMinutes = 0;
    }
    saveState(state);

    const previewParams = new URLSearchParams(window.location.search);
    const localPreview = ["127.0.0.1", "localhost"].includes(window.location.hostname);
    const previewGoal = Number(previewParams.get("previewGoal"));
    const previewCompleted = Number(previewParams.get("previewCompleted"));
    if (localPreview && previewGoal > 0 && previewCompleted >= 0) {
      state.weeklyMinutes = Math.round(previewGoal);
      state.studySessions = previewCompleted > 0
        ? [{ id: "progress-preview", date: currentWeekKey, minutes: Math.round(previewCompleted), preview: true }]
        : [];
    }

    function formatDuration(totalMinutes) {
      const safeMinutes = Math.max(0, Number(totalMinutes) || 0);
      const hours = Math.floor(safeMinutes / 60);
      const minutes = safeMinutes % 60;
      if (!hours) return minutes + "分";
      if (!minutes) return hours + "時間";
      return hours + "時間" + minutes + "分";
    }

    function readDuration(form, prefix) {
      return (Number(form.elements[prefix + "Hours"]?.value) || 0) * 60
        + (Number(form.elements[prefix + "MinutePart"]?.value) || 0);
    }

    function updateDurationOutput(form, prefix) {
      const hours = Number(form.elements[prefix + "Hours"]?.value) || 0;
      const minutes = Number(form.elements[prefix + "MinutePart"]?.value) || 0;
      const hoursValue = document.querySelector("#" + prefix + "HoursValue");
      const minuteValue = document.querySelector("#" + prefix + "MinutePartValue");
      const output = document.querySelector("#" + prefix + "DurationOutput");
      if (hoursValue) hoursValue.textContent = String(hours);
      if (minuteValue) minuteValue.textContent = String(minutes);
      if (output) output.textContent = formatDuration(hours * 60 + minutes);
    }

    function setDuration(form, prefix, totalMinutes) {
      const safeMinutes = Math.max(0, Number(totalMinutes) || 0);
      const hoursInput = form.elements[prefix + "Hours"];
      const minuteInput = form.elements[prefix + "MinutePart"];
      if (!hoursInput || !minuteInput) return;
      hoursInput.value = String(Math.min(Number(hoursInput.max), Math.floor(safeMinutes / 60)));
      minuteInput.value = String(safeMinutes % 60);
      updateDurationOutput(form, prefix);
    }

    function bindDurationPicker(form, prefix) {
      [form.elements[prefix + "Hours"], form.elements[prefix + "MinutePart"]].forEach((input) => {
        input?.addEventListener("input", () => updateDurationOutput(form, prefix));
      });
      updateDurationOutput(form, prefix);
    }

    function renderWeek() {
      document.querySelector("#weekRange").textContent = `${sunday.getFullYear()}年${sunday.getMonth() + 1}月${sunday.getDate()}日（日）〜${saturday.getMonth() + 1}月${saturday.getDate()}日（土）`;
      weekDays.replaceChildren();
      weekdays.forEach((weekday, index) => {
        const date = new Date(sunday);
        date.setDate(sunday.getDate() + index);
        const plannedIndex = state.plannedDays.indexOf(index);
        const li = document.createElement("li");
        const planned = plannedIndex >= 0;
        li.classList.toggle("is-planned", planned);
        li.classList.toggle("is-complete", state.completedDays.includes(index));
        li.classList.toggle("is-today", sameDate(date, now));
        const lessonName = planned ? lessons[Math.min(plannedIndex + 1, lessons.length - 1)] : "予定なし";
        const plannedMinutes = Number(state.dayAllocations?.[index]) || state.dailyMinutes;
        li.innerHTML = `<time datetime="${date.toISOString().slice(0, 10)}">${formatDate(date)} ${weekday}${sameDate(date, now) ? "・今日" : ""}</time><strong>${lessonName}</strong><small>${planned ? `${formatDuration(plannedMinutes)}予定` : "変更できます"}</small>`;
        weekDays.append(li);
      });
    }

    function renderProgress() {
      const goal = Math.max(1, Number(state.weeklyMinutes) || 60);
      const completed = state.studySessions.reduce((sum, session) => sum + (Number(session.minutes) || 0), 0);
      const model = window.TOTONOE_CURRICULUM_STORE?.buildProgressModel(completed, goal) || {
        goal, completed, exceeded: Math.max(0, completed - goal), scaleMax: Math.max(goal, completed),
        achievementPercent: Math.round((completed / goal) * 100), goalFillPercent: Math.min(100, (completed / goal) * 100),
        bonusLeftPercent: 100, bonusFillPercent: 0, goalMarkerPercent: 100, achieved: completed >= goal, overachieved: completed > goal
      };
      state.weeklyCompletedMinutes = completed;
      const value = document.querySelector("#weeklyProgressValue");
      const bar = document.querySelector("#weeklyProgressBar");
      const note = document.querySelector("#weeklyProgressNote");
      const card = document.querySelector(".weekly-progress-card");
      const badge = document.querySelector("#weeklyAchievementBadge");
      const maxLabel = document.querySelector("#weeklyProgressMax");
      if (value) value.textContent = formatDuration(completed) + " / " + formatDuration(goal);
      if (bar) {
        bar.setAttribute("aria-valuemax", String(model.scaleMax));
        bar.setAttribute("aria-valuenow", String(completed));
        bar.setAttribute("aria-valuetext", model.overachieved
          ? `目標${formatDuration(goal)}に対して${formatDuration(completed)}。${formatDuration(model.exceeded)}上回っています。`
          : `目標${formatDuration(goal)}に対して${formatDuration(completed)}です。`);
        bar.querySelector(".goal-progress-fill").style.width = model.goalFillPercent + "%";
        const bonus = bar.querySelector(".bonus-progress-fill");
        bonus.style.left = model.bonusLeftPercent + "%";
        bonus.style.width = model.bonusFillPercent + "%";
        bar.querySelector(".goal-progress-marker").style.left = model.goalMarkerPercent + "%";
      }
      if (maxLabel) maxLabel.textContent = formatDuration(model.scaleMax);
      if (card) {
        card.classList.toggle("is-achieved", model.achieved);
        card.classList.toggle("is-overachieved", model.overachieved);
      }
      if (badge) {
        badge.hidden = !model.achieved;
        badge.querySelector("b").textContent = model.overachieved
          ? `${model.achievementPercent}%・目標より${formatDuration(model.exceeded)}プラス`
          : "100%・目標達成";
      }
      if (note) {
        const remaining = Math.max(0, goal - completed);
        note.textContent = model.overachieved
          ? "目標を" + formatDuration(model.exceeded) + "上回りました。積み重ねた時間を振り返りにも残しましょう。"
          : model.achieved
            ? "今週の目標を達成しました。振り返りで次の一歩を整理しましょう。"
            : "目標まであと" + formatDuration(remaining) + "。短い隙間時間も記録できます。";
      }
      const actualSummary = document.querySelector("#reviewActualSummary");
      if (actualSummary) actualSummary.textContent = "今週の学習実績：" + formatDuration(completed) + "（目標 " + formatDuration(goal) + "）";
      const sessions = document.querySelector("#irohaStudySessions");
      sessions.replaceChildren(...state.studySessions.slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).map((session) => {
        const item = document.createElement("li");
        const date = document.createElement("time");
        date.dateTime = session.date;
        date.textContent = session.date;
        const duration = document.createElement("strong");
        duration.textContent = formatDuration(session.minutes);
        item.append(date, duration);
        return item;
      }));
      document.querySelector("#irohaStudySessionsEmpty").hidden = state.studySessions.length > 0;
    }

    function renderGoalSummary() {
      const currentGoal = state.learningGoals[currentWeekKey]?.goal || state.weeklyReviews[previousWeekKey]?.nextGoal;
      const nextGoal = state.weeklyReviews[currentWeekKey]?.nextGoal;
      document.querySelector("#irohaGoalSummary").textContent = currentGoal
        ? "今週の目標：" + currentGoal + (nextGoal ? "／次週の目標：" + nextGoal : "")
        : nextGoal ? "次週の目標：" + nextGoal : "まだ目標は設定されていません。下の欄から今週の目標を決めましょう。";
      document.querySelector("#irohaTimeGoalSummary").textContent = "今週は合計" + formatDuration(state.weeklyMinutes || 60) + "を、" + state.plannedDays.map((day) => weekdays[day] + "曜日").join("・") + "に予定しています。";
    }
    const goalForm = document.querySelector("#irohaGoalForm");
    goalForm.elements.goal.value = state.learningGoals[currentWeekKey]?.goal || state.weeklyReviews[previousWeekKey]?.nextGoal || "";
    goalForm.elements.reason.value = state.learningGoals[currentWeekKey]?.reason || state.weeklyReviews[previousWeekKey]?.desiredOutcome || "";
    goalForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const goal = goalForm.elements.goal.value.trim();
      if (!goal) return goalForm.elements.goal.reportValidity();
      state.learningGoals[currentWeekKey] = { goal, reason: goalForm.elements.reason.value.trim(), updatedAt: new Date().toISOString() };
      saveState(state);
      renderGoalSummary();
      showToast("今週の目標を保存しました");
    });

    const scheduleDialog = document.querySelector("#scheduleDialog");
    const scheduleForm = document.querySelector("#scheduleForm");
    const choices = document.querySelector("#scheduleChoices");
    const scheduleTitle = document.querySelector("#scheduleTitle");
    const scheduleDescription = document.querySelector("#scheduleDescription");
    const scheduleError = document.querySelector("#scheduleError");
    const nextWeekStatus = document.querySelector("#nextWeekStatus");
    const dailyEstimate = document.querySelector("#dailyEstimate");
    const dayAllocationFields = document.querySelector("#dayAllocationFields");
    const allocationSummary = document.querySelector("#allocationSummary");
    let scheduleMode = "current";
    let scheduleStage = 1;
    let draftWeeklyMinutes = 60;
    let draftAllocations = {};

    weekdays.forEach((weekday, index) => {
      const label = document.createElement("label");
      label.className = "day-choice";
      label.innerHTML = '<input type="checkbox" name="days" value="' + index + '"><span>' + weekday + "</span>";
      choices.append(label);
    });

    bindDurationPicker(scheduleForm, "weekly");

    function hasNextWeekPlan() {
      return state.nextWeekPlan?.weekStart === nextWeekKey;
    }

    function hasCurrentReview() {
      return Boolean(state.weeklyReviews[currentWeekKey]);
    }

    function selectedScheduleDays() {
      return [...scheduleForm.querySelectorAll('input[name="days"]:checked')].map((input) => Number(input.value));
    }

    function evenAllocations(totalMinutes, days) {
      if (!days.length) return {};
      const base = Math.floor(totalMinutes / days.length);
      let remainder = totalMinutes - base * days.length;
      return Object.fromEntries(days.map((day) => {
        const minutes = base + (remainder > 0 ? 1 : 0);
        remainder = Math.max(0, remainder - 1);
        return [day, minutes];
      }));
    }

    function showScheduleStage(stage) {
      scheduleStage = stage;
      scheduleForm.querySelectorAll("[data-schedule-step]").forEach((section) => {
        section.hidden = Number(section.dataset.scheduleStep) !== stage;
      });
      scheduleForm.querySelectorAll("[data-schedule-progress]").forEach((item) => {
        const itemStage = Number(item.dataset.scheduleProgress);
        item.classList.toggle("is-current", itemStage === stage);
        item.classList.toggle("is-complete", itemStage < stage);
      });
      const labels = scheduleMode === "next" ? ["次週の総学習時間", "次週に学ぶ曜日", "曜日ごとの時間配分"] : ["今週の総学習時間", "今週学ぶ曜日", "曜日ごとの時間配分"];
      scheduleTitle.textContent = labels[stage - 1];
      scheduleDescription.textContent = stage === 1
        ? "最初に1週間で確保したい総学習時間を決めます。"
        : stage === 2
          ? "総学習時間は" + formatDuration(draftWeeklyMinutes) + "です。次に取り組む曜日を選びます。"
          : "自動配分をもとに、曜日ごとの学習時間を調整します。";
      scheduleError.textContent = "";
    }

    function updateDailyEstimate() {
      const selected = selectedScheduleDays();
      if (!selected.length) {
        dailyEstimate.textContent = "曜日を選ぶと、1日あたりの目安を表示します。";
        return;
      }
      const average = Math.round(draftWeeklyMinutes / selected.length);
      dailyEstimate.textContent = "合計" + formatDuration(draftWeeklyMinutes) + "を" + selected.length + "日で進める場合、1日あたり約" + formatDuration(average) + "が目安です。曜日ごとの比重は次で変更できます。";
    }

    function readDayAllocations() {
      const allocations = {};
      dayAllocationFields.querySelectorAll("[data-allocation-day]").forEach((row) => {
        const day = Number(row.dataset.allocationDay);
        const hours = Number(row.querySelector('[data-allocation-part="hours"]').value) || 0;
        const minutes = Number(row.querySelector('[data-allocation-part="minutes"]').value) || 0;
        allocations[day] = hours * 60 + minutes;
      });
      return allocations;
    }

    function updateAllocationSummary() {
      draftAllocations = readDayAllocations();
      const allocated = Object.values(draftAllocations).reduce((sum, minutes) => sum + minutes, 0);
      const difference = draftWeeklyMinutes - allocated;
      allocationSummary.classList.toggle("is-short", difference > 0);
      allocationSummary.classList.toggle("is-over", difference < 0);
      allocationSummary.replaceChildren();
      allocationSummary.append(
        Object.assign(document.createElement("span"), { textContent: "配分済み " + formatDuration(allocated) + " / 総時間 " + formatDuration(draftWeeklyMinutes) }),
        Object.assign(document.createElement("strong"), { textContent: difference === 0 ? "配分完了" : difference > 0 ? "あと " + formatDuration(difference) : formatDuration(Math.abs(difference)) + " 超過" }),
      );
    }

    function renderAllocationFields(forceEven = false) {
      const days = selectedScheduleDays();
      const savedTotal = Object.values(draftAllocations).reduce((sum, minutes) => sum + (Number(minutes) || 0), 0);
      const savedDays = Object.keys(draftAllocations).map(Number).filter((day) => days.includes(day));
      if (forceEven || savedTotal !== draftWeeklyMinutes || savedDays.length !== days.length || days.some((day) => !Object.prototype.hasOwnProperty.call(draftAllocations, day))) {
        draftAllocations = evenAllocations(draftWeeklyMinutes, days);
      }
      dayAllocationFields.replaceChildren();
      days.forEach((day) => {
        const total = Number(draftAllocations[day]) || 0;
        const row = document.createElement("div");
        row.className = "day-allocation";
        row.dataset.allocationDay = String(day);
        const dayLabel = document.createElement("strong");
        dayLabel.textContent = weekdays[day] + "曜日";
        const sliders = document.createElement("div");
        sliders.className = "allocation-sliders";
        const hourLabel = document.createElement("label");
        const hourValue = document.createElement("span");
        hourValue.textContent = Math.floor(total / 60) + "時間";
        const hourInput = document.createElement("input");
        hourInput.type = "range";
        hourInput.min = "0";
        hourInput.max = "10";
        hourInput.step = "1";
        hourInput.value = String(Math.floor(total / 60));
        hourInput.dataset.allocationPart = "hours";
        hourInput.setAttribute("aria-label", weekdays[day] + "曜日の学習時間・時間");
        const minuteLabel = document.createElement("label");
        const minuteValue = document.createElement("span");
        minuteValue.textContent = total % 60 + "分";
        const minuteInput = document.createElement("input");
        minuteInput.type = "range";
        minuteInput.min = "0";
        minuteInput.max = "59";
        minuteInput.step = "1";
        minuteInput.value = String(total % 60);
        minuteInput.dataset.allocationPart = "minutes";
        minuteInput.setAttribute("aria-label", weekdays[day] + "曜日の学習時間・分");
        hourInput.addEventListener("input", () => {
          hourValue.textContent = hourInput.value + "時間";
          updateAllocationSummary();
        });
        minuteInput.addEventListener("input", () => {
          minuteValue.textContent = minuteInput.value + "分";
          updateAllocationSummary();
        });
        hourLabel.append(hourValue, hourInput);
        minuteLabel.append(minuteValue, minuteInput);
        sliders.append(hourLabel, minuteLabel);
        row.append(dayLabel, sliders);
        dayAllocationFields.append(row);
      });
      updateAllocationSummary();
    }

    function setScheduleValues(days, weeklyMinutes, dayAllocations) {
      scheduleForm.querySelectorAll('input[name="days"]').forEach((input) => {
        input.checked = days.includes(Number(input.value));
      });
      draftWeeklyMinutes = weeklyMinutes || 60;
      draftAllocations = dayAllocations && typeof dayAllocations === "object" ? { ...dayAllocations } : evenAllocations(draftWeeklyMinutes, days);
      setDuration(scheduleForm, "weekly", draftWeeklyMinutes);
      updateDailyEstimate();
    }

    function updateNextWeekStatus() {
      if (!nextWeekStatus) return;
      if (!hasNextWeekPlan()) {
        nextWeekStatus.textContent = now.getDay() === 6
          ? "振り返りや次週の予定は、無理のないタイミングで。"
          : "次週の予定は、都合に合わせて準備できます。";
        return;
      }
      const plan = state.nextWeekPlan;
      const detail = plan.plannedDays.map((day) => weekdays[day] + "曜" + formatDuration(Number(plan.dayAllocations?.[day]) || plan.dailyMinutes)).join("・");
      nextWeekStatus.textContent = "次週は合計" + formatDuration(plan.weeklyMinutes || state.weeklyMinutes) + "（" + detail + "）です。";
    }

    function openSchedule(mode, required = false) {
      scheduleMode = mode;
      scheduleDialog.dataset.required = String(required);
      const savedPlan = mode === "next" && hasNextWeekPlan() ? state.nextWeekPlan : null;
      setScheduleValues(savedPlan?.plannedDays || state.plannedDays, savedPlan?.weeklyMinutes || state.weeklyMinutes, savedPlan?.dayAllocations || (mode === "current" ? state.dayAllocations : null));
      document.querySelectorAll("[data-schedule-cancel]").forEach((button) => {
        button.hidden = required;
      });
      showScheduleStage(1);
      scheduleDialog.showModal();
    }

    choices.addEventListener("change", updateDailyEstimate);
    document.querySelectorAll("[data-schedule-next]").forEach((button) => button.addEventListener("click", () => {
      const nextStage = Number(button.dataset.scheduleNext);
      if (nextStage === 2) {
        draftWeeklyMinutes = readDuration(scheduleForm, "weekly");
        if (draftWeeklyMinutes < 1) {
          scheduleError.textContent = "1週間の総学習時間を1分以上にしてください。";
          return;
        }
        updateDailyEstimate();
      }
      if (nextStage === 3) {
        const selected = selectedScheduleDays();
        if (selected.length < 2 || selected.length > 3) {
          scheduleError.textContent = "学習する曜日を2〜3日選んでください。";
          return;
        }
        if (draftWeeklyMinutes < selected.length) {
          scheduleError.textContent = "選んだ各曜日に1分以上配分できる総学習時間にしてください。";
          return;
        }
        renderAllocationFields();
      }
      showScheduleStage(nextStage);
    }));
    document.querySelectorAll("[data-schedule-back]").forEach((button) => button.addEventListener("click", () => {
      showScheduleStage(Number(button.dataset.scheduleBack));
    }));
    document.querySelector("[data-evenly-distribute]")?.addEventListener("click", () => renderAllocationFields(true));
    document.querySelectorAll("[data-edit-schedule]").forEach((button) => button.addEventListener("click", () => openSchedule("current")));
    document.querySelector("[data-plan-next-week]")?.addEventListener("click", () => openSchedule("next"));
    scheduleDialog?.addEventListener("cancel", (event) => {
      if (scheduleDialog.dataset.required === "true") event.preventDefault();
    });
    scheduleForm?.addEventListener("submit", (event) => {
      if (event.submitter?.value === "cancel") {
        if (scheduleDialog.dataset.required === "true") event.preventDefault();
        return;
      }
      if (scheduleStage !== 3) {
        event.preventDefault();
        return;
      }
      const selected = selectedScheduleDays();
      const allocations = readDayAllocations();
      const allocated = Object.values(allocations).reduce((sum, minutes) => sum + minutes, 0);
      if (selected.some((day) => allocations[day] < 1)) {
        event.preventDefault();
        scheduleError.textContent = "選んだ曜日には、それぞれ1分以上を配分してください。";
        return;
      }
      if (allocated !== draftWeeklyMinutes) {
        event.preventDefault();
        scheduleError.textContent = "曜日ごとの合計を、総学習時間と一致させてください。";
        return;
      }

      const dailyMinutes = Math.round(draftWeeklyMinutes / selected.length);
      if (scheduleMode === "next") {
        state.nextWeekPlan = { weekStart: nextWeekKey, plannedDays: selected, weeklyMinutes: draftWeeklyMinutes, dailyMinutes, dayAllocations: allocations };
      } else {
        state.plannedDays = selected;
        state.weeklyMinutes = draftWeeklyMinutes;
        state.dailyMinutes = dailyMinutes;
        state.dayAllocations = allocations;
        state.completedDays = state.completedDays.filter((day) => selected.includes(day));
      }

      scheduleDialog.dataset.required = "false";
      saveState(state);
      renderWeek();
      renderProgress();
      renderGoalSummary();
      updateNextWeekStatus();
      scheduleError.textContent = "";
      showToast(scheduleMode === "next" ? "次の週の予定を保存しました" : "今週の予定を保存しました");
    });

    const studyLogDialog = document.querySelector("#studyLogDialog");
    const studyLogForm = document.querySelector("#studyLogForm");
    const studyLogError = document.querySelector("#studyLogError");
    bindDurationPicker(studyLogForm, "log");
    document.querySelector("[data-log-study]")?.addEventListener("click", () => {
      studyLogForm.elements.studyDate.value = formatISODate(now);
      setDuration(studyLogForm, "log", state.dailyMinutes || 20);
      studyLogError.textContent = "";
      studyLogDialog.showModal();
    });
    studyLogForm?.addEventListener("submit", (event) => {
      if (event.submitter?.value === "cancel") return;
      const minutes = readDuration(studyLogForm, "log");
      const studyDate = studyLogForm.elements.studyDate.value;
      if (minutes < 1) {
        event.preventDefault();
        studyLogError.textContent = "学習時間を1分以上にしてください。";
        return;
      }
      if (!studyDate || studyDate < currentWeekKey || studyDate > formatISODate(saturday)) {
        event.preventDefault();
        studyLogError.textContent = "今週の日付を選んでください。";
        return;
      }
      const session = {
        id: currentWeekKey + "-" + Date.now(),
        weekStart: currentWeekKey,
        date: studyDate,
        minutes,
        createdAt: new Date().toISOString(),
      };
      state.studySessions.push(session);
      state.learningLogs.push(session);
      renderProgress();
      saveState(state);
      showToast(formatDuration(minutes) + "の学習を記録しました");
    });

    const weeklyReviewDialog = document.querySelector("#weeklyReviewDialog");
    const weeklyReviewForm = document.querySelector("#weeklyReviewForm");
    const weeklyReviewDescription = document.querySelector("#weeklyReviewDescription");
    const weeklyReviewError = document.querySelector("#weeklyReviewError");
    const confidenceOutput = document.querySelector("#confidenceOutput");
    const confidenceHint = document.querySelector("#confidenceHint");
    const reviewSteps = [...weeklyReviewForm.querySelectorAll("[data-review-step]")];
    let reviewRequired = false;
    let changingReviewStep = false;

    function showReviewStep(targetStep) {
      changingReviewStep = true;
      reviewSteps.forEach((step) => {
        step.open = step === targetStep;
      });
      window.queueMicrotask(() => {
        changingReviewStep = false;
      });
    }

    reviewSteps.forEach((step) => step.addEventListener("toggle", () => {
      if (!changingReviewStep && step.open) showReviewStep(step);
    }));

    function updateConfidence() {
      const confidence = Number(weeklyReviewForm.elements.confidence.value);
      confidenceOutput.textContent = confidence + " / 5";
      confidenceHint.textContent = confidence <= 2
        ? "達成条件を小さくすると、実行しやすくなります。"
        : confidence === 3
          ? "少し挑戦的です。障害への対策を具体的にしましょう。"
          : "無理なく挑戦できる大きさです。";
    }

    function openWeeklyReview(required = false) {
      reviewRequired = required;
      weeklyReviewDialog.dataset.required = String(required);
      const saved = state.weeklyReviews[currentWeekKey] || {};
      ["achievement", "learning", "obstacle", "nextGoal", "desiredOutcome", "ifCue", "thenAction"].forEach((name) => {
        weeklyReviewForm.elements[name].value = saved[name] || "";
      });
      weeklyReviewForm.elements.confidence.value = String(saved.confidence || 4);
      updateConfidence();
      showReviewStep(reviewSteps[0]);
      weeklyReviewDescription.textContent = required
        ? "土曜日の週次レビューです。今週を振り返り、次に続く行動を決めます。"
        : "実績を見て、次に続く行動をひとつ決めます。";
      weeklyReviewError.textContent = required ? "保存後に、次週の曜日と学習時間を決めます。" : "";
      document.querySelectorAll("[data-review-cancel]").forEach((button) => {
        button.hidden = required;
      });
      renderProgress();
      weeklyReviewDialog.showModal();
    }

    weeklyReviewForm.elements.confidence?.addEventListener("input", updateConfidence);
    document.querySelectorAll("[data-open-review]").forEach((button) => button.addEventListener("click", () => openWeeklyReview(false)));
    weeklyReviewDialog?.addEventListener("cancel", (event) => {
      if (weeklyReviewDialog.dataset.required === "true") event.preventDefault();
    });
    weeklyReviewForm?.addEventListener("submit", (event) => {
      if (event.submitter?.value === "cancel") {
        if (reviewRequired) event.preventDefault();
        return;
      }
      const review = {};
      const fields = ["achievement", "learning", "obstacle", "nextGoal", "desiredOutcome", "ifCue", "thenAction"];
      let complete = true;
      fields.forEach((name) => {
        review[name] = weeklyReviewForm.elements[name].value.trim();
        if (!review[name]) complete = false;
      });
      if (!complete) {
        event.preventDefault();
        const firstMissing = fields.find((name) => !review[name]);
        const input = weeklyReviewForm.elements[firstMissing];
        const step = input?.closest("[data-review-step]");
        if (step) showReviewStep(step);
        window.setTimeout(() => input?.focus(), 0);
        weeklyReviewError.textContent = "入力していない項目があります。該当するステップを開きました。";
        return;
      }
      review.confidence = Number(weeklyReviewForm.elements.confidence.value) || 3;
      state.weeklyReviews[currentWeekKey] = {
        ...review,
        weekStart: currentWeekKey,
        completedMinutes: state.weeklyCompletedMinutes || 0,
        targetMinutes: state.weeklyMinutes || 60,
        updatedAt: new Date().toISOString(),
      };
      weeklyReviewDialog.dataset.required = "false";
      saveState(state);
      renderGoalSummary();
      weeklyReviewError.textContent = "";
      showToast("振り返りと次週の目標を保存しました");
      if (reviewRequired && !hasNextWeekPlan()) {
        reviewRequired = false;
        window.setTimeout(() => openSchedule("next", false), 0);
      }
    });

    document.querySelector("[data-move-week]")?.addEventListener("click", () => {
      state.completedDays = [];
      saveState(state);
      renderWeek();
      showToast("未完了の予定を来週へ移す準備をしました");
    });

    function renderCurriculumChoice() {
      const store = window.TOTONOE_CURRICULUM_STORE;
      const available = store.sortLessons((store.readAdminState().lessons || []).filter(store.isPublishedLesson));
      const progress = store?.readLearnerState().lessonProgress || {};
      const completed = (item) => store.isCompletedLessonProgress(progress[item.id]);
      const allCourses = new Map();
      available.forEach((item) => {
        const key = store.lessonCurriculumKey(item);
        if (!allCourses.has(key)) allCourses.set(key, []);
        allCourses.get(key).push(item);
      });
      const continuing = [...allCourses.entries()].map(([key, items]) => {
        const done = items.filter(completed).length;
        const touched = items.some((item) => ["started", "in_progress"].includes(progress[item.id]?.status));
        const latest = items.reduce((value, item) => Math.max(value, Date.parse(progress[item.id]?.completedAt || progress[item.id]?.startedAt || "") || 0), 0);
        return { key, items, done, latest, touched };
      }).filter((course) => (course.done > 0 || course.touched) && course.done < course.items.length)
        .sort((a, b) => b.latest - a.latest || Number(b.key === state.selectedCurriculumKey) - Number(a.key === state.selectedCurriculumKey));
      const selectedCourse = allCourses.get(state.selectedCurriculumKey);
      const currentCourses = [...continuing];
      if (selectedCourse && selectedCourse.some((item) => !completed(item)) && !currentCourses.some((course) => course.key === state.selectedCurriculumKey)) {
        currentCourses.push({ key: state.selectedCurriculumKey, items: selectedCourse, done: selectedCourse.filter(completed).length });
      }
      const currentRoot = document.querySelector("#irohaCurrentLearningList");
      currentRoot.replaceChildren();
      if (!currentCourses.length) {
        const empty = document.createElement("p");
        empty.className = "iroha-current-empty";
        empty.textContent = "学習中の講座はまだありません。分野一覧から講座を探せます。";
        currentRoot.append(empty);
      }
      currentCourses.forEach((course, index) => {
        const next = course.items.find((item) => !completed(item));
        const categoryName = store.categories.find((item) => item.id === store.lessonCategoryId(course.items[0]))?.label || "カリキュラム";
        const card = document.createElement("article");
        card.className = `iroha-current-card${index === 0 ? " is-primary" : ""}`;
        const label = document.createElement("span");
        label.className = "status-label";
        label.textContent = course.done || course.touched ? "学習中" : "選択中";
        const title = document.createElement("h3");
        title.textContent = store.lessonCurriculumTitle(course.items[0]);
        const categoryText = document.createElement("p");
        categoryText.textContent = categoryName;
        const nextText = document.createElement("p");
        nextText.className = "iroha-current-next";
        nextText.textContent = `次のレッスン：${next.title}`;
        const track = document.createElement("div");
        track.className = "course-progress";
        track.setAttribute("role", "progressbar");
        track.setAttribute("aria-label", `${title.textContent}の進捗`);
        track.setAttribute("aria-valuemin", "0");
        track.setAttribute("aria-valuemax", String(course.items.length));
        track.setAttribute("aria-valuenow", String(course.done));
        const fill = document.createElement("span");
        fill.style.width = `${Math.round(course.done / course.items.length * 100)}%`;
        track.append(fill);
        const count = document.createElement("p");
        count.className = "progress-copy";
        count.textContent = `${course.done} / ${course.items.length}レッスン完了`;
        const link = document.createElement("a");
        link.className = "primary-button";
        link.href = `lesson.html?id=${encodeURIComponent(next.id)}`;
        link.textContent = course.done || course.touched ? "続きから学ぶ" : "最初のレッスンへ";
        card.append(label, title, categoryText, nextText, track, count, link);
        currentRoot.append(card);
      });
      const selectedCategory = store.categories.some((item) => item.id === state.selectedCategory)
        ? state.selectedCategory : state.selectedTool ? store.lessonCategoryId({ tool: state.selectedTool })
          : currentCourses.length ? store.lessonCategoryId(currentCourses[0].items[0]) : "";
      const category = store.categories.find((item) => item.id === selectedCategory);
      const courses = new Map();
      available.filter((item) => store.lessonCategoryId(item) === selectedCategory).forEach((item) => {
        const key = store.lessonCurriculumKey(item);
        if (!courses.has(key)) courses.set(key, []);
        courses.get(key).push(item);
      });
      const legacyKey = state.selectedTool ? `${selectedCategory}:${state.selectedTool}` : "";
      const selectedKey = courses.has(state.selectedCurriculumKey) ? state.selectedCurriculumKey : courses.has(legacyKey) ? legacyKey
        : continuing.find((course) => courses.has(course.key))?.key || "";
      const selectedLessons = courses.get(selectedKey) || [];
      const nextLesson = selectedLessons.find((item) => !completed(item));
      const startButton = document.querySelector("[data-start-lesson]");
      const groupsRoot = document.querySelector("#irohaLessonGroups");
      const categoryRoot = document.querySelector("#irohaCategoryList");
      const courseRoot = document.querySelector("#irohaCurriculumList");
      groupsRoot.replaceChildren();
      categoryRoot.replaceChildren();
      courseRoot.replaceChildren();

      store.categories.forEach((item) => {
        const lessons = available.filter((lesson) => store.lessonCategoryId(lesson) === item.id);
        const button = document.createElement("button");
        button.type = "button";
        button.className = "curriculum-category";
        button.dataset.category = item.id;
        button.setAttribute("aria-pressed", String(item.id === selectedCategory));
        button.setAttribute("aria-controls", "irohaCurriculumList");
        button.setAttribute("aria-label", `${item.label}。${item.description}。${lessons.length ? `${new Set(lessons.map(store.lessonCurriculumKey)).size}講座` : "準備中"}`);
        const image = document.createElement("img");
        image.className = "curriculum-category-image";
        image.src = `assets/category-${item.id}.webp`;
        image.alt = "";
        image.width = 640;
        image.height = 427;
        image.loading = "lazy";
        image.decoding = "async";
        const title = document.createElement("strong");
        title.textContent = item.label;
        button.append(image, title);
        categoryRoot.append(button);
      });
      document.querySelector("#irohaCurriculumListTitle").textContent = category ? `${category.label}のカリキュラム` : "分野を選んでください";
      document.querySelector("#irohaCategoryStatus").textContent = !category
        ? "公開中のカリキュラムを表示します。" : courses.size ? `${courses.size}講座を公開中です。` : "公開中のカリキュラムは準備中です。";
      [...courses.entries()].sort(([aKey, aItems], [bKey, bItems]) => {
        const aPartial = aItems.some(completed) && aItems.some((item) => !completed(item));
        const bPartial = bItems.some(completed) && bItems.some((item) => !completed(item));
        return Number(bPartial) - Number(aPartial) || String(aKey).localeCompare(String(bKey), "ja");
      }).forEach(([key, items]) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "curriculum-course";
        button.dataset.curriculumKey = key;
        button.setAttribute("aria-pressed", String(key === selectedKey));
        button.setAttribute("aria-controls", "irohaToolDetail");
        const title = document.createElement("strong");
        title.textContent = store.lessonCurriculumTitle(items[0]);
        const tool = document.createElement("small");
        tool.textContent = items[0].tool && items[0].tool !== title.textContent ? `使用ツール：${items[0].tool}` : category.label;
        const summary = document.createElement("span");
        summary.textContent = `${items.filter(completed).length} / ${items.length}レッスン完了`;
        button.append(title, tool, summary);
        courseRoot.append(button);
      });

      document.querySelector("#irohaToolDetail").hidden = !selectedLessons.length;
      document.querySelector("#irohaToolDetailTitle").textContent = selectedLessons.length ? store.lessonCurriculumTitle(selectedLessons[0]) : "カリキュラムを選んでください";
      document.querySelector("#irohaCurriculumChoice").textContent = selectedLessons.length
        ? `${selectedLessons.filter(completed).length} / ${selectedLessons.length}レッスン完了 ・ 約${selectedLessons.reduce((sum, item) => sum + (Number(item.estimatedMinutes) || 0), 0)}分`
        : "レッスンと進捗をここに表示します。";
      document.querySelector("#irohaLessonStatus").textContent = nextLesson
        ? `次に学ぶ：${nextLesson.title}`
        : selectedLessons.length ? "公開中のレッスンはすべて完了しました。" : "分野とカリキュラムを選ぶと、レッスンを確認できます。";
      startButton.hidden = !nextLesson;
      startButton.textContent = nextLesson && selectedLessons.some(completed) ? "続きから学ぶ" : "最初のレッスンへ";

      const groups = new Map();
      selectedLessons.forEach((item) => {
        const label = [item.level, item.module].filter(Boolean).join("｜") || "レッスン";
        if (!groups.has(label)) groups.set(label, []);
        groups.get(label).push(item);
      });
      groups.forEach((items, label) => {
        const section = document.createElement("section");
        section.className = "iroha-lesson-group";
        const heading = document.createElement("h4");
        heading.textContent = label;
        const list = document.createElement("ol");
        items.forEach((item) => {
          const row = document.createElement("li");
          const unlocked = store.lessonUnlockState(selectedLessons, item.id, progress).allowed;
          const content = document.createElement(unlocked ? "a" : "span");
          if (unlocked) content.href = `lesson.html?id=${encodeURIComponent(item.id)}`;
          else content.className = "iroha-lesson-locked";
          const number = document.createElement("b");
          number.className = "lesson-order";
          number.textContent = String(store.lessonVideoOrder(item) ?? selectedLessons.indexOf(item) + 1).padStart(2, "0");
          const title = document.createElement("strong");
          title.textContent = item.title;
          const detail = document.createElement("span");
          detail.textContent = `約${Number(item.estimatedMinutes) || 0}分 ・ ${completed(item) ? "完了" : unlocked ? "次に学ぶ" : "前のレッスンのアウトプット後に開放"}`;
          content.append(number, title, detail);
          row.append(content);
          list.append(row);
        });
        section.append(heading, list);
        groupsRoot.append(section);
      });
      return nextLesson;
    }
    document.querySelector("[data-start-lesson]")?.addEventListener("click", () => {
      const lesson = renderCurriculumChoice();
      if (lesson) window.location.href = `lesson.html?id=${encodeURIComponent(lesson.id)}`;
    });

    document.querySelectorAll("[data-open-history]").forEach((button) => button.addEventListener("click", () => {
      const entries = document.querySelector("#historyEntries");
      entries.replaceChildren();
      state.learningLogs.slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).forEach((log) => {
        const item = document.createElement("li");
        const title = document.createElement("strong");
        title.textContent = "学習時間：" + formatDuration(log.minutes);
        const date = document.createElement("span");
        date.textContent = log.date || "日付未設定";
        item.append(title, date);
        entries.append(item);
      });
      document.querySelector("#historyEntriesEmpty").hidden = state.learningLogs.length > 0;
      document.querySelector("#historyDialog")?.showModal();
    }));
    document.querySelector("#irohaCategoryList")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-category]");
      if (!button) return;
      state.selectedCategory = button.dataset.category;
      state.selectedCurriculumKey = "";
      state.selectedTool = "";
      saveState(state);
      renderCurriculumChoice();
      document.querySelector("#irohaCurriculumListTitle")?.focus();
    });
    document.querySelector("#irohaCurriculumList")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-curriculum-key]");
      if (!button) return;
      state.selectedCurriculumKey = button.dataset.curriculumKey;
      saveState(state);
      renderCurriculumChoice();
      document.querySelector("#irohaToolDetail")?.focus();
    });

    renderWeek();
    renderProgress();
    renderGoalSummary();
    renderCurriculumChoice();
    updateNextWeekStatus();
  }

  setupPricing();
  setupDashboard();
})();
