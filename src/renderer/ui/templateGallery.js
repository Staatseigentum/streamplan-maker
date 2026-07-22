import { TEMPLATE_ORDER, TEMPLATE_LABELS, TEMPLATE_DESCRIPTIONS, getTemplate, customBaseStyle } from "../models/templates.js";
import { listCustomTemplates } from "../models/customTemplateLibrary.js";
import { renderStreamplan } from "../rendering/renderer.js";
import { createStreamerProfile, createDayEntry } from "../models/schedule.js";
import { t } from "../i18n/index.js";

const SAMPLE_PROFILE = createStreamerProfile({
  displayName: "YourName",
  days: [
    createDayEntry({ day: "Monday", startTime: "18:00", endTime: "21:00" }),
    createDayEntry({ day: "Wednesday", startTime: "19:00", durationMinutes: 150 }),
    createDayEntry({ day: "Saturday", startTime: "16:00", endTime: "19:00" }),
  ],
});

export class TemplateGallery {
  constructor(container, onSelect, { onRemoveCustom } = {}) {
    this.container = container;
    this.onSelect = onSelect;
    this.onRemoveCustom = onRemoveCustom || (() => {});
    this.selectedId = null;
    this.cards = new Map();
    this._build();
  }

  _makeCard(id, style, name, desc, removable) {
    const card = document.createElement("div");
    card.className = "template-card";

    const img = document.createElement("img");
    const offscreen = document.createElement("canvas");
    renderStreamplan(offscreen, SAMPLE_PROFILE, style, 0.3, [1400, 1750]);
    img.src = offscreen.toDataURL("image/png");

    const textWrap = document.createElement("div");
    const nameEl = document.createElement("div");
    nameEl.className = "template-name";
    nameEl.textContent = name;
    const descEl = document.createElement("div");
    descEl.className = "template-desc";
    descEl.textContent = desc;
    textWrap.append(nameEl, descEl);

    card.append(img, textWrap);
    card.addEventListener("click", () => this.select(id));

    if (removable) {
      const removeBtn = document.createElement("button");
      removeBtn.className = "template-card-remove";
      removeBtn.textContent = "✕";
      removeBtn.title = t("templateGallery.removeTooltip");
      removeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.onRemoveCustom(id);
      });
      card.appendChild(removeBtn);
    }

    this.container.appendChild(card);
    this.cards.set(id, card);
  }

  _build() {
    this.container.innerHTML = "";
    this.cards.clear();

    TEMPLATE_ORDER.forEach((id) => {
      this._makeCard(id, getTemplate(id), TEMPLATE_LABELS[id], t(`templates.desc.${id}`), false);
    });

    this._makeCard(
      "custom",
      customBaseStyle(),
      t("templateGallery.customName"),
      t("templateGallery.customDesc"),
      false
    );

    listCustomTemplates().forEach((tpl) => {
      this._makeCard(tpl.id, tpl.style, tpl.name, t("templateGallery.savedCustomDesc"), true);
    });

    this.setSelected(this.selectedId);
  }

  rebuild() {
    this._build();
  }

  select(id) {
    this.setSelected(id);
    this.onSelect(id);
  }

  setSelected(id) {
    this.selectedId = id;
    for (const [cid, card] of this.cards.entries()) {
      card.classList.toggle("selected", cid === id);
    }
  }
}
