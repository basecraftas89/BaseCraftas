(() => {
  "use strict";
  const identity = document.querySelector("#tayoriStaffIdentity");
  const form = document.querySelector("#tayoriStaffPasswordForm");
  const status = document.querySelector("#tayoriStaffPasswordStatus");
  const apiBase = "/api/totonoe-studio/api";

  async function checkMember() {
    try {
      const response = await fetch(apiBase + "/me", { credentials: "same-origin", headers: { accept: "application/json" } });
      const payload = await response.json();
      if (!response.ok || !payload.member || payload.member.status !== "active" || !["admin", "editor"].includes(payload.member.role)) throw new Error("この操作は登録済みの管理者・編集者のみ利用できます。");
      identity.textContent = `${payload.member.email} のパスワードを設定します。`;
      form.hidden = false;
    } catch (error) {
      identity.textContent = "運営メンバーの認証を確認できませんでした。Studioへログインし直してください。";
      status.textContent = error.message;
    }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const password = form.elements.password.value;
    if (password !== form.elements.password_confirm.value) { status.textContent = "パスワードが一致しません。"; return; }
    for (const element of form.querySelectorAll("input,button")) element.disabled = true;
    status.textContent = "設定しています…";
    try {
      const response = await fetch(apiBase + "/customer/auth/password/staff", {
        method: "POST", credentials: "same-origin",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ password }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error === "invalid_password" ? "パスワードは12文字以上で入力してください。" : "パスワードを設定できませんでした。Studioのログイン状態をご確認ください。");
      location.assign("/projects/totonoe/TAYORI/");
    } catch (error) {
      status.textContent = error.message;
      for (const element of form.querySelectorAll("input,button")) element.disabled = false;
    }
  });
  checkMember();
})();
