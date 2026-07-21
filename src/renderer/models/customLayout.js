// Pure data/math for the free-form "Layout Editor" feature: a custom layout
// is always exactly 9 elements (one per weekday + header + logo), each
// positioned as a center-based fraction of the fixed design canvas
// (CANVAS_WIDTH x CANVAS_HEIGHT), mirroring how sticker customImages already
// store x/y as canvas-relative fractions. No rendering/DOM imports here —
// both rendering/renderer.js and ui/layoutEditor.js depend on this module,
// so keeping it dependency-free avoids a circular import between them.
import { CANVAS_WIDTH, CANVAS_HEIGHT, DAY_NAMES } from "../../shared/constants.js";

export const CUSTOM_LAYOUT_ELEMENT_TYPES = ["dayCard", "header", "logo"];

// null (or any other value) means "inherit the template's global Card
// Corners setting" — an element only diverges from the template when the
// user explicitly picks one of these for it.
export const ELEMENT_CORNER_STYLES = ["sharp", "rounded", "pill"];

// Fixed set of ids every custom layout must contain. Draw/stacking order is
// NOT tied to this list — it's whatever order the elements array itself is
// in (user-controlled via the Layout Editor's "Bring to Front"/"Send to
// Back"); this is just the seed order used by buildDefaultCustomLayoutElements.
export const CUSTOM_LAYOUT_ELEMENT_IDS = [...DAY_NAMES, "header", "logo"];

// Per-element style overrides — every field is optional/nullable and falls
// back to the template's global style when unset, so a fresh element always
// renders exactly like the built-in variants do until the user deliberately
// customizes it further:
//   cornerStyle: null | "sharp" | "rounded" | "pill" — "pill" fully rounds
//     the short side (a stadium/capsule shape), not available on the global
//     Card Corners setting, only per-element here.
//   showStripe: dayCard only — whether the left accent-color stripe shows.
//   accentColor: dayCard/header only — hex override for that element's
//     accent-colored bits (stripe, day label, header divider).
//   opacity: all types — lets an element fade toward transparent/ghosted.
export function createLayoutElement({
  id,
  type,
  cx = 0.5,
  cy = 0.5,
  w = 0.3,
  h = 0.1,
  rotation = 0,
  cornerStyle = null,
  showStripe = true,
  accentColor = null,
  opacity = 1,
}) {
  return { id, type, cx, cy, w, h, rotation, cornerStyle, showStripe, accentColor, opacity };
}

// A sane, non-overlapping starting arrangement (mirrors the "list" variant's
// geometry: header band at top, 7 stacked full-width day rows below, a small
// logo circle at top-left) — used both as the "Create Custom Layout" seed and
// as sanitizeCustomLayout's per-missing-element fallback.
export function buildDefaultCustomLayoutElements() {
  const headerX0 = 112;
  const headerX1 = 1288;
  const headerY0 = 90;
  const headerY1 = 340;
  const headerCx = (headerX0 + headerX1) / 2 / CANVAS_WIDTH;
  const headerCy = (headerY0 + headerY1) / 2 / CANVAS_HEIGHT;
  const headerW = (headerX1 - headerX0) / CANVAS_WIDTH;
  const headerH = (headerY1 - headerY0) / CANVAS_HEIGHT;

  const logoDiameter = 140;
  const logoCx = (headerX0 + logoDiameter / 2) / CANVAS_WIDTH;
  const logoCy = ((headerY0 + headerY1) / 2 - 10) / CANVAS_HEIGHT;
  const logoW = logoDiameter / CANVAS_WIDTH;
  const logoH = logoDiameter / CANVAS_HEIGHT;

  const contentX0 = 112;
  const contentX1 = 1288;
  const contentY0 = 380;
  const contentY1 = 1670;
  const gap = 22;
  const rowH = Math.max((contentY1 - contentY0 - gap * 6) / 7, 60);
  const dayCx = (contentX0 + contentX1) / 2 / CANVAS_WIDTH;
  const dayW = (contentX1 - contentX0) / CANVAS_WIDTH;
  const dayH = rowH / CANVAS_HEIGHT;

  const elements = DAY_NAMES.map((day, i) => {
    const rowY0 = contentY0 + i * (rowH + gap);
    return createLayoutElement({
      id: day,
      type: "dayCard",
      cx: dayCx,
      cy: (rowY0 + rowH / 2) / CANVAS_HEIGHT,
      w: dayW,
      h: dayH,
    });
  });

  elements.push(createLayoutElement({ id: "header", type: "header", cx: headerCx, cy: headerCy, w: headerW, h: headerH }));
  elements.push(createLayoutElement({ id: "logo", type: "logo", cx: logoCx, cy: logoCy, w: logoW, h: logoH }));
  return elements;
}

