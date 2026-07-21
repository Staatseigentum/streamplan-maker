import { COLOR_KEYS, FONT_SCALE_MIN, FONT_SCALE_MAX, cloneStyle, styleToDict, styleFromDict } from "../models/style.js";
import { TEMPLATE_ORDER, getTemplate, customBaseStyle } from "../models/templates.js";
import {
  addCustomTemplate,
  updateCustomTemplate,
  removeCustomTemplate,
  getCustomTemplate,
  isCustomTemplateId,
} from "../models/customTemplateLibrary.js";
import { TemplateGallery } from "./templateGallery.js";
import { buildAssetsTab } from "./assetsTab.js";
import { listCustomFonts } from "../rendering/fontLibrary.js";
import { listCustomLayouts, getCustomLayout } from "../models/customLayoutLibrary.js";
import { buildSliderRow } from "./formControls.js";
import { TEMPLATE_FILE_EXTENSION } from "../../shared/constants.js";

function sanitizeFilename(name) {
  const cleaned = (name || "").trim().replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, "_");
  return cleaned || "custom_template";
}

const COLOR_LABELS = {
  background: "Background",
  backgroundEnd: "Background (gradient end)",
  panel: "Card Panel",
  accent: "Accent",
  accentSecondary: "Accent 2",
  textPrimary: "Text",
  textSecondary: "Text (muted)",
  glow: "Glow",
};

const SYSTEM_FONTS = ["Georgia", "Segoe UI", "Bahnschrift", "Impact", "Consolas", "Trebuchet MS", "Verdana", "Arial"];
const LAYOUT_LABELS = {
  list: "List Rows",
  grid7: "Grid Nodes",
  verticalTimeline: "Vertical Timeline",
  calendarGrid: "Calendar Columns",
  compactBadges: "Compact Badges",
  splitColumns: "Weekday / Weekend Split",
  radialClock: "Radial Clock",
  ticketStrip: "Ticket Stubs",
  cascadeFlow: "Cascade Flow",
  orbitRing: "Orbit Ring",
  novaRadiate: "Nova Radiate",
  meteorRow: "Meteor Row",
};
const CORNER_LABELS = { sharp: "Sharp Corners", rounded: "Rounded Corners" };
const BG_MODE_LABELS = { solid: "Solid Color", gradient: "Gradient", image: "Custom Image" };
const BACKGROUND_ANIM_LABELS = {
  none: "None",
  nebulaDrift: "Nebula Drift",
  aurora: "Aurora",
  starfield: "Starfield",
  novaPulse: "Nova Pulse",
  meteorShower: "Meteor Shower",
};

function buildSelectRow(labelText, options, getValue, setValue) {
  const wrap = document.createElement("div");
  wrap.style.marginBottom = "12px";
  const label = document.createElement("label");
  label.className = "field-label";
  label.textContent = labelText;
  wrap.appendChild(label);
  const select = document.createElement("select");
  Object.entries(options).forEach(([value, text]) => {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = text;
    select.appendChild(opt);
  });
  wrap.appendChild(select);
  select.addEventListener("change", () => setValue(select.value));
  const refresh = () => {
    select.value = getValue();
  };
  refresh();
  return { el: wrap, refresh };
}

function buildFontSelectRow(labelText, getFont, setFont) {
  const wrap = document.createElement("div");
  wrap.style.marginBottom = "12px";
  const label = document.createElement("label");
  label.className = "field-label";
  label.textContent = labelText;
  wrap.appendChild(label);
  const select = document.createElement("select");
  wrap.appendChild(select);

  // family -> path, so a change event can recover the right path for
  // permanently-listed custom fonts (system font options have path: null).
  const familyPaths = new Map();

  const refresh = () => {
    const font = getFont();
    select.innerHTML = "";
    familyPaths.clear();

    const library = listCustomFonts();
    library.forEach((entry) => {
      const opt = document.createElement("option");
      opt.value = entry.family;
      opt.textContent = `Custom Font: ${entry.displayName}`;
      select.appendChild(opt);
      familyPaths.set(entry.family, entry.path);
    });

    SYSTEM_FONTS.forEach((family) => {
      const opt = document.createElement("option");
      opt.value = family;
      opt.textContent = family;
      select.appendChild(opt);
      familyPaths.set(family, null);
    });

    // Safety net: if the active font is a custom font not yet in the
    // library (e.g. still loading), show it anyway so selection stays correct.
    if (font.path && !familyPaths.has(font.family)) {
      const opt = document.createElement("option");
      opt.value = font.family;
      opt.textContent = `Custom Font: ${font.path.split(/[\\/]/).pop()}`;
      select.insertBefore(opt, select.firstChild);
      familyPaths.set(font.family, font.path);
    }

    select.value = font.family;
  };

  select.addEventListener("change", () => {
    setFont({ family: select.value, path: familyPaths.get(select.value) || null });
    refresh();
  });

  refresh();
  return { el: wrap, refresh };
}


