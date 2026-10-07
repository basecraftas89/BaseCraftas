import test from "node:test";
import assert from "node:assert/strict";
import siteWorker from "../site-worker/worker.js";

const originalFetch = globalThis.fetch;
let memberApiFetch = async () => Response.json({ authenticated: false });
const env = {
  ASSETS: { fetch: async () => new Response("asset", { status: 200 }) },
  MEMBER_API: { fetch: async (request) => memberApiFetch(request) },
};

function profileResponse(profile) {
  memberApiFetch = async () => profile
    ? Response.json({ profile })
    : Response.json({ error: "authentication_required" }, { status: 401 });
}

function authStatusResponse(authenticated, access = {}) {
  memberApiFetch = async () => authenticated
    ? Response.json({ authenticated: true, access })
    : Response.json({ authenticated: false });
}

test.afterEach(() => { globalThis.fetch = originalFetch; });


test("encoded and extensionless member URLs cannot bypass authorization", async () => {
  profileResponse(null);
  for (const path of ["/projects/totonoe/TAYORI", "/projects/totonoe/TAYORI/index", "/projects/totonoe/%54AYORI/index.html", "/projects/totonoe/IROHA/dashboard/", "/projects/totonoe/IROHA/lesson", "/projects//totonoe/IROHA/mypage"]) {
    const response = await siteWorker.fetch(new Request("https://basecraftas.com" + path), env);
    assert.equal(response.status, 302, path);
    assert.match(response.headers.get("cache-control"), /private, no-store/);
  }
  const blocked = await siteWorker.fetch(new Request("https://basecraftas.com/apps/%74suzuri-studio-api/src/worker.js"), env);
  assert.equal(blocked.status, 404);
});

test("login form serves a fresh asset without authentication redirects", async () => {
  let assetPath = "";
  const loginEnv = {
    ASSETS: { fetch: async (request) => {
      assetPath = new URL(request.url).pathname;
      return new Response("login form", { status: 200 });
    } },
    MEMBER_API: { fetch: async () => { throw new Error("login must not check membership"); } },
  };
  for (const path of ["login", "login.html"]) {
    const response = await siteWorker.fetch(new Request("https://basecraftas.com/projects/totonoe/TAYORI/" + path + "?return=%2Fprojects%2Ftotonoe%2FIROHA%2Fdashboard.html"), loginEnv);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "login form");
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(assetPath, "/projects/totonoe/TAYORI/login-20261001");
  }
});

