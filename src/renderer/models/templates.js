// Built-in preset style templates. Fonts reference families that ship with
// Windows itself, so nothing needs to be bundled for presets to render
// correctly out of the box. Users can override any font via their own
// uploaded .ttf/.otf in the Customize/Assets tabs.
import { cloneStyle, createStyleConfig } from "./style.js";

// The always-present "Custom" gallery slot's starting point — a distinct,
// neutral baseline (not a copy of any preset) so building a custom template
// truly starts from scratch. Selecting it applies this; the Template
// Customize tab then lets the user change literally every field.
export function customBaseStyle() {
  return createStyleConfig({
    templateId: "custom",
    layoutVariant: "list",
    colors: {
      background: "#0c0a12",
      backgroundEnd: "#17131f",
      panel: "#17131f",
      accent: "#7b5fd9",
      accentSecondary: "#b98bff",
      textPrimary: "#ede7f6",
      textSecondary: "#9c8fbf",
      glow: "#b98bff",
    },
    fontHeading: { family: "Georgia", path: null },
    fontBody: { family: "Segoe UI", path: null },
    backgroundMode: "solid",
    cornerStyle: "rounded",
  });
}

export const TEMPLATE_PRESETS = {
  arcane_vellum: createStyleConfig({
    templateId: "arcane_vellum",
    layoutVariant: "verticalTimeline",
    colors: {
      background: "#120E1A",
      backgroundEnd: "#1D1526",
      panel: "#1D1526",
      accent: "#B98BFF",
      accentSecondary: "#6A4FA6",
      textPrimary: "#EDE6FF",
      textSecondary: "#B9A9D6",
      glow: "#C9A8FF",
    },
    fontHeading: { family: "Georgia", path: null },
    fontBody: { family: "Georgia", path: null },
    backgroundMode: "solid",
    cornerStyle: "sharp",
  }),
  nebula_drift: createStyleConfig({
    templateId: "nebula_drift",
    layoutVariant: "grid7",
    colors: {
      background: "#05010F",
      backgroundEnd: "#160B2E",
      panel: "#1A1030",
      accent: "#4FD1FF",
      accentSecondary: "#FF6FD8",
      textPrimary: "#E4F6FF",
      textSecondary: "#9FB9D6",
      glow: "#7FE7FF",
    },
    fontHeading: { family: "Bahnschrift", path: null },
    fontBody: { family: "Segoe UI", path: null },
    backgroundMode: "gradient",
    cornerStyle: "rounded",
  }),
  neon_noir: createStyleConfig({
    templateId: "neon_noir",
    layoutVariant: "list",
    colors: {
      background: "#0A0A0F",
      backgroundEnd: "#16121C",
      panel: "#151019",
      accent: "#FF2E9A",
      accentSecondary: "#00F0FF",
      textPrimary: "#F5F5FA",
      textSecondary: "#9C97A8",
      glow: "#FF2E9A",
    },
    fontHeading: { family: "Impact", path: null },
    fontBody: { family: "Consolas", path: null },
    backgroundMode: "solid",
    cornerStyle: "sharp",
  }),
  frost_ledger: createStyleConfig({
    templateId: "frost_ledger",
    layoutVariant: "calendarGrid",
    colors: {
      background: "#071018",
      backgroundEnd: "#10202E",
      panel: "#142A38",
      accent: "#6FE3FF",
      accentSecondary: "#B8E8FF",
      textPrimary: "#EAF7FF",
      textSecondary: "#8FB4C7",
      glow: "#6FE3FF",
    },
    fontHeading: { family: "Bahnschrift", path: null },
    fontBody: { family: "Segoe UI", path: null },
    backgroundMode: "gradient",
    cornerStyle: "rounded",
  }),
  ember_sigil: createStyleConfig({
    templateId: "ember_sigil",
    layoutVariant: "compactBadges",
    colors: {
      background: "#150806",
      backgroundEnd: "#200D08",
      panel: "#24120C",
      accent: "#FF7A3D",
      accentSecondary: "#FFC15E",
      textPrimary: "#FBEBDD",
      textSecondary: "#C79776",
      glow: "#FF7A3D",
    },
    fontHeading: { family: "Impact", path: null },
    fontBody: { family: "Trebuchet MS", path: null },
    backgroundMode: "solid",
    cornerStyle: "sharp",
  }),
  twin_eclipse: createStyleConfig({
    templateId: "twin_eclipse",
    layoutVariant: "splitColumns",
    colors: {
      background: "#0B0714",
      backgroundEnd: "#1C1030",
      panel: "#17102A",
      accent: "#FFC94A",
      accentSecondary: "#6A5BFF",
      textPrimary: "#F3EFFF",
      textSecondary: "#A79BC9",
      glow: "#FFC94A",
    },
    fontHeading: { family: "Georgia", path: null },
    fontBody: { family: "Verdana", path: null },
    backgroundMode: "gradient",
    cornerStyle: "sharp",
  }),
  voidwatch: createStyleConfig({
    templateId: "voidwatch",
    layoutVariant: "radialClock",
    colors: {
      background: "#050308",
      backgroundEnd: "#0D0A18",
      panel: "#120E1E",
      accent: "#9D7BFF",
      accentSecondary: "#4FE3C1",
      textPrimary: "#EDE9FA",
      textSecondary: "#8E85B0",
      glow: "#9D7BFF",
    },
    fontHeading: { family: "Bahnschrift", path: null },
    fontBody: { family: "Consolas", path: null },
    backgroundMode: "solid",
    cornerStyle: "rounded",
  }),
  velvet_ticket: createStyleConfig({
    templateId: "velvet_ticket",
    layoutVariant: "ticketStrip",
    colors: {
      background: "#150208",
      backgroundEnd: "#2A0912",
      panel: "#260B14",
      accent: "#E0A94A",
      accentSecondary: "#C93A5A",
      textPrimary: "#FBE9E0",
      textSecondary: "#C79098",
      glow: "#E0A94A",
    },
    fontHeading: { family: "Georgia", path: null },
    fontBody: { family: "Trebuchet MS", path: null },
    backgroundMode: "gradient",
    cornerStyle: "rounded",
  }),
};

