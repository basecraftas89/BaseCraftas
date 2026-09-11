(() => {
  "use strict";

  const API_BASE = "/api/totonoe-member";
  const dialog = document.querySelector("#tayoriCheckoutDialog");
  const emailForm = document.querySelector("#tayoriEmailForm");
  const codeForm = document.querySelector("#tayoriCodeForm");
  const errorBox = document.querySelector("#tayoriAuthError");
  if (!dialog || !emailForm || !codeForm || !errorBox) return;

  let verifiedEmail = "";
  let checkoutRequestId = "";

  const messages = {
    invalid_email: "メールアドレスの形式をご確認ください。",
    too_many_requests: "短時間に送信回数が上限に達しました。10分ほど待ってからお試しください。",
    auth_email_delivery_failed: "認証メールを送信できませんでした。時間をおいて再度お試しください。",
    invalid_auth_code: "認証コードが一致しません。",
    auth_code_expired: "認証コードの有効期限が切れました。もう一度送信してください。",
    subscription_already_exists: "このメールアドレスには利用中のTAYORI契約があります。会員ページからご確認ください。",
    stripe_checkout_not_enabled: "現在はテスト決済の最終確認中です。受付開始までしばらくお待ちください。",
  };

  async function api(path, options = {}) {
    const response = await fetch(API_BASE + path, {
      credentials: "same-origin",
      ...options,
      headers: { "content-type": "application/json", ...(options.headers || {}) },
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(messages[result.error] || "処理を完了できませんでした。時間をおいて再度お試しください。");
    return result;
  }

  function setStep(step) {
    emailForm.hidden = step !== "email";
    codeForm.hidden = step !== "code";
    errorBox.textContent = "";
    window.setTimeout(() => (step === "email" ? emailForm.elements.email : codeForm.elements.code).focus(), 20);
  }

  function setBusy(form, busy) {
    form.querySelectorAll("button, input").forEach((element) => { element.disabled = busy; });
  }

  function openDialog() {
    checkoutRequestId = crypto.randomUUID();
    setStep("email");
    dialog.showModal();
  }

  document.querySelectorAll("[data-tayori-checkout]").forEach((button) => button.addEventListener("click", openDialog));
  document.querySelector("[data-tayori-dialog-close]")?.addEventListener("click", () => dialog.close());
  document.querySelector("[data-tayori-auth-back]")?.addEventListener("click", () => setStep("email"));
  dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });

  emailForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorBox.textContent = "";
    setBusy(emailForm, true);
    try {
      verifiedEmail = emailForm.elements.email.value.trim();
      const result = await api("/api/customer/auth/request-code", {
        method: "POST",
        body: JSON.stringify({ email: verifiedEmail }),
      });
      setStep("code");
      if (result.dev_code && ["localhost", "127.0.0.1"].includes(window.location.hostname)) codeForm.elements.code.value = result.dev_code;
    } catch (error) {
      errorBox.textContent = error.message;
    } finally {
      setBusy(emailForm, false);
    }
  });

  codeForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorBox.textContent = "";
    setBusy(codeForm, true);
    try {
      await api("/api/customer/auth/verify-code", {
        method: "POST",
        body: JSON.stringify({ email: verifiedEmail, code: codeForm.elements.code.value }),
      });
      const checkout = await api("/api/customer/billing/checkout", {
        method: "POST",
        body: JSON.stringify({ request_id: checkoutRequestId, plan_code: "weekly_monthly", audience_type: "general" }),
      });
      window.location.assign(checkout.checkout_url);
    } catch (error) {
      errorBox.textContent = error.message;
    } finally {
      setBusy(codeForm, false);
    }
  });

  if (new URLSearchParams(window.location.search).get("checkout") === "cancelled") {
    window.setTimeout(() => {
      document.querySelector("#pricing")?.scrollIntoView({ behavior: "smooth", block: "start" });
      errorBox.textContent = "決済は行われていません。内容をご確認のうえ、いつでも再開できます。";
      dialog.showModal();
    }, 250);
  }
})();
