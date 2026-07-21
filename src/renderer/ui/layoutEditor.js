// The Layout Editor: a full-viewport free-form drag/resize/rotate editor for
// the 9 elements (7 day cards + header + logo) a Custom Template's
// style.customLayout can describe. Opens either standalone (library
// management only) or pre-loaded from a Custom Template's current layout via
// stylePanel.js, which also supplies an onApply callback to write the draft
// back. The draft is a deep-cloned working copy at all times — nothing here
// ever touches the live document style until "Apply to this Template" (or a
// library Save/Export) is explicitly clicked.
import { CANVAS_WIDTH, CANVAS_HEIGHT, DAY_NAMES, DAY_LABELS_SHORT, LAYOUT_FILE_EXTENSION } from "../../shared/constants.js";
import { createStreamerProfile, createDayEntry } from "../models/schedule.js";
import { renderStreamplan } from "../rendering/renderer.js";
import { buildDefaultCustomLayoutElements, sanitizeCustomLayout } from "../models/customLayout.js";
import {
  listCustomLayouts,
  getCustomLayout,
  addCustomLayout,
  updateCustomLayout,
  removeCustomLayout,
} from "../models/customLayoutLibrary.js";

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
    title.textContent = "Layout Editor";
    toolbar.appendChild(title);

    const newBtn = document.createElement("button");
    newBtn.textContent = "New";
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

    const spacer = document.createElement("div");
    spacer.className = "layout-editor-toolbar-spacer";
    toolbar.appendChild(spacer);

    this.applyBtn = document.createElement("button");
    this.applyBtn.className = "primary";
    this.applyBtn.textContent = "Apply to this Template";
    this.applyBtn.addEventListener("click", () => {
      if (this._onApply) this._onApply(this._draftElements.map((el) => ({ ...el })));
      this.close();
    });
    toolbar.appendChild(this.applyBtn);

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "✕ Close";
    closeBtn.addEventListener("click", () => this.close());
    toolbar.appendChild(closeBtn);

    // -- Library row (save/export/import a reusable layout) -----------
    const libraryRow = document.createElement("div");
    libraryRow.className = "layout-editor-library-row";

    this.loadSelect = document.createElement("select");
    this.loadSelect.title = "Load a saved layout";
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
    this.nameInput.placeholder = "Layout name";
    libraryRow.appendChild(this.nameInput);

    const saveBtn = document.createElement("button");
    saveBtn.textContent = "Save to Library";
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
    exportBtn.textContent = "Export…";
    exportBtn.addEventListener("click", async () => {
      const name = this.nameInput.value.trim() || "Custom Layout";
      const defaultName = `${sanitizeFilename(name)}${LAYOUT_FILE_EXTENSION}`;
      let targetPath;
      try {
        targetPath = await window.streamplanAPI.chooseSaveLayoutPath(defaultName);
      } catch (err) {
        await window.streamplanAPI.showMessage("error", "Export failed", `Could not open the save dialog: ${err.message}`);
        return;
      }
      if (!targetPath) return;
      try {
        const payload = { name, elements: this._draftElements.map((el) => ({ ...el })) };
        const bytes = new TextEncoder().encode(JSON.stringify(payload, null, 2));
        await window.streamplanAPI.writeFile(targetPath, bytes);
      } catch (err) {
        console.error(err);
        await window.streamplanAPI.showMessage("error", "Export failed", err.message);
      }
    });
    libraryRow.appendChild(exportBtn);

    const importBtn = document.createElement("button");
    importBtn.textContent = "Import…";
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
    this.deleteLibraryBtn.textContent = "Delete from Library";
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

  _buildPropertyPanel(container) {
    this.propEmpty = document.createElement("div");
    this.propEmpty.className = "field-hint";
    this.propEmpty.textContent =
      "Click a day card, the header, or the logo on the canvas to select it, then drag, resize (corner handles), or rotate (top handle) it — or use the fields below for precise values.";
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
    this.inputX = makeNumberRow("Horizontal Position (%)", -50, 150, 0.1, (v) => this._setSelectedField("cx", v / 100));
    this.inputY = makeNumberRow("Vertical Position (%)", -50, 150, 0.1, (v) => this._setSelectedField("cy", v / 100));
    this.inputW = makeNumberRow("Width (%)", 2, 250, 0.1, (v) => this._setSelectedField("w", v / 100));
    this.inputH = makeNumberRow("Height (%)", 2, 250, 0.1, (v) => this._setSelectedField("h", v / 100));
    this.inputRot = makeNumberRow("Rotation (°)", -180, 180, 1, (v) => this._setSelectedField("rotation", v));

    // -- Per-element style overrides — every element starts inheriting the
    // template's global look, so a fresh layout renders identically to
    // before any of this is touched; each control here diverges just that
    // one element from the template on demand.
    const styleHeader = document.createElement("div");
    styleHeader.className = "section-header";
    styleHeader.textContent = "Element Style";
    this.propFields.appendChild(styleHeader);

    this.cornerWrap = document.createElement("div");
    this.cornerWrap.style.marginBottom = "12px";
    const cornerLabel = document.createElement("label");
    cornerLabel.className = "field-label";
    cornerLabel.textContent = "Corner Style";
    this.cornerWrap.appendChild(cornerLabel);
    this.cornerSelect = document.createElement("select");
    [
      ["", "Inherit Template"],
      ["sharp", "Sharp"],
      ["rounded", "Rounded"],
      ["pill", "Pill (fully rounded)"],
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
    stripeText.textContent = "Show accent stripe";
    stripeLabel.append(this.stripeCheckbox, stripeText);
    this.stripeWrap.appendChild(stripeLabel);
    this.propFields.appendChild(this.stripeWrap);

    this.accentWrap = document.createElement("div");
    this.accentWrap.style.marginBottom = "12px";
    const accentLabel = document.createElement("label");
    accentLabel.className = "field-label";
    accentLabel.textContent = "Accent Color Override";
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
    accentResetBtn.textContent = "Use Template Color";
    accentResetBtn.addEventListener("click", () => this._setSelectedField("accentColor", null));
    accentRow.append(this.accentColorInput, accentResetBtn);
    this.accentWrap.appendChild(accentRow);
    this.propFields.appendChild(this.accentWrap);

    this.inputOpacity = makeNumberRow("Opacity (%)", 5, 100, 1, (v) => this._setSelectedField("opacity", v / 100));

    this.zOrderRow = document.createElement("div");
    this.zOrderRow.className = "asset-actions";
    this.zOrderRow.style.marginTop = "6px";
    const bringFrontBtn = document.createElement("button");
    bringFrontBtn.textContent = "⬆ Bring to Front";
    bringFrontBtn.addEventListener("click", () => this._bringToFront(this._selectedId));
    const sendBackBtn = document.createElement("button");
    sendBackBtn.textContent = "⬇ Send to Back";
    sendBackBtn.addEventListener("click", () => this._sendToBack(this._selectedId));
    this.zOrderRow.append(bringFrontBtn, sendBackBtn);
    this.propFields.appendChild(this.zOrderRow);
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

  _refreshLoadSelect() {
    const current = this._loadedLibraryId;
    this.loadSelect.innerHTML = "";
    const blank = document.createElement("option");
    blank.value = "";
    blank.textContent = "— unsaved draft —";
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
      label.textContent = el.type === "dayCard" ? DAY_LABELS_SHORT[el.id] || el.id : el.type === "header" ? "Header" : "Logo";
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
    this.propTitle.textContent = el.type === "dayCard" ? el.id : el.type === "header" ? "Header" : "Logo";
    // Corner shape / accent color are meaningless on the logo (always
    // circular, no accent-colored parts); the stripe only exists on cards.
    this.cornerWrap.style.display = el.type === "logo" ? "none" : "";
    this.accentWrap.style.display = el.type === "logo" ? "none" : "";
    this.stripeWrap.style.display = el.type === "dayCard" ? "" : "none";
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
      await window.streamplanAPI.showMessage("error", "Import failed", `Could not open the file dialog: ${err.message}`);
      return null;
    }
    if (!targetPath) return null;
    try {
      const bytes = await window.streamplanAPI.readFile(targetPath);
      const parsed = JSON.parse(new TextDecoder().decode(bytes));
      if (!parsed || !parsed.elements) throw new Error("This file isn't a valid Streamplan layout.");
      return addCustomLayout({ name: parsed.name || "Imported Layout", elements: parsed.elements });
    } catch (err) {
      console.error(err);
      await window.streamplanAPI.showMessage("error", "Import failed", `Could not import layout: ${err.message}`);
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
  }

  openStandalone(onClose) {
    this.open({ onClose });
  }

  close() {
    this.overlayEl.classList.remove("open");
    this._onApply = null; // draft is discarded; the live style was never touched
    const onClose = this._onClose;
    this._onClose = null;
    if (onClose) onClose();
  }
}
