(() => {
  "use strict";

  const storageKey = "totonoe-curriculum-preview-v1";
  const profileStorageKey = "totonoe-member-profile-preview-v1";
  const profileApi = "/api/totonoe-member/api/customer/profile";
  const portalApi = "/api/totonoe-member/api/customer/billing/portal";
  const logoutApi = "/api/totonoe-member/api/customer/auth/logout";
  const isLocalPreview = ["localhost", "127.0.0.1", ""].includes(location.hostname);

  function loadState() {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || "{}");
    } catch {
      return {};
    }
  }

  function formatDuration(totalMinutes) {
    const total = Math.max(0, Number(totalMinutes) || 0);
    const hours = Math.floor(total / 60);
    const minutes = total % 60;
    if (!hours) return minutes + "分";
    if (!minutes) return hours + "時間";
    return hours + "時間" + minutes + "分";
  }

  function weekLabel(weekStart) {
    const start = new Date(weekStart + "T12:00:00");
    if (Number.isNaN(start.getTime())) return weekStart;
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return `${start.getFullYear()}年${start.getMonth() + 1}月${start.getDate()}日〜${end.getMonth() + 1}月${end.getDate()}日`;
  }

  function makeText(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    element.textContent = text;
    return element;
  }

  function makeDetail(label, value) {
    const wrapper = document.createElement("div");
    wrapper.append(makeText("dt", "", label), makeText("dd", "", value || "記録なし"));
    return wrapper;
  }

  function normalizeReviews(state) {
    const reviews = Object.values(state.weeklyReviews || {});
    Object.entries(state.weeklyReflections || {}).forEach(([weekStart, legacy]) => {
      if (reviews.some((review) => review.weekStart === weekStart)) return;
      reviews.push({
        weekStart,
        achievement: legacy.objective,
        learning: legacy.interpretive,
        obstacle: legacy.reflective,
        nextGoal: legacy.decisional,
        desiredOutcome: "旧形式のORID記録から移行したログです。",
        ifCue: "記録なし",
        thenAction: "記録なし",
        confidence: null,
        completedMinutes: legacy.completedMinutes || 0,
        targetMinutes: 0,
        legacy: true,
      });
    });
    return reviews.sort((a, b) => String(b.weekStart).localeCompare(String(a.weekStart)));
  }

  function localProfile() {
    try {
      const saved = JSON.parse(localStorage.getItem(profileStorageKey) || "{}");
      return {
        display_name: saved.display_name || "山田 太郎",
        profession: saved.profession || "",
        workplace_type: saved.workplace_type || "",
        role_title: saved.role_title || "",
        organization_size: saved.organization_size || "",
        ai_usage_level: saved.ai_usage_level || "",
        interest_topics: Array.isArray(saved.interest_topics) ? saved.interest_topics : [],
        current_challenges: saved.current_challenges || "",
        has_weekly_access: true,
        has_curriculum_access: new URLSearchParams(location.search).get("plan") !== "weekly",
      };
    } catch {
      return { display_name: "山田 太郎", interest_topics: [], has_weekly_access: true, has_curriculum_access: true };
    }
  }

  function fillProfile(profile) {
    const form = document.querySelector("#memberProfileForm");
    if (!form) return;
    ["profession", "workplace_type", "role_title", "organization_size", "ai_usage_level", "current_challenges"].forEach((name) => {
      if (form.elements[name]) form.elements[name].value = profile[name] || "";
    });
    const interests = new Set(profile.interest_topics || []);
    form.querySelectorAll('input[name="interest_topics"]').forEach((input) => { input.checked = interests.has(input.value); });
    document.querySelector("#memberDisplayName").textContent = (profile.display_name || "会員") + "さん";
    document.querySelector("#memberPlanName").textContent = profile.has_curriculum_access ? "IROHA会員（TAYORI込み）" : "TAYORI会員";
  }

  function profilePayload(form) {
    const data = new FormData(form);
    return {
      profession: String(data.get("profession") || ""),
      workplace_type: String(data.get("workplace_type") || ""),
      role_title: String(data.get("role_title") || ""),
      organization_size: String(data.get("organization_size") || ""),
      ai_usage_level: String(data.get("ai_usage_level") || ""),
      interest_topics: data.getAll("interest_topics").map(String),
      current_challenges: String(data.get("current_challenges") || ""),
    };
  }

  async function loadProfile() {
    if (isLocalPreview) return fillProfile(localProfile());
    const status = document.querySelector("#profileSaveStatus");
    try {
      const response = await fetch(profileApi, { credentials: "same-origin", headers: { accept: "application/json" } });
      if (!response.ok) throw new Error("プロフィールを取得できませんでした");
      const payload = await response.json();
      fillProfile(payload.profile || {});
    } catch (error) {
      status.textContent = error.message;
      status.className = "is-error";
    }
  }

  async function saveProfile(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    const status = document.querySelector("#profileSaveStatus");
    const payload = profilePayload(form);
    button.disabled = true;
    status.className = "";
    status.textContent = "保存しています…";
    try {
      if (isLocalPreview) {
        localStorage.setItem(profileStorageKey, JSON.stringify({ ...localProfile(), ...payload }));
        fillProfile({ ...localProfile(), ...payload });
      } else {
        const response = await fetch(profileApi, {
          method: "PATCH",
          credentials: "same-origin",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error("保存できませんでした。ログイン状態をご確認ください。");
        const result = await response.json();
        fillProfile(result.profile || payload);
      }
      status.textContent = isLocalPreview ? "保存しました（ローカル確認用）" : "保存しました";
      status.className = "is-success";
    } catch (error) {
      status.textContent = error.message;
      status.className = "is-error";
    } finally {
      button.disabled = false;
    }
  }

  async function openBillingPortal() {
    const button = document.querySelector("#manageBillingButton");
    const status = document.querySelector("#billingActionStatus");
    button.disabled = true;
    status.className = "";
    status.textContent = "安全な契約管理画面を準備しています…";
    try {
      if (isLocalPreview) {
        status.textContent = "本番ではStripeの契約管理画面へ移動します。";
        return;
      }
      const response = await fetch(portalApi, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json", accept: "application/json" }, body: "{}" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const messages = {
          authentication_required: "ログインし直してください。",
          stripe_customer_missing: "決済情報がまだ登録されていません。",
          subscription_not_found: "管理できる契約が見つかりませんでした。",
          stripe_portal_failed: "契約管理画面を開けませんでした。時間をおいて再度お試しください。",
          stripe_test_secret_missing: "現在は契約管理機能の準備中です。",
        };
        throw new Error(messages[payload.error] || "契約管理画面を開けませんでした。");
      }
      window.location.assign(payload.portal_url);
    } catch (error) {
      status.className = "is-error";
      status.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  }

  async function logoutMember() {
    const button = document.querySelector("#memberLogoutButton");
    button.disabled = true;
    try {
      if (!isLocalPreview) await fetch(logoutApi, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: "{}" });
    } finally {
      window.location.assign("../weekly/login.html");
    }
  }

  function renderReview(review) {
    const article = document.createElement("article");
    article.className = "weekly-log-card";

    const header = document.createElement("header");
    const headerCopy = document.createElement("div");
    headerCopy.append(makeText("small", "", review.legacy ? "過去の振り返り" : "週次レビュー"), makeText("h3", "", weekLabel(review.weekStart)));
    const time = makeText("strong", "weekly-log-time", formatDuration(review.completedMinutes) + (review.targetMinutes ? " / " + formatDuration(review.targetMinutes) : ""));
    header.append(headerCopy, time);

    const goal = document.createElement("section");
    goal.className = "weekly-log-goal";
    goal.append(makeText("small", "", "次週のゴール"), makeText("h4", "", review.nextGoal || "記録なし"), makeText("p", "", review.desiredOutcome || ""));

    const details = document.createElement("dl");
    details.className = "weekly-log-details";
    details.append(
      makeDetail("できたこと", review.achievement),
      makeDetail("役立った工夫・学び", review.learning),
      makeDetail("いちばんの障害", review.obstacle),
    );

    const action = document.createElement("p");
    action.className = "if-then-log";
    action.append(makeText("strong", "", "If–Then"), document.createTextNode(" もし「" + (review.ifCue || "記録なし") + "」なら、「" + (review.thenAction || "記録なし") + "」"));

    const footer = document.createElement("footer");
    footer.append(makeText("span", "", review.legacy ? "旧形式の記録" : "実現できそう度 " + review.confidence + " / 5"));

    article.append(header, goal, details, action, footer);
    return article;
  }

  const state = loadState();
  const logs = Array.isArray(state.learningLogs) && state.learningLogs.length
    ? state.learningLogs
    : (Array.isArray(state.studySessions) ? state.studySessions : []);
  const reviews = normalizeReviews(state);
  const totalMinutes = logs.reduce((sum, log) => sum + (Number(log.minutes) || 0), 0);

  document.querySelector("#totalLearningTime").textContent = formatDuration(totalMinutes);
  document.querySelector("#totalSessions").textContent = logs.length + "回";
  document.querySelector("#totalReviews").textContent = reviews.length + "週";
  document.querySelector("#summaryPeriod").textContent = reviews.length ? "これまでの記録" : "記録を始めましょう";

  const list = document.querySelector("#weeklyLogList");
  const empty = document.querySelector("#emptyLog");
  if (!reviews.length) {
    empty.hidden = false;
  } else {
    reviews.forEach((review) => list.append(renderReview(review)));
  }

  document.querySelector("#memberProfileForm")?.addEventListener("submit", saveProfile);
  document.querySelector("#manageBillingButton")?.addEventListener("click", openBillingPortal);
  document.querySelector("#memberLogoutButton")?.addEventListener("click", logoutMember);
  if (new URLSearchParams(location.search).get("billing") === "returned") document.querySelector("#billingActionStatus").textContent = "契約管理画面から戻りました。変更内容は順次反映されます。";
  loadProfile();
})();
