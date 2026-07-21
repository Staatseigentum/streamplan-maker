import { APP_THEMES, applyAppTheme } from "./appThemes.js";
import { PREVIEW_FPS_OPTIONS } from "../../shared/constants.js";

const DISPLAY_MODE_LABELS = {
  windowed: "Windowed",
  fullscreen: "Fullscreen",
  exclusive: "Exclusive Fullscreen",
};

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
    { getAppThemeId, onAppThemeChange, getDisplayMode, onDisplayModeChange, getPreviewFps, onPreviewFpsChange }
  ) {
    this.overlayEl = overlayEl;
    this.getAppThemeId = getAppThemeId;
    this.onAppThemeChange = onAppThemeChange;
    this.getDisplayMode = getDisplayMode;
    this.onDisplayModeChange = onDisplayModeChange;
    this.getPreviewFps = getPreviewFps;
    this.onPreviewFpsChange = onPreviewFpsChange;
    this._refreshers = [];
    this._build();
  }

  _build() {
    const modal = document.createElement("div");
    modal.id = "settingsModal";

    const header = document.createElement("div");
    header.className = "settings-header";
    const title = document.createElement("div");
    title.className = "settings-title";
    title.textContent = "Software Settings";
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
      ["themes", "Program Themes"],
      ["display", "Display"],
      ["updates", "Updates"],
    ];
    const panelEls = {};
    tabDefs.forEach(([id, label], i) => {
      const btn = document.createElement("button");
      btn.className = "tab-btn" + (i === 0 ? " active" : "");
      btn.textContent = label;
      btn.addEventListener("click", () => {
        tabs.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        Object.values(panelEls).forEach((p) => p.classList.remove("active"));
        panelEls[id].classList.add("active");
      });
      tabs.appendChild(btn);

      const panel = document.createElement("div");
      panel.className = "tab-panel" + (i === 0 ? " active" : "");
      panelEls[id] = panel;
      panelsWrap.appendChild(panel);
    });

    modal.append(tabs, panelsWrap);
    this._buildThemesTab(panelEls.themes);
    this._buildDisplayTab(panelEls.display);
    this._buildUpdatesTab(panelEls.updates);
    this.updatesTabBtn = tabs.querySelectorAll(".tab-btn")[2];

    this.overlayEl.appendChild(modal);
    this.overlayEl.addEventListener("click", (e) => {
      if (e.target === this.overlayEl) this.close();
    });
    this._escHandler = (e) => {
      if (e.key === "Escape" && this.overlayEl.classList.contains("open")) this.close();
    };
    document.addEventListener("keydown", this._escHandler);
  }

  _buildThemesTab(container) {
    const hint = document.createElement("div");
    hint.className = "field-hint";
    hint.textContent = "Choose the editor's own look — 12 static, 13 with an animated backdrop. This only changes the app, not your exported streamplan design.";
    container.appendChild(hint);

    const miniTabs = document.createElement("div");
    miniTabs.className = "mini-tabs";
    container.appendChild(miniTabs);

    const miniPanelsWrap = document.createElement("div");
    container.appendChild(miniPanelsWrap);

    const groupDefs = [
      ["static", "Static", (t) => !t.animated],
      ["animated", "Animated", (t) => t.animated],
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
    animatedWarning.innerHTML =
      '<span class="field-warning-icon">⚠</span><span>Animated themes are more resource-intensive — they keep the GPU busy repainting the chrome the whole time the window is visible. The app automatically pauses all of this the moment the window is minimized, so it costs nothing in the background.</span>';
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
        tag.textContent = theme.animated ? "Animated" : "Static";
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
    hint.textContent = "Control how the app window behaves and how smoothly the live preview animation runs.";
    container.appendChild(hint);

    const windowHeader = document.createElement("div");
    windowHeader.className = "section-header";
    windowHeader.textContent = "Window Mode";
    container.appendChild(windowHeader);

    const displayModeRow = buildSelectRow(
      "Display Mode",
      Object.entries(DISPLAY_MODE_LABELS),
      this.getDisplayMode,
      (mode) => this.onDisplayModeChange(mode)
    );
    container.appendChild(displayModeRow.el);
    this._refreshers.push(displayModeRow.refresh);

    const perfHeader = document.createElement("div");
    perfHeader.className = "section-header";
    perfHeader.textContent = "Performance";
    container.appendChild(perfHeader);

    const fpsRow = buildSelectRow(
      "Live Preview Frame Rate",
      PREVIEW_FPS_OPTIONS.map((fps) => [String(fps), `${fps} FPS`]),
      this.getPreviewFps,
      (fps) => this.onPreviewFpsChange(Number(fps))
    );
    container.appendChild(fpsRow.el);
    this._refreshers.push(fpsRow.refresh);

    const fpsHint = document.createElement("div");
    fpsHint.className = "field-hint";
    fpsHint.textContent = "Higher frame rates make the shimmer/glow and GIF sticker preview animate more smoothly, at the cost of more CPU usage.";
    container.appendChild(fpsHint);
  }

  _buildUpdatesTab(container) {
    const hint = document.createElement("div");
    hint.className = "field-hint";
    hint.textContent = "Streamplan Maker can check GitHub for newer releases and install them automatically.";
    container.appendChild(hint);

    const versionHeader = document.createElement("div");
    versionHeader.className = "section-header";
    versionHeader.textContent = "Version";
    container.appendChild(versionHeader);

    const versionLine = document.createElement("div");
    versionLine.className = "field-label";
    versionLine.textContent = "Loading…";
    container.appendChild(versionLine);
    window.streamplanAPI.getAppVersion().then((v) => {
      versionLine.textContent = `Installed version: v${v}`;
    });

    const checkHeader = document.createElement("div");
    checkHeader.className = "section-header";
    checkHeader.textContent = "Check for Updates";
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
    checkBtn.textContent = "Check for Updates";
    checkBtn.addEventListener("click", () => {
      checkBtn.disabled = true;
      window.streamplanAPI.checkForUpdates().finally(() => {
        setTimeout(() => (checkBtn.disabled = false), 1500);
      });
    });
    btnRow.appendChild(checkBtn);

    const installBtn = document.createElement("button");
    installBtn.textContent = "Restart && Install";
    installBtn.style.display = "none";
    installBtn.addEventListener("click", () => window.streamplanAPI.quitAndInstallUpdate());
    btnRow.appendChild(installBtn);

    const notPackagedWarning = document.createElement("div");
    notPackagedWarning.className = "field-warning";
    notPackagedWarning.style.marginTop = "14px";
    notPackagedWarning.innerHTML =
      '<span class="field-warning-icon">⚠</span><span>You\'re running the development build. Update checks only run in the installed app.</span>';
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
          statusLine.textContent = "Checking for updates…";
          break;
        case "available":
          statusLine.textContent = `Update found: v${payload.version} — downloading…`;
          break;
        case "not-available":
          statusLine.textContent = "You're up to date.";
          break;
        case "downloading":
          statusLine.textContent = `Downloading update… ${payload.percent}%`;
          break;
        case "downloaded":
          statusLine.textContent = `Update v${payload.version} downloaded — ready to install.`;
          installBtn.style.display = "";
          if (settingsBtn) settingsBtn.classList.add("has-update");
          break;
        case "error":
          statusLine.textContent = `Update check failed: ${payload.message}`;
          break;
        default:
          break;
      }
    });
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
}
