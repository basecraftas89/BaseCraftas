import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

const root = "projects/totonoe/IROHA/";

test("IROHA案内ページはキャラクター画像と学習内容を示し、準備中を維持する", () => {
  const html = readFileSync(root + "index.html", "utf8");
  assert.match(html, /service-iroha-home\.webp/);
  assert.match(html, /ABOUT IROHA/);
  assert.match(html, /LEARNING FLOW/);
  assert.match(html, /TAYORIの特典も/);
  assert.match(html, /現在、公開に向けて準備中/);
  assert.doesNotMatch(html, /href="dashboard\.html"/);
});

function openDashboard(view = "curriculum", prepare = () => {}) {
  const dom = new JSDOM(readFileSync(root + "dashboard.html", "utf8"), {
    url: `http://localhost/projects/totonoe/IROHA/dashboard.html?view=${view}&previewDate=2026-09-27`,
    runScripts: "outside-only",
  });
  dom.window.scrollTo = () => {};
  dom.window.eval(readFileSync(root + "curriculum-config.js", "utf8"));
  dom.window.eval(readFileSync(root + "curriculum-store.js", "utf8"));
  prepare(dom.window);
  dom.window.eval(readFileSync(root + "curriculum.js", "utf8"));
  return dom;
}

test("IROHAは学習管理・目標を含む5画面を切り替える", () => {
  const dom = openDashboard("curriculum");
  try {
    const { document, history, PopStateEvent } = dom.window;
    assert.deepEqual([...document.querySelectorAll("[data-iroha-view-link]")].map((link) => link.dataset.irohaViewLink), ["progress", "goals", "curriculum", "history", "seminars"]);
    assert.equal(document.querySelector('[data-iroha-view-link="seminars"]').textContent.trim(), "co_presentセミナー");
    const learningGrid = document.querySelector('[data-iroha-view="curriculum"] .learning-grid');
    assert.deepEqual([...learningGrid.children].map((item) => item.className), ["learning-primary", "iroha-category-rail"]);
    assert.deepEqual([...learningGrid.firstElementChild.children].map((item) => item.className), ["iroha-current-learning", "tool-library"]);
    assert.ok(document.querySelector(".iroha-category-rail").contains(document.querySelector("#irohaCategoryList")));
    assert.equal(document.querySelector(".iroha-topbar .eyebrow").textContent, "TOTONOE IROHA");
    assert.equal(document.querySelector('[data-iroha-view="curriculum"]').hidden, false);
    assert.equal(document.querySelector('[data-iroha-view="progress"]').hidden, true);
    assert.equal(document.querySelector('[data-iroha-view="goals"]').hidden, true);
    assert.ok(document.querySelector('[data-iroha-view="progress"] #weekDays'));
    assert.ok(document.querySelector('[data-iroha-view="progress"] #weeklyProgressValue'));
    assert.equal(document.querySelectorAll("#weekDays li").length, 7);
    assert.equal(document.querySelector("[data-start-lesson]").hidden, true);
    assert.match(document.querySelector("#irohaLessonStatus").textContent, /分野とカリキュラムを選ぶと/);
    document.querySelector('[data-iroha-view-link="history"]').click();
    assert.equal(document.querySelector('[data-iroha-view="history"]').hidden, false);
    assert.equal(document.querySelector("#irohaBadgeCount").textContent, "0");
    assert.equal(document.querySelector("#irohaCertificateCount").textContent, "0");
    document.querySelector('[data-iroha-view-link="seminars"]').click();
    assert.equal(document.querySelector('[data-iroha-view="seminars"]').hidden, false);
    assert.equal(document.querySelector('[data-iroha-view-link="seminars"]').getAttribute("aria-current"), "page");
    history.replaceState({}, "", "?view=curriculum");
    dom.window.dispatchEvent(new PopStateEvent("popstate"));
    assert.equal(document.querySelector('[data-iroha-view="curriculum"]').hidden, false);
  } finally { dom.window.close(); }
});

test("学習管理・目標の直接URLと旧planリンクを復活し、バナーを切り替える", () => {
  for (const view of ["plan", "progress", "goals"]) {
    const dom = openDashboard(view);
    try {
      const { document } = dom.window;
      const expected = view === "goals" ? "goals" : "progress";
      assert.equal(document.querySelector('[data-iroha-view="'+expected+'"]').hidden, false);
      assert.equal(document.querySelector('[data-iroha-view="curriculum"]').hidden, true);
      assert.equal(document.querySelector("#irohaViewTitle").textContent, expected === "goals" ? "目標設定" : "学習管理");
      assert.match(document.querySelector("#irohaWorldBanner").src, expected === "goals" ? /banner-goals/ : /banner-management/);
      assert.equal(document.querySelectorAll('dialog[open]').length, 0);
    } finally { dom.window.close(); }
  }
});

