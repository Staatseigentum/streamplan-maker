export const APP_NAME = "Streamplan Maker";
export const APP_VERSION = "1.0.0";
export const SCHEMA_VERSION = 1;

export const CANVAS_WIDTH = 1400;
export const CANVAS_HEIGHT = 1750;

export const DAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export const DAY_LABELS_SHORT = {
  Monday: "MON",
  Tuesday: "TUE",
  Wednesday: "WED",
  Thursday: "THU",
  Friday: "FRI",
  Saturday: "SAT",
  Sunday: "SUN",
};

export const GIF_FRAME_COUNT = 24;
export const GIF_FRAME_DELAY_MS = 80; // ~1.9s full loop

export const PREVIEW_DEBOUNCE_MS = 150;
export const PREVIEW_FPS_OPTIONS = [30, 60, 120, 180];
export const DEFAULT_PREVIEW_FPS = 60;

export const DISPLAY_MODES = ["windowed", "fullscreen", "exclusive"];
export const DEFAULT_DISPLAY_MODE = "windowed";

export const PROJECT_FILE_EXTENSION = ".stplan";
export const TEMPLATE_FILE_EXTENSION = ".sptemplate";
export const LAYOUT_FILE_EXTENSION = ".splayout";

// Export resolution tiers, all locked to the design canvas's exact 4:5
// portrait aspect ratio (CANVAS_WIDTH / CANVAS_HEIGHT = 0.8) so nothing gets
// stretched or letterboxed — only the pixel density changes.
export const EXPORT_RESOLUTIONS = {
  "1080p": [864, 1080],
  "2k": [1152, 1440],
  "4k": [1728, 2160],
};
export const DEFAULT_EXPORT_RESOLUTION = "2k";
