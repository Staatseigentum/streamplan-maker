// A permanent, cross-session library of every custom streamplan layout the
// user has built, saved, or imported via the Layout Editor. Persisted via
// project/autosave.js (mirrors models/customTemplateLibrary.js's pattern).
// No "locked" concept lives here — locking only applies once a layout is
// embedded into a StyleConfig via a Custom Template import (see style.js /
// stylePanel.js); picking your own saved layout for your own unlocked
// template is not "importing someone else's work".
import { sanitizeCustomLayout } from "./customLayout.js";

const library = []; // { id, name, elements }

function generateId() {
  return `layout_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function listCustomLayouts() {
  return library.slice();
}

export function getCustomLayout(id) {
  return library.find((l) => l.id === id) || null;
}

export function addCustomLayout({ name, elements }) {
  const entry = { id: generateId(), name: name || "Custom Layout", elements: sanitizeCustomLayout(elements) };
  library.push(entry);
  return entry;
}

export function updateCustomLayout(id, { name, elements }) {
  const entry = getCustomLayout(id);
  if (!entry) return null;
  if (name !== undefined) entry.name = name;
  if (elements !== undefined) entry.elements = sanitizeCustomLayout(elements);
  return entry;
}

export function removeCustomLayout(id) {
  const idx = library.findIndex((l) => l.id === id);
  if (idx !== -1) library.splice(idx, 1);
}

export function customLayoutsToDict() {
  return library.map((l) => ({ id: l.id, name: l.name, elements: l.elements.map((el) => ({ ...el })) }));
}

export function restoreCustomLayoutsFromDict(list) {
  library.length = 0;
  (list || []).forEach((item) => {
    if (!item) return;
    library.push({
      id: item.id || generateId(),
      name: item.name || "Custom Layout",
      elements: sanitizeCustomLayout(item.elements),
    });
  });
}
