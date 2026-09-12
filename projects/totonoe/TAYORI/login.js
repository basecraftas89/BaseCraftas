(() => {
  "use strict";
  const API_BASE = "/api/totonoe-member/api/customer/auth";
  const emailForm = document.querySelector("#memberLoginEmailForm");
  const codeForm = document.querySelector("#memberLoginCodeForm");
  const status = document.querySelector("#memberLoginStatus");
  let email = "";

  function returnPath() {
    const fallback = "/projects/totonoe/TAYORI/";
    const value = new URLSearchParams(location.search).get("return") || fallback;
    return /^\/projects\/totonoe\/(?:TAYORI\/(?:index\.html)?|IROHA\/(?:mypage|dashboard|lesson)\.html)(?:[?#].*)?$/.test(value) ? value : fallback;
  }

  function message(code) {
    return ({
      invalid_email: "メールアドレスの形式をご確認ください。",
      too_many_requests: "送信回数が上限に達しました。10分ほど待ってからお試しください。",
      auth_email_delivery_failed: "認証メールを送信できませんでした。時間をおいて再度お試しください。",
      invalid_auth_code: "認証コードが一致しません。",
      auth_code_expired: "認証コードの有効期限が切れました。もう一度送信してください。",
      customer_account_unavailable: "このアカウントは現在利用できません。",
    })[code] || "処理を完了できませんでした。時間をおいて再度お試しください。";
  }

  async function api(path, body) {
    const response = await fetch(API_BASE + path, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(message(payload.error));
    return payload;
  }

  function busy(form, value) { form.querySelectorAll("input,button").forEach((element) => { element.disabled = value; }); }
  function step(name) {
    emailForm.hidden = name !== "email";
    codeForm.hidden = name !== "code";
    status.textContent = "";
    window.setTimeout(() => (name === "email" ? emailForm.elements.email : codeForm.elements.code).focus(), 20);
  }

  emailForm.addEventListener("submit", async (event) => {
    event.preventDefault();status.textContent = "";busy(emailForm, true);
    try {
      email = emailForm.elements.email.value.trim();
      const result = await api("/request-code", { email });
      step("code");
      if (result.dev_code && ["localhost", "127.0.0.1"].includes(location.hostname)) codeForm.elements.code.value = result.dev_code;
    } catch (error) { status.textContent = error.message; }
    finally { busy(emailForm, false); }
  });
  codeForm.addEventListener("submit", async (event) => {
    event.preventDefault();status.textContent = "";busy(codeForm, true);
    try {
      await api("/verify-code", { email, code: codeForm.elements.code.value });
      location.assign(returnPath());
    } catch (error) { status.textContent = error.message; }
    finally { busy(codeForm, false); }
  });
  document.querySelector("#memberLoginBack").addEventListener("click", () => step("email"));
})();
