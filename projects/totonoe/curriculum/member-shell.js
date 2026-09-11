(() => {
  "use strict";

  const PROFILE_API = "/api/column-studio/api/customer/profile";
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
      link.title = locked ? "カリキュラムへの登録が必要です" : "カリキュラムを開く";
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
    if (document.body.dataset.pageEntitlement !== "curriculum" || access.has_curriculum_access) return;
    document.body.classList.add("access-locked");
    const gate = document.createElement("section");
    gate.className = "entitlement-gate";
    gate.innerHTML =
      '<span class="material-symbols-rounded" aria-hidden="true">lock</span>' +
      '<p class="eyebrow">CURRICULUM</p>' +
      '<h1>カリキュラムは登録後に利用できます</h1>' +
      '<p>Weeklyはそのまま利用できます。カリキュラムへ登録すると、すべての教材と学習記録機能が開きます。</p>' +
      '<a class="primary-button" href="index.html#pricing">カリキュラムの料金を確認</a>';
    document.body.append(gate);
  }

  function applyAccess(access) {
    lockCurriculumLinks(access);
    renderGate(access);
    window.dispatchEvent(new CustomEvent("totonoe:member-access", { detail: access }));
    return access;
  }

  async function loadAccess() {
    if (isLocalPreview) return applyAccess(localAccess());
    try {
      const response = await fetch(PROFILE_API, { credentials: "same-origin", headers: { accept: "application/json" } });
      if (!response.ok) return applyAccess({ has_weekly_access: false, has_curriculum_access: false });
      const payload = await response.json();
      return applyAccess(payload.profile || {});
    } catch (_error) {
      return applyAccess({ has_weekly_access: false, has_curriculum_access: false });
    }
  }

  window.ToToNoEMember = { loadAccess, isLocalPreview, previewPlan };
  loadAccess();
})();
