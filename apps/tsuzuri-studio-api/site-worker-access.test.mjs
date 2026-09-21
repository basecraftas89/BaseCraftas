import test from "node:test";
import assert from "node:assert/strict";
import siteWorker from "../site-worker/worker.js";

const originalFetch = globalThis.fetch;
const env = { ASSETS: { fetch: async () => new Response("asset", { status: 200 }) } };

function profileResponse(profile) {
  globalThis.fetch = async () => profile
    ? Response.json({ profile })
    : Response.json({ error: "authentication_required" }, { status: 401 });
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

test("authorized HTML is never cached and profile failures fail closed", async () => {
  profileResponse({has_weekly_access:true});
  const response = await siteWorker.fetch(new Request("https://basecraftas.com/projects/totonoe/TAYORI/"), env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
  globalThis.fetch = async () => { throw new Error("unavailable"); };
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
  profileResponse(null);
  let response = await siteWorker.fetch(new Request("https://basecraftas.com/projects/totonoe/TAYORI/"), env);
  assert.equal(response.status, 302);
  assert.match(response.headers.get("location"), /TAYORI\/login\.html\?return=/);

  profileResponse({ has_weekly_access: true, has_curriculum_access: false });
  response = await siteWorker.fetch(new Request("https://basecraftas.com/projects/totonoe/TAYORI/", { headers: { cookie: "totonoe_session=test" } }), env);
  assert.equal(response.status, 200);

  profileResponse({ has_weekly_access: false, has_curriculum_access: true });
  response = await siteWorker.fetch(new Request("https://basecraftas.com/projects/totonoe/TAYORI/", { headers: { cookie: "totonoe_session=test" } }), env);
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