function buildCustomImageEditor(stickerId, getStyle, onStyleChange, onRemoved) {
  const findSticker = () => (getStyle().customImages || []).find((img) => img.id === stickerId);
  const sticker = findSticker();
  if (!sticker) return document.createElement("div");

  const wrap = document.createElement("div");
  wrap.className = "asset-card";

  const title = document.createElement("div");
  title.className = "asset-title";
  title.textContent = sticker.path.split(/[\\/]/).pop();
  wrap.appendChild(title);

  const mutate = (fn) => {
    const style = getStyle();
    const target = (style.customImages || []).find((img) => img.id === stickerId);
    if (!target) return;
    fn(target);
    onStyleChange(style);
  };

  [
    ["Horizontal Position", 0, 1, 0.01, "x", 0.5],
    ["Vertical Position", 0, 1, 0.01, "y", 0.5],
    ["Size", 0.05, 0.9, 0.01, "scale", 0.25],
    ["Opacity", 0.05, 1, 0.01, "opacity", 1],
  ].forEach(([label, min, max, step, field, fallback]) => {
    const row = buildSliderRow(
      label,
      min,
      max,
      step,
      () => findSticker()?.[field] ?? fallback,
      (value) => mutate((img) => { img[field] = value; })
    );
    wrap.appendChild(row.el);
  });

  const removeBtn = document.createElement("button");
  removeBtn.textContent = "Remove Image";
  removeBtn.className = "danger";
  removeBtn.style.marginTop = "4px";
  removeBtn.addEventListener("click", () => {
    const style = getStyle();
    style.customImages = (style.customImages || []).filter((img) => img.id !== stickerId);
    onStyleChange(style);
    onRemoved();
  });
  wrap.appendChild(removeBtn);

  return wrap;
}

function buildColorRow(key, getStyle, onStyleChange) {
  const row = document.createElement("div");
  row.className = "swatch-row";
  const label = document.createElement("span");
  label.className = "swatch-label";
  label.textContent = COLOR_LABELS[key] || key;
  const swatch = document.createElement("input");
  swatch.type = "color";
  swatch.className = "color-swatch";
  swatch.value = getStyle().colors[key] || "#000000";
  swatch.addEventListener("input", () => {
    const style = getStyle();
    style.colors[key] = swatch.value;
    onStyleChange(style);
  });
  row.append(label, swatch);
  const refresh = () => {
    swatch.value = getStyle().colors[key] || "#000000";
  };
  return { el: row, refresh };
}

export class StylePanel {
  constructor(container, { getStyle, onStyleApplied, onStyleChange, openLayoutEditor }) {
    this.container = container;
    this.getStyle = getStyle;
    this.onStyleApplied = onStyleApplied; // called when a whole new style object should replace the current one
    this.onStyleChange = onStyleChange; // called after an in-place mutation
    this.openLayoutEditor = openLayoutEditor || (() => {}); // opens the Layout Editor overlay pre-loaded with { elements, onApply }
    this._refreshers = [];
    this._build();
  }

