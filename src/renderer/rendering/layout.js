// Pure(ish) geometry + background/asset drawing helpers shared by all layout
// variants. Used identically by the live preview canvas and every export
// path (they all call the same renderStreamplan() in renderer.js).

export function hexToRgba(hex, alpha = 1) {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function cornerRadius(cornerStyle, base) {
  return cornerStyle === "sharp" ? 0 : base;
}

export function roundedRectPath(ctx, x, y, w, h, radius) {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  ctx.beginPath();
  if (r <= 0) {
    ctx.rect(x, y, w, h);
  } else {
    ctx.roundRect(x, y, w, h, r);
  }
}

export function drawImageCover(ctx, img, x, y, w, h) {
  drawImageCoverAdjustable(ctx, img, x, y, w, h);
}

// Same cover-fit crop as drawImageCover, but lets the user pan (offsetX/Y,
// 0-1 fraction of the source image) and zoom in further (extraScale >= 1,
// on top of the minimum scale needed to fully cover the target box) instead
// of always being centered — used for backgrounds/logos so the part of the
// photo that actually matters doesn't get silently cropped away. The pan
// offset is clamped so the crop window never goes outside the source image.
export function drawImageCoverAdjustable(ctx, img, x, y, w, h, offsetX = 0.5, offsetY = 0.5, extraScale = 1) {
  const baseScale = Math.max(w / img.width, h / img.height);
  const scale = baseScale * Math.max(1, extraScale);
  const sw = Math.min(img.width, w / scale);
  const sh = Math.min(img.height, h / scale);
  const maxSx = Math.max(0, img.width - sw);
  const maxSy = Math.max(0, img.height - sh);
  const sx = Math.min(maxSx, Math.max(0, offsetX * img.width - sw / 2));
  const sy = Math.min(maxSy, Math.max(0, offsetY * img.height - sh / 2));
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

export function drawCircularImage(ctx, img, cx, cy, radius, offsetX = 0.5, offsetY = 0.5, extraScale = 1) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();
  drawImageCoverAdjustable(ctx, img, cx - radius, cy - radius, radius * 2, radius * 2, offsetX, offsetY, extraScale);
  ctx.restore();
}

// CSS-gradient-angle convention (0deg points up, clockwise) applied to a
// w×h rectangle: converts an angle into the linear-gradient line's
// endpoints, sized so the gradient always fully covers the box regardless
// of aspect ratio. angle=180 (this module's/style.js's default) points
// straight down, matching the old hardcoded createLinearGradient(0,0,0,h).
function gradientLineForAngle(w, h, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  const dx = Math.sin(rad);
  const dy = -Math.cos(rad);
  const cx = w / 2;
  const cy = h / 2;
  const len = (Math.abs(w * dx) + Math.abs(h * dy)) / 2;
  return { x0: cx - dx * len, y0: cy - dy * len, x1: cx + dx * len, y1: cy + dy * len };
}

// Deterministic PRNG (not Math.random()) so the "grain" texture's dot
// positions stay fixed across repeated renders of the same frame — the live
// preview re-renders constantly, and true randomness would make grain
// flicker/shimmer instead of reading as a static texture.
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Procedural, asset-free overlay drawn on top of the background fill — no
// texture images to upload/bundle, just a handful of generated patterns.
// A no-op when texture is "none"/falsy, so every template saved before this
// feature existed renders byte-identical.
export function drawBackgroundTexture(ctx, size, texture, opacity) {
  if (!texture || texture === "none") return;
  const [w, h] = size;
  ctx.save();
  if (texture === "grain") {
    const rand = mulberry32(1337);
    const count = Math.round((w * h) / 1400);
    for (let i = 0; i < count; i++) {
      const x = rand() * w;
      const y = rand() * h;
      const r = 0.6 + rand() * 1.1;
      ctx.fillStyle = `rgba(255, 255, 255, ${(0.3 + rand() * 0.7) * opacity})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (texture === "dots") {
    const spacing = Math.max(18, Math.round(w * 0.018));
    ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
    for (let y = spacing / 2; y < h; y += spacing) {
      for (let x = spacing / 2; x < w; x += spacing) {
        ctx.beginPath();
        ctx.arc(x, y, Math.max(1, spacing * 0.06), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (texture === "diagonal") {
    const spacing = Math.max(14, Math.round(w * 0.016));
    ctx.strokeStyle = `rgba(255, 255, 255, ${opacity})`;
    ctx.lineWidth = Math.max(1, spacing * 0.08);
    const diag = w + h;
    for (let d = -h; d < diag; d += spacing) {
      ctx.beginPath();
      ctx.moveTo(d, 0);
      ctx.lineTo(d + h, h);
      ctx.stroke();
    }
  } else if (texture === "grid") {
    const spacing = Math.max(20, Math.round(w * 0.03));
    ctx.strokeStyle = `rgba(255, 255, 255, ${opacity})`;
    ctx.lineWidth = Math.max(1, spacing * 0.02);
    for (let x = 0; x <= w; x += spacing) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y <= h; y += spacing) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
  }
  ctx.restore();
}

export function buildBackground(ctx, size, style, images) {
  const [w, h] = size;
  let mode = style.backgroundMode;
  const texture = style.backgroundTexture;
  const textureOpacity = style.backgroundTextureOpacity ?? 0.15;

  if (mode === "image" && style.backgroundImagePath && images.background) {
    drawImageCoverAdjustable(
      ctx,
      images.background,
      0,
      0,
      w,
      h,
      style.backgroundImageOffsetX ?? 0.5,
      style.backgroundImageOffsetY ?? 0.5,
      style.backgroundImageScale ?? 1
    );
    ctx.fillStyle = hexToRgba(style.colors.background || "#000000", 0.55);
    ctx.fillRect(0, 0, w, h);
    drawBackgroundTexture(ctx, size, texture, textureOpacity);
    return;
  }
  if (mode === "image") {
    mode = style.colors.backgroundEnd || style.backgroundGradientStops ? "gradient" : "solid";
  }

  if (mode === "gradient") {
    let grad;
    // backgroundGradientStops (Template Studio's gradient editor) fully
    // replaces the legacy 2-stop background/backgroundEnd pair once set;
    // null (every template saved before this feature existed) keeps the
    // exact old hardcoded top-to-bottom 2-stop gradient.
    if (style.backgroundGradientStops && style.backgroundGradientStops.length >= 2) {
      const { x0, y0, x1, y1 } = gradientLineForAngle(w, h, style.backgroundGradientAngle ?? 180);
      grad = ctx.createLinearGradient(x0, y0, x1, y1);
      style.backgroundGradientStops.forEach((stop) => grad.addColorStop(stop.offset, stop.color));
    } else {
      grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, style.colors.background || "#0A0A0F");
      grad.addColorStop(1, style.colors.backgroundEnd || style.colors.background || "#0A0A0F");
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    drawBackgroundTexture(ctx, size, texture, textureOpacity);
    return;
  }

  ctx.fillStyle = style.colors.background || "#0A0A0F";
  ctx.fillRect(0, 0, w, h);
  drawBackgroundTexture(ctx, size, texture, textureOpacity);
}

// Draws a user-uploaded decoration (sticker) at a fraction-of-canvas position
// and width, preserving the source's natural aspect ratio, so its placement
// stays consistent across preview and every export resolution. `source` can
// be an <img> (static PNG/JPG) or a decoded GIF VideoFrame — both are valid
// CanvasImageSource values, hence naturalW/naturalH are passed explicitly
// rather than read off `source.width`/`source.height` (VideoFrame instead
// exposes displayWidth/displayHeight).
export function drawStickerImage(ctx, source, naturalW, naturalH, sticker, size) {
  const [w, h] = size;
  const drawW = (sticker.scale ?? 0.25) * w;
  const drawH = drawW * (naturalH / naturalW);
  const cx = (sticker.x ?? 0.5) * w;
  const cy = (sticker.y ?? 0.5) * h;
  ctx.save();
  ctx.globalAlpha = sticker.opacity ?? 1;
  ctx.drawImage(source, cx - drawW / 2, cy - drawH / 2, drawW, drawH);
  ctx.restore();
}

export function computeHeaderRect([w]) {
  const margin = Math.round(w * 0.08);
  return [margin, 90, w - margin, 340];
}

export function computeContentArea([w, h], headerRect) {
  const margin = Math.round(w * 0.08);
  return [margin, headerRect[3] + 40, w - margin, h - 80];
}

export function listRows(contentArea, count, leftInset = 0) {
  if (count <= 0) return [];
  let [x0, y0, x1, y1] = contentArea;
  x0 += leftInset;
  const gap = 22;
  const rowH = Math.max((y1 - y0 - gap * (count - 1)) / count, 60);
  const rects = [];
  let y = y0;
  for (let i = 0; i < count; i++) {
    rects.push([x0, y, x1, y + rowH]);
    y += rowH + gap;
  }
  return rects;
}

export function columnCells(contentArea, count) {
  if (count <= 0) return [];
  const [x0, y0, x1, y1] = contentArea;
  const gap = 18;
  const colW = (x1 - x0 - gap * (count - 1)) / count;
  const rects = [];
  for (let i = 0; i < count; i++) {
    const cx = x0 + i * (colW + gap);
    rects.push([cx, y0, cx + colW, y1]);
  }
  return rects;
}

export function splitColumnRects(contentArea, leftRatio = 0.56) {
  const [x0, y0, x1, y1] = contentArea;
  const gap = 36;
  const totalW = x1 - x0 - gap;
  const leftW = totalW * leftRatio;
  return [
    [x0, y0, x0 + leftW, y1],
    [x0 + leftW + gap, y0, x1, y1],
  ];
}

export function gridCells(contentArea, count, columns = 3) {
  if (count <= 0) return [];
  const [x0, y0, x1, y1] = contentArea;
  columns = Math.max(1, Math.min(columns, count));
  const rows = Math.ceil(count / columns);
  const gap = 24;
  const cellW = (x1 - x0 - gap * (columns - 1)) / columns;
  const cellH = Math.min((y1 - y0 - gap * (rows - 1)) / rows, cellW * 1.35);
  const totalH = rows * cellH + (rows - 1) * gap;
  const yStart = y0 + Math.max(0, (y1 - y0 - totalH) / 2);

  const rects = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / columns);
    const col = i % columns;
    const itemsInRow = row < rows - 1 ? columns : count - columns * (rows - 1);
    const rowW = itemsInRow * cellW + (itemsInRow - 1) * gap;
    const rowXStart = x0 + Math.max(0, (x1 - x0 - rowW) / 2);
    const cx = rowXStart + col * (cellW + gap);
    const cy = yStart + row * (cellH + gap);
    rects.push([cx, cy, cx + cellW, cy + cellH]);
  }
  return rects;
}
