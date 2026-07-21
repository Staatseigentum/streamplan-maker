import { sanitizeCustomLayout } from "./customLayout.js";

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
];
export const BACKGROUND_MODES = ["solid", "gradient", "image"];
export const CORNER_STYLES = ["sharp", "rounded"];

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
  backgroundImageOffsetX = 0.5,
  backgroundImageOffsetY = 0.5,
  backgroundImageScale = 1,
  logoOffsetX = 0.5,
  logoOffsetY = 0.5,
  logoScale = 1,
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
    // Pan (0-1 fraction of the source image, like sticker x/y) + zoom (>=1,
    // on top of the automatic cover-fit scale) for the background image and
    // logo crops — see rendering/layout.js's drawImageCoverAdjustable.
    backgroundImageOffsetX,
    backgroundImageOffsetY,
    backgroundImageScale,
    logoOffsetX,
    logoOffsetY,
    logoScale,
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
    background_image_offset_x: style.backgroundImageOffsetX,
    background_image_offset_y: style.backgroundImageOffsetY,
    background_image_scale: style.backgroundImageScale,
    logo_offset_x: style.logoOffsetX,
    logo_offset_y: style.logoOffsetY,
    logo_scale: style.logoScale,
  };
}

function clampFraction(value, min, max, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
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
    backgroundImageOffsetX: clampFraction(data.background_image_offset_x, 0, 1, 0.5),
    backgroundImageOffsetY: clampFraction(data.background_image_offset_y, 0, 1, 0.5),
    backgroundImageScale: clampFraction(data.background_image_scale, 1, 4, 1),
    logoOffsetX: clampFraction(data.logo_offset_x, 0, 1, 0.5),
    logoOffsetY: clampFraction(data.logo_offset_y, 0, 1, 0.5),
    logoScale: clampFraction(data.logo_scale, 1, 4, 1),
  });
}
