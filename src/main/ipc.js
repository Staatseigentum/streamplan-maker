const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { app, dialog, ipcMain, BrowserWindow, shell } = require("electron");
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

  ipcMain.handle("app:open-external", (_event, url) => {
    if (typeof url !== "string" || !/^https:\/\//.test(url)) return;
    return shell.openExternal(url);
  });

  // Uploads a Template/Layout export straight to Streamplan Hub instead of
  // saving it locally. Runs here (not the renderer) so the request is a
  // plain Node fetch — a renderer-side fetch to a cross-origin https: URL
  // would hit the browser's CORS policy and have its response blocked,
  // since the site's /upload route (a normal server-rendered form target,
  // not a CORS-enabled API) sends no Access-Control-Allow-Origin header.
  // Mirrors the site's own upload form field-for-field; author_name/
  // description are left blank (server defaults author to "Anonym").
  ipcMain.handle("hub:upload", async (_event, { type, name, extension, jsonBytes }) => {
    const form = new FormData();
    form.append("type", type);
    form.append("name", name);
    form.append("file", new Blob([jsonBytes], { type: "application/json" }), `upload${extension}`);

    let response;
    try {
      response = await fetch("https://streamplan-maker.online/upload", { method: "POST", body: form });
    } catch (err) {
      return { ok: false, error: err.message };
    }
    if (!response.ok) {
      return { ok: false, status: response.status };
    }
    const match = response.url.match(/\/item\/([^/?]+)/);
    return { ok: true, url: match ? `https://streamplan-maker.online/item/${match[1]}` : response.url };
  });
}

module.exports = { registerIpcHandlers };
