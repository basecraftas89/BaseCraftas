(() => {
  "use strict";
  const API_BASE = "/api/totonoe-member";
  async function request(path, options = {}) {
    const response = await fetch(API_BASE + path, { ...options, headers: { accept: "application/json", "content-type": "application/json", ...(options.headers || {}) } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || "request_failed");
    return body;
  }
  const directSignup = document.querySelector("[data-tayori-direct-signup]");
  if (directSignup) {
    const waitlist = document.querySelector('[data-waitlist-form][data-interest="tayori_personal"]');
    const footer = document.querySelector("[data-tayori-footer-signup]");
    const note = document.querySelector("#tayoriEnrollmentStatus");
    let timer;
    async function refresh() {
      clearTimeout(timer);
      let state;
      try { state = await request("/api/public/tayori-enrollment-status"); }
      catch { state = null; }
      const ready = state?.enabled && state.mode === 'live';
      const open = ready && state.accepting === true;
      const full = state?.capacity_state === 'full';
      const pending = open && !full && state.capacity_state === 'pending';
      const available = open && !full && !pending;
      directSignup.hidden = false;
      if (waitlist) waitlist.hidden = available || pending;
      if (note) note.textContent = available ? '受付中です。土日の登録完了が合計10名になり次第、受付を終了します。'
        : full ? '今週末は10名の登録が完了しました。申込ページからウェイトリストにご登録ください。'
        : pending ? '残りの枠は決済中の方が仮確保しています。登録完了はまだ10名に達していません。空きが戻ると受付を再開します。'
        : ready ? '現在は受付時間外です。次の土曜6:30から受付します。申込ページからウェイトリストにもご登録いただけます。'
        : '申込ページで最新の受付状況をご確認ください。';
      if (footer) { footer.href = 'TAYORI/subscribe.html'; footer.textContent = 'お申し込み・受付状況を確認する'; }
      const boundary = state && Date.parse(open ? state.closes_at : state.next_open_at);
      timer = setTimeout(refresh, Number.isFinite(boundary) && boundary > Date.now() ? Math.min(60000, boundary - Date.now() + 50) : 60000);
    }
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
    window.addEventListener('pageshow', refresh);
    refresh();
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
