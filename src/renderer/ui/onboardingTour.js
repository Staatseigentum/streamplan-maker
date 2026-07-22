// First-run "would you like a tour?" prompt (with a one-more-nudge skip
// confirmation, since the app can be overwhelming at first) plus a guided
// spotlight tour covering every major area of the UI — including, for the
// Template Studio and Layout Editor, actually opening those full-screen
// overlays and narrating their own key controls, not just pointing at the
// button that opens them. Whether the tour has been seen/skipped is
// persisted by app.js via the same autosave.json payload as
// language/theme/etc. (see project/autosave.js's tutorialSeen field) — this
// module only owns the UI, not the persistence.
import { t } from "../i18n/index.js";

const SPOTLIGHT_PAD = 10;
const TOOLTIP_MARGIN = 18;

export class OnboardingTour {
  // onComplete is called exactly once per "session" of this flow — whether
  // the user finishes the whole tour, skips from the welcome prompt, or
  // skips mid-tour — so app.js can persist tutorialSeen in every case.
  // deps: { stylePanel, layoutEditor, templateStudio, softwareSettings } —
  // the same instances app.js already builds, reused here so the tour opens
  // Template Studio / the Layout Editor / Settings via the exact same code
  // path a real click would, instead of duplicating that wiring.
  constructor(promptOverlayEl, tourOverlayEl, { onComplete, stylePanel, layoutEditor, templateStudio, softwareSettings }) {
    this.promptOverlayEl = promptOverlayEl;
    this.tourOverlayEl = tourOverlayEl;
    this.onComplete = onComplete;
    this._deps = { stylePanel, layoutEditor, templateStudio, softwareSettings };
    this._steps = this._buildSteps();
    this._stepIndex = 0;
    this._currentSection = "main";
    this._skipContext = null; // "welcome" | "tour" — which flow opened the skip-confirm nudge
    this._build();

    window.addEventListener("resize", () => this._reposition());
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (this._skipConfirmModal.classList.contains("visible")) this._skipConfirmBackBtn.click();
      else if (this.promptOverlayEl.classList.contains("open")) this._showSkipConfirm("welcome");
      else if (this.tourOverlayEl.classList.contains("open")) this._showSkipConfirm("tour");
    });
  }

  // Which overlay (if any) a given step's section needs open, and how to
  // open/close it — reusing app.js's own openTemplateStudio/openStandalone/
  // open wiring so this behaves identically to a real click, including the
  // same onClose refresh-the-panel side effects.
  _sectionHandlers() {
    const { stylePanel, layoutEditor, templateStudio, softwareSettings } = this._deps;
    return {
      main: {},
      layoutEditor: {
        open: () => layoutEditor.openStandalone(() => stylePanel.refreshAll()),
        close: () => layoutEditor.close(),
        isOpen: () => layoutEditor.overlayEl.classList.contains("open"),
      },
      templateStudio: {
        open: () => stylePanel.openTemplateStudio({ style: stylePanel.getStyle() }),
        close: () => templateStudio.close(),
        isOpen: () => templateStudio.overlayEl.classList.contains("open"),
      },
      settings: {
        open: () => softwareSettings.open(),
        close: () => softwareSettings.close(),
        isOpen: () => softwareSettings.overlayEl.classList.contains("open"),
      },
    };
  }

  // Selects the first draft element if nothing is selected yet, purely so a
  // Template Studio / Layout Editor "Element tab" step has something real to
  // show in the property panel instead of the empty-selection hint.
  _selectFirstElementIfNone(owner) {
    if (!owner._selectedId && owner._draftElements.length) owner._selectElement(owner._draftElements[0].id);
  }

  _buildSteps() {
    const { stylePanel, layoutEditor, templateStudio, softwareSettings } = this._deps;
    return [
      { targetId: "projectBar", titleKey: "onboarding.step1Title", bodyKey: "onboarding.step1Body" },
      { targetId: "sidePanel", titleKey: "onboarding.step2Title", bodyKey: "onboarding.step2Body" },
      { targetId: "previewFrame", titleKey: "onboarding.step3Title", bodyKey: "onboarding.step3Body" },
      { targetId: "stylePanel", titleKey: "onboarding.step4Title", bodyKey: "onboarding.step4Body" },

      // -- Customize tab, in more depth -------------------------------
      {
        titleKey: "onboarding.customizeColorsTitle",
        bodyKey: "onboarding.customizeColorsBody",
        activate: () => stylePanel._activateTab("customize"),
        getTarget: () => stylePanel.customizeRefs?.colorsHeader,
      },
      {
        titleKey: "onboarding.customizeBackgroundTitle",
        bodyKey: "onboarding.customizeBackgroundBody",
        getTarget: () => stylePanel.customizeRefs?.bgModeRowEl,
      },
      {
        titleKey: "onboarding.customizeStickersTitle",
        bodyKey: "onboarding.customizeStickersBody",
        getTarget: () => stylePanel.customizeRefs?.imagesHeader,
      },

      // -- Assets tab, in more depth -----------------------------------
      {
        titleKey: "onboarding.assetsIntroTitle",
        bodyKey: "onboarding.assetsIntroBody",
        activate: () => stylePanel._activateTab("assets"),
        getTarget: () => stylePanel.assetRefs?.bgCard,
      },
      {
        titleKey: "onboarding.assetsFontsTitle",
        bodyKey: "onboarding.assetsFontsBody",
        getTarget: () => stylePanel.assetRefs?.fontHeader,
      },
      {
        titleKey: "onboarding.assetsStickersTitle",
        bodyKey: "onboarding.assetsStickersBody",
        getTarget: () => stylePanel.assetRefs?.stickersHeader,
      },

      // -- Template Studio: actually opened, not just pointed at -------
      {
        section: "templateStudio",
        titleKey: "onboarding.templateStudioIntroTitle",
        bodyKey: "onboarding.templateStudioIntroBody",
        activate: () => templateStudio._activateSidebarTab("style"),
        getTarget: () => templateStudio.canvasWrap,
      },
      {
        section: "templateStudio",
        titleKey: "onboarding.templateStudioStyleTitle",
        bodyKey: "onboarding.templateStudioStyleBody",
        getTarget: () => templateStudio.bgModeRowEl,
      },
      {
        section: "templateStudio",
        titleKey: "onboarding.templateStudioElementTitle",
        bodyKey: "onboarding.templateStudioElementBody",
        activate: () => {
          templateStudio._activateSidebarTab("element");
          this._selectFirstElementIfNone(templateStudio);
        },
        getTarget: () => templateStudio.shadowSectionHeader,
      },
      {
        section: "templateStudio",
        titleKey: "onboarding.templateStudioSaveTitle",
        bodyKey: "onboarding.templateStudioSaveBody",
        getTarget: () => templateStudio.libraryRowEl,
      },

      { targetId: "exportBar", titleKey: "onboarding.step5Title", bodyKey: "onboarding.step5Body" },
      { targetId: "layoutEditorBtn", titleKey: "onboarding.step6Title", bodyKey: "onboarding.step6Body" },

      // -- Layout Editor: actually opened, not just pointed at ---------
      {
        section: "layoutEditor",
        titleKey: "onboarding.layoutEditorCanvasTitle",
        bodyKey: "onboarding.layoutEditorCanvasBody",
        getTarget: () => layoutEditor.canvasWrap,
      },
      {
        section: "layoutEditor",
        titleKey: "onboarding.layoutEditorAddTitle",
        bodyKey: "onboarding.layoutEditorAddBody",
        getTarget: () => layoutEditor.toolbarEl,
      },
      {
        section: "layoutEditor",
        titleKey: "onboarding.layoutEditorPropertiesTitle",
        bodyKey: "onboarding.layoutEditorPropertiesBody",
        activate: () => this._selectFirstElementIfNone(layoutEditor),
        getTarget: () => layoutEditor.sidebarEl,
      },
      {
        section: "layoutEditor",
        titleKey: "onboarding.layoutEditorSaveTitle",
        bodyKey: "onboarding.layoutEditorSaveBody",
        getTarget: () => layoutEditor.libraryRowEl,
      },

      { targetId: "settingsBtn", titleKey: "onboarding.step7Title", bodyKey: "onboarding.step7Body" },
      {
        section: "settings",
        titleKey: "onboarding.settingsCommunityTitle",
        bodyKey: "onboarding.settingsCommunityBody",
        activate: () => softwareSettings._activateTab("community"),
        getTarget: () => softwareSettings.communityOpenBtn,
      },
    ];
  }

  _build() {
    this._buildWelcomeModal();
    this._buildSkipConfirmModal();
    this._buildTourShell();
  }

  _buildWelcomeModal() {
    const modal = document.createElement("div");
    modal.className = "onboarding-modal";
    this._welcomeModal = modal;

    const title = document.createElement("div");
    title.className = "onboarding-modal-title";
    title.textContent = t("onboarding.welcomeTitle");
    const body = document.createElement("div");
    body.className = "onboarding-modal-body";
    body.textContent = t("onboarding.welcomeBody");
    const actions = document.createElement("div");
    actions.className = "onboarding-modal-actions";

    const skipBtn = document.createElement("button");
    skipBtn.textContent = t("onboarding.skipBtn");
    skipBtn.addEventListener("click", () => this._showSkipConfirm("welcome"));

    const startBtn = document.createElement("button");
    startBtn.className = "primary";
    startBtn.textContent = t("onboarding.startBtn");
    startBtn.addEventListener("click", () => this._startTour());

    actions.append(skipBtn, startBtn);
    modal.append(title, body, actions);
    this.promptOverlayEl.appendChild(modal);
  }

  _buildSkipConfirmModal() {
    const modal = document.createElement("div");
    modal.className = "onboarding-modal";
    this._skipConfirmModal = modal;

    const title = document.createElement("div");
    title.className = "onboarding-modal-title";
    title.textContent = t("onboarding.skipConfirmTitle");
    const body = document.createElement("div");
    body.className = "onboarding-modal-body";
    body.textContent = t("onboarding.skipConfirmBody");
    const actions = document.createElement("div");
    actions.className = "onboarding-modal-actions";

    const skipBtn = document.createElement("button");
    skipBtn.textContent = t("onboarding.skipConfirmSkipBtn");
    skipBtn.addEventListener("click", () => this._confirmSkip());
    this._skipConfirmSkipBtn = skipBtn;

    const backBtn = document.createElement("button");
    backBtn.className = "primary";
    backBtn.textContent = t("onboarding.skipConfirmBackBtn");
    backBtn.addEventListener("click", () => this._cancelSkip());
    this._skipConfirmBackBtn = backBtn;

    actions.append(skipBtn, backBtn);
    modal.append(title, body, actions);
    this.promptOverlayEl.appendChild(modal);

    this.promptOverlayEl.addEventListener("click", (e) => {
      if (e.target !== this.promptOverlayEl) return;
      // Backdrop click always means "back off", never a silent skip.
      if (this._skipConfirmModal.classList.contains("visible")) this._cancelSkip();
      else this._showSkipConfirm("welcome");
    });
  }

  _buildTourShell() {
    this._spotlightEl = document.createElement("div");
    this._spotlightEl.className = "onboarding-spotlight";
    this.tourOverlayEl.appendChild(this._spotlightEl);

    const tooltip = document.createElement("div");
    tooltip.className = "onboarding-tooltip";
    this._tooltipEl = tooltip;

    this._progressEl = document.createElement("div");
    this._progressEl.className = "onboarding-tooltip-progress";
    this._titleEl = document.createElement("div");
    this._titleEl.className = "onboarding-tooltip-title";
    this._bodyEl = document.createElement("div");
    this._bodyEl.className = "onboarding-tooltip-body";

    const actions = document.createElement("div");
    actions.className = "onboarding-tooltip-actions";
    const skipLink = document.createElement("button");
    skipLink.className = "onboarding-skip-link";
    skipLink.textContent = t("onboarding.skipBtn");
    skipLink.addEventListener("click", () => this._showSkipConfirm("tour"));

    const rightActions = document.createElement("div");
    rightActions.className = "onboarding-tooltip-actions-right";
    this._backBtn = document.createElement("button");
    this._backBtn.textContent = t("common.back");
    this._backBtn.addEventListener("click", () => this._prevStep());
    this._nextBtn = document.createElement("button");
    this._nextBtn.className = "primary";
    this._nextBtn.addEventListener("click", () => this._nextStep());
    rightActions.append(this._backBtn, this._nextBtn);

    actions.append(skipLink, rightActions);
    tooltip.append(this._progressEl, this._titleEl, this._bodyEl, actions);
    this.tourOverlayEl.appendChild(tooltip);
  }

  // Called after autosave restore completes, once per app launch — a no-op
  // if tutorialSeen is already true (app.js only calls this when it isn't).
  promptFirstRun() {
    this._skipContext = null;
    this._welcomeModal.classList.add("visible");
    this._skipConfirmModal.classList.remove("visible");
    this.promptOverlayEl.classList.add("open");
  }

  // Manual re-trigger from the topBar "❔ Tour" button — skips straight past
  // the welcome ask, since asking "want a tour?" right after the user
  // explicitly clicked a tour button would be redundant.
  replay() {
    this._startTour();
  }

  _showSkipConfirm(context) {
    this._skipContext = context;
    this._welcomeModal.classList.remove("visible");
    this._skipConfirmModal.classList.add("visible");
    this.promptOverlayEl.classList.add("open");
  }

  _cancelSkip() {
    this.promptOverlayEl.classList.remove("open");
    this._skipConfirmModal.classList.remove("visible");
    if (this._skipContext === "welcome") this._welcomeModal.classList.add("visible");
    // context "tour": the tour overlay was never hidden, so it simply resumes.
  }

  _confirmSkip() {
    this.promptOverlayEl.classList.remove("open");
    this._skipConfirmModal.classList.remove("visible");
    if (this.tourOverlayEl.classList.contains("open")) this._endTour();
    else this.onComplete?.();
  }

  _startTour() {
    this.promptOverlayEl.classList.remove("open");
    this._welcomeModal.classList.remove("visible");
    this._stepIndex = 0;
    this._currentSection = "main";
    this._renderStep(); // position everything correctly before the pop-in plays
    this.tourOverlayEl.classList.add("open");
  }

  _endTour() {
    // Whatever overlay the tour opened along the way (Template Studio, the
    // Layout Editor, Settings) shouldn't linger behind the closed tour.
    this._ensureSection("main");
    this.tourOverlayEl.classList.remove("open");
    this.onComplete?.();
  }

  _nextStep() {
    if (this._stepIndex >= this._steps.length - 1) {
      this._endTour();
      return;
    }
    this._stepIndex += 1;
    this._renderStep();
  }

  _prevStep() {
    if (this._stepIndex === 0) return;
    this._stepIndex -= 1;
    this._renderStep();
  }

  // Opens/closes the overlay (if any) a section needs, only on an actual
  // section change — and defensively re-opens it if the user somehow closed
  // it out from under an in-progress step (e.g. via Escape, which both this
  // module and the overlay's own handler independently react to).
  _ensureSection(section) {
    const handlers = this._sectionHandlers();
    if (section !== this._currentSection) {
      handlers[this._currentSection]?.close?.();
      this._currentSection = section;
    }
    const handler = handlers[section];
    if (handler?.open && !handler.isOpen()) handler.open();
  }

  _resolveTarget(step) {
    try {
      return step.getTarget ? step.getTarget() : document.getElementById(step.targetId);
    } catch {
      return null;
    }
  }

  _renderStep() {
    const step = this._steps[this._stepIndex];
    this._ensureSection(step.section || "main");
    step.activate?.();

    const target = this._resolveTarget(step);
    if (!target) {
      // Defensive: never get the tour stuck on a step whose target vanished.
      this._nextStep();
      return;
    }

    const alreadyOpen = this.tourOverlayEl.classList.contains("open");
    const applyText = () => {
      this._progressEl.textContent = t("onboarding.stepOf", { current: this._stepIndex + 1, total: this._steps.length });
      this._titleEl.textContent = t(step.titleKey);
      this._bodyEl.textContent = t(step.bodyKey);
      this._backBtn.disabled = this._stepIndex === 0;
      this._nextBtn.textContent = this._stepIndex === this._steps.length - 1 ? t("common.finish") : t("common.next");
    };

    if (alreadyOpen) {
      this._tooltipEl.classList.add("stepping");
      setTimeout(() => {
        applyText();
        this._tooltipEl.classList.remove("stepping");
      }, 130);
    } else {
      applyText();
    }

    // Many new targets live inside scrollable side panels (the Customize/
    // Assets tabs, Template Studio's and the Layout Editor's sidebars) —
    // without this they can be positioned correctly but scrolled out of
    // view. Both html/body and every .side-scroll container have no
    // scroll-behavior:smooth set, so this jumps instantly, in sync with the
    // spotlight's own positioning right after.
    target.scrollIntoView({ block: "center", inline: "nearest" });
    this._positionOnTarget(target);
  }

  _positionOnTarget(target) {
    this._activeTarget = target;
    const rect = target.getBoundingClientRect();
    this._spotlightEl.style.left = `${rect.left - SPOTLIGHT_PAD}px`;
    this._spotlightEl.style.top = `${rect.top - SPOTLIGHT_PAD}px`;
    this._spotlightEl.style.width = `${rect.width + SPOTLIGHT_PAD * 2}px`;
    this._spotlightEl.style.height = `${rect.height + SPOTLIGHT_PAD * 2}px`;
    this._positionTooltip(rect);
  }

  // Picks whichever side of the target has enough room for the tooltip
  // (preferring below/above, since that reads most naturally), falling back
  // to beside it, then clamps fully inside the viewport either way — this
  // has to work for both a thin top-bar button and a full-height side panel.
  _positionTooltip(rect) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const tw = this._tooltipEl.offsetWidth || 320;
    const th = this._tooltipEl.offsetHeight || 180;
    const space = {
      bottom: vh - rect.bottom,
      top: rect.top,
      right: vw - rect.right,
      left: rect.left,
    };
    let side = "bottom";
    if (space.bottom >= th + TOOLTIP_MARGIN) side = "bottom";
    else if (space.top >= th + TOOLTIP_MARGIN) side = "top";
    else if (space.right >= tw + TOOLTIP_MARGIN) side = "right";
    else if (space.left >= tw + TOOLTIP_MARGIN) side = "left";
    else side = space.bottom >= space.top ? "bottom" : "top";

    let top, left;
    if (side === "bottom") {
      top = rect.bottom + TOOLTIP_MARGIN;
      left = rect.left + rect.width / 2 - tw / 2;
    } else if (side === "top") {
      top = rect.top - th - TOOLTIP_MARGIN;
      left = rect.left + rect.width / 2 - tw / 2;
    } else if (side === "right") {
      left = rect.right + TOOLTIP_MARGIN;
      top = rect.top + rect.height / 2 - th / 2;
    } else {
      left = rect.left - tw - TOOLTIP_MARGIN;
      top = rect.top + rect.height / 2 - th / 2;
    }
    left = Math.min(Math.max(left, 16), vw - tw - 16);
    top = Math.min(Math.max(top, 16), vh - th - 16);
    this._tooltipEl.style.left = `${left}px`;
    this._tooltipEl.style.top = `${top}px`;
  }

  _reposition() {
    if (!this.tourOverlayEl.classList.contains("open") || !this._activeTarget) return;
    if (document.contains(this._activeTarget)) this._positionOnTarget(this._activeTarget);
  }
}