function clampNum(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
function sanitizeHexColor(value) {
  return typeof value === "string" && HEX_COLOR_RE.test(value) ? value : null;
}

// Repairs untrusted layout data (autosave restore, .sptemplate/.splayout
// import) into exactly the 9 required elements: unknown ids/types are
// dropped, missing ids are filled from the default seed, and every numeric
// field is clamped/coerced so a corrupt or hand-edited file can never crash
// or garble the renderer. Preserves the INPUT array's relative order (the
// user-controlled draw/z-order set via the Layout Editor's "Bring to
// Front"/"Send to Back") rather than forcing a fixed order — any elements
// missing from the input are appended at the end from the default seed.
export function sanitizeCustomLayout(rawElements) {
  const defaults = buildDefaultCustomLayoutElements();
  const byId = new Map(defaults.map((el) => [el.id, el]));
  const seen = new Set();
  const result = [];

  (Array.isArray(rawElements) ? rawElements : []).forEach((raw) => {
    if (!raw || typeof raw !== "object") return;
    const fallback = byId.get(raw.id);
    if (!fallback || seen.has(raw.id)) return;
    // The type for a given id is fixed by the slot (e.g. "header" must be
    // type "header") — untrusted data can't reassign a day's card to a
    // different element type.
    if (raw.type !== fallback.type) return;
    seen.add(raw.id);
    result.push(
      createLayoutElement({
        id: raw.id,
        type: fallback.type,
        // Range intentionally goes well beyond [0,1]/[0,1] — elements are
        // allowed to bleed off the canvas edges or be dramatically over/
        // undersized for deliberate creative effect (see the Layout
        // Editor's matching clamp range); this only guards against truly
        // degenerate/garbage values (NaN, absurd magnitudes) from a
        // corrupt or hand-edited file.
        cx: clampNum(raw.cx, -0.5, 1.5, fallback.cx),
        cy: clampNum(raw.cy, -0.5, 1.5, fallback.cy),
        w: clampNum(raw.w, 0.02, 2.5, fallback.w),
        h: clampNum(raw.h, 0.02, 2.5, fallback.h),
        rotation: clampNum(raw.rotation, -360, 360, 0),
        cornerStyle: ELEMENT_CORNER_STYLES.includes(raw.cornerStyle) ? raw.cornerStyle : null,
        showStripe: raw.showStripe === undefined ? true : !!raw.showStripe,
        accentColor: sanitizeHexColor(raw.accentColor),
        opacity: clampNum(raw.opacity, 0.05, 1, 1),
      })
    );
  });

  defaults.forEach((def) => {
    if (!seen.has(def.id)) result.push({ ...def });
  });

  return result;
}

export function elementRectPx(el, [w, h]) {
  const pxW = el.w * w;
  const pxH = el.h * h;
  const cx = el.cx * w;
  const cy = el.cy * h;
  return [cx - pxW / 2, cy - pxH / 2, cx + pxW / 2, cy + pxH / 2];
}

export function elementCenterPx(el, [w, h]) {
  return [el.cx * w, el.cy * h];
}
