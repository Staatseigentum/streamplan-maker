// The Layout Editor: a full-viewport free-form drag/resize/rotate editor for
// the 9 elements (7 day cards + header + logo) a Custom Template's
// style.customLayout can describe. Opens either standalone (library
// management only) or pre-loaded from a Custom Template's current layout via
// stylePanel.js, which also supplies an onApply callback to write the draft
// back. The draft is a deep-cloned working copy at all times — nothing here
// ever touches the live document style until "Apply to this Template" (or a
// library Save/Export) is explicitly clicked.
import { CANVAS_WIDTH, CANVAS_HEIGHT, DAY_NAMES, LAYOUT_FILE_EXTENSION } from "../../shared/constants.js";
import { createStreamerProfile, createDayEntry } from "../models/schedule.js";
import { renderStreamplan } from "../rendering/renderer.js";
import {
  buildDefaultCustomLayoutElements,
  sanitizeCustomLayout,
  createFreeformElement,
  CUSTOM_LAYOUT_ELEMENT_IDS,
  FREEFORM_ELEMENT_TYPES,
  CARD_STYLES,
  ELEMENT_ANIM_STYLES,
  ELEMENT_ANIM_INTENSITIES,
  SHAPE_KINDS,
} from "../models/customLayout.js";
import {
  listCustomLayouts,
  getCustomLayout,
  addCustomLayout,
  updateCustomLayout,
  removeCustomLayout,
} from "../models/customLayoutLibrary.js";
import { addCustomFontToLibrary, listCustomFonts } from "../rendering/fontLibrary.js";
import { t, dayLabelShort } from "../i18n/index.js";

// Computed lazily (not module-level consts) since this module is statically
// imported by app.js and evaluated before app.js's own top-level await
// settles the language — see i18n/index.js.
function cardStyleLabels() {
  return {
    classic: t("layoutEditor.skinClassic"),
    badge: t("layoutEditor.skinBadge"),
    calendar: t("layoutEditor.skinCalendar"),
    ticket: t("layoutEditor.skinTicket"),
    compact: t("layoutEditor.skinCompact"),
    ring: t("layoutEditor.skinRing"),
  };
}
function animStyleLabels() {
  return {
    none: t("layoutEditor.animNone"),
    pulse: t("layoutEditor.animPulse"),
    drift: t("layoutEditor.animDrift"),
    bob: t("layoutEditor.animBob"),
    glow: t("layoutEditor.animGlow"),
    spin: t("layoutEditor.animSpin"),
  };
}
function animIntensityLabels() {
  return { low: t("layoutEditor.intensityLow"), med: t("layoutEditor.intensityMedium"), high: t("layoutEditor.intensityHigh") };
}
function shapeKindLabels() {
  return {
    rect: t("layoutEditor.shapeRectOpt"),
    ellipse: t("layoutEditor.shapeEllipseOpt"),
    line: t("layoutEditor.shapeLineOpt"),
    triangle: t("layoutEditor.shapeTriangleOpt"),
    diamond: t("layoutEditor.shapeDiamondOpt"),
    pentagon: t("layoutEditor.shapePentagonOpt"),
    hexagon: t("layoutEditor.shapeHexagonOpt"),
    star: t("layoutEditor.shapeStarOpt"),
    arrow: t("layoutEditor.shapeArrowOpt"),
  };
}
// Purely decorative glyphs for the toolbar's shape-picker menu — not
// translated (they're symbols, not text) and not used in the property
// panel's plain <select>, which stays label-only like every other dropdown.
const SHAPE_KIND_ICONS = {
  rect: "▭",
  ellipse: "◯",
  line: "─",
  triangle: "△",
  diamond: "◇",
  pentagon: "⬠",
  hexagon: "⬡",
  star: "★",
  arrow: "➜",
};
const ANIM_TICK_MS = 1000 / 30;

// All 7 days populated (unlike the 3-day gallery-thumbnail sample) so every
// day card is always visible/draggable while editing, regardless of what the
// user's real schedule currently contains.
const SAMPLE_PROFILE = createStreamerProfile({
  displayName: "YourName",
  days: DAY_NAMES.map((day, i) =>
    createDayEntry({ day, startTime: "18:00", endTime: "21:00", label: i % 2 === 0 ? "Sample stream" : null })
  ),
});

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function elementLabel(el) {
  if (el.type === "dayCard") return dayLabelShort(el.id);
  if (el.type === "header") return t("layoutEditor.headerLabel");
  if (el.type === "logo") return t("layoutEditor.logoLabel");
  if (el.type === "dayTime") {
    const field = el.timeField === "duration" ? t("layoutEditor.timeDurationLabel") : t("layoutEditor.timeStartLabel");
    return `${dayLabelShort(el.dayKey)} ${field}`;
  }
  if (el.type === "text") return (el.text || t("layoutEditor.textFallback")).slice(0, 20);
  if (el.type === "shape") return t("layoutEditor.shapeFallback");
  if (el.type === "image") return t("layoutEditor.imageFallback");
  return el.type;
}

function sanitizeFilename(name) {
  const cleaned = (name || "").trim().replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, "_");
  return cleaned || "custom_layout";
}

// Rotates the point (x, y) by angleDeg using the same clockwise-for-positive
// convention as Canvas2D's ctx.rotate() and CSS's transform: rotate() (both
// operate in a y-down coordinate space), so this stays consistent with how
// rendering/renderer.js visually rotates elements around their own center.
function rotatePoint(x, y, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return { x: x * c - y * s, y: x * s + y * c };
}

function toCanvasPoint(localX, localY, cx, cy, rotationDeg) {
  const p = rotatePoint(localX, localY, rotationDeg);
  return { x: cx + p.x, y: cy + p.y };
}

function toLocalPoint(px, py, cx, cy, rotationDeg) {
  return rotatePoint(px - cx, py - cy, -rotationDeg);
}

// Snaps a box's center along one axis to the canvas center (50%) or to
// either canvas edge (accounting for the box's own half-size, so the box's
// EDGE lands on the canvas edge rather than just its center at 0%/100%).
const SNAP_THRESHOLD = 0.012;
function snapAxis(center, halfSize) {
  for (const candidate of [0.5, halfSize, 1 - halfSize]) {
    if (Math.abs(center - candidate) < SNAP_THRESHOLD) return candidate;
  }
  return center;
}

const CORNER_SIGNS = { nw: [-1, -1], ne: [1, -1], sw: [-1, 1], se: [1, 1] };

export class LayoutEditor {
  constructor(overlayEl, { getBaseStyle }) {
    this.overlayEl = overlayEl;
    this.getBaseStyle = getBaseStyle;
    this._draftElements = buildDefaultCustomLayoutElements();
    this._onApply = null;
    this._selectedId = null;
    this._loadedLibraryId = null;
    this._handleEls = new Map();
    this._build();
  }