test("有料と無料を分け、過去回のフィルターと会員向け申込先を表示する", () => {
  const dom = openDashboard("seminars", (browser) => {
    browser.TOTONOE_SEMINARS = [
      { date: "2026-10-19", title: "外部講師の無料回", speakerType: "external", speakerName: "講師A", price: "無料", url: "https://example.com/free", thumb: "assets/seminar.jpg" },
      { date: "2026-10-20", title: "外部講師の有料回", speakerType: "external", speakerName: "講師B", price: "3,000円", url: "https://example.com/general" },
      { date: "2026-10-21", title: "運営講師の有料回", speakerType: "team", speakerName: "講師C", price: "4,000円", url: "https://example.com/team" },
      { date: "2026-09-20", title: "終了した回", speakerType: "external", price: "無料", url: "https://example.com/past" },
    ];
  });
  try {
    const { document } = dom.window;
    const featured = document.querySelector("#tayoriFreeSeminars .tayori-seminar-card");
    const cards = [...document.querySelectorAll("#tayoriPaidSeminars .tayori-seminar-card")];
    assert.match(featured.textContent, /外部講師の無料回/);
    assert.match(featured.textContent, /講師：講師A（外部講師）/);
    assert.equal(featured.querySelector("a")?.href, "https://example.com/free");
    assert.match(featured.querySelector("img")?.src, /\/projects\/totonoe\/assets\/seminar\.jpg$/);
    assert.equal(cards.length, 2);
    assert.match(cards[0].textContent, /IROHA会員：追加料金なし/);
    assert.equal(cards[0].querySelector("a"), null);
    assert.match(cards[1].textContent, /運営講師の有料回/);
    assert.match(cards[1].textContent, /講師：講師C（ToToNoE\+運営メンバー）/);
    assert.match(cards[1].textContent, /IROHA会員：追加料金なし/);
    assert.match(document.querySelector("#tayoriFreeSeminars").textContent, /終了した回/);
    [...document.querySelectorAll("#seminarStatusFilters button")].find(button => button.textContent === "開催終了").click();
    assert.equal(document.querySelectorAll("#tayoriFreeSeminars .tayori-seminar-card").length, 1);
    assert.equal(document.querySelectorAll("#tayoriPaidSeminars .tayori-seminar-card").length, 0);
    [...document.querySelectorAll("#seminarStatusFilters button")].find(button => button.textContent === "すべて").click();
    dom.window.TOTONOE_SEMINARS[1].memberRegistrationUrl = "https://example.com/member";
    dom.window.dispatchEvent(new dom.window.Event("totonoe:seminars-updated"));
    assert.equal(document.querySelector("#tayoriPaidSeminars .tayori-seminar-card a")?.href, "https://example.com/member");
  } finally { dom.window.close(); }
});

test("木村さんの開催回は運営メンバーとして無料一覧に表示する", () => {
  const dom = openDashboard("seminars", (browser) => {
    browser.history.replaceState({}, "", "?view=seminars&previewDate=2026-10-02");
    browser.eval(readFileSync("projects/totonoe/seminars.js", "utf8"));
  });
  try {
    const { document } = dom.window;
    const featured = document.querySelector("#tayoriFreeSeminars .tayori-seminar-card");
    assert.match(featured.textContent, /木村 倖晴（ToToNoE\+運営メンバー）/);
    assert.doesNotMatch(featured.textContent, /外部講師/);
  } finally { dom.window.close(); }
});

test("学習途中の講座を選択中の新規講座より上に出し、次のレッスンへ戻れる", () => {
  const dom = openDashboard("curriculum", (browser) => {
    const store = browser.TOTONOE_CURRICULUM_STORE;
    const admin = store.readAdminState();
    admin.lessons = [
      { ...admin.lessons[0], workflowStatus: "published", folderStage: "delivery", providerAssetId: "1AbCdEfGhijKLMnOP" },
      { ...admin.lessons[0], id: "gpt-bas-02", title: "安全な使い方", workflowStatus: "published", folderStage: "delivery", providerAssetId: "2AbCdEfGhijKLMnOP" },
      { ...admin.lessons[2], workflowStatus: "published", folderStage: "delivery", providerAssetId: "3AbCdEfGhijKLMnOP" },
    ];
    store.writeAdminState(admin);
    store.writeLearnerState({ selectedCategory: "llm", selectedCurriculumKey: "llm:Gemini", lessonProgress: { "gpt-bas-01": { status: "completed", playbackCompletedAt: "2026-09-26T00:00:00Z", completedAt: "2026-09-26T00:00:00Z" } } });
  });
  try {
    const { document } = dom.window;
    const cards = [...document.querySelectorAll(".iroha-current-card")];
    assert.equal(cards.length, 2);
    assert.match(cards[0].textContent, /ChatGPT.*次のレッスン：安全な使い方/s);
    assert.equal(cards[0].querySelector("a")?.getAttribute("href"), "lesson.html?id=gpt-bas-02");
    assert.match(cards[1].textContent, /選択中.*Gemini/s);
    assert.equal(document.querySelector("#irohaCurriculumList .curriculum-course").dataset.curriculumKey, "llm:ChatGPT");
  } finally { dom.window.close(); }
});

