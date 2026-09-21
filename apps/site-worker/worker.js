const PROFILE_PATH = "/api/totonoe-member/api/customer/profile";

function normalizedPath(pathname) {
  try {
    const decoded = decodeURIComponent(pathname);
    if (/[\\\u0000-\u001f\u007f%]/.test(decoded)) return null;
    return new URL(decoded.replace(/\/{2,}/g, "/"), "https://basecraftas.com").pathname;
  } catch { return null; }
}

function protectedResponse(response, privatePage = false) {
  const headers = new Headers(response.headers);
  headers.set("x-content-type-options", "nosniff");
  headers.set("x-frame-options", "DENY");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  headers.set("permissions-policy", "camera=(), microphone=(), geolocation=()");
  headers.set("strict-transport-security", "max-age=31536000");
  if (!headers.has("content-security-policy")) headers.set("content-security-policy", "object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
  headers.set("x-basecraftas-release", "20260922-security");
  if (privatePage) {
    headers.set("cache-control", "private, no-store");
    headers.set("x-robots-tag", "noindex, nofollow");
    headers.set("referrer-policy", "no-referrer");
  }
  return new Response(response.body, {status: response.status, statusText: response.statusText, headers});
}

function isPrivateSource(pathname) {
  return /^\/(?:scripts|tests?)(?:\/|$)/.test(pathname)
    || /^\/apps\/(?:site-worker|tsuzuri-studio-api)(?:\/|$)/.test(pathname)
    || /(?:^|\/)\.(?:git|wrangler)(?:\/|$)/.test(pathname);
}

function requiredEntitlement(pathname) {
  if (/^\/projects\/totonoe\/TAYORI(?:\/(?:index(?:\.html)?)?)?\/?$/.test(pathname)) return "weekly";
  if (/^\/projects\/totonoe\/IROHA\/(?:dashboard|lesson)(?:\.html)?\/?$/.test(pathname)) return "curriculum";
  if (/^\/projects\/totonoe\/IROHA\/mypage(?:\.html)?\/?$/.test(pathname)) return "member";
  return "";
}

function loginResponse(url) {
  const returnPath = url.pathname + url.search;
  const location = "/projects/totonoe/TAYORI/login.html?return=" + encodeURIComponent(returnPath);
  return new Response(null, { status: 302, headers: { location: new URL(location, url.origin).href, "cache-control": "no-store" } });
}

function salesResponse(url, required) {
  const pathname = required === "curriculum"
    ? "/projects/totonoe/IROHA/"
    : "/projects/totonoe/tayori.html";
  return new Response(null, { status: 302, headers: { location: new URL(pathname, url.origin).href, "cache-control": "no-store" } });
}

async function loadProfile(request) {
  const url = new URL(request.url);
  const headers = new Headers({ accept: "application/json" });
  const cookie = request.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);
  const response = await fetch(new URL(PROFILE_PATH, url.origin), { headers, redirect: "manual", signal: AbortSignal.timeout(5000) });
  if (response.status === 401) return { authenticated: false };
  if (!response.ok) return { authenticated: false };
  const payload = await response.json();
  return { authenticated: true, ...(payload.profile || {}) };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = normalizedPath(url.pathname);
    if (!pathname || isPrivateSource(pathname)) return protectedResponse(new Response("Not Found", { status: 404 }), true);
    const required = requiredEntitlement(pathname);
    if (!required) return protectedResponse(await env.ASSETS.fetch(request));

    let profile;
    try { profile = await loadProfile(request); }
    catch { return protectedResponse(new Response("認証を確認できません。時間をおいて再度お試しください。", {status:503, headers:{"retry-after":"30"}}), true); }
    if (!profile.authenticated) return protectedResponse(loginResponse(url), true);

    const hasWeekly = Boolean(profile.has_weekly_access || profile.has_curriculum_access);
    const allowed = required === "curriculum"
      ? Boolean(profile.has_curriculum_access)
      : hasWeekly;
    if (!allowed) return protectedResponse(salesResponse(url, required), true);
    return protectedResponse(await env.ASSETS.fetch(request), true);
  }
};

export { isPrivateSource, requiredEntitlement };
