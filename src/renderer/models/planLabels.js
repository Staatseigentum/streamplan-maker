// How the *exported graphic* writes day labels and times.
//
// Deliberately separate from src/renderer/i18n — that one drives the app's own
// chrome and follows the language the user works in, which is not necessarily
// the language their audience reads. A German streamer with an English-speaking
// audience wants "MON / 6:00 PM" on the plan while keeping the app in German,
// and vice versa. style.dayLabelLanguage "auto" bridges the two for everyone
// who doesn't care.
import { DAY_NAMES } from "../../shared/constants.js";
import { t } from "../i18n/index.js";

// Fixed tables rather than a lookup into the app dictionaries: these are the
// labels drawn onto the canvas and must stay put even if the UI translations
// are later reworded.
const DAY_LABELS = {
  de: {
    Monday: "MO",
    Tuesday: "DI",
    Wednesday: "MI",
    Thursday: "DO",
    Friday: "FR",
    Saturday: "SA",
    Sunday: "SO",
  },
  en: {
    Monday: "MON",
    Tuesday: "TUE",
    Wednesday: "WED",
    Thursday: "THU",
    Friday: "FRI",
    Saturday: "SAT",
    Sunday: "SUN",
  },
};

// The label a given day should be drawn with under the current style.
// Falls back through custom -> fixed table -> app language -> the raw day name,
// so a half-filled custom table still renders something sensible per day
// instead of leaving holes.
export function dayLabelFor(style, day) {
  const mode = (style && style.dayLabelLanguage) || "auto";
  if (mode === "custom") {
    const custom = (style && style.dayLabels) || {};
    if (custom[day]) return custom[day];
    // An empty field means "use the normal label for this one day".
  } else if (DAY_LABELS[mode]) {
    return DAY_LABELS[mode][day] || day.slice(0, 3).toUpperCase();
  }
  return t(`render.day.${day}`) || day.slice(0, 3).toUpperCase();
}

// The default label for a language, used to prefill / placeholder the custom
// fields in the Customize panel.
export function defaultDayLabel(language, day) {
  const table = DAY_LABELS[language];
  if (table && table[day]) return table[day];
  return t(`render.day.${day}`) || day.slice(0, 3).toUpperCase();
}

export function dayLabelTable(language) {
  return DAY_LABELS[language] ? { ...DAY_LABELS[language] } : Object.fromEntries(DAY_NAMES.map((d) => [d, defaultDayLabel("auto", d)]));
}

// The rest of the wording drawn onto the plan — "until 22:00", the subtitle,
// the empty-state lines, the weekday/weekend column headers. These have to
// follow the same language as the day labels: an English "MON" above a German
// "bis 22:00" is exactly the kind of half-translated result the setting exists
// to avoid. Kept here next to DAY_LABELS for the same reason: they're canvas
// text, not app chrome.
const PLAN_TEXT = {
  de: {
    "render.title": "WÖCHENTLICHER STREAMPLAN",
    "render.until": "bis {end}",
    "render.noDays": "Noch keine Streamtage ausgewählt.",
    "render.noDaysHere": "Keine Tage hier.",
    "render.weekdays": "WOCHENTAGE",
    "render.weekend": "WOCHENENDE",
  },
  en: {
    "render.title": "WEEKLY STREAM SCHEDULE",
    "render.until": "until {end}",
    "render.noDays": "No stream days selected yet.",
    "render.noDaysHere": "No days here.",
    "render.weekdays": "WEEKDAYS",
    "render.weekend": "WEEKEND",
  },
};

// "custom" only overrides the day labels — there are no custom fields for the
// rest of the wording — so it falls through to the app language like "auto".
export function planText(style, key, vars) {
  const mode = (style && style.dayLabelLanguage) || "auto";
  const table = PLAN_TEXT[mode];
  let value = table && table[key];
  if (value === undefined) return t(key, vars);
  if (vars) {
    for (const [k, v] of Object.entries(vars)) value = value.split(`{${k}}`).join(v);
  }
  return value;
}

// Matches "18:00" / "9:05" and nothing else. Anything that isn't a plain
// wall-clock time — most importantly endDisplay()'s "+2h 30m" duration form —
// is returned untouched, since converting that to a.m./p.m. would be nonsense.
const CLOCK_RE = /^(\d{1,2}):(\d{2})$/;

export function formatTime(style, value) {
  if (typeof value !== "string") return value;
  const format = (style && style.timeFormat) || "24h";
  if (format !== "12h") return value;
  const m = value.trim().match(CLOCK_RE);
  if (!m) return value;
  const hours = Number(m[1]);
  const minutes = m[2];
  if (!Number.isInteger(hours) || hours > 23) return value;
  const suffix = hours < 12 ? "AM" : "PM";
  // 0 -> 12 AM, 12 -> 12 PM, 13 -> 1 PM.
  const h12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${h12}:${minutes} ${suffix}`;
}

// endDisplay() returns either a real end time or a relative duration; only the
// former should be reformatted, which formatTime already takes care of.
export function formatEndDisplay(style, value) {
  return formatTime(style, value);
}
