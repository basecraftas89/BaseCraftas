import {archiveMetadata} from './archive-metadata.js';
import {articleHtml} from './public-render.js';
import { sanitizeBody, safeUrl, safeSourceId, readBytes, imageType, requestGuard, secureResponse } from './security.js';
import { resolveBillingQuote, verifyStripeWebhook } from './billing.js';
import { isCurrentWeekendThumbnail } from './weekend-event.js';
import {
  normalizeCustomerEmail,
  generateOtpCode,
  generateSessionToken,
  hashAuthValue,
  timingSafeTextEqual,
  sendOtpWithResend,
  customerSessionCookie,
  clearCustomerSessionCookie,
  readCookie,
  buildStripeCheckoutParams,
  createStripeCheckoutSession,
  createStripePortalSession,
  sendQualificationReviewEmail,
} from './customer-auth.js';

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const QUALIFICATION_RETENTION_DAYS = 30;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const DEFAULT_REPOSITORY = "basecraftas89/BaseCraftas";
const DEFAULT_BRANCH = "main";
const TRASH_RETENTION_DAYS = 30;
const TRASH_PURGE_BATCH_SIZE = 50;
const GOOGLE_API_SCOPES = [
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/spreadsheets",
].join(" ");
const WEEKLY_QUESTION_HEADERS = [
  "受付ID", "対象週（日曜）", "受付日時", "会員メール", "表示名", "職種・専門分野", "勤務環境", "役職・立場", "AI利用状況",
  "具体的な場面", "実現したいこと", "回答を使いたい時期（任意）", "すでに試したこと", "いちばん判断に迷っている点", "最終的な質問",
  "希望する回答の形", "個人情報を含まないことを確認", "共通回答動画への利用同意", "類似質問グループ", "対応状況",
  "回答動画タイトル", "回答動画Drive URL", "運営メモ",
];
const WEEKLY_QUESTION_HEADER_ROW = 5;
const WEEKLY_QUESTION_FIRST_DATA_ROW = 6;
const WEEKLY_QUESTION_MAX_ROWS = 2000;
const WEEKLY_ANSWER_FORMAT_LABELS = {
  demonstration: "画面を見せながら実演",
  steps: "手順を順番に解説",
  criteria: "判断基準を整理",
};
const WEEKLY_OPERATION_STATUS_MAP = {
  "受付済み": "submitted",
  "類似質問を整理中": "in_review",
  "回答準備中": "in_review",
  "回答動画公開済み": "answered",
  "対応終了": "closed",
};
const CUSTOMER_OTP_TTL_MINUTES = 10;
const CUSTOMER_SESSION_DAYS = 30;
const AUTH_RATE_BUCKET_MINUTES = 10;
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
  column: "つづり｜TSUZURI",
  podcast: "Podcast",
  video: "動画",
  archive: "アーカイブ動画",
  seminar: "セミナー",
  learning: "つまみ｜TSUMAMI",
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
  if (env.ALLOW_DEV_AUTH === "true" && ["localhost", "127.0.0.1", "test.local"].includes(new URL(request.url).hostname)) {
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
  const basePaths = ["/api/tsuzuri-studio", "/api/column-studio", "/api/totonoe-member"];
  const mediaBasePath = "/column-media";
  const publicContentBasePath = "/public-content";
  for (const basePath of basePaths) {
    if (rawPath === basePath) return "/";
    if (rawPath.startsWith(`${basePath}/`)) {
      return rawPath.slice(basePath.length).replace(/\/+$/, "") || "/";
    }
  }
  if (rawPath.startsWith(`${mediaBasePath}/`)) {
    return `/media/${rawPath.slice(mediaBasePath.length).replace(/^\/+/, "")}`;
  }
  if (rawPath.startsWith(`${publicContentBasePath}/`)) {
    return `/api/public/${rawPath.slice(publicContentBasePath.length).replace(/^\/+/, "").replace(/\.json$/, "")}`;
  }
  return rawPath;
}

