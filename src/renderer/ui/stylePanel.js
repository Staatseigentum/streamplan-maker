import { COLOR_KEYS, FONT_SCALE_MIN, FONT_SCALE_MAX, cloneStyle, styleFromDict } from "../models/style.js";
import { TEMPLATE_ORDER, getTemplate, customBaseStyle } from "../models/templates.js";
import { addCustomTemplate, removeCustomTemplate, getCustomTemplate, isCustomTemplateId } from "../models/customTemplateLibrary.js";
import { TemplateGallery } from "./templateGallery.js";
import { buildAssetsTab } from "./assetsTab.js";
import { listCustomFonts } from "../rendering/fontLibrary.js";
import { buildSliderRow } from "./formControls.js";
import { t } from "../i18n/index.js";

// Computed lazily (not module-level consts) since these must reflect the
// language active when the panel is actually built, not whichever language
// was active when this module was first imported (import evaluation runs
// before app.js's own top-level await settles the language — see i18n/index.js).
export function colorLabels() {
  return {
    background: t("style.colorBackground"),
    backgroundEnd: t("style.colorBackgroundEnd"),
    panel: t("style.colorPanel"),
    accent: t("style.colorAccent"),
    accentSecondary: t("style.colorAccent2"),
    textPrimary: t("style.colorText"),
    textSecondary: t("style.colorTextMuted"),
    glow: t("style.colorGlow"),
  };
}

const SYSTEM_FONTS = ["Georgia", "Segoe UI", "Bahnschrift", "Impact", "Consolas", "Trebuchet MS", "Verdana", "Arial"];
function layoutLabels() {
  return {
    list: t("style.layoutListRows"),
    grid7: t("style.layoutGridNodes"),
    verticalTimeline: t("style.layoutVerticalTimeline"),
    calendarGrid: t("style.layoutCalendarColumns"),
    compactBadges: t("style.layoutCompactBadges"),
    splitColumns: t("style.layoutWeekdaySplit"),
    radialClock: t("style.layoutRadialClock"),
    ticketStrip: t("style.layoutTicketStubs"),
    cascadeFlow: t("style.layoutCascadeFlow"),
    orbitRing: t("style.layoutOrbitRing"),
    novaRadiate: t("style.layoutNovaRadiate"),
    meteorRow: t("style.layoutMeteorRow"),
  };
}
export function cornerLabels() {
  return { sharp: t("style.cornerSharp"), rounded: t("style.cornerRounded") };
}
export function bgModeLabels() {
  return { solid: t("style.bgSolid"), gradient: t("style.bgGradient"), image: t("style.bgImage") };
}
export function backgroundAnimLabels() {
  return {
    none: t("style.animNone"),
    nebulaDrift: t("style.animNebulaDrift"),
    aurora: t("style.animAurora"),
    starfield: t("style.animStarfield"),
    novaPulse: t("style.animNovaPulse"),
    meteorShower: t("style.animMeteorShower"),
  };
}