test("分野選択はブラウザ内に保存し、未公開教材は一覧に出さない", () => {
  const dom = openDashboard("curriculum");
  try {
    const { document, localStorage } = dom.window;
    const categories = [...document.querySelectorAll("#irohaCategoryList .curriculum-category")];
    assert.equal(categories.length, 8);
    assert.deepEqual(categories.map((button) => button.querySelector("img")?.getAttribute("src")), ["literacy", "llm", "image", "video", "setup", "organization", "automation", "other"].map((id) => `assets/category-${id}.webp`));
    assert.ok(categories.every((button) => button.querySelector("strong")?.textContent && !button.querySelector("small")));
    document.querySelector('[data-category="llm"]').click();
    assert.equal(JSON.parse(localStorage.getItem("totonoe-curriculum-preview-v1")).selectedCategory, "llm");
    assert.match(document.querySelector("#irohaCategoryStatus").textContent, /準備中/);
    assert.equal(document.querySelectorAll("#irohaCurriculumList button").length, 0);
    assert.equal(document.querySelector("[data-start-lesson]").hidden, true);
    assert.equal(document.querySelector("#irohaToolDetail").hidden, true);
    assert.equal(document.querySelector('[data-category="llm"]').getAttribute("aria-pressed"), "true");
  } finally { dom.window.close(); }
});

test("制作中の教材は公開状態にしても受講画面には出さない", () => {
  const dom = openDashboard("curriculum", (browser) => {
    const store = browser.TOTONOE_CURRICULUM_STORE;
    const admin = store.readAdminState();
    admin.lessons = [{ ...admin.lessons[0], workflowStatus: "published", folderStage: "working", providerAssetId: "1AbCdEfGhijKLMnOP", videoFileName: "01_制作中.mp4" }];
    store.writeAdminState(admin);
  });
  try {
    const { document } = dom.window;
    document.querySelector('[data-category="llm"]').click();
    assert.equal(document.querySelectorAll("#irohaCurriculumList button").length, 0);
    assert.equal(document.querySelector("[data-start-lesson]").hidden, true);
  } finally { dom.window.close(); }
});

test("公開レッスンをカリキュラム別に一覧表示し、完了後は次の未完了へ進める", () => {
  const dom = openDashboard("curriculum", (browser) => {
    const store = browser.TOTONOE_CURRICULUM_STORE;
    const admin = store.readAdminState();
    admin.lessons = [
      { ...admin.lessons[0], workflowStatus: "published", folderStage: "delivery", providerAssetId: "1AbCdEfGhijKLMnOP" },
      { ...admin.lessons[0], id: "gpt-bas-02", title: "安全な使い方", estimatedMinutes: 18, workflowStatus: "published", folderStage: "delivery", providerAssetId: "2AbCdEfGhijKLMnOP" },
      { ...admin.lessons[0], id: "gpt-bas-03", title: "非公開の教材", workflowStatus: "draft", providerAssetId: "3AbCdEfGhijKLMnOP" },
    ];
    store.writeAdminState(admin);
    store.writeLearnerState({ selectedTool: "ChatGPT", lessonProgress: { "gpt-bas-01": { status: "completed", playbackCompletedAt: "2026-09-26T00:00:00Z" } } });
  });
  try {
    const { document } = dom.window;

    const links = [...document.querySelectorAll("#irohaLessonGroups a")];
    assert.deepEqual(links.map((link) => link.querySelector("strong").textContent), ["ChatGPTとは何か", "安全な使い方"]);
    assert.match(document.querySelector("#irohaLessonStatus").textContent, /次に学ぶ：安全な使い方/);
    assert.match(document.querySelector('[data-curriculum-key="llm:ChatGPT"]').textContent, /1 \/ 2レッスン完了/);
    assert.equal(document.querySelector('[data-category="llm"]').getAttribute("aria-pressed"), "true");
    assert.equal(document.querySelector("[data-start-lesson]").hidden, false);
    assert.equal(document.querySelector("[data-start-lesson]").textContent, "続きから学ぶ");
    assert.doesNotMatch(document.querySelector("#irohaToolDetail").textContent, /非公開の教材/);
  } finally { dom.window.close(); }
});

