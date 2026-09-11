import {safeUrl,sanitizeBody} from './security.js';
function escHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function publicSection(contentType) {
  if (contentType === "podcast") return { hash: "podcast", label: "Podcast" };
  if (contentType === "archive") return { hash: "archive", label: "アーカイブ動画" };
  if (contentType === "seminar") return { hash: "seminars", label: "セミナー" };
  if (["video", "learning"].includes(contentType)) return { hash: "library", label: "学習コンテンツ" };
  return { hash: "columns", label: "コラム" };
}

function externalLinkLabel(type, url) {
  let host='';try {host=new URL(url).hostname;}catch{}
  if(host==='note.com'||host.endsWith('.note.com'))return 'noteで読む';
  if(host==='stand.fm'||host.endsWith('.stand.fm'))return 'Podcastを聴く';
  if(type==='video'||host==='youtu.be'||host==='youtube.com'||host.endsWith('.youtube.com'))return '動画を見る';
  return '元コンテンツを見る';
}
export function articleHtml(articleData) {
  const tags = (articleData.tags || []).map((tag) => `<span>${escHtml(tag)}</span>`).join("");
  const speakers = (articleData.speakers || []).map((person) => escHtml(person.name)).join("、") || "—";
  const hero = articleData.hero_url
    ? `<figure class="column-hero-image"><img src="${escHtml(safeUrl(articleData.hero_url, true))}" alt=""></figure>`
    : "";
  const linkLabel = externalLinkLabel(articleData.content_type, articleData.media_url);
  const mediaLink = articleData.media_url
    ? `<p class="content-media-link"><a href="${escHtml(safeUrl(articleData.media_url))}" target="_blank" rel="noopener">${escHtml(linkLabel)} ↗</a></p>`
    : "";
  const section = publicSection(articleData.content_type);
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="index,follow">
<meta name="content-revision" content="${articleData.revision}">
<title>${escHtml(articleData.title)}｜ToToNoE+ ${escHtml(articleData.content_type_label)}</title>
<meta name="description" content="${escHtml(articleData.excerpt)}">
<link rel="canonical" href="${escHtml(articleData.absolute_url)}">
<meta property="og:title" content="${escHtml(articleData.title)}｜ToToNoE+ ${escHtml(articleData.content_type_label)}">
<meta property="og:description" content="${escHtml(articleData.excerpt)}">
<meta property="og:type" content="article">
<meta property="og:image" content="https://basecraftas.com/projects/totonoe/assets/og-image.jpg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;700&family=Noto+Sans+JP:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../styles.css?v=20260905g">
<style>
.column-actor{display:flex;align-items:center;gap:.75rem;margin-top:1.2rem;color:var(--ink-soft);font-size:.9rem}
.column-actor strong{color:var(--teal-deep)}
.content-media-link{margin-top:1.2rem}
.content-media-link a{display:inline-flex;align-items:center;gap:.4rem;padding:.72rem 1rem;border-radius:999px;background:var(--teal-deep);color:#fff;font-weight:700;text-decoration:none}
.column-tags{display:flex;flex-wrap:wrap;gap:.45rem;margin-top:1.3rem}
.column-tags span{padding:.3rem .6rem;border-radius:999px;background:rgba(61,107,94,.12);color:var(--teal-deep);font-size:.74rem}
.column-hero-image{margin-top:2rem}
.column-hero-image img{width:100%;border-radius:18px;box-shadow:var(--shadow-sm)}
.column-body-inner{font-size:1rem;line-height:2.08}
.column-body-inner h2{margin:2.8rem 0 1rem;font-size:1.65rem;color:var(--teal-deep)}
.column-body-inner h3{margin:2rem 0 .8rem;font-size:1.28rem;color:var(--teal-deep)}
.column-body-inner p+p{margin-top:1.1rem}
.column-body-inner mark{background:#fff0a8;padding:.05em .22em;border-radius:.2em}
.column-body-inner blockquote{margin:2rem 0;padding:1.3rem 1.5rem;border-left:4px solid var(--sun);background:var(--sky-2)}
.editor-bubble{display:grid;grid-template-columns:92px minmax(0,1fr);gap:1rem;align-items:start;margin:2rem 0}
.editor-bubble.right{grid-template-columns:minmax(0,1fr) 92px}
.editor-bubble.right .bubble-avatar{order:2}
.bubble-avatar{text-align:center}
.character-icon{width:82px;height:82px;object-fit:cover;border-radius:50%;box-shadow:var(--shadow-card)}
.character-nameplate{display:block;width:110px;max-width:110px;margin:.35rem 0 0 50%;transform:translateX(-50%)}
.bubble-copy{padding:1.2rem 1.4rem;border:1px solid var(--line);border-radius:14px;background:var(--sky-2)}
.column-back{display:inline-block;margin-top:3rem;color:var(--teal-deep);font-weight:700}
@media(max-width:700px){.column-hero{padding:7rem 2rem 3rem}.column-wrap{width:min(100% - 32px,880px)}.editor-bubble,.editor-bubble.right{grid-template-columns:1fr}.editor-bubble.right .bubble-avatar{order:0}}
</style>
</head>
<body>
<header class="site-header scrolled" id="siteHeader">
  <div class="header-inner">
    <a href="../index.html" class="brand" aria-label="ToToNoE+ トップへ">
      <img src="../assets/totonoe-logo.png" alt="ToToNoE+" class="brand-logo" width="1442" height="566" decoding="async">
    </a>
    <nav class="site-nav" id="siteNav">
      <a href="../index.html">TOP</a>
      <div class="nav-dropdown">
        <a href="../service.html" class="nav-main">サービス</a>
        <div class="nav-menu" aria-label="サービスメニュー">
          <a href="../weekend-ai.html">週末のAI整え習慣</a>
          <span class="nav-disabled" aria-disabled="true">ウィークリー <small>準備中</small></span>
          <span class="nav-disabled" aria-disabled="true">法人向け支援 <small>準備中</small></span>
        </div>
      </div>
      <div class="nav-dropdown">
        <a href="../contents.html#seminars" class="nav-main active">コンテンツ</a>
        <div class="nav-menu" aria-label="コンテンツメニュー">
          <a href="../contents.html#seminars">セミナー</a>
          <a href="../contents.html#podcast">ポッドキャスト</a>
          <a href="../contents.html#library">学習コンテンツ</a>
          <a href="../contents.html#columns">コラム</a>
          <a href="../contents.html#archive">アーカイブ動画</a>
        </div>
      </div>
      <a href="../team.html">チーム</a>
      <a href="../faq.html">FAQ</a>
    </nav>
    <a href="../service.html" class="btn btn-cta header-cta">サービスを見る</a>
    <button class="nav-toggle" id="navToggle" aria-label="メニューを開く" aria-expanded="false">
      <span></span><span></span><span></span>
    </button>
  </div>
</header>
<main>
  <article class="column-article">
    <section class="column-article-hero">
      <div class="container">
        <p class="eyebrow">${escHtml(articleData.content_type_label)} / ${escHtml(articleData.published_at)}</p>
        <h1>${escHtml(articleData.title)}</h1>
        <p class="column-lead">${escHtml(articleData.excerpt)}</p>
        <p class="column-actor">Main Actor <strong>${escHtml(articleData.main_actor.name)}</strong> / Speaker <strong>${speakers}</strong></p>
        ${mediaLink}
        <div class="column-tags">${tags}</div>
        ${hero}
      </div>
    </section>
    <section class="section">
      <div class="container column-article-body column-body-inner">
        ${sanitizeBody(articleData.body_html) || "<p>本文はまだありません。</p>"}
        <a class="column-back" href="../contents.html#${section.hash}">← ${section.label}一覧へ戻る</a>
      </div>
    </section>
  </article>
</main>
<footer class="site-footer">
  <div class="container footer-grid">
    <div class="footer-brand">
      <a href="../index.html" class="footer-logo-link" aria-label="ToToNoE+ トップへ">
        <img src="../assets/totonoe-logo.png" alt="ToToNoE+" class="footer-logo" width="1442" height="566" loading="lazy" decoding="async">
      </a>
      <p>本質に向き合い、専門職が大切にしたいことへ戻れる余白をつくるチームプロジェクト。</p>
    </div>
    <nav class="footer-nav" aria-label="フッターナビゲーション">
      <a href="../index.html">TOP</a>
      <a href="../service.html">サービス</a>
      <a href="../contents.html#seminars">コンテンツ</a>
      <a href="../team.html">チーム</a>
      <a href="../faq.html">FAQ</a>
    </nav>
  </div>
  <div class="footer-base">
    <span>© 2026 ToToNoE+ / Base Craftas</span>
    <a href="../privacy.html">プライバシーポリシー</a>
    <a href="../legal.html">特定商取引法に基づく表記</a>
    <a href="../cancellation.html">キャンセル・解約ポリシー</a>
  </div>
</footer>
<script src="../common.js?v=20260905a"></script>
</body>
</html>
`;
}

