import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { loadWorker } from "./test-support.mjs";

const worker = await loadWorker();

function fixture() {
  const sql = new DatabaseSync(":memory:");
  sql.exec(readFileSync("apps/tsuzuri-studio-api/schema.sql", "utf8"));
  sql.exec(readFileSync("apps/tsuzuri-studio-api/migrations/20260911_curriculum_foundation.sql", "utf8"));

  function prepare(query) {
    let args = [];
    return {
      bind(...values) { args = values; return this; },
      async first() { return sql.prepare(query).get(...args) || null; },
      async all() { return { results: sql.prepare(query).all(...args) }; },
      async run() { return { meta: { changes: Number(sql.prepare(query).run(...args).changes) } }; },
    };
  }

  const env = {
    ALLOW_DEV_AUTH: "true",
    DB: {
      prepare,
      async batch(items) {
        sql.exec("BEGIN");
        try {
          const results = [];
          for (const item of items) results.push(await item.run());
          sql.exec("COMMIT");
          return results;
        } catch (error) {
          sql.exec("ROLLBACK");
          throw error;
        }
      },
    },
  };

  async function call(path, email = "weekly@example.com", options = {}) {
    const headers = { ...(email ? { "x-column-studio-dev-email": email } : {}), ...(options.headers || {}) };
    if (options.body) headers["content-type"] = "application/json";
    return worker.fetch(new Request("https://test.local" + path, {
      method: options.method || "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    }), env);
  }

  function seed(status = "active", periodEnd = "2099-01-01T00:00:00Z") {
    sql.prepare("INSERT INTO customer_accounts (id, email, status) VALUES ('customer-1', 'weekly@example.com', 'active')").run();
    sql.prepare(
      "INSERT INTO customer_subscriptions (id, customer_id, product_code, billing_interval, status, recurring_amount_yen, current_period_end) VALUES ('subscription-1', 'customer-1', 'weekly', 'monthly', ?, 980, ?)"
    ).run(status, periodEnd);
    sql.prepare(
      "INSERT INTO customer_entitlements (id, customer_id, entitlement_code, source_subscription_id, status, starts_at) VALUES ('entitlement-1', 'customer-1', 'weekly_access', 'subscription-1', 'active', '2026-01-01T00:00:00Z')"
    ).run();
    sql.prepare(
      "INSERT INTO weekly_materials (id, drive_file_id, title, file_name, web_view_link, web_content_link, published_at) VALUES ('material-1', 'drive-1', '最新号', 'latest.pdf', 'https://drive.google.com/file/d/drive-1/view', 'https://drive.google.com/uc?export=download&id=drive-1', '2026-09-11T00:00:00Z'), ('material-2', 'drive-2', '過去号', 'past.pdf', 'https://drive.google.com/file/d/drive-2/view', '', '2026-01-01T00:00:00Z')"
    ).run();
  }

  return { sql, call, seed, env };
}

test("Weekly資料は未ログインおよび利用終了後に取得できない", async () => {
  const missing = fixture();
  assert.equal((await missing.call("/api/weekly/materials", "")).status, 401);

  const expired = fixture();
  expired.seed("canceled", "2026-01-02T00:00:00Z");
  assert.equal((await expired.call("/api/weekly/materials")).status, 403);
  assert.equal((await expired.call("/api/weekly/materials/material-1/open")).status, 403);
});

test("有効会員は入会前を含む全資料を新しい順に取得できる", async () => {
  const active = fixture();
  active.seed();
  const response = await active.call("/api/weekly/materials");
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(payload.materials.map((item) => item.title), ["最新号", "過去号"]);
});

test("解約済みでも支払済み期間中は閲覧でき、資料URLは一覧へ露出しない", async () => {
  const canceling = fixture();
  canceling.seed("canceled", "2099-01-01T00:00:00Z");
  const list = await canceling.call("/api/weekly/materials");
  const payload = await list.json();
  assert.equal(list.status, 200);
  assert.equal("web_view_link" in payload.materials[0], false);
  const open = await canceling.call("/api/weekly/materials/material-1/open?mode=download");
  assert.equal(open.status, 302);
  assert.match(open.headers.get("location"), /export=download/);
  assert.equal(canceling.sql.prepare("SELECT COUNT(*) AS count FROM weekly_material_events").get().count, 1);
});

test("カリキュラム会員はWeeklyも利用でき、Weekly単体会員とは権限が分かれる", async () => {
  const curriculum = fixture();
  curriculum.sql.prepare("INSERT INTO customer_accounts (id, email, status) VALUES ('customer-c', 'curriculum@example.com', 'active')").run();
  curriculum.sql.prepare("INSERT INTO customer_subscriptions (id, customer_id, product_code, billing_interval, status, recurring_amount_yen, current_period_end) VALUES ('subscription-c', 'customer-c', 'curriculum', 'annual', 'active', 29800, '2099-01-01T00:00:00Z')").run();
  curriculum.sql.prepare("INSERT INTO customer_entitlements (id, customer_id, entitlement_code, source_subscription_id, status, starts_at) VALUES ('entitlement-c', 'customer-c', 'curriculum_all_access', 'subscription-c', 'active', '2026-01-01T00:00:00Z')").run();
  const curriculumResponse = await curriculum.call("/api/weekly/me", "curriculum@example.com");
  const curriculumPayload = await curriculumResponse.json();
  assert.equal(curriculumResponse.status, 200);
  assert.equal(curriculumPayload.membership.has_weekly_access, true);
  assert.equal(curriculumPayload.membership.has_curriculum_access, true);

  const weekly = fixture();
  weekly.seed();
  const weeklyPayload = await (await weekly.call("/api/weekly/me")).json();
  assert.equal(weeklyPayload.membership.has_weekly_access, true);
  assert.equal(weeklyPayload.membership.has_curriculum_access, false);
});

test("会員プロフィールを保存して再取得できる", async () => {
  const active = fixture();
  active.seed();
  const update = await active.call("/api/customer/profile", "weekly@example.com", {
    method: "PATCH",
    body: { profession: "理学療法士", workplace_type: "病院・クリニック", role_title: "主任", organization_size: "11〜50人", ai_usage_level: "週に数回使う", interest_topics: ["業務自動化", "資料作成"], current_challenges: "議事録を効率化したい" },
  });
  assert.equal(update.status, 200);
  const profile = (await update.json()).profile;
  assert.equal(profile.profession, "理学療法士");
  assert.deepEqual(profile.interest_topics, ["業務自動化", "資料作成"]);
  assert.equal(profile.has_curriculum_access, false);
  const get = await active.call("/api/customer/profile");
  assert.equal((await get.json()).profile.current_challenges, "議事録を効率化したい");
});

test("Weekly会員は日曜始まりの週ごとに優先質問を1枠保存・更新できる", async () => {
  const active = fixture();
  active.seed();
  const body = {
    situation: "5人のチームで、毎週の申し送り内容を主任が手作業で要約しています。",
    goal: "重要事項を落とさず、10分以内で要約できるようにしたいです。",
    attempts: "ChatGPTへ文章を貼って要約しましたが、重要な情報が抜けました。",
    blocker: "残すべき情報をどのように指示すればよいか判断できません。",
    question: "重要事項を落とさない申し送り要約のプロンプトを具体例付きで教えてください。",
    answer_format: "demonstration",
    privacy_confirmed: true,
    video_consent: true,
  };
  const created = await active.call("/api/weekly/priority-question", "weekly@example.com", { method: "POST", body });
  assert.equal(created.status, 201);
  const first = await created.json();
  assert.match(first.week_start, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(first.question.status, "submitted");

  const updated = await active.call("/api/weekly/priority-question", "weekly@example.com", { method: "POST", body: { ...body, question: "重要事項を残す要約プロンプトの改善方法を、実演形式で具体的に教えてください。" } });
  assert.equal(updated.status, 200);
  assert.equal(active.sql.prepare("SELECT COUNT(*) AS count FROM weekly_priority_questions").get().count, 1);
  const current = await active.call("/api/weekly/priority-question");
  assert.equal((await current.json()).available, false);
});

test("優先質問は同意をD1へ保存し、管理表へ一度だけ追加して以後A〜Rだけ更新する", async () => {
  const active = fixture();
  active.seed();
  active.env.GOOGLE_DRIVE_ACCESS_TOKEN = "test-google-token";
  active.env.WEEKLY_QUESTION_SPREADSHEET_ID = "sheet-1";
  active.env.WEEKLY_QUESTION_SHEET_NAME = "質問管理";
  const schema = JSON.parse(readFileSync("apps/tsuzuri-studio-api/weekly-question-sheet-schema.json", "utf8"));
  const body = {
    situation: "5人のチームで、毎週の申し送り内容を主任が手作業で要約しています。",
    goal: "重要事項を落とさず、10分以内で要約できるようにしたいです。",
    attempts: "ChatGPTへ文章を貼って要約しましたが、重要な情報が抜けました。",
    blocker: "残すべき情報をどのように指示すればよいか判断できません。",
    question: "重要事項を落とさない申し送り要約のプロンプトを具体例付きで教えてください。",
    answer_format: "demonstration",
    privacy_confirmed: true,
    video_consent: true,
  };
  const writes = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = decodeURIComponent(String(input));
    if (url.includes("!A5:W5")) return Response.json({ values: [schema.columns.map((column) => column.header)] });
    if (url.includes("!A6:A2005")) return Response.json({ values: [] });
    writes.push({ method: init.method, url, body: JSON.parse(init.body) });
    if (init.method === "POST") return Response.json({ updates: { updatedRange: "質問管理!A6:W6" } });
    return Response.json({ updatedRange: "質問管理!A6:R6" });
  };
  try {
    const created = await active.call("/api/weekly/priority-question", "weekly@example.com", { method: "POST", body });
    assert.equal(created.status, 201);
    assert.equal((await created.json()).sheet_sync, "synced");
    const stored = active.sql.prepare("SELECT id, privacy_confirmed, video_consent, sheet_row, sheet_last_error FROM weekly_priority_questions").get();
    assert.equal(stored.privacy_confirmed, 1);
    assert.equal(stored.video_consent, 1);
    assert.equal(stored.sheet_row, 6);
    assert.equal(stored.sheet_last_error, "");
    assert.equal(writes[0].method, "POST");
    assert.equal(writes[0].body.values[0].length, 23);
    assert.deepEqual(writes[0].body.values[0].slice(16, 18), [true, true]);

    const updated = await active.call("/api/weekly/priority-question", "weekly@example.com", { method: "POST", body: { ...body, question: "重要事項を残す要約プロンプトを、実演形式で具体的に改善してください。" } });
    assert.equal(updated.status, 200);
    assert.equal(writes.filter((item) => item.method === "POST").length, 1);
    assert.equal(writes.filter((item) => item.method === "PUT").length, 1);
    assert.match(writes.at(-1).url, /!A6:R6/);
    assert.equal(writes.at(-1).body.values[0].length, 18);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("管理表障害でも質問はD1へ残り、受付ID検索による再同期で重複行を作らない", async () => {
  const active = fixture();
  active.seed();
  active.env.GOOGLE_DRIVE_ACCESS_TOKEN = "test-google-token";
  active.env.WEEKLY_QUESTION_SPREADSHEET_ID = "sheet-1";
  active.env.WEEKLY_QUESTION_SHEET_NAME = "質問管理";
  const schema = JSON.parse(readFileSync("apps/tsuzuri-studio-api/weekly-question-sheet-schema.json", "utf8"));
  const body = {
    situation: "複数職種の会議内容を、毎週担当者が手作業で整理している状況です。",
    goal: "共有までの作業時間を短縮し、判断事項を正確に残したいです。",
    attempts: "要約プロンプトを試しましたが、決定事項と宿題が混ざりました。",
    blocker: "出力形式を安定させる条件が分からず、毎回修正しています。",
    question: "決定事項と宿題を分けて出すプロンプトを、具体例付きで教えてください。",
    answer_format: "steps",
    privacy_confirmed: true,
    video_consent: true,
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ error: { message: "temporary" } }, { status: 503 });
  try {
    const created = await active.call("/api/weekly/priority-question", "weekly@example.com", { method: "POST", body });
    assert.equal(created.status, 201);
    assert.equal((await created.json()).sheet_sync, "failed");
    const stored = active.sql.prepare("SELECT id, sheet_last_error FROM weekly_priority_questions").get();
    assert.equal(stored.sheet_last_error, "temporary");
    let appendCount = 0;
    let updateCount = 0;
    globalThis.fetch = async (input, init = {}) => {
      const url = decodeURIComponent(String(input));
      if (url.includes("!A5:W5")) return Response.json({ values: [schema.columns.map((column) => column.header)] });
      if (url.includes("!A6:A2005")) return Response.json({ values: [[stored.id]] });
      if (init.method === "POST") appendCount += 1;
      if (init.method === "PUT") updateCount += 1;
      return Response.json({ updatedRange: "質問管理!A6:R6" });
    };
    const retried = await active.call("/api/weekly/priority-question", "weekly@example.com", { method: "POST", body: { ...body, question: "決定事項と宿題を分けて安定出力する方法を、手順で詳しく教えてください。" } });
    assert.equal((await retried.json()).sheet_sync, "synced");
    assert.equal(appendCount, 0);
    assert.equal(updateCount, 1);
    assert.equal(active.sql.prepare("SELECT sheet_row FROM weekly_priority_questions").get().sheet_row, 6);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("運営列だけをD1へ取り込み、回答動画URLは指定Driveフォルダ直下の同期済み動画に限定する", async () => {
  const active = fixture();
  active.seed();
  active.sql.prepare("INSERT INTO members (id, email, role, status) VALUES ('admin-1', 'admin@example.com', 'admin', 'active')").run();
  active.sql.prepare("INSERT INTO weekly_answer_videos (id, drive_file_id, title, file_name, mime_type, published_at) VALUES ('video-1', 'drive-video-12345', '回答動画', 'answer.mp4', 'video/mp4', '2026-09-11T00:00:00Z')").run();
  active.env.GOOGLE_DRIVE_ACCESS_TOKEN = "test-google-token";
  active.env.WEEKLY_QUESTION_SPREADSHEET_ID = "sheet-1";
  active.env.WEEKLY_QUESTION_SHEET_NAME = "質問管理";
  active.env.DRIVE_WEEKLY_FOLDER_ID = "pdf-folder";
  active.env.DRIVE_WEEKLY_RESPONSE_FOLDER_ID = "answer-folder";
  const schema = JSON.parse(readFileSync("apps/tsuzuri-studio-api/weekly-question-sheet-schema.json", "utf8"));
  const questionId = "weekly_question_ops";
  const untouchedQuestionId = "weekly_question_keep_status";
  active.sql.prepare(`INSERT INTO weekly_priority_questions
    (id, customer_id, week_start, situation, goal, attempts, blocker, question, profile_snapshot, privacy_confirmed, video_consent, sheet_row, sheet_synced_at)
    VALUES (?, 'customer-1', '2026-09-06', '具体的な場面です', '実現したいことです', '試した内容です', '迷っている点です', '最終的な質問です', '{}', 1, 1, 6, CURRENT_TIMESTAMP)`).run(questionId);
  active.sql.prepare(`INSERT INTO weekly_priority_questions
    (id, customer_id, week_start, situation, goal, attempts, blocker, question, profile_snapshot, privacy_confirmed, video_consent, status, sheet_row, sheet_synced_at)
    VALUES (?, 'customer-1', '2026-09-13', '別の場面です', '別の目標です', '試した内容です', '迷っている点です', '別の質問です', '{}', 1, 1, 'in_review', 7, CURRENT_TIMESTAMP)`).run(untouchedQuestionId);
  const sheetRow = Array(23).fill("");
  sheetRow[0] = questionId;
  sheetRow[18] = "議事録自動化";
  sheetRow[19] = "回答動画公開済み";
  sheetRow[20] = "類似質問まとめ：議事録";
  sheetRow[21] = "https://drive.google.com/file/d/drive-video-12345/view";
  sheetRow[22] = "公開済み";
  const untouchedSheetRow = Array(23).fill("");
  untouchedSheetRow[0] = untouchedQuestionId;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = decodeURIComponent(String(input));
    if (url.includes("sheets.googleapis.com") && url.includes("!A5:W5")) return Response.json({ values: [schema.columns.map((column) => column.header)] });
    if (url.includes("sheets.googleapis.com") && url.includes("!A6:W2005")) return Response.json({ values: [sheetRow, untouchedSheetRow] });
    if (url.includes("drive/v3/files/drive-video-12345")) return Response.json({ id: "drive-video-12345", name: "answer.mp4", mimeType: "video/mp4", parents: ["answer-folder"], trashed: false });
    if (url.includes("drive/v3/files?")) return Response.json({ files: [] });
    throw new Error("unexpected fetch: " + url);
  };
  try {
    const response = await active.call("/api/weekly/admin/sync", "admin@example.com", { method: "POST", body: {} });
    assert.equal(response.status, 200);
    const stored = active.sql.prepare("SELECT status, question_group, operations_status, answer_video_title, answer_video_url, operations_notes FROM weekly_priority_questions WHERE id = ?").get(questionId);
    assert.equal(stored.status, "answered");
    assert.equal(stored.question_group, "議事録自動化");
    assert.equal(stored.operations_status, "回答動画公開済み");
    assert.equal(stored.answer_video_url, sheetRow[21]);
    assert.equal(active.sql.prepare("SELECT status FROM weekly_priority_questions WHERE id = ?").get(untouchedQuestionId).status, "in_review");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("回答動画一覧はWeekly会員だけが取得でき、DriveファイルIDを露出しない", async () => {
  const active = fixture();
  active.seed();
  active.sql.prepare("INSERT INTO weekly_answer_videos (id, drive_file_id, title, file_name, mime_type, published_at) VALUES ('video-1', 'private-drive-id', '質問への回答', 'answer.mp4', 'video/mp4', '2026-09-11T00:00:00Z')").run();
  const response = await active.call("/api/weekly/answer-videos");
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.videos[0].title, "質問への回答");
  assert.equal("drive_file_id" in payload.videos[0], false);
  assert.equal(payload.playback, "secure_proxy");
  assert.equal(payload.videos[0].playback_url, "/api/tsuzuri-studio/api/weekly/answer-videos/video-1/stream");

  const missing = fixture();
  assert.equal((await missing.call("/api/weekly/answer-videos", "")).status, 401);
});

test("回答動画は会員確認後にDrive IDを隠したままRange対応でストリーミングされる", async () => {
  const active = fixture();
  active.seed();
  active.env.GOOGLE_DRIVE_ACCESS_TOKEN = "test-google-token";
  active.sql.prepare("INSERT INTO weekly_answer_videos (id, drive_file_id, title, file_name, mime_type, published_at) VALUES ('video-1', 'private-drive-id', '質問への回答', 'answer.mp4', 'video/mp4', '2026-09-11T00:00:00Z')").run();
  const originalFetch = globalThis.fetch;
  let observedUrl = "";
  let observedHeaders;
  globalThis.fetch = async (input, init = {}) => {
    observedUrl = String(input);
    observedHeaders = new Headers(init.headers);
    return new Response(new Uint8Array([1, 2]), {
      status: 206,
      headers: { "content-type": "video/mp4", "content-length": "2", "content-range": "bytes 0-1/2", "accept-ranges": "bytes" },
    });
  };
  try {
    const response = await active.call("/api/weekly/answer-videos/video-1/stream", "weekly@example.com", { headers: { range: "bytes=0-1" } });
    assert.equal(response.status, 206);
    assert.match(observedUrl, /drive\/v3\/files\/private-drive-id\?alt=media$/);
    assert.equal(observedHeaders.get("authorization"), "Bearer test-google-token");
    assert.equal(observedHeaders.get("range"), "bytes=0-1");
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(response.headers.get("content-range"), "bytes 0-1/2");
    assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [1, 2]);
    assert.equal(active.sql.prepare("SELECT COUNT(*) AS count FROM weekly_answer_video_events").get().count, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Weekly画面は新聞ビジュアル、年・月アコーディオン、横長資料行を備える", () => {
  const html = readFileSync("projects/totonoe/TAYORI/index.html", "utf8");
  const script = readFileSync("projects/totonoe/TAYORI/weekly-member.js", "utf8");
  assert.match(html, /totonoe-weekly-newspaper-20260911\.jpg/);
  assert.match(html, /id="materialSort"/);
  assert.match(html, /data-entitlement="curriculum"/);
  assert.match(script, /archive-year/);
  assert.match(script, /archive-month/);
  assert.match(script, /material-row/);
  assert.match(script, /data-mode="download">ダウンロード/);
  assert.match(script, /drive\.google\.com\/file\/d\//);
  assert.doesNotMatch(script, /data-mode="download">保存/);
});

test("Weekly画面は優先質問を小分けで入力し、会員限定の回答動画欄を備える", () => {
  const html = readFileSync("projects/totonoe/TAYORI/index.html", "utf8");
  const script = readFileSync("projects/totonoe/TAYORI/weekly-member.js", "utf8");
  assert.match(html, /id="priorityQuestionForm"/);
  assert.match(html, /data-question-step="1" open/);
  assert.match(html, /name="situation"/);
  assert.match(html, /name="attempts"/);
  assert.match(html, /name="blocker"/);
  assert.match(html, /name="privacy_confirmed"/);
  assert.match(html, /name="video_consent"/);
  assert.match(html, /id="answerVideoList"/);
  assert.match(html, /類似質問/);
  assert.match(html, /TAYORI会員全員/);
  assert.match(html, /個別回答ではありません/);
  assert.match(script, /priority-question/);
  assert.match(script, /answer-videos/);
});

test("優先質問フォームと管理表の回答列は同じ順序・項目で定義される", () => {
  const schema = JSON.parse(readFileSync("apps/tsuzuri-studio-api/weekly-question-sheet-schema.json", "utf8"));
  const formSources = schema.columns.filter((column) => column.source.startsWith("form.")).map((column) => column.source.slice(5));
  assert.deepEqual(formSources, ["situation", "goal", "use_by", "attempts", "blocker", "question", "answer_format", "privacy_confirmed", "video_consent"]);
  assert.deepEqual(schema.columns.slice(18).map((column) => column.source), ["operations.question_group", "operations.status", "operations.answer_video_title", "operations.answer_video_url", "operations.notes"]);
});

test("マイページは会員共通ナビとテーマ最適化用プロフィール項目を備える", () => {
  const html = readFileSync("projects/totonoe/IROHA/mypage.html", "utf8");
  assert.match(html, /data-entitlement="curriculum"/);
  assert.match(html, /name="workplace_type"/);
  assert.match(html, /name="role_title"/);
  assert.match(html, /name="ai_usage_level"/);
  assert.match(html, /name="interest_topics"/);
  assert.match(html, /name="current_challenges"/);
});
