import { createProjectDocument, touch } from "./models/project.js";
import { createStreamerProfile } from "./models/schedule.js";
import { defaultStyle } from "./models/templates.js";
import { SchedulePanel } from "./ui/schedulePanel.js";
import { StylePanel } from "./ui/stylePanel.js";
import { PreviewCanvas } from "./ui/previewCanvas.js";
import { buildExportBar } from "./ui/exportBar.js";
import { buildProjectZipBytes, loadProjectFromZipBytes } from "./project/projectFile.js";
import { loadAutosave, saveAutosave } from "./project/autosave.js";
import { PROJECT_FILE_EXTENSION, DEFAULT_DISPLAY_MODE, DEFAULT_PREVIEW_FPS } from "../shared/constants.js";
import { DEFAULT_APP_THEME_ID, applyAppTheme } from "./ui/appThemes.js";
import { SoftwareSettings } from "./ui/softwareSettings.js";
import { LayoutEditor } from "./ui/layoutEditor.js";
import { UpdateNotice } from "./ui/updateNotice.js";

const document_ = createProjectDocument({
  profile: createStreamerProfile({ displayName: "Your Streamer Name", days: [] }),
  style: defaultStyle(),
});
let currentProjectPath = null;
let currentAppTheme = DEFAULT_APP_THEME_ID;
let currentDisplayMode = DEFAULT_DISPLAY_MODE;
let currentPreviewFps = DEFAULT_PREVIEW_FPS;
applyAppTheme(currentAppTheme);

function debounce(fn, ms) {
  let handle = null;
  return (...args) => {
    if (handle) clearTimeout(handle);
    handle = setTimeout(() => fn(...args), ms);
  };
}

const scheduleAutosave = debounce(() => {
  saveAutosave(document_, currentAppTheme, currentDisplayMode, currentPreviewFps).catch((err) =>
    console.error("Autosave failed:", err)
  );
}, 800);

const statusBarEl = document.getElementById("statusBar");
function setStatus(text, state) {
  statusBarEl.textContent = text;
  statusBarEl.className = state || "";
}

const previewCanvas = new PreviewCanvas(document.getElementById("previewCanvas"), currentPreviewFps);

function refreshPreview(immediate) {
  if (immediate) previewCanvas.setDataImmediate(document_.profile, document_.style);
  else previewCanvas.setData(document_.profile, document_.style);
}

const sidePanelEl = document.getElementById("sidePanel");
const schedulePanel = new SchedulePanel(sidePanelEl, () => {
  document_.profile = schedulePanel.toProfile();
  touch(document_);
  refreshPreview();
  scheduleAutosave();
});
schedulePanel.loadProfile(document_.profile);

const layoutEditor = new LayoutEditor(document.getElementById("layoutEditorOverlay"), {
  getBaseStyle: () => document_.style,
});
// Refreshing stylePanel after the topBar-opened editor closes (whether via
// Apply, a plain Close, or after only clicking "Save to Library" inside the
// editor) is what makes anything saved/imported through these two buttons
// actually show up as a pickable option in the Template Customize tab's
// Layout Style dropdown afterward — without this, the dropdown would only
// reflect the library as it was when that tab was last rebuilt.
document.getElementById("layoutEditorBtn").addEventListener("click", () => layoutEditor.openStandalone(() => stylePanel.refreshAll()));
document.getElementById("layoutImportBtn").addEventListener("click", () => layoutEditor.importAndOpen(() => stylePanel.refreshAll()));

const stylePanelEl = document.getElementById("stylePanel");
const stylePanel = new StylePanel(stylePanelEl, {
  getStyle: () => document_.style,
  onStyleApplied: (newStyle) => {
    document_.style = newStyle;
    touch(document_);
    refreshPreview(true);
    scheduleAutosave();
  },
  onStyleChange: () => {
    touch(document_);
    refreshPreview(true);
    scheduleAutosave();
  },
  openLayoutEditor: (opts) => layoutEditor.open(opts),
});

buildExportBar(document.getElementById("exportBar"), setStatus, {
  getProfile: () => document_.profile,
  getStyle: () => document_.style,
});

const softwareSettings = new SoftwareSettings(document.getElementById("settingsOverlay"), {
  getAppThemeId: () => currentAppTheme,
  onAppThemeChange: (themeId) => {
    currentAppTheme = themeId;
    scheduleAutosave();
  },
  getDisplayMode: () => currentDisplayMode,
  onDisplayModeChange: (mode) => {
    currentDisplayMode = mode;
    window.streamplanAPI.setDisplayMode(mode);
    scheduleAutosave();
  },
  getPreviewFps: () => currentPreviewFps,
  onPreviewFpsChange: (fps) => {
    currentPreviewFps = fps;
    previewCanvas.setFps(fps);
    scheduleAutosave();
  },
});
document.getElementById("settingsBtn").addEventListener("click", () => softwareSettings.open());

