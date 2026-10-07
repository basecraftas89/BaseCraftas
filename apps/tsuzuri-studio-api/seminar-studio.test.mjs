import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { JSDOM } from "jsdom";
import { loadWorker } from "./test-support.mjs";

const worker = await loadWorker();

function fixture() {
  const sql = new DatabaseSync(":memory:");
  sql.exec(readFileSync("apps/tsuzuri-studio-api/schema.sql", "utf8"));
  sql.exec("INSERT INTO members(id,email,role,status) VALUES ('admin','admin@example.com','admin','active')");
  function prepare(query) {
    let args = [];
    return {
      bind(...values) { args = values; return this; },
      async first() { return sql.prepare(query).get(...args) || null; },
      async all() { return { results: sql.prepare(query).all(...args) }; },
      async run() { return { meta: { changes: Number(sql.prepare(query).run(...args).changes) } }; },
    };
  }
  const env = { ALLOW_DEV_AUTH: "true", DB: { prepare, async batch(statements) {
    sql.exec("BEGIN");
    try { const results = []; for (const statement of statements) results.push(await statement.run()); sql.exec("COMMIT"); return results; }
    catch (error) { sql.exec("ROLLBACK"); throw error; }
  } } };
  const call = (path, method = "GET", body) => worker.fetch(new Request("https://test.local" + path, {
    method, headers: { "x-column-studio-dev-email": "admin@example.com", "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }), env);
  return { sql, call };
}

test("Studioの有料セミナー条件は保存・履歴化され、公開前に検証される", async () => {
  const { sql, call } = fixture();
  const details = { fee_type: "paid", price_yen: 3000, speaker_type: "external", speaker_name: "外部講師", start_time: "20:00", end_time: "21:00", member_registration_url: "https://example.com/member" };
  const created = await call("/api/articles", "POST", { slug: "paid-seminar-test", title: "有料セミナー", content_type: "seminar", main_actor_id: "shindo-toshiki", media_url: "https://example.com/general", source_published_at: "2099-10-01", seminar_details: details });
  assert.equal(created.status, 201);
  const article = (await created.json()).article;
  assert.deepEqual(article.seminar_details, details);
  assert.equal(JSON.parse(sql.prepare("SELECT seminar_details FROM article_versions WHERE article_id=?").get(article.id).seminar_details).price_yen, 3000);
  const updated = await call(`/api/articles/${article.id}`, "PATCH", { expected_revision: 1, seminar_details: { ...details, price_yen: 4500 } });
  assert.equal(updated.status, 200);
  assert.equal((await updated.json()).article.seminar_details.price_yen, 4500);
  const history = await call(`/api/articles/${article.id}/history`);
  assert.equal((await history.json()).versions.length, 2);
  const bad = await call(`/api/articles/${article.id}`, "PATCH", { expected_revision: 2, seminar_details: { ...details, member_registration_url: "javascript:alert(1)" } });
  assert.equal(bad.status, 400);
  const incomplete = await call("/api/articles", "POST", { slug: "incomplete-seminar", title: "未完成セミナー", content_type: "seminar", main_actor_id: "shindo-toshiki", media_url: "https://example.com/general", seminar_details: { ...details, price_yen: null } });
  assert.equal(incomplete.status, 201);
  const incompleteArticle = (await incomplete.json()).article;
  const rejected = await call(`/api/articles/${incompleteArticle.id}/publish`, "POST", { expected_revision: 1 });
  assert.equal(rejected.status, 400);
  assert.equal((await rejected.json()).error, "seminar_schedule_required");
});

test("Studio画面に有料セミナーの料金・講師区分・日時・会員申込欄がある", () => {
  const html = readFileSync("apps/tsuzuri-studio/index.html", "utf8");
  const dom = new JSDOM(html);
  for (const id of ["postSeminarFeeType", "postSeminarPrice", "postSeminarSpeakerType", "postSeminarSpeakerName", "postSeminarStart", "postSeminarEnd", "postSeminarMemberUrl"]) {
    assert.ok(dom.window.document.getElementById(id), id);
  }
  dom.window.close();
});
