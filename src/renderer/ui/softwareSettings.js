import { APP_THEMES, applyAppTheme } from "./appThemes.js";
import { PREVIEW_FPS_OPTIONS } from "../../shared/constants.js";
import { SUPPORTED_LANGUAGES, t } from "../i18n/index.js";
import * as accountAuth from "../services/accountAuth.js";

const COMMUNITY_SITE_URL = "https://streamplan-maker.online/";
const ACCOUNT_SITE_URL = "https://streamplan-maker.online/account";
const FORGOT_PASSWORD_URL = "https://streamplan-maker.online/forgot-password";

function buildInputRow(labelText, type, extraAttrs = {}) {
  const wrap = document.createElement("div");
  wrap.style.marginBottom = "14px";
  const label = document.createElement("label");
  label.className = "field-label";
  label.textContent = labelText;
  wrap.appendChild(label);
  const input = document.createElement("input");
  input.type = type;
  Object.entries(extraAttrs).forEach(([k, v]) => input.setAttribute(k, v));
  wrap.appendChild(input);
  return { el: wrap, input };
}

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
      getAuthUser,
      onAuthChange,
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
    this.getAuthUser = getAuthUser;
    this.onAuthChange = onAuthChange;
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
      ["account", t("settings.tabAccount")],
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
    this._buildAccountTab(this.panelEls.account);
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

  // Account tab: register / verify / login live entirely inside the app
  // (talking to the website's JSON auth API — see services/accountAuth.js);
  // everything past that (profile, avatar, bio, managing uploads) is
  // website-only and just links out via openExternal, same pattern the
  // Community tab already uses.
  _buildAccountTab(container) {
    this._accountContainer = container;
    this._accountView = "login";
    this._pendingUserId = null;
    this._renderAccountTab();
  }

  _accountErrorMessage(code) {
    const key = code ? `auth.errors.${code}` : null;
    const known = key && t(key) !== key;
    return known ? t(key) : t("auth.errors.generic");
  }

  _renderAccountTab() {
    const container = this._accountContainer;
    container.innerHTML = "";
    const user = this.getAuthUser();
    if (user) {
      this._renderAccountLoggedIn(container, user);
    } else if (this._accountView === "verify") {
      this._renderAccountVerify(container);
    } else if (this._accountView === "register") {
      this._renderAccountRegister(container);
    } else {
      this._renderAccountLogin(container);
    }
  }

  _renderAccountLoggedIn(container, user) {
    const hint = document.createElement("div");
    hint.className = "field-hint";
    hint.textContent = t("settings.accountLoggedInHint");
    container.appendChild(hint);

    const header = document.createElement("div");
    header.className = "section-header";
    header.textContent = t("settings.accountHeader");
    container.appendChild(header);

    const nameLine = document.createElement("div");
    nameLine.className = "field-label";
    nameLine.style.marginBottom = "14px";
    nameLine.textContent = t("settings.accountLoggedInAs", { username: user.username });
    container.appendChild(nameLine);

    const manageBtn = document.createElement("button");
    manageBtn.className = "primary";
    manageBtn.textContent = t("settings.accountManageBtn");
    manageBtn.style.marginRight = "8px";
    manageBtn.addEventListener("click", () => window.streamplanAPI.openExternal(ACCOUNT_SITE_URL));
    container.appendChild(manageBtn);

    const logoutBtn = document.createElement("button");
    logoutBtn.textContent = t("auth.logoutBtn");
    logoutBtn.addEventListener("click", () => {
      this.onAuthChange(null, null);
      this._accountView = "login";
      this._renderAccountTab();
    });
    container.appendChild(logoutBtn);
  }

  _buildAccountError(container) {
    const error = document.createElement("div");
    error.className = "field-warning";
    error.style.display = "none";
    container.appendChild(error);
    return {
      show: (msg) => {
        error.innerHTML = `<span class="field-warning-icon">⚠</span><span>${msg}</span>`;
        error.style.display = "";
      },
      hide: () => {
        error.style.display = "none";
      },
    };
  }

  _renderAccountLogin(container) {
    const hint = document.createElement("div");
    hint.className = "field-hint";
    hint.textContent = t("settings.accountLoginHint");
    container.appendChild(hint);

    const error = this._buildAccountError(container);
    const emailRow = buildInputRow(t("auth.emailLabel"), "email", { autocomplete: "email" });
    const passwordRow = buildInputRow(t("auth.passwordLabel"), "password", { autocomplete: "current-password" });
    container.append(emailRow.el, passwordRow.el);

    const submitBtn = document.createElement("button");
    submitBtn.className = "primary";
    submitBtn.textContent = t("auth.login.submitBtn");
    submitBtn.style.marginBottom = "10px";
    submitBtn.addEventListener("click", async () => {
      error.hide();
      submitBtn.disabled = true;
      const result = await accountAuth.login({ email: emailRow.input.value.trim(), password: passwordRow.input.value });
      submitBtn.disabled = false;
      if (result.ok) {
        this.onAuthChange(result.token, result.user);
        this._renderAccountTab();
        return;
      }
      if (result.reason === "unverified") {
        this._pendingUserId = result.userId;
        await accountAuth.resendCode(result.userId);
        this._accountView = "verify";
        this._renderAccountTab();
        return;
      }
      error.show(this._accountErrorMessage(result.reason === "invalid" ? "invalidCredentials" : result.error));
    });
    container.appendChild(submitBtn);

    const forgotLink = document.createElement("button");
    forgotLink.className = "account-link-btn";
    forgotLink.textContent = t("auth.login.forgotPassword");
    forgotLink.addEventListener("click", () => window.streamplanAPI.openExternal(FORGOT_PASSWORD_URL));
    container.appendChild(forgotLink);

    const switchRow = document.createElement("div");
    switchRow.className = "field-hint";
    switchRow.style.marginTop = "14px";
    const switchBtn = document.createElement("button");
    switchBtn.className = "account-link-btn";
    switchBtn.textContent = t("auth.register.title");
    switchBtn.addEventListener("click", () => {
      this._accountView = "register";
      this._renderAccountTab();
    });
    switchRow.append(t("auth.register.haveAccount") + " ", switchBtn);
    container.appendChild(switchRow);
  }

  _renderAccountRegister(container) {
    const hint = document.createElement("div");
    hint.className = "field-hint";
    hint.textContent = t("settings.accountRegisterHint");
    container.appendChild(hint);

    const error = this._buildAccountError(container);
    const emailRow = buildInputRow(t("auth.emailLabel"), "email", { autocomplete: "email" });
    const usernameRow = buildInputRow(t("auth.usernameLabel"), "text", { autocomplete: "username", minlength: "3", maxlength: "30" });
    const passwordRow = buildInputRow(t("auth.passwordLabel"), "password", { autocomplete: "new-password", minlength: "8" });
    const confirmRow = buildInputRow(t("auth.confirmPasswordLabel"), "password", { autocomplete: "new-password", minlength: "8" });
    container.append(emailRow.el, usernameRow.el, passwordRow.el, confirmRow.el);

    const privacyRow = document.createElement("label");
    privacyRow.className = "checkbox-row";
    privacyRow.style.marginBottom = "14px";
    const privacyCheckbox = document.createElement("input");
    privacyCheckbox.type = "checkbox";
    const privacyText = document.createElement("span");
    privacyRow.append(privacyCheckbox, privacyText);
    container.appendChild(privacyRow);
    // Built as plain text + a clickable link segment rather than one
    // innerHTML string, so the translated copy can't inject markup.
    privacyText.textContent = t("auth.register.privacyPre") + " ";
    const linkBtn = document.createElement("button");
    linkBtn.type = "button";
    linkBtn.className = "account-link-btn";
    linkBtn.textContent = t("footer.datenschutz");
    linkBtn.addEventListener("click", () => window.streamplanAPI.openExternal("https://streamplan-maker.online/datenschutz"));
    privacyText.appendChild(linkBtn);
    privacyText.append(" " + t("auth.register.privacyPost"));

    const submitBtn = document.createElement("button");
    submitBtn.className = "primary";
    submitBtn.textContent = t("auth.register.submitBtn");
    submitBtn.style.marginBottom = "10px";
    submitBtn.addEventListener("click", async () => {
      error.hide();
      if (passwordRow.input.value !== confirmRow.input.value) {
        error.show(t("auth.errors.passwordMismatch"));
        return;
      }
      if (!privacyCheckbox.checked) {
        error.show(t("auth.errors.privacyRequired"));
        return;
      }
      submitBtn.disabled = true;
      const result = await accountAuth.register({
        email: emailRow.input.value.trim(),
        username: usernameRow.input.value.trim(),
        password: passwordRow.input.value,
        privacyAccepted: true,
      });
      submitBtn.disabled = false;
      if (result.ok) {
        this._pendingUserId = result.userId;
        this._accountView = "verify";
        this._renderAccountTab();
        return;
      }
      error.show(this._accountErrorMessage(result.error));
    });
    container.appendChild(submitBtn);

    const switchRow = document.createElement("div");
    switchRow.className = "field-hint";
    switchRow.style.marginTop = "14px";
    const switchBtn = document.createElement("button");
    switchBtn.className = "account-link-btn";
    switchBtn.textContent = t("auth.login.title");
    switchBtn.addEventListener("click", () => {
      this._accountView = "login";
      this._renderAccountTab();
    });
    switchRow.append(t("auth.register.haveAccount") + " ", switchBtn);
    container.appendChild(switchRow);
  }

  _renderAccountVerify(container) {
    const hint = document.createElement("div");
    hint.className = "field-hint";
    hint.textContent = t("auth.verify.subtitle");
    container.appendChild(hint);

    const error = this._buildAccountError(container);
    const codeRow = buildInputRow(t("auth.verify.codeLabel"), "text", {
      inputmode: "numeric",
      maxlength: "6",
      autocomplete: "one-time-code",
    });
    container.appendChild(codeRow.el);

    const submitBtn = document.createElement("button");
    submitBtn.className = "primary";
    submitBtn.textContent = t("auth.verify.submitBtn");
    submitBtn.style.marginRight = "8px";
    submitBtn.style.marginBottom = "10px";
    submitBtn.addEventListener("click", async () => {
      error.hide();
      submitBtn.disabled = true;
      const result = await accountAuth.verifyEmail({ userId: this._pendingUserId, code: codeRow.input.value.trim() });
      submitBtn.disabled = false;
      if (result.ok) {
        this._pendingUserId = null;
        this.onAuthChange(result.token, result.user);
        this._renderAccountTab();
        return;
      }
      error.show(this._accountErrorMessage(result.error));
    });
    container.appendChild(submitBtn);

    const resendBtn = document.createElement("button");
    resendBtn.textContent = t("auth.verify.resendBtn");
    resendBtn.style.marginBottom = "10px";
    resendBtn.addEventListener("click", async () => {
      resendBtn.disabled = true;
      await accountAuth.resendCode(this._pendingUserId);
      resendBtn.disabled = false;
    });
    container.appendChild(resendBtn);
  }

  _refreshSelection() {
    const current = this.getAppThemeId();
    this.cards.forEach(({ id, el }) => el.classList.toggle("selected", id === current));
  }

  open() {
    this._refreshSelection();
    this._refreshers.forEach((refresh) => refresh());
    this._renderAccountTab();
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
