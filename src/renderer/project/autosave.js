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
import { customLayoutsToDict, restoreCustomLayoutsFromDict, listCustomLayouts } from "../models/customLayoutLibrary.js";

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

// Layout Editor elements can carry their own font override (fontFamily is a
// flat string, not a {family,path} object — see models/customLayout.js), so
// they need the same re-registration rehydrateFont does for style.fontHeading/
// fontBody: FontFace family names aren't stable across app restarts.
// Sequential + per-element error-tolerant, matching rehydrateFont's pattern
// exactly (a bad path just clears that one element's override rather than
// aborting the whole restore).
async function rehydrateElementFonts(elements) {
  for (const el of elements || []) {
    if (!el.fontPath) continue;
    try {
      const entry = await addCustomFontToLibrary(el.fontPath);
      el.fontFamily = entry.family;
    } catch {
      el.fontFamily = null;
      el.fontPath = null;
    }
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
    if (tpl.style.customLayout) await rehydrateElementFonts(tpl.style.customLayout.elements);
  }

  restoreCustomLayoutsFromDict(payload.customLayouts);
  for (const entry of listCustomLayouts()) {
    await rehydrateElementFonts(entry.elements);
  }

  const dict = payload.project;
  if (dict.style) {
    dict.style.font_heading = await rehydrateFont(dict.style.font_heading);
    dict.style.font_body = await rehydrateFont(dict.style.font_body);
    if (dict.style.custom_layout) await rehydrateElementFonts(dict.style.custom_layout.elements);
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
