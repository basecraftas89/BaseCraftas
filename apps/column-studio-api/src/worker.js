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
const CONTENT_TYPES = {
  column: "コラム",
  podcast: "Podcast",
  video: "動画",
  archive: "アーカイブ動画",
  seminar: "セミナー",
  learning: "学習コンテンツ",
  weekend: "週末のAI整え習慣",
};

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { ...jsonHeaders, ...(init.headers || {}) },
  });
}

function decodeBase64Url(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

async function verifyAccessJwt(request, env) {
  if (!env.TEAM_DOMAIN || !env.POLICY_AUD) return null;
  const token = request.headers.get("cf-access-jwt-assertion");
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[0])));
    const payload = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[1])));
    if (header.alg !== "RS256" || !header.kid) return null;
    const teamDomain = String(env.TEAM_DOMAIN).replace(/\/$/, "");
    const issuer = teamDomain.startsWith("https://") ? teamDomain : `https://${teamDomain}`;
    const certResponse = await fetch(`${issuer}/cdn-cgi/access/certs`, { signal: AbortSignal.timeout(5000) });
    if (!certResponse.ok) return null;
    const certs = JSON.parse(await readTextLimit(certResponse, 256 * 1024));
    const jwk = (certs.keys || []).find((key) => key.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const signed = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, decodeBase64Url(parts[2]), signed);
    const nowSeconds = Math.floor(Date.now() / 1000);
    const audience = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!valid || payload.iss !== issuer || !audience.includes(env.POLICY_AUD) || !payload.exp || payload.exp <= nowSeconds || (payload.nbf && payload.nbf > nowSeconds)) return null;
    return payload;
  } catch (_error) {
    return null;
  }
}

