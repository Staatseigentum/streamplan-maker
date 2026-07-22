const path = require("path");
const fs = require("fs");
const { app, BrowserWindow, Menu } = require("electron");
const { registerIpcHandlers } = require("./ipc");
const { applyDisplayMode } = require("./displayMode");
const { initAutoUpdater } = require("./updater");

const APP_NAME = "Streamplan Maker";
const APP_ICON_PATH = path.join(__dirname, "..", "..", "build", "icon.ico");
const PROTOCOL_SCHEME = "streamplan-maker";

let mainWindow = null;
let pendingImportPayload = null;

function readStartupDisplayMode() {
  try {
    const settingsPath = path.join(app.getPath("userData"), "autosave.json");
    const payload = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    return payload.displayMode || "windowed";
  } catch {
    return "windowed";
  }
}

// The website's download button hands off to the app via a
// `streamplan-maker://import?...` link instead of downloading the raw file
// directly — Windows passes that URL as a plain argv entry to a fresh
// electron.exe launch (or, if the app is already running, as the argv of
// the "second instance" that requestSingleInstanceLock() suppresses).
function findProtocolUrlInArgv(argv) {
  return argv.find((arg) => arg.startsWith(`${PROTOCOL_SCHEME}://`)) || null;
}

function parseImportPayload(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== `${PROTOCOL_SCHEME}:`) return null;

  const type = parsed.searchParams.get("type");
  const fileUrl = parsed.searchParams.get("url");
  const name = parsed.searchParams.get("name");
  if ((type !== "template" && type !== "layout") || !fileUrl) return null;
  if (!/^https:\/\//.test(fileUrl)) return null;

  return { type, url: fileUrl, name: name || "" };
}

function deliverImportPayload(payload) {
  if (!mainWindow) return;
  if (mainWindow.webContents.isLoadingMainFrame()) {
    pendingImportPayload = payload;
    return;
  }
  mainWindow.webContents.send("protocol:import-request", payload);
}

function handleProtocolActivation(argv) {
  const rawUrl = findProtocolUrlInArgv(argv);
  if (!rawUrl) return;
  const payload = parseImportPayload(rawUrl);
  if (!payload) return;

  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
  deliverImportPayload(payload);
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

  win.webContents.on("did-finish-load", () => {
    if (pendingImportPayload) {
      win.webContents.send("protocol:import-request", pendingImportPayload);
      pendingImportPayload = null;
    }
  });

  win.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
  return win;
}

app.setAsDefaultProtocolClient(PROTOCOL_SCHEME);

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    handleProtocolActivation(argv);
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    registerIpcHandlers();
    mainWindow = createWindow();
    handleProtocolActivation(process.argv);

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createWindow();
      }
    });
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
