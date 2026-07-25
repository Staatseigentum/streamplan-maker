// The Layout Editor: a full-viewport free-form drag/resize/rotate editor for
// the 9 elements (7 day cards + header + logo) a Custom Template's
// style.customLayout can describe. Opens either standalone (library
// management only) or pre-loaded from a Custom Template's current layout via
// stylePanel.js, which also supplies an onApply callback to write the draft
// back. The draft is a deep-cloned working copy at all times — nothing here
// ever touches the live document style until "Apply to this Template" (or a
// library Save/Export) is explicitly clicked.
//
// UI shell: the "Anordnen / Arrange" mode — a cool, technical workspace
// (blueprint grid, layers rail, transform bar) styled entirely via
// styles/layoutEditor.css's .le-* classes, deliberately distinct from
// Template Studio's warm "Gestalten" mode (see templateStudio.js).
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
// Purely decorative glyphs for the "+ Shape" menu — not translated (they're
// symbols, not text).
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
// Layer-row type glyphs (see handoff 2a "Ebenen-Leiste").
const LAYER_TYPE_GLYPHS = { logo: "◯", header: "▭", dayCard: "▦", text: "▭", shape: "★", image: "▤" };
const ANIM_TICK_MS = 1000 / 30;
const GRID_SIZE_PX = 32;

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
// Returns { value, snapped } so callers can show a guide line only while an
// actual snap is in effect.
const SNAP_THRESHOLD = 0.012;
function snapAxis(center, halfSize) {
  for (const candidate of [0.5, halfSize, 1 - halfSize]) {
    if (Math.abs(center - candidate) < SNAP_THRESHOLD) return { value: candidate, snapped: true, axisValue: candidate };
  }
  return { value: center, snapped: false, axisValue: null };
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
    this._gridVisible = true;
    this._snapEnabled = true;
    this._dirty = false;
    this._draftName = "";
    this._openPopoverKey = null;
    this._dragLayerId = null;
    this._build();
  }

  // ------------------------------------------------------------------
  // Shell
  // ------------------------------------------------------------------

  _build() {
    this.overlayEl.innerHTML = "";
    const shell = document.createElement("div");
    shell.className = "le-shell";

    shell.appendChild(this._buildTopbar());

    const body = document.createElement("div");
    body.className = "le-body";
    body.appendChild(this._buildLayersRail());
    body.appendChild(this._buildCanvasArea());
    shell.appendChild(body);

    shell.appendChild(this._buildTransformBar());

    this.overlayEl.appendChild(shell);
    this.shellEl = shell;

    this._buildPropertySections();

    window.addEventListener("keydown", (e) => {
      if (!this.overlayEl.classList.contains("open")) return;
      if (e.key === "Escape") {
        if (this._openPopoverKey) {
          this._closePopover();
        } else {
          this.close();
        }
      }
    });
  }

  // -- Topbar -----------------------------------------------------------

  _buildTopbar() {
    const topbar = document.createElement("div");
    topbar.className = "le-topbar";
    this.topbarEl = topbar;

    const brand = document.createElement("div");
    brand.className = "le-brand";
    const glyph = document.createElement("div");
    glyph.className = "le-brand-glyph";
    for (let i = 0; i < 4; i++) glyph.appendChild(document.createElement("span"));
    const brandText = document.createElement("div");
    brandText.className = "le-brand-text";
    const title = document.createElement("div");
    title.className = "le-title";
    title.textContent = t("layoutEditor.title");
    const subtitle = document.createElement("div");
    subtitle.className = "le-subtitle";
    subtitle.textContent = t("layoutEditor.modeSubtitle");
    brandText.append(title, subtitle);
    brand.append(glyph, brandText);
    topbar.appendChild(brand);

    topbar.appendChild(this._divider());
    topbar.appendChild(this._buildDraftChip());

    const saveBtn = document.createElement("button");
    saveBtn.className = "le-btn-ghost";
    saveBtn.textContent = t("common.save");
    saveBtn.addEventListener("click", () => this._saveDraft());
    topbar.appendChild(saveBtn);

    topbar.appendChild(this._buildExportMenu());

    const spacer = document.createElement("div");
    spacer.className = "le-spacer";
    topbar.appendChild(spacer);

    this.elementCountEl = document.createElement("div");
    this.elementCountEl.className = "le-element-count";
    topbar.appendChild(this.elementCountEl);

    const closeBtn = document.createElement("button");
    closeBtn.className = "le-btn-close";
    closeBtn.textContent = t("layoutEditor.closeBtn");
    closeBtn.addEventListener("click", () => this.close());
    topbar.appendChild(closeBtn);

    this.applyBtn = document.createElement("button");
    this.applyBtn.className = "le-btn-primary";
    this.applyBtn.textContent = t("layoutEditor.applyBtn");
    this.applyBtn.addEventListener("click", () => {
      if (this._onApply) this._onApply(this._draftElements.map((el) => ({ ...el })));
      this.close();
    });
    topbar.appendChild(this.applyBtn);

    return topbar;
  }

  _divider() {
    const div = document.createElement("div");
    div.className = "le-divider";
    return div;
  }

  // Draft chip: replaces the old library-row's load-select + name field.
  // Click opens a menu listing every saved layout (click = load) plus
  // New/Rename/Import/Delete actions. The name itself becomes an inline
  // <input> while renaming.
  _buildDraftChip() {
    const chip = document.createElement("div");
    chip.className = "le-draft-chip sp-menu";

    const label = document.createElement("span");
    label.className = "le-draft-chip-label";
    label.textContent = t("layoutEditor.draftLabel");

    this.draftNameEl = document.createElement("span");
    this.draftNameEl.className = "le-draft-chip-name";

    this.draftNameInput = document.createElement("input");
    this.draftNameInput.type = "text";
    this.draftNameInput.className = "le-draft-chip-name-input";
    this.draftNameInput.style.display = "none";
    this.draftNameInput.addEventListener("click", (e) => e.stopPropagation());
    this.draftNameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this._commitRename();
      if (e.key === "Escape") this._cancelRename();
    });
    this.draftNameInput.addEventListener("blur", () => this._commitRename());

    this.draftPillEl = document.createElement("span");
    this.draftPillEl.className = "le-draft-chip-pill";
    this.draftPillEl.textContent = t("layoutEditor.unsavedPill");

    const caret = document.createElement("span");
    caret.className = "le-draft-chip-caret";
    caret.textContent = "▾";

    chip.append(label, this.draftNameEl, this.draftNameInput, this.draftPillEl, caret);

    this.draftMenuList = document.createElement("div");
    this.draftMenuList.className = "sp-menu-list";
    chip.appendChild(this.draftMenuList);

    const closeMenu = () => chip.classList.remove("open");
    chip.addEventListener("click", (e) => {
      if (this.draftNameInput.style.display !== "none") return;
      e.stopPropagation();
      if (!chip.classList.contains("open")) this._refreshDraftMenu();
      chip.classList.toggle("open");
    });
    document.addEventListener("click", (e) => {
      if (!chip.contains(e.target)) closeMenu();
    });
    this._closeDraftMenu = closeMenu;
    this.draftChipEl = chip;
    return chip;
  }

  _refreshDraftMenu() {
    this.draftMenuList.innerHTML = "";
    const addItem = (text, onClick, danger = false) => {
      const item = document.createElement("button");
      item.className = "sp-menu-item";
      item.type = "button";
      if (danger) item.style.color = "var(--le-danger)";
      item.textContent = text;
      item.addEventListener("click", () => {
        this._closeDraftMenu();
        onClick();
      });
      this.draftMenuList.appendChild(item);
    };
    addItem(t("common.new"), () => this._newDraft());
    addItem(t("layoutEditor.renameLayout"), () => this._startRename());
    addItem(t("common.importEllipsis"), () => this._importLayout());
    if (this._loadedLibraryId && getCustomLayout(this._loadedLibraryId)) {
      addItem(t("common.deleteFromLibrary"), () => this._deleteLoadedFromLibrary(), true);
    }
    const entries = listCustomLayouts();
    if (entries.length) {
      const sep = document.createElement("div");
      sep.style.height = "1px";
      sep.style.background = "var(--le-border)";
      sep.style.margin = "4px 2px";
      this.draftMenuList.appendChild(sep);
      entries.forEach((entry) => addItem(entry.name, () => this._loadLibraryEntry(entry)));
    }
  }

  _newDraft() {
    this._draftElements = buildDefaultCustomLayoutElements();
    this._loadedLibraryId = null;
    this._draftName = "";
    this._dirty = false;
    this._selectElement(null);
    this._refreshDraftChip();
    this._refreshLayersList();
    this._renderCanvas();
    this._renderOverlay();
  }

  _loadLibraryEntry(entry) {
    this._loadedLibraryId = entry.id;
    this._draftElements = entry.elements.map((el) => ({ ...el }));
    this._draftName = entry.name;
    this._dirty = false;
    this._selectElement(null);
    this._refreshDraftChip();
    this._refreshLayersList();
    this._renderCanvas();
    this._renderOverlay();
  }

  _startRename() {
    this.draftNameEl.style.display = "none";
    this.draftNameInput.style.display = "";
    this.draftNameInput.value = this._draftName;
    this.draftNameInput.focus();
    this.draftNameInput.select();
  }

  _commitRename() {
    if (this.draftNameInput.style.display === "none") return;
    this._draftName = this.draftNameInput.value.trim();
    this.draftNameInput.style.display = "none";
    this.draftNameEl.style.display = "";
    this._refreshDraftChip();
  }

  _cancelRename() {
    this.draftNameInput.style.display = "none";
    this.draftNameEl.style.display = "";
  }

  _saveDraft() {
    const name = this._draftName.trim() || "Custom Layout";
    this._draftName = name;
    if (this._loadedLibraryId && getCustomLayout(this._loadedLibraryId)) {
      updateCustomLayout(this._loadedLibraryId, { name, elements: this._draftElements });
    } else {
      const entry = addCustomLayout({ name, elements: this._draftElements });
      this._loadedLibraryId = entry.id;
    }
    this._dirty = false;
    this._refreshDraftChip();
  }

  _deleteLoadedFromLibrary() {
    if (!this._loadedLibraryId) return;
    removeCustomLayout(this._loadedLibraryId);
    this._loadedLibraryId = null;
    this._refreshDraftChip();
  }

  async _importLayout() {
    const entry = await this._importLayoutFromDialog();
    if (!entry) return;
    this._loadLibraryEntry(entry);
  }

  _refreshDraftChip() {
    this.draftNameEl.textContent = this._draftName || t("layoutEditor.unsavedDraft");
    const unsaved = !this._loadedLibraryId || this._dirty;
    this.draftPillEl.style.display = unsaved ? "" : "none";
  }

  _markDirty() {
    if (this._dirty) return;
    this._dirty = true;
    this._refreshDraftChip();
  }

  // "+ Shape" menu re-used both in the layers-rail footer and (via the same
  // helper) nowhere else now — kept as its own builder since it also powers
  // double-click-to-add-a-specific-kind from the footer.
  _buildShapeAddMenu() {
    const wrap = document.createElement("div");
    wrap.className = "sp-menu menu-up";

    const menuBtn = document.createElement("button");
    menuBtn.className = "le-layers-foot-btn";
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

  // "Exportieren ▾" topbar control: local file export or upload-to-Hub.
  _buildExportMenu() {
    const wrap = document.createElement("div");
    wrap.className = "sp-menu";

    const menuBtn = document.createElement("button");
    menuBtn.className = "le-btn-ghost";
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
    const name = this._draftName.trim() || "Custom Layout";
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
  }

  // Prepares the layout for Streamplan Hub and hands off to the site's own
  // upload page, rather than publishing it directly from here — that way
  // the user still gets a chance to add a preview image or tweak the name
  // in the site's own form before it actually goes live. A name is
  // required here even though local export happily falls back to "Custom
  // Layout": an unnamed upload would show up on the community site with
  // nothing to identify it by.
  async _uploadToHub() {
    const name = this._draftName.trim();
    if (!name) {
      await window.streamplanAPI.showMessage("error", t("common.uploadNoNameTitle"), t("common.uploadNoNameError"));
      return;
    }
    const prevText = this._exportMenuBtn.textContent;
    this._exportMenuBtn.disabled = true;
    this._exportMenuBtn.textContent = t("common.uploadingEllipsis");
    try {
      const payload = { name, elements: this._draftElements.map((el) => ({ ...el })) };
      const bytes = new TextEncoder().encode(JSON.stringify(payload, null, 2));
      const filename = `${sanitizeFilename(name)}${LAYOUT_FILE_EXTENSION}`;
      const filePath = await window.streamplanAPI.writeTempFile(filename, bytes);
      await window.streamplanAPI.showItemInFolder(filePath);
      await window.streamplanAPI.showMessage("info", t("common.uploadReadyTitle"), t("common.uploadReadyBody", { filename }));
      await window.streamplanAPI.openExternal(`https://streamplan-maker.online/upload?type=layout&name=${encodeURIComponent(name)}`);
    } catch (err) {
      console.error(err);
      await window.streamplanAPI.showMessage("error", t("common.uploadFailedTitle"), err.message);
    } finally {
      this._exportMenuBtn.disabled = false;
      this._exportMenuBtn.textContent = prevText;
    }
  }

  // -- Layers rail --------------------------------------------------------

  _buildLayersRail() {
    const rail = document.createElement("div");
    rail.className = "le-layers-rail";
    this.layersRailEl = rail;

    const head = document.createElement("div");
    head.className = "le-layers-head";
    const heading = document.createElement("div");
    heading.className = "le-layers-title";
    heading.textContent = t("layoutEditor.layersHeader");
    const hint = document.createElement("div");
    hint.className = "le-layers-hint le-mono";
    hint.textContent = t("layoutEditor.layersHint");
    head.append(heading, hint);
    rail.appendChild(head);

    this.layersListEl = document.createElement("div");
    this.layersListEl.className = "le-layers-list";
    rail.appendChild(this.layersListEl);

    const foot = document.createElement("div");
    foot.className = "le-layers-foot";
    const addTextBtn = document.createElement("button");
    addTextBtn.className = "le-layers-foot-btn";
    addTextBtn.textContent = t("layoutEditor.addText");
    addTextBtn.addEventListener("click", () => this._addFreeformElement("text"));
    foot.appendChild(addTextBtn);
    foot.appendChild(this._buildShapeAddMenu());
    const addImageBtn = document.createElement("button");
    addImageBtn.className = "le-layers-foot-btn";
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
    foot.appendChild(addImageBtn);
    rail.appendChild(foot);

    return rail;
  }

  _refreshLayersList() {
    this.layersListEl.innerHTML = "";
    // Top of list = front = end of the array (see _bringToFront/_sendToBack).
    const ordered = [...this._draftElements].reverse();
    ordered.forEach((el) => {
      if (el.type === "dayTime") return; // rendered as a sub-row of its parent card
      this.layersListEl.appendChild(this._buildLayerRow(el));
      if (el.type === "dayCard" && el.id === this._selectedId) {
        this._draftElements
          .filter((e) => e.type === "dayTime" && e.dayKey === el.id)
          .forEach((sub) => this.layersListEl.appendChild(this._buildLayerSubRow(sub)));
      }
    });
    this._refreshElementCount();
  }

  _buildLayerRow(el) {
    const row = document.createElement("div");
    row.className = "le-layer-row" + (el.id === this._selectedId ? " selected" : "");
    row.draggable = true;
    row.dataset.elId = el.id;

    const handle = document.createElement("span");
    handle.className = "le-layer-handle";
    handle.textContent = "⠿";

    const glyph = document.createElement("span");
    glyph.className = "le-layer-glyph" + (el.type === "logo" || el.type === "header" ? " accent" : "");
    glyph.textContent = LAYER_TYPE_GLYPHS[el.type] || "▭";

    const name = document.createElement("span");
    name.className = "le-layer-name";
    name.textContent = elementLabel(el);

    row.append(handle, glyph, name);

    if (el.type === "dayCard") {
      const badge = document.createElement("span");
      badge.className = "le-layer-badge le-mono";
      badge.textContent = "+2";
      row.appendChild(badge);
    } else {
      const vis = document.createElement("button");
      vis.className = "le-layer-visibility";
      vis.type = "button";
      vis.textContent = "◉";
      vis.title = t("common.opacity");
      vis.addEventListener("click", (e) => {
        e.stopPropagation();
        if (this._hiddenIds?.has(el.id)) this._hiddenIds.delete(el.id);
        else (this._hiddenIds ??= new Set()).add(el.id);
        vis.style.opacity = this._hiddenIds?.has(el.id) ? "0.35" : "";
        this._renderCanvas();
      });
      row.appendChild(vis);
    }

    row.addEventListener("click", () => this._selectElement(el.id));
    row.addEventListener("dragstart", (e) => {
      this._dragLayerId = el.id;
      row.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
    });
    row.addEventListener("dragend", () => {
      row.classList.remove("dragging");
      this._dragLayerId = null;
    });
    row.addEventListener("dragover", (e) => {
      if (!this._dragLayerId || this._dragLayerId === el.id) return;
      e.preventDefault();
    });
    row.addEventListener("drop", (e) => {
      e.preventDefault();
      this._reorderLayer(this._dragLayerId, el.id);
    });

    return row;
  }

  _buildLayerSubRow(el) {
    const row = document.createElement("div");
    row.className = "le-layer-sub";
    const arrow = document.createElement("span");
    arrow.className = "le-layer-sub-arrow";
    arrow.textContent = "↳";
    const text = document.createElement("span");
    text.className = "le-layer-sub-text";
    text.textContent = elementLabel(el);
    row.append(arrow, text);
    row.addEventListener("click", () => this._selectElement(el.id));
    return row;
  }

  // Dropping `draggedId`'s row onto `targetId`'s row moves it to sit
  // directly after target in the array (array order = z-order, array end =
  // front — see _bringToFront/_sendToBack), matching "top of the (reversed)
  // list = front" from the layers rail's own ordering.
  _reorderLayer(draggedId, targetId) {
    if (!draggedId || draggedId === targetId) return;
    const fromIdx = this._draftElements.findIndex((e) => e.id === draggedId);
    const toIdx = this._draftElements.findIndex((e) => e.id === targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    const [el] = this._draftElements.splice(fromIdx, 1);
    const insertAt = this._draftElements.findIndex((e) => e.id === targetId);
    this._draftElements.splice(insertAt + 1, 0, el);
    this._markDirty();
    this._refreshLayersList();
    this._renderCanvas();
    this._renderOverlay();
  }

  _refreshElementCount() {
    const fixed = this._draftElements.filter((el) => CUSTOM_LAYOUT_ELEMENT_IDS.includes(el.id) && el.type !== "dayTime").length;
    const times = this._draftElements.filter((el) => el.type === "dayTime").length;
    const extra = this._draftElements.filter((el) => FREEFORM_ELEMENT_TYPES.includes(el.type)).length;
    this.elementCountEl.textContent = t("layoutEditor.elementCount", { fixed, times, extra });
  }

  // -- Canvas area --------------------------------------------------------

  _buildCanvasArea() {
    const area = document.createElement("div");
    area.className = "le-canvas-area";

    this.gridEl = document.createElement("div");
    this.gridEl.className = "le-grid";
    area.appendChild(this.gridEl);

    this.canvasWrap = document.createElement("div");
    this.canvasWrap.className = "le-canvas-wrap";

    this.canvasEl = document.createElement("canvas");
    this.canvasEl.className = "le-canvas";
    this.canvasWrap.appendChild(this.canvasEl);

    this.overlayLayer = document.createElement("div");
    this.overlayLayer.className = "le-overlay-layer";
    this.canvasWrap.appendChild(this.overlayLayer);

    this.snapGuideV = document.createElement("div");
    this.snapGuideV.className = "le-snap-guide vertical";
    this.snapGuideV.style.display = "none";
    this.snapGuideH = document.createElement("div");
    this.snapGuideH.className = "le-snap-guide horizontal";
    this.snapGuideH.style.display = "none";
    this.canvasWrap.append(this.snapGuideV, this.snapGuideH);

    this.hudEl = document.createElement("div");
    this.hudEl.className = "le-hud";
    const hudRow1 = document.createElement("div");
    hudRow1.className = "le-hud-row";
    this.hudX = this._hudSpan("X");
    this.hudY = this._hudSpan("Y");
    hudRow1.append(this.hudX.axis, this.hudX.value, this.hudY.axis, this.hudY.value);
    const hudRow2 = document.createElement("div");
    hudRow2.className = "le-hud-row";
    this.hudW = this._hudSpan("B");
    this.hudH = this._hudSpan("H");
    hudRow2.append(this.hudW.axis, this.hudW.value, this.hudH.axis, this.hudH.value);
    const hudDivider = document.createElement("div");
    hudDivider.className = "le-hud-divider";
    const hudActions = document.createElement("div");
    hudActions.className = "le-hud-actions";
    const frontBtn = document.createElement("button");
    frontBtn.className = "le-hud-btn";
    frontBtn.textContent = "⬆";
    frontBtn.title = t("layoutEditor.bringFront");
    frontBtn.addEventListener("click", () => this._bringToFront(this._selectedId));
    const backBtn = document.createElement("button");
    backBtn.className = "le-hud-btn";
    backBtn.textContent = "⬇";
    backBtn.title = t("layoutEditor.sendBack");
    backBtn.addEventListener("click", () => this._sendToBack(this._selectedId));
    const dupBtn = document.createElement("button");
    dupBtn.className = "le-hud-btn";
    dupBtn.textContent = "⧉";
    dupBtn.title = t("layoutEditor.duplicate");
    dupBtn.addEventListener("click", () => this._duplicateSelected());
    hudActions.append(frontBtn, backBtn, dupBtn);
    this.hudEl.append(hudRow1, hudRow2, hudDivider, hudActions);
    this.canvasWrap.appendChild(this.hudEl);

    area.appendChild(this.canvasWrap);
    area.appendChild(this._buildStatusPill());

    this.canvasWrap.addEventListener("pointerdown", (e) => {
      if (e.target === this.canvasWrap || e.target === this.canvasEl) this._selectElement(null);
    });

    return area;
  }

  _hudSpan(axisText) {
    const axis = document.createElement("span");
    axis.className = "le-hud-axis";
    axis.textContent = axisText;
    const value = document.createElement("span");
    return { axis, value };
  }

  _buildStatusPill() {
    const pill = document.createElement("div");
    pill.className = "le-status-pill";

    const dims = document.createElement("span");
    dims.className = "le-status-item";
    dims.textContent = `${CANVAS_WIDTH} × ${CANVAS_HEIGHT}`;
    pill.appendChild(dims);
    pill.appendChild(this._statusSep());

    this.gridToggleEl = document.createElement("button");
    this.gridToggleEl.className = "le-status-item clickable";
    this.gridToggleEl.addEventListener("click", () => {
      this._gridVisible = !this._gridVisible;
      this._syncStatusPill();
    });
    pill.appendChild(this.gridToggleEl);
    pill.appendChild(this._statusSep());

    this.snapToggleEl = document.createElement("button");
    this.snapToggleEl.className = "le-status-item clickable";
    this.snapToggleEl.addEventListener("click", () => {
      this._snapEnabled = !this._snapEnabled;
      this._syncStatusPill();
    });
    pill.appendChild(this.snapToggleEl);

    this._syncStatusPill();
    return pill;
  }

  _statusSep() {
    const sep = document.createElement("span");
    sep.className = "le-status-sep";
    return sep;
  }

  _syncStatusPill() {
    this.gridEl.classList.toggle("hidden", !this._gridVisible);
    this.gridToggleEl.textContent = t("layoutEditor.gridToggle", { size: GRID_SIZE_PX });
    this.gridToggleEl.classList.toggle("on", this._gridVisible);
    this.snapToggleEl.textContent = this._snapEnabled ? t("layoutEditor.snapOn") : t("layoutEditor.snapOff");
    this.snapToggleEl.classList.toggle("on", this._snapEnabled);
  }

  // -- Transform bar --------------------------------------------------------

  _buildTransformBar() {
    const bar = document.createElement("div");
    bar.className = "le-transformbar";
    this.transformBarEl = bar;

    this.tbEmptyEl = document.createElement("div");
    this.tbEmptyEl.className = "le-tb-empty";
    this.tbEmptyEl.textContent = t("layoutEditor.emptyHint");
    bar.appendChild(this.tbEmptyEl);

    this.tbFieldsEl = document.createElement("div");
    this.tbFieldsEl.style.display = "none";
    this.tbFieldsEl.style.alignItems = "center";
    this.tbFieldsEl.style.gap = "8px";
    this.tbFieldsEl.style.flex = "1";
    this.tbFieldsEl.style.minWidth = "0";
    this.tbFieldsEl.style.overflowX = "auto";

    this.tbNameEl = document.createElement("div");
    this.tbNameEl.className = "le-tb-name";
    this.tbFieldsEl.appendChild(this.tbNameEl);

    const numberGroup = document.createElement("div");
    numberGroup.className = "le-tb-group";
    this.inputX = this._tbAxisInput(numberGroup, "X", (v) => this._setSelectedField("cx", v / 100));
    this.inputY = this._tbAxisInput(numberGroup, "Y", (v) => this._setSelectedField("cy", v / 100));
    numberGroup.appendChild(this._tbSep());
    this.inputW = this._tbAxisInput(numberGroup, "B", (v) => this._setSelectedField("w", v / 100));
    this.inputH = this._tbAxisInput(numberGroup, "H", (v) => this._setSelectedField("h", v / 100));
    numberGroup.appendChild(this._tbSep());
    this.inputRot = this._tbAxisInput(numberGroup, "°", (v) => this._setSelectedField("rotation", v), true);
    this.tbFieldsEl.appendChild(numberGroup);

    this.tbFieldsEl.appendChild(this._buildAlignGroup());
    this.tbFieldsEl.appendChild(this._buildOpacityGroup());

    this.tbChipsWrap = document.createElement("div");
    this.tbChipsWrap.style.display = "flex";
    this.tbChipsWrap.style.alignItems = "center";
    this.tbChipsWrap.style.gap = "8px";
    this.tbFieldsEl.appendChild(this.tbChipsWrap);

    const tbSpacer = document.createElement("div");
    tbSpacer.style.flex = "1";
    this.tbFieldsEl.appendChild(tbSpacer);

    this.deleteElementBtn = document.createElement("button");
    this.deleteElementBtn.className = "le-tb-delete";
    this.deleteElementBtn.textContent = t("layoutEditor.deleteElementBtn");
    this.deleteElementBtn.addEventListener("click", () => this._deleteSelectedElement());
    this.tbFieldsEl.appendChild(this.deleteElementBtn);

    bar.appendChild(this.tbFieldsEl);

    // Appended to the transform bar itself (not the scrolling .tbFieldsEl
    // row) and positioned via JS (position: fixed) — the row's
    // overflow-x: auto implicitly clips overflow-y too, which would hide
    // any absolutely-positioned popover nested inside it.
    this.popoverEl = document.createElement("div");
    this.popoverEl.className = "le-popover";
    bar.appendChild(this.popoverEl);

    document.addEventListener("click", (e) => {
      if (this._openPopoverKey && !this.popoverEl.contains(e.target) && !this.tbChipsWrap.contains(e.target)) {
        this._closePopover();
      }
    });

    return bar;
  }

  _tbSep() {
    const sep = document.createElement("div");
    sep.className = "le-tb-sep";
    return sep;
  }

  _tbAxisInput(container, axisText, onChange, isRotation = false) {
    const axis = document.createElement("span");
    axis.className = "le-tb-axis";
    axis.textContent = axisText;
    const input = document.createElement("input");
    input.type = "number";
    input.className = "le-tb-input" + (isRotation ? " rotation" : "");
    input.addEventListener("input", () => {
      const v = Number(input.value);
      if (Number.isFinite(v)) onChange(v);
    });
    container.append(axis, input);
    return input;
  }

  _buildAlignGroup() {
    const group = document.createElement("div");
    group.className = "le-tb-group le-tb-align";
    const buttons = [
      ["⇤", t("layoutEditor.alignLeftEdge"), () => this._alignSelected("left")],
      ["⇔", t("layoutEditor.alignCenterH"), () => this._alignSelected("centerH")],
      ["⇥", t("layoutEditor.alignRightEdge"), () => this._alignSelected("right")],
      ["⤒", t("layoutEditor.alignTopEdge"), () => this._alignSelected("top")],
      ["⤓", t("layoutEditor.alignBottomEdge"), () => this._alignSelected("bottom")],
    ];
    buttons.forEach(([glyph, title, onClick]) => {
      const btn = document.createElement("button");
      btn.className = "le-tb-align-btn";
      btn.textContent = glyph;
      btn.title = title;
      btn.addEventListener("click", onClick);
      group.appendChild(btn);
    });
    return group;
  }

  _buildOpacityGroup() {
    const group = document.createElement("div");
    group.className = "le-tb-group le-tb-opacity";
    const label = document.createElement("label");
    label.textContent = t("common.opacity");
    this.inputOpacity = document.createElement("input");
    this.inputOpacity.type = "range";
    this.inputOpacity.min = "5";
    this.inputOpacity.max = "100";
    this.opacityValueEl = document.createElement("span");
    this.opacityValueEl.className = "le-tb-value le-mono";
    this.inputOpacity.addEventListener("input", () => {
      this.opacityValueEl.textContent = `${this.inputOpacity.value}%`;
      this._setSelectedField("opacity", Number(this.inputOpacity.value) / 100);
    });
    group.append(label, this.inputOpacity, this.opacityValueEl);
    return group;
  }

  _buildChip(labelKey, valueText, popoverKey) {
    const chip = document.createElement("div");
    chip.className = "le-tb-group le-tb-chip";
    const label = document.createElement("span");
    label.className = "le-tb-chip-label";
    label.textContent = t(labelKey);
    const value = document.createElement("span");
    value.className = "le-tb-chip-value";
    value.textContent = valueText;
    const caret = document.createElement("span");
    caret.className = "le-tb-chip-caret";
    caret.textContent = "▾";
    chip.append(label, value, caret);
    chip.addEventListener("click", (e) => {
      e.stopPropagation();
      this._togglePopover(popoverKey, chip);
    });
    return chip;
  }

  _togglePopover(key, chip) {
    if (this._openPopoverKey === key) {
      this._closePopover();
      return;
    }
    this._openPopover(key, chip);
  }

  _openPopover(key, chip) {
    this.popoverEl.innerHTML = "";
    const section = this._popoverSections[key];
    if (!section) return;
    this.popoverEl.appendChild(section);
    this.popoverEl.classList.add("open");
    this._openPopoverKey = key;

    const barRect = this.transformBarEl.getBoundingClientRect();
    const anchorRect = chip ? chip.getBoundingClientRect() : barRect;
    // Measure after the content swap above so the popover's real height is
    // known; position: fixed avoids the transform bar's own
    // overflow-x: auto (which implicitly clips overflow-y too) hiding it.
    const popRect = this.popoverEl.getBoundingClientRect();
    let left = anchorRect.left;
    left = Math.min(left, window.innerWidth - popRect.width - 12);
    left = Math.max(left, 12);
    this.popoverEl.style.left = `${left}px`;
    this.popoverEl.style.bottom = `${window.innerHeight - barRect.top + 8}px`;
  }

  _closePopover() {
    this.popoverEl.classList.remove("open");
    this._openPopoverKey = null;
  }

  // Builds every type-specific field group once (as standalone containers)
  // so opening a popover just re-parents the right one in — this reuses all
  // the original property-panel field-building logic verbatim instead of
  // rewriting it, and keeps every existing setter/validation path intact.
  _buildPropertySections() {
    this._popoverSections = {};

    // -- "Ecken" (corner style + accent stripe/color, dayCard/header/rect-shape)
    const cornerSection = document.createElement("div");
    this._appendSectionHeader(cornerSection, t("layoutEditor.elementStyleHeader"));
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
    cornerSection.appendChild(this.cornerWrap);

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
    cornerSection.appendChild(this.stripeWrap);

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
    cornerSection.appendChild(this.accentWrap);
    this._popoverSections.corner = cornerSection;

    // -- "Design" (card skin, dayCard only)
    const designSection = document.createElement("div");
    this._appendSectionHeader(designSection, t("layoutEditor.cardSkinHeader"));
    const labels = cardStyleLabels();
    const { wrap: cardStyleWrap, select: cardStyleSelect } = this._appendSelectRow(
      designSection,
      t("layoutEditor.skinLabel"),
      CARD_STYLES.map((v) => [v === "classic" ? "" : v, labels[v]]),
      (value) => this._setSelectedField("cardStyle", value || null)
    );
    this.cardStyleWrap = cardStyleWrap;
    this.cardStyleSelect = cardStyleSelect;
    this._popoverSections.design = designSection;

    // -- "Schrift" (font override — dayCard/header/text/dayTime)
    const fontSection = document.createElement("div");
    this._appendSectionHeader(fontSection, t("layoutEditor.fontHeader"));
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
      this._refreshTransformBar();
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
          this._refreshTransformBar();
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
      this._refreshTransformBar();
    });
    fontBtnRow.append(fontUploadBtn, fontResetBtn);
    this.fontWrap.appendChild(fontBtnRow);
    fontSection.appendChild(this.fontWrap);
    this._popoverSections.font = fontSection;

    // -- "Animation" (all types)
    const animSection = document.createElement("div");
    this._appendSectionHeader(animSection, t("layoutEditor.animationHeader"));
    const animLabels = animStyleLabels();
    const { select: animSelect } = this._appendSelectRow(
      animSection,
      t("layoutEditor.animStyleLabel"),
      ELEMENT_ANIM_STYLES.map((v) => [v === "none" ? "" : v, animLabels[v]]),
      (value) => this._setSelectedField("animStyle", value || null)
    );
    this.animSelect = animSelect;
    const intensityLabels = animIntensityLabels();
    const { select: intensitySelect } = this._appendSelectRow(
      animSection,
      t("layoutEditor.intensityLabel"),
      ELEMENT_ANIM_INTENSITIES.map((v) => [v, intensityLabels[v]]),
      (value) => this._setSelectedField("animIntensity", value)
    );
    this.animIntensitySelect = intensitySelect;
    this._popoverSections.animation = animSection;

    // -- "Inhalt" (type-specific content — text/shape/image)
    const contentSection = document.createElement("div");
    this.textFieldsWrap = document.createElement("div");
    this._appendSectionHeader(this.textFieldsWrap, t("layoutEditor.textContentHeader"));
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
    contentSection.appendChild(this.textFieldsWrap);

    this.shapeFieldsWrap = document.createElement("div");
    this._appendSectionHeader(this.shapeFieldsWrap, t("layoutEditor.shapeHeader"));
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
    contentSection.appendChild(this.shapeFieldsWrap);

    this.imageFieldsWrap = document.createElement("div");
    this._appendSectionHeader(this.imageFieldsWrap, t("layoutEditor.imageHeader"));
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
        this._refreshTransformBar();
      }
    });
    imageBtnRow.appendChild(imageUploadBtn);
    this.imageFieldsWrap.appendChild(imageBtnRow);
    contentSection.appendChild(this.imageFieldsWrap);
    this._popoverSections.content = contentSection;
  }

  _appendSectionHeader(container, text) {
    const header = document.createElement("div");
    header.className = "section-header";
    header.textContent = text;
    container.appendChild(header);
    return header;
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

  // ------------------------------------------------------------------
  // Element mutation helpers
  // ------------------------------------------------------------------

  _setSelectedField(field, rawValue) {
    const el = this._draftElements.find((e) => e.id === this._selectedId);
    if (!el) return;
    let value = rawValue;
    if (field === "cx" || field === "cy") value = clamp(value, -0.5, 1.5);
    if (field === "w" || field === "h") value = clamp(value, 0.02, 2.5);
    el[field] = value;
    this._markDirty();
    this._positionHandleEl(this._handleEls.get(el.id), el);
    this._renderCanvas();
  }

  _alignSelected(mode) {
    const el = this._draftElements.find((e) => e.id === this._selectedId);
    if (!el) return;
    if (mode === "left") el.cx = el.w / 2;
    if (mode === "right") el.cx = 1 - el.w / 2;
    if (mode === "centerH") el.cx = 0.5;
    if (mode === "top") el.cy = el.h / 2;
    if (mode === "bottom") el.cy = 1 - el.h / 2;
    this._markDirty();
    this._positionHandleEl(this._handleEls.get(el.id), el);
    this._renderCanvas();
    this._syncTransformValues(el);
  }

  _duplicateSelected() {
    const el = this._draftElements.find((e) => e.id === this._selectedId);
    if (!el || !FREEFORM_ELEMENT_TYPES.includes(el.type)) return;
    const copy = createFreeformElement(el.type, { ...el, id: undefined, cx: clamp(el.cx + 0.03, -0.5, 1.5), cy: clamp(el.cy + 0.03, -0.5, 1.5) });
    this._draftElements.push(copy);
    this._markDirty();
    this._renderCanvas();
    this._renderOverlay();
    this._refreshLayersList();
    this._selectElement(copy.id);
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
    this._markDirty();
    this._renderCanvas();
    this._renderOverlay();
    this._refreshLayersList();
  }

  _sendToBack(id) {
    const idx = this._draftElements.findIndex((e) => e.id === id);
    if (idx <= 0) return;
    const [el] = this._draftElements.splice(idx, 1);
    this._draftElements.unshift(el);
    this._markDirty();
    this._renderCanvas();
    this._renderOverlay();
    this._refreshLayersList();
  }

  // Freeform elements (text/shape/image) are additions on top of the fixed
  // 9 — any number can be added/removed, unlike the day cards/header/logo.
  _addFreeformElement(type, overrides = {}) {
    const el = createFreeformElement(type, overrides);
    this._draftElements.push(el);
    this._markDirty();
    this._renderCanvas();
    this._renderOverlay();
    this._refreshLayersList();
    this._selectElement(el.id);
  }

  _deleteSelectedElement() {
    const id = this._selectedId;
    if (!id || CUSTOM_LAYOUT_ELEMENT_IDS.includes(id)) return; // the fixed 9 can't be deleted, only freeform extras
    const idx = this._draftElements.findIndex((e) => e.id === id);
    if (idx === -1) return;
    this._draftElements.splice(idx, 1);
    this._markDirty();
    this._selectElement(null);
    this._renderCanvas();
    this._renderOverlay();
    this._refreshLayersList();
  }

  _renderCanvas() {
    const baseStyle = this.getBaseStyle ? this.getBaseStyle() : null;
    const elements = this._hiddenIds?.size ? this._draftElements.filter((el) => !this._hiddenIds.has(el.id)) : this._draftElements;
    const draftStyle = { ...baseStyle, customLayout: { elements } };
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

    const expandedCardId = this._draftElements.find((e) => e.id === this._selectedId && e.type === "dayCard")?.id || null;

    // Iterate in the elements array's own order — this is the user-
    // controlled z-order (see _bringToFront/_sendToBack), and DOM paint
    // order among unpositioned-vs-absolute siblings follows source order,
    // so this keeps "what you can click on top" matching "what you see on
    // top" in exact sync with the canvas.
    this._draftElements.forEach((el) => {
      const isDayTime = el.type === "dayTime";
      const div = document.createElement("div");
      div.className =
        "le-handle" +
        (isDayTime ? " daytime" + (el.dayKey === expandedCardId ? " visible" : "") : "") +
        (el.id === this._selectedId ? " selected" : "");
      this._positionHandleEl(div, el);

      const label = document.createElement("div");
      label.className = "le-handle-label";
      label.textContent = elementLabel(el);
      div.appendChild(label);

      Object.keys(CORNER_SIGNS).forEach((corner) => {
        const handle = document.createElement("div");
        handle.className = `le-handle-resize ${corner}`;
        handle.addEventListener("pointerdown", (e) => this._startResize(e, el, corner));
        div.appendChild(handle);
      });

      const rotateHandle = document.createElement("div");
      rotateHandle.className = "le-handle-rotate";
      rotateHandle.addEventListener("pointerdown", (e) => this._startRotate(e, el));
      div.appendChild(rotateHandle);

      div.addEventListener("pointerdown", (e) => {
        if (e.target !== div && e.target !== label) return; // handles run their own listeners
        this._selectElement(el.id);
        this._startMove(e, el);
      });
      if (el.type === "text") {
        div.addEventListener("dblclick", () => {
          this._selectElement(el.id);
          this._openPopover("content", null);
          this.textArea?.focus();
        });
      }

      this.overlayLayer.appendChild(div);
      this._handleEls.set(el.id, div);
    });
  }

  _selectElement(id) {
    if (this._selectedId === id) {
      return;
    }
    const prevWasDayCard = this._draftElements.find((e) => e.id === this._selectedId)?.type === "dayCard";
    const prev = this._handleEls.get(this._selectedId);
    if (prev) prev.classList.remove("selected");
    this._selectedId = id;
    const next = this._handleEls.get(id);
    if (next) next.classList.add("selected");
    const nextIsDayCard = this._draftElements.find((e) => e.id === id)?.type === "dayCard";
    if (prevWasDayCard || nextIsDayCard) {
      this._renderOverlay(); // dayTime handle visibility depends on selection
      const reselected = this._handleEls.get(id);
      if (reselected) reselected.classList.add("selected");
    }
    this._closePopover();
    this._refreshTransformBar();
    this._refreshLayersList();
  }

  _refreshTransformBar() {
    const el = this._draftElements.find((e) => e.id === this._selectedId);
    if (!el) {
      this.tbEmptyEl.style.display = "";
      this.tbFieldsEl.style.display = "none";
      this.hudEl.classList.remove("visible");
      return;
    }
    this.tbEmptyEl.style.display = "none";
    this.tbFieldsEl.style.display = "flex";
    this.tbNameEl.textContent = el.type === "dayCard" ? el.id : elementLabel(el);

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
    this.textFieldsWrap.style.display = isText ? "" : "none";
    this.shapeFieldsWrap.style.display = isShape ? "" : "none";
    this.imageFieldsWrap.style.display = isImage ? "" : "none";
    this.deleteElementBtn.disabled = !isFreeform;
    this.deleteElementBtn.style.display = isFreeform ? "" : "none";

    // Rebuild the chip row for this element's applicable popovers.
    this.tbChipsWrap.innerHTML = "";
    const chipDefs = [];
    if (isDayCard || isHeader || (isShape && el.shapeKind === "rect")) chipDefs.push(["layoutEditor.cornerStyleLabel", "corner"]);
    if (isDayCard) chipDefs.push(["layoutEditor.cardSkinHeader", "design"]);
    if (isDayCard || isHeader || isText || isDayTime) chipDefs.push(["layoutEditor.fontHeader", "font"]);
    chipDefs.push(["layoutEditor.animationHeader", "animation"]);
    if (isText || isShape || isImage) chipDefs.push(["layoutEditor.textContentHeader", "content"]);
    chipDefs.forEach(([labelKey, key]) => {
      const chip = this._buildChip(labelKey, this._chipValueText(key, el), key);
      this.tbChipsWrap.appendChild(chip);
    });
    if (this._openPopoverKey && !chipDefs.some(([, key]) => key === this._openPopoverKey)) this._closePopover();

    this._syncTransformValues(el);
  }

  // Short current-value label shown on each dropdown-chip in the transform
  // bar (e.g. "Ecken" shows "Abgerundet") so the chip is informative even
  // before it's opened.
  _chipValueText(key, el) {
    if (key === "corner") {
      const labels = {
        "": t("layoutEditor.cornerInheritOpt"),
        sharp: t("layoutEditor.cornerSharpOpt"),
        rounded: t("layoutEditor.cornerRoundedOpt"),
        pill: t("layoutEditor.cornerPillOpt"),
      };
      return labels[el.cornerStyle || ""];
    }
    if (key === "design") {
      const labels = cardStyleLabels();
      return labels[el.cardStyle || "classic"];
    }
    if (key === "font") {
      return el.fontFamily || t("layoutEditor.cornerInheritOpt");
    }
    if (key === "animation") {
      const labels = animStyleLabels();
      return labels[el.animStyle || "none"];
    }
    if (key === "content") {
      if (el.type === "text") return t("layoutEditor.textLabel");
      if (el.type === "shape") return t("layoutEditor.shapeHeader");
      if (el.type === "image") return t("layoutEditor.imageHeader");
    }
    return "";
  }

  _syncTransformValues(el) {
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
    if (active !== this.inputOpacity) {
      this.inputOpacity.value = String(Math.round((el.opacity ?? 1) * 100));
      this.opacityValueEl.textContent = `${this.inputOpacity.value}%`;
    }

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

    this._updateHud(el);
  }

  _updateHud(el) {
    this.hudEl.classList.add("visible");
    this.hudX.value.textContent = (el.cx * 100).toFixed(1);
    this.hudY.value.textContent = (el.cy * 100).toFixed(1);
    this.hudW.value.textContent = (el.w * 100).toFixed(1);
    this.hudH.value.textContent = (el.h * 100).toFixed(1);
    const div = this._handleEls.get(el.id);
    if (!div) return;
    const wrapRect = this.canvasWrap.getBoundingClientRect();
    const left = (el.cx + el.w / 2) * wrapRect.width + 14;
    const top = (el.cy - el.h / 2) * wrapRect.height - 2;
    const overflowsRight = left + 150 > wrapRect.width;
    this.hudEl.style.left = overflowsRight ? `${(el.cx - el.w / 2) * wrapRect.width - 160}px` : `${left}px`;
    this.hudEl.style.top = `${Math.max(4, top)}px`;
  }

  _startMove(e, el) {
    e.preventDefault();
    e.stopPropagation();
    this.hudEl.classList.add("dragging");
    const rect = this.canvasWrap.getBoundingClientRect();
    const startFracX = (e.clientX - rect.left) / rect.width;
    const startFracY = (e.clientY - rect.top) / rect.height;
    const startCx = el.cx;
    const startCy = el.cy;

    const move = (ev) => {
      const fx = (ev.clientX - rect.left) / rect.width;
      const fy = (ev.clientY - rect.top) / rect.height;
      let cx = clamp(startCx + (fx - startFracX), -0.5, 1.5);
      let cy = clamp(startCy + (fy - startFracY), -0.5, 1.5);
      let snapX = { snapped: false };
      let snapY = { snapped: false };
      if (this._snapEnabled) {
        snapX = snapAxis(cx, el.w / 2);
        snapY = snapAxis(cy, el.h / 2);
        cx = snapX.value;
        cy = snapY.value;
      }
      this._showSnapGuides(snapX, snapY);
      el.cx = cx;
      el.cy = cy;
      this._markDirty();
      this._positionHandleEl(this._handleEls.get(el.id), el);
      this._renderCanvas();
      this._syncTransformValues(el);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      this._hideSnapGuides();
      this.hudEl.classList.remove("dragging");
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  _showSnapGuides(snapX, snapY) {
    this.snapGuideV.style.display = snapX.snapped ? "" : "none";
    if (snapX.snapped) this.snapGuideV.style.left = `${snapX.axisValue * 100}%`;
    this.snapGuideH.style.display = snapY.snapped ? "" : "none";
    if (snapY.snapped) this.snapGuideH.style.top = `${snapY.axisValue * 100}%`;
  }

  _hideSnapGuides() {
    this.snapGuideV.style.display = "none";
    this.snapGuideH.style.display = "none";
  }

  _startResize(e, el, corner) {
    e.preventDefault();
    e.stopPropagation();
    this._selectElement(el.id);
    this.hudEl.classList.add("dragging");
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
      this._markDirty();
      this._positionHandleEl(this._handleEls.get(el.id), el);
      this._renderCanvas();
      this._syncTransformValues(el);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      this.hudEl.classList.remove("dragging");
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  _startRotate(e, el) {
    e.preventDefault();
    e.stopPropagation();
    this._selectElement(el.id);
    this.hudEl.classList.add("dragging");
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
      this._markDirty();
      this._positionHandleEl(this._handleEls.get(el.id), el);
      this._renderCanvas();
      this._syncTransformValues(el);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      this.hudEl.classList.remove("dragging");
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  // Shared by the in-editor Import action and the topBar "Import Layout"
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
    this._draftName = entry.name;
    this._dirty = false;
    this._refreshDraftChip();
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
    this._draftName = "";
    this._dirty = false;
    this._hiddenIds = new Set();
    this.applyBtn.style.display = this._onApply ? "" : "none";
    this._refreshDraftChip();
    this._selectElement(null);
    this.overlayEl.classList.add("open");
    this._renderCanvas();
    this._renderOverlay();
    this._refreshLayersList();
    this._startAnimTicker();
  }

  openStandalone(onClose) {
    this.open({ onClose });
  }

  close() {
    this.overlayEl.classList.remove("open");
    this._onApply = null; // draft is discarded; the live style was never touched
    this._closePopover();
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
