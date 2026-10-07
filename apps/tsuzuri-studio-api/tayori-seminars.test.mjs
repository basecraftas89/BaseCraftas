import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { JSDOM } from "jsdom";

const read = (path) => readFileSync(`projects/totonoe/${path}`, "utf8");

test("TAYORIの5タブと4枚の案内画像を表示する", () => {
  const dom = new JSDOM(read("TAYORI/index.html"));
  try {
    const document = dom.window.document;
    assert.deepEqual([...document.querySelectorAll("[data-tayori-tab]")].map((tab) => tab.dataset.tayoriTab), ["home", "questions", "answers", "backnumbers", "seminars"]);
    for (const filename of ["tayori-guide-priority-question-v1-optimized.webp", "tayori-guide-answer-videos-v1-optimized.webp", "tayori-guide-backnumbers-v1-optimized.webp", "tayori-guide-seminars-v2-optimized.webp"]) {
      assert.ok(document.querySelector(`.subview-guide img[src$="${filename}"]`));
      assert.ok(existsSync(`projects/totonoe/assets/${filename}`));
    }
    assert.equal(document.querySelector('[data-tayori-view="seminars"]').firstElementChild.classList.contains("seminar-guide"), true);
    assert.match(document.querySelector(".seminar-benefits").textContent, /外部講師の有料セミナー/);
    const css = read("TAYORI/weekly-member.css");
    assert.match(css, /\.seminar-card-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3,/);
    assert.match(css, /\.tayori-seminar-card > img\s*\{[^}]*object-fit:\s*contain/);
    assert.match(css, /\.tayori-seminar-card\.is-past > img\s*\{[^}]*filter:\s*brightness/);
  } finally { dom.window.close(); }
});

test("セミナーは既存一覧から無料・有料に分かれ、一般向け有料URLは会員申込に流用しない", async () => {
  const dom = new JSDOM(read("TAYORI/index.html"), { url: "http://127.0.0.1/projects/totonoe/TAYORI/?view=seminars", runScripts: "outside-only" });
  try {
    const { window } = dom;
    window.Date.now = () => Date.parse("2026-09-28T09:00:00Z");
    window.fetch = async () => ({ ok: false, status: 401 });
    window.scrollTo = () => {};
    window.eval(read("seminars.js"));
    window.TOTONOE_SEMINARS.push({ date: "2099-01-01", dateLabel: "2099年1月1日", title: "運営講師の有料回", speakerName: "運営講師", speakerType: "team", price: "3,000円", url: "https://example.com/general" });
    window.TOTONOE_SEMINARS.push({ date: "2099-01-02", dateLabel: "2099年1月2日", title: "外部講師の有料回", speakerName: "外部講師", speakerType: "external", price: "5,000円", memberRegistrationUrl: "https://example.com/member" });
    window.eval(read("TAYORI/weekly-member.js"));
    await new Promise((resolve) => setTimeout(resolve, 10));
    const document = window.document;
    assert.equal(document.querySelectorAll("#tayoriFreeSeminars article").length, 6);
    assert.match(document.querySelector("#tayoriFreeSeminars").textContent, /木村 倖晴（ToToNoE\+運営メンバー）/);
    assert.equal(document.querySelectorAll("#tayoriFreeSeminars article.is-past").length, 4);
    assert.equal(document.querySelectorAll("#tayoriPaidSeminars article").length, 2);
    assert.match(document.querySelector("#tayoriPaidSeminars").textContent, /TAYORI会員：追加料金なし/);
    assert.match(document.querySelector("#tayoriPaidSeminars").textContent, /IROHA会員：追加料金なし/);
    assert.equal(document.querySelector('a[href="https://example.com/general"]'), null);
    assert.ok(document.querySelector('a[href="https://example.com/member"]'));
    assert.equal(document.querySelector('[data-tayori-view="seminars"]').hidden, false);
    assert.equal(document.querySelector('[data-tayori-view="questions"]').hidden, true);
    assert.equal(document.querySelectorAll("#answerSampleList .answer-video-row").length, 3);
    assert.match(document.querySelector("#answerSampleList").textContent, /架空のサンプル/);
    const informationFilter = [...document.querySelectorAll("#answerCategoryFilters button")].find((button) => button.textContent === "情報管理");
    informationFilter.click();
    assert.equal(document.querySelectorAll("#answerSampleList .answer-video-row:not([hidden])").length, 1);
    assert.equal(document.querySelector("#answerVideoEmpty").hidden, false);
    assert.match(document.querySelector("#answerVideoEmpty").textContent, /このテーマの公開済み回答動画はまだありません/);
    const pastFilter = [...document.querySelectorAll("#seminarStatusFilters button")].find((button) => button.textContent === "開催終了");
    pastFilter.click();
    assert.equal(document.querySelectorAll("#tayoriFreeSeminars article").length, 4);
    const tagFilter = [...document.querySelectorAll("#seminarTagFilters button")].find((button) => button.textContent === "座談会");
    tagFilter.click();
    assert.equal(document.querySelectorAll("#tayoriFreeSeminars article").length, 2);
    assert.equal(document.querySelectorAll("#tayoriPaidSeminars article").length, 0);
  } finally { dom.window.close(); }
});

