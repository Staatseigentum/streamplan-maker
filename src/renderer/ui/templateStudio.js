// The Template Studio: a full-viewport editor that unifies what used to be
// split across two places — the sidebar's "Template Customize" tab (global
// style: colors, fonts, background, images) and the standalone Layout
// Editor (drag/resize/rotate the 9+ canvas elements) — into ONE overlay with
// a live canvas in the middle and an icon tab rail + tool panel on the right
// (FARBEN/SCHRIFT/GRUND/ELEMENT/STICKER). Also home to design tools that
// don't exist anywhere else: a multi-stop gradient editor, procedural
// background textures, and per-element drop shadows.
// The draft is a deep-cloned working copy at all times — nothing here ever
// touches the live document style until "Auf Projekt anwenden" (or a
// library Save/Export) is explicitly clicked.
//
// UI shell: the "Gestalten / Design" mode — a warm, glow-driven workspace
// styled entirely via styles/templateStudio.css's .ts-* classes,
// deliberately distinct from the Layout Editor's cool "Anordnen" mode (see
// layoutEditor.js).
import { CANVAS_WIDTH, CANVAS_HEIGHT, DAY_NAMES, TEMPLATE_FILE_EXTENSION } from "../../shared/constants.js";
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
  COLOR_KEYS,
  FONT_SCALE_MIN,
  FONT_SCALE_MAX,
  BACKGROUND_TEXTURES,
  cloneStyle,
  styleToDict,
  styleFromDict,
  setBackgroundColor,
  syncGradientPairFromStops,
} from "../models/style.js";
import { customBaseStyle } from "../models/templates.js";
import { addCustomTemplate, updateCustomTemplate, removeCustomTemplate, getCustomTemplate, isCustomTemplateId } from "../models/customTemplateLibrary.js";
import { listCustomLayouts, getCustomLayout } from "../models/customLayoutLibrary.js";
import {
  colorLabels,
  cornerLabels,
  bgModeLabels,
  backgroundAnimLabels,
  buildSelectRow,
  buildFontSelectRow,
  buildCustomImageEditor,
} from "./stylePanel.js";
import { buildSliderRow } from "./formControls.js";
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
function backgroundTextureLabels() {
  return {
    none: t("templateStudio.textureNone"),
    grain: t("templateStudio.textureGrain"),
    dots: t("templateStudio.textureDots"),
    diagonal: t("templateStudio.textureDiagonal"),
    grid: t("templateStudio.textureGrid"),
  };
}
// CSS-only preview patterns for the texture tiles — the real procedural
// texture rendering stays entirely in rendering/renderer.js; these are just
// a visual hint of what each option looks like.
const TEXTURE_PREVIEWS = {
  grain: { image: "radial-gradient(rgba(255,255,255,.22) .5px, transparent .5px)", size: "3px 3px" },
  dots: { image: "radial-gradient(rgba(255,255,255,.28) 1.2px, transparent 1.2px)", size: "8px 8px" },
  diagonal: { image: "repeating-linear-gradient(45deg, rgba(255,255,255,.16) 0 1px, transparent 1px 7px)", size: null },
  grid: {
    image: "linear-gradient(rgba(255,255,255,.16) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.16) 1px, transparent 1px)",
    size: "8px 8px",
  },
};
const ANIM_TICK_MS = 1000 / 30;

// All 7 days populated (unlike the 3-day gallery-thumbnail sample) so every
// day card is always visible/draggable while editing, mirroring the Layout
// Editor's own sample profile.
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
  return cleaned || "custom_template";
}

// Same rotation/point math as layoutEditor.js — kept in sync deliberately;
// see that file's comments for why this convention matches Canvas2D/CSS.
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

const SNAP_THRESHOLD = 0.012;
function snapAxis(center, halfSize) {
  for (const candidate of [0.5, halfSize, 1 - halfSize]) {
    if (Math.abs(center - candidate) < SNAP_THRESHOLD) return candidate;
  }
  return center;
}

const CORNER_SIGNS = { nw: [-1, -1], ne: [1, -1], sw: [-1, 1], se: [1, 1] };

const GRADIENT_STOP_COLORS = ["#7B5FD9", "#4FFFD1", "#FF5C8A", "#FFD24C"];

export class TemplateStudio {
  constructor(overlayEl, { onApplyToProject }) {
    this.overlayEl = overlayEl;
    this.onApplyToProject = onApplyToProject || null;
    // A real (not null) placeholder before the first open() — _build() runs
    // synchronously below and several row-builders (e.g. the swatch cards)
    // read the current style immediately to set their initial displayed
    // value, not just lazily on change.
    this._draftStyle = customBaseStyle();
    this._draftStyle.customLayout = { elements: buildDefaultCustomLayoutElements() };
    this._onClose = null;
    this._loadedLibraryId = null;
    this._selectedId = null;
    this._handleEls = new Map();
    this._styleRefreshers = [];
    this._activeToolTab = "colors";
    this._build();
  }

  // customLayout.elements is always present once open() has run (seeded if
  // missing) — this getter lets every element-manipulation method below
  // reference `this._draftElements` exactly like layoutEditor.js's methods
  // do, without duplicating a separate array field to keep in sync.
  get _draftElements() {
    return this._draftStyle.customLayout.elements;
  }

  _isLocked() {
    return !!(this._draftStyle && this._draftStyle.layoutLocked);
  }

