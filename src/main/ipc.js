const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { app, dialog, ipcMain, BrowserWindow } = require("electron");
const { applyDisplayMode } = require("./displayMode");
const { checkForUpdates, quitAndInstall } = require("./updater");

let tempDirPromise = null;
function getTempDir() {
  if (!tempDirPromise) {
    tempDirPromise = fs.mkdtemp(path.join(os.tmpdir(), "streamplan-maker-"));
  }
  return tempDirPromise;
}

const EXPORT_FILTERS = {
  png: [{ name: "PNG Image", extensions: ["png"] }],
  jpg: [{ name: "JPEG Image", extensions: ["jpg", "jpeg"] }],
  pdf: [{ name: "PDF Document", extensions: ["pdf"] }],
  gif: [{ name: "Animated GIF", extensions: ["gif"] }],
};

const ASSET_FILTERS = {
  image: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }],
  sticker: [{ name: "Images & GIFs", extensions: ["png", "jpg", "jpeg", "webp", "gif"] }],
  font: [{ name: "Fonts", extensions: ["ttf", "otf"] }],
};

function windowFromEvent(event) {
  return BrowserWindow.fromWebContents(event.sender);
}

function registerIpcHandlers() {
  ipcMain.handle("dialog:save-export", async (event, { defaultName, format }) => {
    const win = windowFromEvent(event);
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: "Export Streamplan",
      defaultPath: path.join(app.getPath("desktop"), defaultName),
      filters: EXPORT_FILTERS[format] || [],
    });
    return canceled ? null : filePath;
  });

  ipcMain.handle("dialog:save-project", async (event, { defaultName }) => {
    const win = windowFromEvent(event);
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: "Save Streamplan Project",
      defaultPath: path.join(app.getPath("documents"), defaultName),
      filters: [{ name: "Streamplan Project", extensions: ["stplan"] }],
    });
    return canceled ? null : filePath;
  });

  ipcMain.handle("dialog:open-project", async (event) => {
    const win = windowFromEvent(event);
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: "Open Streamplan Project",
      properties: ["openFile"],
      filters: [{ name: "Streamplan Project", extensions: ["stplan"] }],
    });
    return canceled || filePaths.length === 0 ? null : filePaths[0];
  });

  ipcMain.handle("dialog:save-template", async (event, { defaultName }) => {
    const win = windowFromEvent(event);
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: "Export Streamplan Template",
      defaultPath: path.join(app.getPath("documents"), defaultName),
      filters: [{ name: "Streamplan Template", extensions: ["sptemplate"] }],
    });
    return canceled ? null : filePath;
  });

  ipcMain.handle("dialog:open-template", async (event) => {
    const win = windowFromEvent(event);
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: "Import Streamplan Template",
      properties: ["openFile"],
      filters: [{ name: "Streamplan Template", extensions: ["sptemplate"] }],
    });
    return canceled || filePaths.length === 0 ? null : filePaths[0];
  });

  ipcMain.handle("dialog:save-layout", async (event, { defaultName }) => {
    const win = windowFromEvent(event);
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: "Export Streamplan Layout",
      defaultPath: path.join(app.getPath("documents"), defaultName),
      filters: [{ name: "Streamplan Layout", extensions: ["splayout"] }],
    });
    return canceled ? null : filePath;
  });

  ipcMain.handle("dialog:open-layout", async (event) => {
    const win = windowFromEvent(event);
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: "Import Streamplan Layout",
      properties: ["openFile"],
      filters: [{ name: "Streamplan Layout", extensions: ["splayout"] }],
    });
    return canceled || filePaths.length === 0 ? null : filePaths[0];
  });

  ipcMain.handle("dialog:open-asset", async (event, { kind }) => {
    const win = windowFromEvent(event);
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: kind === "font" ? "Choose Font File" : "Choose Image",
      properties: ["openFile"],
      filters: ASSET_FILTERS[kind] || [],
    });
    return canceled || filePaths.length === 0 ? null : filePaths[0];
  });

  ipcMain.handle("fs:read-file", async (_event, filePath) => {
    const buf = await fs.readFile(filePath);
    return buf;
  });

  ipcMain.handle("fs:write-file", async (_event, filePath, data) => {
    await fs.writeFile(filePath, Buffer.from(data));
    return true;
  });

  ipcMain.handle("fs:basename", (_event, filePath) => path.basename(filePath));

  ipcMain.handle("app:get-settings-path", () => path.join(app.getPath("userData"), "autosave.json"));

  ipcMain.handle("fs:write-temp-file", async (_event, { filename, data }) => {
    const dir = await getTempDir();
    const safeName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${path.basename(filename)}`;
    const filePath = path.join(dir, safeName);
    await fs.writeFile(filePath, Buffer.from(data));
    return filePath;
  });

  ipcMain.handle("app:set-display-mode", (event, mode) => {
    applyDisplayMode(windowFromEvent(event), mode);
  });

  ipcMain.handle("message:show", async (event, { type, title, message }) => {
    const win = windowFromEvent(event);
    await dialog.showMessageBox(win, { type: type || "info", title, message });
  });

  ipcMain.handle("app:get-version", () => app.getVersion());
  ipcMain.handle("app:is-packaged", () => app.isPackaged);
  ipcMain.handle("updater:check", () => checkForUpdates());
  ipcMain.handle("updater:quit-and-install", () => quitAndInstall());
}

module.exports = { registerIpcHandlers };
