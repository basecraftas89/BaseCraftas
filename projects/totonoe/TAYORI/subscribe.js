(() => {
  "use strict";
  const base = "/api/totonoe-member/api";
  const status = document.querySelector("#signupStatus");
  const emailForm = document.querySelector("#emailForm");
  const codeForm = document.querySelector("#codeForm");
  const checkoutForm = document.querySelector("#checkoutForm");
  let email = "";
  const waitlistPanel = document.querySelector("#waitlistPanel");
  function showWaitlist(message) {
    emailForm.hidden = codeForm.hidden = checkoutForm.hidden = true;
    if (waitlistPanel) {
      waitlistPanel.hidden = false;
      waitlistPanel.querySelector('input[name="email"]').value = email;
    }
    status.textContent = message;
  }
  function showError(error) {
    if (["tayori_daily_limit_reached", "tayori_weekend_closed"].includes(error.message)) showWaitlist(errorMessage(error));
    else status.textContent = errorMessage(error);
  }
  const capacityButton = document.querySelector("#capacityButton");
  const enrollmentDetails = document.querySelector("#enrollmentDetails");
  if (capacityButton && enrollmentDetails) {
    enrollmentDetails.addEventListener("toggle", () => capacityButton.setAttribute("aria-expanded", String(enrollmentDetails.open)));
    capacityButton.addEventListener("click", () => {
      enrollmentDetails.open = true;
      enrollmentDetails.querySelector("summary").focus({ preventScroll: true });
      enrollmentDetails.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    });
  }
  async function api(path, options = {}) {
    const response = await fetch(base + path, { credentials: "same-origin", headers: { accept: "application/json", "content-type": "application/json" }, ...options });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "request_failed");
    return payload;
  }
  function busy(form, value) { form.querySelectorAll("input,button").forEach((element) => { element.disabled = value; }); }
  function errorMessage(error) {
    if (error.message === "tayori_weekend_closed") return "現在は受付時間外です。新規受付は土曜6:30〜日曜23:30（日本時間）、土日合計10名までです。次の土曜6:30以降にお申し込みください。";
    if (error.message === "checkout_expired_retry") return "決済画面の有効期限が切れました。もう一度ボタンを押してお申し込みください。";
    if (error.message === "tayori_daily_limit_reached") return "今週末の10名枠は満席になりました。新規申込は受付終了です。ウェイトリストにご登録いただけます。次の受付は翌週土曜6:30（日本時間）からです。";
    if (error.message === "tayori_capacity_pending") return "現在、残りの枠は決済中の方が仮確保しています。未完了の枠が戻る場合がありますので、時間をおいて再度お試しください。";
    if (error.message === "tayori_checkout_pending") return "お申し込みの決済状況を確認しています。重複申し込みを防ぐため、少し時間をおいてからもう一度お試しください。";
    if (error.message === "auth_email_daily_limit_reached") return "本日の確認メール送信上限に達しました。次の午前9時（日本時間）以降にお試しください。設定済みのパスワードでのログインは引き続き利用できます。";
    if (error.message === "auth_email_cooldown") return "確認メールは送信から60秒以上あけて再送してください。届いているメールもご確認ください。";
    if (error.message === "tayori_included_in_iroha") return "TAYORIはご契約中のIROHAに含まれています。追加のお申し込みは不要です。会員ページからご利用ください。";
    if (error.message === "iroha_checkout_pending") return "IROHAのお申し込みが進行中です。IROHAにはTAYORIも含まれるため、先にIROHAのお申し込みをご確認ください。";
    return ({ too_many_requests: "しばらく時間をおいてからお試しください。", auth_email_delivery_failed: "確認メールを送れませんでした。時間をおいてお試しください。", invalid_auth_code: "確認コードが一致しません。", auth_code_expired: "確認コードの期限が切れました。再送してください。", subscription_already_exists: "すでに契約があります。会員ページから契約状態を確認してください。", stripe_checkout_not_enabled: "現在、申込受付を停止しています。", stripe_live_not_ready: "現在、申込受付を準備しています。", tayori_enrollment_not_enabled: "現在、申込受付を準備しています。" })[error.message] || "処理できませんでした。時間をおいて再度お試しください。";
  }
  async function initialize() {
    try {
      const state = await api("/public/tayori-enrollment-status");
      if (!state.enabled) { showWaitlist("現在はウェイトリストのみ受付中です。申込受付開始までお待ちください。"); return; }
      if (state.weekend_only && !state.accepting) {
        const next = new Date(state.next_open_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" });
        showWaitlist(`現在は受付時間外です。次回は${next}（日本時間）から受付します。既存会員の方はログイン画面をご利用ください。`);
        return;
      }
      if (state.capacity_state === 'full') {
        showWaitlist(errorMessage(new Error('tayori_daily_limit_reached')));
        return;
      }
      if (state.capacity_state === 'pending') {
        emailForm.hidden = codeForm.hidden = checkoutForm.hidden = true;
        if (waitlistPanel) waitlistPanel.hidden = true;
        status.textContent = errorMessage(new Error('tayori_capacity_pending'));
        window.setTimeout(initialize, 60000);
        return;
      }
      if (state.mode !== "live") status.textContent = "テスト環境です。実際の請求は発生しません。";
      else status.textContent = "メールアドレスを入力してください。";
      emailForm.hidden = false;
    } catch { status.textContent = "受付状態を確認できませんでした。時間をおいて再度お試しください。"; }
  }
  emailForm.addEventListener("submit", async (event) => {
    event.preventDefault(); busy(emailForm, true); status.textContent = "確認コードを送信しています…";
    try {
      email = emailForm.elements.email.value.trim();
      const result = await api("/customer/auth/request-code", { method: "POST", body: JSON.stringify({ email, signup_product: "weekly" }) });
      emailForm.hidden = true; codeForm.hidden = false;
      if (result.dev_code && ["localhost", "127.0.0.1"].includes(location.hostname)) codeForm.elements.code.value = result.dev_code;
      status.textContent = "確認コードをメールで送りました。";
    } catch (error) { showError(error); }
    finally { busy(emailForm, false); }
  });
  codeForm.addEventListener("submit", async (event) => {
    event.preventDefault(); busy(codeForm, true); status.textContent = "本人確認をしています…";
    try {
      await api("/customer/auth/verify-code", { method: "POST", body: JSON.stringify({ email, code: codeForm.elements.code.value }) });
      codeForm.hidden = true; checkoutForm.hidden = false;
      status.textContent = "本人確認ができました。上記の申込条件を確認してください。";
    } catch (error) { showError(error); }
    finally { busy(codeForm, false); }
  });
  document.querySelector("#changeEmail").addEventListener("click", () => { codeForm.hidden = true; emailForm.hidden = false; status.textContent = "メールアドレスを入力してください。"; });
  checkoutForm.addEventListener("submit", async (event) => {
    event.preventDefault(); busy(checkoutForm, true); status.textContent = "決済画面を準備しています…";
    try {
      const result = await api("/customer/billing/checkout", { method: "POST", body: JSON.stringify({ plan_code: "weekly_monthly", request_id: crypto.randomUUID() }) });
      const url = new URL(result.checkout_url);
      if (url.protocol !== "https:" || url.hostname !== "checkout.stripe.com") throw new Error("invalid_checkout_url");
      if (window.ToToNoEMarketing) window.ToToNoEMarketing.trackCheckoutStart();
      location.assign(url.href);
    } catch (error) { showError(error); busy(checkoutForm, false); }
  });
  initialize();
})();
