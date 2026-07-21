// A permanent, cross-session library of every custom font the user has ever
// uploaded, so each one keeps showing up as "Custom Font: <name>" in the
// Heading/Body font dropdowns (Customize tab) — not just while it happens to
// be the currently selected font. Registration (FontFace/family name) is
// per-session (see rendering/fonts.js); the library itself is persisted via
// project/autosave.js as a list of {path, displayName}.
import { registerCustomFont } from "./fonts.js";

const library = []; // { family, path, displayName }

function displayNameFromPath(path) {
  const base = (path || "").split(/[\\/]/).pop() || path || "Font";
  return base.replace(/\.(ttf|otf)$/i, "");
}

export function listCustomFonts() {
  return library.slice();
}

export function findCustomFontByPath(path) {
  return library.find((f) => f.path === path) || null;
}

export async function addCustomFontToLibrary(path) {
  const existing = findCustomFontByPath(path);
  if (existing) return existing;
  const bytes = await window.streamplanAPI.readFile(path);
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const family = await registerCustomFont(path, arrayBuffer);
  const entry = { family, path, displayName: displayNameFromPath(path) };
  library.push(entry);
  return entry;
}

export function libraryToDict() {
  return library.map((f) => ({ path: f.path, display_name: f.displayName }));
}

export async function restoreLibraryFromDict(list) {
  for (const item of list || []) {
    try {
      await addCustomFontToLibrary(item.path);
    } catch {
      // source file was moved/deleted since upload — silently skip it
    }
  }
}