const updateNotice = new UpdateNotice(document.getElementById("updateNoticeOverlay"));
window.streamplanAPI.onUpdateStatus((payload) => {
  if (payload.status === "downloaded") {
    updateNotice.show({ version: payload.version, releaseNotes: payload.releaseNotes });
  }
});

// Minimizing the window is the main lever we have to cut the app's own
// resource draw to near-zero: the animated app themes keep repainting their
// gradients continuously, and the live preview can be re-rendering up to
// 180x/sec. Neither is doing anything useful while nothing is visible.
window.streamplanAPI.onMinimizedStateChange((minimized) => {
  if (minimized) {
    document.body.setAttribute("data-app-minimized", "1");
    previewCanvas.pause();
  } else {
    document.body.removeAttribute("data-app-minimized");
    previewCanvas.resume();
  }
});

function sanitizeFilename(name) {
  const cleaned = (name || "").trim().replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, "_");
  return cleaned || "streamplan";
}

function loadDocumentIntoUi() {
  schedulePanel.loadProfile(document_.profile);
  stylePanel.refreshAll();
  refreshPreview();
}

function newProject() {
  document_.profile = createStreamerProfile({ displayName: "Your Streamer Name", days: [] });
  document_.style = defaultStyle();
  document_.createdAt = new Date().toISOString();
  touch(document_);
  currentProjectPath = null;
  loadDocumentIntoUi();
  setStatus("New project started.");
  scheduleAutosave();
}

async function saveProject(forcePrompt) {
  let targetPath = currentProjectPath;
  if (forcePrompt || !targetPath) {
    const defaultName = `${sanitizeFilename(document_.profile.displayName)}${PROJECT_FILE_EXTENSION}`;
    targetPath = await window.streamplanAPI.chooseSaveProjectPath(defaultName);
    if (!targetPath) return;
  }
  setStatus("Saving project…");
  try {
    const bytes = await buildProjectZipBytes(document_);
    await window.streamplanAPI.writeFile(targetPath, bytes);
    currentProjectPath = targetPath;
    setStatus(`Project saved to ${targetPath}`, "success");
  } catch (err) {
    console.error(err);
    setStatus(`Could not save project: ${err.message}`, "error");
  }
}

async function openProject() {
  const targetPath = await window.streamplanAPI.chooseOpenProjectPath();
  if (!targetPath) return;
  setStatus("Opening project…");
  try {
    const bytes = await window.streamplanAPI.readFile(targetPath);
    const loadedDoc = await loadProjectFromZipBytes(bytes);
    document_.profile = loadedDoc.profile;
    document_.style = loadedDoc.style;
    document_.appVersion = loadedDoc.appVersion;
    document_.createdAt = loadedDoc.createdAt;
    document_.modifiedAt = loadedDoc.modifiedAt;
    currentProjectPath = targetPath;
    loadDocumentIntoUi();
    setStatus(`Project loaded from ${targetPath}`, "success");
    scheduleAutosave();
  } catch (err) {
    console.error(err);
    setStatus(`Could not open project: ${err.message}`, "error");
  }
}

document.getElementById("newProjectBtn").addEventListener("click", () => newProject());
document.getElementById("openProjectBtn").addEventListener("click", () => openProject());
document.getElementById("saveProjectBtn").addEventListener("click", () => saveProject(false));
document.getElementById("saveAsProjectBtn").addEventListener("click", () => saveProject(true));

window.addEventListener("keydown", (e) => {
  if (!(e.ctrlKey || e.metaKey)) return;
  const key = e.key.toLowerCase();
  if (key === "n") {
    e.preventDefault();
    newProject();
  } else if (key === "o") {
    e.preventDefault();
    openProject();
  } else if (key === "s") {
    e.preventDefault();
    saveProject(e.shiftKey);
  }
});

refreshPreview();

(async function restoreFromAutosave() {
  try {
    const restored = await loadAutosave();
    if (!restored) return;
    document_.profile = restored.doc.profile;
    document_.style = restored.doc.style;
    document_.appVersion = restored.doc.appVersion;
    document_.createdAt = restored.doc.createdAt;
    document_.modifiedAt = restored.doc.modifiedAt;
    if (restored.appTheme) {
      currentAppTheme = applyAppTheme(restored.appTheme);
    }
    if (restored.displayMode) {
      currentDisplayMode = restored.displayMode; // main process already applied this at launch
    }
    if (restored.previewFps) {
      currentPreviewFps = restored.previewFps;
      previewCanvas.setFps(currentPreviewFps);
    }
    loadDocumentIntoUi();
    setStatus("Restored your last session.");
  } catch (err) {
    console.error("Could not restore autosave:", err);
  }
})();

window.__streamplanDoc = document_;
window.__streamplanPanels = { schedulePanel, stylePanel, previewCanvas, layoutEditor };
window.__streamplanProject = { newProject, saveProject, openProject };
window.__streamplanSettings = { softwareSettings, updateNotice, getAppTheme: () => currentAppTheme };
