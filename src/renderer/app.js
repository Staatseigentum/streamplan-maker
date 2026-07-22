import { createProjectDocument, touch } from "./models/project.js";
import { createStreamerProfile } from "./models/schedule.js";
import { defaultStyle } from "./models/templates.js";
import { cloneStyle, styleFromDict } from "./models/style.js";
import { addCustomTemplate } from "./models/customTemplateLibrary.js";
import { addCustomLayout } from "./models/customLayoutLibrary.js";
import { SchedulePanel } from "./ui/schedulePanel.js";
import { StylePanel } from "./ui/stylePanel.js";
import { PreviewCanvas } from "./ui/previewCanvas.js";
import { buildExportBar } from "./ui/exportBar.js";
import { buildProjectZipBytes, loadProjectFromZipBytes } from "./project/projectFile.js";
import { loadAutosave, loadAutosaveLanguage, saveAutosave } from "./project/autosave.js";
import { PROJECT_FILE_EXTENSION, DEFAULT_DISPLAY_MODE, DEFAULT_PREVIEW_FPS } from "../shared/constants.js";
import { DEFAULT_APP_THEME_ID, applyAppTheme } from "./ui/appThemes.js";
import { SoftwareSettings } from "./ui/softwareSettings.js";
import { LayoutEditor } from "./ui/layoutEditor.js";
import { TemplateStudio } from "./ui/templateStudio.js";
import { UpdateNotice } from "./ui/updateNotice.js";
import { OnboardingTour } from "./ui/onboardingTour.js";
import { DEFAULT_LANGUAGE, setLanguage, t } from "./i18n/index.js";

// A top-level await here delays every synchronous UI-building statement
// below until the stored language is known, so the very first render is
// already in the right language instead of flashing English and reloading.
let currentLanguage = (await loadAutosaveLanguage().catch(() => null)) || DEFAULT_LANGUAGE;
setLanguage(currentLanguage);
applyStaticTranslations();

function applyStaticTranslations() {
  const setTitle = (id, key) => {
    const el = document.getElementById(id);
    if (el) el.title = t(key);
  };
  const setText = (id, key) => {
    const el = document.getElementById(id);
    if (el) el.textContent = t(key);
  };
  setTitle("newProjectBtn", "topBar.newTooltip");
  setText("newProjectBtn", "common.new");
  setTitle("openProjectBtn", "topBar.openTooltip");
  setText("openProjectBtn", "common.open");
  setTitle("saveProjectBtn", "topBar.saveTooltip");
  setText("saveProjectBtn", "common.save");
  setTitle("saveAsProjectBtn", "topBar.saveAsTooltip");
  setText("saveAsProjectBtn", "common.saveAs");
  setText("appSubtitle", "topBar.subtitle");
  setTitle("layoutEditorBtn", "topBar.layoutEditorTooltip");
  setText("layoutEditorBtn", "topBar.layoutEditorBtn");
  setTitle("layoutImportBtn", "topBar.importLayoutTooltip");
  setText("layoutImportBtn", "topBar.importLayoutBtn");
  setTitle("settingsBtn", "topBar.settingsTooltip");
  setText("settingsBtn", "topBar.settingsBtn");
  setTitle("helpTourBtn", "topBar.helpTooltip");
  setText("helpTourBtn", "topBar.helpBtn");
}

const document_ = createProjectDocument({
  profile: createStreamerProfile({ displayName: "Your Streamer Name", days: [] }),
  style: defaultStyle(),
});
let currentProjectPath = null;
let currentAppTheme = DEFAULT_APP_THEME_ID;
let currentDisplayMode = DEFAULT_DISPLAY_MODE;
let currentPreviewFps = DEFAULT_PREVIEW_FPS;
let currentTutorialSeen = false;
applyAppTheme(currentAppTheme);

function debounce(fn, ms) {
  let handle = null;
  return (...args) => {
    if (handle) clearTimeout(handle);
    handle = setTimeout(() => fn(...args), ms);
  };
}