function isPublicMemberRequest(rawPath, normalizedPath, method) {
  const memberBasePath = "/api/totonoe-member";
  if (rawPath !== memberBasePath && !rawPath.startsWith(`${memberBasePath}/`)) return true;
  const allowed = new Set([
    "GET /api/health",
    "POST /api/customer/auth/request-code",
    "POST /api/customer/auth/verify-code",
    "GET /api/customer/auth/status",
    "POST /api/customer/auth/logout",
    "POST /api/customer/billing/checkout",
    "POST /api/customer/billing/portal",
    "GET /api/customer/qualification",
    "POST /api/customer/qualification",
    "POST /api/stripe/webhook",
    "GET /api/customer/profile",
    "PATCH /api/customer/profile",
    "GET /api/weekly/me",
    "GET /api/weekly/materials",
    "GET /api/weekly/priority-question",
    "POST /api/weekly/priority-question",
    "GET /api/weekly/answer-videos",
  ]);
  const key = `${method} ${normalizedPath}`;
  if (allowed.has(key)) return true;
  if (method === "GET" && /^\/api\/weekly\/materials\/[^/]+\/open$/.test(normalizedPath)) return true;
  if (method === "GET" && /^\/api\/weekly\/answer-videos\/[^/]+\/stream$/.test(normalizedPath)) return true;
  if (method === "OPTIONS") {
    return isPublicMemberRequest(rawPath, normalizedPath, "GET") || isPublicMemberRequest(rawPath, normalizedPath, "POST") || isPublicMemberRequest(rawPath, normalizedPath, "PATCH");
  }
  return false;
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
    public_target: "つづり｜TSUZURI",
    source_id: "",
  };
  try {
    const target = new URL(url);
    const host = target.hostname.replace(/^www\./, "").toLowerCase();
    let match;
    if (host === "note.com" || host.endsWith(".note.com")) {
      Object.assign(profile, { kind: "note", provider: "note", recommended_content_type: "column", public_target: "つづり｜TSUZURI" });
    } else if (host === "stand.fm" || host.endsWith(".stand.fm")) {
      match = target.pathname.match(/\/episodes\/([A-Za-z0-9_-]+)/);
      Object.assign(profile, { kind: "podcast", provider: "stand.fm", recommended_content_type: "podcast", public_target: "Podcast", source_id: match ? match[1] : "" });
    } else if (host === "youtu.be" || host === "youtube.com" || host.endsWith(".youtube.com")) {
      match = host === "youtu.be" ? target.pathname.match(/^\/([^/]+)/) : target.pathname.match(/\/(?:embed|shorts|live)\/([^/?]+)/);
      Object.assign(profile, { kind: "video", provider: "YouTube", recommended_content_type: "video", public_target: "つまみ｜TSUMAMI", source_id: (match && match[1]) || target.searchParams.get("v") || "" });
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
  if (contentType === "podcast") return { href: "../weekend-ai.html#podcast", label: "ポッドキャスト" };
  if (contentType === "archive") return { href: "../weekend-ai.html#archive", label: "アーカイブ動画" };
  if (contentType === "weekend") return { href: "../weekend-ai.html#schedule", label: "週末のAI整え習慣・次回開催" };
  if (contentType === "seminar") return { href: "../index.html#latest", label: "セミナー" };
  if (["video", "learning"].includes(contentType)) return { href: "../tsumami/", label: "つまみ｜TSUMAMI" };
  return { href: "../tsuzuri/", label: "つづり｜TSUZURI" };
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
    let res;
    for (let hop = 0; hop < 4; hop++) {
      if (target.protocol !== "https:" || target.username || target.password || target.port || !canFetchPreview(target.href)) return base;
      res = await fetch(target.href, {
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
      headers: {
        "accept": "text/html,application/xhtml+xml",
        "user-agent": "basecraftas-column-studio-link-preview/1.0",
      },
      });
      if (![301,302,303,307,308].includes(res.status)) break;
      const next = res.headers.get("location");
      await res.body?.cancel();
      if (!next || hop === 3) return base;
      target = new URL(next, target);
    }
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

function parseJsonObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value || "{}"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (_error) {
    return {};
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
  return sanitizeBody(html)
    .replace(/src="assets\/characters\//g, 'src="../assets/characters/')
    .replace(/href="assets\/characters\//g, 'href="../assets/characters/');
}

function publicArticleDirectory(contentType) {
  const normalized = normalizeContentType(contentType);
  if (normalized === "column") return "tsuzuri";
  if (["video", "learning"].includes(normalized)) return "tsumami";
  return "contents";
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
  const heroUrl = safeUrl(article.hero_url || (linkPreview && linkPreview.image), true);
  const sourceType = article.source_type || (linkPreview && linkPreview.kind) || externalLinkKind(article.media_url);
  const sourceId = safeSourceId(article.source_id || (linkPreview && linkPreview.source_id) || sourceProfile(article.media_url).source_id);
  const publicDirectory = publicArticleDirectory(contentType);
  const publicUrl = contentType === "weekend"
    ? "../weekend-ai.html#schedule"
    : `${publicDirectory}/${article.slug}.html`;
  const absoluteUrl = contentType === "weekend"
    ? "https://basecraftas.com/projects/totonoe/weekend-ai.html#schedule"
    : `https://basecraftas.com/projects/totonoe/${publicDirectory}/${article.slug}.html`;
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
    media_url: safeUrl(article.media_url),
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
    url: publicUrl,
    absolute_url: absoluteUrl,
    published_at: publishedAt,
    updated_at: new Date().toISOString(),
  };
}

function contentIndexHtml() {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<meta http-equiv="refresh" content="0; url=../index.html#latest">
<title>移動しています｜ToToNoE+</title>
</head>
<body><p><a href="../index.html#latest">ToToNoE+へ移動する</a></p></body>
</html>`;
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
    if (file.delete) return { path: file.path, mode: "100644", type: "blob", sha: null };
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
  const articleHtmlPath = `projects/totonoe/${publicArticleDirectory(article.content_type)}/${article.slug}.html`;
  const legacyArticleHtmlPath = `projects/totonoe/contents/${article.slug}.html`;
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
    const [currentIndex, legacyHtml] = await Promise.all([
      fetchGitHubFile(env, indexPath, baseSha),
      articleHtmlPath === legacyArticleHtmlPath ? null : fetchGitHubFile(env, legacyArticleHtmlPath, baseSha),
    ]);
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
      const files = [
        { path: articleJsonPath, content: `${JSON.stringify(data, null, 2)}\n` },
        { path: articleHtmlPath, content: articleHtml(data) },
        { path: indexHtmlPath, content: contentIndexHtml() },
        { path: indexPath, content: `${JSON.stringify(index, null, 2)}\n` },
      ];
      if (legacyHtml) files.push({ path: legacyArticleHtmlPath, delete: true });
      const commitSha = await commitGitHubFiles(env, files, message, baseSha);
      return { commitSha, liveUrl: data.absolute_url };
    } catch (error) {
      if (error.status !== 422 || attempt === 1) throw error;
    }
  }
  throw new Error("github_publish_conflict");
}

async function removeArticleFromGitHub(env, article) {
  const articleJsonPath = `projects/totonoe/data/contents/${article.slug}.json`;
  const articleHtmlPath = `projects/totonoe/${publicArticleDirectory(article.content_type)}/${article.slug}.html`;
  const legacyArticleHtmlPath = `projects/totonoe/contents/${article.slug}.html`;
  const indexPath = "projects/totonoe/data/contents/index.json";
  const message = `Unpublish content: ${article.title}`;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const branchName = env.GITHUB_BRANCH || DEFAULT_BRANCH;
    const branch = branchName.split("/").map(encodeURIComponent).join("/");
    const ref = await githubRequest(env, `/git/ref/heads/${branch}`);
    const baseSha = ref.object.sha;
    const [currentIndex, currentJson, currentHtml, legacyHtml] = await Promise.all([
      fetchGitHubFile(env, indexPath, baseSha),
      fetchGitHubFile(env, articleJsonPath, baseSha),
      fetchGitHubFile(env, articleHtmlPath, baseSha),
      articleHtmlPath === legacyArticleHtmlPath ? null : fetchGitHubFile(env, legacyArticleHtmlPath, baseSha),
    ]);
    let index = { updated_at: null, articles: [] };
    if (currentIndex?.content) {
      try {
        index = JSON.parse(decodeContent(currentIndex.content));
      } catch (_error) {
        throw new Error("published_index_invalid");
      }
    }
    const previous = Array.isArray(index.articles) ? index.articles : [];
    index.articles = previous.filter((item) => item.id !== article.id && item.slug !== article.slug);
    index.updated_at = new Date().toISOString();
    const files = [{ path: indexPath, content: `${JSON.stringify(index, null, 2)}\n` }];
    if (currentJson) files.push({ path: articleJsonPath, delete: true });
    if (currentHtml) files.push({ path: articleHtmlPath, delete: true });
    if (legacyHtml) files.push({ path: legacyArticleHtmlPath, delete: true });
    try {
      const commitSha = await commitGitHubFiles(env, files, message, baseSha);
      return { commitSha, removed: { index: previous.length !== index.articles.length, json: Boolean(currentJson), html: Boolean(currentHtml || legacyHtml) } };
    } catch (error) {
      if (error.status !== 422 || attempt === 1) throw error;
    }
  }
  throw new Error("github_unpublish_conflict");
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
  if (["POST","PATCH","PUT","DELETE"].includes(request.method)) {
    const bucket = Math.floor(Date.now() / 60000);
    const result = await env.DB.prepare("INSERT INTO api_write_limits(actor_email, bucket, count) VALUES (?, ?, 1) ON CONFLICT(actor_email, bucket) DO UPDATE SET count = count + 1 WHERE count < 60").bind(email, bucket).run();
    if (!result.meta.changes) return {error: json({error: "rate_limited", message: "操作が多すぎます。1分ほど待ってください。"}, {status: 429, headers: {"retry-after":"60"}})};
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

const memberChangeGuard = "(NOT (role = 'admin' AND status = 'active') OR (? = 'admin' AND ? = 'active') OR (SELECT COUNT(*) FROM members WHERE role = 'admin' AND status = 'active') > 1)";
function lastAdminError() { return json({error: "last_admin", message: "最後の管理者は変更・停止できません。"}, {status: 409}); }

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
    const updated = await env.DB.prepare("UPDATE members SET email = ?, name = ?, role = ?, status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND " + memberChangeGuard)
      .bind(email, savedName, role, id, role, "active").run();
    if (!updated.meta.changes) return lastAdminError();
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

  const updated = await env.DB.prepare("UPDATE members SET role = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND " + memberChangeGuard).bind(role, status, id, role, status).run();
  if (!updated.meta.changes) return lastAdminError();
  await audit(env, auth.email, "member.update", "member", id, { role, status });
  const member = await env.DB.prepare("SELECT id, email, name, role, status, created_at, updated_at FROM members WHERE id = ?").bind(id).first();
  return json({ member });
}

async function readJson(request) {
  try {
    const value = JSON.parse(new TextDecoder().decode(await readBytes(request, 512 * 1024)));
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch (error) {
    if (error.status) throw error;
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
    media_url: safeUrl(input.media_url ?? input.mediaUrl ?? fallback.media_url ?? ""),
    episode_no: Number(input.episode_no || input.episodeNo || fallback.episode_no) || null,
    source_published_at: String(input.source_published_at || input.sourcePublishedAt || fallback.source_published_at || "").slice(0, 10),
    source_type: String(input.source_type || input.sourceType || fallback.source_type || "").trim(),
    source_id: safeSourceId(input.source_id ?? input.sourceId ?? fallback.source_id ?? ""),
    hero_url: safeUrl(input.hero_url ?? input.heroUrl ?? fallback.hero_url ?? "", true),
    body_html: sanitizeBody(input.body_html ?? input.bodyHtml ?? fallback.body_html ?? ""),
    status: fallback.status === "published" ? "published" : "draft",
  };
}

async function recordVersion(env, article, actorEmail) {
  await env.DB.prepare(
    `INSERT INTO article_versions
      (id, article_id, revision, title, excerpt, category, destination, content_type, tags, main_actor_id, speaker_ids, media_url,
       episode_no, source_published_at, source_type, source_id, hero_url, body_html, status, actor_email)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      uid("ver"),
      article.id,
      article.revision || 1,
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
            author_email, editor_email, published_at, deleted_at, created_at, updated_at
       FROM articles
      ORDER BY updated_at DESC`
  ).all();
  return (result.results || []).map((article) => ({
    ...serializeArticle(article),
    content_type: normalizeContentType(article.content_type),
    topic_tags: parseJsonArray(article.tags),
    tags: parseJsonArray(article.tags),
    main_actor: findTotonoEPerson(article.main_actor_id),
    speaker_ids: normalizePersonIds(article.speaker_ids),
    speakers: normalizePersonIds(article.speaker_ids).map((id) => findTotonoEPerson(id)),
  }));
}

async function publicWeekendEvent(env) {
  const event = await env.DB.prepare(
    `SELECT hero_url, updated_at
       FROM articles
      WHERE content_type = 'weekend'
        AND status = 'published'
        AND deleted_at IS NULL
        AND hero_url != ''
      ORDER BY updated_at DESC, rowid DESC
      LIMIT 1`
  ).first();
  if (!event || !isCurrentWeekendThumbnail(event.updated_at)) {
    return json({ event: null }, { headers: { "cache-control": "no-store" } });
  }
  return json({ event: {
    hero_url: safeUrl(event.hero_url, true),
    updated_at: event.updated_at,
  } }, { headers: { "cache-control": "no-store" } });
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
  return json({ article: { ...serializeArticle(created), content_type: normalizeContentType(created.content_type), topic_tags: parseJsonArray(created.tags), tags: parseJsonArray(created.tags), main_actor: findTotonoEPerson(created.main_actor_id), speaker_ids: normalizePersonIds(created.speaker_ids), speakers: normalizePersonIds(created.speaker_ids).map((speakerId) => findTotonoEPerson(speakerId)) } }, { status: 201 });
}

function serializeArticle(article) {
  return { ...article, body_html: sanitizeBody(article.body_html), media_url: safeUrl(article.media_url), hero_url: safeUrl(article.hero_url, true), tags: parseJsonArray(article.tags), topic_tags: parseJsonArray(article.tags),
    speaker_ids: normalizePersonIds(article.speaker_ids) };
}

async function updateArticle(request, env, id) {
  const auth = await requireRole(request, env, ["admin", "editor"]);
  if (auth.error) return auth.error;
  const current = await env.DB.prepare("SELECT * FROM articles WHERE id = ?").bind(id).first();
  if (!current) return json({ error: "not_found" }, { status: 404 });
  if (current.deleted_at) return json({ error: "article_in_trash", message: "ゴミ箱の記事は復元してから編集してください。" }, { status: 409 });
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

async function changeArticleLifecycle(request, env, id) {
  const auth = await requireRole(request, env, ["admin"]);
  if (auth.error) return auth.error;
  const current = await env.DB.prepare("SELECT * FROM articles WHERE id = ?").bind(id).first();
  if (!current) return json({ error: "not_found" }, { status: 404 });
  const payload = await readJson(request);
  const action = String(payload?.action || "");
  if (!["unpublish", "trash", "restore"].includes(action)) {
    return json({ error: "invalid_action", message: "操作を確認してください。" }, { status: 400 });
  }
  if (Number(payload?.expected_revision) !== current.revision) {
    return json({ error: "edit_conflict", message: "別の更新があります。最新の内容を確認してください。", article: serializeArticle(current) }, { status: 409 });
  }
  if (action === "restore" && !current.deleted_at) {
    return json({ error: "not_in_trash", message: "この記事はゴミ箱にありません。" }, { status: 409 });
  }
  if (action !== "restore" && current.deleted_at) {
    return json({ error: "article_in_trash", message: "先に記事を復元してください。" }, { status: 409 });
  }

  const lease = Date.now() + 300000;
  const lock = await env.DB.prepare("INSERT INTO article_publish_locks (article_id, expires_at) SELECT id, ? FROM articles WHERE id = ? AND revision = ? ON CONFLICT(article_id) DO UPDATE SET expires_at = excluded.expires_at WHERE article_publish_locks.expires_at < ?")
    .bind(lease, id, current.revision, Date.now()).run();
  if (!lock.meta.changes) return json({ error: "edit_conflict", message: "別の更新または公開処理が進行中です。" }, { status: 409 });

  try {
    let githubResult = null;
    if ((action === "unpublish" || action === "trash") && current.status === "published") {
      githubResult = await removeArticleFromGitHub(env, current);
    }
    const nextStatus = action === "restore" ? "draft" : "archived";
    const deletedAtSql = action === "trash" ? "CURRENT_TIMESTAMP" : "NULL";
    const update = await env.DB.prepare(
      `UPDATE articles
          SET status = ?, deleted_at = ${deletedAtSql}, revision = revision + 1,
              editor_email = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND revision = ?`
    ).bind(nextStatus, auth.email, id, current.revision).run();
    if (!update.meta.changes) {
      return json({ error: "edit_conflict", message: "別の更新があります。最新の内容を確認してください。" }, { status: 409 });
    }
    const updated = await env.DB.prepare("SELECT * FROM articles WHERE id = ?").bind(id).first();
    await recordVersion(env, updated, auth.email);
    await audit(env, auth.email, `article.${action}`, "article", id, githubResult || {});
    return json({ article: serializeArticle(updated), github: githubResult });
  } catch (error) {
    await audit(env, auth.email, `article.${action}.failed`, "article", id, { error: String(error.message || error) });
    return json({ error: "lifecycle_failed", message: String(error.message || error) }, { status: 500 });
  } finally {
    await env.DB.prepare("DELETE FROM article_publish_locks WHERE article_id = ? AND expires_at = ?").bind(id, lease).run();
  }
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
  if (article.deleted_at) return json({ stage: "trash", has_unpublished_changes: false });
  if (article.status === "archived") return json({ stage: "archived", has_unpublished_changes: false });
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
      fetch(root + publicArticleDirectory(article.content_type) + "/" + encodeURIComponent(article.slug) + ".html?check=" + Date.now(), { cache: "no-store", signal: AbortSignal.timeout(8000) })
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
  if (article.deleted_at) return json({ error: "article_in_trash", message: "ゴミ箱の記事は復元してから公開してください。" }, { status: 409 });
  const payload = await readJson(request);
  if (Number(payload && payload.expected_revision) !== article.revision) return json({ error: "edit_conflict", message: "更新があります。保存してから公開してください。" }, { status: 409 });
  if (!normalizeMainActorId(article.main_actor_id)) {
    return json({ error: "main_actor_required", message: "Main Actorを選択してください。" }, { status: 400 });
  }
  if (["podcast", "video", "archive", "seminar"].includes(normalizeContentType(article.content_type)) && !article.media_url) {
    return json({ error: "media_url_required", message: "このコンテンツ種別は元コンテンツURLが必要です。" }, { status: 400 });
  }
  if (normalizeContentType(article.content_type) === "weekend") {
    if (!safeUrl(article.hero_url, true)) {
      return json({ error: "event_thumbnail_required", message: "次回開催のサムネイル画像を設定してください。" }, { status: 400 });
    }
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

    const mediaKeys = await publicationAssets(env, article);
    const result = await publishArticleToGitHub(env, article);
    await env.DB.batch([
      env.DB.prepare("DELETE FROM article_public_assets WHERE article_id = ?").bind(id),
      ...mediaKeys.map(key => env.DB.prepare("INSERT INTO article_public_assets(article_id, r2_key) VALUES (?, ?)").bind(id, key)),
    ]);
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


function archiveFolderId(env) {
  return String(env.DRIVE_ARCHIVE_FOLDER_ID || "").trim();
}

function weeklyFolderId(env) {
  return String(env.DRIVE_WEEKLY_FOLDER_ID || "").trim();
}

function weeklyResponseFolderId(env) {
  return String(env.DRIVE_WEEKLY_RESPONSE_FOLDER_ID || "").trim();
}


function encodeBase64Url(value) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function pemPrivateKey(value) {
  const base64 = String(value || "").replace(/\\n/g, "\n").replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  if (!base64) throw new Error("google_drive_credentials_missing");
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function driveAccessToken(env) {
  if (env.GOOGLE_DRIVE_ACCESS_TOKEN) return env.GOOGLE_DRIVE_ACCESS_TOKEN;
  const email = String(env.GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL || "").trim();
  if (!email || !env.GOOGLE_DRIVE_SERVICE_ACCOUNT_PRIVATE_KEY) throw new Error("google_drive_credentials_missing");
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = encodeBase64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = encodeBase64Url(JSON.stringify({
    iss: email,
    scope: GOOGLE_API_SCOPES,
    aud: "https://oauth2.googleapis.com/token",
    iat: issuedAt,
    exp: issuedAt + 3600,
  }));
  const key = await crypto.subtle.importKey("pkcs8", pemPrivateKey(env.GOOGLE_DRIVE_SERVICE_ACCOUNT_PRIVATE_KEY), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(header + "." + claim));
  const assertion = header + "." + claim + "." + encodeBase64Url(signature);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    signal: AbortSignal.timeout(10000),
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  const payload = JSON.parse(await readTextLimit(response, 256 * 1024) || "{}");
  if (!response.ok || !payload.access_token) throw new Error(payload.error_description || payload.error || "google_drive_token_failed");
  return payload.access_token;
}

function weeklyQuestionSpreadsheetId(env) {
  return String(env.WEEKLY_QUESTION_SPREADSHEET_ID || "").trim();
}

function weeklyQuestionSheetName(env) {
  return String(env.WEEKLY_QUESTION_SHEET_NAME || "質問管理").trim() || "質問管理";
}

function weeklyQuestionSheetConfigured(env) {
  return Boolean(weeklyQuestionSpreadsheetId(env) && weeklyQuestionSheetName(env));
}

function sheetsRangeUrl(env, range) {
  const spreadsheetId = encodeURIComponent(weeklyQuestionSpreadsheetId(env));
  const qualifiedRange = weeklyQuestionSheetName(env) + "!" + range;
  return "https://sheets.googleapis.com/v4/spreadsheets/" + spreadsheetId + "/values/" + encodeURIComponent(qualifiedRange);
}

async function googleJsonRequest(env, url, init = {}) {
  const token = await driveAccessToken(env);
  const headers = new Headers(init.headers || {});
  headers.set("accept", "application/json");
  headers.set("authorization", "Bearer " + token);
  if (init.body) headers.set("content-type", "application/json; charset=utf-8");
  const response = await fetch(url, { ...init, headers, signal: AbortSignal.timeout(10000) });
  const payload = JSON.parse(await readTextLimit(response, 1024 * 1024) || "{}");
  if (!response.ok) {
    const error = new Error(payload?.error?.message || "google_api_request_failed");
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function readWeeklyQuestionSheetRange(env, range) {
  const payload = await googleJsonRequest(env, sheetsRangeUrl(env, range) + "?majorDimension=ROWS");
  return Array.isArray(payload.values) ? payload.values : [];
}

async function assertWeeklyQuestionHeaders(env) {
  const rows = await readWeeklyQuestionSheetRange(env, "A" + WEEKLY_QUESTION_HEADER_ROW + ":W" + WEEKLY_QUESTION_HEADER_ROW);
  const actual = rows[0] || [];
  if (WEEKLY_QUESTION_HEADERS.some((header, index) => String(actual[index] || "").trim() !== header)) {
    throw new Error("weekly_question_sheet_header_mismatch");
  }
}

function weeklyQuestionProfile(row) {
  const snapshot = parseJsonObject(row.profile_snapshot);
  return {
    profession: snapshot.profession || "",
    workplace_type: snapshot.workplace_type || "",
    role_title: snapshot.role_title || "",
    ai_usage_level: snapshot.ai_usage_level || "",
  };
}

function weeklyQuestionSystemCells(row) {
  const profile = weeklyQuestionProfile(row);
  return [
    row.id,
    row.week_start,
    row.created_at,
    row.email || "",
    row.display_name || "",
    profile.profession,
    profile.workplace_type,
    profile.role_title,
    profile.ai_usage_level,
    row.situation,
    row.goal,
    row.use_by || "",
    row.attempts,
    row.blocker,
    row.question,
    WEEKLY_ANSWER_FORMAT_LABELS[row.answer_format] || WEEKLY_ANSWER_FORMAT_LABELS.demonstration,
    Boolean(row.privacy_confirmed),
    Boolean(row.video_consent),
  ];
}

function weeklyQuestionAllCells(row) {
  return [
    ...weeklyQuestionSystemCells(row),
    row.question_group || "",
    row.operations_status || "",
    row.answer_video_title || "",
    row.answer_video_url || "",
    row.operations_notes || "",
  ];
}

async function findWeeklyQuestionSheetRow(env, questionId) {
  const rows = await readWeeklyQuestionSheetRange(env, "A" + WEEKLY_QUESTION_FIRST_DATA_ROW + ":A" + (WEEKLY_QUESTION_FIRST_DATA_ROW + WEEKLY_QUESTION_MAX_ROWS - 1));
  const index = rows.findIndex((row) => String(row?.[0] || "") === questionId);
  return index < 0 ? null : WEEKLY_QUESTION_FIRST_DATA_ROW + index;
}

function parseUpdatedSheetRow(updatedRange) {
  const match = String(updatedRange || "").match(/!A(\d+)(?::W\d+)?$/i);
  return match ? Number(match[1]) : null;
}

function sanitizedSyncError(error) {
  return String(error?.message || error || "weekly_question_sheet_sync_failed").replace(/[\r\n\t]+/g, " ").slice(0, 300);
}

async function writeWeeklyQuestionToSheet(env, row) {
  await assertWeeklyQuestionHeaders(env);
  let sheetRow = Number(row.sheet_row || 0) || await findWeeklyQuestionSheetRow(env, row.id);
  if (sheetRow) {
    const url = sheetsRangeUrl(env, "A" + sheetRow + ":R" + sheetRow) + "?valueInputOption=RAW";
    await googleJsonRequest(env, url, { method: "PUT", body: JSON.stringify({ majorDimension: "ROWS", values: [weeklyQuestionSystemCells(row)] }) });
    return sheetRow;
  }
  const url = sheetsRangeUrl(env, "A:W") + "?valueInputOption=RAW&insertDataOption=INSERT_ROWS&includeValuesInResponse=false";
  const payload = await googleJsonRequest(env, url, { method: "POST", body: JSON.stringify({ majorDimension: "ROWS", values: [weeklyQuestionAllCells(row)] }) });
  sheetRow = parseUpdatedSheetRow(payload?.updates?.updatedRange);
  if (!sheetRow) throw new Error("weekly_question_sheet_row_unknown");
  return sheetRow;
}

async function syncWeeklyQuestionToSheet(env, questionId) {
  if (!weeklyQuestionSheetConfigured(env)) return { status: "disabled" };
  const leaseUntil = Date.now() + 30000;
  const lock = await env.DB.prepare(
    "UPDATE weekly_priority_questions SET sheet_syncing_until = ? WHERE id = ? AND COALESCE(sheet_syncing_until, 0) < ?"
  ).bind(leaseUntil, questionId, Date.now()).run();
  if (!lock.meta.changes) return { status: "busy" };
  try {
    const row = await env.DB.prepare(
      `SELECT q.*, a.email, a.display_name
         FROM weekly_priority_questions q
         JOIN customer_accounts a ON a.id = q.customer_id
        WHERE q.id = ?`
    ).bind(questionId).first();
    if (!row) {
      await env.DB.prepare("UPDATE weekly_priority_questions SET sheet_syncing_until = 0 WHERE id = ?").bind(questionId).run();
      return { status: "missing" };
    }
    const sheetRow = await writeWeeklyQuestionToSheet(env, row);
    await env.DB.prepare(
      "UPDATE weekly_priority_questions SET sheet_row = ?, sheet_synced_at = CURRENT_TIMESTAMP, sheet_last_error = '', sheet_syncing_until = 0 WHERE id = ?"
    ).bind(sheetRow, questionId).run();
    return { status: "synced", sheet_row: sheetRow };
  } catch (error) {
    await env.DB.prepare(
      "UPDATE weekly_priority_questions SET sheet_last_error = ?, sheet_syncing_until = 0 WHERE id = ?"
    ).bind(sanitizedSyncError(error), questionId).run();
    return { status: "failed", error: sanitizedSyncError(error) };
  }
}

async function syncPendingWeeklyQuestionsToSheet(env, limit = 50) {
  if (!weeklyQuestionSheetConfigured(env)) return { status: "disabled", attempted: 0, synced: 0, failed: 0 };
  const pending = await env.DB.prepare(
    `SELECT id FROM weekly_priority_questions
      WHERE sheet_synced_at IS NULL
         OR datetime(updated_at) > datetime(sheet_synced_at)
         OR sheet_last_error <> ''
      ORDER BY created_at ASC
      LIMIT ?`
  ).bind(limit).all();
  let synced = 0;
  let failed = 0;
  for (const item of pending.results || []) {
    const result = await syncWeeklyQuestionToSheet(env, item.id);
    if (result.status === "synced") synced += 1;
    if (result.status === "failed") failed += 1;
  }
  return { status: failed ? "partial" : "ok", attempted: (pending.results || []).length, synced, failed };
}

function driveFileIdFromUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (!new Set(["drive.google.com", "docs.google.com"]).has(url.hostname)) return "";
    const pathMatch = url.pathname.match(/\/d\/([A-Za-z0-9_-]{10,})/);
    const id = pathMatch?.[1] || url.searchParams.get("id") || "";
    return /^[A-Za-z0-9_-]{10,}$/.test(id) ? id : "";
  } catch {
    return "";
  }
}

async function validateWeeklyAnswerVideoUrl(env, url) {
  if (!url) return { id: "", title: "" };
  const fileId = driveFileIdFromUrl(url);
  if (!fileId) throw new Error("weekly_answer_video_url_invalid");
  const response = await googleJsonRequest(env, "https://www.googleapis.com/drive/v3/files/" + encodeURIComponent(fileId) + "?fields=id,name,mimeType,parents,trashed");
  if (response.trashed || !String(response.mimeType || "").startsWith("video/") || !(response.parents || []).includes(weeklyResponseFolderId(env))) {
    throw new Error("weekly_answer_video_outside_authorized_folder");
  }
  const stored = await env.DB.prepare("SELECT id, title FROM weekly_answer_videos WHERE drive_file_id = ? AND status = 'published'").bind(fileId).first();
  if (!stored) throw new Error("weekly_answer_video_not_synced");
  return stored;
}

async function syncWeeklyQuestionOperationsFromSheet(env) {
  if (!weeklyQuestionSheetConfigured(env)) return { status: "disabled", checked: 0, updated: 0, rejected: 0 };
  await assertWeeklyQuestionHeaders(env);
  const rows = await readWeeklyQuestionSheetRange(env, "A" + WEEKLY_QUESTION_FIRST_DATA_ROW + ":W" + (WEEKLY_QUESTION_FIRST_DATA_ROW + WEEKLY_QUESTION_MAX_ROWS - 1));
  let updated = 0;
  let rejected = 0;
  for (let index = 0; index < rows.length; index += 1) {
    const cells = rows[index] || [];
    const questionId = String(cells[0] || "").trim();
    if (!questionId) continue;
    const existing = await env.DB.prepare("SELECT id, status, question_group, operations_status, answer_video_title, answer_video_url, operations_notes FROM weekly_priority_questions WHERE id = ?").bind(questionId).first();
    if (!existing) continue;
    const values = {
      question_group: profileText(cells[18], 120),
      operations_status: profileText(cells[19], 80),
      answer_video_title: profileText(cells[20], 300),
      answer_video_url: String(cells[21] || "").trim().slice(0, 1000),
      operations_notes: profileText(cells[22], 2000),
    };
    if (values.operations_status && !(values.operations_status in WEEKLY_OPERATION_STATUS_MAP)) {
      await env.DB.prepare("UPDATE weekly_priority_questions SET sheet_last_error = ? WHERE id = ?").bind("weekly_question_operation_status_invalid", questionId).run();
      rejected += 1;
      continue;
    }
    try {
      await validateWeeklyAnswerVideoUrl(env, values.answer_video_url);
    } catch (error) {
      await env.DB.prepare("UPDATE weekly_priority_questions SET sheet_last_error = ? WHERE id = ?").bind(sanitizedSyncError(error), questionId).run();
      rejected += 1;
      continue;
    }
    const nextStatus = values.operations_status
      ? WEEKLY_OPERATION_STATUS_MAP[values.operations_status]
      : existing.status;
    await env.DB.prepare(
      `UPDATE weekly_priority_questions
          SET question_group = ?, operations_status = ?, answer_video_title = ?, answer_video_url = ?, operations_notes = ?,
              status = ?, answered_at = CASE WHEN ? = 'answered' THEN COALESCE(answered_at, CURRENT_TIMESTAMP) ELSE answered_at END,
              sheet_operations_synced_at = CURRENT_TIMESTAMP, sheet_last_error = ''
        WHERE id = ?`
    ).bind(values.question_group, values.operations_status, values.answer_video_title, values.answer_video_url, values.operations_notes, nextStatus, nextStatus, questionId).run();
    if (Object.keys(values).some((key) => String(values[key] || "") !== String(existing[key] || "")) || nextStatus !== existing.status) updated += 1;
  }
  return { status: rejected ? "partial" : "ok", checked: rows.length, updated, rejected };
}

async function fetchDriveArchiveFiles(env) {
  const folderId = archiveFolderId(env);
  if (!folderId) throw new Error("drive_archive_folder_missing");
  const accessToken = await driveAccessToken(env);
  const files = [];
  let pageToken = "";
  for (let page = 0; page < 5; page += 1) {
    const params = new URLSearchParams({
      q: "'" + folderId.replace(/'/g, "\\'") + "' in parents and trashed = false",
      spaces: "drive",
      orderBy: "createdTime desc",
      pageSize: "1000",
      fields: "nextPageToken,files(id,name,mimeType,createdTime,modifiedTime,webViewLink,thumbnailLink)",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const response = await fetch("https://www.googleapis.com/drive/v3/files?" + params.toString(), {
      signal: AbortSignal.timeout(10000),
      headers: { accept: "application/json", authorization: "Bearer " + accessToken },
    });
    const payload = JSON.parse(await readTextLimit(response, 1024 * 1024) || "{}");
    if (!response.ok) throw new Error(payload?.error?.message || "google_drive_list_failed");
    files.push(...(payload.files || []).filter((file) =>
      String(file.mimeType || "").startsWith("video/") || String(file.mimeType || "").startsWith("audio/")
    ));
    pageToken = payload.nextPageToken || "";
    if (!pageToken) break;
  }
  return files;
}

async function saveArchiveSyncState(env, values) {
  await env.DB.prepare("INSERT INTO archive_sync_state (id, last_checked_at, last_success_at, last_error, file_count, new_count) VALUES ('drive', CURRENT_TIMESTAMP, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET last_checked_at = CURRENT_TIMESTAMP, last_success_at = excluded.last_success_at, last_error = excluded.last_error, file_count = excluded.file_count, new_count = excluded.new_count")
    .bind(values.success ? new Date().toISOString() : null, values.error || "", values.fileCount || 0, values.newCount || 0).run();
}

async function scanDriveArchives(env, actorEmail = "system@column-studio") {
  try {
    const files = await fetchDriveArchiveFiles(env);
    let newCount = 0;
    for (const file of files) {
      const existing = await env.DB.prepare("SELECT id FROM archive_candidates WHERE drive_file_id = ?").bind(file.id).first();
      if (!existing) newCount += 1;
      const viewUrl = file.webViewLink || ("https://drive.google.com/file/d/" + encodeURIComponent(file.id) + "/view");
      await env.DB.prepare("INSERT INTO archive_candidates (id, drive_file_id, name, mime_type, web_view_link, thumbnail_link, created_time, modified_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(drive_file_id) DO UPDATE SET name = excluded.name, mime_type = excluded.mime_type, web_view_link = excluded.web_view_link, thumbnail_link = excluded.thumbnail_link, created_time = excluded.created_time, modified_time = excluded.modified_time")
        .bind(existing?.id || uid("archive"), file.id, String(file.name || "名称未設定").slice(0, 300), String(file.mimeType || "").slice(0, 100), viewUrl, String(file.thumbnailLink || ""), String(file.createdTime || ""), String(file.modifiedTime || "")).run();
    }
    await saveArchiveSyncState(env, { success: true, fileCount: files.length, newCount });
    await audit(env, actorEmail, "archive.scan", "drive_folder", archiveFolderId(env), { file_count: files.length, new_count: newCount });
    return { file_count: files.length, new_count: newCount };
  } catch (error) {
    await saveArchiveSyncState(env, { success: false, error: String(error.message || error) });
    throw error;
  }
}

async function listArchiveCandidates(request, env) {
  const auth = await requireRole(request, env, ["admin", "editor", "viewer"]);
  if (auth.error) return auth.error;
  const [candidates, sync] = await Promise.all([
    env.DB.prepare("SELECT id, drive_file_id, name, mime_type, web_view_link, thumbnail_link, created_time, modified_time, status, article_id, detected_at, imported_at FROM archive_candidates ORDER BY CASE status WHEN 'new' THEN 0 WHEN 'imported' THEN 1 ELSE 2 END, created_time DESC, detected_at DESC").all(),
    env.DB.prepare("SELECT * FROM archive_sync_state WHERE id = 'drive'").first(),
  ]);
  return json({ candidates: candidates.results || [], sync: sync || null, schedule: "毎週土曜日 09:00（日本時間）" });
}

async function scanArchiveCandidates(request, env) {
  const auth = await requireRole(request, env, ["admin", "editor"]);
  if (auth.error) return auth.error;
  try {
    const result = await scanDriveArchives(env, auth.email);
    return json(result);
  } catch (error) {
    return json({ error: "archive_scan_failed", message: String(error.message || error) }, { status: 502 });
  }
}

function archiveSlug(fileId) {
  const safe = String(fileId || "").toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
  return "archive-" + (safe || crypto.randomUUID());
}

function archiveTitle(name) {
  return String(name || "アーカイブ動画").replace(/\.(mp4|mov|m4v|webm|mkv|mp3|m4a|wav)$/i, "").trim() || "アーカイブ動画";
}

async function importArchiveCandidate(request, env, id) {
  const auth = await requireRole(request, env, ["admin", "editor"]);
  if (auth.error) return auth.error;
  const candidate = await env.DB.prepare("SELECT * FROM archive_candidates WHERE id = ?").bind(id).first();
  if (!candidate) return json({ error: "archive_candidate_not_found" }, { status: 404 });
  if (candidate.article_id) {
    const existing = await env.DB.prepare("SELECT * FROM articles WHERE id = ?").bind(candidate.article_id).first();
    if (existing) return json({ article: serializeArticle(existing), candidate });
  }
  const sourceArticle = await env.DB.prepare("SELECT * FROM articles WHERE source_type = 'archive' AND source_id = ?").bind(candidate.drive_file_id).first();
  if (sourceArticle) {
    await env.DB.prepare("UPDATE archive_candidates SET status = 'imported', article_id = ?, imported_at = CURRENT_TIMESTAMP WHERE id = ?").bind(sourceArticle.id, id).run();
    return json({ article: serializeArticle(sourceArticle), candidate: { ...candidate, status: "imported", article_id: sourceArticle.id } });
  }
  const articleId = uid("article");
  let slug = archiveSlug(candidate.drive_file_id);
  const collision = await env.DB.prepare("SELECT id FROM articles WHERE slug = ?").bind(slug).first();
  if (collision) slug += "-" + crypto.randomUUID().slice(0, 8);
  const metadata = archiveMetadata(candidate.name, candidate.created_time);
  const podcasts = metadata.episodeNo ? await env.DB.prepare("SELECT title, source_published_at FROM articles WHERE content_type = 'podcast' AND episode_no = ? AND deleted_at IS NULL AND status != 'archived' LIMIT 2").bind(metadata.episodeNo).all() : { results: [] };
  const podcast = podcasts.results.length === 1 ? podcasts.results[0] : null;
  const title = podcast ? podcast.title : archiveTitle(candidate.name);
  const sourceDate = metadata.sourceDate;
  const statements = [
    env.DB.prepare("INSERT INTO articles (id, slug, title, excerpt, category, destination, content_type, tags, main_actor_id, speaker_ids, media_url, episode_no, source_published_at, source_type, source_id, hero_url, body_html, status, author_email, editor_email) VALUES (?, ?, ?, ?, 'content', 'totonoe', 'archive', '[]', '', '[]', ?, ?, ?, 'archive', ?, ?, '', 'draft', ?, ?)")
      .bind(articleId, slug, title, "Google Driveのアーカイブ候補から作成した下書きです。", candidate.web_view_link, metadata.episodeNo, sourceDate, candidate.drive_file_id, "", auth.email, auth.email),
    env.DB.prepare("UPDATE archive_candidates SET status = 'imported', article_id = ?, imported_at = CURRENT_TIMESTAMP WHERE id = ?").bind(articleId, id),
  ];
  const results = await env.DB.batch(statements);
  if (!results[0].meta.changes) return json({ error: "archive_import_failed" }, { status: 409 });
  const article = await env.DB.prepare("SELECT * FROM articles WHERE id = ?").bind(articleId).first();
  await recordVersion(env, article, auth.email);
  await audit(env, auth.email, "archive.import", "archive_candidate", id, { article_id: articleId, drive_file_id: candidate.drive_file_id });
  return json({ article: serializeArticle(article), candidate: { ...candidate, status: "imported", article_id: articleId } }, { status: 201 });
}

function weeklyMaterialTitle(fileName) {
  return String(fileName || "ToToNoE+ TAYORI")
    .replace(/\.pdf$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim() || "ToToNoE+ TAYORI";
}

async function fetchDriveWeeklyFiles(env) {
  const folderId = weeklyFolderId(env);
  if (!folderId) throw new Error("drive_weekly_folder_missing");
  const accessToken = await driveAccessToken(env);
  const files = [];
  let pageToken = "";
  for (let page = 0; page < 5; page += 1) {
    const params = new URLSearchParams({
      q: "'" + folderId.replace(/'/g, "\\'") + "' in parents and trashed = false and mimeType = 'application/pdf'",
      spaces: "drive",
      orderBy: "createdTime desc",
      pageSize: "1000",
      fields: "nextPageToken,files(id,name,description,mimeType,size,createdTime,modifiedTime,webViewLink,webContentLink)",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const response = await fetch("https://www.googleapis.com/drive/v3/files?" + params.toString(), {
      signal: AbortSignal.timeout(10000),
      headers: { accept: "application/json", authorization: "Bearer " + accessToken },
    });
    const payload = JSON.parse(await readTextLimit(response, 1024 * 1024) || "{}");
    if (!response.ok) throw new Error(payload?.error?.message || "google_drive_weekly_list_failed");
    files.push(...(payload.files || []));
    pageToken = payload.nextPageToken || "";
    if (!pageToken) break;
  }
  return files;
}

async function saveWeeklySyncState(env, values) {
  await env.DB.prepare(
    "INSERT INTO weekly_material_sync_state (id, last_checked_at, last_success_at, last_error, file_count, new_count) VALUES ('drive', CURRENT_TIMESTAMP, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET last_checked_at = CURRENT_TIMESTAMP, last_success_at = excluded.last_success_at, last_error = excluded.last_error, file_count = excluded.file_count, new_count = excluded.new_count"
  ).bind(values.success ? new Date().toISOString() : null, values.error || "", values.fileCount || 0, values.newCount || 0).run();
}

async function syncWeeklyMaterials(env, actorEmail = "system@column-studio") {
  try {
    const files = await fetchDriveWeeklyFiles(env);
    let newCount = 0;
    for (const file of files) {
      const existing = await env.DB.prepare("SELECT id FROM weekly_materials WHERE drive_file_id = ?").bind(file.id).first();
      if (!existing) newCount += 1;
      const viewUrl = file.webViewLink || ("https://drive.google.com/file/d/" + encodeURIComponent(file.id) + "/view");
      const downloadUrl = file.webContentLink || ("https://drive.google.com/uc?export=download&id=" + encodeURIComponent(file.id));
      const publishedAt = String(file.createdTime || file.modifiedTime || new Date().toISOString());
      await env.DB.prepare(
        `INSERT INTO weekly_materials
          (id, drive_file_id, title, file_name, description, mime_type, size_bytes, web_view_link, web_content_link, published_at, drive_created_time, drive_modified_time, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published')
         ON CONFLICT(drive_file_id) DO UPDATE SET
           title = excluded.title,
           file_name = excluded.file_name,
           description = excluded.description,
           mime_type = excluded.mime_type,
           size_bytes = excluded.size_bytes,
           web_view_link = excluded.web_view_link,
           web_content_link = excluded.web_content_link,
           drive_created_time = excluded.drive_created_time,
           drive_modified_time = excluded.drive_modified_time,
           status = 'published',
           updated_at = CURRENT_TIMESTAMP`
      ).bind(
        existing?.id || uid("weekly"),
        file.id,
        weeklyMaterialTitle(file.name),
        String(file.name || "weekly.pdf").slice(0, 300),
        String(file.description || "").slice(0, 1000),
        String(file.mimeType || "application/pdf"),
        Number(file.size || 0),
        viewUrl,
        downloadUrl,
        publishedAt,
        String(file.createdTime || ""),
        String(file.modifiedTime || "")
      ).run();
    }
    await saveWeeklySyncState(env, { success: true, fileCount: files.length, newCount });
    await audit(env, actorEmail, "weekly.scan", "drive_folder", weeklyFolderId(env), { file_count: files.length, new_count: newCount });
    return { file_count: files.length, new_count: newCount };
  } catch (error) {
    await saveWeeklySyncState(env, { success: false, error: String(error.message || error) });
    throw error;
  }
}

function weeklyAnswerVideoTitle(fileName) {
  return String(fileName || "TAYORI回答動画")
    .replace(/\.(mp4|mov|m4v|webm)$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim() || "TAYORI回答動画";
}

async function fetchDriveWeeklyAnswerVideos(env) {
  const folderId = weeklyResponseFolderId(env);
  if (!folderId) throw new Error("drive_weekly_response_folder_missing");
  const accessToken = await driveAccessToken(env);
  const files = [];
  let pageToken = "";
  for (let page = 0; page < 5; page += 1) {
    const params = new URLSearchParams({
      q: "'" + folderId.replace(/'/g, "\\'") + "' in parents and trashed = false",
      spaces: "drive",
      orderBy: "createdTime desc",
      pageSize: "1000",
      fields: "nextPageToken,files(id,name,description,mimeType,size,createdTime,modifiedTime)",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const response = await fetch("https://www.googleapis.com/drive/v3/files?" + params.toString(), {
      signal: AbortSignal.timeout(10000),
      headers: { accept: "application/json", authorization: "Bearer " + accessToken },
    });
    const payload = JSON.parse(await readTextLimit(response, 1024 * 1024) || "{}");
    if (!response.ok) throw new Error(payload?.error?.message || "google_drive_weekly_response_list_failed");
    files.push(...(payload.files || []).filter((file) => String(file.mimeType || "").startsWith("video/")));
    pageToken = payload.nextPageToken || "";
    if (!pageToken) break;
  }
  return files;
}

async function saveWeeklyAnswerVideoSyncState(env, values) {
  await env.DB.prepare(
    "INSERT INTO weekly_answer_video_sync_state (id, last_checked_at, last_success_at, last_error, file_count, new_count) VALUES ('drive', CURRENT_TIMESTAMP, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET last_checked_at = CURRENT_TIMESTAMP, last_success_at = excluded.last_success_at, last_error = excluded.last_error, file_count = excluded.file_count, new_count = excluded.new_count"
  ).bind(values.success ? new Date().toISOString() : null, values.error || "", values.fileCount || 0, values.newCount || 0).run();
}

async function syncWeeklyAnswerVideos(env, actorEmail = "system@column-studio") {
  try {
    const files = await fetchDriveWeeklyAnswerVideos(env);
    let newCount = 0;
    for (const file of files) {
      const existing = await env.DB.prepare("SELECT id FROM weekly_answer_videos WHERE drive_file_id = ?").bind(file.id).first();
      if (!existing) newCount += 1;
      const publishedAt = String(file.createdTime || file.modifiedTime || new Date().toISOString());
      await env.DB.prepare(
        `INSERT INTO weekly_answer_videos
          (id, drive_file_id, title, description, file_name, mime_type, size_bytes, published_at, drive_created_time, drive_modified_time, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published')
         ON CONFLICT(drive_file_id) DO UPDATE SET
           title = excluded.title,
           description = excluded.description,
           file_name = excluded.file_name,
           mime_type = excluded.mime_type,
           size_bytes = excluded.size_bytes,
           drive_created_time = excluded.drive_created_time,
           drive_modified_time = excluded.drive_modified_time,
           status = 'published',
           updated_at = CURRENT_TIMESTAMP`
      ).bind(existing?.id || uid("weekly_video"), file.id, weeklyAnswerVideoTitle(file.name), String(file.description || "").slice(0, 1000), String(file.name || "answer-video.mp4").slice(0, 300), String(file.mimeType || "video/mp4").slice(0, 100), Number(file.size || 0), publishedAt, String(file.createdTime || ""), String(file.modifiedTime || "")).run();
    }
    await saveWeeklyAnswerVideoSyncState(env, { success: true, fileCount: files.length, newCount });
    await audit(env, actorEmail, "weekly.answer_videos.scan", "drive_folder", weeklyResponseFolderId(env), { file_count: files.length, new_count: newCount });
    return { file_count: files.length, new_count: newCount };
  } catch (error) {
    await saveWeeklyAnswerVideoSyncState(env, { success: false, error: String(error.message || error) });
    throw error;
  }
}

async function getCustomerAccess(request, env) {
  const sessionAuth = await getCustomerIdentity(request, env);
  const email = sessionAuth?.customer?.email || await getActorEmail(request, env);
  if (!email) return { error: json({ error: "authentication_required" }, { status: 401 }) };
  const customer = sessionAuth?.customer || await env.DB.prepare(
    "SELECT id, email, display_name, status FROM customer_accounts WHERE lower(email) = ? AND status = 'active'"
  ).bind(email).first();
  if (!customer) return { error: json({ error: "customer_not_found" }, { status: 403 }) };
  const result = await env.DB.prepare(
    `SELECT
       ce.entitlement_code,
       ce.id AS entitlement_id,
       ce.starts_at,
       ce.ends_at,
       cs.status AS subscription_status,
       cs.current_period_end,
       cs.cancel_at_period_end
     FROM customer_entitlements ce
     LEFT JOIN customer_subscriptions cs ON cs.id = ce.source_subscription_id
     WHERE ce.customer_id = ?
      AND ce.status = 'active'
      AND datetime(ce.starts_at) <= datetime('now')
      AND (ce.ends_at IS NULL OR datetime(ce.ends_at) > datetime('now'))
       AND (
         cs.id IS NULL
         OR cs.status IN ('trialing', 'active')
         OR (cs.status = 'canceled' AND cs.current_period_end IS NOT NULL AND datetime(cs.current_period_end) > datetime('now'))
       )
     ORDER BY COALESCE(ce.ends_at, '9999-12-31') DESC`
  ).bind(customer.id).all();
  const entitlements = result.results || [];
  const hasWeeklyAccess = entitlements.some((item) => item.entitlement_code === "weekly_access" || item.entitlement_code === "curriculum_all_access");
  const hasCurriculumAccess = entitlements.some((item) => item.entitlement_code === "curriculum_all_access");
  const currentPeriodEnd = entitlements.map((item) => item.current_period_end || item.ends_at).filter(Boolean).sort().at(-1) || null;
  return {
    email,
    customer,
    entitlements,
    access: {
      customer_id: customer.id,
      email: customer.email,
      display_name: customer.display_name,
      current_period_end: currentPeriodEnd,
      has_weekly_access: hasWeeklyAccess,
      has_curriculum_access: hasCurriculumAccess,
    },
  };
}

async function getCustomerIdentity(request, env) {
  const token = readCookie(request, "totonoe_session");
  if (!token || token.length > 256) return null;
  if (!env.CUSTOMER_AUTH_SECRET) return null;
  const tokenHash = await hashAuthValue(env.CUSTOMER_AUTH_SECRET, "session", token);
  const customer = await env.DB.prepare(
    `SELECT ca.id, ca.email, ca.display_name, ca.status, ca.email_verified_at,
            ca.therapist_status, ca.stripe_customer_id, cs.id AS session_id
       FROM customer_sessions cs
       JOIN customer_accounts ca ON ca.id = cs.customer_id
      WHERE cs.token_hash = ?
        AND cs.revoked_at IS NULL
        AND datetime(cs.expires_at) > datetime('now')
        AND ca.status = 'active'
        AND ca.email_verified_at IS NOT NULL
      LIMIT 1`
  ).bind(tokenHash).first();
  return customer ? { customer } : null;
}

async function requireCustomerIdentity(request, env) {
  const auth = await getCustomerIdentity(request, env);
  if (!auth) return { error: json({ error: "authentication_required" }, { status: 401 }) };
  return auth;
}

async function incrementCustomerAuthLimit(env, scopeKey, limit) {
  const bucket = Math.floor(Date.now() / (AUTH_RATE_BUCKET_MINUTES * 60 * 1000));
  const row = await env.DB.prepare(
    `INSERT INTO customer_auth_rate_limits(scope_key, bucket, count)
     VALUES (?, ?, 1)
     ON CONFLICT(scope_key, bucket) DO UPDATE SET count = count + 1
     RETURNING count`
  ).bind(scopeKey, bucket).first();
  if (Number(row?.count || 0) > limit) throw Object.assign(new Error("too_many_requests"), { status: 429 });
}

function isLocalDevelopmentRequest(request, env) {
  return env.ALLOW_DEV_AUTH === "true" && ["localhost", "127.0.0.1", "test.local"].includes(new URL(request.url).hostname);
}

async function requestCustomerAuthCode(request, env) {
  const payload = await readJson(request);
  if (!payload) return json({ error: "invalid_json" }, { status: 400 });
  const email = normalizeCustomerEmail(payload.email);
  const ip = String(request.headers.get("cf-connecting-ip") || "unknown").slice(0, 80);
  const requestKey = await hashAuthValue(env.CUSTOMER_AUTH_SECRET, "auth-request", ip);
  const emailKey = await hashAuthValue(env.CUSTOMER_AUTH_SECRET, "auth-email", email);
  await Promise.all([
    incrementCustomerAuthLimit(env, `ip:${requestKey}`, 10),
    incrementCustomerAuthLimit(env, `email:${emailKey}`, 3),
  ]);

  const code = generateOtpCode();
  const challengeId = uid("auth_challenge");
  const codeHash = await hashAuthValue(env.CUSTOMER_AUTH_SECRET, `otp:${challengeId}`, code);
  await env.DB.prepare(
    `INSERT INTO customer_auth_challenges
      (id, email, code_hash, request_key, status, expires_at)
     VALUES (?, ?, ?, ?, 'pending', datetime('now', ?))`
  ).bind(challengeId, email, codeHash, requestKey, `+${CUSTOMER_OTP_TTL_MINUTES} minutes`).run();

  try {
    let messageId = "local-development";
    if (!isLocalDevelopmentRequest(request, env)) {
      const result = await sendOtpWithResend(env, { email, code, challengeId });
      messageId = result.messageId;
    }
    await env.DB.prepare(
      "UPDATE customer_auth_challenges SET status = 'sent', resend_message_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(messageId, challengeId).run();
    const response = { ok: true, expires_in_seconds: CUSTOMER_OTP_TTL_MINUTES * 60 };
    if (isLocalDevelopmentRequest(request, env)) response.dev_code = code;
    return json(response, { status: 202 });
  } catch (error) {
    await env.DB.prepare(
      "UPDATE customer_auth_challenges SET status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(challengeId).run();
    throw error;
  }
}

async function verifyCustomerAuthCode(request, env) {
  const payload = await readJson(request);
  if (!payload) return json({ error: "invalid_json" }, { status: 400 });
  const email = normalizeCustomerEmail(payload.email);
  const code = String(payload.code || "").trim();
  if (!/^\d{6}$/.test(code)) return json({ error: "invalid_auth_code" }, { status: 400 });
  const challenge = await env.DB.prepare(
    `SELECT id, code_hash, attempts_remaining
       FROM customer_auth_challenges
      WHERE email = ? AND status = 'sent' AND consumed_at IS NULL
        AND datetime(expires_at) > datetime('now')
      ORDER BY datetime(created_at) DESC LIMIT 1`
  ).bind(email).first();
  if (!challenge) return json({ error: "auth_code_expired" }, { status: 400 });
  const candidateHash = await hashAuthValue(env.CUSTOMER_AUTH_SECRET, `otp:${challenge.id}`, code);
  if (!timingSafeTextEqual(candidateHash, challenge.code_hash)) {
    await env.DB.prepare(
      `UPDATE customer_auth_challenges
          SET attempts_remaining = MAX(0, attempts_remaining - 1),
              status = CASE WHEN attempts_remaining <= 1 THEN 'expired' ELSE status END,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND consumed_at IS NULL`
    ).bind(challenge.id).run();
    return json({ error: "invalid_auth_code", attempts_remaining: Math.max(0, Number(challenge.attempts_remaining) - 1) }, { status: 400 });
  }

  const consumed = await env.DB.prepare(
    `UPDATE customer_auth_challenges
        SET status = 'consumed', consumed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND consumed_at IS NULL AND attempts_remaining > 0`
  ).bind(challenge.id).run();
  if (!Number(consumed.meta?.changes || 0)) return json({ error: "auth_code_already_used" }, { status: 409 });

  const newCustomerId = uid("customer");
  await env.DB.prepare(
    `INSERT INTO customer_accounts(id, email, status, email_verified_at)
     VALUES (?, ?, 'active', CURRENT_TIMESTAMP)
     ON CONFLICT(email) DO UPDATE SET
       status = CASE WHEN status = 'deleted' THEN status ELSE 'active' END,
       email_verified_at = CURRENT_TIMESTAMP,
       updated_at = CURRENT_TIMESTAMP`
  ).bind(newCustomerId, email).run();
  const customer = await env.DB.prepare(
    "SELECT id, email, display_name, status, email_verified_at, therapist_status, stripe_customer_id FROM customer_accounts WHERE email = ?"
  ).bind(email).first();
  if (!customer || customer.status !== "active") return json({ error: "customer_account_unavailable" }, { status: 403 });

  const token = generateSessionToken();
  const tokenHash = await hashAuthValue(env.CUSTOMER_AUTH_SECRET, "session", token);
  const sessionId = uid("customer_session");
  await env.DB.prepare(
    `INSERT INTO customer_sessions(id, customer_id, token_hash, expires_at)
     VALUES (?, ?, ?, datetime('now', ?))`
  ).bind(sessionId, customer.id, tokenHash, `+${CUSTOMER_SESSION_DAYS} days`).run();
  return json({
    ok: true,
    customer: {
      email: customer.email,
      display_name: customer.display_name || "",
      therapist_status: customer.therapist_status,
    },
  }, { headers: { "set-cookie": customerSessionCookie(token) } });
}

async function customerAuthStatus(request, env) {
  const auth = await getCustomerIdentity(request, env);
  if (!auth) return json({ authenticated: false });
  return json({
    authenticated: true,
    customer: {
      email: auth.customer.email,
      display_name: auth.customer.display_name || "",
      therapist_status: auth.customer.therapist_status,
    },
  });
}

async function logoutCustomer(request, env) {
  const token = readCookie(request, "totonoe_session");
  if (token && token.length <= 256) {
    const tokenHash = await hashAuthValue(env.CUSTOMER_AUTH_SECRET, "session", token);
    await env.DB.prepare(
      "UPDATE customer_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE token_hash = ? AND revoked_at IS NULL"
    ).bind(tokenHash).run();
  }
  return json({ ok: true }, { headers: { "set-cookie": clearCustomerSessionCookie() } });
}

async function getCustomerQualification(request, env) {
  const auth = await requireCustomerIdentity(request, env);
  if (auth.error) return auth.error;
  const submission = await env.DB.prepare(
    `SELECT id, profession, status, review_note, reviewed_at, created_at, updated_at
       FROM qualification_submissions
      WHERE customer_id = ? AND status != 'deleted'
      ORDER BY datetime(created_at) DESC LIMIT 1`
  ).bind(auth.customer.id).first();
  return json({
    therapist_status: auth.customer.therapist_status,
    display_name: auth.customer.display_name || "",
    submission: submission || null,
  });
}

async function submitCustomerQualification(request, env) {
  const auth = await requireCustomerIdentity(request, env);
  if (auth.error) return auth.error;
  if (!env.MEDIA) return json({ error: "media_bucket_not_configured" }, { status: 500 });
  if (auth.customer.therapist_status === "verified") {
    return json({ error: "qualification_already_verified" }, { status: 409 });
  }
  const existing = await env.DB.prepare(
    "SELECT id FROM qualification_submissions WHERE customer_id = ? AND status = 'pending' LIMIT 1"
  ).bind(auth.customer.id).first();
  if (existing) return json({ error: "qualification_already_pending" }, { status: 409 });

  const bytes = await readBytes(request, MAX_IMAGE_BYTES + 64 * 1024);
  const form = await new Response(bytes, { headers: { "content-type": request.headers.get("content-type") } }).formData();
  const file = form.get("file");
  const profession = String(form.get("profession") || "").normalize("NFKC").trim().slice(0, 80);
  const applicantName = String(form.get("applicant_name") || "").normalize("NFKC").trim().replace(/\s+/g, " ").slice(0, 100);
  const privacyConsent = String(form.get("privacy_consent") || "");
  if (!(file instanceof File)) return json({ error: "file_required" }, { status: 400 });
  if (!profession) return json({ error: "profession_required" }, { status: 400 });
  if (!applicantName) return json({ error: "applicant_name_required" }, { status: 400 });
  if (privacyConsent !== "accepted") return json({ error: "privacy_consent_required" }, { status: 400 });
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return json({ error: "unsupported_image_type", allowed: Array.from(ALLOWED_IMAGE_TYPES) }, { status: 415 });
  }
  if (file.size > MAX_IMAGE_BYTES) return json({ error: "image_too_large", max_bytes: MAX_IMAGE_BYTES }, { status: 413 });
  const content = new Uint8Array(await file.arrayBuffer());
  if (imageType(content) !== file.type) return json({ error: "invalid_image_content" }, { status: 415 });

  const submissionId = uid("qualification");
  const key = `qualifications/${auth.customer.id}/${crypto.randomUUID()}-${safeFilename(file.name || "license-image")}`;
  await env.MEDIA.put(key, content, {
    httpMetadata: { contentType: file.type },
    customMetadata: { customerId: auth.customer.id, submissionId },
  });
  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO qualification_submissions
          (id, customer_id, profession, private_r2_object_key, original_file_name, mime_type, size_bytes, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`
      ).bind(submissionId, auth.customer.id, profession, key, String(file.name || "").slice(0, 255), file.type, file.size),
      env.DB.prepare(
        "UPDATE customer_accounts SET display_name = ?, therapist_status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).bind(applicantName, auth.customer.id),
    ]);
  } catch (error) {
    await env.MEDIA.delete(key);
    throw error;
  }
  await audit(env, auth.customer.email, "qualification.submit", "qualification_submission", submissionId, { profession });
  return json({ submission: { id: submissionId, profession, status: "pending" } }, { status: 201 });
}

async function listQualificationsAdmin(request, env) {
  const auth = await requireRole(request, env, ["admin"]);
  if (auth.error) return auth.error;
  const result = await env.DB.prepare(
    `SELECT qs.id, qs.customer_id, ca.email, ca.display_name, qs.profession, qs.original_file_name, qs.mime_type,
            qs.size_bytes, qs.status, qs.review_note, qs.reviewed_at, qs.created_at, qs.updated_at
       FROM qualification_submissions qs
       JOIN customer_accounts ca ON ca.id = qs.customer_id
      WHERE qs.status != 'deleted'
      ORDER BY CASE qs.status WHEN 'pending' THEN 0 ELSE 1 END, datetime(qs.created_at) DESC`
  ).all();
  return json({ submissions: result.results || [] });
}

async function openQualificationImageAdmin(request, env, submissionId) {
  const auth = await requireRole(request, env, ["admin"]);
  if (auth.error) return auth.error;
  if (!env.MEDIA) return new Response("Not found", { status: 404 });
  const submission = await env.DB.prepare(
    "SELECT private_r2_object_key, mime_type FROM qualification_submissions WHERE id = ? AND status != 'deleted'"
  ).bind(submissionId).first();
  if (!submission || !ALLOWED_IMAGE_TYPES.has(submission.mime_type)) return new Response("Not found", { status: 404 });
  const object = await env.MEDIA.get(submission.private_r2_object_key);
  if (!object) return new Response("Not found", { status: 404 });
  return new Response(object.body, { headers: {
    "content-type": submission.mime_type,
    "cache-control": "private, no-store",
    "content-disposition": "inline",
  } });
}

async function reviewQualificationAdmin(request, env, submissionId) {
  const auth = await requireRole(request, env, ["admin"]);
  if (auth.error) return auth.error;
  const payload = await readJson(request);
  if (!payload) return json({ error: "invalid_json" }, { status: 400 });
  const status = String(payload.status || "");
  if (!["verified", "rejected"].includes(status)) return json({ error: "invalid_qualification_status" }, { status: 400 });
  const note = String(payload.review_note || "").normalize("NFKC").trim().slice(0, 500);
  if (status === "rejected" && !note) return json({ error: "review_note_required" }, { status: 400 });
  const submission = await env.DB.prepare(
    `SELECT qs.id, qs.customer_id, qs.status, ca.email
       FROM qualification_submissions qs JOIN customer_accounts ca ON ca.id = qs.customer_id
      WHERE qs.id = ? AND qs.status = 'pending'`
  ).bind(submissionId).first();
  if (!submission) return json({ error: "qualification_not_pending" }, { status: 409 });
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE qualification_submissions
          SET status = ?, reviewer_member_id = ?, review_note = ?, reviewed_at = CURRENT_TIMESTAMP,
              purge_after = datetime('now', ?), updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'pending'`
    ).bind(status, auth.member.id, note, `+${QUALIFICATION_RETENTION_DAYS} days`, submissionId),
    env.DB.prepare(
      "UPDATE customer_accounts SET therapist_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(status, submission.customer_id),
  ]);
  await audit(env, auth.email, `qualification.${status}`, "qualification_submission", submissionId, { customer_id: submission.customer_id });
  let notificationSent = false;
  try {
    await sendQualificationReviewEmail(env, { email: submission.email, status, submissionId, reviewNote: note });
    notificationSent = true;
  } catch (error) {
    console.error(JSON.stringify({ event: "qualification.notification_failed", submission_id: submissionId, error: String(error.message || error) }));
  }
  return json({ submission: { id: submissionId, status, review_note: note }, notification_sent: notificationSent });
}

async function purgeExpiredQualificationImages(env) {
  if (!env.MEDIA) return 0;
  const expired = await env.DB.prepare(
    `SELECT id, private_r2_object_key FROM qualification_submissions
      WHERE status IN ('verified', 'rejected') AND purge_after IS NOT NULL
        AND datetime(purge_after) <= datetime('now')
      LIMIT 100`
  ).all();
  let purged = 0;
  for (const submission of expired.results || []) {
    if (submission.private_r2_object_key) await env.MEDIA.delete(submission.private_r2_object_key);
    const result = await env.DB.prepare(
      "UPDATE qualification_submissions SET status = 'deleted', private_r2_object_key = '', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status IN ('verified', 'rejected')"
    ).bind(submission.id).run();
    purged += Number(result.meta?.changes || 0);
  }
  return purged;
}

function checkoutSiteOrigin(request, env) {
  const configured = String(env.PUBLIC_SITE_ORIGIN || "https://basecraftas.com").replace(/\/$/, "");
  if (!/^https:\/\/[^/]+$/.test(configured)) throw Object.assign(new Error("invalid_public_site_origin"), { status: 503 });
  if (isLocalDevelopmentRequest(request, env)) return new URL(request.url).origin;
  return configured;
}

async function createCustomerCheckout(request, env) {
  if (env.STRIPE_CHECKOUT_ENABLED !== "true") return json({ error: "stripe_checkout_not_enabled" }, { status: 503 });
  const auth = await requireCustomerIdentity(request, env);
  if (auth.error) return auth.error;
  const payload = await readJson(request);
  if (!payload) return json({ error: "invalid_json" }, { status: 400 });
  const planCode = String(payload.plan_code || "");
  if (!["weekly_monthly", "curriculum_monthly", "curriculum_annual"].includes(planCode)) {
    return json({ error: "invalid_plan" }, { status: 400 });
  }
  const audienceType = payload.audience_type === "therapist" ? "therapist" : "general";
  if (audienceType === "therapist" && auth.customer.therapist_status !== "verified") {
    return json({ error: "therapist_verification_required" }, { status: 409 });
  }
  const requestId = String(payload.request_id || "");
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) return json({ error: "invalid_request_id" }, { status: 400 });
  const idempotencyKey = `checkout:${auth.customer.id}:${requestId}`;
  const previous = await env.DB.prepare(
    "SELECT stripe_checkout_session_id, checkout_url, status FROM stripe_checkout_attempts WHERE idempotency_key = ?"
  ).bind(idempotencyKey).first();
  if (previous?.checkout_url && previous.status === "pending") {
    return json({ checkout_url: previous.checkout_url, session_id: previous.stripe_checkout_session_id, reused: true });
  }

  const active = await env.DB.prepare(
    `SELECT id FROM customer_subscriptions
      WHERE customer_id = ? AND product_code = ?
        AND status IN ('incomplete', 'trialing', 'active', 'past_due', 'paused')
      LIMIT 1`
  ).bind(auth.customer.id, planCode === "weekly_monthly" ? "weekly" : "curriculum").first();
  if (active) return json({ error: "subscription_already_exists" }, { status: 409 });
  const history = await env.DB.prepare(
    "SELECT id FROM customer_subscriptions WHERE customer_id = ? AND product_code = 'curriculum' LIMIT 1"
  ).bind(auth.customer.id).first();
  const feeType = planCode === "weekly_monthly" ? "none" : (history ? "rejoin" : "first");
  const campaignCode = feeType === "first" && planCode === "curriculum_monthly" && audienceType === "therapist"
    ? String(env.STRIPE_CAMPAIGN_CODE || "none")
    : "none";
  const quote = resolveBillingQuote({ planCode, audienceType, feeType, campaignCode });
  const attemptId = uid("checkout_attempt");
  await env.DB.prepare(
    `INSERT INTO stripe_checkout_attempts
      (id, customer_id, idempotency_key, plan_code, audience_type, fee_type, campaign_code,
       trial_days, recurring_amount_yen, entry_fee_yen, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'created')`
  ).bind(attemptId, auth.customer.id, idempotencyKey, quote.planCode, quote.audienceType, quote.feeType,
    quote.campaignCode, quote.trialPeriodDays, quote.recurringAmountYen, quote.entryFeeAmountYen).run();

  const origin = checkoutSiteOrigin(request, env);
  const isWeeklyPlan = quote.planCode === "weekly_monthly";
  const params = buildStripeCheckoutParams({
    quote,
    env,
    customer: auth.customer,
    attemptId,
    successUrl: isWeeklyPlan
      ? `${origin}/projects/totonoe/TAYORI/checkout-complete.html?session_id={CHECKOUT_SESSION_ID}`
      : `${origin}/projects/totonoe/IROHA/checkout-complete.html?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: isWeeklyPlan
      ? `${origin}/projects/totonoe/TAYORI/index.html?checkout=cancelled#pricing`
      : `${origin}/projects/totonoe/IROHA/index.html?checkout=cancelled#pricing`,
  });
  try {
    const session = await createStripeCheckoutSession(env, params, idempotencyKey);
    await env.DB.prepare(
      `UPDATE stripe_checkout_attempts
          SET status = 'pending', stripe_checkout_session_id = ?, checkout_url = ?, stripe_customer_id = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`
    ).bind(session.id, session.url, session.customerId, attemptId).run();
    return json({
      checkout_url: session.url,
      session_id: session.id,
      quote: {
        plan_code: quote.planCode,
        first_charge_yen: quote.firstChargeAmountYen,
        recurring_amount_yen: quote.recurringAmountYen,
        trial_days: quote.trialPeriodDays,
        campaign_code: quote.campaignCode,
      },
    }, { status: 201 });
  } catch (error) {
    await env.DB.prepare(
      "UPDATE stripe_checkout_attempts SET status = 'failed', last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(String(error.detail || error.message || "stripe_error").slice(0, 200), attemptId).run();
    throw error;
  }
}

async function createCustomerPortal(request, env) {
  const auth = await requireCustomerIdentity(request, env);
  if (auth.error) return auth.error;
  if (!/^cus_[A-Za-z0-9_]+$/.test(String(auth.customer.stripe_customer_id || ""))) {
    return json({ error: "stripe_customer_missing" }, { status: 409 });
  }
  const subscription = await env.DB.prepare(
    "SELECT id FROM customer_subscriptions WHERE customer_id = ? AND provider = 'stripe' ORDER BY created_at DESC LIMIT 1"
  ).bind(auth.customer.id).first();
  if (!subscription) return json({ error: "subscription_not_found" }, { status: 409 });
  const origin = checkoutSiteOrigin(request, env);
  const session = await createStripePortalSession(env, {
    customerId: auth.customer.stripe_customer_id,
    returnUrl: `${origin}/projects/totonoe/IROHA/mypage.html?billing=returned`,
  });
  return json({ portal_url: session.url }, { status: 201 });
}

function stripeTimestamp(value) {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : null;
}

function stripeSubscriptionStatus(value, deleted = false) {
  if (deleted) return "canceled";
  const status = String(value || "");
  if (["incomplete", "trialing", "active", "past_due", "paused", "canceled", "unpaid"].includes(status)) return status;
  return status === "incomplete_expired" ? "unpaid" : "incomplete";
}

function stripeObjectId(event) {
  return String(event?.data?.object?.id || "").slice(0, 255);
}

function stripeMetadata(object) {
  const source = object?.metadata && typeof object.metadata === "object" ? object.metadata : {};
  return {
    attemptId: String(source.attempt_id || ""),
    customerId: String(source.customer_id || ""),
    planCode: String(source.plan_code || ""),
  };
}

function planDetails(planCode) {
  if (planCode === "weekly_monthly") return { productCode: "weekly", billingInterval: "monthly", entitlements: ["weekly_access"] };
  if (planCode === "curriculum_monthly") return { productCode: "curriculum", billingInterval: "monthly", entitlements: ["curriculum_all_access", "weekly_access"] };
  if (planCode === "curriculum_annual") return { productCode: "curriculum", billingInterval: "annual", entitlements: ["curriculum_all_access", "weekly_access"] };
  return null;
}

async function setSubscriptionEntitlements(env, subscription, status) {
  const details = planDetails(subscription.plan_code);
  if (!details) return;
  const entitlementStatus = ["trialing", "active"].includes(status) ? "active" : "revoked";
  for (const entitlementCode of details.entitlements) {
    await env.DB.prepare(
      `INSERT INTO customer_entitlements
        (id, customer_id, entitlement_code, source_subscription_id, status, starts_at, ends_at)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
       ON CONFLICT(customer_id, entitlement_code, source_subscription_id) DO UPDATE SET
         status = excluded.status,
         ends_at = excluded.ends_at,
         updated_at = CURRENT_TIMESTAMP`
    ).bind(
      `entitlement_${subscription.id}_${entitlementCode}`,
      subscription.customer_id,
      entitlementCode,
      subscription.id,
      entitlementStatus,
      entitlementStatus === "active" ? null : new Date().toISOString()
    ).run();
  }
}

async function findStripeAttempt(env, metadata, subscriptionId = "") {
  if (metadata.attemptId) {
    const attempt = await env.DB.prepare("SELECT * FROM stripe_checkout_attempts WHERE id = ?").bind(metadata.attemptId).first();
    if (attempt) return attempt;
  }
  if (subscriptionId) {
    return env.DB.prepare("SELECT * FROM stripe_checkout_attempts WHERE stripe_subscription_id = ? ORDER BY created_at DESC LIMIT 1").bind(subscriptionId).first();
  }
  return null;
}

async function upsertStripeSubscription(env, attempt, object, forcedStatus = "") {
  const details = planDetails(attempt.plan_code);
  if (!details) throw Object.assign(new Error("invalid_checkout_plan"), { status: 400 });
  const providerSubscriptionId = String(object.subscription || object.id || "");
  if (!/^sub_[A-Za-z0-9_]+$/.test(providerSubscriptionId)) throw Object.assign(new Error("invalid_stripe_subscription"), { status: 400 });
  const existing = await env.DB.prepare("SELECT id FROM customer_subscriptions WHERE provider_subscription_id = ?").bind(providerSubscriptionId).first();
  const subscriptionId = existing?.id || `subscription_${attempt.id}`;
  const status = forcedStatus || stripeSubscriptionStatus(object.status);
  const customerId = typeof object.customer === "string" ? object.customer : String(object.customer?.id || "");
  const priceId = String(object.items?.data?.[0]?.price?.id || "");
  const currentPeriodStart = stripeTimestamp(object.current_period_start);
  const currentPeriodEnd = stripeTimestamp(object.current_period_end);
  const canceledAt = stripeTimestamp(object.canceled_at);
  await env.DB.prepare(
    `INSERT INTO customer_subscriptions
      (id, customer_id, product_code, billing_interval, audience_type, status, provider_subscription_id,
       provider_price_id, recurring_amount_yen, entry_fee_yen, fee_type, current_period_start,
       current_period_end, cancel_at_period_end, canceled_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(provider_subscription_id) DO UPDATE SET
       status = excluded.status,
       provider_price_id = CASE WHEN excluded.provider_price_id = '' THEN customer_subscriptions.provider_price_id ELSE excluded.provider_price_id END,
       current_period_start = COALESCE(excluded.current_period_start, customer_subscriptions.current_period_start),
       current_period_end = COALESCE(excluded.current_period_end, customer_subscriptions.current_period_end),
       cancel_at_period_end = excluded.cancel_at_period_end,
       canceled_at = COALESCE(excluded.canceled_at, customer_subscriptions.canceled_at),
       updated_at = CURRENT_TIMESTAMP`
  ).bind(
    subscriptionId, attempt.customer_id, details.productCode, details.billingInterval, attempt.audience_type,
    status, providerSubscriptionId, priceId, attempt.recurring_amount_yen, attempt.entry_fee_yen,
    attempt.fee_type, currentPeriodStart, currentPeriodEnd, object.cancel_at_period_end ? 1 : 0, canceledAt
  ).run();
  if (/^cus_[A-Za-z0-9_]+$/.test(customerId)) {
    await env.DB.prepare("UPDATE customer_accounts SET stripe_customer_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(customerId, attempt.customer_id).run();
  }
  await setSubscriptionEntitlements(env, { ...attempt, id: subscriptionId }, status);
  return { subscriptionId, status, customerId };
}

async function processStripeEvent(env, event) {
  const object = event.data?.object || {};
  const metadata = stripeMetadata(object);
  if (event.type === "checkout.session.expired") {
    if (metadata.attemptId) {
      await env.DB.prepare("UPDATE stripe_checkout_attempts SET status = 'expired', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(metadata.attemptId).run();
    }
    return "processed";
  }
  if (event.type === "checkout.session.completed") {
    if (!/^cs_test_[A-Za-z0-9_]+$/.test(String(object.id || "")) || object.mode !== "subscription" || object.status !== "complete") {
      throw Object.assign(new Error("invalid_checkout_session"), { status: 400 });
    }
    const attempt = await findStripeAttempt(env, metadata);
    if (!attempt) return "ignored";
    if (metadata.customerId !== attempt.customer_id || metadata.planCode !== attempt.plan_code || Number(attempt.livemode) !== Number(event.livemode)) {
      throw Object.assign(new Error("checkout_metadata_mismatch"), { status: 400 });
    }
    const subscription = await upsertStripeSubscription(env, attempt, object, Number(attempt.trial_days || 0) > 0 ? "trialing" : "active");
    await env.DB.prepare(
      `UPDATE stripe_checkout_attempts SET status = 'completed', stripe_checkout_session_id = ?,
       stripe_customer_id = ?, stripe_subscription_id = ?, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(object.id, subscription.customerId, subscription.subscriptionId ? String(object.subscription || "") : "", attempt.id).run();
    return "processed";
  }
  if (["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"].includes(event.type)) {
    const subscriptionStripeId = String(object.id || "");
    const attempt = await findStripeAttempt(env, metadata, subscriptionStripeId);
    if (!attempt) return "ignored";
    if (metadata.customerId && metadata.customerId !== attempt.customer_id) throw Object.assign(new Error("subscription_metadata_mismatch"), { status: 400 });
    await upsertStripeSubscription(env, attempt, object, stripeSubscriptionStatus(object.status, event.type.endsWith(".deleted")));
    await env.DB.prepare("UPDATE stripe_checkout_attempts SET stripe_subscription_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(subscriptionStripeId, attempt.id).run();
    return "processed";
  }
  if (["invoice.paid", "invoice.payment_failed"].includes(event.type)) {
    const subscriptionStripeId = typeof object.subscription === "string" ? object.subscription : String(object.subscription?.id || "");
    if (!subscriptionStripeId) return "ignored";
    const row = await env.DB.prepare(
      `SELECT cs.id AS local_subscription_id, sca.* FROM customer_subscriptions cs
       JOIN stripe_checkout_attempts sca ON sca.stripe_subscription_id = cs.provider_subscription_id
       WHERE cs.provider_subscription_id = ? LIMIT 1`
    ).bind(subscriptionStripeId).first();
    if (!row) return "ignored";
    const status = event.type === "invoice.paid" ? "active" : "past_due";
    await env.DB.prepare("UPDATE customer_subscriptions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE provider_subscription_id = ?").bind(status, subscriptionStripeId).run();
    await setSubscriptionEntitlements(env, { ...row, id: row.local_subscription_id }, status);
    return "processed";
  }
  return "ignored";
}

async function handleStripeWebhook(request, env) {
  if (request.method !== "POST") return json({ error: "not_found" }, { status: 404 });
  if (!/^application\/json(?:;|$)/i.test(request.headers.get("content-type") || "")) return json({ error: "unsupported_content_type" }, { status: 415 });
  if (env.STRIPE_MODE !== "test") return json({ error: "stripe_test_mode_required" }, { status: 503 });
  const rawBody = new TextDecoder().decode(await readBytes(request, 256 * 1024));
  const { event } = await verifyStripeWebhook(rawBody, request.headers.get("stripe-signature"), env.STRIPE_WEBHOOK_SECRET);
  if (event.livemode) return json({ error: "stripe_livemode_event_rejected" }, { status: 400 });
  const inserted = await env.DB.prepare(
    `INSERT OR IGNORE INTO stripe_webhook_events
      (event_id, event_type, livemode, api_version, object_id, stripe_created_at, status)
     VALUES (?, ?, ?, ?, ?, ?, 'processing')`
  ).bind(event.id, event.type.slice(0, 120), 0, String(event.api_version || "").slice(0, 40), stripeObjectId(event), Number(event.created || 0) || null).run();
  if (!Number(inserted.meta?.changes || 0)) {
    const previous = await env.DB.prepare("SELECT status FROM stripe_webhook_events WHERE event_id = ?").bind(event.id).first();
    if (previous?.status !== "failed") return json({ received: true, duplicate: true });
    await env.DB.prepare(
      "UPDATE stripe_webhook_events SET status = 'processing', attempt_count = attempt_count + 1, last_error = '', updated_at = CURRENT_TIMESTAMP WHERE event_id = ? AND status = 'failed'"
    ).bind(event.id).run();
  }
  try {
    const status = await processStripeEvent(env, event);
    await env.DB.prepare(
      "UPDATE stripe_webhook_events SET status = ?, processed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE event_id = ?"
    ).bind(status, event.id).run();
    console.log(JSON.stringify({ event: "stripe.webhook", stripe_event_id: event.id, stripe_event_type: event.type, status }));
    return json({ received: true, status });
  } catch (error) {
    await env.DB.prepare(
      "UPDATE stripe_webhook_events SET status = 'failed', last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE event_id = ?"
    ).bind(String(error.message || "webhook_processing_failed").slice(0, 200), event.id).run();
    throw error;
  }
}

async function requireWeeklyAccess(request, env) {
  const auth = await getCustomerAccess(request, env);
  if (auth.error) return auth;
  if (!auth.access.has_weekly_access) return { error: json({ error: "weekly_access_inactive" }, { status: 403 }) };
  return auth;
}

async function requireCustomerMember(request, env) {
  const auth = await getCustomerAccess(request, env);
  if (auth.error) return auth;
  if (!auth.access.has_weekly_access && !auth.access.has_curriculum_access) {
    return { error: json({ error: "membership_inactive" }, { status: 403 }) };
  }
  return auth;
}

function serializeWeeklyMaterial(row) {
  return {
    id: row.id,
    title: row.title,
    file_name: row.file_name,
    description: row.description,
    mime_type: row.mime_type,
    size_bytes: Number(row.size_bytes || 0),
    published_at: row.published_at,
  };
}

async function weeklyMemberStatus(request, env) {
  const auth = await requireWeeklyAccess(request, env);
  if (auth.error) return auth.error;
  return json({ membership: auth.access });
}

async function listWeeklyMaterials(request, env) {
  const auth = await requireWeeklyAccess(request, env);
  if (auth.error) return auth.error;
  const [materials, sync] = await Promise.all([
    env.DB.prepare(
      "SELECT id, title, file_name, description, mime_type, size_bytes, published_at FROM weekly_materials WHERE status = 'published' ORDER BY datetime(published_at) DESC, created_at DESC"
    ).all(),
    env.DB.prepare("SELECT last_success_at, last_error, file_count FROM weekly_material_sync_state WHERE id = 'drive'").first(),
  ]);
  return json({
    membership: auth.access,
    materials: (materials.results || []).map(serializeWeeklyMaterial),
    sync: sync || null,
  });
}

async function openWeeklyMaterial(request, env, id) {
  const auth = await requireWeeklyAccess(request, env);
  if (auth.error) return auth.error;
  const material = await env.DB.prepare(
    "SELECT id, web_view_link, web_content_link FROM weekly_materials WHERE id = ? AND status = 'published'"
  ).bind(id).first();
  if (!material) return json({ error: "weekly_material_not_found" }, { status: 404 });
  const mode = new URL(request.url).searchParams.get("mode") === "download" ? "download" : "view";
  const target = mode === "download" ? (material.web_content_link || material.web_view_link) : material.web_view_link;
  await env.DB.prepare(
    "INSERT INTO weekly_material_events (id, customer_id, material_id, event_type) VALUES (?, ?, ?, ?)"
  ).bind(uid("weekly_event"), auth.access.customer_id, material.id, mode).run();
  return new Response(null, {
    status: 302,
    headers: { location: target, "cache-control": "private, no-store", "referrer-policy": "no-referrer" },
  });
}

async function syncWeeklyMaterialsRequest(request, env) {
  const auth = await requireRole(request, env, ["admin", "editor"]);
  if (auth.error) return auth.error;
  try {
    const [materials, answerVideos] = await Promise.all([
      syncWeeklyMaterials(env, auth.email),
      syncWeeklyAnswerVideos(env, auth.email),
    ]);
    const questionSheet = await syncPendingWeeklyQuestionsToSheet(env);
    const questionOperations = await syncWeeklyQuestionOperationsFromSheet(env);
    return json({ materials, answer_videos: answerVideos, question_sheet: questionSheet, question_operations: questionOperations });
  } catch (error) {
    return json({ error: "weekly_scan_failed", message: String(error.message || error) }, { status: 502 });
  }
}

function serializeCustomerProfile(row, auth) {
  return {
    email: auth.access.email,
    display_name: auth.access.display_name || "",
    profession: row?.profession || "",
    workplace_type: row?.workplace_type || "",
    role_title: row?.role_title || "",
    organization_size: row?.organization_size || "",
    ai_usage_level: row?.ai_usage_level || "",
    interest_topics: parseJsonArray(row?.interest_topics),
    current_challenges: row?.current_challenges || "",
    updated_at: row?.updated_at || null,
    has_weekly_access: auth.access.has_weekly_access,
    has_curriculum_access: auth.access.has_curriculum_access,
  };
}

async function getCustomerProfile(request, env) {
  const auth = await requireCustomerMember(request, env);
  if (auth.error) return auth.error;
  const profile = await env.DB.prepare("SELECT * FROM customer_profiles WHERE customer_id = ?").bind(auth.access.customer_id).first();
  return json({ profile: serializeCustomerProfile(profile, auth) });
}

function profileText(value, maxLength) {
  return String(value || "").normalize("NFKC").trim().slice(0, maxLength);
}

async function updateCustomerProfile(request, env) {
  const auth = await requireCustomerMember(request, env);
  if (auth.error) return auth.error;
  const payload = await readJson(request);
  if (!payload) return json({ error: "invalid_json" }, { status: 400 });
  const interests = parseJsonArray(payload.interest_topics).map((item) => profileText(item, 40)).filter(Boolean).slice(0, 8);
  const values = {
    profession: profileText(payload.profession, 80),
    workplace_type: profileText(payload.workplace_type, 80),
    role_title: profileText(payload.role_title, 80),
    organization_size: profileText(payload.organization_size, 40),
    ai_usage_level: profileText(payload.ai_usage_level, 40),
    interest_topics: JSON.stringify(interests),
    current_challenges: profileText(payload.current_challenges, 1000),
  };
  await env.DB.prepare(
    `INSERT INTO customer_profiles
      (customer_id, profession, workplace_type, role_title, organization_size, ai_usage_level, interest_topics, current_challenges)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(customer_id) DO UPDATE SET
       profession = excluded.profession,
       workplace_type = excluded.workplace_type,
       role_title = excluded.role_title,
       organization_size = excluded.organization_size,
       ai_usage_level = excluded.ai_usage_level,
       interest_topics = excluded.interest_topics,
       current_challenges = excluded.current_challenges,
       updated_at = CURRENT_TIMESTAMP`
  ).bind(auth.access.customer_id, values.profession, values.workplace_type, values.role_title, values.organization_size, values.ai_usage_level, values.interest_topics, values.current_challenges).run();
  const profile = await env.DB.prepare("SELECT * FROM customer_profiles WHERE customer_id = ?").bind(auth.access.customer_id).first();
  return json({ profile: serializeCustomerProfile(profile, auth) });
}

function japanWeekStart(now = new Date()) {
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  jst.setUTCDate(jst.getUTCDate() - jst.getUTCDay());
  return jst.toISOString().slice(0, 10);
}

function serializePriorityQuestion(row) {
  if (!row) return null;
  return {
    id: row.id,
    week_start: row.week_start,
    situation: row.situation,
    goal: row.goal,
    attempts: row.attempts,
    blocker: row.blocker,
    question: row.question,
    use_by: row.use_by,
    answer_format: row.answer_format,
    status: row.status,
    question_group: row.question_group || "",
    answer_video_title: row.answer_video_title || "",
    created_at: row.created_at,
    updated_at: row.updated_at,
    answered_at: row.answered_at,
  };
}

async function limitCustomerWrite(env, email) {
  const bucket = Math.floor(Date.now() / 60000);
  const result = await env.DB.prepare(
    "INSERT INTO api_write_limits(actor_email, bucket, count) VALUES (?, ?, 1) ON CONFLICT(actor_email, bucket) DO UPDATE SET count = count + 1 WHERE count < 10"
  ).bind(email, bucket).run();
  return Boolean(result.meta.changes);
}

async function getWeeklyPriorityQuestion(request, env) {
  const auth = await requireWeeklyAccess(request, env);
  if (auth.error) return auth.error;
  const weekStart = japanWeekStart();
  const question = await env.DB.prepare(
    "SELECT * FROM weekly_priority_questions WHERE customer_id = ? AND week_start = ?"
  ).bind(auth.access.customer_id, weekStart).first();
  return json({ week_start: weekStart, available: !question, question: serializePriorityQuestion(question) });
}

async function saveWeeklyPriorityQuestion(request, env) {
  const auth = await requireWeeklyAccess(request, env);
  if (auth.error) return auth.error;
  if (!(await limitCustomerWrite(env, auth.email))) return json({ error: "rate_limited", message: "送信が続いています。1分ほど待ってください。" }, { status: 429, headers: { "retry-after": "60" } });
  const payload = await readJson(request);
  if (!payload) return json({ error: "invalid_json" }, { status: 400 });
  const values = {
    situation: profileText(payload.situation, 1200),
    goal: profileText(payload.goal, 800),
    attempts: profileText(payload.attempts, 1200),
    blocker: profileText(payload.blocker, 800),
    question: profileText(payload.question, 800),
    use_by: /^\d{4}-\d{2}-\d{2}$/.test(String(payload.use_by || "")) ? String(payload.use_by) : "",
    answer_format: ["demonstration", "steps", "criteria"].includes(payload.answer_format) ? payload.answer_format : "demonstration",
  };
  const tooShort = values.situation.length < 20 || values.goal.length < 15 || values.attempts.length < 10 || values.blocker.length < 10 || values.question.length < 20;
  if (tooShort || payload.privacy_confirmed !== true || payload.video_consent !== true) {
    return json({ error: "question_incomplete", message: "状況・目的・試したこと・つまずき・質問を具体的に入力し、確認項目に同意してください。" }, { status: 400 });
  }
  const weekStart = japanWeekStart();
  const current = await env.DB.prepare(
    "SELECT id, status FROM weekly_priority_questions WHERE customer_id = ? AND week_start = ?"
  ).bind(auth.access.customer_id, weekStart).first();
  if (current && current.status !== "submitted") {
    return json({ error: "question_locked", message: "今週の質問は回答準備に入っているため変更できません。" }, { status: 409 });
  }
  const profile = await env.DB.prepare("SELECT profession, workplace_type, role_title, organization_size, ai_usage_level, interest_topics, current_challenges FROM customer_profiles WHERE customer_id = ?").bind(auth.access.customer_id).first();
  const profileSnapshot = JSON.stringify(profile || {});
  const id = current?.id || uid("weekly_question");
  await env.DB.prepare(
    `INSERT INTO weekly_priority_questions
      (id, customer_id, week_start, situation, goal, attempts, blocker, question, use_by, answer_format, profile_snapshot, privacy_confirmed, video_consent, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 'submitted')
     ON CONFLICT(customer_id, week_start) DO UPDATE SET
       situation = excluded.situation,
       goal = excluded.goal,
       attempts = excluded.attempts,
       blocker = excluded.blocker,
       question = excluded.question,
       use_by = excluded.use_by,
       answer_format = excluded.answer_format,
       profile_snapshot = excluded.profile_snapshot,
       privacy_confirmed = 1,
       video_consent = 1,
       sheet_synced_at = NULL,
       updated_at = CURRENT_TIMESTAMP
     WHERE weekly_priority_questions.status = 'submitted'`
  ).bind(id, auth.access.customer_id, weekStart, values.situation, values.goal, values.attempts, values.blocker, values.question, values.use_by, values.answer_format, profileSnapshot).run();
  const sheetSync = await syncWeeklyQuestionToSheet(env, id);
  const saved = await env.DB.prepare("SELECT * FROM weekly_priority_questions WHERE id = ?").bind(id).first();
  return json({ week_start: weekStart, available: false, question: serializePriorityQuestion(saved), sheet_sync: sheetSync.status }, { status: current ? 200 : 201 });
}

async function listWeeklyAnswerVideos(request, env) {
  const auth = await requireWeeklyAccess(request, env);
  if (auth.error) return auth.error;
  const [videos, sync] = await Promise.all([
    env.DB.prepare("SELECT id, title, description, file_name, mime_type, size_bytes, published_at FROM weekly_answer_videos WHERE status = 'published' ORDER BY datetime(published_at) DESC, created_at DESC").all(),
    env.DB.prepare("SELECT last_success_at, last_error, file_count FROM weekly_answer_video_sync_state WHERE id = 'drive'").first(),
  ]);
  return json({
    videos: (videos.results || []).map((video) => ({
      ...video,
      playback_url: "/api/tsuzuri-studio/api/weekly/answer-videos/" + encodeURIComponent(video.id) + "/stream",
    })),
    sync: sync || null,
    playback: "secure_proxy",
  });
}

async function streamWeeklyAnswerVideo(request, env, id) {
  const auth = await requireWeeklyAccess(request, env);
  if (auth.error) return auth.error;
  const video = await env.DB.prepare(
    "SELECT id, drive_file_id, file_name, mime_type FROM weekly_answer_videos WHERE id = ? AND status = 'published'"
  ).bind(id).first();
  if (!video) return json({ error: "weekly_answer_video_not_found" }, { status: 404 });

  const token = await driveAccessToken(env);
  const headers = new Headers({ authorization: "Bearer " + token, accept: video.mime_type || "video/*" });
  const requestedRange = String(request.headers.get("range") || "");
  if (/^bytes=\d*-\d*$/.test(requestedRange)) headers.set("range", requestedRange);
  const upstream = await fetch(
    "https://www.googleapis.com/drive/v3/files/" + encodeURIComponent(video.drive_file_id) + "?alt=media",
    { headers }
  );
  if (![200, 206].includes(upstream.status) || !upstream.body) {
    upstream.body?.cancel();
    return json({ error: "weekly_answer_video_unavailable" }, { status: upstream.status === 404 ? 404 : 502 });
  }

  const responseHeaders = new Headers({
    "content-type": upstream.headers.get("content-type") || video.mime_type || "video/mp4",
    "content-disposition": "inline",
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff",
    "accept-ranges": upstream.headers.get("accept-ranges") || "bytes",
  });
  for (const name of ["content-length", "content-range", "etag", "last-modified"]) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  await env.DB.prepare(
    "INSERT INTO weekly_answer_video_events (id, customer_id, video_id, event_type) VALUES (?, ?, ?, 'play')"
  ).bind(uid("weekly_video_event"), auth.access.customer_id, video.id).run();
  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
}

async function listWeeklyPriorityQuestionsAdmin(request, env) {
  const auth = await requireRole(request, env, ["admin", "editor"]);
  if (auth.error) return auth.error;
  const result = await env.DB.prepare(
    `SELECT q.*, a.email, a.display_name
       FROM weekly_priority_questions q
       JOIN customer_accounts a ON a.id = q.customer_id
      ORDER BY q.week_start DESC, q.created_at ASC`
  ).all();
  return json({ questions: (result.results || []).map((row) => ({
    ...serializePriorityQuestion(row),
    email: row.email,
    display_name: row.display_name,
    profile_snapshot: parseJsonObject(row.profile_snapshot),
    operations_status: row.operations_status || "",
    answer_video_url: row.answer_video_url || "",
    operations_notes: row.operations_notes || "",
    sheet_row: row.sheet_row || null,
    sheet_synced_at: row.sheet_synced_at || null,
    sheet_operations_synced_at: row.sheet_operations_synced_at || null,
    sheet_last_error: row.sheet_last_error || "",
  })) });
}

async function purgeExpiredTrash(env) {
  const expired = await env.DB.prepare(
    `SELECT id FROM articles
      WHERE deleted_at IS NOT NULL
        AND deleted_at <= datetime('now', '-${TRASH_RETENTION_DAYS} days')
      ORDER BY deleted_at
      LIMIT ?`
  ).bind(TRASH_PURGE_BATCH_SIZE).all();
  let purged = 0;
  for (const article of expired.results || []) {
    const lease = Date.now() + 300000;
    const lock = await env.DB.prepare(
      `INSERT INTO article_publish_locks (article_id, expires_at)
       SELECT id, ? FROM articles
        WHERE id = ? AND deleted_at IS NOT NULL
          AND deleted_at <= datetime('now', '-${TRASH_RETENTION_DAYS} days')
       ON CONFLICT(article_id) DO UPDATE SET expires_at = excluded.expires_at
        WHERE article_publish_locks.expires_at < ?`
    ).bind(lease, article.id, Date.now()).run();
    if (!lock.meta.changes) continue;
    try {
      const assets = await env.DB.prepare("SELECT r2_key FROM article_assets WHERE article_id = ?").bind(article.id).all();
      const keys = (assets.results || []).map((asset) => asset.r2_key).filter(Boolean);
      if (keys.length && env.MEDIA) {
        for (let offset = 0; offset < keys.length; offset += 1000) {
          await env.MEDIA.delete(keys.slice(offset, offset + 1000));
        }
      }
      const auditId = uid("audit");
      const results = await env.DB.batch([
        env.DB.prepare("DELETE FROM article_public_assets WHERE article_id = ?").bind(article.id),
        env.DB.prepare("DELETE FROM article_assets WHERE article_id = ?").bind(article.id),
        env.DB.prepare("DELETE FROM article_versions WHERE article_id = ?").bind(article.id),
        env.DB.prepare("DELETE FROM publish_jobs WHERE article_id = ?").bind(article.id),
        env.DB.prepare("DELETE FROM article_publish_locks WHERE article_id = ? AND expires_at = ?").bind(article.id, lease),
        env.DB.prepare("DELETE FROM articles WHERE id = ? AND deleted_at IS NOT NULL AND deleted_at <= datetime('now', '-30 days')").bind(article.id),
        env.DB.prepare("INSERT INTO audit_events (id, actor_email, action, entity_type, entity_id, metadata) SELECT ?, ?, ?, ?, ?, ? WHERE changes() = 1")
          .bind(auditId, "system@column-studio", "article.purge", "article", article.id, JSON.stringify({ retention_days: TRASH_RETENTION_DAYS, asset_count: keys.length })),
      ]);
      if (results[5].meta.changes) purged += 1;
    } finally {
      await env.DB.prepare("DELETE FROM article_publish_locks WHERE article_id = ? AND expires_at = ?").bind(article.id, lease).run();
    }
  }
  return { purged, retention_days: TRASH_RETENTION_DAYS };
}

async function uploadAsset(request, env) {
  const auth = await requireRole(request, env, ["admin", "editor"]);
  if (auth.error) return auth.error;
  if (!env.MEDIA) return json({ error: "media_bucket_not_configured" }, { status: 500 });

  const bytes = await readBytes(request, MAX_IMAGE_BYTES + 64 * 1024);
  const form = await new Response(bytes, {headers: {"content-type": request.headers.get("content-type")}}).formData();
  const file = form.get("file");
  const articleId = String(form.get("article_id") || form.get("articleId") || "").trim();

  if (!(file instanceof File)) return json({ error: "file_required" }, { status: 400 });
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return json({ error: "unsupported_image_type", allowed: Array.from(ALLOWED_IMAGE_TYPES) }, { status: 415 });
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return json({ error: "image_too_large", max_bytes: MAX_IMAGE_BYTES }, { status: 413 });
  }

  if (!articleId) return json({error: "article_required", message: "先に下書きを保存してください。"}, {status: 400});
  const article = await env.DB.prepare("SELECT id FROM articles WHERE id = ? AND deleted_at IS NULL").bind(articleId).first();
  if (!article) return json({error: "article_not_found"}, {status: 404});
  const content = new Uint8Array(await file.arrayBuffer());
  if (imageType(content) !== file.type) return json({error: "invalid_image_content"}, {status: 415});

  const now = new Date();
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const key = `contents/${yyyy}/${mm}/${crypto.randomUUID()}-${safeFilename(file.name)}`;
  await env.MEDIA.put(key, content, {
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

// Publication snapshots prevent edits/new uploads on an already-published article
// from making draft media public before the next successful publication.
async function publicationAssets(env, article) {
  const body = sanitizeBody(article.body_html);
  const urls = [safeUrl(article.hero_url, true), ...Array.from(body.matchAll(/<img\b[^>]*\bsrc="([^"]*)"/g), match => match[1].replace(/&amp;/g, '&'))];
  const keys = new Set();
  for (const value of urls.filter(Boolean)) {
    const url = new URL(value, 'https://basecraftas.com');
    if (url.hostname !== 'basecraftas.com' || !url.pathname.startsWith('/column-media/')) continue;
    const key = decodeURIComponent(url.pathname.slice('/column-media/'.length));
    const asset = await env.DB.prepare("SELECT * FROM article_assets WHERE r2_key = ? AND article_id = ?").bind(key, article.id).first();
    if (!asset || !ALLOWED_IMAGE_TYPES.has(asset.content_type)) throw Object.assign(new Error('invalid_article_asset'), {status: 400});
    keys.add(key);
  }
  return [...keys];
}

async function serveMedia(request, env, key) {
  if (!env.MEDIA) return new Response('Not found', {status: 404});
  const requestPath = new URL(request.url).pathname;
  const isPrivate = requestPath.startsWith('/api/tsuzuri-studio/media/') || requestPath.startsWith('/api/column-studio/media/');
  if (isPrivate) {
    const auth = await requireRole(request, env, ['admin','editor','viewer']);
    if (auth.error) return auth.error;
  } else {
    const published = await env.DB.prepare("SELECT p.r2_key FROM article_public_assets p JOIN articles a ON a.id = p.article_id WHERE p.r2_key = ? AND a.status = 'published' AND a.deleted_at IS NULL LIMIT 1").bind(key).first();
    if (!published) return new Response('Not found', {status: 404});
  }
  const asset = await env.DB.prepare('SELECT content_type FROM article_assets WHERE r2_key = ?').bind(key).first();
  if (!asset || !ALLOWED_IMAGE_TYPES.has(asset.content_type)) return new Response('Not found', {status: 404});
  const object = await env.MEDIA.get(key);
  if (!object) return new Response('Not found', {status: 404});
  return new Response(object.body, {headers: {
    'content-type': asset.content_type,
    'cache-control': 'private, no-store',
    'content-disposition': 'inline',
  }});
}

const worker = {
  async scheduled(controller, env) {
    await env.DB.prepare("DELETE FROM api_write_limits WHERE bucket < ?").bind(Math.floor(Date.now() / 60000) - 60).run();
    try {
      await env.DB.prepare("DELETE FROM customer_auth_rate_limits WHERE bucket < ?").bind(Math.floor(Date.now() / (AUTH_RATE_BUCKET_MINUTES * 60 * 1000)) - 6).run();
      await env.DB.prepare("DELETE FROM customer_auth_challenges WHERE datetime(created_at) <= datetime('now', '-1 day')").run();
      await env.DB.prepare("DELETE FROM customer_sessions WHERE datetime(expires_at) <= datetime('now') OR datetime(COALESCE(revoked_at, '9999-12-31')) <= datetime('now', '-7 days')").run();
      await purgeExpiredQualificationImages(env);
    } catch (error) {
      // During a staged release, existing scheduled jobs may run before the new migration is applied.
      if (!String(error.message || error).includes("no such table")) throw error;
      console.log(JSON.stringify({ event: "customer_auth.cleanup.skipped", reason: "migration_pending" }));
    }
    try {
      if (controller.cron === "0 * * * *") {
        const materials = await syncWeeklyMaterials(env);
        const answerVideos = await syncWeeklyAnswerVideos(env);
        const questionSheet = await syncPendingWeeklyQuestionsToSheet(env);
        const questionOperations = await syncWeeklyQuestionOperationsFromSheet(env);
        console.log(JSON.stringify({ event: "weekly.scan", cron: controller.cron, scheduled_time: controller.scheduledTime, materials, answer_videos: answerVideos, question_sheet: questionSheet, question_operations: questionOperations }));
        return;
      }
      if (controller.cron === "0 0 * * 6") {
        const result = await scanDriveArchives(env);
        console.log(JSON.stringify({ event: "archive.scan", cron: controller.cron, scheduled_time: controller.scheduledTime, ...result }));
        return;
      }
      const result = await purgeExpiredTrash(env);
      console.log(JSON.stringify({ event: "trash.purge", cron: controller.cron, scheduled_time: controller.scheduledTime, ...result }));
    } catch (error) {
      console.error(JSON.stringify({ event: "scheduled.error", cron: controller.cron, scheduled_time: controller.scheduledTime, error: String(error.message || error) }));
      throw error;
    }
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    const path = normalizePath(url.pathname);

    if (request.method === "OPTIONS") return new Response(null, { status: 204 });
    if (path === "/api/health") return json({ ok: true, service: "tsuzuri-studio-api" });
    if (path === "/api/public/weekend-event" && request.method === "GET") return publicWeekendEvent(env);

    if (path === "/api/me") {
      const email = await getActorEmail(request, env);
      const member = await getMember(env, email);
      return json({ email, member });
    }

    if (path === "/api/customer/auth/request-code" && request.method === "POST") {
      return requestCustomerAuthCode(request, env);
    }
    if (path === "/api/customer/auth/verify-code" && request.method === "POST") {
      return verifyCustomerAuthCode(request, env);
    }
    if (path === "/api/customer/auth/status" && request.method === "GET") {
      return customerAuthStatus(request, env);
    }
    if (path === "/api/customer/auth/logout" && request.method === "POST") {
      return logoutCustomer(request, env);
    }
    if (path === "/api/customer/billing/checkout" && request.method === "POST") {
      return createCustomerCheckout(request, env);
    }
    if (path === "/api/customer/billing/portal" && request.method === "POST") {
      return createCustomerPortal(request, env);
    }
    if (path === "/api/customer/qualification" && request.method === "GET") {
      return getCustomerQualification(request, env);
    }
    if (path === "/api/customer/qualification" && request.method === "POST") {
      return submitCustomerQualification(request, env);
    }
    if (path === "/api/stripe/webhook" && request.method === "POST") {
      return handleStripeWebhook(request, env);
    }

    if (path === "/api/weekly/me" && request.method === "GET") {
      return weeklyMemberStatus(request, env);
    }
    if (path === "/api/weekly/materials" && request.method === "GET") {
      return listWeeklyMaterials(request, env);
    }
    if (path === "/api/weekly/priority-question" && request.method === "GET") {
      return getWeeklyPriorityQuestion(request, env);
    }
    if (path === "/api/weekly/priority-question" && request.method === "POST") {
      return saveWeeklyPriorityQuestion(request, env);
    }
    if (path === "/api/weekly/answer-videos" && request.method === "GET") {
      return listWeeklyAnswerVideos(request, env);
    }
    const weeklyAnswerVideoMatch = path.match(/^\/api\/weekly\/answer-videos\/([^/]+)\/stream$/);
    if (weeklyAnswerVideoMatch && request.method === "GET") {
      return streamWeeklyAnswerVideo(request, env, weeklyAnswerVideoMatch[1]);
    }
    if (path === "/api/weekly/admin/questions" && request.method === "GET") {
      return listWeeklyPriorityQuestionsAdmin(request, env);
    }
    if (path === "/api/weekly/admin/sync" && request.method === "POST") {
      return syncWeeklyMaterialsRequest(request, env);
    }
    const weeklyMaterialMatch = path.match(/^\/api\/weekly\/materials\/([^/]+)\/open$/);
    if (weeklyMaterialMatch && request.method === "GET") {
      return openWeeklyMaterial(request, env, weeklyMaterialMatch[1]);
    }
    if (path === "/api/customer/profile" && request.method === "GET") {
      return getCustomerProfile(request, env);
    }
    if (path === "/api/customer/profile" && request.method === "PATCH") {
      return updateCustomerProfile(request, env);
    }

    if (path === "/api/members" && request.method === "GET") return listMembers(request, env);
    if (path === "/api/members" && request.method === "POST") return createMember(request, env);
    const memberMatch = path.match(/^\/api\/members\/([^/]+)$/);
    if (memberMatch && request.method === "PATCH") return updateMember(request, env, memberMatch[1]);

    if (path === "/api/admin/qualifications" && request.method === "GET") return listQualificationsAdmin(request, env);
    const qualificationImageMatch = path.match(/^\/api\/admin\/qualifications\/([^/]+)\/image$/);
    if (qualificationImageMatch && request.method === "GET") return openQualificationImageAdmin(request, env, qualificationImageMatch[1]);
    const qualificationReviewMatch = path.match(/^\/api\/admin\/qualifications\/([^/]+)$/);
    if (qualificationReviewMatch && request.method === "PATCH") return reviewQualificationAdmin(request, env, qualificationReviewMatch[1]);

    if (path === "/api/articles" && request.method === "GET") {
      const auth = await requireRole(request, env, ["admin", "editor", "viewer"]);
      if (auth.error) return auth.error;
      return json({ articles: await listArticles(env) });
    }

    if (path === "/api/articles" && request.method === "POST") {
      return createArticle(request, env);
    }

    if (path === "/api/archive-candidates" && request.method === "GET") {
      return listArchiveCandidates(request, env);
    }
    if (path === "/api/archive-candidates/scan" && request.method === "POST") {
      return scanArchiveCandidates(request, env);
    }
    const archiveImportMatch = path.match(/^\/api\/archive-candidates\/([^/]+)\/import$/);
    if (archiveImportMatch && request.method === "POST") {
      return importArchiveCandidate(request, env, archiveImportMatch[1]);
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

    const lifecycleMatch = path.match(/^\/api\/articles\/([^/]+)\/lifecycle$/);
    if (lifecycleMatch && request.method === "POST") {
      return changeArticleLifecycle(request, env, lifecycleMatch[1]);
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

export default {
  scheduled: worker.scheduled,
  async fetch(request, env) {
    try {
      const rawPath = new URL(request.url).pathname.replace(/\/+$/, "") || "/";
      const path = normalizePath(rawPath);
      if (!isPublicMemberRequest(rawPath, path, request.method)) {
        return secureResponse(json({ error: "not_found" }, { status: 404 }));
      }
      if (path !== "/api/stripe/webhook") requestGuard(request, env, path);
      return secureResponse(await worker.fetch(request, env), path.startsWith('/media/'));
    } catch (error) {
      console.error(JSON.stringify({
        event: "request.error",
        method: request.method,
        path: new URL(request.url).pathname,
        error: String(error?.message || error || "internal_error").slice(0, 300),
      }));
      return secureResponse(json({error: error.status ? error.message : 'internal_error'}, {status: error.status || 500}));
    }
  }
};
