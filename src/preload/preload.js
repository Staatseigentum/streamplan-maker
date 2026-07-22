const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("streamplanAPI", {
  chooseSaveExportPath: (defaultName, format) =>
    ipcRenderer.invoke("dialog:save-export", { defaultName, format }),
  chooseSaveProjectPath: (defaultName) =>
    ipcRenderer.invoke("dialog:save-project", { defaultName }),
  chooseOpenProjectPath: () => ipcRenderer.invoke("dialog:open-project"),
  chooseSaveTemplatePath: (defaultName) =>
    ipcRenderer.invoke("dialog:save-template", { defaultName }),
  chooseOpenTemplatePath: () => ipcRenderer.invoke("dialog:open-template"),
  chooseSaveLayoutPath: (defaultName) =>
    ipcRenderer.invoke("dialog:save-layout", { defaultName }),
  chooseOpenLayoutPath: () => ipcRenderer.invoke("dialog:open-layout"),
  chooseAssetPath: (kind) => ipcRenderer.invoke("dialog:open-asset", { kind }),

  readFile: (filePath) => ipcRenderer.invoke("fs:read-file", filePath),
  writeFile: (filePath, data) => ipcRenderer.invoke("fs:write-file", filePath, data),
  basename: (filePath) => ipcRenderer.invoke("fs:basename", filePath),
  writeTempFile: (filename, data) => ipcRenderer.invoke("fs:write-temp-file", { filename, data }),
  getSettingsPath: () => ipcRenderer.invoke("app:get-settings-path"),
  setDisplayMode: (mode) => ipcRenderer.invoke("app:set-display-mode", mode),

  showMessage: (type, title, message) =>
    ipcRenderer.invoke("message:show", { type, title, message }),

  onMinimizedStateChange: (callback) => {
    const listener = (_event, minimized) => callback(minimized);
    ipcRenderer.on("window:minimized-state", listener);
    return () => ipcRenderer.removeListener("window:minimized-state", listener);
  },

  getAppVersion: () => ipcRenderer.invoke("app:get-version"),
  isPackaged: () => ipcRenderer.invoke("app:is-packaged"),
  checkForUpdates: () => ipcRenderer.invoke("updater:check"),
  quitAndInstallUpdate: () => ipcRenderer.invoke("updater:quit-and-install"),
  onUpdateStatus: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("updater:status", listener);
    return () => ipcRenderer.removeListener("updater:status", listener);
  },

  openExternal: (url) => ipcRenderer.invoke("app:open-external", url),
  onImportRequest: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("protocol:import-request", listener);
    return () => ipcRenderer.removeListener("protocol:import-request", listener);
  },
});