const scheduleAutosave = debounce(() => {
  saveAutosave(document_, currentAppTheme, currentDisplayMode, currentPreviewFps, currentLanguage, currentTutorialSeen).catch(
    (err) => console.error("Autosave failed:", err)
  );
}, 800);

const statusBarEl = document.getElementById("statusBar");
function setStatus(text, state) {
  statusBarEl.textContent = text;
  statusBarEl.className = state || "";
}

const previewCanvas = new PreviewCanvas(document.getElementById("previewCanvas"), currentPreviewFps, {
  onStickerDrag: () => {
    touch(document_);
    refreshPreview(true);
    stylePanel.refreshFields();
    scheduleAutosave();
  },
});

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

const templateStudio = new TemplateStudio(document.getElementById("templateStudioOverlay"), {
  onApplyToProject: (newStyle) => {
    document_.style = newStyle;
    touch(document_);
    refreshPreview(true);
    scheduleAutosave();
  },
});

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
  openTemplateStudio: (opts) => templateStudio.open({ ...opts, onClose: () => stylePanel.refreshAll() }),
});

// Handles the streamplan-maker://import?type=...&url=...&name=... link that
// the companion website's download button opens: main.js has already parsed
// and validated the URL (see main.js's parseImportPayload) before pushing
// this event, so `type`/`url` are trustworthy here — but the fetched file
// content itself still goes through the same validation as a normal local
// file import, since it's untrusted network data either way.
async function handleImportRequest({ type, url, name }) {
  setStatus(t("status.importingFromWeb"));
  let parsed;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    parsed = JSON.parse(await response.text());
    if (type === "template") {
      if (!parsed || !parsed.style) throw new Error(t("style.invalidTemplateFile"));
    } else if (!parsed || !parsed.elements) {
      throw new Error(t("layoutEditor.invalidLayoutFile"));
    }
  } catch (err) {
    console.error(err);
    const failMessage =
      type === "layout"
        ? t("layoutEditor.importLayoutFailed", { message: err.message })
        : t("style.importTemplateFailed", { message: err.message });
    await window.streamplanAPI.showMessage("error", t("common.importFailedTitle"), failMessage);
    return;
  }

  // A deep-link can arrive while some other overlay is already open (e.g.
  // Settings, or the other one of these two) — close both first so the
  // target overlay doesn't end up stacked underneath/behind a stale one.
  templateStudio.close();
  layoutEditor.close();
  softwareSettings.close();

  const importedName = name || parsed.name || (type === "template" ? "Imported Template" : "Imported Layout");
  if (type === "template") {
    const importedStyle = styleFromDict(parsed.style);
    importedStyle.layoutLocked = true;
    const entry = addCustomTemplate({ name: importedName, style: importedStyle });
    entry.style.templateId = entry.id;
    templateStudio.open({ style: cloneStyle(entry.style), onClose: () => stylePanel.refreshAll() });
  } else {
    const entry = addCustomLayout({ name: importedName, elements: parsed.elements });
    layoutEditor.openLibraryEntry(entry, () => stylePanel.refreshAll());
  }

  scheduleAutosave();
  setStatus(t("status.importedFromWeb", { name: importedName }), "success");
}

window.streamplanAPI.onImportRequest(handleImportRequest);

buildExportBar(document.getElementById("exportBar"), setStatus, {
  getProfile: () => document_.profile,
  getStyle: () => document_.style,
});

const softwareSettings = new SoftwareSettings(document.getElementById("settingsOverlay"), document.getElementById("languageConfirmOverlay"), {
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
  getLanguage: () => currentLanguage,
  onLanguageChange: async (lang) => {
    // Shown immediately, before the async save below — otherwise the gap
    // between picking a language and the eventual reload (plus the reload's
    // own blank instant) looks like the app froze rather than just
    // switching language. The start timestamp is stashed in sessionStorage
    // (survives the reload, unlike any in-memory JS state) so the fresh
    // page load — see the classic <script> right after the overlay div in
    // index.html, which runs before app.js's module graph even starts
    // resolving — can keep the SAME overlay open across the reload instead
    // of it flashing closed and then the real UI popping in mid-build.
    // restoreFromAutosave() below is what actually clears it again, once
    // the freshly-reloaded app has finished rebuilding its UI.
    document.getElementById("languageSwitchOverlay").classList.add("open");
    sessionStorage.setItem("streamplanLangSwitchStart", String(Date.now()));
    currentLanguage = lang;
    setLanguage(lang);
    // Text is already built throughout the app as one-time textContent
    // assignments (no reactive re-render layer) — reloading is far simpler
    // and safer than trying to make ~300 call sites reactive, and it's a
    // deliberate, user-initiated settings change, not a routine action.
    await saveAutosave(document_, currentAppTheme, currentDisplayMode, currentPreviewFps, currentLanguage, currentTutorialSeen);
    window.location.reload();
  },
});
document.getElementById("settingsBtn").addEventListener("click", () => softwareSettings.open());