  _build() {
    const tabs = document.createElement("div");
    tabs.className = "tabs";
    const panelsWrap = document.createElement("div");

    const tabDefs = [
      ["templates", "Templates"],
      ["customize", "Customize"],
      ["templateCustomize", "Template Customize"],
      ["assets", "Assets"],
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

    this.container.append(tabs, panelsWrap);

    this._buildTemplatesTab(this.panelEls.templates);
    this._buildCustomizeTab(this.panelEls.customize);
    this._buildTemplateCustomizeTab(this.panelEls.templateCustomize);
    const assetRefreshers = buildAssetsTab(this.panelEls.assets, {
      getStyle: this.getStyle,
      onStyleChange: (style) => {
        this.onStyleChange(style);
        this._refreshAll();
      },
    });
    this._refreshers.push(...assetRefreshers);

    this._updateTemplateCustomizeVisibility();
  }

  _activateTab(id) {
    Object.entries(this.tabBtns).forEach(([tid, btn]) => btn.classList.toggle("active", tid === id));
    Object.entries(this.panelEls).forEach(([tid, panel]) => panel.classList.toggle("active", tid === id));
  }

  _updateTemplateCustomizeVisibility() {
    const visible = isCustomTemplateId(this.getStyle().templateId);
    this.tabBtns.templateCustomize.style.display = visible ? "" : "none";
    if (!visible && this.tabBtns.templateCustomize.classList.contains("active")) {
      this._activateTab("templates");
    }
  }

  _buildTemplatesTab(panel) {
    const hint = document.createElement("div");
    hint.className = "field-hint";
    hint.textContent = "Pick a starting look, then fine-tune it in Customize.";
    panel.appendChild(hint);

    this.gallery = new TemplateGallery(
      panel,
      (templateId) => {
        let newStyle;
        if (templateId === "custom") {
          newStyle = customBaseStyle();
        } else if (isCustomTemplateId(templateId)) {
          newStyle = cloneStyle(getCustomTemplate(templateId).style);
          newStyle.templateId = templateId;
        } else {
          newStyle = getTemplate(templateId);
        }
        this.onStyleApplied(newStyle);
        this._refreshAll();
        if (isCustomTemplateId(templateId)) this._activateTab("templateCustomize");
      },
      {
        onRemoveCustom: (id) => {
          removeCustomTemplate(id);
          if (this.getStyle().templateId === id) {
            this.onStyleApplied(getTemplate(TEMPLATE_ORDER[0]));
            this._activateTab("templates");
          }
          this.gallery.rebuild();
          this._refreshAll();
        },
      }
    );
    const current = this.getStyle();
    if (current.templateId) this.gallery.setSelected(current.templateId);
  }

  _buildCustomizeTab(panel) {
    this._appendStyleControls(panel);
  }

  _buildTemplateCustomizeTab(panel) {
    const hint = document.createElement("div");
    hint.className = "field-hint";
    hint.textContent =
      "Only visible while a Custom template is selected. Build a fully custom look below, save it to your permanent library, or export/import it as a file.";
    panel.appendChild(hint);

    const nameRow = document.createElement("div");
    nameRow.style.marginBottom = "12px";
    const nameLabel = document.createElement("label");
    nameLabel.className = "field-label";
    nameLabel.textContent = "Template Name";
    nameRow.appendChild(nameLabel);
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.placeholder = "My Custom Template";
    nameRow.appendChild(nameInput);
    panel.appendChild(nameRow);

    const refreshName = () => {
      const style = this.getStyle();
      const entry = isCustomTemplateId(style.templateId) && style.templateId !== "custom" ? getCustomTemplate(style.templateId) : null;
      nameInput.value = entry ? entry.name : "";
    };
    refreshName();
    this._refreshers.push(refreshName);

    const actions = document.createElement("div");
    actions.className = "asset-actions";
    actions.style.flexWrap = "wrap";
    actions.style.marginBottom = "18px";

    const saveBtn = document.createElement("button");
    saveBtn.className = "primary";
    saveBtn.textContent = "Save to Library";
    saveBtn.addEventListener("click", () => {
      const style = this.getStyle();
      const name = nameInput.value.trim() || "Custom Template";
      if (style.templateId && style.templateId !== "custom" && isCustomTemplateId(style.templateId)) {
        updateCustomTemplate(style.templateId, { name, style });
      } else {
        const entry = addCustomTemplate({ name, style });
        style.templateId = entry.id;
      }
      this.onStyleChange(style);
      this.gallery.rebuild();
      this.gallery.setSelected(style.templateId);
      this._refreshAll();
    });
    actions.appendChild(saveBtn);

    const exportBtn = document.createElement("button");
    exportBtn.textContent = "Export…";
    exportBtn.addEventListener("click", async () => {
      const style = this.getStyle();
      const name = nameInput.value.trim() || "Custom Template";
      const defaultName = `${sanitizeFilename(name)}${TEMPLATE_FILE_EXTENSION}`;
      let targetPath;
      try {
        targetPath = await window.streamplanAPI.chooseSaveTemplatePath(defaultName);
      } catch (err) {
        await window.streamplanAPI.showMessage("error", "Export failed", `Could not open the save dialog: ${err.message}`);
        return;
      }
      if (!targetPath) return;
      try {
        const payload = { name, style: styleToDict(style) };
        const bytes = new TextEncoder().encode(JSON.stringify(payload, null, 2));
        await window.streamplanAPI.writeFile(targetPath, bytes);
      } catch (err) {
        console.error(err);
        await window.streamplanAPI.showMessage("error", "Export failed", err.message);
      }
    });
    actions.appendChild(exportBtn);

    const importBtn = document.createElement("button");
    importBtn.textContent = "Import…";
    importBtn.addEventListener("click", async () => {
      let targetPath;
      try {
        targetPath = await window.streamplanAPI.chooseOpenTemplatePath();
      } catch (err) {
        await window.streamplanAPI.showMessage("error", "Import failed", `Could not open the file dialog: ${err.message}`);
        return;
      }
      if (!targetPath) return;
      try {
        const bytes = await window.streamplanAPI.readFile(targetPath);
        const parsed = JSON.parse(new TextDecoder().decode(bytes));
        if (!parsed || !parsed.style) throw new Error("This file isn't a valid Streamplan template.");
        const importedStyle = styleFromDict(parsed.style);
        // Anything imported from a file is, by definition, someone else's
        // work — if it carries a custom layout, that layout is locked
        // unconditionally, regardless of what the file itself claims, so a
        // downloaded template's arrangement can never be silently unlocked
        // by a crafted file. All other customization (colors/fonts/etc.)
        // stays fully editable.
        importedStyle.layoutLocked = true;
        const entry = addCustomTemplate({ name: parsed.name || "Imported Template", style: importedStyle });
        entry.style.templateId = entry.id;
        this.onStyleApplied(cloneStyle(entry.style));
        this.gallery.rebuild();
        this.gallery.setSelected(entry.id);
        this._refreshAll();
        this._activateTab("templateCustomize");
      } catch (err) {
        console.error(err);
        await window.streamplanAPI.showMessage("error", "Import failed", `Could not import template: ${err.message}`);
      }
    });
    actions.appendChild(importBtn);

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "danger";
    deleteBtn.textContent = "Delete from Library";
    deleteBtn.addEventListener("click", () => {
      const style = this.getStyle();
      if (style.templateId === "custom" || !isCustomTemplateId(style.templateId)) return;
      removeCustomTemplate(style.templateId);
      this.gallery.rebuild();
      this.onStyleApplied(getTemplate(TEMPLATE_ORDER[0]));
      this._activateTab("templates");
      this._refreshAll();
    });
    actions.appendChild(deleteBtn);

    const refreshDeleteBtn = () => {
      const style = this.getStyle();
      deleteBtn.disabled = style.templateId === "custom" || !isCustomTemplateId(style.templateId);
    };
    refreshDeleteBtn();
    this._refreshers.push(refreshDeleteBtn);

    panel.appendChild(actions);

    const styleHeader = document.createElement("div");
    styleHeader.className = "section-header";
    styleHeader.textContent = "Style";
    panel.appendChild(styleHeader);

    this._appendStyleControls(panel, { allowCustomLayout: true });
  }

  // Extended "Layout Style" dropdown used only in the Template Customize
  // tab: the same 8 built-in options as the plain Customize tab, PLUS one
  // entry per layout saved to the permanent layout library, PLUS a trailing
  // "Create/Edit Custom Layout…" action that opens the Layout Editor. This
  // is the ONLY place style.customLayout can ever be set — built-in presets
  // never render this variant of the dropdown, so they're structurally
  // incapable of using a custom layout. Selecting a saved layout applies it
  // immediately; selecting a built-in style clears any custom layout; the
  // whole control is disabled while style.layoutLocked is true (an imported
  // template) so nothing here can change, while every other control on this
  // tab (colors, fonts, etc.) stays fully live.
  _appendLayoutSelectRow(panel) {
    const CREATE_VALUE = "__createCustomLayout";
    const UNSAVED_VALUE = "custom:unsaved";

    const wrap = document.createElement("div");
    wrap.style.marginBottom = "4px";
    const label = document.createElement("label");
    label.className = "field-label";
    label.textContent = "Layout Style";
    wrap.appendChild(label);
    const select = document.createElement("select");
    wrap.appendChild(select);
    panel.appendChild(wrap);

    const lockHint = document.createElement("div");
    lockHint.className = "field-warning";
    const lockIcon = document.createElement("span");
    lockIcon.className = "field-warning-icon";
    lockIcon.textContent = "🔒";
    const lockText = document.createElement("span");
    lockText.textContent =
      "This template's layout was imported and is locked — every other setting on this tab can still be changed.";
    lockHint.append(lockIcon, lockText);
    panel.appendChild(lockHint);

    const refresh = () => {
      const style = this.getStyle();
      select.innerHTML = "";

      Object.entries(LAYOUT_LABELS).forEach(([value, text]) => {
        const opt = document.createElement("option");
        opt.value = value;
        opt.textContent = text;
        select.appendChild(opt);
      });

      const hasCustom = !!(style.customLayout && style.customLayout.elements?.length);
      let selectedValue = style.layoutVariant;
      let matchedId = null;

      const savedLayouts = listCustomLayouts();
      if (hasCustom) {
        const currentJson = JSON.stringify(style.customLayout.elements);
        const match = savedLayouts.find((l) => JSON.stringify(l.elements) === currentJson);
        matchedId = match ? match.id : null;
      }

      savedLayouts.forEach((entry) => {
        const opt = document.createElement("option");
        opt.value = `custom:${entry.id}`;
        opt.textContent = `Custom — ${entry.name}`;
        select.appendChild(opt);
      });

      if (hasCustom) {
        selectedValue = matchedId ? `custom:${matchedId}` : UNSAVED_VALUE;
        if (!matchedId) {
          const opt = document.createElement("option");
          opt.value = UNSAVED_VALUE;
          opt.textContent = "Custom Layout (unsaved)";
          select.appendChild(opt);
        }
      }

      const actionOpt = document.createElement("option");
      actionOpt.value = CREATE_VALUE;
      actionOpt.textContent = hasCustom ? "✎ Edit Custom Layout…" : "✎ Create Custom Layout…";
      select.appendChild(actionOpt);

      select.value = selectedValue;
      select.disabled = !!style.layoutLocked;
      lockHint.style.display = style.layoutLocked ? "" : "none";
    };

    select.addEventListener("change", () => {
      const style = this.getStyle();
      const value = select.value;

      if (value === CREATE_VALUE) {
        this.openLayoutEditor({
          elements: style.customLayout ? style.customLayout.elements : undefined,
          onApply: (elements) => {
            const s = this.getStyle();
            s.customLayout = { elements };
            s.layoutLocked = false;
            this.onStyleChange(s);
          },
          onClose: () => this._refreshAll(),
        });
        refresh(); // snap the visible dropdown back to the real current value
        return;
      }

      if (value.startsWith("custom:")) {
        const id = value.slice("custom:".length);
        const entry = id === "unsaved" ? null : getCustomLayout(id);
        if (!entry) {
          refresh();
          return;
        }
        style.customLayout = { elements: entry.elements.map((el) => ({ ...el })) };
        style.layoutLocked = false;
        this.onStyleChange(style);
        return;
      }

      style.layoutVariant = value;
      style.customLayout = null;
      style.layoutLocked = false;
      this.onStyleChange(style);
    });

    refresh();
    this._refreshers.push(refresh);
  }

  _appendStyleControls(panel, { allowCustomLayout = false } = {}) {
    const colorsHeader = document.createElement("div");
    colorsHeader.className = "section-header";
    colorsHeader.textContent = "Colors";
    panel.appendChild(colorsHeader);

    COLOR_KEYS.forEach((key) => {
      const row = buildColorRow(key, this.getStyle, (style) => this.onStyleChange(style));
      panel.appendChild(row.el);
      this._refreshers.push(row.refresh);
    });

    const fontsHeader = document.createElement("div");
    fontsHeader.className = "section-header";
    fontsHeader.textContent = "Fonts";
    panel.appendChild(fontsHeader);

    const headingRow = buildFontSelectRow(
      "Heading Font",
      () => this.getStyle().fontHeading,
      (font) => {
        const style = this.getStyle();
        style.fontHeading = font;
        this.onStyleChange(style);
      }
    );
    panel.appendChild(headingRow.el);
    this._refreshers.push(headingRow.refresh);

    const bodyRow = buildFontSelectRow(
      "Body Font",
      () => this.getStyle().fontBody,
      (font) => {
        const style = this.getStyle();
        style.fontBody = font;
        this.onStyleChange(style);
      }
    );
    panel.appendChild(bodyRow.el);
    this._refreshers.push(bodyRow.refresh);

    const sizeHeader = document.createElement("div");
    sizeHeader.className = "section-header";
    sizeHeader.textContent = "Text Size";
    panel.appendChild(sizeHeader);

    const headingSizeRow = buildSliderRow(
      "Heading Size",
      FONT_SCALE_MIN,
      FONT_SCALE_MAX,
      0.05,
      () => this.getStyle().headingScale,
      (value) => {
        const style = this.getStyle();
        style.headingScale = value;
        this.onStyleChange(style);
      }
    );
    panel.appendChild(headingSizeRow.el);
    this._refreshers.push(headingSizeRow.refresh);

    const bodySizeRow = buildSliderRow(
      "Body Size",
      FONT_SCALE_MIN,
      FONT_SCALE_MAX,
      0.05,
      () => this.getStyle().bodyScale,
      (value) => {
        const style = this.getStyle();
        style.bodyScale = value;
        this.onStyleChange(style);
      }
    );
    panel.appendChild(bodySizeRow.el);
    this._refreshers.push(bodySizeRow.refresh);

    const layoutHeader = document.createElement("div");
    layoutHeader.className = "section-header";
    layoutHeader.textContent = "Layout";
    panel.appendChild(layoutHeader);

    if (allowCustomLayout) {
      this._appendLayoutSelectRow(panel);
    } else {
      // Plain "Customize" tab (built-in presets): the simple 8-option
      // dropdown only, with no custom-layout entries — built-in presets can
      // never populate style.customLayout, since this is the only other
      // control that could ever offer that.
      const layoutRow = buildSelectRow(
        "Layout Style",
        LAYOUT_LABELS,
        () => this.getStyle().layoutVariant,
        (value) => {
          const style = this.getStyle();
          style.layoutVariant = value;
          this.onStyleChange(style);
        }
      );
      panel.appendChild(layoutRow.el);
      this._refreshers.push(layoutRow.refresh);
    }

    const cornerRow = buildSelectRow(
      "Card Corners",
      CORNER_LABELS,
      () => this.getStyle().cornerStyle,
      (value) => {
        const style = this.getStyle();
        style.cornerStyle = value;
        this.onStyleChange(style);
      }
    );
    panel.appendChild(cornerRow.el);
    this._refreshers.push(cornerRow.refresh);

    const bgModeRow = buildSelectRow(
      "Background",
      BG_MODE_LABELS,
      () => this.getStyle().backgroundMode,
      (value) => {
        const style = this.getStyle();
        style.backgroundMode = value;
        this.onStyleChange(style);
      }
    );
    panel.appendChild(bgModeRow.el);
    this._refreshers.push(bgModeRow.refresh);

    const bgAnimRow = buildSelectRow(
      "Background Motion",
      BACKGROUND_ANIM_LABELS,
      () => this.getStyle().backgroundAnim || "none",
      (value) => {
        const style = this.getStyle();
        style.backgroundAnim = value;
        this.onStyleChange(style);
      }
    );
    panel.appendChild(bgAnimRow.el);
    this._refreshers.push(bgAnimRow.refresh);

    const bgAnimHint = document.createElement("div");
    bgAnimHint.className = "field-hint";
    bgAnimHint.textContent =
      "Adds a subtle animated backdrop that shows in the live preview and every export, including the animated GIF.";
    panel.appendChild(bgAnimHint);

    const imagesHeader = document.createElement("div");
    imagesHeader.className = "section-header";
    imagesHeader.textContent = "Custom Images";
    panel.appendChild(imagesHeader);

    const imagesHint = document.createElement("div");
    imagesHint.className = "field-hint";
    imagesHint.textContent = "Upload images/GIFs in the Assets tab, then fine-tune each one here.";
    panel.appendChild(imagesHint);

    const imagesContainer = document.createElement("div");
    panel.appendChild(imagesContainer);

    const refreshImagesSection = () => {
      imagesContainer.innerHTML = "";
      const images = this.getStyle().customImages || [];
      if (images.length === 0) {
        const empty = document.createElement("div");
        empty.className = "field-hint";
        empty.textContent = "No custom images uploaded yet.";
        imagesContainer.appendChild(empty);
        return;
      }
      images.forEach((sticker) => {
        imagesContainer.appendChild(
          buildCustomImageEditor(sticker.id, this.getStyle, (s) => this.onStyleChange(s), refreshImagesSection)
        );
      });
    };
    refreshImagesSection();
    this._refreshers.push(refreshImagesSection);
  }

  _refreshAll() {
    this._refreshers.forEach((fn) => fn());
    const current = this.getStyle();
    if (this.gallery) this.gallery.setSelected(current.templateId);
    this._updateTemplateCustomizeVisibility();
  }

  // Public entry point used after a full reload (new/open project, autosave
  // restore) — unlike the internal _refreshAll used for routine in-panel
  // edits, this also rebuilds the gallery so any custom templates that were
  // only just restored from the persisted library actually appear as cards.
  refreshAll() {
    if (this.gallery) this.gallery.rebuild();
    this._refreshAll();
  }
}
