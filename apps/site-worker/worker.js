const PROFILE_PATH = "/api/totonoe-member/api/customer/profile";

function requiredEntitlement(pathname) {
  if (/^\/projects\/totonoe\/TAYORI\/(?:index\.html)?$/.test(pathname)) return "weekly";
  if (/^\/projects\/totonoe\/IROHA\/(?:dashboard|lesson)(?:\.html)?$/.test(pathname)) return "curriculum";
  if (/^\/projects\/totonoe\/IROHA\/mypage(?:\.html)?$/.test(pathname)) return "member";
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
    : "/projects/totonoe/weekly.html";
  return new Response(null, { status: 302, headers: { location: new URL(pathname, url.origin).href, "cache-control": "no-store" } });
}

async function loadProfile(request) {
  const url = new URL(request.url);
  const headers = new Headers({ accept: "application/json" });
  const cookie = request.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);
  const response = await fetch(new URL(PROFILE_PATH, url.origin), { headers, redirect: "manual" });
  if (response.status === 401) return { authenticated: false };
  if (!response.ok) return { authenticated: false };
  const payload = await response.json();
  return { authenticated: true, ...(payload.profile || {}) };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const required = requiredEntitlement(url.pathname);
    if (!required) return env.ASSETS.fetch(request);

    const profile = await loadProfile(request);
    if (!profile.authenticated) return loginResponse(url);

    const hasWeekly = Boolean(profile.has_weekly_access || profile.has_curriculum_access);
    const allowed = required === "curriculum"
      ? Boolean(profile.has_curriculum_access)
      : hasWeekly;
    if (!allowed) return salesResponse(url, required);
    return env.ASSETS.fetch(request);
  }
};

export { requiredEntitlement };
