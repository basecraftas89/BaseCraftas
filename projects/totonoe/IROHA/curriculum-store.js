(() => {
  "use strict";

  const ADMIN_KEY = "totonoe-curriculum-admin-preview-v1";
  const LEARNER_KEY = "totonoe-curriculum-preview-v1";
  let remoteDelivery = null;
  window.TOTONOE_APPLY_DELIVERY = value => { remoteDelivery=value; };
  const DRIVE_ID_PATTERN = /^[A-Za-z0-9_-]{10,}$/;
  const categories = [
    { id: "literacy", label: "AIリテラシー", description: "基礎知識・安全な使い方・判断力", icon: "school" },
    { id: "llm", label: "LLM・対話AI", description: "文章・対話・資料の活用", icon: "chat" },
    { id: "image", label: "画像生成AI", description: "画像制作・編集・活用", icon: "image" },
    { id: "video", label: "動画生成AI", description: "動画制作・編集・活用", icon: "movie" },
    { id: "setup", label: "導入・初期設定", description: "アカウント・環境・運用準備", icon: "settings" },
    { id: "organization", label: "組織導入・提案", description: "提案・営業・定着支援", icon: "groups" },
    { id: "automation", label: "業務自動化", description: "Excel・マクロ・業務の仕組み化", icon: "automation" },
    { id: "other", label: "その他", description: "新しい分野のカリキュラム", icon: "apps" }
  ];
  function badgeVisualForCategory(categoryId) {
    const id = categories.some((item) => item.id === categoryId) ? categoryId : "other";
    return {
      categoryId: id,
      artwork: `assets/badge-scene-${id}.webp`
    };
  }

  function lessonCategoryId(lesson) {
    if (categories.some((item) => item.id === lesson?.categoryId)) return lesson.categoryId;
    if (["ChatGPT", "Claude", "Gemini"].includes(lesson?.tool)) return "llm";
    if (lesson?.tool === "Excel・マクロ") return "automation";
    return "other";
  }

  function lessonCurriculumTitle(lesson) {
    return String(lesson?.curriculumTitle || lesson?.tool || categories.find((item) => item.id === lessonCategoryId(lesson))?.label || "カリキュラム").trim();
  }

  function lessonCurriculumKey(lesson) { return `${lessonCategoryId(lesson)}:${lessonCurriculumTitle(lesson)}`; }

  function lessonVideoOrder(lesson) {
    const name = String(lesson?.videoFileName || "").normalize("NFKC");
    const match = name.match(/^\s*(\d{1,4})(?=[\s._-]|$)/);
    return match ? Number(match[1]) : null;
  }

  function sortLessons(lessons) {
    const collator = new Intl.Collator("ja", { numeric: true });
    return [...lessons].sort((a, b) => {
      if(a.videoProvider==='secure_drive' && b.videoProvider==='secure_drive' && a.sortOrder!==b.sortOrder)return a.sortOrder-b.sortOrder;
      const left = lessonVideoOrder(a);
      const right = lessonVideoOrder(b);
      if (left !== null || right !== null) {
        if (left === null) return 1;
        if (right === null) return -1;
        if (left !== right) return left - right;
      }
      return collator.compare(String(a.code || a.title || ""), String(b.code || b.title || ""));
    });
  }

  function isCompletedLessonProgress(record) {
    return record?.status === "completed" && Boolean(record.playbackCompletedAt);
  }

  function lessonUnlockState(lessons, lessonId, progress = {}) {
    const ordered = sortLessons(lessons);
    const index = ordered.findIndex((item) => item.id === lessonId);
    const firstIncomplete = ordered.find((item) => !isCompletedLessonProgress(progress[item.id])) || null;
    return {
      allowed: index >= 0 && (isCompletedLessonProgress(progress[lessonId]) || ordered.slice(0, index).every((item) => isCompletedLessonProgress(progress[item.id]))),
      firstIncomplete
    };
  }

  const seedLessons = [
    { id: "gpt-bas-01", code: "GPT-BAS-01", categoryId: "llm", curriculumTitle: "ChatGPT", tool: "ChatGPT", level: "基礎", module: "基本操作と安全", title: "ChatGPTとは何か", estimatedMinutes: 12, accessTier: "curriculum_all_access", folderStage: "working", workflowStatus: "draft", videoProvider: "google_drive", providerAssetId: "", transcriptAssetId: "", worksheetAssetId: "" },
    { id: "cla-bas-01", code: "CLA-BAS-01", categoryId: "llm", curriculumTitle: "Claude", tool: "Claude", level: "基礎", module: "長文を扱う基本", title: "長い資料を整理する", estimatedMinutes: 14, accessTier: "curriculum_all_access", folderStage: "working", workflowStatus: "draft", videoProvider: "google_drive", providerAssetId: "", transcriptAssetId: "", worksheetAssetId: "" },
    { id: "gem-bas-01", code: "GEM-BAS-01", categoryId: "llm", curriculumTitle: "Gemini", tool: "Gemini", level: "基礎", module: "Google連携の基本", title: "情報整理の入口", estimatedMinutes: 11, accessTier: "curriculum_all_access", folderStage: "working", workflowStatus: "draft", videoProvider: "google_drive", providerAssetId: "", transcriptAssetId: "", worksheetAssetId: "" }
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
    if(remoteDelivery)return {...defaultState(),lessons:remoteDelivery.lessons || []};
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
    if(remoteDelivery) {
      let preferences={};
      try {preferences=JSON.parse(localStorage.getItem(LEARNER_KEY+':'+remoteDelivery.owner?.id)||'{}')||{};}catch(_){}
      return {...preferences,lessonProgress:remoteDelivery.progress||{},lessonDrafts:{}};
    }
    try { return JSON.parse(localStorage.getItem(LEARNER_KEY) || "{}") || {}; }
    catch (_) { return {}; }
  }

  function writeLearnerState(state) {
    if(remoteDelivery) {const {lessonProgress,lessonDrafts,...preferences}=state;localStorage.setItem(LEARNER_KEY+':'+remoteDelivery.owner?.id,JSON.stringify(preferences));return;}
    localStorage.setItem(LEARNER_KEY, JSON.stringify(state));
  }
  function drivePreviewUrl(id) { return DRIVE_ID_PATTERN.test(id || "") ? `https://drive.google.com/file/d/${id}/preview` : ""; }
  function isPublishedLesson(lesson) { return lesson?.workflowStatus === "published" && ["delivery", "free_preview"].includes(lesson.folderStage) && (Boolean(drivePreviewUrl(lesson.providerAssetId)) || (lesson.videoProvider==='secure_drive' && /^\/api\/totonoe-member\/api\/curriculum\/media\/[A-Za-z0-9_-]+$/.test(lesson.playbackUrl || ''))); }

  function buildAchievementModel(adminState, learnerState) {
    const lessons = Array.isArray(adminState?.lessons) ? adminState.lessons : [];
    const progress = learnerState?.lessonProgress || {};
    const eligible = lessons.filter(isPublishedLesson);
    const badges = Object.entries(progress).filter(([, record]) => isCompletedLessonProgress(record) && record.badgeEligible === true).map(([id, record]) => {
      const lesson = lessons.find((item) => item.id === id);
      const category = categories.find((item) => item.id === lessonCategoryId(lesson));
      return { id, title: record.title || lesson?.title || "修了したレッスン", tool: record.tool || lesson?.tool || category?.label || "IROHA", categoryId: lesson ? lessonCategoryId(lesson) : record.categoryId || "other", completedAt: record.completedAt || "" };
    }).sort((a, b) => b.completedAt.localeCompare(a.completedAt));
    const certificates = {};
    const storedCertificates = learnerState?.certificates || {};
    for (const key of [...new Set(eligible.map(lessonCurriculumKey))]) {
      const group = eligible.filter((lesson) => lessonCurriculumKey(lesson) === key);
      if (!group.every((lesson) => badges.some((badge) => badge.id === lesson.id))) continue;
      const legacy = storedCertificates[group[0].tool];
      const previous = storedCertificates[key] || (legacy && legacy.lessonIds?.length === group.length && group.every((lesson) => legacy.lessonIds.includes(lesson.id)) ? legacy : null);
      certificates[key] = { key, title: lessonCurriculumTitle(group[0]), tool: group[0].tool || "", issuedAt: previous?.issuedAt || new Date().toISOString(), lessonIds: group.map((lesson) => lesson.id) };
    }
    return { badges, certificates: Object.values(certificates).filter((item) => item && item.tool && item.issuedAt), certificateState: certificates };
  }

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

  window.TOTONOE_CURRICULUM_STORE = Object.freeze({ ADMIN_KEY, LEARNER_KEY, categories, badgeVisualForCategory, seedLessons, lessonCategoryId, lessonCurriculumTitle, lessonCurriculumKey, lessonVideoOrder, sortLessons, isCompletedLessonProgress, lessonUnlockState, isPublishedLesson, parseDriveReference, readAdminState, writeAdminState, readLearnerState, writeLearnerState, drivePreviewUrl, buildProgressModel, buildAchievementModel });
})();
