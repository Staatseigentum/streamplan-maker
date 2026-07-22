// First-run "would you like a tour?" prompt (with a one-more-nudge skip
// confirmation, since the app can be overwhelming at first) plus a 7-step
// guided spotlight tour covering every major area of the UI. Whether the
// tour has been seen/skipped is persisted by app.js via the same
// autosave.json payload as language/theme/etc. (see project/autosave.js's
// tutorialSeen field) — this module only owns the UI, not the persistence.
import { t } from "../i18n/index.js";

const STEPS = [
  { targetId: "projectBar", titleKey: "onboarding.step1Title", bodyKey: "onboarding.step1Body" },
  { targetId: "sidePanel", titleKey: "onboarding.step2Title", bodyKey: "onboarding.step2Body" },
  { targetId: "previewFrame", titleKey: "onboarding.step3Title", bodyKey: "onboarding.step3Body" },
  { targetId: "stylePanel", titleKey: "onboarding.step4Title", bodyKey: "onboarding.step4Body" },
  { targetId: "exportBar", titleKey: "onboarding.step5Title", bodyKey: "onboarding.step5Body" },
  { targetId: "layoutEditorBtn", titleKey: "onboarding.step6Title", bodyKey: "onboarding.step6Body" },
  { targetId: "settingsBtn", titleKey: "onboarding.step7Title", bodyKey: "onboarding.step7Body" },
];

const SPOTLIGHT_PAD = 10;
const TOOLTIP_MARGIN = 18;

export class OnboardingTour {
  // onComplete is called exactly once per "session" of this flow — whether
  // the user finishes the whole tour, skips from the welcome prompt, or
  // skips mid-tour — so app.js can persist tutorialSeen in every case.
  constructor(promptOverlayEl, tourOverlayEl, { onComplete }) {
    this.promptOverlayEl = promptOverlayEl;
    this.tourOverlayEl = tourOverlayEl;
    this.onComplete = onComplete;
    this._stepIndex = 0;
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
    this._renderStep(); // position everything correctly before the pop-in plays
    this.tourOverlayEl.classList.add("open");
  }

  _endTour() {
    this.tourOverlayEl.classList.remove("open");
    this.onComplete?.();
  }

  _nextStep() {
    if (this._stepIndex >= STEPS.length - 1) {
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

  _renderStep() {
    const step = STEPS[this._stepIndex];
    const target = document.getElementById(step.targetId);
    if (!target) {
      // Defensive: never get the tour stuck on a step whose target vanished.
      this._nextStep();
      return;
    }

    const alreadyOpen = this.tourOverlayEl.classList.contains("open");
    const applyText = () => {
      this._progressEl.textContent = t("onboarding.stepOf", { current: this._stepIndex + 1, total: STEPS.length });
      this._titleEl.textContent = t(step.titleKey);
      this._bodyEl.textContent = t(step.bodyKey);
      this._backBtn.disabled = this._stepIndex === 0;
      this._nextBtn.textContent = this._stepIndex === STEPS.length - 1 ? t("common.finish") : t("common.next");
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

    this._positionOnTarget(target);
  }

  _positionOnTarget(target) {
    this._activeTargetId = target.id;
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
    if (!this.tourOverlayEl.classList.contains("open") || !this._activeTargetId) return;
    const target = document.getElementById(this._activeTargetId);
    if (target) this._positionOnTarget(target);
  }
}
