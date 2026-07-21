import { addCustomFontToLibrary } from "../rendering/fontLibrary.js";
import { drawImageCoverAdjustable, drawCircularImage, hexToRgba } from "../rendering/layout.js";
import { buildSliderRow } from "./formControls.js";
import { CANVAS_WIDTH, CANVAS_HEIGHT } from "../../shared/constants.js";

function mimeFor(path) {
  const ext = path.split(".").pop().toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "application/octet-stream";
}

async function setImagePreview(imgEl, path) {
  if (!path) {
    imgEl.classList.remove("visible");
    imgEl.removeAttribute("src");
    return;
  }
  const bytes = await window.streamplanAPI.readFile(path);
  const blob = new Blob([bytes], { type: mimeFor(path) });
  imgEl.src = URL.createObjectURL(blob);
  imgEl.classList.add("visible");
}

// previewShape: "rect" (background, 4:5) or "circle" (logo). adjustable, if
// given, adds Position/Zoom sliders and drives both the live in-card preview
// AND the real renderer (rendering/layout.js's drawImageCoverAdjustable /
// drawCircularImage are called directly here too, so this preview is pixel-
// accurate to what actually ends up in the exported plan, not an approximation):
// { getOffsetX, setOffsetX, getOffsetY, setOffsetY, getScale, setScale, getTintColor? }
function buildImageAssetCard({ title, hint, recommendedSize, previewShape, getPath, onChoose, onRemove, adjustable }) {
  const card = document.createElement("div");
  card.className = "asset-card";

  const titleEl = document.createElement("div");
  titleEl.className = "asset-title";
  titleEl.textContent = title;
  card.appendChild(titleEl);

  const hintEl = document.createElement("div");
  hintEl.className = "field-hint";
  hintEl.textContent = hint;
  card.appendChild(hintEl);

  const recEl = document.createElement("div");
  recEl.className = "asset-recommended-size";
  recEl.textContent = recommendedSize;
  card.appendChild(recEl);

  const previewWrap = document.createElement("div");
  previewWrap.className = `asset-preview-canvas-wrap ${previewShape}`;
  previewWrap.style.display = "none";
  const previewCanvas = document.createElement("canvas");
  previewCanvas.className = "asset-preview-canvas";
  previewCanvas.width = previewShape === "circle" ? 280 : Math.round((280 * CANVAS_WIDTH) / CANVAS_HEIGHT);
  previewCanvas.height = previewShape === "circle" ? 280 : 280;
  previewWrap.appendChild(previewCanvas);
  card.appendChild(previewWrap);

  const filename = document.createElement("div");
  filename.className = "asset-filename";
  card.appendChild(filename);

  let loadedImg = null;

  function drawPreview() {
    const ctx = previewCanvas.getContext("2d");
    const w = previewCanvas.width;
    const h = previewCanvas.height;
    ctx.clearRect(0, 0, w, h);
    if (!loadedImg) return;
    const offsetX = adjustable ? adjustable.getOffsetX() : 0.5;
    const offsetY = adjustable ? adjustable.getOffsetY() : 0.5;
    const scale = adjustable ? adjustable.getScale() : 1;
    if (previewShape === "circle") {
      drawCircularImage(ctx, loadedImg, w / 2, h / 2, Math.min(w, h) / 2, offsetX, offsetY, scale);
    } else {
      drawImageCoverAdjustable(ctx, loadedImg, 0, 0, w, h, offsetX, offsetY, scale);
      if (adjustable?.getTintColor) {
        ctx.fillStyle = hexToRgba(adjustable.getTintColor(), 0.55);
        ctx.fillRect(0, 0, w, h);
      }
    }
  }

  const slidersWrap = document.createElement("div");
  slidersWrap.style.display = "none";
  let sliderRefreshers = [];
  if (adjustable) {
    const offXRow = buildSliderRow("Horizontal Position", 0, 1, 0.01, adjustable.getOffsetX, (v) => {
      adjustable.setOffsetX(v);
      drawPreview();
    });
    const offYRow = buildSliderRow("Vertical Position", 0, 1, 0.01, adjustable.getOffsetY, (v) => {
      adjustable.setOffsetY(v);
      drawPreview();
    });
    const scaleRow = buildSliderRow("Zoom", 1, 3, 0.01, adjustable.getScale, (v) => {
      adjustable.setScale(v);
      drawPreview();
    });
    slidersWrap.append(offXRow.el, offYRow.el, scaleRow.el);
    sliderRefreshers = [offXRow.refresh, offYRow.refresh, scaleRow.refresh];
  }
  card.appendChild(slidersWrap);

  const actions = document.createElement("div");
  actions.className = "asset-actions";
  const chooseBtn = document.createElement("button");
  chooseBtn.textContent = "Upload…";
  const removeBtn = document.createElement("button");
  removeBtn.textContent = "Remove";
  removeBtn.className = "danger";
  actions.append(chooseBtn, removeBtn);
  card.appendChild(actions);

  async function loadPreviewImage(path) {
    if (!path) {
      loadedImg = null;
      return;
    }
    try {
      const bytes = await window.streamplanAPI.readFile(path);
      const blob = new Blob([bytes], { type: mimeFor(path) });
      const url = URL.createObjectURL(blob);
      loadedImg = await new Promise((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = reject;
        el.src = url;
      });
    } catch {
      loadedImg = null;
    }
  }

  async function refresh() {
    const path = getPath();
    filename.textContent = path ? path.split(/[\\/]/).pop() : "No file selected.";
    removeBtn.disabled = !path;
    previewWrap.style.display = path ? "" : "none";
    slidersWrap.style.display = path && adjustable ? "" : "none";
    await loadPreviewImage(path);
    drawPreview();
    sliderRefreshers.forEach((r) => r());
  }

  chooseBtn.addEventListener("click", async () => {
    const path = await window.streamplanAPI.chooseAssetPath("image");
    if (path) {
      await onChoose(path);
      await refresh();
    }
  });
  removeBtn.addEventListener("click", () => {
    onRemove();
    refresh();
  });

  refresh();
  return { el: card, refresh };
}

