(() => {
  "use strict";

  const status = (selector, message) => {
    const element = document.querySelector(selector);
    if (element) element.textContent = message;
  };
  const articleUrl = () => `${location.origin}${location.pathname}`;
  const articleTitle = () => document.querySelector("h1")?.textContent?.trim() || document.title;
  const shareText = () => `${articleTitle()}\n${articleUrl()}`;

  async function copyArticleUrl(message) {
    try {
      await navigator.clipboard.writeText(articleUrl());
      status("[data-share-status]", message);
    } catch (_error) {
      status("[data-share-status]", "リンクをコピーできませんでした。ブラウザのURL欄からコピーしてください。");
    }
  }

  document.addEventListener("click", async (event) => {
    const unlock = event.target.closest("[data-member-unlock]");
    if (unlock) {
      const gate = unlock.closest("[data-member-article-id]");
      const target = document.querySelector("[data-member-content]");
      if (!gate || !target) return;
      unlock.disabled = true;
      status("[data-member-status]", "会員情報を確認しています…");
      try {
        const id = encodeURIComponent(gate.dataset.memberArticleId || "");
        const revision = encodeURIComponent(gate.dataset.memberRevision || "");
        const response = await fetch(`/api/totonoe-member/api/member/articles/${id}/body?revision=${revision}`, { credentials: "same-origin", headers: { accept: "application/json" } });
        if (response.status === 401) {
          const back = encodeURIComponent(`${location.pathname}${location.search}${location.hash}`);
          location.assign(`/projects/totonoe/TAYORI/login.html?return=${back}`);
          return;
        }
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(response.status === 403 ? "このコンテンツを閲覧できる会員契約がありません。" : "限定部分を読み込めませんでした。");
        target.innerHTML = payload.body_html || "";
        target.hidden = false;
        gate.remove();
      } catch (error) {
        status("[data-member-status]", error.message);
        unlock.disabled = false;
      }
      return;
    }

    const share = event.target.closest("[data-share]");
    if (!share) return;
    const text = shareText();
    const encoded = encodeURIComponent(text);
    if (share.dataset.share === "x") window.open(`https://x.com/intent/tweet?text=${encoded}`, "_blank", "noopener,noreferrer");
    else if (share.dataset.share === "threads") window.open(`https://www.threads.net/intent/post?text=${encoded}`, "_blank", "noopener,noreferrer");
    else if (share.dataset.share === "instagram") {
      if (navigator.share) {
        try { await navigator.share({ title: document.title, text: articleTitle(), url: articleUrl() }); }
        catch (error) { if (error.name !== "AbortError") status("[data-share-status]", "共有メニューを開けませんでした。"); }
      } else await copyArticleUrl("リンクをコピーしました。Instagramで貼り付けて共有してください。");
    } else await copyArticleUrl("リンクをコピーしました。");
  });
})();