const onboardingTour = new OnboardingTour(
  document.getElementById("onboardingPromptOverlay"),
  document.getElementById("onboardingTourOverlay"),
  {
    onComplete: () => {
      currentTutorialSeen = true;
      scheduleAutosave();
    },
    stylePanel,
    layoutEditor,
    templateStudio,
    softwareSettings,
  }
);
document.getElementById("helpTourBtn").addEventListener("click", () => onboardingTour.replay());

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
  setStatus(t("status.newProject"));
  scheduleAutosave();
}

async function saveProject(forcePrompt) {
  let targetPath = currentProjectPath;
  if (forcePrompt || !targetPath) {
    const defaultName = `${sanitizeFilename(document_.profile.displayName)}${PROJECT_FILE_EXTENSION}`;
    targetPath = await window.streamplanAPI.chooseSaveProjectPath(defaultName);
    if (!targetPath) return;
  }
  setStatus(t("status.savingProject"));
  try {
    const bytes = await buildProjectZipBytes(document_);
    await window.streamplanAPI.writeFile(targetPath, bytes);
    currentProjectPath = targetPath;
    setStatus(t("status.projectSaved", { path: targetPath }), "success");
  } catch (err) {
    console.error(err);
    setStatus(t("status.saveFailed", { message: err.message }), "error");
  }
}

async function openProject() {
  const targetPath = await window.streamplanAPI.chooseOpenProjectPath();
  if (!targetPath) return;
  setStatus(t("status.openingProject"));
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
    setStatus(t("status.projectLoaded", { path: targetPath }), "success");
    scheduleAutosave();
  } catch (err) {
    console.error(err);
    setStatus(t("status.openFailed", { message: err.message }), "error");
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

// Kept open for at least this long once shown (see onLanguageChange above)
// so the loading screen reads as a deliberate transition rather than a
// flash, even on a fast machine where the actual restore work below
// finishes almost instantly.
const LANGUAGE_SWITCH_MIN_VISIBLE_MS = 1400;

async function hideLanguageSwitchOverlayIfNeeded() {
  const startedAt = sessionStorage.getItem("streamplanLangSwitchStart");
  if (!startedAt) return;
  const remaining = LANGUAGE_SWITCH_MIN_VISIBLE_MS - (Date.now() - Number(startedAt));
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
  document.getElementById("languageSwitchOverlay").classList.remove("open");
  sessionStorage.removeItem("streamplanLangSwitchStart");
}

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
    currentTutorialSeen = restored.tutorialSeen === true;
    loadDocumentIntoUi();
    setStatus(t("status.restored"));
  } catch (err) {
    console.error("Could not restore autosave:", err);
  } finally {
    await hideLanguageSwitchOverlayIfNeeded();
    // Fires for brand-new users (no autosave yet) and for anyone updating
    // into this version from before the tutorial existed (autosave present,
    // but tutorialSeen was never recorded) — both read as "hasn't seen it".
    if (!currentTutorialSeen) onboardingTour.promptFirstRun();
  }
})();

window.__streamplanDoc = document_;
window.__streamplanPanels = { schedulePanel, stylePanel, previewCanvas, layoutEditor, templateStudio };
window.__streamplanProject = { newProject, saveProject, openProject };
window.__streamplanSettings = { softwareSettings, updateNotice, onboardingTour, getAppTheme: () => currentAppTheme };