  _build() {
    this.overlayEl.innerHTML = "";
    const shell = document.createElement("div");
    shell.className = "ts-shell";
    this._lockableEls = [];

    shell.appendChild(this._buildTopbar());

    const body = document.createElement("div");
    body.className = "ts-body";
    body.appendChild(this._buildCanvasArea());
    body.appendChild(this._buildIconRail());
    body.appendChild(this._buildToolPanel());
    shell.appendChild(body);

    this.overlayEl.appendChild(shell);
    this.shellEl = shell;

    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.overlayEl.classList.contains("open")) this.close();
    });
  }

  // -- Topbar -----------------------------------------------------------

  _buildTopbar() {
    const topbar = document.createElement("div");
    topbar.className = "ts-topbar";
    this.topbarEl = topbar;

    const brand = document.createElement("div");
    brand.className = "ts-brand";
    const glyph = document.createElement("div");
    glyph.className = "ts-brand-glyph";
    const brandText = document.createElement("div");
    brandText.className = "ts-brand-text";
    const title = document.createElement("div");
    title.className = "ts-title";
    title.textContent = t("templateStudio.title");
    const subtitle = document.createElement("div");
    subtitle.className = "ts-subtitle";
    subtitle.textContent = t("templateStudio.modeSubtitle");
    brandText.append(title, subtitle);
    brand.append(glyph, brandText);
    topbar.appendChild(brand);

    const divider = document.createElement("div");
    divider.className = "ts-divider";
    topbar.appendChild(divider);

    const nameWrap = document.createElement("div");
    nameWrap.className = "ts-name-wrap";
    this.nameInput = document.createElement("input");
    this.nameInput.type = "text";
    this.nameInput.className = "ts-name-input";
    this.nameInput.placeholder = t("style.templateNamePlaceholder");
    this.paletteStripEl = document.createElement("div");
    this.paletteStripEl.className = "ts-palette-strip";
    nameWrap.append(this.nameInput, this.paletteStripEl);
    topbar.appendChild(nameWrap);

    this.lockBadge = document.createElement("div");
    this.lockBadge.className = "ts-lock-badge";
    this.lockBadge.style.display = "none";
    const lockIcon = document.createElement("span");
    lockIcon.className = "ts-lock-badge-icon";
    lockIcon.textContent = "🔒";
    const lockText = document.createElement("span");
    lockText.className = "ts-lock-badge-text";
    lockText.textContent = t("templateStudio.lockedBadge");
    this.lockBadge.append(lockIcon, lockText);
    topbar.appendChild(this.lockBadge);

    const spacer = document.createElement("div");
    spacer.className = "ts-spacer";
    topbar.appendChild(spacer);

    const closeBtn = document.createElement("button");
    closeBtn.className = "ts-btn-close";
    closeBtn.textContent = t("layoutEditor.closeBtn");
    closeBtn.addEventListener("click", () => this.close());
    topbar.appendChild(closeBtn);

    this.applyBtn = document.createElement("button");
    this.applyBtn.className = "ts-btn-primary";
    this.applyBtn.textContent = t("templateStudio.applyBtn");
    this.applyBtn.addEventListener("click", () => {
      if (this.onApplyToProject) this.onApplyToProject(cloneStyle(this._draftStyle));
      this.close();
    });
    topbar.appendChild(this.applyBtn);

    return topbar;
  }

  // -- Canvas area --------------------------------------------------------

  _buildCanvasArea() {
    const area = document.createElement("div");
    area.className = "ts-canvas-area";

    this.canvasWrap = document.createElement("div");
    this.canvasWrap.className = "ts-canvas-wrap";

    this.canvasEl = document.createElement("canvas");
    this.canvasEl.className = "ts-canvas";
    this.canvasWrap.appendChild(this.canvasEl);

    this.overlayLayer = document.createElement("div");
    this.overlayLayer.className = "ts-overlay-layer";
    this.canvasWrap.appendChild(this.overlayLayer);

    this.selectionPillEl = document.createElement("div");
    this.selectionPillEl.className = "ts-selection-pill";
    const dot = document.createElement("span");
    dot.className = "ts-selection-dot";
    this.selectionNameEl = document.createElement("span");
    this.selectionNameEl.className = "ts-selection-name";
    const sep = document.createElement("span");
    sep.className = "ts-selection-sep";
    const link = document.createElement("button");
    link.className = "ts-selection-link";
    link.type = "button";
    link.textContent = t("templateStudio.designElementLink");
    link.addEventListener("click", () => this._activateToolTab("element"));
    this.selectionPillEl.append(dot, this.selectionNameEl, sep, link);
    this.canvasWrap.appendChild(this.selectionPillEl);

    this.canvasWrap.addEventListener("pointerdown", (e) => {
      if (e.target === this.canvasWrap || e.target === this.canvasEl) this._selectElement(null);
    });

    area.appendChild(this.canvasWrap);
    area.appendChild(this._buildAddButtons());

    return area;
  }

  _buildAddButtons() {
    const wrap = document.createElement("div");
    wrap.className = "ts-add-buttons";

    const addTextBtn = document.createElement("button");
    addTextBtn.className = "ts-add-btn";
    addTextBtn.textContent = t("layoutEditor.addText");
    addTextBtn.addEventListener("click", () => this._addFreeformElement("text"));
    this._lockableEls.push(addTextBtn);
    wrap.appendChild(addTextBtn);

    const shapeMenu = this._buildShapeAddMenu();
    this._lockableEls.push(shapeMenu.querySelector("button"));
    wrap.appendChild(shapeMenu);

    const addImageBtn = document.createElement("button");
    addImageBtn.className = "ts-add-btn";
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
    this._lockableEls.push(addImageBtn);
    wrap.appendChild(addImageBtn);

    return wrap;
  }

  // Same pattern as layoutEditor.js's "+ Shape" dropdown — a small custom
  // menu so a shape is added as the kind the user actually picked.
  _buildShapeAddMenu() {
    const wrap = document.createElement("div");
    wrap.className = "sp-menu";

    const menuBtn = document.createElement("button");
    menuBtn.className = "ts-add-btn";
    menuBtn.textContent = `${t("layoutEditor.addShape")} ▾`;
    wrap.appendChild(menuBtn);

    const list = document.createElement("div");
    list.className = "sp-menu-list";
    list.setAttribute("role", "menu");
    list.setAttribute("aria-label", t("layoutEditor.addShapeMenuTitle"));

    const labels = shapeKindLabels();
    SHAPE_KINDS.forEach((kind) => {
      const item = document.createElement("button");
      item.className = "sp-menu-item";
      item.type = "button";
      const icon = document.createElement("span");
      icon.className = "sp-menu-item-icon";
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

    return wrap;
  }

  async _exportLocal() {
    const name = this.nameInput.value.trim() || "Custom Template";
    const defaultName = `${sanitizeFilename(name)}${TEMPLATE_FILE_EXTENSION}`;
    let targetPath;
    try {
      targetPath = await window.streamplanAPI.chooseSaveTemplatePath(defaultName);
    } catch (err) {
      await window.streamplanAPI.showMessage("error", t("common.exportFailedTitle"), t("common.saveDialogError", { message: err.message }));
      return;
    }
    if (!targetPath) return;
    try {
      const payload = { name, style: styleToDict(this._draftStyle) };
      const bytes = new TextEncoder().encode(JSON.stringify(payload, null, 2));
      await window.streamplanAPI.writeFile(targetPath, bytes);
    } catch (err) {
      console.error(err);
      await window.streamplanAPI.showMessage("error", t("common.exportFailedTitle"), err.message);
    }
  }

  // Prepares the template for Streamplan Hub and hands off to the site's
  // own upload page, rather than publishing it directly from here — that
  // way the user still gets a chance to add a preview image or tweak the
  // name in the site's own form before it actually goes live. A name is
  // required here even though local export happily falls back to "Custom
  // Template": an unnamed upload would show up on the community site with
  // nothing to identify it by.
  async _uploadToHub() {
    const name = this.nameInput.value.trim();
    if (!name) {
      await window.streamplanAPI.showMessage("error", t("common.uploadNoNameTitle"), t("common.uploadNoNameError"));
      return;
    }
    const prevText = this._exportMenuBtn ? this._exportMenuBtn.textContent : "";
    if (this._exportMenuBtn) {
      this._exportMenuBtn.disabled = true;
      this._exportMenuBtn.textContent = t("common.uploadingEllipsis");
    }
    try {
      const payload = { name, style: styleToDict(this._draftStyle) };
      const bytes = new TextEncoder().encode(JSON.stringify(payload, null, 2));
      const filename = `${sanitizeFilename(name)}${TEMPLATE_FILE_EXTENSION}`;
      const filePath = await window.streamplanAPI.writeTempFile(filename, bytes);
      await window.streamplanAPI.showItemInFolder(filePath);
      await window.streamplanAPI.showMessage("info", t("common.uploadReadyTitle"), t("common.uploadReadyBody", { filename }));
      await window.streamplanAPI.openExternal(`https://streamplan-maker.online/upload?type=template&name=${encodeURIComponent(name)}`);
    } catch (err) {
      console.error(err);
      await window.streamplanAPI.showMessage("error", t("common.uploadFailedTitle"), err.message);
    } finally {
      if (this._exportMenuBtn) {
        this._exportMenuBtn.disabled = false;
        this._exportMenuBtn.textContent = prevText;
      }
    }
  }

  async _importTemplate() {
    let targetPath;
    try {
      targetPath = await window.streamplanAPI.chooseOpenTemplatePath();
    } catch (err) {
      await window.streamplanAPI.showMessage("error", t("common.importFailedTitle"), t("common.fileDialogError", { message: err.message }));
      return;
    }
    if (!targetPath) return;
    try {
      const bytes = await window.streamplanAPI.readFile(targetPath);
      const parsed = JSON.parse(new TextDecoder().decode(bytes));
      if (!parsed || !parsed.style) throw new Error(t("style.invalidTemplateFile"));
      const importedStyle = styleFromDict(parsed.style);
      // Same rule as the sidebar's own import flow: a file from outside
      // this session always comes in locked, regardless of what it claims.
      importedStyle.layoutLocked = true;
      const entry = addCustomTemplate({ name: parsed.name || "Imported Template", style: importedStyle });
      entry.style.templateId = entry.id;
      this._loadStyle(cloneStyle(entry.style));
    } catch (err) {
      console.error(err);
      await window.streamplanAPI.showMessage("error", t("common.importFailedTitle"), t("style.importTemplateFailed", { message: err.message }));
    }
  }

  // -- Icon rail ------------------------------------------------------------

  _buildIconRail() {
    const rail = document.createElement("div");
    rail.className = "ts-icon-rail";
    this.iconRailEl = rail;

    const defs = [
      ["colors", "◐", "templateStudio.tabColors"],
      ["type", "Aa", "templateStudio.tabType"],
      ["ground", "▧", "templateStudio.tabGround"],
      ["element", "◈", "templateStudio.tabElementShort"],
      ["stickers", "✦", "templateStudio.tabStickers"],
    ];
    this._tabBtns = {};
    defs.forEach(([key, glyph, labelKey]) => {
      const tab = document.createElement("button");
      tab.className = "ts-tab";
      const g = document.createElement("span");
      g.className = "ts-tab-glyph";
      g.textContent = glyph;
      const l = document.createElement("span");
      l.className = "ts-tab-label";
      l.textContent = t(labelKey);
      tab.append(g, l);
      tab.addEventListener("click", () => this._activateToolTab(key));
      rail.appendChild(tab);
      this._tabBtns[key] = tab;
    });

    return rail;
  }

  _activateToolTab(key) {
    this._activeToolTab = key;
    Object.entries(this._tabBtns).forEach(([k, btn]) => btn.classList.toggle("active", k === key));
    Object.entries(this._tabPanels).forEach(([k, panel]) => panel.classList.toggle("active", k === key));
  }

  // -- Tool panel -------------------------------------------------------

  _buildToolPanel() {
    const panel = document.createElement("div");
    panel.className = "ts-tool-panel";
    this.toolPanelEl = panel;

    const content = document.createElement("div");
    content.className = "ts-panel-content";
    this._tabPanels = {};
    const colorsTab = document.createElement("div");
    colorsTab.className = "ts-panel-tab active";
    this._buildColorsTab(colorsTab);
    this._tabPanels.colors = colorsTab;

    const typeTab = document.createElement("div");
    typeTab.className = "ts-panel-tab";
    this._buildTypeTab(typeTab);
    this._tabPanels.type = typeTab;

    const groundTab = document.createElement("div");
    groundTab.className = "ts-panel-tab";
    this._buildGroundTab(groundTab);
    this._tabPanels.ground = groundTab;

    const elementTab = document.createElement("div");
    elementTab.className = "ts-panel-tab";
    this._buildElementTab(elementTab);
    this._tabPanels.element = elementTab;

    const stickersTab = document.createElement("div");
    stickersTab.className = "ts-panel-tab";
    this._buildStickersTab(stickersTab);
    this._tabPanels.stickers = stickersTab;

    content.append(colorsTab, typeTab, groundTab, elementTab, stickersTab);
    panel.appendChild(content);
    this.panelFootEl = this._buildPanelFoot();
    panel.appendChild(this.panelFootEl);

    return panel;
  }

  _panelTitle(container, titleText, hintText) {
    const title = document.createElement("div");
    title.className = "ts-panel-title";
    title.textContent = titleText;
    container.appendChild(title);
    if (hintText) {
      const desc = document.createElement("div");
      desc.className = "ts-panel-desc";
      desc.textContent = hintText;
      container.appendChild(desc);
    }
  }

  _sectionHeader(container, text) {
    const header = document.createElement("div");
    header.className = "ts-section-header";
    header.textContent = text;
    container.appendChild(header);
    return header;
  }

  // -- FARBEN tab -----------------------------------------------------------

  _buildColorsTab(panel) {
    this._panelTitle(panel, t("templateStudio.colorsTitle"), t("templateStudio.colorsHint"));

    const grid = document.createElement("div");
    grid.className = "ts-swatch-grid";
    const labels = colorLabels();
    COLOR_KEYS.forEach((key) => {
      const card = document.createElement("div");
      card.className = "ts-swatch-card";
      const colorInput = document.createElement("input");
      colorInput.type = "color";
      colorInput.className = "ts-swatch-color";
      const info = document.createElement("div");
      info.className = "ts-swatch-info";
      const name = document.createElement("div");
      name.className = "ts-swatch-name";
      name.textContent = labels[key] || key;
      const hex = document.createElement("div");
      hex.className = "ts-swatch-hex";
      info.append(name, hex);
      colorInput.addEventListener("input", () => {
        // Writes through to the first/last gradient stop for the two background
        // colours — otherwise this swatch stops affecting the render once the
        // gradient editor below has created a stops list. See setBackgroundColor.
        setBackgroundColor(this._draftStyle, key, colorInput.value);
        hex.textContent = colorInput.value.toUpperCase();
        this._onStyleChange();
        this._refreshGradientSection();
      });
      card.append(colorInput, info);
      grid.appendChild(card);
      const refresh = () => {
        const value = this._draftStyle.colors[key] || "#000000";
        colorInput.value = value;
        hex.textContent = value.toUpperCase();
      };
      refresh();
      this._styleRefreshers.push(refresh);
    });
    panel.appendChild(grid);

    this._sectionHeader(panel, t("style.backgroundLabel"));
    const { el: segEl, refresh: segRefresh } = this._buildSegmented(
      bgModeLabels(),
      () => this._draftStyle.backgroundMode,
      (value) => {
        this._draftStyle.backgroundMode = value;
        this._onStyleChange();
        this._refreshGradientSection();
        this._refreshTextureTiles();
      }
    );
    segEl.style.marginBottom = "14px";
    panel.appendChild(segEl);
    this._styleRefreshers.push(segRefresh);
    this.bgModeRowEl = segEl;

    this._buildGradientSection(panel);
    this._buildTextureSection(panel);
  }

  _buildSegmented(options, getValue, onChange) {
    const wrap = document.createElement("div");
    wrap.className = "ts-segmented";
    const buttons = {};
    Object.entries(options).forEach(([value, label]) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ts-segment";
      btn.textContent = label;
      btn.addEventListener("click", () => {
        onChange(value);
        refresh();
      });
      buttons[value] = btn;
      wrap.appendChild(btn);
    });
    const refresh = () => {
      const current = getValue();
      Object.entries(buttons).forEach(([value, btn]) => btn.classList.toggle("active", value === current));
    };
    refresh();
    return { el: wrap, refresh };
  }

  // Multi-stop gradient editor: a horizontal bar with draggable diamond
  // stops. Drag = reposition, click (no movement) = open the stop's color
  // picker, double-click the bar = insert a stop, right-click a stop =
  // remove it (while more than 2 remain). Only shown once backgroundMode is
  // "gradient" — starts with exactly 2 stops (background → backgroundEnd)
  // the first time that mode is picked, functionally identical to the
  // template's plain 2-color fade until a stop is actually added.
  _buildGradientSection(panel) {
    this.gradientSectionEl = document.createElement("div");

    this._sectionHeader(this.gradientSectionEl, t("templateStudio.gradientHeader"));

    this.gradientBarEl = document.createElement("div");
    this.gradientBarEl.className = "ts-gradient-bar";
    this.gradientBarEl.addEventListener("dblclick", (e) => {
      const stops = this._draftStyle.backgroundGradientStops;
      if (!stops || e.target !== this.gradientBarEl) return;
      const rect = this.gradientBarEl.getBoundingClientRect();
      const offset = clamp((e.clientX - rect.left) / rect.width, 0, 1);
      const color = GRADIENT_STOP_COLORS[stops.length % GRADIENT_STOP_COLORS.length];
      stops.push({ offset, color });
      stops.sort((a, b) => a.offset - b.offset);
      this._onStyleChange();
      this._refreshGradientSection();
    });
    this.gradientSectionEl.appendChild(this.gradientBarEl);

    const foot = document.createElement("div");
    foot.className = "ts-gradient-foot";
    const hint = document.createElement("div");
    hint.className = "ts-gradient-hint";
    hint.textContent = t("templateStudio.gradientHint");
    const angleChip = document.createElement("div");
    angleChip.className = "ts-angle-chip";
    const angleLabel = document.createElement("label");
    angleLabel.textContent = t("templateStudio.gradientAngleLabel");
    this.gradientAngleInput = document.createElement("input");
    this.gradientAngleInput.type = "number";
    this.gradientAngleInput.min = "0";
    this.gradientAngleInput.max = "360";
    this.gradientAngleInput.step = "1";
    this.gradientAngleInput.addEventListener("input", () => {
      const v = Number(this.gradientAngleInput.value);
      if (Number.isFinite(v)) {
        this._draftStyle.backgroundGradientAngle = clamp(v, 0, 360);
        this._onStyleChange();
      }
    });
    angleChip.append(angleLabel, this.gradientAngleInput);
    foot.append(hint, angleChip);
    this.gradientSectionEl.appendChild(foot);

    panel.appendChild(this.gradientSectionEl);
    this._styleRefreshers.push(() => this._refreshGradientSection());
    this._refreshGradientSection();
  }

  _refreshGradientSection() {
    if (!this.gradientSectionEl) return;
    const style = this._draftStyle;
    const isGradientMode = style.backgroundMode === "gradient";
    this.gradientSectionEl.style.display = isGradientMode ? "" : "none";
    if (!isGradientMode) return;

    if (!style.backgroundGradientStops) {
      style.backgroundGradientStops = [
        { offset: 0, color: style.colors.background || "#0A0A0F" },
        { offset: 1, color: style.colors.backgroundEnd || style.colors.background || "#0A0A0F" },
      ];
    }
    const stops = style.backgroundGradientStops;
    this.gradientAngleInput.value = String(Math.round(style.backgroundGradientAngle ?? 180));

    const sorted = [...stops].sort((a, b) => a.offset - b.offset);
    this.gradientBarEl.style.background = `linear-gradient(90deg, ${sorted
      .map((s) => `${s.color} ${(s.offset * 100).toFixed(1)}%`)
      .join(", ")})`;

    this.gradientBarEl.querySelectorAll(".ts-gradient-stop, input[type=color]").forEach((n) => n.remove());
    stops.forEach((stop) => {
      const diamond = document.createElement("div");
      diamond.className = "ts-gradient-stop";
      diamond.style.left = `${stop.offset * 100}%`;
      diamond.style.background = stop.color;

      const colorInput = document.createElement("input");
      colorInput.type = "color";
      colorInput.value = stop.color;
      colorInput.style.cssText = "position:absolute;width:0;height:0;opacity:0;pointer-events:none;";
      colorInput.addEventListener("input", () => {
        stop.color = colorInput.value;
        // Mirror the outer stops back onto colors.background/backgroundEnd so
        // the Customize panel's swatches keep showing what's actually drawn.
        syncGradientPairFromStops(this._draftStyle);
        this._onStyleChange();
        this._refreshGradientSection();
      });

      diamond.addEventListener("pointerdown", (e) => this._startGradientStopDrag(e, stop, stops, colorInput));
      diamond.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        if (stops.length <= 2) return;
        const idx = stops.indexOf(stop);
        if (idx !== -1) {
          stops.splice(idx, 1);
          syncGradientPairFromStops(this._draftStyle);
          this._onStyleChange();
          this._refreshGradientSection();
        }
      });

      this.gradientBarEl.append(diamond, colorInput);
    });
  }

  _startGradientStopDrag(e, stop, stops, colorInput) {
    e.preventDefault();
    e.stopPropagation();
    const rect = this.gradientBarEl.getBoundingClientRect();
    const startX = e.clientX;
    let moved = false;
    const move = (ev) => {
      if (Math.abs(ev.clientX - startX) > 3) moved = true;
      if (!moved) return;
      stop.offset = clamp((ev.clientX - rect.left) / rect.width, 0, 1);
      this._onStyleChange();
      this._refreshGradientSection();
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (moved) {
        stops.sort((a, b) => a.offset - b.offset);
        // Dragging can change which stop is first/last, so re-mirror the pair.
        syncGradientPairFromStops(this._draftStyle);
        this._onStyleChange();
        this._refreshGradientSection();
      } else {
        colorInput.click();
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  // Procedural, asset-free background texture overlay.
  _buildTextureSection(panel) {
    this._sectionHeader(panel, t("templateStudio.textureHeader"));
    const row = document.createElement("div");
    row.className = "ts-texture-row";
    const labels = backgroundTextureLabels();
    this._textureTiles = {};
    BACKGROUND_TEXTURES.forEach((key) => {
      const tile = document.createElement("button");
      tile.type = "button";
      tile.className = "ts-texture-tile";
      const preview = TEXTURE_PREVIEWS[key];
      if (preview) {
        tile.style.backgroundImage = preview.image;
        if (preview.size) tile.style.backgroundSize = preview.size;
      }
      const label = document.createElement("span");
      label.className = "ts-texture-tile-label";
      label.textContent = labels[key];
      tile.appendChild(label);
      tile.addEventListener("click", () => {
        this._draftStyle.backgroundTexture = key;
        this._onStyleChange();
        this._refreshTextureTiles();
      });
      this._textureTiles[key] = tile;
      row.appendChild(tile);
    });
    panel.appendChild(row);

    const opacityRow = buildSliderRow(
      t("templateStudio.textureOpacityLabel"),
      0.02,
      0.6,
      0.01,
      () => this._draftStyle.backgroundTextureOpacity ?? 0.15,
      (value) => {
        this._draftStyle.backgroundTextureOpacity = value;
        this._onStyleChange();
      }
    );
    panel.appendChild(opacityRow.el);
    this.textureOpacityWrap = opacityRow.el;
    this._styleRefreshers.push(opacityRow.refresh);
    this._styleRefreshers.push(() => this._refreshTextureTiles());
    this._refreshTextureTiles();
  }

  _refreshTextureTiles() {
    if (!this._textureTiles) return;
    const active = this._draftStyle.backgroundTexture || "none";
    Object.entries(this._textureTiles).forEach(([key, tile]) => tile.classList.toggle("active", key === active));
    if (this.textureOpacityWrap) this.textureOpacityWrap.style.display = active !== "none" ? "" : "none";
  }

  // -- SCHRIFT tab ------------------------------------------------------

  _buildTypeTab(panel) {
    this._panelTitle(panel, t("style.fontsHeader"));

    const headingRow = buildFontSelectRow(
      t("style.headingFontLabel"),
      () => this._draftStyle.fontHeading,
      (font) => {
        this._draftStyle.fontHeading = font;
        this._onStyleChange();
      }
    );
    panel.appendChild(headingRow.el);
    this._styleRefreshers.push(headingRow.refresh);

    const bodyRow = buildFontSelectRow(
      t("style.bodyFontLabel"),
      () => this._draftStyle.fontBody,
      (font) => {
        this._draftStyle.fontBody = font;
        this._onStyleChange();
      }
    );
    panel.appendChild(bodyRow.el);
    this._styleRefreshers.push(bodyRow.refresh);

    this._sectionHeader(panel, t("style.textSizeHeader"));

    const headingSizeRow = buildSliderRow(
      t("style.headingSizeLabel"),
      FONT_SCALE_MIN,
      FONT_SCALE_MAX,
      0.05,
      () => this._draftStyle.headingScale,
      (value) => {
        this._draftStyle.headingScale = value;
        this._onStyleChange();
      }
    );
    panel.appendChild(headingSizeRow.el);
    this._styleRefreshers.push(headingSizeRow.refresh);

    const bodySizeRow = buildSliderRow(
      t("style.bodySizeLabel"),
      FONT_SCALE_MIN,
      FONT_SCALE_MAX,
      0.05,
      () => this._draftStyle.bodyScale,
      (value) => {
        this._draftStyle.bodyScale = value;
        this._onStyleChange();
      }
    );
    panel.appendChild(bodySizeRow.el);
    this._styleRefreshers.push(bodySizeRow.refresh);

    const cornerRow = buildSelectRow(
      t("style.cardCornersLabel"),
      cornerLabels(),
      () => this._draftStyle.cornerStyle,
      (value) => {
        this._draftStyle.cornerStyle = value;
        this._onStyleChange();
      }
    );
    panel.appendChild(cornerRow.el);
    this._styleRefreshers.push(cornerRow.refresh);
  }

  // -- GRUND tab ----------------------------------------------------------

  _buildGroundTab(panel) {
    this._panelTitle(panel, t("style.backgroundLabel"));

    const uploadHint = document.createElement("div");
    uploadHint.className = "field-hint";
    uploadHint.textContent = t("templateStudio.uploadElsewhereHint");
    panel.appendChild(uploadHint);

    const zoomRow = buildSliderRow(
      t("common.zoom"),
      1,
      3,
      0.01,
      () => this._draftStyle.backgroundImageScale ?? 1,
      (v) => {
        this._draftStyle.backgroundImageScale = v;
        this._onStyleChange();
      }
    );
    panel.appendChild(zoomRow.el);
    this._styleRefreshers.push(zoomRow.refresh);

    const offXRow = buildSliderRow(
      t("common.horizontalPosition"),
      0,
      1,
      0.01,
      () => this._draftStyle.backgroundImageOffsetX ?? 0.5,
      (v) => {
        this._draftStyle.backgroundImageOffsetX = v;
        this._onStyleChange();
      }
    );
    panel.appendChild(offXRow.el);
    this._styleRefreshers.push(offXRow.refresh);

    const offYRow = buildSliderRow(
      t("common.verticalPosition"),
      0,
      1,
      0.01,
      () => this._draftStyle.backgroundImageOffsetY ?? 0.5,
      (v) => {
        this._draftStyle.backgroundImageOffsetY = v;
        this._onStyleChange();
      }
    );
    panel.appendChild(offYRow.el);
    this._styleRefreshers.push(offYRow.refresh);

    const bgAnimRow = buildSelectRow(
      t("style.backgroundMotionLabel"),
      backgroundAnimLabels(),
      () => this._draftStyle.backgroundAnim || "none",
      (value) => {
        this._draftStyle.backgroundAnim = value;
        this._onStyleChange();
      }
    );
    panel.appendChild(bgAnimRow.el);
    this._styleRefreshers.push(bgAnimRow.refresh);

    const bgAnimHint = document.createElement("div");
    bgAnimHint.className = "field-hint";
    bgAnimHint.textContent = t("style.bgAnimHint");
    panel.appendChild(bgAnimHint);
  }

  // -- STICKER tab ------------------------------------------------------

  _buildStickersTab(panel) {
    this._panelTitle(panel, t("common.customImagesHeader"), t("style.customImagesHint"));

    const imagesContainer = document.createElement("div");
    panel.appendChild(imagesContainer);

    const getStyle = () => this._draftStyle;
    const onStyleChange = () => this._onStyleChange();
    const refreshImagesSection = () => {
      imagesContainer.innerHTML = "";
      const images = this._draftStyle.customImages || [];
      if (images.length === 0) {
        const empty = document.createElement("div");
        empty.className = "field-hint";
        empty.textContent = t("style.noCustomImages");
        imagesContainer.appendChild(empty);
        return;
      }
      images.forEach((sticker) => {
        imagesContainer.appendChild(buildCustomImageEditor(sticker.id, getStyle, onStyleChange, refreshImagesSection));
      });
    };
    refreshImagesSection();
    this._styleRefreshers.push(refreshImagesSection);
  }

  // -- ELEMENT tab: whatever's selected on the canvas ----------------------
  // A near-direct port of layoutEditor.js's property panel, plus a Shadow
  // section available on every element type (Studio-only).
  _buildElementTab(container) {
    // One-shot: loads a reusable, elements-only Layout (saved via the
    // standalone Layout Editor's own library — customLayoutLibrary.js,
    // deliberately separate from this template's full style) into the
    // current draft, replacing its elements while leaving colors/fonts/
    // background alone. Placed here since it only affects canvas elements.
    const loadLayoutWrap = document.createElement("div");
    loadLayoutWrap.style.marginBottom = "16px";
    const loadLayoutLabel = document.createElement("label");
    loadLayoutLabel.className = "field-label";
    loadLayoutLabel.textContent = t("templateStudio.loadLayoutTitle");
    loadLayoutWrap.appendChild(loadLayoutLabel);
    this.loadLayoutSelect = document.createElement("select");
    this.loadLayoutSelect.addEventListener("change", () => {
      const id = this.loadLayoutSelect.value;
      this.loadLayoutSelect.value = "";
      if (!id || this._isLocked()) return;
      const entry = getCustomLayout(id);
      if (!entry) return;
      this._draftStyle.customLayout.elements = sanitizeCustomLayout(entry.elements);
      this._selectElement(null);
      this._renderCanvas();
      this._renderOverlay();
    });
    this._lockableEls.push(this.loadLayoutSelect);
    loadLayoutWrap.appendChild(this.loadLayoutSelect);
    container.appendChild(loadLayoutWrap);

    this.propEmpty = document.createElement("div");
    this.propEmpty.className = "field-hint";
    this.propEmpty.textContent = t("layoutEditor.emptyHint");
    container.appendChild(this.propEmpty);

    this.propTitle = document.createElement("div");
    this.propTitle.className = "ts-panel-title";
    this.propTitle.style.marginBottom = "14px";
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

    this.inputX = makeNumberRow(t("layoutEditor.posXLabel"), -50, 150, 0.1, (v) => this._setSelectedField("cx", v / 100));
    this.inputY = makeNumberRow(t("layoutEditor.posYLabel"), -50, 150, 0.1, (v) => this._setSelectedField("cy", v / 100));
    this.inputW = makeNumberRow(t("layoutEditor.widthLabel"), 2, 250, 0.1, (v) => this._setSelectedField("w", v / 100));
    this.inputH = makeNumberRow(t("layoutEditor.heightLabel"), 2, 250, 0.1, (v) => this._setSelectedField("h", v / 100));
    this.inputRot = makeNumberRow(t("layoutEditor.rotationLabel"), -180, 180, 1, (v) => this._setSelectedField("rotation", v));

    const styleHeader = document.createElement("div");
    styleHeader.className = "ts-section-header";
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
    this._buildShadowSection();
    this._buildTextSection();
    this._buildShapeSection();
    this._buildImageSection();
    this._buildDeleteSection();
  }

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

  _buildCardStyleSection() {
    const header = document.createElement("div");
    header.className = "ts-section-header";
    header.textContent = t("layoutEditor.cardSkinHeader");
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

  _buildFontSection() {
    const header = document.createElement("div");
    header.className = "ts-section-header";
    header.textContent = t("layoutEditor.fontHeader");
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

  _buildAnimationSection() {
    const header = document.createElement("div");
    header.className = "ts-section-header";
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

  // A static drop shadow, available on every element type — a separate
  // concept from the "Glow" animation style above (see renderer.js's
  // applyElementShadow for how the two compose).
  _buildShadowSection() {
    const header = document.createElement("div");
    header.className = "ts-section-header";
    header.textContent = t("templateStudio.shadowHeader");
    this.propFields.appendChild(header);
    this.shadowSectionHeader = header;

    const { input: colorInput } = this._appendColorRow(
      this.propFields,
      t("templateStudio.shadowColorLabel"),
      (value) => this._setSelectedField("shadowColor", value),
      () => this._setSelectedField("shadowColor", null)
    );
    this.shadowColorInput = colorInput;

    const { input: blurInput } = this._appendNumberRow(this.propFields, t("templateStudio.shadowBlurLabel"), 0, 60, 1, (v) =>
      this._setSelectedField("shadowBlur", v)
    );
    this.shadowBlurInput = blurInput;

    const { input: offsetXInput } = this._appendNumberRow(this.propFields, t("templateStudio.shadowOffsetXLabel"), -60, 60, 1, (v) =>
      this._setSelectedField("shadowOffsetX", v)
    );
    this.shadowOffsetXInput = offsetXInput;

    const { input: offsetYInput } = this._appendNumberRow(this.propFields, t("templateStudio.shadowOffsetYLabel"), -60, 60, 1, (v) =>
      this._setSelectedField("shadowOffsetY", v)
    );
    this.shadowOffsetYInput = offsetYInput;

    const { input: shadowOpacityInput } = this._appendNumberRow(this.propFields, t("templateStudio.shadowOpacityLabel"), 5, 100, 1, (v) =>
      this._setSelectedField("shadowOpacity", v / 100)
    );
    this.shadowOpacityInput = shadowOpacityInput;
  }

  _buildTextSection() {
    this.textFieldsWrap = document.createElement("div");
    const header = document.createElement("div");
    header.className = "ts-section-header";
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

  _buildShapeSection() {
    this.shapeFieldsWrap = document.createElement("div");
    const header = document.createElement("div");
    header.className = "ts-section-header";
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

  _buildImageSection() {
    this.imageFieldsWrap = document.createElement("div");
    const header = document.createElement("div");
    header.className = "ts-section-header";
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

  // -- Panel foot: save/export/delete --------------------------------------

  _buildPanelFoot() {
    const foot = document.createElement("div");
    foot.className = "ts-panel-foot";

    const saveBtn = document.createElement("button");
    saveBtn.className = "ts-btn-save";
    saveBtn.textContent = t("common.saveToLibrary");
    saveBtn.addEventListener("click", () => {
      const style = this._draftStyle;
      const name = this.nameInput.value.trim() || "Custom Template";
      if (style.templateId && style.templateId !== "custom" && isCustomTemplateId(style.templateId)) {
        updateCustomTemplate(style.templateId, { name, style });
      } else {
        const entry = addCustomTemplate({ name, style });
        style.templateId = entry.id;
      }
      this._loadedLibraryId = style.templateId;
      this._refreshLibraryState();
    });
    foot.appendChild(saveBtn);

    foot.appendChild(this._buildExportMenu());

    this.deleteLibraryBtn = document.createElement("button");
    this.deleteLibraryBtn.className = "ts-btn-delete-icon";
    this.deleteLibraryBtn.textContent = "🗑";
    this.deleteLibraryBtn.title = t("common.deleteFromLibrary");
    this.deleteLibraryBtn.addEventListener("click", () => {
      if (!this._loadedLibraryId) return;
      removeCustomTemplate(this._loadedLibraryId);
      this._loadedLibraryId = null;
      this._draftStyle.templateId = "custom";
      this._refreshLibraryState();
    });
    foot.appendChild(this.deleteLibraryBtn);

    return foot;
  }

  // "Exportieren ▾" panel-foot control: local file export, upload-to-Hub,
  // or import — folded into one menu (per the studio's compact footer).
  _buildExportMenu() {
    const wrap = document.createElement("div");
    // menu-up: this control lives in the panel foot at the very bottom of
    // the tool panel, so the default downward-opening menu would render
    // partly or fully below the viewport.
    wrap.className = "sp-menu menu-up";
    wrap.style.flex = "1";

    const menuBtn = document.createElement("button");
    menuBtn.className = "ts-btn-export";
    menuBtn.style.width = "100%";
    menuBtn.textContent = `${t("common.exportEllipsis")} ▾`;
    wrap.appendChild(menuBtn);
    this._exportMenuBtn = menuBtn;

    const list = document.createElement("div");
    list.className = "sp-menu-list";
    list.setAttribute("role", "menu");
    list.setAttribute("aria-label", t("common.exportEllipsis"));

    const localItem = document.createElement("button");
    localItem.className = "sp-menu-item";
    localItem.type = "button";
    localItem.textContent = t("common.exportLocalOption");
    localItem.addEventListener("click", () => {
      closeMenu();
      this._exportLocal();
    });
    list.appendChild(localItem);

    const uploadItem = document.createElement("button");
    uploadItem.className = "sp-menu-item";
    uploadItem.type = "button";
    uploadItem.textContent = t("common.exportUploadOption");
    uploadItem.addEventListener("click", () => {
      closeMenu();
      this._uploadToHub();
    });
    list.appendChild(uploadItem);

    const importItem = document.createElement("button");
    importItem.className = "sp-menu-item";
    importItem.type = "button";
    importItem.textContent = t("common.importEllipsis");
    importItem.addEventListener("click", () => {
      closeMenu();
      this._importTemplate();
    });
    list.appendChild(importItem);

    wrap.appendChild(list);

    const closeMenu = () => wrap.classList.remove("open");
    menuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      wrap.classList.toggle("open");
    });
    document.addEventListener("click", (e) => {
      if (!wrap.contains(e.target)) closeMenu();
    });

    return wrap;
  }

  // ------------------------------------------------------------------
  // Element mutation helpers
  // ------------------------------------------------------------------

  _onStyleChange() {
    this._renderCanvas();
    this._refreshPaletteStrip();
  }

  _refreshPaletteStrip() {
    if (!this.paletteStripEl) return;
    const style = this._draftStyle;
    const c1 = style.colors?.background || "#0A0A0F";
    const c2 = style.colors?.backgroundEnd || c1;
    this.paletteStripEl.style.background = `linear-gradient(90deg, ${c1}, ${c2})`;
  }

  _setSelectedField(field, rawValue) {
    if (this._isLocked()) return;
    const el = this._draftElements.find((e) => e.id === this._selectedId);
    if (!el) return;
    let value = rawValue;
    if (field === "cx" || field === "cy") value = clamp(value, -0.5, 1.5);
    if (field === "w" || field === "h") value = clamp(value, 0.02, 2.5);
    el[field] = value;
    this._positionHandleEl(this._handleEls.get(el.id), el);
    this._renderCanvas();
  }

  _bringToFront(id) {
    if (this._isLocked()) return;
    const idx = this._draftElements.findIndex((e) => e.id === id);
    if (idx === -1 || idx === this._draftElements.length - 1) return;
    const [el] = this._draftElements.splice(idx, 1);
    this._draftElements.push(el);
    this._renderCanvas();
    this._renderOverlay();
  }

  _sendToBack(id) {
    if (this._isLocked()) return;
    const idx = this._draftElements.findIndex((e) => e.id === id);
    if (idx <= 0) return;
    const [el] = this._draftElements.splice(idx, 1);
    this._draftElements.unshift(el);
    this._renderCanvas();
    this._renderOverlay();
  }

  _addFreeformElement(type, overrides = {}) {
    if (this._isLocked()) return;
    const el = createFreeformElement(type, overrides);
    this._draftElements.push(el);
    this._renderCanvas();
    this._renderOverlay();
    this._selectElement(el.id);
  }

  _deleteSelectedElement() {
    if (this._isLocked()) return;
    const id = this._selectedId;
    if (!id || CUSTOM_LAYOUT_ELEMENT_IDS.includes(id)) return;
    const idx = this._draftElements.findIndex((e) => e.id === id);
    if (idx === -1) return;
    this._draftElements.splice(idx, 1);
    this._selectElement(null);
    this._renderCanvas();
    this._renderOverlay();
  }

  _refreshLoadLayoutSelect() {
    if (!this.loadLayoutSelect) return;
    this.loadLayoutSelect.innerHTML = "";
    const blank = document.createElement("option");
    blank.value = "";
    blank.textContent = t("templateStudio.loadLayoutPlaceholder");
    this.loadLayoutSelect.appendChild(blank);
    listCustomLayouts().forEach((entry) => {
      const opt = document.createElement("option");
      opt.value = entry.id;
      opt.textContent = entry.name;
      this.loadLayoutSelect.appendChild(opt);
    });
  }

  _refreshLibraryState() {
    const entry = this._loadedLibraryId ? getCustomTemplate(this._loadedLibraryId) : null;
    this.nameInput.value = entry ? entry.name : this.nameInput.value;
    this.deleteLibraryBtn.disabled = !entry;
  }

  _refreshLockUI() {
    const locked = this._isLocked();
    this.lockBadge.style.display = locked ? "" : "none";
    this._lockableEls.forEach((el) => {
      if (el) el.disabled = locked;
    });
  }

  _renderCanvas() {
    renderStreamplan(this.canvasEl, SAMPLE_PROFILE, this._draftStyle, null, [CANVAS_WIDTH, CANVAS_HEIGHT]);
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
    const locked = this._isLocked();

    this._draftElements.forEach((el) => {
      const div = document.createElement("div");
      div.className = "ts-handle" + (el.id === this._selectedId ? " selected" : "");
      this._positionHandleEl(div, el);

      if (!locked) {
        Object.keys(CORNER_SIGNS).forEach((corner) => {
          const handle = document.createElement("div");
          handle.className = `ts-handle-resize ${corner}`;
          handle.addEventListener("pointerdown", (e) => this._startResize(e, el, corner));
          div.appendChild(handle);
        });

        const rotateHandle = document.createElement("div");
        rotateHandle.className = "ts-handle-rotate";
        rotateHandle.addEventListener("pointerdown", (e) => this._startRotate(e, el));
        div.appendChild(rotateHandle);
      }

      div.addEventListener("pointerdown", (e) => {
        if (e.target !== div) return;
        this._selectElement(el.id);
        if (!locked) this._startMove(e, el);
      });

      this.overlayLayer.appendChild(div);
      this._handleEls.set(el.id, div);
    });

    this._positionSelectionPill();
  }

  _positionSelectionPill() {
    const el = this._draftElements.find((e) => e.id === this._selectedId);
    if (!el) {
      this.selectionPillEl.classList.remove("visible");
      return;
    }
    this.selectionPillEl.classList.add("visible");
    this.selectionNameEl.textContent = elementLabel(el);
    this.selectionPillEl.style.left = `${el.cx * 100}%`;
    this.selectionPillEl.style.top = `${(el.cy - el.h / 2) * 100}%`;
    this.selectionPillEl.style.transform = "translate(-50%, -30px)";
  }

  _selectElement(id) {
    if (this._selectedId === id) {
      // Still keep the tool panel in sync even on a no-op reselect (e.g.
      // after a fresh open() where nothing was previously selected).
      this._activateToolTab(id ? "element" : "colors");
      return;
    }
    const prev = this._handleEls.get(this._selectedId);
    if (prev) prev.classList.remove("selected");
    this._selectedId = id;
    const next = this._handleEls.get(id);
    if (next) next.classList.add("selected");
    this._refreshPropertyPanel();
    this._positionSelectionPill();
    this._activateToolTab(id ? "element" : "colors");
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
      this.accentColorInput.value = el.accentColor || this._draftStyle?.colors?.accent || "#7b5fd9";
    }
    if (active !== this.inputOpacity) this.inputOpacity.value = String(Math.round((el.opacity ?? 1) * 100));

    if (active !== this.cardStyleSelect) this.cardStyleSelect.value = el.cardStyle || "";
    if (active !== this.animSelect) this.animSelect.value = el.animStyle || "";
    if (active !== this.animIntensitySelect) this.animIntensitySelect.value = el.animIntensity || "med";

    this.fontFilenameEl.textContent = el.fontFamily ? t("layoutEditor.customFontUsing", { family: el.fontFamily }) : t("layoutEditor.usingTemplateFont");
    this._refreshFontLibrarySelect();

    if (active !== this.shadowColorInput) this.shadowColorInput.value = el.shadowColor || "#000000";
    if (active !== this.shadowBlurInput) this.shadowBlurInput.value = String(el.shadowBlur ?? 16);
    if (active !== this.shadowOffsetXInput) this.shadowOffsetXInput.value = String(el.shadowOffsetX ?? 0);
    if (active !== this.shadowOffsetYInput) this.shadowOffsetYInput.value = String(el.shadowOffsetY ?? 8);
    if (active !== this.shadowOpacityInput) this.shadowOpacityInput.value = String(Math.round((el.shadowOpacity ?? 0.6) * 100));

    if (active !== this.textArea) this.textArea.value = el.text || "";
    if (active !== this.textAlignSelect) this.textAlignSelect.value = el.align || "center";
    if (active !== this.textColorInput) {
      this.textColorInput.value = el.color || this._draftStyle?.colors?.textPrimary || "#FFFFFF";
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
      this._positionSelectionPill();
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
      this._positionSelectionPill();
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

  _loadStyle(style) {
    const base = style || customBaseStyle();
    if (!base.customLayout || !base.customLayout.elements?.length) {
      base.customLayout = { elements: buildDefaultCustomLayoutElements() };
    } else {
      base.customLayout = { elements: sanitizeCustomLayout(base.customLayout.elements) };
    }
    this._draftStyle = base;
    this._loadedLibraryId = isCustomTemplateId(base.templateId) && base.templateId !== "custom" ? base.templateId : null;
    const entry = this._loadedLibraryId ? getCustomTemplate(this._loadedLibraryId) : null;
    this.nameInput.value = entry ? entry.name : "";
    this.deleteLibraryBtn.disabled = !entry;
    this._selectedId = null;
    this._styleRefreshers.forEach((fn) => fn());
    this._refreshLockUI();
    this._refreshLoadLayoutSelect();
    this._refreshPaletteStrip();
    this._selectElement(null);
    this._renderCanvas();
    this._renderOverlay();
  }

  // { style, onClose } — style: an existing StyleConfig to edit (a fresh
  // customBaseStyle() if omitted); onClose: invoked once the Studio is
  // dismissed (Apply or plain Close) so app.js/stylePanel.js can refresh
  // the Templates gallery to reflect anything saved to the library.
  open({ style, onClose } = {}) {
    this._onClose = onClose || null;
    this._loadStyle(style ? cloneStyle(style) : null);
    this.overlayEl.classList.add("open");
    this._startAnimTicker();
  }

  close() {
    this.overlayEl.classList.remove("open");
    this._stopAnimTicker();
    const onClose = this._onClose;
    this._onClose = null;
    if (onClose) onClose();
  }

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