test("カリキュラム一覧では未修了の後続動画をリンクにしない", () => {
  const dom = openDashboard("curriculum", (browser) => {
    const store = browser.TOTONOE_CURRICULUM_STORE;
    const admin = store.readAdminState();
    admin.lessons = [
      { ...admin.lessons[0], workflowStatus: "published", folderStage: "delivery", providerAssetId: "1AbCdEfGhijKLMnOP", videoFileName: "01_基本.mp4" },
      { ...admin.lessons[0], id: "gpt-bas-02", title: "次の学習", workflowStatus: "published", folderStage: "delivery", providerAssetId: "2AbCdEfGhijKLMnOP", videoFileName: "02_応用.mp4" },
    ];
    store.writeAdminState(admin);
    store.writeLearnerState({ selectedTool: "ChatGPT" });
  });
  try {
    const { document } = dom.window;
    assert.equal(document.querySelectorAll("#irohaLessonGroups a").length, 1);
    assert.match(document.querySelector("#irohaLessonGroups .iroha-lesson-locked")?.textContent || "", /前のレッスンのアウトプット後に開放/);
  } finally { dom.window.close(); }
});

test("ツールを使わない組織導入講座も、独立したカリキュラムとして表示する", () => {
  const dom = openDashboard("curriculum", (browser) => {
    const store = browser.TOTONOE_CURRICULUM_STORE;
    const admin = store.readAdminState();
    admin.lessons = [{ ...admin.lessons[0], id: "org-01", categoryId: "organization", curriculumTitle: "組織へのAI導入", tool: "", title: "提案の進め方", workflowStatus: "published", folderStage: "delivery", providerAssetId: "1AbCdEfGhijKLMnOP" }];
    store.writeAdminState(admin);
  });
  try {
    const { document } = dom.window;
    document.querySelector('[data-category="organization"]').click();
    const course = document.querySelector('[data-curriculum-key="organization:組織へのAI導入"]');
    assert.ok(course);
    course.click();
    assert.equal(document.querySelector("#irohaToolDetailTitle").textContent, "組織へのAI導入");
    assert.match(document.querySelector("#irohaLessonGroups").textContent, /提案の進め方/);
  } finally { dom.window.close(); }
});

test("動画終了とアウトプット保存後にだけ次の動画を開く", () => {
  const dom = new JSDOM(readFileSync(root + "lesson.html", "utf8"), {
    url: "http://localhost/projects/totonoe/IROHA/lesson.html?id=gpt-bas-01",
    runScripts: "outside-only",
  });
  try {
    dom.window.eval(readFileSync(root + "curriculum-store.js", "utf8"));
    const store = dom.window.TOTONOE_CURRICULUM_STORE;
    const admin = store.readAdminState();
    admin.lessons = [
      { ...admin.lessons[0], workflowStatus: "published", folderStage: "delivery", providerAssetId: "1AbCdEfGhijKLMnOP", playbackUrl: "/api/totonoe-member/api/curriculum/media/1AbCdEfGhijKLMnOP" },
      { ...admin.lessons[0], id: "gpt-bas-02", title: "次の学習", workflowStatus: "published", folderStage: "delivery", providerAssetId: "2AbCdEfGhijKLMnOP" },
      { ...admin.lessons[0], id: "gpt-bas-03", title: "非公開", workflowStatus: "draft", providerAssetId: "3AbCdEfGhijKLMnOP" },
      { ...admin.lessons[0], id: "gpt-other-01", curriculumTitle: "ChatGPT応用", title: "別の講座", workflowStatus: "published", folderStage: "delivery", providerAssetId: "4AbCdEfGhijKLMnOP" },
    ];
    store.writeAdminState(admin);
    dom.window.eval(readFileSync(root + "lesson.js", "utf8"));
    const { document } = dom.window;
    assert.deepEqual([...document.querySelector(".lesson-stage").children].map((item) => item.className), ["video-card", "completion-card"]);
    assert.ok(document.querySelector("#lessonVideo video"));
    assert.equal(document.querySelector("#toggleLessonNotes").getAttribute("aria-expanded"), "true");
    document.querySelector("#toggleLessonNotes").click();
    assert.equal(document.querySelector("#completionForm").hidden, true);
    document.querySelector("#toggleLessonNotes").click();
    assert.equal(document.querySelector("#completionForm").hidden, false);
    const favorite = document.querySelector("#favoriteLessonButton");
    favorite.click();
    assert.equal(favorite.getAttribute("aria-pressed"), "true");
    assert.equal(store.readLearnerState().lessonFavorites["gpt-bas-01"], true);
    favorite.click();
    assert.equal(favorite.getAttribute("aria-pressed"), "false");
    assert.equal(document.querySelectorAll("#lessonNavigation a").length, 0);
    assert.match(document.querySelector("#lessonNavigation").textContent, /動画終了・アウトプット保存後に開放/);
    const form = document.querySelector("#completionForm");
    form.elements.takeaway.value = "質問の目的を明確にする";
    form.elements.doubts.value = "出典をどう確かめるか";
    form.elements.takeaway.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    assert.equal(store.readLearnerState().lessonDrafts["gpt-bas-01"].takeaway, "質問の目的を明確にする");
    assert.equal(store.readLearnerState().lessonDrafts["gpt-bas-01"].doubts, "出典をどう確かめるか");
    document.querySelector("#saveLessonDraft").click();
    assert.match(document.querySelector("#lessonDraftStatus").textContent, /メモを保存しました/);
    assert.equal(store.readLearnerState().lessonProgress?.["gpt-bas-01"], undefined);
    assert.equal(document.querySelectorAll("#lessonNavigation a").length, 0);
    form.elements.action.value = "次の議事録で試す";
    form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
    assert.equal(store.readLearnerState().lessonProgress?.["gpt-bas-01"], undefined);
    const video = document.querySelector("#lessonVideo video");
    Object.defineProperty(video, "duration", { value: 10 });
    video.currentTime = 10;
    video.dispatchEvent(new dom.window.Event("seeking"));
    video.dispatchEvent(new dom.window.Event("ended"));
    assert.equal(document.querySelector("#completeLessonButton").disabled, true);
    Object.defineProperty(video, "played", { value: { length: 1, start: () => 0, end: () => 10 } });
    video.currentTime = 9.5;
    video.dispatchEvent(new dom.window.Event("timeupdate"));
    video.dispatchEvent(new dom.window.Event("ended"));
    assert.equal(document.querySelector("#completeLessonButton").disabled, false);
    form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
    assert.equal(store.readLearnerState().lessonProgress["gpt-bas-01"].takeaway, "質問の目的を明確にする");
    assert.equal(store.readLearnerState().lessonProgress["gpt-bas-01"].doubts, "出典をどう確かめるか");
    assert.ok(store.readLearnerState().lessonProgress["gpt-bas-01"].playbackCompletedAt);
    assert.equal(store.readLearnerState().lessonDrafts["gpt-bas-01"], undefined);
    assert.equal(document.querySelector("#lessonNavigation a")?.getAttribute("href"), "lesson.html?id=gpt-bas-02");
    assert.equal(dom.window.document.querySelector(".lesson-breadcrumb").getAttribute("href"), "dashboard.html?view=curriculum");
  } finally { dom.window.close(); }
});

