import { sanitizeCustomLayout } from "./customLayout.js";
import { BACKGROUND_ANIM_VALUES } from "../rendering/animatedBackgrounds.js";

export const COLOR_KEYS = [
  "background",
  "backgroundEnd",
  "panel",
  "accent",
  "accentSecondary",
  "textPrimary",
  "textSecondary",
  "glow",
];

export const LAYOUT_VARIANTS = [
  "list",
  "grid7",
  "verticalTimeline",
  "calendarGrid",
  "compactBadges",
  "splitColumns",
  "radialClock",
  "ticketStrip",
  "cascadeFlow",
  "orbitRing",
  "novaRadiate",
  "meteorRow",
];
export const BACKGROUND_MODES = ["solid", "gradient", "image"];
export const CORNER_STYLES = ["sharp", "rounded"];
export const BACKGROUND_TEXTURES = ["none", "grain", "dots", "diagonal", "grid"];

export const FONT_SCALE_MIN = 0.7;
export const FONT_SCALE_MAX = 1.6;

// Fonts are represented as { family, path }. `family` is always the CSS
// font-family used by the Canvas 2D renderer. `path` is null for bundled
// system fonts (the family name alone resolves via the OS), or an absolute
// (pre-save) / project-relative (post-save) file path for a user-uploaded
// .ttf/.otf that must be registered via FontFace before it can be used.
//
// headingScale/bodyScale multiply every base font size the renderer uses for
// text drawn in that family (see rendering/renderer.js), so the user can
// scale the streamer name / day labels independently from the times / notes.
export function createStyleConfig({
  templateId = null,
  layoutVariant = "list",
  colors = {},
  fontHeading = { family: "Georgia", path: null },
  fontBody = { family: "Segoe UI", path: null },
  headingScale = 1,
  bodyScale = 1,
  backgroundImagePath = null,
  logoPath = null,
  backgroundMode = "solid",
  cornerStyle = "rounded",
  customImages = [],
  customLayout = null,
  layoutLocked = false,
  backgroundAnim = "none",
  backgroundImageOffsetX = 0.5,
  backgroundImageOffsetY = 0.5,
  backgroundImageScale = 1,
  logoOffsetX = 0.5,
  logoOffsetY = 0.5,
  logoScale = 1,
  logoSizeScale = 1,
  backgroundGradientStops = null,
  backgroundGradientAngle = 180,
  backgroundTexture = "none",
  backgroundTextureOpacity = 0.15,
} = {}) {
  return {
    templateId,
    layoutVariant,
    colors: { ...colors },
    fontHeading: { ...fontHeading },
    fontBody: { ...fontBody },
    headingScale,
    bodyScale,
    backgroundImagePath,
    logoPath,
    backgroundMode,
    cornerStyle,
    customImages: customImages.map((img) => ({ ...img })),
    customLayout: customLayout ? { elements: customLayout.elements.map((el) => ({ ...el })) } : null,
    layoutLocked,
    backgroundAnim: BACKGROUND_ANIM_VALUES.includes(backgroundAnim) ? backgroundAnim : "none",
    // Pan (0-1 fraction of the source image, like sticker x/y) + zoom (>=1,
    // on top of the automatic cover-fit scale) for the background image and
    // logo crops — see rendering/layout.js's drawImageCoverAdjustable.
    backgroundImageOffsetX,
    backgroundImageOffsetY,
    backgroundImageScale,
    logoOffsetX,
    logoOffsetY,
    logoScale,
    // The header logo's on-canvas diameter in the 8 built-in layout variants
    // is otherwise a fixed 140px — this multiplies it (0.6-1.6), independent
    // of logoScale, which only crops/zooms the source image inside that
    // circle. Custom Layout mode's logo is a normal resizable element and is
    // unaffected by this field.
    logoSizeScale,
    // null = legacy 2-stop gradient straight from colors.background/
    // colors.backgroundEnd (byte-identical to every template saved before
    // this field existed); once set (via the Template Studio's gradient
    // editor) it's an ordered [{offset, color}] list that fully replaces
    // that 2-stop behavior, and backgroundGradientAngle (degrees, 0 = left-
    // to-right, 90 = top-to-bottom, matching the old vertical default at
    // 180 reversed... see rendering/layout.js's buildBackground for the
    // exact angle-to-coordinate math) controls its direction.
    backgroundGradientStops: backgroundGradientStops ? backgroundGradientStops.map((s) => ({ ...s })) : null,
    backgroundGradientAngle,
    // Procedural, asset-free overlay drawn on top of the background fill —
    // see rendering/layout.js's drawBackgroundTexture.
    backgroundTexture: BACKGROUND_TEXTURES.includes(backgroundTexture) ? backgroundTexture : "none",
    backgroundTextureOpacity,
  };
}

