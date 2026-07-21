// A permanent, cross-session library of every custom streamplan template the
// user has built, saved, or imported. Persisted via project/autosave.js
// (mirrors rendering/fontLibrary.js's pattern) so custom templates keep
// showing up in the Templates gallery across app restarts, not just for the
// current session.
import { cloneStyle, styleToDict, styleFromDict } from "./style.js";

const library = []; // { id, name, style }

function generateId() {
  return `custom_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function listCustomTemplates() {
  return library.slice();
}

export function getCustomTemplate(id) {
  return library.find((t) => t.id === id) || null;
}

// "custom" is the always-present, unsaved starting point; anything else in
// the library is a template the user has explicitly saved or imported.
export function isCustomTemplateId(id) {
  return id === "custom" || library.some((t) => t.id === id);
}

export function addCustomTemplate({ name, style }) {
  const entry = { id: generateId(), name: name || "Custom Template", style: cloneStyle(style) };
  library.push(entry);
  return entry;
}

export function updateCustomTemplate(id, { name, style }) {
  const entry = getCustomTemplate(id);
  if (!entry) return null;
  if (name !== undefined) entry.name = name;
  if (style !== undefined) entry.style = cloneStyle(style);
  return entry;
}

export function removeCustomTemplate(id) {
  const idx = library.findIndex((t) => t.id === id);
  if (idx !== -1) library.splice(idx, 1);
}

export function customTemplatesToDict() {
  return library.map((t) => ({ id: t.id, name: t.name, style: styleToDict(t.style) }));
}

// Synchronous parse-and-store; fonts inside each style are only registered
// with the browser later, by project/autosave.js (mirrors how the main
// document's own fontHeading/fontBody get rehydrated there too).
export function restoreCustomTemplatesFromDict(list) {
  library.length = 0;
  (list || []).forEach((item) => {
    if (!item || !item.style) return;
    library.push({
      id: item.id || generateId(),
      name: item.name || "Custom Template",
      style: styleFromDict(item.style),
    });
  });
}