test("Studio公開の有料セミナーをTAYORIの非同期一覧に反映する", async () => {
  const dom = new JSDOM(read("TAYORI/index.html"), { url: "http://127.0.0.1/projects/totonoe/TAYORI/?view=seminars", runScripts: "outside-only" });
  try {
    const { window } = dom;
    let releaseIndex;
    const indexReady = new Promise((resolve) => { releaseIndex = resolve; });
    window.fetch = async (url) => {
      if (String(url).includes("data/contents/index.json")) {
        assert.equal(url, "/projects/totonoe/data/contents/index.json");
        await indexReady;
        return { ok: true, json: async () => ({ articles: [{
          status: "published", content_type: "seminar", title: "Studio有料セミナー", media_url: "https://example.com/general",
          source_published_at: "2099-10-01", seminar_details: { fee_type: "paid", price_yen: 4500, speaker_type: "external", speaker_name: "外部講師", start_time: "20:00", end_time: "21:00", member_registration_url: "https://example.com/member" },
          topic_tags: ["学習"]
        }] }) };
      }
      return { ok: false, status: 401 };
    };
    window.scrollTo = () => {};
    window.eval(read("seminars.js"));
    window.eval(read("TAYORI/weekly-member.js"));
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(window.document.querySelectorAll("#tayoriPaidSeminars article").length, 0);
    releaseIndex();
    await new Promise((resolve) => setTimeout(resolve, 10));
    const paid = window.document.querySelector("#tayoriPaidSeminars article");
    assert.ok(paid);
    assert.match(paid.textContent, /Studio有料セミナー/);
    assert.match(paid.textContent, /4,500円/);
    assert.match(paid.textContent, /外部講師/);
    assert.ok(paid.querySelector('a[href="https://example.com/member"]'));
    assert.equal(paid.querySelector('a[href="https://example.com/general"]'), null);
  } finally { dom.window.close(); }
});

test("TAYORI限定配信にも案内画像・セミナースクリプト・サムネイルが含まれる", () => {
  const build = readFileSync('apps/tayori-site/build-assets.mjs','utf8');
  const config = readFileSync('apps/tayori-site/wrangler.toml','utf8');
  const html = new JSDOM(read('TAYORI/index.html'));
  try {
    for (const img of html.window.document.querySelectorAll('.subview-guide img')) {
      assert.ok(build.includes('"' + img.getAttribute('src').split('/').pop() + '"'));
    }
    for (const match of read('seminars.js').matchAll(/thumb: 'assets\/([^']+)'/g)) {
      assert.ok(build.includes('"' + match[1] + '"'), match[1]);
      assert.ok(existsSync('projects/totonoe/assets/' + match[1]));
    }
    assert.ok(build.includes('"seminars.js"'));
    for (const route of ['assets/tayori-guide-*','assets/seminar-*','seminars.js*']) assert.ok(config.includes(route));
  } finally { html.window.close(); }
});
