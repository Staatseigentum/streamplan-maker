const path = require("path");
const fs = require("fs");
const { app, BrowserWindow, Menu } = require("electron");
const { registerIpcHandlers } = require("./ipc");
const { applyDisplayMode } = require("./displayMode");
const { initAutoUpdater } = require("./updater");

const APP_NAME = "Streamplan Maker";
const APP_ICON_PATH = path.join(__dirname, "..", "..", "build", "icon.ico");

function readStartupDisplayMode() {
  try {
    const settingsPath = path.join(app.getPath("userData"), "autosave.json");
    const payload = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    return payload.displayMode || "windowed";
  } catch {
    return "windowed";
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1180,
    minHeight: 720,
    title: APP_NAME,
    backgroundColor: "#0c0a12",
    icon: APP_ICON_PATH,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  applyDisplayMode(win, readStartupDisplayMode());
  win.once("ready-to-show", () => win.show());
  initAutoUpdater(win);

  win.on("minimize", () => win.webContents.send("window:minimized-state", true));
  win.on("restore", () => win.webContents.send("window:minimized-state", false));

  win.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
  return win;
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  registerIpcHandlers();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
