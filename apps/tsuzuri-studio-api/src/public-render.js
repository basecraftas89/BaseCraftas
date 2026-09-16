import {safeUrl,splitMemberBody} from './security.js';
function escHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function publicSection(contentType, destination) {
  if (contentType === "column" && destination === "characters") return { href: "../characters/", label: "キャラクター" };
  if (contentType === "podcast") return { href: "../weekend-ai.html#podcast", label: "ポッドキャスト" };
  if (contentType === "archive") return { href: "../weekend-ai.html#archive", label: "アーカイブ動画" };
  if (contentType === "seminar") return { href: "../index.html#latest", label: "セミナー" };
  if (["video", "learning"].includes(contentType)) return { href: "../tsumami/", label: "つまみ｜TSUMAMI" };
  return { href: "../tsuzuri/", label: "つづり｜TSUZURI" };
}

function externalLinkLabel(type, url) {
  let host='';try {host=new URL(url).hostname;}catch{}
  if(host==='note.com'||host.endsWith('.note.com'))return 'noteで読む';
  if(host==='stand.fm'||host.endsWith('.stand.fm'))return 'Podcastを聴く';
  if(type==='video'||host==='youtu.be'||host==='youtube.com'||host.endsWith('.youtube.com'))return '動画を見る';
  return '元コンテンツを見る';
}
export function articleHtml(articleData) {
  const body = splitMemberBody(articleData.body_html);
  const hasMemberSection = Boolean(articleData.has_member_section || body.hasMemberSection);
  const tags = (articleData.tags || []).map((tag) => `<span>${escHtml(tag)}</span>`).join("");
  const speakers = (articleData.speakers || []).map((person) => escHtml(person.name)).join("、") || "—";
  const hero = articleData.hero_url
    ? `<figure class="column-hero-image"><img src="${escHtml(safeUrl(articleData.hero_url, true))}" alt=""></figure>`
    : "";
  const linkLabel = externalLinkLabel(articleData.content_type, articleData.media_url);
  const mediaLink = articleData.media_url
    ? `<p class="content-media-link"><a href="${escHtml(safeUrl(articleData.media_url))}" target="_blank" rel="noopener">${escHtml(linkLabel)} ↗</a></p>`
    : "";
  const section = publicSection(articleData.content_type, articleData.destination);
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
<link rel="stylesheet" href="../styles.css?v=20260916-content-hub">
<style>
.column-actor{display:flex;align-items:center;gap:.75rem;margin-top:1.2rem;color:var(--ink-soft);font-size:.9rem}
.column-actor strong{color:var(--teal-deep)}
.content-media-link{margin-top:1.2rem}
.content-media-link a{display:inline-flex;align-items:center;gap:.4rem;padding:.72rem 1rem;border-radius:999px;background:var(--teal-deep);color:#fff;font-weight:700;text-decoration:none}
.column-tags{display:flex;flex-wrap:wrap;gap:.45rem;margin-top:1.3rem}
.column-tags span{padding:.3rem .6rem;border-radius:999px;background:rgba(61,107,94,.12);color:var(--teal-deep);font-size:.74rem}
.column-hero-image{margin:0 0 2.25rem}
.column-hero-image img{display:block;width:100%;aspect-ratio:16/9;object-fit:contain;border-radius:18px;background:#fff;box-shadow:var(--shadow-sm)}
.column-body-inner{font-size:1rem;line-height:2.08;overflow-wrap:anywhere}
.column-body-inner h2{margin:2.8rem 0 1rem;font-size:1.65rem;color:var(--teal-deep)}
.column-body-inner h3{margin:2rem 0 .8rem;font-size:1.28rem;color:var(--teal-deep)}
.column-body-inner figure{margin:1.8rem 0}.column-body-inner figure img{display:block;width:100%;height:auto}.column-body-inner figcaption{margin-top:.65rem;font-size:.8rem;line-height:1.7;color:var(--ink-soft)}
.column-body-inner p+p{margin-top:1.1rem}
.column-body-inner a{color:var(--sage);font-weight:600;text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:.18em}
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
.member-content-gate{margin:2.5rem 0 0;padding:1.5rem;border:1px solid rgba(61,107,94,.24);border-radius:16px;background:linear-gradient(135deg,#f3f8f5,#fffaf4);text-align:center}
.member-content-gate strong,.member-content-gate span{display:block}.member-content-gate strong{color:var(--teal-deep);font-size:1.08rem}.member-content-gate span{margin:.45rem 0 1rem;color:var(--ink-soft);font-size:.88rem}.member-content-gate button{display:inline-flex;justify-content:center;align-items:center;min-height:42px;padding:.65rem 1.1rem;border:0;border-radius:999px;background:var(--teal-deep);color:#fff;font:700 .86rem/1.3 inherit;cursor:pointer}.member-content-status{margin:.8rem 0 0!important;font-size:.78rem!important;color:var(--ink-soft)!important}
.article-share{margin:3.3rem 0 0;padding-top:1.5rem;border-top:1px solid var(--line)}.article-share h2{margin:0 0 .35rem!important;font-size:1rem!important}.article-share p{margin:0 0 .9rem;color:var(--ink-soft);font-size:.82rem}.article-share-buttons{display:flex;flex-wrap:wrap;gap:.55rem}.article-share-buttons button{min-height:40px;padding:.55rem .9rem;border:1px solid var(--line);border-radius:999px;background:#fff;color:var(--teal-deep);font-weight:700;cursor:pointer}.article-share-buttons button:hover{border-color:var(--sage);background:var(--sky-2)}
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
      <a href="../weekend-ai.html">週末のAI整え習慣</a>
      <div class="nav-dropdown"><a href="../service.html" class="nav-main">サービス</a><div class="nav-menu" aria-label="サービスメニュー"><a href="../tayori.html">たより｜TAYORI</a><span class="nav-disabled" aria-disabled="true">いろは｜IROHA <small>準備中</small></span><span class="nav-disabled" aria-disabled="true">法人研修 <small>準備中</small></span><span class="nav-disabled" aria-disabled="true">プロダクト <small>準備中</small></span></div></div><div class="nav-dropdown"><a href="../contents.html" class="nav-main active">コンテンツ</a><div class="nav-menu" aria-label="コンテンツメニュー"><a href="../tsuzuri/">コラム</a><a href="../tsumami/">動画コンテンツ</a><a href="../contents.html#archive">アーカイブ</a><a href="../contents.html#podcast">ポッドキャスト</a><a href="../contents.html#seminars">セミナー</a></div></div>
      <a href="../characters/">キャラクター</a>
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
        ${hero}
        <p class="eyebrow">${escHtml(articleData.content_type_label)} / ${escHtml(articleData.published_at)}</p>
        <h1>${escHtml(articleData.title)}</h1>
        <p class="column-lead">${escHtml(articleData.excerpt)}</p>
        <p class="column-actor">Main Actor <strong>${escHtml(articleData.main_actor.name)}</strong> / Speaker <strong>${speakers}</strong></p>
        ${mediaLink}
        <div class="column-tags">${tags}</div>
      </div>
    </section>
    <section class="section">
      <div class="container column-article-body column-body-inner">
        ${body.publicHtml || (hasMemberSection ? "" : "<p>本文はまだありません。</p>")}
        ${hasMemberSection ? `<section class="member-content-gate" data-member-article-id="${escHtml(articleData.id)}" data-member-revision="${escHtml(articleData.revision)}"><strong>ここから先は会員限定です</strong><span>ToToNoE+の会員としてログインすると、続きからお読みいただけます。</span><button type="button" data-member-unlock>会員限定部分を表示</button><p class="member-content-status" role="status" data-member-status></p></section><div data-member-content hidden></div>` : ""}
        <section class="article-share" aria-labelledby="articleShareTitle"><h2 id="articleShareTitle">この記事を共有する</h2><p>気づきを、必要な人へ届ける。</p><div class="article-share-buttons"><button type="button" data-share="x">X</button><button type="button" data-share="threads">Threads</button><button type="button" data-share="instagram">Instagram</button><button type="button" data-share="copy">リンクをコピー</button></div><p class="member-content-status" role="status" data-share-status></p></section>
        <a class="column-back" href="${section.href}">← ${section.label}一覧へ戻る</a>
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
      <a href="../weekend-ai.html">週末のAI整え習慣</a>
      <a href="../service.html">サービス</a><a href="../contents.html">コンテンツ</a>
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
<script src="../article-actions.js?v=20260913a"></script>
</body>
</html>
`;
}
