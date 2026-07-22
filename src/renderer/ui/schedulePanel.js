import { DAY_NAMES } from "../../shared/constants.js";
import { createDayEntry, createStreamerProfile } from "../models/schedule.js";
import { t, dayLabelFull } from "../i18n/index.js";
import { setImagePreview } from "./assetsTab.js";

class DayRow {
  constructor(dayName, onChange) {
    this.dayName = dayName;
    this.onChange = onChange;
    this.el = document.createElement("div");
    this.el.className = "day-row";
    this._build();
  }

  _build() {
    const header = document.createElement("label");
    header.className = "checkbox-row";
    this.checkbox = document.createElement("input");
    this.checkbox.type = "checkbox";
    const nameSpan = document.createElement("span");
    nameSpan.className = "day-name";
    nameSpan.textContent = dayLabelFull(this.dayName);
    header.append(this.checkbox, nameSpan);
    this.el.appendChild(header);

    this.details = document.createElement("div");
    this.details.className = "day-details";

    const startWrap = document.createElement("div");
    const startLabel = document.createElement("label");
    startLabel.className = "field-label";
    startLabel.textContent = t("schedule.startLabel");
    this.startInput = document.createElement("input");
    this.startInput.type = "time";
    this.startInput.value = "18:00";
    startWrap.append(startLabel, this.startInput);
    this.details.appendChild(startWrap);

    this.modeSelect = document.createElement("select");
    [
      ["none", t("schedule.modeNone")],
      ["end", t("schedule.modeEnd")],
      ["duration", t("schedule.modeDuration")],
    ].forEach(([value, label]) => {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = label;
      this.modeSelect.appendChild(opt);
    });
    this.details.appendChild(this.modeSelect);

    this.endInput = document.createElement("input");
    this.endInput.type = "time";
    this.endInput.value = "21:00";
    this.details.appendChild(this.endInput);

    this.durationWrap = document.createElement("div");
    this.durationWrap.style.alignItems = "center";
    this.durationWrap.style.gap = "10px";
    this.durationInput = document.createElement("input");
    this.durationInput.type = "number";
    this.durationInput.min = "15";
    this.durationInput.max = "720";
    this.durationInput.step = "15";
    this.durationInput.value = "120";
    this.durationInput.style.flex = "1";
    this.durationInput.style.minWidth = "0";
    const durSuffix = document.createElement("span");
    durSuffix.className = "field-hint";
    durSuffix.textContent = t("schedule.minutesSuffix");
    durSuffix.style.marginBottom = "0";
    durSuffix.style.flexShrink = "0";
    this.durationWrap.append(this.durationInput, durSuffix);
    this.details.appendChild(this.durationWrap);

    this.labelInput = document.createElement("input");
    this.labelInput.type = "text";
    this.labelInput.placeholder = t("schedule.notePlaceholder");
    this.details.appendChild(this.labelInput);

    // Optional per-day image (e.g. game cover art), rendered inside this
    // day's card box by every layout — see rendering/renderer.js's
    // drawDayCardImage. The path itself lives in this._imagePath (not a DOM
    // input value); the <img> only ever shows a blob-URL preview of it.
    this._imagePath = null;
    const imageRow = document.createElement("div");
    imageRow.className = "day-image-row";
    this.imagePreview = document.createElement("img");
    this.imagePreview.className = "day-image-thumb";
    imageRow.appendChild(this.imagePreview);
    this.imageChooseBtn = document.createElement("button");
    this.imageChooseBtn.type = "button";
    this.imageChooseBtn.textContent = t("schedule.dayImageChoose");
    imageRow.appendChild(this.imageChooseBtn);
    this.imageRemoveBtn = document.createElement("button");
    this.imageRemoveBtn.type = "button";
    this.imageRemoveBtn.className = "danger";
    this.imageRemoveBtn.textContent = t("schedule.dayImageRemove");
    imageRow.appendChild(this.imageRemoveBtn);
    this.details.appendChild(imageRow);

    this.el.appendChild(this.details);
    this._updateModeVisibility();
    this._updateImageControls();

    this.checkbox.addEventListener("change", () => {
      this.el.classList.toggle("active", this.checkbox.checked);
      this.onChange();
    });
    this.modeSelect.addEventListener("change", () => {
      this._updateModeVisibility();
      this.onChange();
    });
    [this.startInput, this.endInput, this.durationInput, this.labelInput].forEach((input) => {
      input.addEventListener("input", () => this.onChange());
    });
    this.imageChooseBtn.addEventListener("click", async () => {
      const path = await window.streamplanAPI.chooseAssetPath("image");
      if (!path) return;
      this._imagePath = path;
      await setImagePreview(this.imagePreview, path);
      this._updateImageControls();
      this.onChange();
    });
    this.imageRemoveBtn.addEventListener("click", () => {
      this._imagePath = null;
      setImagePreview(this.imagePreview, null);
      this._updateImageControls();
      this.onChange();
    });
  }

