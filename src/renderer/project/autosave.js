// Silent cross-session persistence: everything the user has set up (profile,
// style incl. custom fonts, app theme) is written to a single JSON file in
// Electron's userData dir on every change, and restored at startup, so
// nothing is lost just because the user never hit "Save Project".
import { projectToDict, projectFromDict } from "../models/project.js";
import { addCustomFontToLibrary, libraryToDict, restoreLibraryFromDict } from "../rendering/fontLibrary.js";
import {
  customTemplatesToDict,
  restoreCustomTemplatesFromDict,
  listCustomTemplates,
} from "../models/customTemplateLibrary.js";
import { customLayoutsToDict, restoreCustomLayoutsFromDict } from "../models/customLayoutLibrary.js";

async function rehydrateFont(fontDict) {
  const fallback = { family: "Georgia", path: null };
  if (!fontDict || !fontDict.path) return fontDict || fallback;
  try {
    const entry = await addCustomFontToLibrary(fontDict.path);
    return { family: entry.family, path: entry.path };
  } catch {
    return { family: fontDict.family || fallback.family, path: null };
  }
}

export async function loadAutosave() {
  if (!window.streamplanAPI?.getSettingsPath) return null;
  let settingsPath;
  try {
    settingsPath = await window.streamplanAPI.getSettingsPath();
  } catch {
    return null;
  }
  let bytes;
  try {
    bytes = await window.streamplanAPI.readFile(settingsPath);
  } catch {
    return null; // no autosave yet, first launch
  }
  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
  if (!payload || !payload.project) return null;

  await restoreLibraryFromDict(payload.customFonts);

  restoreCustomTemplatesFromDict(payload.customTemplates);
  for (const tpl of listCustomTemplates()) {
    tpl.style.fontHeading = await rehydrateFont(tpl.style.fontHeading);
    tpl.style.fontBody = await rehydrateFont(tpl.style.fontBody);
  }

  restoreCustomLayoutsFromDict(payload.customLayouts);

  const dict = payload.project;
  if (dict.style) {
    dict.style.font_heading = await rehydrateFont(dict.style.font_heading);
    dict.style.font_body = await rehydrateFont(dict.style.font_body);
  }

  let doc;
  try {
    doc = projectFromDict(dict);
  } catch {
    return null;
  }
  return {
    doc,
    appTheme: payload.appTheme || null,
    displayMode: payload.displayMode || null,
    previewFps: payload.previewFps || null,
  };
}

export async function saveAutosave(doc, appTheme, displayMode, previewFps) {
  if (!window.streamplanAPI?.getSettingsPath) return;
  const settingsPath = await window.streamplanAPI.getSettingsPath();
  const payload = {
    project: projectToDict(doc),
    appTheme,
    displayMode,
    previewFps,
    customFonts: libraryToDict(),
    customTemplates: customTemplatesToDict(),
    customLayouts: customLayoutsToDict(),
    savedAt: new Date().toISOString(),
  };
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  await window.streamplanAPI.writeFile(settingsPath, bytes);
}