export function buildSelectRow(labelText, options, getValue, setValue) {
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

export function buildFontSelectRow(labelText, getFont, setFont) {
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
      opt.textContent = t("style.customFontPrefix", { name: entry.displayName });
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
      opt.textContent = t("style.customFontPrefix", { name: font.path.split(/[\\/]/).pop() });
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


export function buildCustomImageEditor(stickerId, getStyle, onStyleChange, onRemoved) {
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
    [t("common.horizontalPosition"), 0, 1, 0.01, "x", 0.5],
    [t("common.verticalPosition"), 0, 1, 0.01, "y", 0.5],
    [t("style.sizeLabel"), 0.05, 0.9, 0.01, "scale", 0.25],
    [t("common.opacity"), 0.05, 1, 0.01, "opacity", 1],
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
  removeBtn.textContent = t("common.removeImage");
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

export function buildColorRow(key, getStyle, onStyleChange) {
  const row = document.createElement("div");
  row.className = "swatch-row";
  const label = document.createElement("span");
  label.className = "swatch-label";
  label.textContent = colorLabels()[key] || key;
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
  constructor(container, { getStyle, onStyleApplied, onStyleChange, openTemplateStudio }) {
    this.container = container;
    this.getStyle = getStyle;
    this.onStyleApplied = onStyleApplied; // called when a whole new style object should replace the current one
    this.onStyleChange = onStyleChange; // called after an in-place mutation
    this.openTemplateStudio = openTemplateStudio || (() => {}); // opens the Template Studio overlay pre-loaded with { style }
    this._refreshers = [];
    this._build();
  }

  _build() {
    const tabs = document.createElement("div");
    tabs.className = "tabs";
    const panelsWrap = document.createElement("div");

    const tabDefs = [
      ["templates", t("style.tabTemplates")],
      ["customize", t("style.tabCustomize")],
      ["templateCustomize", t("style.tabTemplateCustomize")],
      ["assets", t("style.tabAssets")],
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
    hint.textContent = t("style.templatesHint");
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

  // Deliberately slim: a Custom Template's entire design (colors, fonts,
  // background, elements) is edited in the full-screen Template Studio —
  // see openTemplateStudio, injected from app.js — which owns its own
  // Save/Export/Delete-from-library actions. This tab is just the entry
  // point into that, plus a quick Import that doesn't require opening it
  // first (mirrors the topBar's standalone "Import Layout" button existing
  // outside the Layout Editor too).
  _buildTemplateCustomizeTab(panel) {
    const hint = document.createElement("div");
    hint.className = "field-hint";
    hint.textContent = t("templateStudio.sidebarHint");
    panel.appendChild(hint);

    const openBtn = document.createElement("button");
    openBtn.className = "primary";
    openBtn.style.marginBottom = "12px";
    openBtn.style.width = "100%";
    openBtn.textContent = t("templateStudio.openBtn");
    openBtn.addEventListener("click", () => this.openTemplateStudio({ style: this.getStyle() }));
    panel.appendChild(openBtn);

    const actions = document.createElement("div");
    actions.className = "asset-actions";
    actions.style.flexWrap = "wrap";
    actions.style.marginBottom = "12px";

    const importBtn = document.createElement("button");
    importBtn.textContent = t("common.importEllipsis");
    importBtn.addEventListener("click", async () => {
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
        this.openTemplateStudio({ style: cloneStyle(entry.style) });
      } catch (err) {
        console.error(err);
        await window.streamplanAPI.showMessage("error", t("common.importFailedTitle"), t("style.importTemplateFailed", { message: err.message }));
      }
    });
    actions.appendChild(importBtn);

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "danger";
    deleteBtn.textContent = t("common.deleteFromLibrary");
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
  }

  _appendStyleControls(panel) {
    const colorsHeader = document.createElement("div");
    colorsHeader.className = "section-header";
    colorsHeader.textContent = t("style.colorsHeader");
    panel.appendChild(colorsHeader);

    COLOR_KEYS.forEach((key) => {
      const row = buildColorRow(key, this.getStyle, (style) => this.onStyleChange(style));
      panel.appendChild(row.el);
      this._refreshers.push(row.refresh);
    });

    const fontsHeader = document.createElement("div");
    fontsHeader.className = "section-header";
    fontsHeader.textContent = t("style.fontsHeader");
    panel.appendChild(fontsHeader);

    const headingRow = buildFontSelectRow(
      t("style.headingFontLabel"),
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
      t("style.bodyFontLabel"),
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
    sizeHeader.textContent = t("style.textSizeHeader");
    panel.appendChild(sizeHeader);

    const headingSizeRow = buildSliderRow(
      t("style.headingSizeLabel"),
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
      t("style.bodySizeLabel"),
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
    layoutHeader.textContent = t("style.layoutHeader");
    panel.appendChild(layoutHeader);

    // Built-in presets pick one of the fixed layout variants here; a Custom
    // Template's arrangement is instead edited live in the Template Studio
    // (see _buildTemplateCustomizeTab), which is the only place
    // style.customLayout can ever be set — built-in presets are
    // structurally incapable of using a custom layout.
    const layoutRow = buildSelectRow(
      t("style.layoutStyleLabel"),
      layoutLabels(),
      () => this.getStyle().layoutVariant,
      (value) => {
        const style = this.getStyle();
        style.layoutVariant = value;
        this.onStyleChange(style);
      }
    );
    panel.appendChild(layoutRow.el);
    this._refreshers.push(layoutRow.refresh);

    const cornerRow = buildSelectRow(
      t("style.cardCornersLabel"),
      cornerLabels(),
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
      t("style.backgroundLabel"),
      bgModeLabels(),
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
      t("style.backgroundMotionLabel"),
      backgroundAnimLabels(),
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
    bgAnimHint.textContent = t("style.bgAnimHint");
    panel.appendChild(bgAnimHint);

    const imagesHeader = document.createElement("div");
    imagesHeader.className = "section-header";
    imagesHeader.textContent = t("common.customImagesHeader");
    panel.appendChild(imagesHeader);

    const imagesHint = document.createElement("div");
    imagesHint.className = "field-hint";
    imagesHint.textContent = t("style.customImagesHint");
    panel.appendChild(imagesHint);

    const imagesContainer = document.createElement("div");
    panel.appendChild(imagesContainer);

    const refreshImagesSection = () => {
      imagesContainer.innerHTML = "";
      const images = this.getStyle().customImages || [];
      if (images.length === 0) {
        const empty = document.createElement("div");
        empty.className = "field-hint";
        empty.textContent = t("style.noCustomImages");
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
