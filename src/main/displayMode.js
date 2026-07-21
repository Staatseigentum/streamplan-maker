// "exclusive" maps to Electron's kiosk mode — the closest analog Chromium
// exposes to a game's exclusive fullscreen (no window chrome, no taskbar).
function applyDisplayMode(win, mode) {
  if (!win) return;
  if (mode === "exclusive") {
    win.setKiosk(true);
  } else {
    win.setKiosk(false);
    win.setFullScreen(mode === "fullscreen");
  }
}

module.exports = { applyDisplayMode };
