// Runs as a plain classic script (not type="module"), synchronously, the
// instant the parser reaches it — well before app.js's module graph starts
// resolving. If a language switch is mid-reload (see app.js's
// onLanguageChange / hideLanguageSwitchOverlayIfNeeded), this keeps the
// loading overlay showing on the fresh page immediately instead of it
// flashing closed for the moment it takes app.js to rebuild the whole UI.
if (sessionStorage.getItem("streamplanLangSwitchStart")) {
  document.getElementById("languageSwitchOverlay").classList.add("open");
}