export function cloneStyle(style) {
  return createStyleConfig(style);
}

export function styleToDict(style) {
  return {
    template_id: style.templateId,
    layout_variant: style.layoutVariant,
    colors: { ...style.colors },
    font_heading: { ...style.fontHeading },
    font_body: { ...style.fontBody },
    heading_scale: style.headingScale,
    body_scale: style.bodyScale,
    background_image_path: style.backgroundImagePath,
    logo_path: style.logoPath,
    background_mode: style.backgroundMode,
    corner_style: style.cornerStyle,
    custom_images: (style.customImages || []).map((img) => ({
      id: img.id,
      path: img.path,
      x: img.x,
      y: img.y,
      scale: img.scale,
      opacity: img.opacity,
    })),
    custom_layout: style.customLayout ? { elements: style.customLayout.elements.map((el) => ({ ...el })) } : null,
    layout_locked: !!style.layoutLocked,
    background_anim: style.backgroundAnim || "none",
    background_image_offset_x: style.backgroundImageOffsetX,
    background_image_offset_y: style.backgroundImageOffsetY,
    background_image_scale: style.backgroundImageScale,
    logo_offset_x: style.logoOffsetX,
    logo_offset_y: style.logoOffsetY,
    logo_scale: style.logoScale,
    logo_size_scale: style.logoSizeScale,
    background_gradient_stops: style.backgroundGradientStops ? style.backgroundGradientStops.map((s) => ({ ...s })) : null,
    background_gradient_angle: style.backgroundGradientAngle,
    background_texture: style.backgroundTexture || "none",
    background_texture_opacity: style.backgroundTextureOpacity,
  };
}

function clampFraction(value, min, max, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

// Untrusted-data repair for a gradient stops list (autosave restore,
// .sptemplate import) — drops malformed entries rather than crashing the
// renderer, mirroring customLayout.js's sanitizeCustomLayout approach.
// Needs at least 2 valid stops to be usable; anything less falls back to
// null (the legacy 2-stop colors.background/backgroundEnd gradient).
function sanitizeGradientStops(raw) {
  if (!Array.isArray(raw)) return null;
  const stops = raw
    .filter((s) => s && typeof s === "object" && HEX_COLOR_RE.test(s.color))
    .map((s) => ({ offset: clampFraction(s.offset, 0, 1, 0), color: s.color }))
    .sort((a, b) => a.offset - b.offset);
  return stops.length >= 2 ? stops : null;
}

export function styleFromDict(data) {
  return createStyleConfig({
    templateId: data.template_id ?? null,
    layoutVariant: data.layout_variant || "list",
    colors: data.colors || {},
    fontHeading: data.font_heading || { family: "Georgia", path: null },
    fontBody: data.font_body || { family: "Segoe UI", path: null },
    headingScale: data.heading_scale ?? 1,
    bodyScale: data.body_scale ?? 1,
    backgroundImagePath: data.background_image_path ?? null,
    logoPath: data.logo_path ?? null,
    backgroundMode: data.background_mode || "solid",
    cornerStyle: data.corner_style || "rounded",
    customImages: data.custom_images || [],
    customLayout: data.custom_layout ? { elements: sanitizeCustomLayout(data.custom_layout.elements) } : null,
    layoutLocked: !!data.layout_locked,
    backgroundAnim: data.background_anim || "none",
    backgroundImageOffsetX: clampFraction(data.background_image_offset_x, 0, 1, 0.5),
    backgroundImageOffsetY: clampFraction(data.background_image_offset_y, 0, 1, 0.5),
    backgroundImageScale: clampFraction(data.background_image_scale, 1, 4, 1),
    logoOffsetX: clampFraction(data.logo_offset_x, 0, 1, 0.5),
    logoOffsetY: clampFraction(data.logo_offset_y, 0, 1, 0.5),
    logoScale: clampFraction(data.logo_scale, 1, 4, 1),
    logoSizeScale: clampFraction(data.logo_size_scale, 0.6, 1.6, 1),
    backgroundGradientStops: sanitizeGradientStops(data.background_gradient_stops),
    backgroundGradientAngle: clampFraction(data.background_gradient_angle, 0, 360, 180),
    backgroundTexture: BACKGROUND_TEXTURES.includes(data.background_texture) ? data.background_texture : "none",
    backgroundTextureOpacity: clampFraction(data.background_texture_opacity, 0.02, 0.6, 0.15),
  });
}
