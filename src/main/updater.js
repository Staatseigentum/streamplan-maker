const { app } = require("electron");
const { autoUpdater } = require("electron-updater");

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

let mainWindow = null;

function send(status, data = {}) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("updater:status", { status, ...data });
  }
}

// electron-updater's info.releaseNotes is either a plain string (the GitHub
// release body) or, with fullChangelog enabled, an array of
// { version, note } entries — one per version between the installed copy
// and the latest release, newest first — so a user several versions behind
// sees everything they're catching up on, not just the newest entry.
// Each entry's note is already GitHub's pre-rendered HTML (same as the
// single-string case), so this just concatenates them with a version
// heading in between when there's more than one to distinguish.
function normalizeReleaseNotes(releaseNotes) {
  if (!releaseNotes) return "";
  if (typeof releaseNotes === "string") return releaseNotes;
  if (Array.isArray(releaseNotes)) {
    const entries = releaseNotes.filter((entry) => entry && entry.note);
    if (entries.length <= 1) return entries.map((entry) => entry.note).join("");
    return entries.map((entry) => `<h2>v${entry.version}</h2>${entry.note}`).join("");
  }
  return "";
}

function initAutoUpdater(win) {
  mainWindow = win;

  if (!app.isPackaged) {
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  // electron-updater always resolves + downloads the single latest GitHub
  // release directly (there's no version-by-version chain to step through,
  // even if the installed copy is many versions behind) — that part needs
  // no configuration. fullChangelog only affects what release NOTES get
  // shown: without it, a user several versions behind would only see the
  // newest version's changelog entry in the update-ready popup, silently
  // missing everything that changed in the versions they skipped. This asks
  // electron-updater's GitHub provider for the combined notes of every
  // version between the installed one and the latest, which updater.js's
  // normalizeReleaseNotes() below already knows how to merge into one block
  // (it handles the resulting array-of-{version,note} shape).
  autoUpdater.fullChangelog = true;

  autoUpdater.on("checking-for-update", () => send("checking"));
  autoUpdater.on("update-available", (info) => send("available", { version: info.version }));
  autoUpdater.on("update-not-available", () => send("not-available"));
  autoUpdater.on("download-progress", (progress) =>
    send("downloading", { percent: Math.round(progress.percent) })
  );
  autoUpdater.on("update-downloaded", (info) =>
    send("downloaded", { version: info.version, releaseNotes: normalizeReleaseNotes(info.releaseNotes) })
  );
  autoUpdater.on("error", (err) => send("error", { message: err?.message || String(err) }));

  setTimeout(() => checkForUpdates(), 5000);
  setInterval(() => checkForUpdates(), CHECK_INTERVAL_MS);
}

function checkForUpdates() {
  if (!app.isPackaged) return;
  autoUpdater.checkForUpdates().catch((err) => send("error", { message: err?.message || String(err) }));
}

function quitAndInstall() {
  if (!app.isPackaged) return;
  autoUpdater.quitAndInstall();
}

module.exports = { initAutoUpdater, checkForUpdates, quitAndInstall };
