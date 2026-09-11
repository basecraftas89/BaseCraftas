(() => {
  "use strict";

  const ADMIN_KEY = "totonoe-curriculum-admin-preview-v1";
  const LEARNER_KEY = "totonoe-curriculum-preview-v1";
  const DRIVE_ID_PATTERN = /^[A-Za-z0-9_-]{10,}$/;

  const seedLessons = [
    { id: "gpt-bas-01", code: "GPT-BAS-01", tool: "ChatGPT", level: "基礎", module: "基本操作と安全", title: "ChatGPTとは何か", estimatedMinutes: 12, accessTier: "curriculum_all_access", folderStage: "working", workflowStatus: "draft", videoProvider: "google_drive", providerAssetId: "", transcriptAssetId: "", worksheetAssetId: "" },
    { id: "cla-bas-01", code: "CLA-BAS-01", tool: "Claude", level: "基礎", module: "長文を扱う基本", title: "長い資料を整理する", estimatedMinutes: 14, accessTier: "curriculum_all_access", folderStage: "working", workflowStatus: "draft", videoProvider: "google_drive", providerAssetId: "", transcriptAssetId: "", worksheetAssetId: "" },
    { id: "gem-bas-01", code: "GEM-BAS-01", tool: "Gemini", level: "基礎", module: "Google連携の基本", title: "情報整理の入口", estimatedMinutes: 11, accessTier: "curriculum_all_access", folderStage: "working", workflowStatus: "draft", videoProvider: "google_drive", providerAssetId: "", transcriptAssetId: "", worksheetAssetId: "" }
  ];

  function parseDriveReference(value, expectedKind = "file") {
    const raw = String(value || "").trim();
    if (!raw) return { id: "", kind: expectedKind, valid: true };
    if (DRIVE_ID_PATTERN.test(raw)) return { id: raw, kind: expectedKind, valid: true };
    let url;
    try { url = new URL(raw); } catch (_) { return { id: "", kind: "unknown", valid: false, error: "Google DriveのURLまたはファイルIDを入力してください。" }; }
    if (!/(^|\.)drive\.google\.com$/.test(url.hostname) && !/(^|\.)docs\.google\.com$/.test(url.hostname)) {
      return { id: "", kind: "unknown", valid: false, error: "Google DriveのURLではありません。" };
    }
    const folderMatch = url.pathname.match(/\/folders\/([A-Za-z0-9_-]+)/);
    const fileMatch = url.pathname.match(/\/file\/d\/([A-Za-z0-9_-]+)/);
    const id = (folderMatch && folderMatch[1]) || (fileMatch && fileMatch[1]) || url.searchParams.get("id") || "";
    const kind = folderMatch ? "folder" : "file";
    if (!DRIVE_ID_PATTERN.test(id)) return { id: "", kind, valid: false, error: "Drive IDを読み取れませんでした。" };
    if (kind !== expectedKind) return { id, kind, valid: false, error: expectedKind === "file" ? "フォルダではなく動画ファイルのURLを入力してください。" : "ファイルではなくフォルダのURLを入力してください。" };
    return { id, kind, valid: true };
  }

  function defaultState() {
    return {
      settings: { rootFolderId: "1VhRIwnuJaNr3ATLyWpqbm2oLxS3_aX5T", memberGroupEmail: "", accessMode: "restricted", savedAt: "2026-09-11T00:00:00+09:00" },
      lessons: seedLessons.map((lesson) => ({ ...lesson })),
      updatedAt: ""
    };
  }

  function readAdminState() {
    try {
      const stored = JSON.parse(localStorage.getItem(ADMIN_KEY) || "null");
      if (!stored || !Array.isArray(stored.lessons)) return defaultState();
      return { ...defaultState(), ...stored, settings: { ...defaultState().settings, ...(stored.settings || {}) } };
    } catch (_) { return defaultState(); }
  }

  function writeAdminState(state) {
    state.updatedAt = new Date().toISOString();
    localStorage.setItem(ADMIN_KEY, JSON.stringify(state));
  }

  function readLearnerState() {
    try { return JSON.parse(localStorage.getItem(LEARNER_KEY) || "{}") || {}; }
    catch (_) { return {}; }
  }

  function writeLearnerState(state) { localStorage.setItem(LEARNER_KEY, JSON.stringify(state)); }
  function drivePreviewUrl(id) { return DRIVE_ID_PATTERN.test(id || "") ? `https://drive.google.com/file/d/${id}/preview` : ""; }

  function buildProgressModel(completedMinutes, goalMinutes) {
    const goal = Math.max(1, Number(goalMinutes) || 60);
    const completed = Math.max(0, Number(completedMinutes) || 0);
    const exceeded = Math.max(0, completed - goal);
    const scaleMax = exceeded > 0 ? Math.max(goal, Math.ceil(completed / 30) * 30) : goal;
    return {
      goal,
      completed,
      exceeded,
      scaleMax,
      achievementPercent: Math.round((completed / goal) * 100),
      goalFillPercent: Math.min(100, (Math.min(completed, goal) / scaleMax) * 100),
      bonusLeftPercent: Math.min(100, (goal / scaleMax) * 100),
      bonusFillPercent: Math.max(0, (exceeded / scaleMax) * 100),
      goalMarkerPercent: Math.min(100, (goal / scaleMax) * 100),
      achieved: completed >= goal,
      overachieved: exceeded > 0
    };
  }

  window.TOTONOE_CURRICULUM_STORE = Object.freeze({ ADMIN_KEY, LEARNER_KEY, seedLessons, parseDriveReference, readAdminState, writeAdminState, readLearnerState, writeLearnerState, drivePreviewUrl, buildProgressModel });
})();