test("Drive埋め込みは自己申告やメモ保存だけでは次を解放しない", () => {
  const dom = new JSDOM(readFileSync(root + "lesson.html", "utf8"), {
    url: "http://localhost/projects/totonoe/IROHA/lesson.html?id=gpt-bas-01",
    runScripts: "outside-only",
  });
  try {
    dom.window.eval(readFileSync(root + "curriculum-store.js", "utf8"));
    const store = dom.window.TOTONOE_CURRICULUM_STORE;
    const admin = store.readAdminState();
    admin.lessons = [
      { ...admin.lessons[0], workflowStatus: "published", folderStage: "delivery", providerAssetId: "1AbCdEfGhijKLMnOP" },
      { ...admin.lessons[0], id: "gpt-bas-02", title: "次の学習", workflowStatus: "published", folderStage: "delivery", providerAssetId: "2AbCdEfGhijKLMnOP" },
    ];
    store.writeAdminState(admin);
    dom.window.eval(readFileSync(root + "lesson.js", "utf8"));
    const { document } = dom.window;
    const form = document.querySelector("#completionForm");
    form.elements.takeaway.value = "学んだこと";
    form.elements.doubts.value = "疑問点";
    form.elements.action.value = "次に試すこと";
    document.querySelector("#saveLessonDraft").click();
    form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
    assert.equal(store.readLearnerState().lessonProgress?.["gpt-bas-01"], undefined);
    assert.equal(store.readLearnerState().lessonDrafts["gpt-bas-01"].doubts, "疑問点");
    assert.equal(document.querySelector("#completeLessonButton").disabled, true);
    assert.equal(document.querySelectorAll("#lessonNavigation a").length, 0);
  } finally { dom.window.close(); }
});

test("旧式の自己申告完了記録は次の動画と修了バッジを解放しない", () => {
  const dom = new JSDOM("", { url: "http://localhost", runScripts: "outside-only" });
  try {
    dom.window.eval(readFileSync(root + "curriculum-store.js", "utf8"));
    const store = dom.window.TOTONOE_CURRICULUM_STORE;
    const admin = store.readAdminState();
    const lessons = [
      { ...admin.lessons[0], workflowStatus: "published", folderStage: "delivery", providerAssetId: "1AbCdEfGhijKLMnOP" },
      { ...admin.lessons[0], id: "gpt-bas-02", workflowStatus: "published", folderStage: "delivery", providerAssetId: "2AbCdEfGhijKLMnOP" },
    ];
    const progress = { "gpt-bas-01": { status: "completed", badgeEligible: true } };
    assert.equal(store.lessonUnlockState(lessons, "gpt-bas-02", progress).allowed, false);
    assert.equal(store.buildAchievementModel({ lessons }, { lessonProgress: progress }).badges.length, 0);
  } finally { dom.window.close(); }
});

