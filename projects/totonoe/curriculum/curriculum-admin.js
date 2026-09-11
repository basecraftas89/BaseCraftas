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
    blueprint.folders.forEach((folder) => {
      const item = make("div", "folder-item");
      item.append(make("strong", "", `folder ${folder.name}`), make("small", "", folder.purpose));
      if (folder.children?.length) {
        const children = make("div", "folder-children");
        folder.children.forEach((name) => children.append(make("span", "", name)));
        item.append(children);
      }
      root.append(item);
    });
  }

  function currentFilters() {
    return { tool: document.querySelector("#toolFilter").value, status: document.querySelector("#statusFilter").value };
  }

  function renderLessons() {
    const root = document.querySelector("#lessonList");
    const filters = currentFilters();
    const lessons = state.lessons.filter((lesson) => (!filters.tool || lesson.tool === filters.tool) && (!filters.status || lesson.workflowStatus === filters.status));
    document.querySelector("#lessonCount").textContent = `${lessons.length}件`;
    root.replaceChildren();
    if (!lessons.length) { root.append(make("p", "empty-admin", "該当する教材はありません。")); return; }
    lessons.forEach((lesson) => {
      const row = make("article", "lesson-row");
      const copy = make("div");
      const meta = make("div", "lesson-row-meta");
      [lesson.tool, lesson.level, labels[lesson.workflowStatus] || lesson.workflowStatus, lesson.providerAssetId ? "Drive登録済み" : "Drive未登録"].forEach((value) => meta.append(make("span", "", value)));
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
      const providerAssetId = getFileId("videoUrl", workflowStatus === "published");
      const transcriptAssetId = getFileId("transcriptUrl");
      const worksheetAssetId = getFileId("worksheetUrl");
      if (workflowStatus === "published" && (!lessonForm.elements.rightsChecked.checked || !lessonForm.elements.permissionChecked.checked)) {
        throw new Error("公開する場合は、公開権利と会員権限の2項目を確認してください。");
      }
      const code = lessonForm.elements.code.value.trim().toUpperCase();
      const id = code.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `lesson-${Date.now()}`;
      const lesson = {
        id, code, tool: lessonForm.elements.tool.value, level: lessonForm.elements.level.value,
        module: lessonForm.elements.module.value.trim(), title: lessonForm.elements.title.value.trim(),
        estimatedMinutes: Number(lessonForm.elements.estimatedMinutes.value), accessTier: lessonForm.elements.accessTier.value,
        folderStage: lessonForm.elements.folderStage.value, workflowStatus, videoProvider: "google_drive",
        providerAssetId, transcriptAssetId, worksheetAssetId, updatedAt: new Date().toISOString()
      };
      const existingIndex = state.lessons.findIndex((item) => item.id === id || item.code === code);
      if (existingIndex >= 0) state.lessons[existingIndex] = { ...state.lessons[existingIndex], ...lesson };
      else state.lessons.unshift(lesson);
      store.writeAdminState(state);
      renderLessons();
      lessonForm.reset();
      preview.hidden = true;
      showToast(workflowStatus === "published" ? "公開教材として台帳に保存しました" : "教材を台帳に保存しました");
    } catch (error) { lessonError.textContent = error.message; }
  });

  document.querySelectorAll("#toolFilter, #statusFilter").forEach((field) => field.addEventListener("change", renderLessons));

  fetch("drive-folder-blueprint.json")
    .then((response) => { if (!response.ok) throw new Error("blueprint unavailable"); return response.json(); })
    .then((data) => { blueprint = data; renderBlueprint(); })
    .catch(() => { blueprint = { folders: [] }; document.querySelector("#folderBlueprint").textContent = "フォルダ定義を読み込めませんでした。HTTPプレビューで確認してください。"; });
  renderSettings();
  renderLessons();
})();
