// Small generic form-control builders shared across style/asset panels.
// Kept in their own module (rather than living in stylePanel.js, which
// assetsTab.js is built and imported by) to avoid a circular import between
// the two.

export function buildSliderRow(labelText, min, max, step, getValue, setValue) {
  const wrap = document.createElement("div");
  wrap.style.marginBottom = "12px";
  const labelRow = document.createElement("div");
  labelRow.style.display = "flex";
  labelRow.style.justifyContent = "space-between";
  labelRow.style.alignItems = "baseline";
  const label = document.createElement("label");
  label.className = "field-label";
  label.textContent = labelText;
  const valueLabel = document.createElement("span");
  valueLabel.className = "field-hint";
  labelRow.append(label, valueLabel);
  wrap.appendChild(labelRow);

  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = String(min);
  slider.max = String(max);
  slider.step = String(step);
  slider.style.width = "100%";
  wrap.appendChild(slider);

  slider.addEventListener("input", () => {
    valueLabel.textContent = `${Math.round(Number(slider.value) * 100)}%`;
    setValue(Number(slider.value));
  });

  const refresh = () => {
    const v = getValue();
    slider.value = String(v);
    valueLabel.textContent = `${Math.round(v * 100)}%`;
  };
  refresh();
  return { el: wrap, refresh };
}