function buildFontAssetCard({ title, hint, getFont, onChoose, onRemove }) {
  const card = document.createElement("div");
  card.className = "asset-card";

  const titleEl = document.createElement("div");
  titleEl.className = "asset-title";
  titleEl.textContent = title;
  card.appendChild(titleEl);

  const hintEl = document.createElement("div");
  hintEl.className = "field-hint";
  hintEl.textContent = hint;
  card.appendChild(hintEl);

  const filename = document.createElement("div");
  filename.className = "asset-filename";
  card.appendChild(filename);

  const actions = document.createElement("div");
  actions.className = "asset-actions";
  const chooseBtn = document.createElement("button");
  chooseBtn.textContent = "Upload Font…";
  const removeBtn = document.createElement("button");
  removeBtn.textContent = "Reset";
  removeBtn.className = "danger";
  actions.append(chooseBtn, removeBtn);
  card.appendChild(actions);

  function refresh() {
    const font = getFont();
    filename.textContent = font.path ? font.path.split(/[\\/]/).pop() : `Using ${font.family} (system font)`;
    removeBtn.disabled = !font.path;
  }

  chooseBtn.addEventListener("click", async () => {
    const path = await window.streamplanAPI.chooseAssetPath("font");
    if (!path) return;
    chooseBtn.disabled = true;
    chooseBtn.textContent = "Loading…";
    try {
      const entry = await addCustomFontToLibrary(path);
      onChoose({ family: entry.family, path: entry.path });
      refresh();
    } finally {
      chooseBtn.disabled = false;
      chooseBtn.textContent = "Upload Font…";
    }
  });
  removeBtn.addEventListener("click", () => {
    onRemove();
    refresh();
  });

  refresh();
  return { el: card, refresh };
}

function buildStickerCard(sticker, { getStyle, onStyleChange, refresh }) {
  const card = document.createElement("div");
  card.className = "asset-card";

  const preview = document.createElement("img");
  preview.className = "asset-preview visible";
  card.appendChild(preview);
  setImagePreview(preview, sticker.path);

  const filename = document.createElement("div");
  filename.className = "asset-filename";
  filename.textContent = sticker.path.split(/[\\/]/).pop();
  card.appendChild(filename);

  const actions = document.createElement("div");
  actions.className = "asset-actions";
  const removeBtn = document.createElement("button");
  removeBtn.textContent = "Remove";
  removeBtn.className = "danger";
  removeBtn.addEventListener("click", () => {
    const style = getStyle();
    style.customImages = (style.customImages || []).filter((img) => img.id !== sticker.id);
    onStyleChange(style);
    refresh();
  });
  actions.appendChild(removeBtn);
  card.appendChild(actions);

  return card;
}

function buildCustomImagesSection(container, { getStyle, onStyleChange }) {
  const header = document.createElement("div");
  header.className = "section-header";
  header.textContent = "Custom Images";
  container.appendChild(header);

  const hint = document.createElement("div");
  hint.className = "field-hint";
  hint.textContent =
    "PNG, JPG or GIF decorations placed on top of your plan. Once uploaded, adjust position, size & opacity per image under Customize.";
  container.appendChild(hint);

  const uploadBtn = document.createElement("button");
  uploadBtn.textContent = "Upload Image / GIF…";
  uploadBtn.style.marginBottom = "12px";
  container.appendChild(uploadBtn);

  const listEl = document.createElement("div");
  container.appendChild(listEl);

  function refresh() {
    listEl.innerHTML = "";
    const style = getStyle();
    (style.customImages || []).forEach((sticker) => {
      listEl.appendChild(buildStickerCard(sticker, { getStyle, onStyleChange, refresh }));
    });
  }

  uploadBtn.addEventListener("click", async () => {
    const path = await window.streamplanAPI.chooseAssetPath("sticker");
    if (!path) return;
    const style = getStyle();
    style.customImages = [
      ...(style.customImages || []),
      {
        id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        path,
        x: 0.5,
        y: 0.5,
        scale: 0.25,
        opacity: 1,
      },
    ];
    onStyleChange(style);
    refresh();
  });

  refresh();
  return refresh;
}

