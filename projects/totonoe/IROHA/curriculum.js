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
    const fallback = { plannedDays: [1, 4, 5], weeklyMinutes: 60, dailyMinutes: 20, completedDays: [1, 4], nextWeekPlan: null };
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
      const campaignApplies = billing === config.campaign.plan && audience === config.campaign.audience;
      const entry = campaignApplies ? config.campaign.entryFee : config.entryFees.first[audience];
      const recurring = config.plans.curriculum[billing];
      const audienceLabel = campaignApplies
        ? "セラピスト初回限定キャンペーン"
        : (audience === "therapist" ? "セラピスト・初回登録" : "一般・初回登録");
      const billingLabel = billing === "annual" ? "年額" : "月額";
      const originalEntry = config.entryFees.first[audience];
      const discountRate = Math.round((1 - entry / originalEntry) * 100);
      const entryDiscount = Math.max(0, originalEntry - entry);
      const campaignPrice = document.querySelector("#campaignPrice");
      const specialPriceLabel = document.querySelector("#specialPriceLabel");
      document.querySelector("#priceAudienceLabel").textContent = audienceLabel;
      document.querySelector("#priceOriginal").textContent = yen.format(originalEntry);
      document.querySelector("#priceDiscount").textContent = `${discountRate}% OFF`;
      campaignPrice.hidden = !campaignApplies;
      specialPriceLabel.hidden = !campaignApplies;
      document.querySelector("#priceTotal").textContent = yen.format(entry);
      document.querySelector("#recurringPrice").textContent = yen.format(recurring);
      document.querySelector("#recurringUnit").textContent = billing === "annual" ? "円／年（税込）" : "円／月（税込）";
      document.querySelector("#entryFeeNote").textContent = campaignApplies
        ? `通常${yen.format(originalEntry)}円から${yen.format(entryDiscount)}円割引`
        : `${audience === "therapist" ? "資格確認済みセラピスト" : "一般"}の初回入会費`;
      document.querySelector("#subscriptionStartNote").textContent = `申込日から30日間は${billingLabel}料金0円`;
      document.querySelector("#priceBreakdown").innerHTML = config.purchaseEnabled
        ? `<strong>初月のサブスク料金はかかりません。</strong>${campaignApplies ? "資格確認後、" : ""}本日は入会費${yen.format(entry)}円のみお支払いいただき、${billingLabel}${yen.format(recurring)}円は30日後から始まります。`
        : `<strong>表示中の料金は提供開始時の案です。</strong>${campaignApplies ? "資格確認後、" : ""}提供開始時は入会費${yen.format(entry)}円、${billingLabel}${yen.format(recurring)}円は利用開始30日後から始まる設計です。`;
      document.querySelectorAll("[data-billing]").forEach((button) => {
        const active = button.dataset.billing === billing;
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
      billing = button.dataset.billing;
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
      const period = billing === "annual" ? "年額29,800円" : "月額2,980円";
      const campaignApplies = billing === config.campaign.plan && audience === config.campaign.audience;
      const campaignText = campaignApplies ? "・セラピスト初回限定 入会金5,000円" : "";
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
            plan_code: billing === "annual" ? "curriculum_annual" : "curriculum_monthly",
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

  function setupDashboard() {
    const weekDays = document.querySelector("#weekDays");
    if (!weekDays) return;

    const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
    const now = getCurrentDate();
    const sunday = getSunday(now);
    const saturday = new Date(sunday);
    saturday.setDate(sunday.getDate() + 6);
    const nextSunday = new Date(sunday);
    nextSunday.setDate(sunday.getDate() + 7);
    const currentWeekKey = formatISODate(sunday);
    const nextWeekKey = formatISODate(nextSunday);
    const state = loadState();

    state.studySessions = Array.isArray(state.studySessions) ? state.studySessions : [];
    state.learningLogs = Array.isArray(state.learningLogs) ? state.learningLogs : [];
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
    }

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
          ? "振り返りのあと、今日中に次週の予定を決めましょう。"
          : "次週の予定は、土曜日の振り返り後に決めます。";
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
    document.querySelector("[data-edit-schedule]")?.addEventListener("click", () => openSchedule("current"));
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
    document.querySelector("[data-open-review]")?.addEventListener("click", () => openWeeklyReview(false));
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
      weeklyReviewError.textContent = "";
      showToast("振り返りと次週の目標を保存しました");
      if (reviewRequired && !hasNextWeekPlan()) {
        reviewRequired = false;
        window.setTimeout(() => openSchedule("next", true), 0);
      }
    });

    document.querySelector("[data-move-week]")?.addEventListener("click", () => {
      state.completedDays = [];
      saveState(state);
      renderWeek();
      showToast("未完了の予定を来週へ移す準備をしました");
    });

    document.querySelector("[data-start-lesson]")?.addEventListener("click", () => {
      const contentState = window.TOTONOE_CURRICULUM_STORE?.readAdminState();
      const nextLesson = contentState?.lessons?.find((lesson) => lesson.workflowStatus === "published" && lesson.providerAssetId)
        || contentState?.lessons?.[0];
      window.location.href = nextLesson ? `lesson.html?id=${encodeURIComponent(nextLesson.id)}` : "lesson.html";
    });

    document.querySelector("[data-open-history]")?.addEventListener("click", () => document.querySelector("#historyDialog")?.showModal());
    document.querySelectorAll("[data-tool]").forEach((button) => button.addEventListener("click", () => {
      document.querySelectorAll("[data-tool]").forEach((item) => item.classList.toggle("is-selected", item === button));
      showToast(`${button.dataset.tool}のカリキュラムを選択しました`);
    }));

    renderWeek();
    renderProgress();
    updateNextWeekStatus();
    if (now.getDay() === 6 && !hasNextWeekPlan()) {
      window.setTimeout(() => {
        if (hasCurrentReview()) openSchedule("next", true);
        else openWeeklyReview(true);
      }, 0);
    }
  }

  setupPricing();
  setupDashboard();
})();
