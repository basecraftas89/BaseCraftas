import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { JSDOM } from "jsdom";

const root = path.resolve(import.meta.dirname, "../..");
const curriculumDir = path.join(root, "projects/totonoe/IROHA");

async function loadStore() {
  const dom = new JSDOM("<!doctype html><body></body>", { url: "http://localhost/", runScripts: "outside-only" });
  dom.window.eval(await fs.readFile(path.join(curriculumDir, "curriculum-store.js"), "utf8"));
  return dom.window;
}

test("Drive file URL is normalized to an asset ID and preview URL", async () => {
  const window = await loadStore();
  const store = window.TOTONOE_CURRICULUM_STORE;
  const parsed = store.parseDriveReference("https://drive.google.com/file/d/1AbCdEfGhijKLMnOP/view?usp=sharing", "file");
  assert.equal(parsed.valid, true);
  assert.equal(parsed.id, "1AbCdEfGhijKLMnOP");
  assert.equal(store.drivePreviewUrl(parsed.id), "https://drive.google.com/file/d/1AbCdEfGhijKLMnOP/preview");
});

test("Drive folder URL cannot be registered as a lesson video", async () => {
  const window = await loadStore();
  const parsed = window.TOTONOE_CURRICULUM_STORE.parseDriveReference("https://drive.google.com/drive/folders/1AbCdEfGhijKLMnOP", "file");
  assert.equal(parsed.valid, false);
  assert.match(parsed.error, /フォルダではなく動画ファイル/);
});

test("admin state and lesson completion are stored in separate namespaces", async () => {
  const window = await loadStore();
  const store = window.TOTONOE_CURRICULUM_STORE;
  const admin = store.readAdminState();
  admin.settings.rootFolderId = "1AbCdEfGhijKLMnOP";
  store.writeAdminState(admin);
  store.writeLearnerState({ lessonProgress: { "gpt-bas-01": { status: "completed" } } });
  assert.equal(store.readAdminState().settings.rootFolderId, "1AbCdEfGhijKLMnOP");
  assert.equal(store.readLearnerState().lessonProgress["gpt-bas-01"].status, "completed");
  assert.notEqual(store.ADMIN_KEY, store.LEARNER_KEY);
});

test("curriculum pages expose the management and learner flows", async () => {
  const [adminHtml, lessonHtml, dashboardHtml] = await Promise.all([
    fs.readFile(path.join(curriculumDir, "admin.html"), "utf8"),
    fs.readFile(path.join(curriculumDir, "lesson.html"), "utf8"),
    fs.readFile(path.join(curriculumDir, "dashboard.html"), "utf8")
  ]);
  assert.match(adminHtml, /id="driveSettingsForm"/);
  assert.match(adminHtml, /id="lessonForm"/);
  assert.match(lessonHtml, /id="completionForm"/);
  assert.match(dashboardHtml, /href="admin\.html"/);
  assert.match(dashboardHtml, /curriculum-store\.js/);
});

test("curriculum LP shows the therapist-only regular entry fee before the campaign price", async () => {
  const [html, script] = await Promise.all([
    fs.readFile(path.join(curriculumDir, "index.html"), "utf8"),
    fs.readFile(path.join(curriculumDir, "curriculum.js"), "utf8")
  ]);
  assert.match(html, /id="priceOriginal">30,000/);
  assert.match(html, /id="priceDiscount">83% OFF/);
  assert.match(html, /資格確認済みセラピストだけの特別価格/);
  assert.match(html, /id="recurringPrice">2,980/);
  assert.match(html, /class="rejoin-prices"/);
  assert.match(html, /30,000<small>円<\/small>/);
  assert.match(html, /10,000<small>円<\/small>/);
  assert.match(html, /初月のサブスク料金はかかりません/);
  assert.match(html, /30日後から/);
  assert.match(script, /audience === config\.campaign\.audience/);
  assert.match(script, /recurringUnit/);
  assert.match(script, /config\.entryFees\.first\[audience\]/);
  assert.match(script, /Math\.round\(\(1 - entry \/ originalEntry\) \* 100\)/);
  assert.match(html, /id="qualificationForm"/);
  assert.match(html, /審査完了から30日後に削除/);
  assert.match(html, /name="applicant_name"/);
  assert.match(html, /name="privacy_consent"/);
  assert.match(script, /\/api\/customer\/qualification/);
  assert.match(script, /qualification\.therapist_status !== "verified"/);
});


test("weekly progress separates goal and overachievement visually", async () => {
  const window = await loadStore();
  const model = window.TOTONOE_CURRICULUM_STORE.buildProgressModel(90, 60);
  assert.equal(model.achieved, true);
  assert.equal(model.overachieved, true);
  assert.equal(model.exceeded, 30);
  assert.equal(model.achievementPercent, 150);
  assert.equal(model.scaleMax, 90);
  assert.equal(Math.round(model.goalMarkerPercent), 67);
  assert.equal(Math.round(model.bonusFillPercent), 33);
});

test("weekly progress keeps the goal marker at the end before achievement", async () => {
  const window = await loadStore();
  const model = window.TOTONOE_CURRICULUM_STORE.buildProgressModel(30, 60);
  assert.equal(model.achieved, false);
  assert.equal(model.overachieved, false);
  assert.equal(model.goalFillPercent, 50);
  assert.equal(model.goalMarkerPercent, 100);
});