  _build() {
    this.overlayEl.innerHTML = "";
    const shell = document.createElement("div");
    shell.className = "layout-editor-shell";

    // -- Toolbar ------------------------------------------------------
    const toolbar = document.createElement("div");
    toolbar.className = "layout-editor-toolbar";

    const title = document.createElement("div");
    title.className = "layout-editor-title";
    title.textContent = t("layoutEditor.title");
    toolbar.appendChild(title);

    const newBtn = document.createElement("button");
    newBtn.textContent = t("common.new");
    newBtn.addEventListener("click", () => {
      this._draftElements = buildDefaultCustomLayoutElements();
      this._loadedLibraryId = null;
      this.nameInput.value = "";
      this._selectElement(null);
      this._refreshLoadSelect();
      this._renderCanvas();
      this._renderOverlay();
    });
    toolbar.appendChild(newBtn);

    const addTextBtn = document.createElement("button");
    addTextBtn.textContent = t("layoutEditor.addText");
    addTextBtn.addEventListener("click", () => this._addFreeformElement("text"));
    toolbar.appendChild(addTextBtn);

    toolbar.appendChild(this._buildShapeAddMenu());

    const addImageBtn = document.createElement("button");
    addImageBtn.textContent = t("layoutEditor.addImage");
    addImageBtn.addEventListener("click", async () => {
      let path;
      try {
        path = await window.streamplanAPI.chooseAssetPath("sticker");
      } catch (err) {
        await window.streamplanAPI.showMessage("error", t("common.importFailedTitle"), t("common.fileDialogError", { message: err.message }));
        return;
      }
      if (!path) return;
      this._addFreeformElement("image", { imagePath: path });
    });
    toolbar.appendChild(addImageBtn);

    const spacer = document.createElement("div");
    spacer.className = "layout-editor-toolbar-spacer";
    toolbar.appendChild(spacer);

    this.applyBtn = document.createElement("button");
    this.applyBtn.className = "primary";
    this.applyBtn.textContent = t("layoutEditor.applyBtn");
    this.applyBtn.addEventListener("click", () => {
      if (this._onApply) this._onApply(this._draftElements.map((el) => ({ ...el })));
      this.close();
    });
    toolbar.appendChild(this.applyBtn);

    const closeBtn = document.createElement("button");
    closeBtn.textContent = t("layoutEditor.closeBtn");
    closeBtn.addEventListener("click", () => this.close());
    toolbar.appendChild(closeBtn);

    // -- Library row (save/export/import a reusable layout) -----------
    const libraryRow = document.createElement("div");
    libraryRow.className = "layout-editor-library-row";

    this.loadSelect = document.createElement("select");
    this.loadSelect.title = t("layoutEditor.loadSelectTitle");
    this.loadSelect.addEventListener("change", () => {
      const id = this.loadSelect.value;
      if (!id) return;
      const entry = getCustomLayout(id);
      if (!entry) return;
      this._loadedLibraryId = id;
      this._draftElements = entry.elements.map((el) => ({ ...el }));
      this.nameInput.value = entry.name;
      this._selectElement(null);
      this._refreshLoadSelect();
      this._renderCanvas();
      this._renderOverlay();
    });
    libraryRow.appendChild(this.loadSelect);

    this.nameInput = document.createElement("input");
    this.nameInput.type = "text";
    this.nameInput.placeholder = t("layoutEditor.namePlaceholder");
    libraryRow.appendChild(this.nameInput);

    const saveBtn = document.createElement("button");
    saveBtn.textContent = t("common.saveToLibrary");
    saveBtn.addEventListener("click", () => {
      const name = this.nameInput.value.trim() || "Custom Layout";
      if (this._loadedLibraryId && getCustomLayout(this._loadedLibraryId)) {
        updateCustomLayout(this._loadedLibraryId, { name, elements: this._draftElements });
      } else {
        const entry = addCustomLayout({ name, elements: this._draftElements });
        this._loadedLibraryId = entry.id;
      }
      this._refreshLoadSelect();
    });
    libraryRow.appendChild(saveBtn);

    const exportBtn = document.createElement("button");
    exportBtn.textContent = t("common.exportEllipsis");
    exportBtn.addEventListener("click", async () => {
      const name = this.nameInput.value.trim() || "Custom Layout";
      const defaultName = `${sanitizeFilename(name)}${LAYOUT_FILE_EXTENSION}`;
      let targetPath;
      try {
        targetPath = await window.streamplanAPI.chooseSaveLayoutPath(defaultName);
      } catch (err) {
        await window.streamplanAPI.showMessage("error", t("common.exportFailedTitle"), t("common.saveDialogError", { message: err.message }));
        return;
      }
      if (!targetPath) return;
      try {
        const payload = { name, elements: this._draftElements.map((el) => ({ ...el })) };
        const bytes = new TextEncoder().encode(JSON.stringify(payload, null, 2));
        await window.streamplanAPI.writeFile(targetPath, bytes);
      } catch (err) {
        console.error(err);
        await window.streamplanAPI.showMessage("error", t("common.exportFailedTitle"), err.message);
      }
    });
    libraryRow.appendChild(exportBtn);

    const importBtn = document.createElement("button");
    importBtn.textContent = t("common.importEllipsis");
    importBtn.addEventListener("click", async () => {
      const entry = await this._importLayoutFromDialog();
      if (!entry) return;
      this._loadedLibraryId = entry.id;
      this._draftElements = entry.elements.map((el) => ({ ...el }));
      this.nameInput.value = entry.name;
      this._selectElement(null);
      this._refreshLoadSelect();
      this._renderCanvas();
      this._renderOverlay();
    });
    libraryRow.appendChild(importBtn);

    this.deleteLibraryBtn = document.createElement("button");
    this.deleteLibraryBtn.className = "danger";
    this.deleteLibraryBtn.textContent = t("common.deleteFromLibrary");
    this.deleteLibraryBtn.addEventListener("click", () => {
      if (!this._loadedLibraryId) return;
      removeCustomLayout(this._loadedLibraryId);
      this._loadedLibraryId = null;
      this._refreshLoadSelect();
    });
    libraryRow.appendChild(this.deleteLibraryBtn);

    // -- Body: canvas + sidebar -----------------------------------------
    const body = document.createElement("div");
    body.className = "layout-editor-body";

    const canvasArea = document.createElement("div");
    canvasArea.className = "layout-editor-canvas-area";

    this.canvasWrap = document.createElement("div");
    this.canvasWrap.className = "layout-editor-canvas-wrap";

    this.canvasEl = document.createElement("canvas");
    this.canvasEl.className = "layout-editor-canvas";
    this.canvasWrap.appendChild(this.canvasEl);

    this.overlayLayer = document.createElement("div");
    this.overlayLayer.className = "layout-editor-overlay-layer";
    this.canvasWrap.appendChild(this.overlayLayer);

    this.canvasWrap.addEventListener("pointerdown", (e) => {
      if (e.target === this.canvasWrap || e.target === this.canvasEl) this._selectElement(null);
    });

    canvasArea.appendChild(this.canvasWrap);

    this.sidebarEl = document.createElement("div");
    this.sidebarEl.className = "side-scroll layout-editor-sidebar";
    this._buildPropertyPanel(this.sidebarEl);

    body.append(canvasArea, this.sidebarEl);

    shell.append(toolbar, libraryRow, body);
    this.overlayEl.appendChild(shell);

    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.overlayEl.classList.contains("open")) this.close();
    });
  }

  // "+ Shape" toolbar control: rather than dropping a default rectangle
  // immediately, this opens a small custom dropdown listing every
  // SHAPE_KINDS option (with an icon), and only adds the freeform element
  // once the user actually picks one — so a shape always starts out as the
  // kind the user meant, instead of "add rect, then flip it to something
  // else in the property panel".
  _buildShapeAddMenu() {
    const wrap = document.createElement("div");
    wrap.className = "shape-add-menu";

    const menuBtn = document.createElement("button");
    menuBtn.className = "shape-add-menu-trigger";
    menuBtn.textContent = `${t("layoutEditor.addShape")} ▾`;
    wrap.appendChild(menuBtn);

    const list = document.createElement("div");
    list.className = "shape-add-menu-list";
    list.setAttribute("role", "menu");
    list.setAttribute("aria-label", t("layoutEditor.addShapeMenuTitle"));

    const labels = shapeKindLabels();
    SHAPE_KINDS.forEach((kind) => {
      const item = document.createElement("button");
      item.className = "shape-add-menu-item";
      item.type = "button";
      const icon = document.createElement("span");
      icon.className = "shape-add-menu-item-icon";
      icon.textContent = SHAPE_KIND_ICONS[kind] || "";
      const label = document.createElement("span");
      label.textContent = labels[kind];
      item.append(icon, label);
      item.addEventListener("click", () => {
        this._addFreeformElement("shape", { shapeKind: kind });
        closeMenu();
      });
      list.appendChild(item);
    });
    wrap.appendChild(list);

    const closeMenu = () => wrap.classList.remove("open");
    menuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      wrap.classList.toggle("open");
    });
    document.addEventListener("click", (e) => {
      if (!wrap.contains(e.target)) closeMenu();
    });
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && wrap.classList.contains("open")) {
        e.stopPropagation();
        closeMenu();
      }
    });

    return wrap;
  }

  _buildPropertyPanel(container) {
    this.propEmpty = document.createElement("div");
    this.propEmpty.className = "field-hint";
    this.propEmpty.textContent = t("layoutEditor.emptyHint");
    container.appendChild(this.propEmpty);

    this.propTitle = document.createElement("div");
    this.propTitle.className = "section-header";
    container.appendChild(this.propTitle);

    this.propFields = document.createElement("div");
    this.propFields.style.display = "none";
    container.appendChild(this.propFields);

    const makeNumberRow = (labelText, min, max, step, onChange) => {
      const wrap = document.createElement("div");
      wrap.style.marginBottom = "12px";
      const label = document.createElement("label");
      label.className = "field-label";
      label.textContent = labelText;
      wrap.appendChild(label);
      const input = document.createElement("input");
      input.type = "number";
      input.min = String(min);
      input.max = String(max);
      input.step = String(step);
      input.addEventListener("input", () => {
        const v = Number(input.value);
        if (Number.isFinite(v)) onChange(v);
      });
      wrap.appendChild(input);
      this.propFields.appendChild(wrap);
      return input;
    };

    // Ranges intentionally extend well past 0-100%: elements can be
    // dragged/resized to bleed off the canvas edges or be dramatically
    // over/undersized, for whatever creative effect the user is after.
    this.inputX = makeNumberRow(t("layoutEditor.posXLabel"), -50, 150, 0.1, (v) => this._setSelectedField("cx", v / 100));
    this.inputY = makeNumberRow(t("layoutEditor.posYLabel"), -50, 150, 0.1, (v) => this._setSelectedField("cy", v / 100));
    this.inputW = makeNumberRow(t("layoutEditor.widthLabel"), 2, 250, 0.1, (v) => this._setSelectedField("w", v / 100));
    this.inputH = makeNumberRow(t("layoutEditor.heightLabel"), 2, 250, 0.1, (v) => this._setSelectedField("h", v / 100));
    this.inputRot = makeNumberRow(t("layoutEditor.rotationLabel"), -180, 180, 1, (v) => this._setSelectedField("rotation", v));

    // -- Per-element style overrides — every element starts inheriting the
    // template's global look, so a fresh layout renders identically to
    // before any of this is touched; each control here diverges just that
    // one element from the template on demand.
    const styleHeader = document.createElement("div");
    styleHeader.className = "section-header";
    styleHeader.textContent = t("layoutEditor.elementStyleHeader");
    this.propFields.appendChild(styleHeader);

    this.cornerWrap = document.createElement("div");
    this.cornerWrap.style.marginBottom = "12px";
    const cornerLabel = document.createElement("label");
    cornerLabel.className = "field-label";
    cornerLabel.textContent = t("layoutEditor.cornerStyleLabel");
    this.cornerWrap.appendChild(cornerLabel);
    this.cornerSelect = document.createElement("select");
    [
      ["", t("layoutEditor.cornerInheritOpt")],
      ["sharp", t("layoutEditor.cornerSharpOpt")],
      ["rounded", t("layoutEditor.cornerRoundedOpt")],
      ["pill", t("layoutEditor.cornerPillOpt")],
    ].forEach(([value, text]) => {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = text;
      this.cornerSelect.appendChild(opt);
    });
    this.cornerSelect.addEventListener("change", () => this._setSelectedField("cornerStyle", this.cornerSelect.value || null));
    this.cornerWrap.appendChild(this.cornerSelect);
    this.propFields.appendChild(this.cornerWrap);

    this.stripeWrap = document.createElement("div");
    this.stripeWrap.style.marginBottom = "12px";
    const stripeLabel = document.createElement("label");
    stripeLabel.className = "checkbox-row";
    this.stripeCheckbox = document.createElement("input");
    this.stripeCheckbox.type = "checkbox";
    this.stripeCheckbox.addEventListener("change", () => this._setSelectedField("showStripe", this.stripeCheckbox.checked));
    const stripeText = document.createElement("span");
    stripeText.textContent = t("layoutEditor.showStripeLabel");
    stripeLabel.append(this.stripeCheckbox, stripeText);
    this.stripeWrap.appendChild(stripeLabel);
    this.propFields.appendChild(this.stripeWrap);

    this.accentWrap = document.createElement("div");
    this.accentWrap.style.marginBottom = "12px";
    const accentLabel = document.createElement("label");
    accentLabel.className = "field-label";
    accentLabel.textContent = t("layoutEditor.accentColorLabel");
    this.accentWrap.appendChild(accentLabel);
    const accentRow = document.createElement("div");
    accentRow.style.display = "flex";
    accentRow.style.gap = "8px";
    accentRow.style.alignItems = "center";
    this.accentColorInput = document.createElement("input");
    this.accentColorInput.type = "color";
    this.accentColorInput.className = "color-swatch";
    this.accentColorInput.addEventListener("input", () => this._setSelectedField("accentColor", this.accentColorInput.value));
    const accentResetBtn = document.createElement("button");
    accentResetBtn.textContent = t("layoutEditor.useTemplateColorBtn");
    accentResetBtn.addEventListener("click", () => this._setSelectedField("accentColor", null));
    accentRow.append(this.accentColorInput, accentResetBtn);
    this.accentWrap.appendChild(accentRow);
    this.propFields.appendChild(this.accentWrap);

    this.inputOpacity = makeNumberRow(t("layoutEditor.opacityLabel"), 5, 100, 1, (v) => this._setSelectedField("opacity", v / 100));

    this.zOrderRow = document.createElement("div");
    this.zOrderRow.className = "asset-actions";
    this.zOrderRow.style.marginTop = "6px";
    const bringFrontBtn = document.createElement("button");
    bringFrontBtn.textContent = t("layoutEditor.bringFront");
    bringFrontBtn.addEventListener("click", () => this._bringToFront(this._selectedId));
    const sendBackBtn = document.createElement("button");
    sendBackBtn.textContent = t("layoutEditor.sendBack");
    sendBackBtn.addEventListener("click", () => this._sendToBack(this._selectedId));
    this.zOrderRow.append(bringFrontBtn, sendBackBtn);
    this.propFields.appendChild(this.zOrderRow);

    this._buildCardStyleSection();
    this._buildFontSection();
    this._buildAnimationSection();
    this._buildTextSection();
    this._buildShapeSection();
    this._buildImageSection();
    this._buildDeleteSection();
  }

  // Small local variant of the shared makeNumberRow above, but appending
  // into an arbitrary container (a type-specific field group) instead of
  // always this.propFields directly, and returning the wrapper div too so
  // callers can toggle its visibility per element type.
  _appendNumberRow(container, labelText, min, max, step, onChange) {
    const wrap = document.createElement("div");
    wrap.style.marginBottom = "12px";
    const label = document.createElement("label");
    label.className = "field-label";
    label.textContent = labelText;
    wrap.appendChild(label);
    const input = document.createElement("input");
    input.type = "number";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.addEventListener("input", () => {
      const v = Number(input.value);
      if (Number.isFinite(v)) onChange(v);
    });
    wrap.appendChild(input);
    container.appendChild(wrap);
    return { wrap, input };
  }

  _appendSelectRow(container, labelText, options, onChange) {
    const wrap = document.createElement("div");
    wrap.style.marginBottom = "12px";
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
    select.addEventListener("change", () => onChange(select.value));
    wrap.appendChild(select);
    container.appendChild(wrap);
    return { wrap, select };
  }

  _appendColorRow(container, labelText, onChange, onReset) {
    const wrap = document.createElement("div");
    wrap.style.marginBottom = "12px";
    const label = document.createElement("label");
    label.className = "field-label";
    label.textContent = labelText;
    wrap.appendChild(label);
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.gap = "8px";
    row.style.alignItems = "center";
    const input = document.createElement("input");
    input.type = "color";
    input.className = "color-swatch";
    input.addEventListener("input", () => onChange(input.value));
    row.appendChild(input);
    if (onReset) {
      const resetBtn = document.createElement("button");
      resetBtn.textContent = t("common.reset");
      resetBtn.addEventListener("click", onReset);
      row.appendChild(resetBtn);
    }
    wrap.appendChild(row);
    container.appendChild(wrap);
    return { wrap, input };
  }

  // DayCard-only: lets a card borrow the visual look of one of the app's
  // other built-in layouts instead of the plain default panel.
  _buildCardStyleSection() {
    const header = document.createElement("div");
    header.className = "section-header";
    header.textContent = t("layoutEditor.cardSkinHeader");
    this.cardSkinSectionHeader = header;
    this.propFields.appendChild(header);
    const labels = cardStyleLabels();
    const { wrap, select } = this._appendSelectRow(
      this.propFields,
      t("layoutEditor.skinLabel"),
      CARD_STYLES.map((v) => [v === "classic" ? "" : v, labels[v]]),
      (value) => this._setSelectedField("cardStyle", value || null)
    );
    this.cardStyleWrap = wrap;
    this.cardStyleSelect = select;
  }

  // Font override — meaningful for dayCard/header/text (anything that
  // draws text) — mirrors assetsTab.js's buildFontAssetCard upload/reset
  // pattern, plus a dropdown of already-uploaded fonts so one doesn't need
  // to be re-picked from disk if it's already in the library.
  _buildFontSection() {
    const header = document.createElement("div");
    header.className = "section-header";
    header.textContent = t("layoutEditor.fontHeader");
    this.fontSectionHeader = header;
    this.propFields.appendChild(header);

    this.fontWrap = document.createElement("div");
    this.fontWrap.style.marginBottom = "12px";

    this.fontFilenameEl = document.createElement("div");
    this.fontFilenameEl.className = "field-hint";
    this.fontWrap.appendChild(this.fontFilenameEl);

    this.fontLibrarySelect = document.createElement("select");
    this.fontLibrarySelect.title = t("layoutEditor.fontLibraryTitle");
    this.fontLibrarySelect.addEventListener("change", () => {
      const path = this.fontLibrarySelect.value;
      if (!path) return;
      const entry = listCustomFonts().find((f) => f.path === path);
      if (!entry) return;
      this._setSelectedField("fontFamily", entry.family);
      this._setSelectedField("fontPath", entry.path);
      this._refreshPropertyPanel();
    });
    this.fontWrap.appendChild(this.fontLibrarySelect);

    const fontBtnRow = document.createElement("div");
    fontBtnRow.className = "asset-actions";
    fontBtnRow.style.marginTop = "6px";
    const fontUploadBtn = document.createElement("button");
    fontUploadBtn.textContent = t("common.uploadFont");
    fontUploadBtn.addEventListener("click", async () => {
      const prevText = fontUploadBtn.textContent;
      fontUploadBtn.disabled = true;
      fontUploadBtn.textContent = t("common.loading");
      try {
        const path = await window.streamplanAPI.chooseAssetPath("font");
        if (path) {
          const entry = await addCustomFontToLibrary(path);
          this._setSelectedField("fontFamily", entry.family);
          this._setSelectedField("fontPath", entry.path);
          this._refreshFontLibrarySelect();
          this._refreshPropertyPanel();
        }
      } catch (err) {
        await window.streamplanAPI.showMessage("error", t("layoutEditor.fontUploadFailedTitle"), err.message);
      } finally {
        fontUploadBtn.disabled = false;
        fontUploadBtn.textContent = prevText;
      }
    });
    const fontResetBtn = document.createElement("button");
    fontResetBtn.textContent = t("layoutEditor.useTemplateFontBtn");
    fontResetBtn.addEventListener("click", () => {
      this._setSelectedField("fontFamily", null);
      this._setSelectedField("fontPath", null);
      this._refreshPropertyPanel();
    });
    fontBtnRow.append(fontUploadBtn, fontResetBtn);
    this.fontWrap.appendChild(fontBtnRow);
    this.propFields.appendChild(this.fontWrap);
  }

  _refreshFontLibrarySelect() {
    if (!this.fontLibrarySelect) return;
    const current = this.fontLibrarySelect.value;
    this.fontLibrarySelect.innerHTML = "";
    const blank = document.createElement("option");
    blank.value = "";
    blank.textContent = t("layoutEditor.pickFromLibrary");
    this.fontLibrarySelect.appendChild(blank);
    listCustomFonts().forEach((entry) => {
      const opt = document.createElement("option");
      opt.value = entry.path;
      opt.textContent = entry.displayName;
      this.fontLibrarySelect.appendChild(opt);
    });
    this.fontLibrarySelect.value = current && listCustomFonts().some((f) => f.path === current) ? current : "";
  }

  // All element types can be animated.
  _buildAnimationSection() {
    const header = document.createElement("div");
    header.className = "section-header";
    header.textContent = t("layoutEditor.animationHeader");
    this.propFields.appendChild(header);
    const animLabels = animStyleLabels();
    const { wrap: animWrap, select: animSelect } = this._appendSelectRow(
      this.propFields,
      t("layoutEditor.animStyleLabel"),
      ELEMENT_ANIM_STYLES.map((v) => [v === "none" ? "" : v, animLabels[v]]),
      (value) => this._setSelectedField("animStyle", value || null)
    );
    this.animWrap = animWrap;
    this.animSelect = animSelect;
    const intensityLabels = animIntensityLabels();
    const { wrap: intensityWrap, select: intensitySelect } = this._appendSelectRow(
      this.propFields,
      t("layoutEditor.intensityLabel"),
      ELEMENT_ANIM_INTENSITIES.map((v) => [v, intensityLabels[v]]),
      (value) => this._setSelectedField("animIntensity", value)
    );
    this.animIntensityWrap = intensityWrap;
    this.animIntensitySelect = intensitySelect;
  }

  // Text-only: content, alignment, color, size.
  _buildTextSection() {
    this.textFieldsWrap = document.createElement("div");
    const header = document.createElement("div");
    header.className = "section-header";
    header.textContent = t("layoutEditor.textContentHeader");
    this.textFieldsWrap.appendChild(header);

    const textAreaWrap = document.createElement("div");
    textAreaWrap.style.marginBottom = "12px";
    const textLabel = document.createElement("label");
    textLabel.className = "field-label";
    textLabel.textContent = t("layoutEditor.textLabel");
    textAreaWrap.appendChild(textLabel);
    this.textArea = document.createElement("textarea");
    this.textArea.rows = 3;
    this.textArea.addEventListener("input", () => this._setSelectedField("text", this.textArea.value));
    textAreaWrap.appendChild(this.textArea);
    this.textFieldsWrap.appendChild(textAreaWrap);

    const { select: alignSelect } = this._appendSelectRow(
      this.textFieldsWrap,
      t("layoutEditor.alignmentLabel"),
      [
        ["left", t("layoutEditor.alignLeft")],
        ["center", t("layoutEditor.alignCenter")],
        ["right", t("layoutEditor.alignRight")],
      ],
      (value) => this._setSelectedField("align", value)
    );
    this.textAlignSelect = alignSelect;

    const { input: colorInput } = this._appendColorRow(
      this.textFieldsWrap,
      t("layoutEditor.textColorLabel"),
      (value) => this._setSelectedField("color", value),
      () => this._setSelectedField("color", null)
    );
    this.textColorInput = colorInput;

    const { input: sizeInput } = this._appendNumberRow(this.textFieldsWrap, t("layoutEditor.fontSizeLabel"), 1, 30, 0.5, (v) =>
      this._setSelectedField("fontSize", v / 100)
    );
    this.textSizeInput = sizeInput;

    this.propFields.appendChild(this.textFieldsWrap);
  }

  // Shape-only: kind, fill, stroke.
  _buildShapeSection() {
    this.shapeFieldsWrap = document.createElement("div");
    const header = document.createElement("div");
    header.className = "section-header";
    header.textContent = t("layoutEditor.shapeHeader");
    this.shapeFieldsWrap.appendChild(header);

    const shapeLabels = shapeKindLabels();
    const { select: kindSelect } = this._appendSelectRow(
      this.shapeFieldsWrap,
      t("layoutEditor.shapeKindLabel"),
      SHAPE_KINDS.map((kind) => [kind, shapeLabels[kind]]),
      (value) => this._setSelectedField("shapeKind", value)
    );
    this.shapeKindSelect = kindSelect;

    const { input: fillInput } = this._appendColorRow(
      this.shapeFieldsWrap,
      t("layoutEditor.fillColorLabel"),
      (value) => this._setSelectedField("fillColor", value),
      () => this._setSelectedField("fillColor", null)
    );
    this.shapeFillInput = fillInput;

    const { input: strokeInput } = this._appendColorRow(
      this.shapeFieldsWrap,
      t("layoutEditor.strokeColorLabel"),
      (value) => this._setSelectedField("strokeColor", value),
      () => this._setSelectedField("strokeColor", null)
    );
    this.shapeStrokeInput = strokeInput;

    const { input: strokeWidthInput } = this._appendNumberRow(this.shapeFieldsWrap, t("layoutEditor.strokeWidthLabel"), 0, 60, 1, (v) =>
      this._setSelectedField("strokeWidth", v)
    );
    this.shapeStrokeWidthInput = strokeWidthInput;

    this.propFields.appendChild(this.shapeFieldsWrap);
  }

  // Image-only: upload/replace the source file.
  _buildImageSection() {
    this.imageFieldsWrap = document.createElement("div");
    const header = document.createElement("div");
    header.className = "section-header";
    header.textContent = t("layoutEditor.imageHeader");
    this.imageFieldsWrap.appendChild(header);

    this.imageFilenameEl = document.createElement("div");
    this.imageFilenameEl.className = "field-hint";
    this.imageFieldsWrap.appendChild(this.imageFilenameEl);

    const imageBtnRow = document.createElement("div");
    imageBtnRow.className = "asset-actions";
    imageBtnRow.style.marginTop = "6px";
    const imageUploadBtn = document.createElement("button");
    imageUploadBtn.textContent = t("layoutEditor.replaceImageBtn");
    imageUploadBtn.addEventListener("click", async () => {
      let path;
      try {
        path = await window.streamplanAPI.chooseAssetPath("sticker");
      } catch (err) {
        await window.streamplanAPI.showMessage("error", t("common.importFailedTitle"), t("common.fileDialogError", { message: err.message }));
        return;
      }
      if (path) {
        this._setSelectedField("imagePath", path);
        this._refreshPropertyPanel();
      }
    });
    imageBtnRow.appendChild(imageUploadBtn);
    this.imageFieldsWrap.appendChild(imageBtnRow);

    this.propFields.appendChild(this.imageFieldsWrap);
  }

  // Only freeform (text/shape/image) elements can be deleted — the 9
  // fixed day-card/header/logo slots are a permanent part of every layout.
  _buildDeleteSection() {
    this.deleteWrap = document.createElement("div");
    this.deleteWrap.style.marginTop = "18px";
    this.deleteElementBtn = document.createElement("button");
    this.deleteElementBtn.className = "danger";
    this.deleteElementBtn.textContent = t("layoutEditor.deleteElementBtn");
    this.deleteElementBtn.addEventListener("click", () => this._deleteSelectedElement());
    this.deleteWrap.appendChild(this.deleteElementBtn);
    this.propFields.appendChild(this.deleteWrap);
  }

  _setSelectedField(field, rawValue) {
    const el = this._draftElements.find((e) => e.id === this._selectedId);
    if (!el) return;
    let value = rawValue;
    if (field === "cx" || field === "cy") value = clamp(value, -0.5, 1.5);
    if (field === "w" || field === "h") value = clamp(value, 0.02, 2.5);
    el[field] = value;
    this._positionHandleEl(this._handleEls.get(el.id), el);
    this._renderCanvas();
  }

  // Reorders the element within _draftElements (array order = draw/z-order,
  // later = on top) and rebuilds the overlay so its DOM stacking stays in
  // sync with what's now on top in the canvas — a full rebuild is used here
  // (rather than a cheap DOM move) since it's a rare, deliberate action, not
  // a per-frame drag update.
  _bringToFront(id) {
    const idx = this._draftElements.findIndex((e) => e.id === id);
    if (idx === -1 || idx === this._draftElements.length - 1) return;
    const [el] = this._draftElements.splice(idx, 1);
    this._draftElements.push(el);
    this._renderCanvas();
    this._renderOverlay();
  }

  _sendToBack(id) {
    const idx = this._draftElements.findIndex((e) => e.id === id);
    if (idx <= 0) return;
    const [el] = this._draftElements.splice(idx, 1);
    this._draftElements.unshift(el);
    this._renderCanvas();
    this._renderOverlay();
  }

  // Freeform elements (text/shape/image) are additions on top of the fixed
  // 9 — any number can be added/removed, unlike the day cards/header/logo.
  _addFreeformElement(type, overrides = {}) {
    const el = createFreeformElement(type, overrides);
    this._draftElements.push(el);
    this._renderCanvas();
    this._renderOverlay();
    this._selectElement(el.id);
  }

  _deleteSelectedElement() {
    const id = this._selectedId;
    if (!id || CUSTOM_LAYOUT_ELEMENT_IDS.includes(id)) return; // the fixed 9 can't be deleted, only freeform extras
    const idx = this._draftElements.findIndex((e) => e.id === id);
    if (idx === -1) return;
    this._draftElements.splice(idx, 1);
    this._selectElement(null);
    this._renderCanvas();
    this._renderOverlay();
  }

  _refreshLoadSelect() {
    const current = this._loadedLibraryId;
    this.loadSelect.innerHTML = "";
    const blank = document.createElement("option");
    blank.value = "";
    blank.textContent = t("layoutEditor.unsavedDraft");
    this.loadSelect.appendChild(blank);
    listCustomLayouts().forEach((entry) => {
      const opt = document.createElement("option");
      opt.value = entry.id;
      opt.textContent = entry.name;
      this.loadSelect.appendChild(opt);
    });
    const stillExists = current && getCustomLayout(current);
    this.loadSelect.value = stillExists ? current : "";
    this.deleteLibraryBtn.disabled = !stillExists;
  }

  _renderCanvas() {
    const baseStyle = this.getBaseStyle ? this.getBaseStyle() : null;
    const draftStyle = { ...baseStyle, customLayout: { elements: this._draftElements } };
    renderStreamplan(this.canvasEl, SAMPLE_PROFILE, draftStyle, null, [CANVAS_WIDTH, CANVAS_HEIGHT]);
  }

  _positionHandleEl(div, el) {
    if (!div) return;
    div.style.left = `${(el.cx - el.w / 2) * 100}%`;
    div.style.top = `${(el.cy - el.h / 2) * 100}%`;
    div.style.width = `${el.w * 100}%`;
    div.style.height = `${el.h * 100}%`;
    div.style.transform = el.rotation ? `rotate(${el.rotation}deg)` : "";
  }

  _renderOverlay() {
    this.overlayLayer.innerHTML = "";
    this._handleEls = new Map();

    // Iterate in the elements array's own order — this is the user-
    // controlled z-order (see _bringToFront/_sendToBack), and DOM paint
    // order among unpositioned-vs-absolute siblings follows source order,
    // so this keeps "what you can click on top" matching "what you see on
    // top" in exact sync with the canvas.
    this._draftElements.forEach((el) => {
      const div = document.createElement("div");
      div.className = "layout-el-handle" + (el.id === this._selectedId ? " selected" : "");
      this._positionHandleEl(div, el);

      const label = document.createElement("div");
      label.className = "layout-el-label";
      label.textContent = elementLabel(el);
      div.appendChild(label);

      Object.keys(CORNER_SIGNS).forEach((corner) => {
        const handle = document.createElement("div");
        handle.className = `layout-el-resize ${corner}`;
        handle.addEventListener("pointerdown", (e) => this._startResize(e, el, corner));
        div.appendChild(handle);
      });

      const rotateHandle = document.createElement("div");
      rotateHandle.className = "layout-el-rotate";
      rotateHandle.addEventListener("pointerdown", (e) => this._startRotate(e, el));
      div.appendChild(rotateHandle);

      div.addEventListener("pointerdown", (e) => {
        if (e.target !== div && e.target !== label) return; // handles run their own listeners
        this._selectElement(el.id);
        this._startMove(e, el);
      });

      this.overlayLayer.appendChild(div);
      this._handleEls.set(el.id, div);
    });
  }

  _selectElement(id) {
    if (this._selectedId === id) return;
    const prev = this._handleEls.get(this._selectedId);
    if (prev) prev.classList.remove("selected");
    this._selectedId = id;
    const next = this._handleEls.get(id);
    if (next) next.classList.add("selected");
    this._refreshPropertyPanel();
  }

  _refreshPropertyPanel() {
    const el = this._draftElements.find((e) => e.id === this._selectedId);
    if (!el) {
      this.propEmpty.style.display = "";
      this.propFields.style.display = "none";
      this.propTitle.textContent = "";
      return;
    }
    this.propEmpty.style.display = "none";
    this.propFields.style.display = "";
    this.propTitle.textContent = el.type === "dayCard" ? el.id : elementLabel(el);

    const isDayCard = el.type === "dayCard";
    const isHeader = el.type === "header";
    const isDayTime = el.type === "dayTime";
    const isText = el.type === "text";
    const isShape = el.type === "shape";
    const isImage = el.type === "image";
    const isFreeform = FREEFORM_ELEMENT_TYPES.includes(el.type);

    // Corner shape / accent color are meaningless on the logo (always
    // circular, no accent-colored parts) and on text/image; the stripe
    // only exists on cards; shape honors corner shape only for rects.
    this.cornerWrap.style.display = isDayCard || isHeader || (isShape && el.shapeKind === "rect") ? "" : "none";
    this.accentWrap.style.display = isDayCard || isHeader ? "" : "none";
    this.stripeWrap.style.display = isDayCard ? "" : "none";
    this.cardStyleWrap.style.display = isDayCard ? "" : "none";
    this.fontWrap.style.display = isDayCard || isHeader || isText || isDayTime ? "" : "none";
    this.textFieldsWrap.style.display = isText ? "" : "none";
    this.shapeFieldsWrap.style.display = isShape ? "" : "none";
    this.imageFieldsWrap.style.display = isImage ? "" : "none";
    this.deleteWrap.style.display = isFreeform ? "" : "none";

    this._syncPropertyPanelValues(el);
  }

  _syncPropertyPanelValues(el) {
    const active = document.activeElement;
    if (active !== this.inputX) this.inputX.value = (el.cx * 100).toFixed(1);
    if (active !== this.inputY) this.inputY.value = (el.cy * 100).toFixed(1);
    if (active !== this.inputW) this.inputW.value = (el.w * 100).toFixed(1);
    if (active !== this.inputH) this.inputH.value = (el.h * 100).toFixed(1);
    if (active !== this.inputRot) this.inputRot.value = String(Math.round(el.rotation || 0));
    if (active !== this.cornerSelect) this.cornerSelect.value = el.cornerStyle || "";
    if (active !== this.stripeCheckbox) this.stripeCheckbox.checked = el.showStripe ?? true;
    if (active !== this.accentColorInput) {
      const baseStyle = this.getBaseStyle ? this.getBaseStyle() : null;
      this.accentColorInput.value = el.accentColor || baseStyle?.colors?.accent || "#7b5fd9";
    }
    if (active !== this.inputOpacity) this.inputOpacity.value = String(Math.round((el.opacity ?? 1) * 100));

    if (active !== this.cardStyleSelect) this.cardStyleSelect.value = el.cardStyle || "";
    if (active !== this.animSelect) this.animSelect.value = el.animStyle || "";
    if (active !== this.animIntensitySelect) this.animIntensitySelect.value = el.animIntensity || "med";

    this.fontFilenameEl.textContent = el.fontFamily ? t("layoutEditor.customFontUsing", { family: el.fontFamily }) : t("layoutEditor.usingTemplateFont");
    this._refreshFontLibrarySelect();

    if (active !== this.textArea) this.textArea.value = el.text || "";
    if (active !== this.textAlignSelect) this.textAlignSelect.value = el.align || "center";
    if (active !== this.textColorInput) {
      const baseStyle = this.getBaseStyle ? this.getBaseStyle() : null;
      this.textColorInput.value = el.color || baseStyle?.colors?.textPrimary || "#FFFFFF";
    }
    if (active !== this.textSizeInput) this.textSizeInput.value = ((el.fontSize || 0.03) * 100).toFixed(1);

    if (active !== this.shapeKindSelect) this.shapeKindSelect.value = el.shapeKind || "rect";
    if (active !== this.shapeFillInput) this.shapeFillInput.value = el.fillColor || "#7B5FD9";
    if (active !== this.shapeStrokeInput) this.shapeStrokeInput.value = el.strokeColor || "#FFFFFF";
    if (active !== this.shapeStrokeWidthInput) this.shapeStrokeWidthInput.value = String(el.strokeWidth || 0);

    this.imageFilenameEl.textContent = el.imagePath ? el.imagePath.split(/[\\/]/).pop() : t("layoutEditor.noImageChosen");
  }

  _startMove(e, el) {
    e.preventDefault();
    e.stopPropagation();
    const rect = this.canvasWrap.getBoundingClientRect();
    const startFracX = (e.clientX - rect.left) / rect.width;
    const startFracY = (e.clientY - rect.top) / rect.height;
    const startCx = el.cx;
    const startCy = el.cy;

    const move = (ev) => {
      const fx = (ev.clientX - rect.left) / rect.width;
      const fy = (ev.clientY - rect.top) / rect.height;
      let cx = startCx + (fx - startFracX);
      let cy = startCy + (fy - startFracY);
      cx = snapAxis(clamp(cx, -0.5, 1.5), el.w / 2);
      cy = snapAxis(clamp(cy, -0.5, 1.5), el.h / 2);
      el.cx = cx;
      el.cy = cy;
      this._positionHandleEl(this._handleEls.get(el.id), el);
      this._renderCanvas();
      this._syncPropertyPanelValues(el);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  _startResize(e, el, corner) {
    e.preventDefault();
    e.stopPropagation();
    this._selectElement(el.id);
    const rect = this.canvasWrap.getBoundingClientRect();
    const origCx = el.cx;
    const origCy = el.cy;
    const rotation = el.rotation || 0;
    const [dsx, dsy] = CORNER_SIGNS[corner];
    const fixedLocal = { x: -dsx * (el.w / 2), y: -dsy * (el.h / 2) };

    const move = (ev) => {
      const fx = (ev.clientX - rect.left) / rect.width;
      const fy = (ev.clientY - rect.top) / rect.height;
      const p = toLocalPoint(fx, fy, origCx, origCy, rotation);
      const newW = clamp(Math.abs(p.x - fixedLocal.x), 0.02, 2.5);
      const newH = clamp(Math.abs(p.y - fixedLocal.y), 0.02, 2.5);
      const draggedLocal = { x: fixedLocal.x + dsx * newW, y: fixedLocal.y + dsy * newH };
      const newLocalCenter = { x: (fixedLocal.x + draggedLocal.x) / 2, y: (fixedLocal.y + draggedLocal.y) / 2 };
      const newCenter = toCanvasPoint(newLocalCenter.x, newLocalCenter.y, origCx, origCy, rotation);
      el.cx = clamp(newCenter.x, -0.5, 1.5);
      el.cy = clamp(newCenter.y, -0.5, 1.5);
      el.w = newW;
      el.h = newH;
      this._positionHandleEl(this._handleEls.get(el.id), el);
      this._renderCanvas();
      this._syncPropertyPanelValues(el);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  _startRotate(e, el) {
    e.preventDefault();
    e.stopPropagation();
    this._selectElement(el.id);
    const rect = this.canvasWrap.getBoundingClientRect();

    const move = (ev) => {
      const fx = (ev.clientX - rect.left) / rect.width;
      const fy = (ev.clientY - rect.top) / rect.height;
      // atan2 needs real on-screen pixels (rect.width/height), not raw
      // 0-1 fractions — the canvas isn't square (1400x1750), so angles
      // computed directly on fractions would be skewed.
      const px = fx * rect.width;
      const py = fy * rect.height;
      const cxPx = el.cx * rect.width;
      const cyPx = el.cy * rect.height;
      let angle = (Math.atan2(py - cyPx, px - cxPx) * 180) / Math.PI + 90;
      angle = Math.round(angle);
      if (angle > 180) angle -= 360;
      if (angle < -180) angle += 360;
      el.rotation = angle;
      this._positionHandleEl(this._handleEls.get(el.id), el);
      this._renderCanvas();
      this._syncPropertyPanelValues(el);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  // Shared by the in-editor "Import…" button and the topBar "Import Layout"
  // button: runs the file picker, reads + parses the .splayout file, and adds
  // it to the permanent library. Returns the new library entry, or null if
  // the user canceled or the file was invalid (an error dialog is already
  // shown in that case, so callers just need to bail out silently).
  async _importLayoutFromDialog() {
    let targetPath;
    try {
      targetPath = await window.streamplanAPI.chooseOpenLayoutPath();
    } catch (err) {
      await window.streamplanAPI.showMessage("error", t("common.importFailedTitle"), t("common.fileDialogError", { message: err.message }));
      return null;
    }
    if (!targetPath) return null;
    try {
      const bytes = await window.streamplanAPI.readFile(targetPath);
      const parsed = JSON.parse(new TextDecoder().decode(bytes));
      if (!parsed || !parsed.elements) throw new Error(t("layoutEditor.invalidLayoutFile"));
      return addCustomLayout({ name: parsed.name || "Imported Layout", elements: parsed.elements });
    } catch (err) {
      console.error(err);
      await window.streamplanAPI.showMessage("error", t("common.importFailedTitle"), t("layoutEditor.importLayoutFailed", { message: err.message }));
      return null;
    }
  }

  // Entry point for the topBar "Import Layout" button: imports a .splayout
  // file straight into the permanent library (no template context needed)
  // and opens the editor showing it, so the user gets immediate visual
  // confirmation of what was just imported. `onClose` (passed through to
  // open()) lets app.js refresh the Template Customize tab's Layout Style
  // dropdown once this session ends, so the just-imported layout actually
  // shows up as a pickable option there instead of only living in memory
  // until some unrelated refresh happens to fire.
  async importAndOpen(onClose) {
    const entry = await this._importLayoutFromDialog();
    if (!entry) return;
    this.openLibraryEntry(entry, onClose);
  }

  // Shared tail of importAndOpen(): opens the editor pre-loaded and selected
  // on a library entry that already exists (already added via addCustomLayout
  // elsewhere — e.g. app.js's streamplan-maker:// deep-link handler, which
  // fetches+adds the entry itself before calling this).
  openLibraryEntry(entry, onClose) {
    this.open({ elements: entry.elements, onClose });
    this._loadedLibraryId = entry.id;
    this.nameInput.value = entry.name;
    this._refreshLoadSelect();
  }

  // { elements, onApply, onClose } — elements: existing draft to load
  // (defaults to a fresh seeded layout); onApply: present only when opened
  // from a Custom Template's Template Customize tab, writes the draft back
  // on "Apply"; onClose: always invoked once the editor is dismissed
  // (whether via Apply or a plain Close), so callers can refresh their own
  // UI — e.g. the Layout Style dropdown's option list, which needs to pick
  // up any layout the user saved to the library during this session even if
  // they never clicked Apply.
  open({ elements, onApply, onClose } = {}) {
    this._draftElements = elements ? sanitizeCustomLayout(elements) : buildDefaultCustomLayoutElements();
    this._onApply = onApply || null;
    this._onClose = onClose || null;
    this._loadedLibraryId = null;
    this.nameInput.value = "";
    this.applyBtn.style.display = this._onApply ? "" : "none";
    this._refreshLoadSelect();
    this._selectElement(null);
    this.overlayEl.classList.add("open");
    this._renderCanvas();
    this._renderOverlay();
    this._startAnimTicker();
  }

  openStandalone(onClose) {
    this.open({ onClose });
  }

  close() {
    this.overlayEl.classList.remove("open");
    this._onApply = null; // draft is discarded; the live style was never touched
    this._stopAnimTicker();
    const onClose = this._onClose;
    this._onClose = null;
    if (onClose) onClose();
  }

  // renderStreamplan always gets t=null from _renderCanvas (a plain,
  // non-GIF-export render) — animation phase only advances via
  // resolvePhase's wall-clock fallback, which requires something to
  // actually keep calling _renderCanvas() while idle. Without this ticker,
  // per-element animStyle would never be visible while editing (only in an
  // exported GIF, which drives its own t timeline). Mirrors
  // previewCanvas.js's _startStickerTicker, scoped to this editor's own
  // lifecycle (started on open(), stopped on close()) instead of the app's.
  _startAnimTicker() {
    this._stopAnimTicker();
    this._animTickHandle = setInterval(() => {
      const animated = this._draftElements.some((el) => el.animStyle && el.animStyle !== "none");
      if (animated) this._renderCanvas();
    }, ANIM_TICK_MS);
  }

  _stopAnimTicker() {
    if (this._animTickHandle) clearInterval(this._animTickHandle);
    this._animTickHandle = null;
  }
}