test("Claude基礎のDrive動画はローカル画面確認用にだけ表示する", () => {
  const dom = new JSDOM(readFileSync(root + "lesson.html", "utf8"), {
    url: "http://localhost/projects/totonoe/IROHA/lesson.html",
    runScripts: "outside-only",
  });
  try {
    dom.window.eval(readFileSync(root + "curriculum-store.js", "utf8"));
    dom.window.eval(readFileSync(root + "lesson.js", "utf8"));
    const { document } = dom.window;
    assert.match(document.querySelector("#lessonTitle").textContent, /TAYORI共有（画面確認用）/);
    assert.equal(document.querySelector("#lessonAccess").textContent, "画面確認用");
    assert.equal(document.querySelector("#lessonVideo iframe")?.src, "https://drive.google.com/file/d/1LJP_caa6k9A-v1H7gCBmSpDdZqNQ8A87/preview");
    assert.equal(dom.window.TOTONOE_CURRICULUM_STORE.readAdminState().lessons.some((item) => item.id === "claude-basic-layout-preview"), false);
  } finally { dom.window.close(); }
});

test("Claudeの画面確認用動画は本番URLでは表示しない", () => {
  const dom = new JSDOM(readFileSync(root + "lesson.html", "utf8"), {
    url: "https://basecraftas.com/projects/totonoe/IROHA/lesson.html",
    runScripts: "outside-only",
  });
  try {
    dom.window.eval(readFileSync(root + "curriculum-store.js", "utf8"));
    dom.window.eval(readFileSync(root + "lesson.js", "utf8"));
    assert.equal(dom.window.document.querySelector("#lessonVideo iframe"), null);
    assert.equal(dom.window.document.querySelector("#completionForm").hidden, true);
  } finally { dom.window.close(); }
});

test("入力途中の受講メモを再訪時に復元する", () => {
  const dom = new JSDOM(readFileSync(root + "lesson.html", "utf8"), {
    url: "http://localhost/projects/totonoe/IROHA/lesson.html?id=gpt-bas-01",
    runScripts: "outside-only",
  });
  try {
    dom.window.eval(readFileSync(root + "curriculum-store.js", "utf8"));
    const store = dom.window.TOTONOE_CURRICULUM_STORE;
    const admin = store.readAdminState();
    admin.lessons = [{ ...admin.lessons[0], workflowStatus: "published", folderStage: "delivery", providerAssetId: "1AbCdEfGhijKLMnOP" }];
    store.writeAdminState(admin);
    store.writeLearnerState({ lessonDrafts: { "gpt-bas-01": { takeaway: "動画の途中で書いたメモ", doubts: "後で調べたいこと", action: "後で試す" } } });
    dom.window.eval(readFileSync(root + "lesson.js", "utf8"));
    assert.equal(dom.window.document.querySelector('[name="takeaway"]').value, "動画の途中で書いたメモ");
    assert.equal(dom.window.document.querySelector('[name="doubts"]').value, "後で調べたいこと");
    assert.equal(dom.window.document.querySelector('[name="action"]').value, "後で試す");
    assert.equal(dom.window.document.querySelector("#completionStatus").textContent, "未完了");
  } finally { dom.window.close(); }
});

test("後のレッスンをURLで直接開いても動画を表示しない", () => {
  const dom = new JSDOM(readFileSync(root + "lesson.html", "utf8"), {
    url: "http://localhost/projects/totonoe/IROHA/lesson.html?id=gpt-bas-02",
    runScripts: "outside-only",
  });
  try {
    dom.window.eval(readFileSync(root + "curriculum-store.js", "utf8"));
    const store = dom.window.TOTONOE_CURRICULUM_STORE;
    const admin = store.readAdminState();
    admin.lessons = [
      { ...admin.lessons[0], workflowStatus: "published", folderStage: "delivery", providerAssetId: "1AbCdEfGhijKLMnOP", videoFileName: "01_基本.mp4" },
      { ...admin.lessons[0], id: "gpt-bas-02", title: "次の学習", workflowStatus: "published", folderStage: "delivery", providerAssetId: "2AbCdEfGhijKLMnOP", videoFileName: "02_応用.mp4" },
    ];
    store.writeAdminState(admin);
    dom.window.eval(readFileSync(root + "lesson.js", "utf8"));
    const { document } = dom.window;
    assert.equal(document.querySelector("#lessonVideo iframe"), null);
    assert.equal(document.querySelector("#completionForm").hidden, true);
    assert.equal(document.querySelector("#lessonNavigation a")?.getAttribute("href"), "lesson.html?id=gpt-bas-01");
  } finally { dom.window.close(); }
});

