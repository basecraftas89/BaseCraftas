(() => {
  "use strict";

  const store = window.TOTONOE_CURRICULUM_STORE;
  if (!store) return;
  let state = store.readAdminState();
  let blueprint = { folders: [] };

  const settingsForm = document.querySelector("#driveSettingsForm");
  const lessonForm = document.querySelector("#lessonForm");
  const settingsError = document.querySelector("#settingsError");
  const lessonError = document.querySelector("#lessonError");
  const preview = document.querySelector("#videoPreview");
  const toast = document.querySelector("#toast");

  const labels = {
    draft: "下書き", review: "レビュー待ち", published: "公開", archived: "アーカイブ",
    working: "制作・確認中", delivery: "配信中", free_preview: "無料体験", previous: "差し替え前", trash: "削除予定"
  };

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("is-visible");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove("is-visible"), 2500);
  }

  function safeText(value) { return String(value || ""); }
  function make(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function renderSettings() {
    settingsForm.elements.rootFolder.value = state.settings.rootFolderId || "";
    settingsForm.elements.memberGroupEmail.value = state.settings.memberGroupEmail || "";
    settingsForm.elements.accessMode.value = "restricted";
    const status = document.querySelector("#driveConnectionStatus");
    status.textContent = state.settings.rootFolderId ? "起点登録済み" : "未設定";
    status.classList.toggle("is-pending", !state.settings.rootFolderId);
    status.classList.toggle("is-ready", Boolean(state.settings.rootFolderId));
  }

  function renderBlueprint() {
    const root = document.querySelector("#folderBlueprint");
    root.replaceChildren();
    blueprint.folders.filter((folder) => !folder.parentKey).forEach((folder) => {
      const item = make("div", "folder-item");
      item.append(make("strong", "", `folder ${folder.name}`), make("small", "", folder.purpose));
      const nested = blueprint.folders.filter((child) => child.parentKey === folder.key);
      const childNames = nested.length ? nested.map((child) => child.name) : folder.children || [];
      if (childNames.length) {
        const children = make("div", "folder-children");
        childNames.forEach((name) => children.append(make("span", "", name)));
        item.append(children);
      }
      root.append(item);
    });
  }

  function renderFilterOptions() {
    const categoryFilter = document.querySelector("#categoryFilter");
    const toolFilter = document.querySelector("#toolFilter");
    const selectedCategory = categoryFilter.value;
    const selectedTool = toolFilter.value;
    categoryFilter.replaceChildren(new Option("すべての分野", ""));
    store.categories.forEach((category) => categoryFilter.add(new Option(category.label, category.id)));
    toolFilter.replaceChildren(new Option("すべてのツール", ""));
    [...new Set(state.lessons.map((lesson) => lesson.tool).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ja")).forEach((tool) => toolFilter.add(new Option(tool, tool)));
    categoryFilter.value = selectedCategory;
    toolFilter.value = selectedTool;
  }

  function currentFilters() {
    return { category: document.querySelector("#categoryFilter").value, tool: document.querySelector("#toolFilter").value, status: document.querySelector("#statusFilter").value };
  }

  function renderLessons() {
    const root = document.querySelector("#lessonList");
    const filters = currentFilters();
    const lessons = store.sortLessons(state.lessons.filter((lesson) => (!filters.category || store.lessonCategoryId(lesson) === filters.category) && (!filters.tool || lesson.tool === filters.tool) && (!filters.status || lesson.workflowStatus === filters.status)));
    document.querySelector("#lessonCount").textContent = `${lessons.length}件`;
    root.replaceChildren();
    if (!lessons.length) { root.append(make("p", "empty-admin", "該当する教材はありません。")); return; }
    lessons.forEach((lesson) => {
      const row = make("article", "lesson-row");
      const copy = make("div");
      const meta = make("div", "lesson-row-meta");
      const category = store.categories.find((item) => item.id === store.lessonCategoryId(lesson));
      [category?.label, store.lessonCurriculumTitle(lesson), lesson.tool, lesson.level, store.lessonVideoOrder(lesson) !== null ? `順番 ${store.lessonVideoOrder(lesson)}` : "順番未設定", labels[lesson.workflowStatus] || lesson.workflowStatus, lesson.providerAssetId ? "Drive登録済み" : "Drive未登録"].filter(Boolean).forEach((value) => meta.append(make("span", "", value)));
      copy.append(meta, make("h3", "", `${lesson.code}｜${lesson.title}`), make("p", "", `${lesson.module}・約${lesson.estimatedMinutes}分・${labels[lesson.folderStage] || lesson.folderStage}`));
      const actions = make("div", "lesson-row-actions");
      const link = make("a", "", "受講表示");
      link.href = `lesson.html?id=${encodeURIComponent(lesson.id)}`;
      const remove = make("button", "", "削除");
      remove.type = "button";
      remove.addEventListener("click", () => {
        if (!window.confirm(`「${lesson.title}」をローカル台帳から削除しますか？\nGoogle Drive上のファイルは削除されません。`)) return;
        state.lessons = state.lessons.filter((item) => item.id !== lesson.id);
        store.writeAdminState(state);
        renderFilterOptions();
        renderLessons();
        showToast("台帳から削除しました（Driveファイルは残っています）");
      });
      actions.append(link, remove);
      row.append(copy, actions);
      root.append(row);
    });
  }

  function getFileId(fieldName, required = false) {
    const raw = lessonForm.elements[fieldName].value;
    if (!raw && !required) return "";
    const parsed = store.parseDriveReference(raw, "file");
    if (!parsed.valid || (required && !parsed.id)) throw new Error(parsed.error || "動画ファイルを指定してください。");
    return parsed.id;
  }

  function showVideoPreview() {
    lessonError.textContent = "";
    try {
      const id = getFileId("videoUrl", true);
      const iframe = document.createElement("iframe");
      iframe.src = store.drivePreviewUrl(id);
      iframe.title = "Google Drive動画プレビュー";
      iframe.allow = "autoplay; fullscreen";
      iframe.referrerPolicy = "strict-origin-when-cross-origin";
      preview.replaceChildren(iframe);
      preview.hidden = false;
    } catch (error) { preview.hidden = true; lessonError.textContent = error.message; }
  }

  settingsForm.addEventListener("submit", (event) => {
    event.preventDefault();
    settingsError.textContent = "";
    const parsed = store.parseDriveReference(settingsForm.elements.rootFolder.value, "folder");
    if (!parsed.valid || !parsed.id) { settingsError.textContent = parsed.error || "ルートフォルダを入力してください。"; return; }
    state.settings = { rootFolderId: parsed.id, memberGroupEmail: settingsForm.elements.memberGroupEmail.value.trim(), accessMode: "restricted", savedAt: new Date().toISOString() };
    store.writeAdminState(state);
    renderSettings();
    showToast("Driveの起点をこの端末に保存しました");
  });

  lessonForm.elements.videoUrl.addEventListener("input", () => {
    const parsed = store.parseDriveReference(lessonForm.elements.videoUrl.value, "file");
    const help = document.querySelector("#videoIdHelp");
    help.textContent = parsed.valid && parsed.id ? `読み取ったファイルID：${parsed.id}` : (parsed.error || "URLからファイルIDだけを保存します。");
  });
  document.querySelector("[data-preview-video]").addEventListener("click", showVideoPreview);

  lessonForm.addEventListener("submit", (event) => {
    event.preventDefault();
    lessonError.textContent = "";
    try {
      const workflowStatus = lessonForm.elements.workflowStatus.value;
      const folderStage = lessonForm.elements.folderStage.value;
      if (workflowStatus === "published" && !["delivery", "free_preview"].includes(folderStage)) throw new Error("公開する場合は配信段階を「公開対象」または「無料体験対象」にしてください。");
      const providerAssetId = getFileId("videoUrl", workflowStatus === "published");
      const transcriptAssetId = getFileId("transcriptUrl");
      const worksheetAssetId = getFileId("worksheetUrl");
      if (workflowStatus === "published" && (!lessonForm.elements.rightsChecked.checked || !lessonForm.elements.permissionChecked.checked)) {
        throw new Error("公開する場合は、公開権利と会員権限の2項目を確認してください。");
      }
      const code = lessonForm.elements.code.value.trim().toUpperCase();
      const id = code.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `lesson-${Date.now()}`;
      const categoryId = lessonForm.elements.categoryId.value;
      const curriculumTitle = lessonForm.elements.curriculumTitle.value.trim();
      const videoFileName = lessonForm.elements.videoFileName.value.trim();
      if (!store.categories.some((item) => item.id === categoryId) || !curriculumTitle) throw new Error("分野とカリキュラム名を入力してください。");
      if (workflowStatus === "published" && store.lessonVideoOrder({ videoFileName }) === null) throw new Error("公開する動画は、Driveのファイル名を01_のような番号から始めてください。");
      const lesson = {
        id, code, categoryId, curriculumTitle, tool: lessonForm.elements.tool.value.trim(), level: lessonForm.elements.level.value,
        module: lessonForm.elements.module.value.trim(), title: lessonForm.elements.title.value.trim(),
        estimatedMinutes: Number(lessonForm.elements.estimatedMinutes.value), accessTier: lessonForm.elements.accessTier.value,
        folderStage, workflowStatus, videoProvider: "google_drive",
        providerAssetId, videoFileName, transcriptAssetId, worksheetAssetId, updatedAt: new Date().toISOString()
      };
      if (workflowStatus === "published" && state.lessons.some((item) => item.id !== id && item.workflowStatus === "published" && store.lessonCurriculumKey(item) === store.lessonCurriculumKey(lesson) && store.lessonVideoOrder(item) === store.lessonVideoOrder(lesson))) {
        throw new Error("同じカリキュラム内で動画番号が重複しています。Driveのファイル名を確認してください。");
      }
      const existingIndex = state.lessons.findIndex((item) => item.id === id || item.code === code);
      if (existingIndex >= 0) state.lessons[existingIndex] = { ...state.lessons[existingIndex], ...lesson };
      else state.lessons.unshift(lesson);
      store.writeAdminState(state);
      renderFilterOptions();
      renderLessons();
      lessonForm.reset();
      preview.hidden = true;
      showToast(workflowStatus === "published" ? "公開教材として台帳に保存しました" : "教材を台帳に保存しました");
    } catch (error) { lessonError.textContent = error.message; }
  });

  document.querySelectorAll("#categoryFilter, #toolFilter, #statusFilter").forEach((field) => field.addEventListener("change", renderLessons));

  lessonForm.elements.categoryId.add(new Option("分野を選択", ""));
  store.categories.forEach((category) => lessonForm.elements.categoryId.add(new Option(category.label, category.id)));

  fetch("drive-folder-blueprint.json")
    .then((response) => { if (!response.ok) throw new Error("blueprint unavailable"); return response.json(); })
    .then((data) => { blueprint = data; renderBlueprint(); })
    .catch(() => { blueprint = { folders: [] }; document.querySelector("#folderBlueprint").textContent = "フォルダ定義を読み込めませんでした。HTTPプレビューで確認してください。"; });
  renderSettings();
  renderFilterOptions();
  renderLessons();
})();
