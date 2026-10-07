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
        const registration = await request("/api/public/waitlist", { method: "POST", body: JSON.stringify({ email: String(data.get("email") || "").trim(), interest: form.dataset.interest, privacy_consent: data.get("privacy_consent") === "on", website: String(data.get("website") || ""), source: location.pathname }) });
        form.reset(); status.textContent = "ウェイトリストに登録しました。現時点では契約・課金は始まりません。申込枠の確保や自動申込ではありません。";
        if (form.dataset.interest.startsWith('iroha_')) {
          status.textContent += registration.receipt_sent === true
            ? ' ご案内メールを送信しました。メールに返信してご希望をお知らせください。'
            : ' ご案内メールは送信できませんでした。お手数ですが totonoe.ai.essential@gmail.com へご連絡ください。';
        }
        if (window.ToToNoEMarketing) window.ToToNoEMarketing.trackWaitlistSuccess(form.dataset.interest);
      } catch (error) {
        status.textContent = error.message === "privacy_consent_required" ? "プライバシーポリシーへの同意をご確認ください。" : "登録できませんでした。時間をおいて再度お試しください。";
      } finally { button.disabled = false; }
    });
  });
})();
