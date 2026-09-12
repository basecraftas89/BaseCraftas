(() => {
  "use strict";

  const PROFILE_API = "/api/totonoe-member/api/customer/profile";
  const isLocalPreview = ["localhost", "127.0.0.1", ""].includes(location.hostname);
  const previewPlan = new URLSearchParams(location.search).get("plan") || "curriculum";

  function localAccess() {
    return {
      display_name: "山田 太郎",
      has_weekly_access: true,
      has_curriculum_access: previewPlan !== "weekly",
      preview: true,
    };
  }

  function lockCurriculumLinks(access) {
    document.querySelectorAll('[data-entitlement="curriculum"]').forEach((link) => {
      const locked = !access.has_curriculum_access;
      link.classList.toggle("is-locked", locked);
      link.toggleAttribute("aria-disabled", locked);
      link.title = locked ? "IROHAへの登録が必要です" : "IROHAを開く";
      let icon = link.querySelector(".nav-lock");
      if (locked && !icon) {
        icon = document.createElement("span");
        icon.className = "material-symbols-rounded nav-lock";
        icon.setAttribute("aria-hidden", "true");
        icon.textContent = "lock";
        link.append(icon);
      }
      if (!locked && icon) icon.remove();
      link.addEventListener("click", (event) => {
        if (!access.has_curriculum_access) event.preventDefault();
      });
    });
  }

  function renderGate(access) {
    const required = document.body.dataset.pageEntitlement;
    const hasMembership = access.has_weekly_access || access.has_curriculum_access;
    const allowed = required === "curriculum" ? access.has_curriculum_access : required === "member" ? hasMembership : true;
    if (allowed) return;
    document.body.classList.add("access-locked");
    const gate = document.createElement("section");
    gate.className = "entitlement-gate";
    const isSignedIn = access.authenticated === true;
    const loginUrl = "../TAYORI/login.html?return=%2Fprojects%2Ftotonoe%2FIROHA%2Fdashboard.html";
    const title = required === "curriculum" ? "IROHAは購入者限定です" : "会員ページへログインしてください";
    const copy = isSignedIn
      ? "現在の会員区分ではIROHAをご利用いただけません。IROHAを購入すると、学習画面と教材が開き、TAYORIも利用できます。"
      : "購入時に登録したメールアドレスでログインすると、ご利用中の会員区分を確認します。";
    const action = isSignedIn
      ? '<a class="primary-button" href="index.html#pricing">IROHAの詳細・料金を見る</a>'
      : '<a class="primary-button" href="' + loginUrl + '">登録メールでログイン</a><a class="secondary-button" href="index.html">IROHAのLPを見る</a>';
    gate.innerHTML =
      '<span class="material-symbols-rounded" aria-hidden="true">lock</span>' +
      '<p class="eyebrow">IROHA</p>' +
      '<h1>' + title + '</h1>' +
      '<p>' + copy + '</p>' + action;
    document.body.append(gate);
  }

  function applyAccess(access) {
    document.documentElement.classList.remove("member-access-pending");
    lockCurriculumLinks(access);
    document.querySelectorAll("[data-requires-curriculum]").forEach((element) => {
      element.hidden = !access.has_curriculum_access;
    });
    renderGate(access);
    window.dispatchEvent(new CustomEvent("totonoe:member-access", { detail: access }));
    return access;
  }

  async function loadAccess() {
    if (isLocalPreview) return applyAccess(localAccess());
    try {
      const response = await fetch(PROFILE_API, { credentials: "same-origin", headers: { accept: "application/json" } });
      if (!response.ok) return applyAccess({ authenticated: response.status !== 401, has_weekly_access: false, has_curriculum_access: false });
      const payload = await response.json();
      return applyAccess({ authenticated: true, ...(payload.profile || {}) });
    } catch (_error) {
      return applyAccess({ authenticated: false, has_weekly_access: false, has_curriculum_access: false });
    }
  }

  window.ToToNoEMember = { loadAccess, isLocalPreview, previewPlan };
  loadAccess();
})();
