// Minimal renderer-wide i18n layer. `t()` is a synchronous lookup against a
// module-level "current language" — every ui/*.js file that builds DOM text
// imports t() directly rather than having language threaded through every
// constructor, since ES modules are singletons and app.js sets the language
// once at startup (before any UI is built — see the top-level await there).
// Switching language at runtime (Settings > Language) reloads the window
// instead of trying to make ~300 already-built textContent assignments
// reactive; see softwareSettings.js's onLanguageChange.
import { STRINGS } from "./strings.js";

export const SUPPORTED_LANGUAGES = ["en", "de"];
export const DEFAULT_LANGUAGE = "en";

let currentLanguage = DEFAULT_LANGUAGE;

export function getLanguage() {
  return currentLanguage;
}

export function setLanguage(lang) {
  currentLanguage = SUPPORTED_LANGUAGES.includes(lang) ? lang : DEFAULT_LANGUAGE;
  return currentLanguage;
}

export function t(key, vars) {
  const table = STRINGS[currentLanguage] || STRINGS[DEFAULT_LANGUAGE];
  let str = table[key];
  if (str === undefined) str = STRINGS[DEFAULT_LANGUAGE][key];
  if (str === undefined) return key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replaceAll(`{${k}}`, v);
    }
  }
  return str;
}

// The short day label drawn into the exported graphic itself (content, not
// app chrome) — distinct from DAY_NAMES/entry.day, which stay untranslated
// English data keys everywhere else in the app.
export function dayLabelShort(day) {
  return t(`render.day.${day}`) || day.slice(0, 3).toUpperCase();
}

// The full day name shown in app chrome (Schedule panel's day checkboxes,
// etc.) — same "translate the label, not the underlying data key" split as
// dayLabelShort, just for UI text instead of the exported graphic.
export function dayLabelFull(day) {
  return t(`schedule.day.${day}`) || day;
}
