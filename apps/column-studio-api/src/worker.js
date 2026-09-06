const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/svg+xml",
]);

const DEFAULT_REPOSITORY = "basecraftas89/BaseCraftas";
const DEFAULT_BRANCH = "main";
const TOTONOE_MEMBERS = [
  { id: "shindo-toshiki", name: "神藤 俊希" },
  { id: "kajiwara-yusuke", name: "梶原 祐輔" },
  { id: "kaito-taisho", name: "海藤 大将" },
  { id: "nakagawa-masahiro", name: "中川 理浩" },
  { id: "kimura-koharu", name: "木村 倖晴" },
  { id: "ito-masaya", name: "伊東 雅也" },
  { id: "tsunashima-shu", name: "綱島 脩" },
  { id: "kuroishi-ryota", name: "黒石 涼太" },
  { id: "kojima-ken", name: "小島 健" },
  { id: "kaigaishi-shogo", name: "貝ヶ石 祥吾" },
];

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { ...jsonHeaders, ...(init.headers || {}) },
  });
}

function getActorEmail(request, env) {
  const accessEmail = request.headers.get("cf-access-authenticated-user-email");
  if (accessEmail) return accessEmail.toLowerCase();
  if (env.ALLOW_DEV_AUTH !== "true") return "";
  return (
    request.headers.get("x-column-studio-dev-email") ||
    ""
  ).toLowerCase();
}

function uid(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function normalizePath(pathname) {
  const rawPath = pathname.replace(/\/+$/, "") || "/";
  const basePath = "/api/column-studio";
  const mediaBasePath = "/column-media";
  if (rawPath === basePath) return "/";
  if (rawPath.startsWith(`${basePath}/`)) {
    return rawPath.slice(basePath.length).replace(/\/+$/, "") || "/";
  }
  if (rawPath.startsWith(`${mediaBasePath}/`)) {
    return `/media/${rawPath.slice(mediaBasePath.length).replace(/^\/+/, "")}`;
  }
  return rawPath;
}

function safeFilename(name) {
  return String(name || "image")
    .normalize("NFKC")
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90) || "image";
}

function escHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function publishedDate() {
  return new Date().toISOString().slice(0, 10);
}

function findTotonoEPerson(id) {
  return TOTONOE_MEMBERS.find((person) => person.id === id) || TOTONOE_MEMBERS[0];
}

