const { app } = require("electron");
const { autoUpdater } = require("electron-updater");

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

let mainWindow = null;

function send(status, data = {}) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("updater:status", { status, ...data });
  }
}

function initAutoUpdater(win) {
  mainWindow = win;

  if (!app.isPackaged) {
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => send("checking"));
  autoUpdater.on("update-available", (info) => send("available", { version: info.version }));
  autoUpdater.on("update-not-available", () => send("not-available"));
  autoUpdater.on("download-progress", (progress) =>
    send("downloading", { percent: Math.round(progress.percent) })
  );
  autoUpdater.on("update-downloaded", (info) => send("downloaded", { version: info.version }));
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
