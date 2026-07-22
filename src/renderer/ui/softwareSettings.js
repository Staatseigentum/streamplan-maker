import { APP_THEMES, applyAppTheme } from "./appThemes.js";
import { PREVIEW_FPS_OPTIONS } from "../../shared/constants.js";
import { SUPPORTED_LANGUAGES, t } from "../i18n/index.js";

const COMMUNITY_SITE_URL = "https://streamplan-maker.online/";

function buildSelectRow(labelText, options, getValue, setValue) {
  const wrap = document.createElement("div");
  wrap.style.marginBottom = "14px";
  const label = document.createElement("label");
  label.className = "field-label";
  label.textContent = labelText;
  wrap.appendChild(label);
  const select = document.createElement("select");
  options.forEach(([value, text]) => {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = text;
    select.appendChild(opt);
  });
  wrap.appendChild(select);
  select.addEventListener("change", () => setValue(select.value));
  const refresh = () => {
    select.value = String(getValue());
  };
  refresh();
  return { el: wrap, refresh };
}

export class SoftwareSettings {
  constructor(
    overlayEl,
    confirmOverlayEl,
    {
      getAppThemeId,
      onAppThemeChange,
      getDisplayMode,
      onDisplayModeChange,
      getPreviewFps,
      onPreviewFpsChange,
      getLanguage,
      onLanguageChange,
    }
  ) {
    this.overlayEl = overlayEl;
    this.confirmOverlayEl = confirmOverlayEl;
    this.getAppThemeId = getAppThemeId;
    this.onAppThemeChange = onAppThemeChange;
    this.getDisplayMode = getDisplayMode;
    this.onDisplayModeChange = onDisplayModeChange;
    this.getPreviewFps = getPreviewFps;
    this.onPreviewFpsChange = onPreviewFpsChange;
    this.getLanguage = getLanguage;
    this.onLanguageChange = onLanguageChange;
    this._refreshers = [];
    this._build();
    this._buildLanguageConfirmModal();
  }

  _build() {
    const modal = document.createElement("div");
    modal.id = "settingsModal";

    const header = document.createElement("div");
    header.className = "settings-header";
    const title = document.createElement("div");
    title.className = "settings-title";
    title.textContent = t("settings.title");
    const closeBtn = document.createElement("button");
    closeBtn.className = "settings-close";
    closeBtn.textContent = "✕";
    closeBtn.addEventListener("click", () => this.close());
    header.append(title, closeBtn);
    modal.appendChild(header);

    const tabs = document.createElement("div");
    tabs.className = "tabs";
    const panelsWrap = document.createElement("div");

    const tabDefs = [
      ["themes", t("settings.tabThemes")],
      ["display", t("settings.tabDisplay")],
      ["language", t("settings.tabLanguage")],
      ["updates", t("settings.tabUpdates")],
      ["community", t("settings.tabCommunity")],
    ];
    this.tabBtns = {};
    this.panelEls = {};
    tabDefs.forEach(([id, label], i) => {
      const btn = document.createElement("button");
      btn.className = "tab-btn" + (i === 0 ? " active" : "");
      btn.textContent = label;
      btn.addEventListener("click", () => this._activateTab(id));
      tabs.appendChild(btn);
      this.tabBtns[id] = btn;

      const panel = document.createElement("div");
      panel.className = "tab-panel" + (i === 0 ? " active" : "");
      this.panelEls[id] = panel;
      panelsWrap.appendChild(panel);
    });

    modal.append(tabs, panelsWrap);
    this._buildThemesTab(this.panelEls.themes);
    this._buildDisplayTab(this.panelEls.display);
    this._buildLanguageTab(this.panelEls.language);
    this._buildUpdatesTab(this.panelEls.updates);
    this._buildCommunityTab(this.panelEls.community);
    this.updatesTabBtn = this.tabBtns.updates;

    this.overlayEl.appendChild(modal);
    this.overlayEl.addEventListener("click", (e) => {
      if (e.target === this.overlayEl) this.close();
    });
    this._escHandler = (e) => {
      if (e.key === "Escape" && this.overlayEl.classList.contains("open")) this.close();
    };
    document.addEventListener("keydown", this._escHandler);
  }

  _activateTab(id) {
    Object.entries(this.tabBtns).forEach(([tid, btn]) => btn.classList.toggle("active", tid === id));
    Object.entries(this.panelEls).forEach(([tid, panel]) => panel.classList.toggle("active", tid === id));
  }

