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
  if (rawPath === basePath) return "/";
  if (rawPath.startsWith(`${basePath}/`)) {
    return rawPath.slice(basePath.length).replace(/\/+$/, "") || "/";
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

function publicAssetUrl(request, key) {
  const url = new URL(request.url);
  if (url.pathname === "/api/column-studio" || url.pathname.startsWith("/api/column-studio/")) {
    return `${url.origin}/api/column-studio/media/${key}`;
  }
  return `${url.origin}/media/${key}`;
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
    destination: String(input.destination || fallback.destination || "basecraftas").trim(),
    tags: JSON.stringify(tags),
    hero_url: String(input.hero_url || input.heroUrl || fallback.hero_url || "").trim(),
    body_html: String(input.body_html || input.bodyHtml || fallback.body_html || ""),
    status: String(input.status || fallback.status || "draft"),
  };
}

async function recordVersion(env, article, actorEmail) {
  await env.DB.prepare(
    `INSERT INTO article_versions
      (id, article_id, title, excerpt, category, destination, tags, hero_url, body_html, status, actor_email)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      uid("ver"),
      article.id,
      article.title,
      article.excerpt,
      article.category,
      article.destination,
      article.tags,
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
    `SELECT id, slug, title, excerpt, category, destination, tags, hero_url, body_html, status,
            author_email, editor_email, published_at, created_at, updated_at
       FROM articles
      ORDER BY updated_at DESC`
  ).all();
  return (result.results || []).map((article) => ({
    ...article,
    tags: JSON.parse(article.tags || "[]"),
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
      (id, slug, title, excerpt, category, destination, tags, hero_url, body_html, status, author_email, editor_email)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      article.slug,
      article.title,
      article.excerpt,
      article.category,
      article.destination,
      article.tags,
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
  return json({ article: { ...created, tags: JSON.parse(created.tags || "[]") } }, { status: 201 });
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
        SET slug = ?, title = ?, excerpt = ?, category = ?, destination = ?, tags = ?,
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
  return json({ article: { ...updated, tags: JSON.parse(updated.tags || "[]") } });
}

async function enqueuePublish(request, env, id) {
  const auth = await requireRole(request, env, ["admin"]);
  if (auth.error) return auth.error;

  const article = await env.DB.prepare("SELECT * FROM articles WHERE id = ?").bind(id).first();
  if (!article) return json({ error: "not_found" }, { status: 404 });

  const jobId = uid("publish");
  await env.DB.prepare(
    "INSERT INTO publish_jobs (id, article_id, status, actor_email) VALUES (?, ?, 'queued', ?)"
  )
    .bind(jobId, id, auth.email)
    .run();
  await audit(env, auth.email, "publish.queue", "article", id, { jobId });

  return json({
    job: { id: jobId, article_id: id, status: "queued" },
    next: "GitHub App commit worker is not wired yet.",
  });
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