test("教材管理では分野・講座名・任意ツールを登録できる", () => {
  const dom = new JSDOM(readFileSync(root + "admin.html", "utf8"), {
    url: "http://localhost/projects/totonoe/IROHA/admin.html",
    runScripts: "outside-only",
  });
  try {
    dom.window.fetch = () => new Promise(() => {});
    dom.window.eval(readFileSync(root + "curriculum-store.js", "utf8"));
    dom.window.eval(readFileSync(root + "curriculum-admin.js", "utf8"));
    const form = dom.window.document.querySelector("#lessonForm");
    form.elements.categoryId.value = "image";
    form.elements.curriculumTitle.value = "画像生成の基礎";
    form.elements.tool.value = "新しい画像AI";
    form.elements.code.value = "IMG-BAS-01";
    form.elements.module.value = "画像を作る";
    form.elements.title.value = "最初の一枚";
    form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
    const saved = dom.window.TOTONOE_CURRICULUM_STORE.readAdminState().lessons.find((lesson) => lesson.code === "IMG-BAS-01");
    assert.equal(saved.categoryId, "image");
    assert.equal(saved.curriculumTitle, "画像生成の基礎");
    assert.equal(saved.tool, "新しい画像AI");
    assert.equal(saved.workflowStatus, "draft");
  } finally { dom.window.close(); }
});

test("同じツールの複数講座は修了証を別々に判定する", () => {
  const dom = openDashboard("curriculum");
  try {
    const store = dom.window.TOTONOE_CURRICULUM_STORE;
    const admin = store.readAdminState();
    admin.lessons = [
      { ...admin.lessons[0], workflowStatus: "published", folderStage: "delivery", providerAssetId: "1AbCdEfGhijKLMnOP" },
      { ...admin.lessons[0], id: "gpt-advanced-01", curriculumTitle: "ChatGPT応用", workflowStatus: "published", folderStage: "delivery", providerAssetId: "2AbCdEfGhijKLMnOP" },
    ];
    const learner = { lessonProgress: { "gpt-bas-01": { status: "completed", badgeEligible: true, playbackCompletedAt: "2026-09-30T00:00:00Z", completedAt: "2026-09-30T00:00:00Z" } } };
    const model = store.buildAchievementModel(admin, learner);
    assert.deepEqual(Array.from(model.certificates, (item) => item.title), ["ChatGPT"]);
    assert.deepEqual(Array.from(model.certificates[0].lessonIds), ["gpt-bas-01"]);
  } finally { dom.window.close(); }
});

test("学習履歴では8分野のバッジを取得・未取得・教材準備中で表示する", () => {
  const dom = openDashboard("history", (browser) => {
    const store = browser.TOTONOE_CURRICULUM_STORE;
    const admin = store.readAdminState();
    admin.lessons = [
      { ...admin.lessons[0], categoryId: "image", curriculumTitle: "画像生成の基礎", title: "画像を作る", workflowStatus: "published", folderStage: "delivery", providerAssetId: "1AbCdEfGhijKLMnOP" },
      { ...admin.lessons[1], categoryId: "llm", workflowStatus: "published", folderStage: "delivery", providerAssetId: "2AbCdEfGhijKLMnOP" }
    ];
    store.writeAdminState(admin);
    store.writeLearnerState({ lessonProgress: { "gpt-bas-01": { status: "completed", badgeEligible: true, title: "画像を作る", playbackCompletedAt: "2026-10-01T00:00:00Z", completedAt: "2026-10-01T00:00:00Z" } } });
  });
  try {
    const { document } = dom.window;
    const collection = document.querySelector("details.iroha-badge-collection-panel");
    assert.equal(collection.open, false);
    collection.querySelector("summary").click();
    assert.equal(collection.open, true);
    collection.querySelector("summary").click();
    assert.equal(collection.open, false);
    for (const [title, list] of [["irohaBadgesTitle", "irohaBadgeList"], ["irohaCertificatesTitle", "irohaCertificateList"]]) {
      const disclosure = document.getElementById(title).closest("details");
      assert.equal(disclosure.open, false);
      assert.ok(disclosure.contains(document.getElementById(list)));
      disclosure.querySelector("summary").click();
      assert.equal(disclosure.open, true);
      disclosure.querySelector("summary").click();
      assert.equal(disclosure.open, false);
    }
    assert.equal(document.querySelectorAll("#irohaBadgeCollectionList .iroha-badge-card").length, 8);
    assert.equal(document.querySelectorAll("#irohaBadgeCollectionList .is-earned").length, 1);
    assert.equal(document.querySelectorAll("#irohaBadgeCollectionList .is-locked").length, 1);
    assert.equal(document.querySelectorAll("#irohaBadgeCollectionList .is-unavailable").length, 6);
    assert.deepEqual(Array.from(document.querySelectorAll("#irohaBadgeCollectionList .iroha-badge-artwork"), (image) => image.getAttribute("src")),
      ["literacy", "llm", "image", "video", "setup", "organization", "automation", "other"].map((id) => `assets/badge-scene-${id}.webp`));
    assert.equal(document.querySelector("#irohaBadgeCount").textContent, "1");
    const badge = document.querySelector("#irohaBadgeList .iroha-badge-card");
    assert.equal(badge.querySelector(".iroha-badge-artwork").getAttribute("src"), "assets/badge-scene-image.webp");
    assert.equal(badge.querySelector(".iroha-badge-seal"), null);
    assert.equal(badge.querySelector(".iroha-badge-emblem").dataset.category, "image");
    assert.match(badge.textContent, /画像を作る/);
    assert.match(document.querySelector("#irohaBadgeCollectionList .is-locked").textContent, /未取得/);
    assert.match(document.querySelector("#irohaBadgeCollectionList .is-unavailable").textContent, /教材準備中/);
    assert.equal(document.querySelector("#irohaCertificateList .iroha-badge-artwork").getAttribute("src"), "assets/badge-scene-image.webp");
  } finally { dom.window.close(); }
});