  _buildThemesTab(container) {
    const hint = document.createElement("div");
    hint.className = "field-hint";
    hint.textContent = t("settings.themesHint");
    container.appendChild(hint);

    const miniTabs = document.createElement("div");
    miniTabs.className = "mini-tabs";
    container.appendChild(miniTabs);

    const miniPanelsWrap = document.createElement("div");
    container.appendChild(miniPanelsWrap);

    const groupDefs = [
      ["static", t("settings.themesStatic"), (t) => !t.animated],
      ["animated", t("settings.themesAnimated"), (t) => t.animated],
    ];
    const miniPanelEls = {};
    groupDefs.forEach(([id, label], i) => {
      const btn = document.createElement("button");
      btn.className = "mini-tab-btn" + (i === 0 ? " active" : "");
      btn.textContent = label;
      btn.addEventListener("click", () => {
        miniTabs.querySelectorAll(".mini-tab-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        Object.values(miniPanelEls).forEach((p) => p.classList.remove("active"));
        miniPanelEls[id].classList.add("active");
      });
      miniTabs.appendChild(btn);

      const panel = document.createElement("div");
      panel.className = "mini-tab-panel" + (i === 0 ? " active" : "");
      miniPanelEls[id] = panel;
      miniPanelsWrap.appendChild(panel);
    });

    const animatedWarning = document.createElement("div");
    animatedWarning.className = "field-warning";
    animatedWarning.innerHTML = `<span class="field-warning-icon">⚠</span><span>${t("settings.animatedWarning")}</span>`;
    miniPanelEls.animated.appendChild(animatedWarning);

    this.cards = [];
    groupDefs.forEach(([id, , filterFn]) => {
      const grid = document.createElement("div");
      grid.className = "theme-grid";
      miniPanelEls[id].appendChild(grid);

      APP_THEMES.filter(filterFn).forEach((theme) => {
        const card = document.createElement("div");
        card.className = "theme-card";
        card.addEventListener("click", () => {
          applyAppTheme(theme.id);
          this.onAppThemeChange(theme.id);
          this._refreshSelection();
        });

        const swatch = document.createElement("div");
        swatch.className = "theme-swatch" + (theme.animated ? " is-animated" : "");
        swatch.style.background = theme.swatch;
        swatch.style.backgroundSize = theme.animated ? "320% 320%" : "cover";
        card.appendChild(swatch);

        const name = document.createElement("div");
        name.className = "theme-name";
        name.textContent = theme.name;
        card.appendChild(name);

        const tag = document.createElement("div");
        tag.className = "theme-tag";
        tag.textContent = theme.animated ? t("settings.themesAnimated") : t("settings.themesStatic");
        card.appendChild(tag);

        grid.appendChild(card);
        this.cards.push({ id: theme.id, el: card });
      });
    });

    this._refreshSelection();
  }

  _buildDisplayTab(container) {
    const hint = document.createElement("div");
    hint.className = "field-hint";
    hint.textContent = t("settings.displayHint");
    container.appendChild(hint);

    const windowHeader = document.createElement("div");
    windowHeader.className = "section-header";
    windowHeader.textContent = t("settings.windowModeHeader");
    container.appendChild(windowHeader);

    const DISPLAY_MODE_LABELS = {
      windowed: t("settings.displayModeWindowed"),
      fullscreen: t("settings.displayModeFullscreen"),
      exclusive: t("settings.displayModeExclusive"),
    };

    const displayModeRow = buildSelectRow(
      t("settings.displayModeLabel"),
      Object.entries(DISPLAY_MODE_LABELS),
      this.getDisplayMode,
      (mode) => this.onDisplayModeChange(mode)
    );
    container.appendChild(displayModeRow.el);
    this._refreshers.push(displayModeRow.refresh);

    const perfHeader = document.createElement("div");
    perfHeader.className = "section-header";
    perfHeader.textContent = t("settings.performanceHeader");
    container.appendChild(perfHeader);

    const fpsRow = buildSelectRow(
      t("settings.previewFpsLabel"),
      PREVIEW_FPS_OPTIONS.map((fps) => [String(fps), t("settings.fpsOption", { fps })]),
      this.getPreviewFps,
      (fps) => this.onPreviewFpsChange(Number(fps))
    );
    container.appendChild(fpsRow.el);
    this._refreshers.push(fpsRow.refresh);

    const fpsHint = document.createElement("div");
    fpsHint.className = "field-hint";
    fpsHint.textContent = t("settings.fpsHint");
    container.appendChild(fpsHint);
  }

  _buildLanguageTab(container) {
    const hint = document.createElement("div");
    hint.className = "field-hint";
    hint.textContent = t("settings.languageHint");
    container.appendChild(hint);

    const LANGUAGE_LABELS = {
      en: t("settings.languageEnglish"),
      de: t("settings.languageGerman"),
    };

    const languageRow = buildSelectRow(
      t("settings.languageLabel"),
      SUPPORTED_LANGUAGES.map((lang) => [lang, LANGUAGE_LABELS[lang] || lang]),
      this.getLanguage,
      async (lang) => {
        if (lang === this.getLanguage()) return;
        // The <select> already shows the new value at this point (the
        // browser updates it before firing "change") — reverting via
        // refresh() on cancel is what actually undoes that, since nothing
        // else about the app has changed yet.
        const confirmed = await this._confirmLanguageSwitch(LANGUAGE_LABELS[lang] || lang);
        if (confirmed) this.onLanguageChange(lang);
        else languageRow.refresh();
      }
    );
    container.appendChild(languageRow.el);
    this._refreshers.push(languageRow.refresh);

    const reloadHint = document.createElement("div");
    reloadHint.className = "field-hint";
    reloadHint.textContent = t("settings.languageReloadNote");
    container.appendChild(reloadHint);
  }

  _buildUpdatesTab(container) {
    const hint = document.createElement("div");
    hint.className = "field-hint";
    hint.textContent = t("settings.updatesHint");
    container.appendChild(hint);

    const versionHeader = document.createElement("div");
    versionHeader.className = "section-header";
    versionHeader.textContent = t("settings.versionHeader");
    container.appendChild(versionHeader);

    const versionLine = document.createElement("div");
    versionLine.className = "field-label";
    versionLine.textContent = t("common.loading");
    container.appendChild(versionLine);
    window.streamplanAPI.getAppVersion().then((v) => {
      versionLine.textContent = t("settings.installedVersion", { version: v });
    });

    const checkHeader = document.createElement("div");
    checkHeader.className = "section-header";
    checkHeader.textContent = t("settings.checkUpdatesHeader");
    container.appendChild(checkHeader);

    const statusLine = document.createElement("div");
    statusLine.className = "field-hint";
    statusLine.style.marginBottom = "10px";
    statusLine.textContent = "—";
    container.appendChild(statusLine);

    const btnRow = document.createElement("div");
    btnRow.style.display = "flex";
    btnRow.style.gap = "8px";
    container.appendChild(btnRow);

    const checkBtn = document.createElement("button");
    checkBtn.className = "primary";
    checkBtn.textContent = t("settings.checkUpdatesBtn");
    checkBtn.addEventListener("click", () => {
      checkBtn.disabled = true;
      window.streamplanAPI.checkForUpdates().finally(() => {
        setTimeout(() => (checkBtn.disabled = false), 1500);
      });
    });
    btnRow.appendChild(checkBtn);

    const installBtn = document.createElement("button");
    installBtn.textContent = t("common.restartInstall");
    installBtn.style.display = "none";
    installBtn.addEventListener("click", () => window.streamplanAPI.quitAndInstallUpdate());
    btnRow.appendChild(installBtn);

    const notPackagedWarning = document.createElement("div");
    notPackagedWarning.className = "field-warning";
    notPackagedWarning.style.marginTop = "14px";
    notPackagedWarning.innerHTML = `<span class="field-warning-icon">⚠</span><span>${t("settings.notPackagedWarning")}</span>`;
    notPackagedWarning.style.display = "none";
    container.appendChild(notPackagedWarning);

    window.streamplanAPI.isPackaged().then((packaged) => {
      if (!packaged) {
        checkBtn.disabled = true;
        notPackagedWarning.style.display = "";
      }
    });

    window.streamplanAPI.onUpdateStatus((payload) => {
      const settingsBtn = document.getElementById("settingsBtn");
      installBtn.style.display = "none";
      switch (payload.status) {
        case "checking":
          statusLine.textContent = t("settings.statusChecking");
          break;
        case "available":
          statusLine.textContent = t("settings.statusAvailable", { version: payload.version });
          break;
        case "not-available":
          statusLine.textContent = t("settings.statusNotAvailable");
          break;
        case "downloading":
          statusLine.textContent = t("settings.statusDownloading", { percent: payload.percent });
          break;
        case "downloaded":
          statusLine.textContent = t("settings.statusDownloaded", { version: payload.version });
          installBtn.style.display = "";
          if (settingsBtn) settingsBtn.classList.add("has-update");
          break;
        case "error":
          statusLine.textContent = t("settings.statusError", { message: payload.message });
          break;
        default:
          break;
      }
    });
  }

  _buildCommunityTab(container) {
    const hint = document.createElement("div");
    hint.className = "field-hint";
    hint.textContent = t("settings.communityHint");
    container.appendChild(hint);

    const header = document.createElement("div");
    header.className = "section-header";
    header.textContent = t("settings.communityHeader");
    container.appendChild(header);

    const description = document.createElement("div");
    description.className = "field-label";
    description.style.marginBottom = "14px";
    description.textContent = t("settings.communityDescription");
    container.appendChild(description);

    const openBtn = document.createElement("button");
    openBtn.className = "primary";
    openBtn.textContent = t("settings.communityOpenBtn");
    openBtn.addEventListener("click", () => window.streamplanAPI.openExternal(COMMUNITY_SITE_URL));
    container.appendChild(openBtn);
    this.communityOpenBtn = openBtn;
  }

  _refreshSelection() {
    const current = this.getAppThemeId();
    this.cards.forEach(({ id, el }) => el.classList.toggle("selected", id === current));
  }

  open() {
    this._refreshSelection();
    this._refreshers.forEach((refresh) => refresh());
    this.overlayEl.classList.add("open");
  }

  close() {
    this.overlayEl.classList.remove("open");
  }

  // A small dedicated confirm dialog (not the generic settings modal shell —
  // its .settings-header/.settings-title/.settings-close classes only get
  // styled when nested under #settingsModal, so this uses its own
  // self-contained markup/CSS instead) stacked on top of the already-open
  // Settings modal, since switching language is a disruptive action (full
  // app reload) that's easy to trigger by accident while browsing the
  // dropdown.
  _buildLanguageConfirmModal() {
    const modal = document.createElement("div");
    modal.id = "languageConfirmModal";

    this._langConfirmTitle = document.createElement("div");
    this._langConfirmTitle.className = "language-confirm-title";
    modal.appendChild(this._langConfirmTitle);

    this._langConfirmBody = document.createElement("div");
    this._langConfirmBody.className = "language-confirm-body";
    modal.appendChild(this._langConfirmBody);

    const actions = document.createElement("div");
    actions.className = "language-confirm-actions";
    this._langConfirmCancelBtn = document.createElement("button");
    this._langConfirmConfirmBtn = document.createElement("button");
    this._langConfirmConfirmBtn.className = "primary";
    actions.append(this._langConfirmCancelBtn, this._langConfirmConfirmBtn);
    modal.appendChild(actions);

    this.confirmOverlayEl.appendChild(modal);
    this.confirmOverlayEl.addEventListener("click", (e) => {
      if (e.target === this.confirmOverlayEl) this._resolveLanguageConfirm?.(false);
    });
  }

  // Resolves once the user picks Cancel or Confirm (or clicks the backdrop,
  // treated as Cancel). Only one of these can be in flight at a time, which
  // is fine — the <select> that triggers it is disabled from firing another
  // "change" until this one's promise settles and its own handler returns.
  _confirmLanguageSwitch(languageLabel) {
    this._langConfirmTitle.textContent = t("settings.languageConfirmTitle");
    this._langConfirmBody.textContent = t("settings.languageConfirmBody", { language: languageLabel });
    this._langConfirmCancelBtn.textContent = t("common.cancel");
    this._langConfirmConfirmBtn.textContent = t("settings.languageConfirmBtn");
    this.confirmOverlayEl.classList.add("open");

    return new Promise((resolve) => {
      const settle = (result) => {
        this.confirmOverlayEl.classList.remove("open");
        this._langConfirmConfirmBtn.removeEventListener("click", onConfirm);
        this._langConfirmCancelBtn.removeEventListener("click", onCancel);
        this._resolveLanguageConfirm = null;
        resolve(result);
      };
      const onConfirm = () => settle(true);
      const onCancel = () => settle(false);
      this._resolveLanguageConfirm = settle;
      this._langConfirmConfirmBtn.addEventListener("click", onConfirm);
      this._langConfirmCancelBtn.addEventListener("click", onCancel);
    });
  }
}
