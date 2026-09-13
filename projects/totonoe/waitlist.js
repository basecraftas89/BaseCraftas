(() => {
  "use strict";
  const API_BASE = "/api/totonoe-member";
  async function request(path, options = {}) {
    const response = await fetch(API_BASE + path, { ...options, headers: { accept: "application/json", "content-type": "application/json", ...(options.headers || {}) } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || "request_failed");
    return body;
  }
  document.querySelectorAll("[data-waitlist-form]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = form.querySelector('button[type="submit"]');
      const status = form.querySelector(".waitlist-status");
      const data = new FormData(form);
      button.disabled = true; status.textContent = "登録しています…";
      try {
        await request("/api/public/waitlist", { method: "POST", body: JSON.stringify({ email: String(data.get("email") || "").trim(), interest: form.dataset.interest, privacy_consent: data.get("privacy_consent") === "on", website: String(data.get("website") || ""), source: location.pathname }) });
        form.reset(); status.textContent = "登録しました。受付開始時にこのメールアドレスへご案内します。";
      } catch (error) {
        status.textContent = error.message === "privacy_consent_required" ? "プライバシーポリシーへの同意をご確認ください。" : "登録できませんでした。時間をおいて再度お試しください。";
      } finally { button.disabled = false; }
    });
  });
})();