test("authorized HTML is never cached and profile failures fail closed", async () => {
  authStatusResponse(true, { has_weekly_access: true });
  const response = await siteWorker.fetch(new Request("https://basecraftas.com/projects/totonoe/TAYORI/"), env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
  memberApiFetch = async () => { throw new Error("unavailable"); };
  const failure = await siteWorker.fetch(new Request("https://basecraftas.com/projects/totonoe/TAYORI/"), env);
  assert.equal(failure.status, 503);
  assert.match(failure.headers.get("cache-control"), /no-store/);
  assert.equal(failure.headers.get("x-frame-options"), "DENY");
});

test("static site denies stale internal source assets even if they remain in Cloudflare storage", async () => {
  for (const pathname of [
    "/apps/site-worker/worker.js",
    "/apps/tsuzuri-studio-api/src/worker.js",
    "/scripts/build-site.mjs",
    "/tests/example.test.mjs",
    "/.git/config",
  ]) {
    const response = await siteWorker.fetch(new Request(`https://basecraftas.com${pathname}`), env);
    assert.equal(response.status, 404, pathname);
  }

  const publicResponse = await siteWorker.fetch(new Request("https://basecraftas.com/projects/totonoe/characters/"), env);
  assert.equal(publicResponse.status, 200);
});

test("static site returns TAYORI pages only to Weekly or IROHA purchasers", async () => {
  authStatusResponse(false);
  let response = await siteWorker.fetch(new Request("https://basecraftas.com/projects/totonoe/TAYORI/"), env);
  assert.equal(response.status, 302);
  assert.match(response.headers.get("location"), /TAYORI\/login\.html\?return=/);

  authStatusResponse(true, { has_weekly_access: true, has_curriculum_access: false });
  response = await siteWorker.fetch(new Request("https://basecraftas.com/projects/totonoe/TAYORI/", { headers: { cookie: "totonoe_session=test" } }), env);
  assert.equal(response.status, 200);

  authStatusResponse(true, { has_weekly_access: false, has_curriculum_access: true });
  response = await siteWorker.fetch(new Request("https://basecraftas.com/projects/totonoe/TAYORI/", { headers: { cookie: "totonoe_session=test" } }), env);
  assert.equal(response.status, 200);

  authStatusResponse(true, { has_weekly_access: false, has_curriculum_access: false, staff_access: true, staff_role: "editor" });
  response = await siteWorker.fetch(new Request("https://basecraftas.com/projects/totonoe/TAYORI/", { headers: { cookie: "totonoe_session=test" } }), env);
  assert.equal(response.status, 200);

  authStatusResponse(true, { has_weekly_access: false, has_curriculum_access: false, staff_access: true, staff_role: "viewer" });
  response = await siteWorker.fetch(new Request("https://basecraftas.com/projects/totonoe/TAYORI/", { headers: { cookie: "totonoe_session=test" } }), env);
  assert.equal(response.status, 302);
});

test("同じ会員セッションでIROHAとTAYORIを往復できる", async () => {
  const seen = [];
  memberApiFetch = async (request) => {
    seen.push({ path: new URL(request.url).pathname, cookie: request.headers.get("cookie") });
    if (new URL(request.url).pathname.endsWith("/auth/status")) {
      return Response.json({ authenticated: true, access: { has_weekly_access: true, has_curriculum_access: true } });
    }
    return Response.json({ profile: { has_weekly_access: true, has_curriculum_access: true } });
  };
  const cookie = "totonoe_session=iroha-member";
  for (const path of ["/projects/totonoe/IROHA/dashboard.html", "/projects/totonoe/TAYORI/", "/projects/totonoe/IROHA/lesson.html"]) {
    const response = await siteWorker.fetch(new Request("https://basecraftas.com" + path, { headers: { cookie } }), env);
    assert.equal(response.status, 200, path);
  }
  assert.deepEqual(seen.map((entry) => entry.cookie), [cookie, cookie, cookie]);
  assert.deepEqual(seen.map((entry) => entry.path), [
    "/api/totonoe-member/api/customer/profile",
    "/api/totonoe-member/api/customer/auth/status",
    "/api/totonoe-member/api/customer/profile",
  ]);
});

test("TAYORIのゲートは会員APIのService BindingへCookieを渡す", async () => {
  globalThis.fetch = async () => { throw new Error("unexpected public self-fetch"); };
  memberApiFetch = async (request) => {
    assert.equal(new URL(request.url).pathname, "/api/totonoe-member/api/customer/auth/status");
    assert.equal(request.headers.get("cookie"), "totonoe_session=authenticated");
    return Response.json({ authenticated: true, access: { staff_access: true, staff_role: "admin", has_weekly_access: true } });
  };
  const response = await siteWorker.fetch(new Request("https://basecraftas.com/projects/totonoe/TAYORI/", { headers: { cookie: "totonoe_session=authenticated" } }), env);
  assert.equal(response.status, 200);
});

test("static site keeps IROHA lessons exclusive to curriculum purchasers", async () => {
  profileResponse({ has_weekly_access: true, has_curriculum_access: false });
  let response = await siteWorker.fetch(new Request("https://basecraftas.com/projects/totonoe/IROHA/dashboard.html", { headers: { cookie: "totonoe_session=test" } }), env);
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "https://basecraftas.com/projects/totonoe/IROHA/");

  profileResponse({ has_weekly_access: true, has_curriculum_access: true });
  response = await siteWorker.fetch(new Request("https://basecraftas.com/projects/totonoe/IROHA/lesson.html", { headers: { cookie: "totonoe_session=test" } }), env);
  assert.equal(response.status, 200);
});

test("shared mypage accepts either paid membership and leaves public LPs untouched", async () => {
  profileResponse({ has_weekly_access: true, has_curriculum_access: false });
  let response = await siteWorker.fetch(new Request("https://basecraftas.com/projects/totonoe/IROHA/mypage.html", { headers: { cookie: "totonoe_session=test" } }), env);
  assert.equal(response.status, 200);

  response = await siteWorker.fetch(new Request("https://basecraftas.com/projects/totonoe/IROHA/"), env);
  assert.equal(response.status, 200);
});