export const TEMPLATE_ORDER = [
  "arcane_vellum",
  "nebula_drift",
  "neon_noir",
  "frost_ledger",
  "ember_sigil",
  "twin_eclipse",
  "voidwatch",
  "velvet_ticket",
];

export const TEMPLATE_LABELS = {
  arcane_vellum: "Arcane Vellum",
  nebula_drift: "Nebula Drift",
  neon_noir: "Neon Noir",
  frost_ledger: "Frost Ledger",
  ember_sigil: "Ember Sigil",
  twin_eclipse: "Twin Eclipse",
  voidwatch: "Voidwatch",
  velvet_ticket: "Velvet Ticket",
};

export const TEMPLATE_DESCRIPTIONS = {
  arcane_vellum: "Gothic elegance — violet glow, ornate serif, candlelit timeline.",
  nebula_drift: "Deep-space nebula — cyan & magenta glow, starfield gradient.",
  neon_noir: "Cyberpunk HUD — hot-pink neon, sharp terminal-style rows.",
  frost_ledger: "Glacial precision — icy cyan grid, frostbitten glass calendar panels.",
  ember_sigil: "Molten badges — ember orange glow, compact forge-branded rows.",
  twin_eclipse: "Solar vs. lunar — gold and indigo, weekday and weekend divided.",
  voidwatch: "Cosmic clockwork — violet void, glowing radial dial, silent orbit.",
  velvet_ticket: "Old-world theater — crimson velvet, gilded ticket stubs, curtain call.",
};

export function getTemplate(templateId) {
  return cloneStyle(TEMPLATE_PRESETS[templateId]);
}

export function defaultStyle() {
  return getTemplate(TEMPLATE_ORDER[0]);
}
