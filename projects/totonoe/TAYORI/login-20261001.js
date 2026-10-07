(() => {
  "use strict";
  if (location.protocol === "file:") {
    location.replace("https://basecraftas.com/projects/totonoe/TAYORI/login" + location.search);
    return;
  }
  const AUTH_BASE = "/api/totonoe-member/api/customer/auth";
  const passwordForm = document.querySelector("#memberLoginPasswordForm");
  const setupEmailForm = document.querySelector("#memberLoginEmailForm");
  const codeForm = document.querySelector("#memberLoginCodeForm");
  const passwordSetupForm = document.querySelector("#memberLoginPasswordSetupForm");
  const status = document.querySelector("#memberLoginStatus");
  let email = "";

  function returnPath() {
    const fallback = "/projects/totonoe/TAYORI/";
    const value = new URLSearchParams(location.search).get("return") || fallback;
    return /^\/projects\/totonoe\/(?:TAYORI\/(?:index\.html)?|IROHA\/(?:mypage|dashboard|lesson)(?:\.html)?|tsuzuri\/[a-z0-9][a-z0-9-]*\.html)(?:[?#].*)?$/.test(value) ? value : fallback;
  }
  function message(code) {
    if (code === "auth_email_cooldown") return "確認メールは送信から60秒以上あけて再送してください。届いているメールもご確認ください。";
    if (code === "auth_email_daily_limit_reached") return "本日の確認メール送信上限に達しました。次の午前9時（日本時間）以降にお試しください。設定済みのパスワードでのログインは利用できます。";
    return ({ invalid_email: "メールアドレスの形式をご確認ください。", invalid_password: "パスワードは12文字以上で入力してください。", invalid_login: "メールアドレスまたはパスワードが一致しません。", too_many_requests: "試行回数が上限に達しました。時間をおいてお試しください。", auth_email_delivery_failed: "再設定用メールを送信できませんでした。時間をおいて再度お試しください。", invalid_auth_code: "認証コードが一致しません。", auth_code_expired: "認証コードの有効期限が切れました。もう一度送信してください。" })[code] || "処理を完了できませんでした。時間をおいて再度お試しください。";
  }
  async function api(path, body) {
    const response = await fetch(AUTH_BASE + path, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(message(payload.error));
    return payload;
  }
  function busy(form, value) { form.querySelectorAll("input,button").forEach((element) => { element.disabled = value; }); }
  function show(name) {
    document.querySelector("h1").textContent = name === "password" ? "メールアドレスとパスワードでログイン" : "パスワードの初回設定・変更";
    document.querySelector(".member-login-intro").textContent = name === "password" ? "登録済みのメールアドレスとパスワードを入力してください。" : "登録メールで本人確認後、12文字以上のパスワードを設定します。";
    passwordForm.hidden = name !== "password"; setupEmailForm.hidden = name !== "setup-email"; codeForm.hidden = name !== "code"; passwordSetupForm.hidden = name !== "password-setup";
    const target = name === "password" ? passwordForm.elements.email : name === "setup-email" ? setupEmailForm.elements.email : name === "code" ? codeForm.elements.code : passwordSetupForm.elements.password;
    window.setTimeout(() => target.focus(), 20);
  }
  passwordForm.addEventListener("submit", async (event) => {
    event.preventDefault(); busy(passwordForm, true); status.textContent = "ログインしています…";
    try { await api("/password/login", { email: passwordForm.elements.email.value, password: passwordForm.elements.password.value }); location.assign(returnPath()); }
    catch (error) { status.textContent = error.message; } finally { busy(passwordForm, false); }
  });
  document.querySelector("#memberLoginSetup").addEventListener("click", () => { status.textContent = ""; show("setup-email"); });
  document.querySelector("#memberLoginPasswordBack").addEventListener("click", () => { status.textContent = ""; show("password"); });
  setupEmailForm.addEventListener("submit", async (event) => {
    event.preventDefault(); busy(setupEmailForm, true); status.textContent = "設定用の確認コードを送信しています…";
    try { email = setupEmailForm.elements.email.value.trim(); const result = await api("/request-code", { email }); show("code"); status.textContent = `${email} へ認証コードを送信しました。認証後にパスワードを設定します。`; if (result.dev_code && ["localhost", "127.0.0.1"].includes(location.hostname)) codeForm.elements.code.value = result.dev_code; }
    catch (error) { status.textContent = error.message; } finally { busy(setupEmailForm, false); }
  });
  codeForm.addEventListener("submit", async (event) => {
    event.preventDefault(); busy(codeForm, true); status.textContent = "認証しています…";
    try { await api("/verify-code", { email, code: codeForm.elements.code.value }); status.textContent = "認証できました。新しいパスワードを設定してください。"; show("password-setup"); }
    catch (error) { status.textContent = error.message; } finally { busy(codeForm, false); }
  });
  passwordSetupForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const password = passwordSetupForm.elements.password.value;
    if (password !== passwordSetupForm.elements.password_confirm.value) { status.textContent = "パスワードが一致しません。"; return; }
    busy(passwordSetupForm, true); status.textContent = "パスワードを設定しています…";
    try { await api("/password/set", { password }); location.assign(returnPath()); }
    catch (error) { status.textContent = error.message; } finally { busy(passwordSetupForm, false); }
  });
  document.querySelector("#memberLoginBack").addEventListener("click", () => { status.textContent = ""; show("setup-email"); });
  if (new URLSearchParams(location.search).get("setup") === "1") show("setup-email");
})();