test("Drive動画ファイル名の先頭番号でレッスンを数値順に並べる", () => {
  const dom = openDashboard("curriculum");
  try {
    const store = dom.window.TOTONOE_CURRICULUM_STORE;
    const lessons = [
      { code: "C", videoFileName: "10_応用.mp4" },
      { code: "A", videoFileName: "02_基礎.mp4" },
      { code: "D", videoFileName: "番号なし.mp4" },
      { code: "B", videoFileName: "０１_導入.mp4" },
    ];
    assert.deepEqual(Array.from(store.sortLessons(lessons), (item) => item.code), ["B", "A", "C", "D"]);
    assert.equal(store.lessonVideoOrder({ videoFileName: "０１_導入.mp4" }), 1);
    assert.equal(store.lessonVideoOrder({ videoFileName: "教材01.mp4" }), null);
  } finally { dom.window.close(); }
});

test("公開登録では動画ファイルの先頭番号を必須にし、講座内の番号重複を防ぐ", () => {
  const dom = new JSDOM(readFileSync(root + "admin.html", "utf8"), {
    url: "http://localhost/projects/totonoe/IROHA/admin.html",
    runScripts: "outside-only",
  });
  try {
    dom.window.fetch = () => new Promise(() => {});
    dom.window.eval(readFileSync(root + "curriculum-store.js", "utf8"));
    dom.window.eval(readFileSync(root + "curriculum-admin.js", "utf8"));
    const form = dom.window.document.querySelector("#lessonForm");
    const submit = (code, name) => {
      form.elements.categoryId.value = "llm";
      form.elements.curriculumTitle.value = "ChatGPT";
      form.elements.tool.value = "ChatGPT";
      form.elements.code.value = code;
      form.elements.module.value = "基本操作";
      form.elements.title.value = code;
      form.elements.videoUrl.value = "1AbCdEfGhijKLMnOP";
      form.elements.videoFileName.value = name;
      form.elements.workflowStatus.value = "published";
      form.elements.folderStage.value = "delivery";
      form.elements.rightsChecked.checked = true;
      form.elements.permissionChecked.checked = true;
      form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
    };
    submit("GPT-BAS-02", "番号なし.mp4");
    assert.match(dom.window.document.querySelector("#lessonError").textContent, /番号から始めて/);
    submit("GPT-BAS-02", "01_基本操作.mp4");
    assert.equal(dom.window.TOTONOE_CURRICULUM_STORE.readAdminState().lessons.find((lesson) => lesson.code === "GPT-BAS-02").videoFileName, "01_基本操作.mp4");
    submit("GPT-BAS-03", "01_次の動画.mp4");
    assert.match(dom.window.document.querySelector("#lessonError").textContent, /番号が重複/);
  } finally { dom.window.close(); }
});

test("目標設定画面で今週の目標を保存し、週次レビューとは分けて保持する", () => {
  const dom = openDashboard("goals");
  try {
    const { document, localStorage, Event } = dom.window;
    const form = document.querySelector("#irohaGoalForm");
    form.elements.goal.value = "安全なプロンプトを2本作る";
    form.elements.reason.value = "業務の記録に役立てる";
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    const saved = JSON.parse(localStorage.getItem("totonoe-curriculum-preview-v1"));
    assert.equal(saved.learningGoals["2026-09-27"].goal, "安全なプロンプトを2本作る");
    assert.deepEqual(saved.weeklyReviews, {});
    assert.match(document.querySelector("#irohaGoalSummary").textContent, /安全なプロンプトを2本作る/);
  } finally { dom.window.close(); }
});