async function getActorEmail(request, env) {
  if (env.ALLOW_DEV_AUTH === "true") {
    const devEmail = request.headers.get("x-column-studio-dev-email");
    if (devEmail) return devEmail.toLowerCase();
  }
  const payload = await verifyAccessJwt(request, env);
  return String(payload?.email || "").toLowerCase();
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

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function absoluteUrl(baseUrl, value) {
  if (!value) return "";
  try {
    return new URL(value, baseUrl).href;
  } catch (_error) {
    return "";
  }
}

function tagAttributes(tag) {
  const attributes = {};
  String(tag || "").replace(/([:\w-]+)\s*=\s*(["'])(.*?)\2/g, (_match, name, _quote, value) => {
    attributes[name.toLowerCase()] = decodeHtmlEntities(value.trim());
    return _match;
  });
  return attributes;
}

function findMetaContent(html, key) {
  const target = String(key || "").toLowerCase();
  const tags = String(html || "").match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const attributes = tagAttributes(tag);
    if ((attributes.property || attributes.name || "").toLowerCase() === target) {
      return attributes.content || "";
    }
  }
  return "";
}

function findDocumentTitle(html) {
  const match = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? decodeHtmlEntities(match[1].replace(/\s+/g, " ").trim()) : "";
}

function sourceProfile(url) {
  const profile = {
    kind: "external",
    provider: "外部リンク",
    recommended_content_type: "column",
    public_target: "コラム",
    source_id: "",
  };
  try {
    const target = new URL(url);
    const host = target.hostname.replace(/^www\./, "").toLowerCase();
    let match;
    if (host === "note.com" || host.endsWith(".note.com")) {
      Object.assign(profile, { kind: "note", provider: "note", recommended_content_type: "column", public_target: "コラム" });
    } else if (host === "stand.fm" || host.endsWith(".stand.fm")) {
      match = target.pathname.match(/\/episodes\/([A-Za-z0-9_-]+)/);
      Object.assign(profile, { kind: "podcast", provider: "stand.fm", recommended_content_type: "podcast", public_target: "Podcast", source_id: match ? match[1] : "" });
    } else if (host === "youtu.be" || host === "youtube.com" || host.endsWith(".youtube.com")) {
      match = host === "youtu.be" ? target.pathname.match(/^\/([^/]+)/) : target.pathname.match(/\/(?:embed|shorts|live)\/([^/?]+)/);
      Object.assign(profile, { kind: "video", provider: "YouTube", recommended_content_type: "video", public_target: "学習コンテンツ", source_id: (match && match[1]) || target.searchParams.get("v") || "" });
    } else if (host === "drive.google.com" || host === "docs.google.com") {
      match = target.pathname.match(/\/(?:file\/d|folders)\/([^/?]+)/);
      Object.assign(profile, { kind: "archive", provider: "Google Drive", recommended_content_type: "archive", public_target: "アーカイブ動画", source_id: (match && match[1]) || target.searchParams.get("id") || "" });
    } else if (host === "therapis10.com" || host.endsWith(".therapis10.com")) {
      match = target.pathname.match(/\/seminars\/([^/?]+)/);
      Object.assign(profile, { kind: "seminar", provider: "therapis10", recommended_content_type: "seminar", public_target: "セミナー", source_id: match ? match[1] : "" });
    }
  } catch (_error) {}
  return profile;
}

function externalLinkKind(url) {
  return sourceProfile(url).kind;
}

function canFetchPreview(url) {
  return sourceProfile(url).kind !== "external";
}

async function readTextLimit(response, limit = 256 * 1024) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = "";
  try {
    while (received < limit) {
      const { done, value } = await reader.read();
      if (done) break;
      const slice = value.byteLength > limit - received ? value.slice(0, limit - received) : value;
      received += slice.byteLength;
      text += decoder.decode(slice, { stream: received < limit });
      if (slice.byteLength < value.byteLength) break;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return text + decoder.decode();
}

function externalLinkLabel(contentType, url) {
  const kind = externalLinkKind(url);
  if (kind === "note") return "noteで読む";
  if (kind === "podcast") return "Podcastを聴く";
  if (kind === "video" || contentType === "video") return "動画を見る";
  return "元コンテンツを見る";
}

function publicSection(contentType) {
  if (contentType === "podcast") return { hash: "podcast", label: "Podcast" };
  if (contentType === "archive") return { hash: "archive", label: "アーカイブ動画" };
  if (contentType === "seminar") return { hash: "seminars", label: "セミナー" };
  if (["video", "learning"].includes(contentType)) return { hash: "library", label: "学習コンテンツ" };
  return { hash: "columns", label: "コラム" };
}

async function fetchLinkPreview(url) {
  let target;
  try {
    target = new URL(String(url || "").trim());
  } catch (_error) {
    return null;
  }
  if (!["http:", "https:"].includes(target.protocol)) return null;
  const profile = sourceProfile(target.href);
  const base = {
    url: target.href,
    ...profile,
    title: "",
    description: "",
    image: profile.kind === "video" && profile.source_id ? `https://img.youtube.com/vi/${profile.source_id}/hqdefault.jpg` : "",
    published_at: "",
    episode_no: null,
  };
  if (!canFetchPreview(target.href)) return base;
  try {
    const res = await fetch(target.href, {
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
      headers: {
        "accept": "text/html,application/xhtml+xml",
        "user-agent": "basecraftas-column-studio-link-preview/1.0",
      },
    });
    if (!res.ok) return base;
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) return base;
    if (!canFetchPreview(res.url || target.href)) return base;
    const html = await readTextLimit(res);
    const image = findMetaContent(html, "og:image") || findMetaContent(html, "twitter:image");
    const title = findMetaContent(html, "og:title") || findMetaContent(html, "twitter:title") || findDocumentTitle(html);
    const description = findMetaContent(html, "og:description") || findMetaContent(html, "description") || "";
    const publishedAt = findMetaContent(html, "article:published_time") || findMetaContent(html, "date") || findMetaContent(html, "og:published_time") || "";
    const episodeMatch = title.match(/(?:^#|\u7b2c)\s*(\d+)\s*(?:\u56de)?/);
    return {
      ...base,
      url: res.url || target.href,
      title,
      description,
      image: absoluteUrl(res.url || target.href, image) || base.image,
      published_at: publishedAt ? String(publishedAt).slice(0, 10) : "",
      episode_no: episodeMatch ? Number(episodeMatch[1]) : null,
    };
  } catch (_error) {
    return base;
  }
}

function publishedDate() {
  return new Date().toISOString().slice(0, 10);
}

function findTotonoEPerson(id) {
  return TOTONOE_MEMBERS.find((person) => person.id === id) || TOTONOE_MEMBERS[0];
}

function normalizeMainActorId(id) {
  const value = String(id || "").trim();
  return TOTONOE_MEMBERS.some((person) => person.id === value) ? value : "";
}

function normalizeContentType(type) {
  const value = String(type || "column").trim();
  return CONTENT_TYPES[value] ? value : "column";
}

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return String(value || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
}

function normalizePersonIds(ids) {
  const seen = new Set();
  return parseJsonArray(ids)
    .map((id) => TOTONOE_MEMBERS.find((person) => person.id === String(id).trim()))
    .filter(Boolean)
    .map((person) => person.id)
    .filter((id) => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
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

function articleJson(article, publishedAt, linkPreview = null) {
  const topicTags = parseJsonArray(article.tags);
  const mainActor = findTotonoEPerson(article.main_actor_id);
  const speakerIds = normalizePersonIds(article.speaker_ids);
  const contentType = normalizeContentType(article.content_type);
  const heroUrl = article.hero_url || (linkPreview && linkPreview.image) || "";
  const sourceType = article.source_type || (linkPreview && linkPreview.kind) || externalLinkKind(article.media_url);
  const sourceId = article.source_id || (linkPreview && linkPreview.source_id) || sourceProfile(article.media_url).source_id;
  return {
    id: article.id,
    revision: article.revision || 1,
    slug: article.slug,
    title: article.title,
    excerpt: article.excerpt,
    category: article.category,
    destination: article.destination,
    content_type: contentType,
    content_type_label: CONTENT_TYPES[contentType],
    topic_tags: topicTags,
    tags: topicTags,
    main_actor_id: mainActor.id,
    main_actor: mainActor,
    speaker_ids: speakerIds,
    speakers: speakerIds.map((id) => findTotonoEPerson(id)),
    media_url: article.media_url || "",
    episode_no: article.episode_no || (linkPreview && linkPreview.episode_no) || null,
    source_published_at: article.source_published_at || (linkPreview && linkPreview.published_at) || "",
    source_type: sourceType,
    source_id: sourceId,
    public_target: publicSection(contentType).label,
    external_link: linkPreview ? {
      url: linkPreview.url,
      kind: linkPreview.kind,
      title: linkPreview.title,
      description: linkPreview.description,
      image: linkPreview.image,
      provider: linkPreview.provider,
    } : null,
    hero_url: heroUrl,
    body_html: normalizePublishedBody(article.body_html),
    status: "published",
    url: `contents/${article.slug}.html`,
    absolute_url: `https://basecraftas.com/projects/totonoe/contents/${article.slug}.html`,
    published_at: publishedAt,
    updated_at: new Date().toISOString(),
  };
}

function articleHtml(articleData) {
  const tags = (articleData.tags || []).map((tag) => `<span>${escHtml(tag)}</span>`).join("");
  const speakers = (articleData.speakers || []).map((person) => escHtml(person.name)).join("、") || "—";
  const hero = articleData.hero_url
    ? `<figure class="column-hero-image"><img src="${escHtml(articleData.hero_url)}" alt=""></figure>`
    : "";
  const linkLabel = externalLinkLabel(articleData.content_type, articleData.media_url);
  const mediaLink = articleData.media_url
    ? `<p class="content-media-link"><a href="${escHtml(articleData.media_url)}" target="_blank" rel="noopener">${escHtml(linkLabel)} ↗</a></p>`
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
        ${articleData.body_html || "<p>本文はまだありません。</p>"}
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

function contentIndexHtml() {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>コンテンツ｜ToToNoE+</title>
<meta name="description" content="ToToNoE+のコンテンツ一覧です。">
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
      <p class="eyebrow">CONTENTS</p>
      <h1>コンテンツ</h1>
      <p>ToToNoE+のコラム、Podcast、動画、学習コンテンツを読み直せる形で整理していきます。</p>
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
  fetch('../data/contents/index.json',{cache:'no-store'}).then(function(res){return res.json();}).then(function(data){
    var articles=(data.articles||[]).filter(function(article){return article.status==='published';});
    if(!articles.length){grid.innerHTML='<div class="empty-columns">公開中のコンテンツはまだありません。</div>';return;}
    grid.innerHTML=articles.map(function(article){
      var tags=(article.topic_tags||article.tags||[]).slice(0,3).map(function(tag){return '<span>'+esc(tag)+'</span>';}).join('');
      return '<a class="column-card" href="'+esc(article.url)+'">'+
        (article.hero_url?'<img src="'+esc(article.hero_url)+'" alt="">':'')+
        '<time>'+esc(article.content_type_label||'コンテンツ')+' / '+esc(article.published_at||article.updated_at||'')+'</time>'+
        '<h2>'+esc(article.title)+'</h2>'+
        '<p>'+esc(article.excerpt)+'</p>'+
        '<div class="tags">'+tags+'</div>'+
      '</a>';
    }).join('');
  }).catch(function(){grid.innerHTML='<div class="empty-columns">コンテンツ一覧を読み込めませんでした。</div>';});
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

async function fetchGitHubFile(env, path, ref = env.GITHUB_BRANCH || DEFAULT_BRANCH) {
  try {
    return await githubRequest(env, `/contents/${encodeURIComponent(path).replace(/%2F/g, "/")}?ref=${encodeURIComponent(ref)}`);
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}

async function commitGitHubFiles(env, files, message, baseSha) {
  const baseCommit = await githubRequest(env, `/git/commits/${encodeURIComponent(baseSha)}`);
  const blobs = await Promise.all(files.map(async (file) => {
    const blob = await githubRequest(env, "/git/blobs", {
      method: "POST",
      body: JSON.stringify({ content: encodeContent(file.content), encoding: "base64" }),
    });
    return { path: file.path, mode: "100644", type: "blob", sha: blob.sha };
  }));
  const tree = await githubRequest(env, "/git/trees", {
    method: "POST",
    body: JSON.stringify({ base_tree: baseCommit.tree.sha, tree: blobs }),
  });
  const commit = await githubRequest(env, "/git/commits", {
    method: "POST",
    body: JSON.stringify({ message, tree: tree.sha, parents: [baseSha] }),
  });
  const branch = (env.GITHUB_BRANCH || DEFAULT_BRANCH).split("/").map(encodeURIComponent).join("/");
  await githubRequest(env, `/git/refs/heads/${branch}`, {
    method: "PATCH",
    body: JSON.stringify({ sha: commit.sha, force: false }),
  });
  return commit.sha;
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
  const linkPreview = await fetchLinkPreview(article.media_url);
  const data = articleJson(article, publishedAt, linkPreview);
  const articleJsonPath = `projects/totonoe/data/contents/${article.slug}.json`;
  const articleHtmlPath = `projects/totonoe/contents/${article.slug}.html`;
  const indexPath = "projects/totonoe/data/contents/index.json";
  const indexHtmlPath = "projects/totonoe/contents/index.html";
  const message = `Publish content: ${article.title}`;

  const summary = {
    id: data.id,
    revision: data.revision,
    slug: data.slug,
    title: data.title,
    excerpt: data.excerpt,
    category: data.category,
    content_type: data.content_type,
    content_type_label: data.content_type_label,
    topic_tags: data.topic_tags,
    tags: data.tags,
    main_actor_id: data.main_actor_id,
    main_actor: data.main_actor,
    speaker_ids: data.speaker_ids,
    speakers: data.speakers,
    media_url: data.media_url,
    episode_no: data.episode_no,
    source_published_at: data.source_published_at,
    source_type: data.source_type,
    source_id: data.source_id,
    public_target: data.public_target,
    external_link: data.external_link,
    hero_url: data.hero_url,
    status: "published",
    url: data.url,
    published_at: data.published_at,
    updated_at: data.updated_at,
  };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const branchName = env.GITHUB_BRANCH || DEFAULT_BRANCH;
    const branch = branchName.split("/").map(encodeURIComponent).join("/");
    const ref = await githubRequest(env, `/git/ref/heads/${branch}`);
    const baseSha = ref.object.sha;
    const currentIndex = await fetchGitHubFile(env, indexPath, baseSha);
    let index = { updated_at: null, articles: [] };
    if (currentIndex && currentIndex.content) {
      try {
        index = JSON.parse(decodeContent(currentIndex.content));
      } catch (_error) {
        index = { updated_at: null, articles: [] };
      }
    }
    index.articles = [summary].concat((index.articles || []).filter((item) => item.slug !== data.slug));
    index.updated_at = new Date().toISOString();
    try {
      const commitSha = await commitGitHubFiles(env, [
        { path: articleJsonPath, content: `${JSON.stringify(data, null, 2)}\n` },
        { path: articleHtmlPath, content: articleHtml(data) },
        { path: indexHtmlPath, content: contentIndexHtml() },
        { path: indexPath, content: `${JSON.stringify(index, null, 2)}\n` },
      ], message, baseSha);
      return { commitSha, liveUrl: data.absolute_url };
    } catch (error) {
      if (error.status !== 422 || attempt === 1) throw error;
    }
  }
  throw new Error("github_publish_conflict");
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
  const email = await getActorEmail(request, env);
  const member = await getMember(env, email);
  if (!member || !roles.includes(member.role)) {
    return { error: json({ error: "forbidden" }, { status: 403 }) };
  }
  return { email, member };
}

async function listMembers(request, env) {
  const auth = await requireRole(request, env, ["admin"]);
  if (auth.error) return auth.error;
  const result = await env.DB.prepare(
    "SELECT id, email, name, role, status, created_at, updated_at FROM members ORDER BY CASE role WHEN 'admin' THEN 0 WHEN 'editor' THEN 1 ELSE 2 END, lower(email)"
  ).all();
  return json({ members: result.results || [] });
}

function validMemberRole(value) {
  return ["admin", "editor", "viewer"].includes(value) ? value : null;
}

async function createMember(request, env) {
  const auth = await requireRole(request, env, ["admin"]);
  if (auth.error) return auth.error;
  const payload = await readJson(request);
  const email = String(payload?.email || "").trim().toLowerCase();
  const role = validMemberRole(payload?.role);
  const name = String(payload?.name || "").trim().slice(0, 100);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "invalid_email", message: "メールアドレスを確認してください。" }, { status: 400 });
  if (!role) return json({ error: "invalid_role", message: "権限を確認してください。" }, { status: 400 });

  const existing = await env.DB.prepare("SELECT id, name FROM members WHERE lower(email) = ?").bind(email).first();
  const id = existing?.id || uid("member");
  const savedName = name || existing?.name || "";
  if (existing) {
    await env.DB.prepare("UPDATE members SET email = ?, name = ?, role = ?, status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(email, savedName, role, id).run();
  } else {
    await env.DB.prepare("INSERT INTO members (id, email, name, role, status) VALUES (?, ?, ?, ?, 'active')")
      .bind(id, email, savedName, role).run();
  }
  await audit(env, auth.email, existing ? "member.reactivate" : "member.create", "member", id, { email, role });
  const member = await env.DB.prepare("SELECT id, email, name, role, status, created_at, updated_at FROM members WHERE id = ?").bind(id).first();
  return json({ member }, { status: existing ? 200 : 201 });
}

async function updateMember(request, env, id) {
  const auth = await requireRole(request, env, ["admin"]);
  if (auth.error) return auth.error;
  const current = await env.DB.prepare("SELECT id, email, name, role, status FROM members WHERE id = ?").bind(id).first();
  if (!current) return json({ error: "not_found" }, { status: 404 });
  const payload = await readJson(request);
  const role = validMemberRole(payload?.role || current.role);
  const status = payload?.status || current.status;
  if (!role || !["active", "disabled"].includes(status)) return json({ error: "invalid_member", message: "権限または状態を確認してください。" }, { status: 400 });

  if (current.role === "admin" && current.status === "active" && (role !== "admin" || status !== "active")) {
    const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM members WHERE role = 'admin' AND status = 'active'").first();
    if (Number(count?.count || 0) <= 1) return json({ error: "last_admin", message: "最後の管理者は変更できません。" }, { status: 409 });
  }

  await env.DB.prepare("UPDATE members SET role = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(role, status, id).run();
  await audit(env, auth.email, "member.update", "member", id, { role, status });
  const member = await env.DB.prepare("SELECT id, email, name, role, status, created_at, updated_at FROM members WHERE id = ?").bind(id).first();
  return json({ member });
}

async function readJson(request) {
  try {
    return await request.json();
  } catch (_error) {
    return null;
  }
}

async function previewLink(request, env) {
  const auth = await requireRole(request, env, ["admin", "editor"]);
  if (auth.error) return auth.error;
  const payload = await readJson(request);
  if (!payload || !payload.url) return json({ error: "url_required", message: "URLを入力してください。" }, { status: 400 });
  const preview = await fetchLinkPreview(payload.url);
  if (!preview) return json({ error: "invalid_url", message: "http:// または https:// のURLを入力してください。" }, { status: 400 });
  await audit(env, auth.email, "link.preview", "external_link", "", { url: preview.url, kind: preview.kind });
  return json({ preview });
}

function normalizeArticle(input, fallback = {}) {
  const tagInput = input.topic_tags || input.topicTags || input.tags || fallback.tags || [];
  const tags = parseJsonArray(tagInput).map((tag) => String(tag).trim()).filter(Boolean);
  const contentType = normalizeContentType(input.content_type || input.contentType || fallback.content_type);
  const speakerIds = normalizePersonIds(input.speaker_ids || input.speakerIds || fallback.speaker_ids);

  return {
    slug: String(input.slug || fallback.slug || "").trim(),
    title: String(input.title || fallback.title || "Untitled").trim(),
    excerpt: String(input.excerpt || fallback.excerpt || "").trim(),
    category: String(input.category || fallback.category || "content").trim(),
    destination: "totonoe",
    content_type: contentType,
    tags: JSON.stringify(tags),
    main_actor_id: normalizeMainActorId(input.main_actor_id || input.mainActorId || fallback.main_actor_id),
    speaker_ids: JSON.stringify(speakerIds),
    media_url: String(input.media_url || input.mediaUrl || fallback.media_url || "").trim(),
    episode_no: Number(input.episode_no || input.episodeNo || fallback.episode_no) || null,
    source_published_at: String(input.source_published_at || input.sourcePublishedAt || fallback.source_published_at || "").slice(0, 10),
    source_type: String(input.source_type || input.sourceType || fallback.source_type || "").trim(),
    source_id: String(input.source_id || input.sourceId || fallback.source_id || "").trim(),
    hero_url: String(input.hero_url || input.heroUrl || fallback.hero_url || "").trim(),
    body_html: String(input.body_html || input.bodyHtml || fallback.body_html || ""),
    status: fallback.status === "published" ? "published" : "draft",
  };
}

async function recordVersion(env, article, actorEmail) {
  await env.DB.prepare(
    `INSERT INTO article_versions
      (id, article_id, title, excerpt, category, destination, content_type, tags, main_actor_id, speaker_ids, media_url,
       episode_no, source_published_at, source_type, source_id, hero_url, body_html, status, actor_email)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      uid("ver"),
      article.id,
      article.title,
      article.excerpt,
      article.category,
      article.destination,
      article.content_type || "column",
      article.tags,
      article.main_actor_id,
      article.speaker_ids || "[]",
      article.media_url || "",
      article.episode_no || null,
      article.source_published_at || "",
      article.source_type || "",
      article.source_id || "",
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
    `SELECT id, revision, slug, title, excerpt, category, destination, content_type, tags, main_actor_id, speaker_ids, media_url,
            episode_no, source_published_at, source_type, source_id, hero_url, body_html, status,
            author_email, editor_email, published_at, created_at, updated_at
       FROM articles
      ORDER BY updated_at DESC`
  ).all();
  return (result.results || []).map((article) => ({
    ...article,
    content_type: normalizeContentType(article.content_type),
    topic_tags: parseJsonArray(article.tags),
    tags: parseJsonArray(article.tags),
    main_actor: findTotonoEPerson(article.main_actor_id),
    speaker_ids: normalizePersonIds(article.speaker_ids),
    speakers: normalizePersonIds(article.speaker_ids).map((id) => findTotonoEPerson(id)),
  }));
}

async function createArticle(request, env) {
  const auth = await requireRole(request, env, ["admin", "editor"]);
  if (auth.error) return auth.error;

  const payload = await readJson(request);
  if (!payload) return json({ error: "invalid_json" }, { status: 400 });

  const article = normalizeArticle(payload);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(article.slug)) return json({ error: "invalid_slug" }, { status: 400 });

  const id = /^article_[a-f0-9-]{36}$/.test(payload.id || "") ? payload.id : uid("article");
  const existing = await env.DB.prepare("SELECT * FROM articles WHERE id = ?").bind(id).first();
  if (existing) return json({ article: serializeArticle(existing) });
  await env.DB.prepare(
    `INSERT INTO articles
      (id, slug, title, excerpt, category, destination, content_type, tags, main_actor_id, speaker_ids, media_url,
       episode_no, source_published_at, source_type, source_id, hero_url, body_html, status, author_email, editor_email)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      article.slug,
      article.title,
      article.excerpt,
      article.category,
      article.destination,
      article.content_type,
      article.tags,
      article.main_actor_id,
      article.speaker_ids,
      article.media_url,
      article.episode_no,
      article.source_published_at,
      article.source_type,
      article.source_id,
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
  return json({ article: { ...created, content_type: normalizeContentType(created.content_type), topic_tags: parseJsonArray(created.tags), tags: parseJsonArray(created.tags), main_actor: findTotonoEPerson(created.main_actor_id), speaker_ids: normalizePersonIds(created.speaker_ids), speakers: normalizePersonIds(created.speaker_ids).map((speakerId) => findTotonoEPerson(speakerId)) } }, { status: 201 });
}

function serializeArticle(article) {
  return { ...article, tags: parseJsonArray(article.tags), topic_tags: parseJsonArray(article.tags),
    speaker_ids: normalizePersonIds(article.speaker_ids) };
}

async function updateArticle(request, env, id) {
  const auth = await requireRole(request, env, ["admin", "editor"]);
  if (auth.error) return auth.error;
  const current = await env.DB.prepare("SELECT * FROM articles WHERE id = ?").bind(id).first();
  if (!current) return json({ error: "not_found" }, { status: 404 });
  const payload = await readJson(request);
  if (!payload) return json({ error: "invalid_json" }, { status: 400 });
  if (Number(payload.expected_revision) !== current.revision) {
    return json({ error: "edit_conflict", message: "別の更新があります。最新の内容を確認してください。", article: serializeArticle(current) }, { status: 409 });
  }
  const article = normalizeArticle(payload, current);
  // A published URL remains stable when restoring or editing.
  if (current.published_at) article.slug = current.slug;
  if (!/^[a-z0-9][a-z0-9-]*$/.test(article.slug)) return json({ error: "invalid_slug" }, { status: 400 });
  const fields = ["slug","title","excerpt","category","destination","content_type","tags","main_actor_id",
    "speaker_ids","media_url","episode_no","source_published_at","source_type","source_id","hero_url","body_html","status"];
  const versionFields = fields.filter((field) => field !== "slug");
  const results = await env.DB.batch([
    env.DB.prepare("UPDATE articles SET " + fields.map((field) => field + " = ?").join(", ") +
      ", revision = revision + 1, editor_email = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND revision = ? " +
      "AND NOT EXISTS (SELECT 1 FROM article_publish_locks WHERE article_id = ? AND expires_at > ?)")
      .bind(...fields.map((field) => article[field]), auth.email, id, current.revision, id, Date.now()),
    env.DB.prepare("INSERT INTO article_versions (id, article_id, revision, actor_email, " + versionFields.join(",") +
      ") SELECT ?, id, revision, ?, " + versionFields.join(",") + " FROM articles WHERE id = ? AND changes() = 1")
      .bind(uid("ver"), auth.email, id)
  ]);
  if (!results[0].meta.changes) return json({ error: "edit_conflict", message: "他の更新または公開処理が進行中です。内容を保持しています。" }, { status: 409 });
  const updated = await env.DB.prepare("SELECT * FROM articles WHERE id = ?").bind(id).first();
  return json({ article: serializeArticle(updated) });
}

async function articleHistory(request, env, id, versionId) {
  const auth = await requireRole(request, env, ["admin", "editor", "viewer"]);
  if (auth.error) return auth.error;
  if (!versionId) {
    const result = await env.DB.prepare("SELECT id, revision, title, actor_email, created_at FROM article_versions WHERE article_id = ? ORDER BY rowid DESC LIMIT 100").bind(id).all();
    return json({ versions: result.results || [] });
  }
  const version = await env.DB.prepare("SELECT * FROM article_versions WHERE article_id = ? AND id = ?").bind(id, versionId).first();
  if (!version) return json({ error: "not_found" }, { status: 404 });
  return json({ version: serializeArticle(version) });
}

async function topicTags(request, env) {
  const auth = await requireRole(request, env, ["admin","editor","viewer"]);
  if (auth.error) return auth.error;
  const result = await env.DB.prepare("SELECT DISTINCT tags FROM articles UNION SELECT DISTINCT tags FROM article_versions").all();
  return json({ tags: [...new Set((result.results || []).flatMap((row) => parseJsonArray(row.tags)))].sort() });
}

async function publicationStatus(request, env, id) {
  const auth = await requireRole(request, env, ["admin","editor","viewer"]);
  if (auth.error) return auth.error;
  const article = await env.DB.prepare("SELECT * FROM articles WHERE id = ?").bind(id).first();
  if (!article) return json({ error: "not_found" }, { status: 404 });
  const job = await env.DB.prepare("SELECT * FROM publish_jobs WHERE article_id = ? ORDER BY rowid DESC LIMIT 1").bind(id).first();
  if (!job || job.status !== "published") return json({ stage: job ? job.status : "draft", job });
  const publishedRevision = job.article_revision;
  if (!publishedRevision) return json({ stage: "unverified", job });
  const has_unpublished_changes = article.revision !== publishedRevision;
  // Verify the published revision, not a newer draft.
  try {
    const root = "https://basecraftas.com/projects/totonoe/";
    const responses = await Promise.all([
      fetch(root + "data/contents/index.json?check=" + Date.now(), { cache: "no-store", signal: AbortSignal.timeout(8000) }),
      fetch(root + "contents/" + encodeURIComponent(article.slug) + ".html?check=" + Date.now(), { cache: "no-store", signal: AbortSignal.timeout(8000) })
    ]);
    if (!responses.every((res) => res.ok)) return json({ stage: "deploying", job, has_unpublished_changes });
    const [index, html] = await Promise.all([readTextLimit(responses[0], 5 * 1024 * 1024).then(JSON.parse), readTextLimit(responses[1], 1024 * 1024)]);
    const entry = (index.articles || []).find((item) => item.id === id);
    const verified = entry && entry.revision === publishedRevision && findMetaContent(html, "content-revision") === String(publishedRevision);
    return json({ stage: verified ? "live" : "deploying", job, has_unpublished_changes });
  } catch (_error) { return json({ stage: "deploying", job, has_unpublished_changes }); }
}

async function enqueuePublish(request, env, id) {
  const auth = await requireRole(request, env, ["admin"]);
  if (auth.error) return auth.error;

  const article = await env.DB.prepare("SELECT * FROM articles WHERE id = ?").bind(id).first();
  if (!article) return json({ error: "not_found" }, { status: 404 });
  const payload = await readJson(request);
  if (Number(payload && payload.expected_revision) !== article.revision) return json({ error: "edit_conflict", message: "更新があります。保存してから公開してください。" }, { status: 409 });
  if (!normalizeMainActorId(article.main_actor_id)) {
    return json({ error: "main_actor_required", message: "Main Actorを選択してください。" }, { status: 400 });
  }
  if (["podcast", "video", "archive", "seminar"].includes(normalizeContentType(article.content_type)) && !article.media_url) {
    return json({ error: "media_url_required", message: "このコンテンツ種別は元コンテンツURLが必要です。" }, { status: 400 });
  }

  const lease = Date.now() + 300000;
  const lock = await env.DB.prepare("INSERT INTO article_publish_locks (article_id, expires_at) SELECT id, ? FROM articles WHERE id = ? AND revision = ? ON CONFLICT(article_id) DO UPDATE SET expires_at = excluded.expires_at WHERE article_publish_locks.expires_at < ?")
    .bind(lease, id, article.revision, Date.now()).run();
  if (!lock.meta.changes) return json({ error: "edit_conflict", message: "別の更新または公開が進行中です。" }, { status: 409 });
  const jobId = uid("publish");
  try {
  await env.DB.prepare(
    "INSERT INTO publish_jobs (id, article_id, status, actor_email, article_revision) VALUES (?, ?, 'running', ?, ?)"
  )
    .bind(jobId, id, auth.email, article.revision)
    .run();
  await audit(env, auth.email, "publish.start", "article", id, { jobId });

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
  } finally {
    await env.DB.prepare("DELETE FROM article_publish_locks WHERE article_id = ? AND expires_at = ?").bind(id, lease).run();
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
  const key = `contents/${yyyy}/${mm}/${crypto.randomUUID()}-${safeFilename(file.name)}`;
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
      const email = await getActorEmail(request, env);
      const member = await getMember(env, email);
      return json({ email, member });
    }

    if (path === "/api/members" && request.method === "GET") return listMembers(request, env);
    if (path === "/api/members" && request.method === "POST") return createMember(request, env);
    const memberMatch = path.match(/^\/api\/members\/([^/]+)$/);
    if (memberMatch && request.method === "PATCH") return updateMember(request, env, memberMatch[1]);

    if (path === "/api/articles" && request.method === "GET") {
      const auth = await requireRole(request, env, ["admin", "editor", "viewer"]);
      if (auth.error) return auth.error;
      return json({ articles: await listArticles(env) });
    }

    if (path === "/api/articles" && request.method === "POST") {
      return createArticle(request, env);
    }

    if (path === "/api/link-preview" && request.method === "POST") {
      return previewLink(request, env);
    }

    if (path === "/api/assets" && request.method === "POST") {
      return uploadAsset(request, env);
    }

    if (path === "/api/tags" && request.method === "GET") return topicTags(request, env);
    const historyMatch = path.match(/^\/api\/articles\/([^/]+)\/history(?:\/([^/]+))?$/);
    if (historyMatch && request.method === "GET") return articleHistory(request, env, historyMatch[1], historyMatch[2]);
    const statusMatch = path.match(/^\/api\/articles\/([^/]+)\/publication$/);
    if (statusMatch && request.method === "GET") return publicationStatus(request, env, statusMatch[1]);
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