  _updateModeVisibility() {
    const mode = this.modeSelect.value;
    this.endInput.style.display = mode === "end" ? "block" : "none";
    this.durationWrap.style.display = mode === "duration" ? "flex" : "none";
  }

  _updateImageControls() {
    this.imageRemoveBtn.disabled = !this._imagePath;
  }

  toEntry() {
    if (!this.checkbox.checked) return null;
    const mode = this.modeSelect.value;
    return createDayEntry({
      day: this.dayName,
      startTime: this.startInput.value || "18:00",
      endTime: mode === "end" ? this.endInput.value || "21:00" : null,
      durationMinutes: mode === "duration" ? Number(this.durationInput.value || 120) : null,
      label: this.labelInput.value.trim() || null,
      imagePath: this._imagePath,
    });
  }

  loadEntry(entry) {
    const active = !!entry;
    this.checkbox.checked = active;
    this.el.classList.toggle("active", active);
    if (entry) {
      this.startInput.value = entry.startTime;
      if (entry.endTime) {
        this.endInput.value = entry.endTime;
        this.modeSelect.value = "end";
      } else if (entry.durationMinutes) {
        this.durationInput.value = entry.durationMinutes;
        this.modeSelect.value = "duration";
      } else {
        this.modeSelect.value = "none";
      }
      this.labelInput.value = entry.label || "";
      this._imagePath = entry.imagePath || null;
    } else {
      this._imagePath = null;
    }
    setImagePreview(this.imagePreview, this._imagePath);
    this._updateImageControls();
    this._updateModeVisibility();
  }
}

export class SchedulePanel {
  constructor(container, onChange) {
    this.container = container;
    this.onChange = onChange;
    this.rows = new Map();
    this._build();
  }

  _build() {
    const header = document.createElement("div");
    header.className = "section-header";
    header.textContent = t("schedule.streamerNameHeader");
    this.container.appendChild(header);

    this.nameInput = document.createElement("input");
    this.nameInput.type = "text";
    this.nameInput.placeholder = t("schedule.namePlaceholder");
    this.nameInput.addEventListener("input", () => this.onChange());
    this.container.appendChild(this.nameInput);

    const daysHeader = document.createElement("div");
    daysHeader.className = "section-header";
    daysHeader.textContent = t("schedule.streamDaysHeader");
    this.container.appendChild(daysHeader);

    const hint = document.createElement("div");
    hint.className = "field-hint";
    hint.textContent = t("schedule.daysHint");
    this.container.appendChild(hint);

    DAY_NAMES.forEach((day) => {
      const row = new DayRow(day, () => this.onChange());
      this.rows.set(day, row);
      this.container.appendChild(row.el);
    });
  }

  toProfile() {
    const days = [];
    for (const row of this.rows.values()) {
      const entry = row.toEntry();
      if (entry) days.push(entry);
    }
    return createStreamerProfile({ displayName: this.nameInput.value.trim(), days });
  }

  loadProfile(profile) {
    this.nameInput.value = profile.displayName || "";
    const byDay = new Map(profile.days.map((d) => [d.day, d]));
    for (const [day, row] of this.rows.entries()) {
      row.loadEntry(byDay.get(day) || null);
    }
  }
}
