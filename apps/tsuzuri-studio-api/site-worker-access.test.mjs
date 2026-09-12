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