export function buildAssetsTab(container, { getStyle, onStyleChange }) {
  const refreshers = [];

  const bgHeader = document.createElement("div");
  bgHeader.className = "section-header";
  bgHeader.textContent = "Background & Logo";
  container.appendChild(bgHeader);

  const bgCard = buildImageAssetCard({
    title: "Background Image",
    hint: "Uploading a background switches the background mode to Image.",
    recommendedSize: `Recommended: at least ${CANVAS_WIDTH}×${CANVAS_HEIGHT}px, portrait (4:5) for a crisp background — smaller images get upscaled.`,
    previewShape: "rect",
    getPath: () => getStyle().backgroundImagePath,
    onChoose: async (path) => {
      const style = getStyle();
      style.backgroundImagePath = path;
      style.backgroundMode = "image";
      onStyleChange(style);
    },
    onRemove: () => {
      const style = getStyle();
      style.backgroundImagePath = null;
      style.backgroundMode = "solid";
      onStyleChange(style);
    },
    adjustable: {
      getOffsetX: () => getStyle().backgroundImageOffsetX ?? 0.5,
      setOffsetX: (v) => {
        const style = getStyle();
        style.backgroundImageOffsetX = v;
        onStyleChange(style);
      },
      getOffsetY: () => getStyle().backgroundImageOffsetY ?? 0.5,
      setOffsetY: (v) => {
        const style = getStyle();
        style.backgroundImageOffsetY = v;
        onStyleChange(style);
      },
      getScale: () => getStyle().backgroundImageScale ?? 1,
      setScale: (v) => {
        const style = getStyle();
        style.backgroundImageScale = v;
        onStyleChange(style);
      },
      getTintColor: () => getStyle().colors.background || "#000000",
    },
  });
  container.appendChild(bgCard.el);
  refreshers.push(bgCard.refresh);

  const logoCard = buildImageAssetCard({
    title: "Logo / Profile Picture",
    hint: "Shown next to your name at the top of the plan.",
    recommendedSize: "Recommended: a square image at least 400×400px — it's cropped to a circle.",
    previewShape: "circle",
    getPath: () => getStyle().logoPath,
    onChoose: async (path) => {
      const style = getStyle();
      style.logoPath = path;
      onStyleChange(style);
    },
    onRemove: () => {
      const style = getStyle();
      style.logoPath = null;
      onStyleChange(style);
    },
    adjustable: {
      getOffsetX: () => getStyle().logoOffsetX ?? 0.5,
      setOffsetX: (v) => {
        const style = getStyle();
        style.logoOffsetX = v;
        onStyleChange(style);
      },
      getOffsetY: () => getStyle().logoOffsetY ?? 0.5,
      setOffsetY: (v) => {
        const style = getStyle();
        style.logoOffsetY = v;
        onStyleChange(style);
      },
      getScale: () => getStyle().logoScale ?? 1,
      setScale: (v) => {
        const style = getStyle();
        style.logoScale = v;
        onStyleChange(style);
      },
    },
  });
  container.appendChild(logoCard.el);
  refreshers.push(logoCard.refresh);

  const fontHeader = document.createElement("div");
  fontHeader.className = "section-header";
  fontHeader.textContent = "Custom Fonts";
  container.appendChild(fontHeader);

  const headingCard = buildFontAssetCard({
    title: "Heading Font",
    hint: "Used for your name and day labels. .ttf / .otf",
    getFont: () => getStyle().fontHeading,
    onChoose: (font) => {
      const style = getStyle();
      style.fontHeading = font;
      onStyleChange(style);
    },
    onRemove: () => {
      const style = getStyle();
      style.fontHeading = { family: "Georgia", path: null };
      onStyleChange(style);
    },
  });
  container.appendChild(headingCard.el);
  refreshers.push(headingCard.refresh);

  const bodyCard = buildFontAssetCard({
    title: "Body Font",
    hint: "Used for times and notes. .ttf / .otf",
    getFont: () => getStyle().fontBody,
    onChoose: (font) => {
      const style = getStyle();
      style.fontBody = font;
      onStyleChange(style);
    },
    onRemove: () => {
      const style = getStyle();
      style.fontBody = { family: "Segoe UI", path: null };
      onStyleChange(style);
    },
  });
  container.appendChild(bodyCard.el);
  refreshers.push(bodyCard.refresh);

  const stickerRefresh = buildCustomImagesSection(container, { getStyle, onStyleChange });
  refreshers.push(stickerRefresh);

  return refreshers;
}