function normalizePublishedBody(html) {
  return String(html || "")
    .replace(/src="assets\/characters\//g, 'src="../../../apps/column-studio/assets/characters/')
    .replace(/href="assets\/characters\//g, 'href="../../../apps/column-studio/assets/characters/');
}

function publicAssetUrl(request, key) {
  const url = new URL(request.url);
  if (url.hostname === "basecraftas.com") {
    return `${url.origin}/column-media/${key}`;
  }
  return `${url.origin}/media/${key}`;
}

function articleJson(article, publishedAt) {
  const tags = JSON.parse(article.tags || "[]");
  const mainActor = findTotonoEPerson(article.main_actor_id);
  return {
    id: article.id,
    slug: article.slug,
    title: article.title,
    excerpt: article.excerpt,
    category: article.category,
    destination: article.destination,
    tags,
    main_actor_id: mainActor.id,
    main_actor: mainActor,
    hero_url: article.hero_url,
    body_html: normalizePublishedBody(article.body_html),
    status: "published",
    url: `columns/${article.slug}.html`,
    absolute_url: `https://basecraftas.com/projects/totonoe/columns/${article.slug}.html`,
    published_at: publishedAt,
    updated_at: new Date().toISOString(),
  };
}

function articleHtml(articleData) {
  const tags = (articleData.tags || []).map((tag) => `<span>${escHtml(tag)}</span>`).join("");
  const hero = articleData.hero_url
    ? `<figure class="column-hero-image"><img src="${escHtml(articleData.hero_url)}" alt=""></figure>`
    : "";
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="index,follow">
<title>${escHtml(articleData.title)}｜ToToNoE+ コラム</title>
<meta name="description" content="${escHtml(articleData.excerpt)}">
<link rel="canonical" href="${escHtml(articleData.absolute_url)}">
<meta property="og:title" content="${escHtml(articleData.title)}｜ToToNoE+ コラム">
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
        <p class="eyebrow">COLUMN / ${escHtml(articleData.published_at)}</p>
        <h1>${escHtml(articleData.title)}</h1>
        <p class="column-lead">${escHtml(articleData.excerpt)}</p>
        <p class="column-actor">Main Actor <strong>${escHtml(articleData.main_actor.name)}</strong></p>
        <div class="column-tags">${tags}</div>
        ${hero}
      </div>
    </section>
    <section class="section">
      <div class="container column-article-body column-body-inner">
        ${articleData.body_html || "<p>本文はまだありません。</p>"}
        <a class="column-back" href="../contents.html#columns">← コラム一覧へ戻る</a>
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

function columnIndexHtml() {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>コラム｜ToToNoE+</title>
<meta name="description" content="ToToNoE+のコラム一覧です。">
<link rel="icon" href="../assets/totonoe-logo.png">
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;700&family=Noto+Sans+JP:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../styles.css?v=20260905g">
<style>
.columns-hero{padding:9rem 5rem 4rem;background:var(--sky-2);border-bottom:1px solid var(--line)}
.columns-wrap{width:min(100% - 40px,1080px);margin:0 auto}
.columns-hero .eyebrow{font-family:'Montserrat',sans-serif;font-size:.72rem;letter-spacing:.22em;color:var(--teal);font-weight:700}
.columns-hero h1{margin-top:.8rem;font-size:clamp(2.2rem,4vw,3.5rem)}
.columns-hero p{margin-top:1rem;max-width:680px;color:var(--ink-soft)}
.columns-list{padding:4rem 0 5rem}
.columns-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1.3rem}
.column-card{display:flex;flex-direction:column;min-height:260px;padding:1.5rem;border:1px solid var(--line);border-radius:14px;background:#fff;box-shadow:var(--shadow-sm);transition:transform .18s ease,box-shadow .18s ease}
.column-card:hover{transform:translateY(-4px);box-shadow:var(--shadow)}
.column-card img{width:100%;aspect-ratio:1.91/1;object-fit:cover;border-radius:10px;margin-bottom:1.1rem;background:var(--mist)}
.column-card time{font-family:'Montserrat',sans-serif;font-size:.68rem;letter-spacing:.12em;color:var(--teal);font-weight:700}
.column-card h2{margin-top:.55rem;font-size:1.12rem;line-height:1.55}
.column-card p{margin-top:.6rem;color:var(--ink-soft);font-size:.88rem;line-height:1.8}
.column-card .tags{margin-top:auto;padding-top:1.2rem;display:flex;flex-wrap:wrap;gap:.45rem}
.column-card .tags span{padding:.28rem .55rem;border-radius:999px;background:var(--mist);color:var(--teal);font-size:.72rem}
.empty-columns{padding:2rem;border:1px solid var(--line);border-radius:14px;background:#fff;color:var(--ink-soft)}
@media(max-width:900px){.columns-grid{grid-template-columns:1fr 1fr}.columns-hero{padding:7rem 2rem 3rem}}
@media(max-width:640px){.columns-grid{grid-template-columns:1fr}.columns-wrap{width:min(100% - 32px,1080px)}}
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
  <section class="columns-hero">
    <div class="columns-wrap">
      <p class="eyebrow">COLUMN</p>
      <h1>コラム</h1>
      <p>ToToNoE+の考え方、AIニュースの深掘り、専門職の働き方を読み直せる形で整理していきます。</p>
    </div>
  </section>
  <section class="columns-list">
    <div class="columns-wrap">
      <div class="columns-grid" id="columnsGrid"></div>
    </div>
  </section>
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
<script>
(function(){
  var grid=document.getElementById('columnsGrid');
  function esc(v){var d=document.createElement('div');d.textContent=v||'';return d.innerHTML;}
  fetch('../data/columns/index.json',{cache:'no-store'}).then(function(res){return res.json();}).then(function(data){
    var articles=(data.articles||[]).filter(function(article){return article.status==='published';});
    if(!articles.length){grid.innerHTML='<div class="empty-columns">公開中のコラムはまだありません。</div>';return;}
    grid.innerHTML=articles.map(function(article){
      var tags=(article.tags||[]).slice(0,3).map(function(tag){return '<span>'+esc(tag)+'</span>';}).join('');
      return '<a class="column-card" href="'+esc(article.url)+'">'+
        (article.hero_url?'<img src="'+esc(article.hero_url)+'" alt="">':'')+
        '<time>'+esc(article.published_at||article.updated_at||'')+'</time>'+
        '<h2>'+esc(article.title)+'</h2>'+
        '<p>'+esc(article.excerpt)+'</p>'+
        '<div class="tags">'+tags+'</div>'+
      '</a>';
    }).join('');
  }).catch(function(){grid.innerHTML='<div class="empty-columns">コラム一覧を読み込めませんでした。</div>';});
})();
</script>
</body>
</html>
`;
}

async function githubRequest(env, path, options = {}) {
  if (!env.GITHUB_TOKEN) {
    throw new Error("github_token_missing");
  }
  const res = await fetch(`https://api.github.com/repos/${env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY}${path}`, {
    ...options,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${env.GITHUB_TOKEN}`,
      "content-type": "application/json",
      "user-agent": "basecraftas-column-studio",
      "x-github-api-version": "2022-11-28",
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const error = new Error(data.message || `github_${res.status}`);
    error.status = res.status;
    throw error;
  }
  return data;
}

async function fetchGitHubFile(env, path) {
  try {
    return await githubRequest(env, `/contents/${encodeURIComponent(path).replace(/%2F/g, "/")}?ref=${encodeURIComponent(env.GITHUB_BRANCH || DEFAULT_BRANCH)}`);
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}

function encodeContent(content) {
  return btoa(unescape(encodeURIComponent(content)));
}

function decodeContent(content) {
  return decodeURIComponent(escape(atob(String(content || "").replace(/\n/g, ""))));
}

async function upsertGitHubFile(env, path, content, message) {
  const current = await fetchGitHubFile(env, path);
  const body = {
    message,
    content: encodeContent(content),
    branch: env.GITHUB_BRANCH || DEFAULT_BRANCH,
  };
  if (current && current.sha) body.sha = current.sha;
  const result = await githubRequest(env, `/contents/${encodeURIComponent(path).replace(/%2F/g, "/")}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
  return result.commit && result.commit.sha;
}

async function publishArticleToGitHub(env, article) {
  const publishedAt = publishedDate();
  const data = articleJson(article, publishedAt);
  const articleJsonPath = `projects/totonoe/data/columns/${article.slug}.json`;
  const articleHtmlPath = `projects/totonoe/columns/${article.slug}.html`;
  const indexPath = "projects/totonoe/data/columns/index.json";
  const indexHtmlPath = "projects/totonoe/columns/index.html";
  const message = `Publish column: ${article.title}`;

  await upsertGitHubFile(env, articleJsonPath, `${JSON.stringify(data, null, 2)}\n`, message);
  await upsertGitHubFile(env, articleHtmlPath, articleHtml(data), message);
  await upsertGitHubFile(env, indexHtmlPath, columnIndexHtml(), "Add column index page");

  const currentIndex = await fetchGitHubFile(env, indexPath);
  let index = { updated_at: null, articles: [] };
  if (currentIndex && currentIndex.content) {
    try {
      index = JSON.parse(decodeContent(currentIndex.content));
    } catch (_error) {
      index = { updated_at: null, articles: [] };
    }
  }
  const summary = {
    id: data.id,
    slug: data.slug,
    title: data.title,
    excerpt: data.excerpt,
    category: data.category,
    tags: data.tags,
    main_actor_id: data.main_actor_id,
    main_actor: data.main_actor,
    hero_url: data.hero_url,
    status: "published",
    url: data.url,
    published_at: data.published_at,
    updated_at: data.updated_at,
  };
  index.articles = [summary].concat((index.articles || []).filter((item) => item.slug !== data.slug));
  index.updated_at = new Date().toISOString();
  const commitSha = await upsertGitHubFile(env, indexPath, `${JSON.stringify(index, null, 2)}\n`, message);
  return { commitSha, liveUrl: data.absolute_url };
}

async function getMember(env, email) {
  if (!email) return null;
  return env.DB.prepare(
    "SELECT id, email, name, role, status FROM members WHERE lower(email) = ? AND status = 'active'"
  )
    .bind(email)
    .first();
}

async function requireRole(request, env, roles) {
  const email = getActorEmail(request, env);
  const member = await getMember(env, email);
  if (!member || !roles.includes(member.role)) {
    return { error: json({ error: "forbidden" }, { status: 403 }) };
  }
  return { email, member };
}

async function readJson(request) {
  try {
    return await request.json();
  } catch (_error) {
    return null;
  }
}

function normalizeArticle(input, fallback = {}) {
  const tags = Array.isArray(input.tags)
    ? input.tags
    : String(input.tags || fallback.tags || "")
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);

  return {
    slug: String(input.slug || fallback.slug || "").trim(),
    title: String(input.title || fallback.title || "Untitled").trim(),
    excerpt: String(input.excerpt || fallback.excerpt || "").trim(),
    category: String(input.category || fallback.category || "brand").trim(),
    destination: "totonoe",
    tags: JSON.stringify(tags),
    main_actor_id: findTotonoEPerson(String(input.main_actor_id || input.mainActorId || fallback.main_actor_id || "shindo-toshiki").trim()).id,
    hero_url: String(input.hero_url || input.heroUrl || fallback.hero_url || "").trim(),
    body_html: String(input.body_html || input.bodyHtml || fallback.body_html || ""),
    status: String(input.status || fallback.status || "draft"),
  };
}

async function recordVersion(env, article, actorEmail) {
  await env.DB.prepare(
    `INSERT INTO article_versions
      (id, article_id, title, excerpt, category, destination, tags, main_actor_id, hero_url, body_html, status, actor_email)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      uid("ver"),
      article.id,
      article.title,
      article.excerpt,
      article.category,
      article.destination,
      article.tags,
      article.main_actor_id,
      article.hero_url,
      article.body_html,
      article.status,
      actorEmail
    )
    .run();
}

async function audit(env, actorEmail, action, entityType, entityId, metadata = {}) {
  await env.DB.prepare(
    "INSERT INTO audit_events (id, actor_email, action, entity_type, entity_id, metadata) VALUES (?, ?, ?, ?, ?, ?)"
  )
    .bind(uid("audit"), actorEmail, action, entityType, entityId, JSON.stringify(metadata))
    .run();
}

async function listArticles(env) {
  const result = await env.DB.prepare(
    `SELECT id, slug, title, excerpt, category, destination, tags, main_actor_id, hero_url, body_html, status,
            author_email, editor_email, published_at, created_at, updated_at
       FROM articles
      ORDER BY updated_at DESC`
  ).all();
  return (result.results || []).map((article) => ({
    ...article,
    tags: JSON.parse(article.tags || "[]"),
    main_actor: findTotonoEPerson(article.main_actor_id),
  }));
}

async function createArticle(request, env) {
  const auth = await requireRole(request, env, ["admin", "editor"]);
  if (auth.error) return auth.error;

  const payload = await readJson(request);
  if (!payload) return json({ error: "invalid_json" }, { status: 400 });

  const article = normalizeArticle(payload);
  if (!article.slug) return json({ error: "slug_required" }, { status: 400 });

  const id = uid("article");
  await env.DB.prepare(
    `INSERT INTO articles
      (id, slug, title, excerpt, category, destination, tags, main_actor_id, hero_url, body_html, status, author_email, editor_email)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      article.slug,
      article.title,
      article.excerpt,
      article.category,
      article.destination,
      article.tags,
      article.main_actor_id,
      article.hero_url,
      article.body_html,
      article.status,
      auth.email,
      auth.email
    )
    .run();

  const created = await env.DB.prepare("SELECT * FROM articles WHERE id = ?").bind(id).first();
  await recordVersion(env, created, auth.email);
  await audit(env, auth.email, "article.create", "article", id);
  return json({ article: { ...created, tags: JSON.parse(created.tags || "[]"), main_actor: findTotonoEPerson(created.main_actor_id) } }, { status: 201 });
}

async function updateArticle(request, env, id) {
  const auth = await requireRole(request, env, ["admin", "editor"]);
  if (auth.error) return auth.error;

  const current = await env.DB.prepare("SELECT * FROM articles WHERE id = ?").bind(id).first();
  if (!current) return json({ error: "not_found" }, { status: 404 });

  const payload = await readJson(request);
  if (!payload) return json({ error: "invalid_json" }, { status: 400 });

  const article = normalizeArticle(payload, current);
  await env.DB.prepare(
    `UPDATE articles
        SET slug = ?, title = ?, excerpt = ?, category = ?, destination = ?, tags = ?, main_actor_id = ?,
            hero_url = ?, body_html = ?, status = ?, editor_email = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`
  )
    .bind(
      article.slug,
      article.title,
      article.excerpt,
      article.category,
      article.destination,
      article.tags,
      article.main_actor_id,
      article.hero_url,
      article.body_html,
      article.status,
      auth.email,
      id
    )
    .run();

  const updated = await env.DB.prepare("SELECT * FROM articles WHERE id = ?").bind(id).first();
  await recordVersion(env, updated, auth.email);
  await audit(env, auth.email, "article.update", "article", id);
  return json({ article: { ...updated, tags: JSON.parse(updated.tags || "[]"), main_actor: findTotonoEPerson(updated.main_actor_id) } });
}

async function enqueuePublish(request, env, id) {
  const auth = await requireRole(request, env, ["admin"]);
  if (auth.error) return auth.error;

  const article = await env.DB.prepare("SELECT * FROM articles WHERE id = ?").bind(id).first();
  if (!article) return json({ error: "not_found" }, { status: 404 });

  const jobId = uid("publish");
  await env.DB.prepare(
    "INSERT INTO publish_jobs (id, article_id, status, actor_email) VALUES (?, ?, 'running', ?)"
  )
    .bind(jobId, id, auth.email)
    .run();
  await audit(env, auth.email, "publish.start", "article", id, { jobId });

  try {
    const result = await publishArticleToGitHub(env, article);
    await env.DB.prepare(
      `UPDATE publish_jobs
          SET status = 'published', commit_sha = ?, live_url = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`
    )
      .bind(result.commitSha || "", result.liveUrl, jobId)
      .run();
    await env.DB.prepare(
      "UPDATE articles SET status = 'published', published_at = COALESCE(published_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    )
      .bind(id)
      .run();
    await audit(env, auth.email, "publish.success", "article", id, result);

    return json({
      job: { id: jobId, article_id: id, status: "published", commit_sha: result.commitSha || "", live_url: result.liveUrl },
    });
  } catch (error) {
    await env.DB.prepare(
      `UPDATE publish_jobs
          SET status = 'failed', error_message = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`
    )
      .bind(String(error.message || error), jobId)
      .run();
    await audit(env, auth.email, "publish.failed", "article", id, { jobId, error: String(error.message || error) });

    return json({
      error: "publish_failed",
      message: String(error.message || error),
      job: { id: jobId, article_id: id, status: "failed" },
    }, { status: 500 });
  }
}

async function uploadAsset(request, env) {
  const auth = await requireRole(request, env, ["admin", "editor"]);
  if (auth.error) return auth.error;
  if (!env.MEDIA) return json({ error: "media_bucket_not_configured" }, { status: 500 });

  const form = await request.formData();
  const file = form.get("file");
  const articleId = String(form.get("article_id") || form.get("articleId") || "").trim();

  if (!(file instanceof File)) return json({ error: "file_required" }, { status: 400 });
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return json({ error: "unsupported_image_type", allowed: Array.from(ALLOWED_IMAGE_TYPES) }, { status: 415 });
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return json({ error: "image_too_large", max_bytes: MAX_IMAGE_BYTES }, { status: 413 });
  }

  if (articleId) {
    const article = await env.DB.prepare("SELECT id FROM articles WHERE id = ?").bind(articleId).first();
    if (!article) return json({ error: "article_not_found" }, { status: 404 });
  }

  const now = new Date();
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const key = `columns/${yyyy}/${mm}/${crypto.randomUUID()}-${safeFilename(file.name)}`;
  await env.MEDIA.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
    customMetadata: {
      uploadedBy: auth.email,
      articleId,
      originalName: file.name || "",
    },
  });

  const id = uid("asset");
  const url = publicAssetUrl(request, key);
  await env.DB.prepare(
    `INSERT INTO article_assets
      (id, article_id, r2_key, url, filename, content_type, size_bytes, actor_email)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(id, articleId || null, key, url, file.name || "", file.type, file.size, auth.email)
    .run();
  await audit(env, auth.email, "asset.upload", "asset", id, { articleId, key, size: file.size });

  return json({ asset: { id, article_id: articleId || null, key, url, filename: file.name || "", content_type: file.type, size_bytes: file.size } }, { status: 201 });
}

async function serveMedia(request, env, key) {
  if (!env.MEDIA) return new Response("Media bucket is not configured.", { status: 500 });
  const object = await env.MEDIA.get(key);
  if (!object) return new Response("Not found", { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "public, max-age=31536000, immutable");
  return new Response(object.body, { headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = normalizePath(url.pathname);

    if (request.method === "OPTIONS") return new Response(null, { status: 204 });
    if (path === "/api/health") return json({ ok: true, service: "column-studio-api" });

    if (path === "/api/me") {
      const email = getActorEmail(request, env);
      const member = await getMember(env, email);
      return json({ email, member });
    }

    if (path === "/api/articles" && request.method === "GET") {
      const auth = await requireRole(request, env, ["admin", "editor", "viewer"]);
      if (auth.error) return auth.error;
      return json({ articles: await listArticles(env) });
    }

    if (path === "/api/articles" && request.method === "POST") {
      return createArticle(request, env);
    }

    if (path === "/api/assets" && request.method === "POST") {
      return uploadAsset(request, env);
    }

    const articleMatch = path.match(/^\/api\/articles\/([^/]+)$/);
    if (articleMatch && request.method === "PATCH") {
      return updateArticle(request, env, articleMatch[1]);
    }

    const publishMatch = path.match(/^\/api\/articles\/([^/]+)\/publish$/);
    if (publishMatch && request.method === "POST") {
      return enqueuePublish(request, env, publishMatch[1]);
    }

    const mediaMatch = path.match(/^\/media\/(.+)$/);
    if (mediaMatch && request.method === "GET") {
      return serveMedia(request, env, mediaMatch[1]);
    }

    return json({ error: "not_found" }, { status: 404 });
  },
};
