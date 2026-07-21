// The single source of truth for turning (profile, style) into pixels.
// renderStreamplan() is called identically by the live preview canvas and by
// every export format, so preview and export can never visually drift.
import { DAY_LABELS_SHORT, GIF_FRAME_COUNT, GIF_FRAME_DELAY_MS, CANVAS_WIDTH, CANVAS_HEIGHT } from "../../shared/constants.js";
import { sortedDays, endDisplay } from "../models/schedule.js";
import * as layout from "./layout.js";
import { hexToRgba, roundedRectPath, drawImageCover, drawCircularImage } from "./layout.js";
import { fontString } from "./fonts.js";
import { getImage } from "./assetImages.js";
import { applyGlow } from "./effects.js";
import { isGifPath, getGifStickerFrame } from "./gifSticker.js";
import { elementRectPx, elementCenterPx } from "../models/customLayout.js";

// One full loop of our own GIF export (24 frames × 80ms) — animated sticker
// frames are sampled against this timeline when t is driving the render, so
// a sticker's motion stays in sync across every exported GIF frame instead
// of just showing whichever frame happened to be current at encode time.
const STICKER_LOOP_SECONDS = (GIF_FRAME_COUNT * GIF_FRAME_DELAY_MS) / 1000;

function truncateText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  const ellipsis = "…";
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const candidate = text.slice(0, mid).trimEnd() + ellipsis;
    if (ctx.measureText(candidate).width <= maxWidth) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo > 0 ? text.slice(0, lo - 1).trimEnd() + ellipsis : ellipsis;
}

// Greedy word-wrap, so notes (game titles, activity descriptions) stay
// legible instead of being clipped to a few characters — only the final
// line gets ellipsis-truncated if the text still overflows maxLines.
function wrapText(ctx, text, maxWidth, maxLines) {
  const words = (text || "").split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const allLines = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (!current || ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      allLines.push(current);
      current = word;
    }
  }
  if (current) allLines.push(current);

  if (allLines.length <= maxLines) return allLines;
  const lines = allLines.slice(0, maxLines);
  lines[maxLines - 1] = truncateText(ctx, lines[maxLines - 1] + "…", maxWidth);
  return lines;
}

function drawPanel(ctx, [x0, y0, x1, y1], cornerStyle, baseRadius, fill, stroke, strokeWidth = 0) {
  // "pill" is only reachable via a per-element Layout Editor override (not
  // the global Card Corners setting), so it's handled locally here rather
  // than in layout.cornerRadius — a stadium/capsule shape, fully rounding
  // the panel's shorter side.
  const r = cornerStyle === "pill" ? Math.min(x1 - x0, y1 - y0) / 2 : layout.cornerRadius(cornerStyle, baseRadius);
  roundedRectPath(ctx, x0, y0, x1 - x0, y1 - y0, r);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke && strokeWidth > 0) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = strokeWidth;
    ctx.stroke();
  }
}

function drawEmptyState(ctx, contentArea, style) {
  const [x0, y0, x1, y1] = contentArea;
  ctx.fillStyle = style.colors.textSecondary || "#AAAAAA";
  ctx.font = fontString(style.fontBody, 34 * style.bodyScale);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("No stream days selected yet.", (x0 + x1) / 2, (y0 + y1) / 2);
}

function drawHeader(ctx, size, profile, style, headerRect, highlightRects) {
  const [x0, y0, x1, y1] = headerRect;
  const textPrimary = style.colors.textPrimary || "#FFFFFF";
  const textSecondary = style.colors.textSecondary || "#AAAAAA";
  const accent = style.colors.accent || "#FFFFFF";

  let contentX0 = x0;
  if (style.logoPath) {
    const logoImg = getImage(style.logoPath);
    if (logoImg) {
      const diameter = 140;
      const cy = y0 + (y1 - y0) / 2 - 10;
      drawCircularImage(
        ctx,
        logoImg,
        x0 + diameter / 2,
        cy,
        diameter / 2,
        style.logoOffsetX ?? 0.5,
        style.logoOffsetY ?? 0.5,
        style.logoScale ?? 1
      );
      contentX0 = x0 + diameter + 36;
    }
  }

  const name = (profile.displayName || "").trim() || "Your Streamer Name";
  const centerX = contentX0 + (x1 - contentX0) / 2;
  const nameY = y0 + 130;

  ctx.font = fontString(style.fontHeading, 92 * style.headingScale, "bold");
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const nameText = truncateText(ctx, name.toUpperCase(), x1 - contentX0 - 20);
  ctx.fillStyle = textPrimary;
  ctx.fillText(nameText, centerX, nameY);

  const metrics = ctx.measureText(nameText);
  const halfW = metrics.width / 2 + 10;
  const ascent = metrics.actualBoundingBoxAscent || 50;
  const descent = metrics.actualBoundingBoxDescent || 20;
  highlightRects.push([centerX - halfW, nameY - ascent - 8, centerX + halfW, nameY + descent + 8]);

  ctx.font = fontString(style.fontBody, 24 * style.bodyScale);
  ctx.fillStyle = textSecondary;
  ctx.fillText("WEEKLY STREAM SCHEDULE", centerX, nameY + 78);

  ctx.strokeStyle = hexToRgba(accent, 0.78);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x0, headerRect[3]);
  ctx.lineTo(x1, headerRect[3]);
  ctx.stroke();
}

function drawDayCard(ctx, entry, rect, style, highlightRects, stripe = true, rotationInfo = null) {
  const [x0, y0, x1, y1] = rect;
  const panel = style.colors.panel || "#1A1A1A";
  const accent = style.colors.accent || "#FFFFFF";
  const textPrimary = style.colors.textPrimary || "#FFFFFF";
  const textSecondary = style.colors.textSecondary || "#AAAAAA";
  const rowH = y1 - y0;

  drawPanel(ctx, rect, style.cornerStyle, 18, panel, hexToRgba(accent, 0.35), 2);

  const stripeW = stripe ? 8 : 0;
  if (stripe) {
    drawPanel(ctx, [x0, y0, x0 + stripeW, y1], style.cornerStyle, 8, accent, null, 0);
  }

  const padX = 34;
  const labelX = x0 + padX + stripeW;

  // Longer notes get a dedicated, legible band of their own along the
  // bottom of the card rather than being squeezed into leftover width next
  // to the time — that's the whole point of a note (what's actually
  // planned), so it needs to read at a glance like the time does.
  const noteFontSize = 30 * style.bodyScale;
  const noteLineH = noteFontSize * 1.2;
  const noteBandH = entry.label ? Math.min(noteLineH * 2 + 8, rowH * 0.4) : 0;
  const topMidY = entry.label ? y0 + (rowH - noteBandH) / 2 : (y0 + y1) / 2;

  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = fontString(style.fontHeading, 40 * style.headingScale, "bold");
  ctx.fillStyle = accent;
  ctx.fillText(DAY_LABELS_SHORT[entry.day] || entry.day.slice(0, 3).toUpperCase(), labelX, topMidY);

  const timeX = labelX + 190;
  ctx.font = fontString(style.fontBody, 44 * style.bodyScale);
  ctx.fillStyle = textPrimary;
  ctx.fillText(entry.startTime, timeX, topMidY - 14);

  const end = endDisplay(entry);
  if (end) {
    ctx.font = fontString(style.fontBody, 30 * style.bodyScale);
    ctx.fillStyle = textSecondary;
    ctx.fillText(entry.endTime ? `until ${end}` : end, timeX, topMidY + 26);
  }

  if (entry.label && noteBandH >= noteLineH) {
    const noteMaxW = x1 - 24 - labelX;
    ctx.font = fontString(style.fontBody, noteFontSize);
    ctx.fillStyle = textSecondary;
    const maxLines = Math.max(1, Math.floor(noteBandH / noteLineH));
    const lines = wrapText(ctx, entry.label, noteMaxW, maxLines);
    let ly = y1 - noteBandH / 2 - ((lines.length - 1) * noteLineH) / 2;
    lines.forEach((line) => {
      ctx.fillText(line, labelX, ly);
      ly += noteLineH;
    });
  }

  highlightRects.push(
    rotationInfo ? { rect, rotation: rotationInfo.rotation, cx: rotationInfo.cx, cy: rotationInfo.cy } : rect
  );
}

// -- Custom Layout (Layout Editor) ---------------------------------------
// Draws the 9 free-form-positioned elements (7 day cards + header + logo) a
// Custom Template's style.customLayout describes, entirely bypassing the
// fixed drawHeader()+VARIANT_DRAWERS[] path used by the 8 built-in variants.
// Reuses the same drawDayCard() every built-in variant uses, wrapped in the
// same save/translate/rotate/restore pattern already established by
// drawTicketStripVariant (above) and effects.js's glow sweep, so a rotated
// card renders identically to how it would if drawDayCard itself supported
// rotation natively.

function drawHeaderElement(ctx, rect, profile, style, highlightRects, rotationInfo) {
  const [x0, y0, x1, y1] = rect;
  const textPrimary = style.colors.textPrimary || "#FFFFFF";
  const textSecondary = style.colors.textSecondary || "#AAAAAA";
  const accent = style.colors.accent || "#FFFFFF";
  const boxW = x1 - x0;
  const boxH = y1 - y0;
  const centerX = (x0 + x1) / 2;
  const name = (profile.displayName || "").trim() || "Your Streamer Name";

  ctx.font = fontString(style.fontHeading, Math.min(92, boxH * 0.4) * style.headingScale, "bold");
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const nameText = truncateText(ctx, name.toUpperCase(), boxW - 20);
  const nameY = y0 + boxH * 0.42;
  ctx.fillStyle = textPrimary;
  ctx.fillText(nameText, centerX, nameY);

  const metrics = ctx.measureText(nameText);
  const halfW = metrics.width / 2 + 10;
  const ascent = metrics.actualBoundingBoxAscent || 50;
  const descent = metrics.actualBoundingBoxDescent || 20;
  const glowRect = [centerX - halfW, nameY - ascent - 8, centerX + halfW, nameY + descent + 8];
  highlightRects.push(
    rotationInfo ? { rect: glowRect, rotation: rotationInfo.rotation, cx: rotationInfo.cx, cy: rotationInfo.cy } : glowRect
  );

  ctx.font = fontString(style.fontBody, 24 * style.bodyScale);
  ctx.fillStyle = textSecondary;
  ctx.fillText("WEEKLY STREAM SCHEDULE", centerX, nameY + Math.min(78, boxH * 0.3));

  ctx.strokeStyle = hexToRgba(accent, 0.78);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x0, y1);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

function drawLogoElement(ctx, rect, style) {
  if (!style.logoPath) return;
  const logoImg = getImage(style.logoPath);
  if (!logoImg) return;
  const [x0, y0, x1, y1] = rect;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const diameter = Math.min(x1 - x0, y1 - y0);
  drawCircularImage(ctx, logoImg, cx, cy, diameter / 2, style.logoOffsetX ?? 0.5, style.logoOffsetY ?? 0.5, style.logoScale ?? 1);
}

function drawCustomLayout(ctx, activeDays, profile, style, size, highlightRects) {
  const elements = style.customLayout.elements;
  const activeByDay = new Map(activeDays.map((entry) => [entry.day, entry]));

  // Draw order follows the elements array's own order — this IS the z-order
  // (later = on top), user-adjustable via the Layout Editor's "Bring to
  // Front"/"Send to Back" controls and preserved as-is by
  // sanitizeCustomLayout. A day card the user isn't currently streaming on
  // still gets drawn (with a "Day Off" placeholder) rather than vanishing —
  // a custom layout is a deliberate arrangement of all 9 elements, so it
  // should never silently lose pieces just because that weekday happens to
  // be unchecked in the schedule right now.
  elements.forEach((el) => {
    const rect = elementRectPx(el, size);
    const [cx, cy] = elementCenterPx(el, size);
    const rotation = el.rotation || 0;

    // Per-element style overrides (corner shape, accent color) are applied
    // by shallow-cloning the template's style just for this one draw call —
    // drawDayCard/drawHeaderElement already read cornerStyle/colors.accent
    // off whatever style object they're given, so no changes were needed
    // there; a fresh element with no overrides renders byte-identical to
    // before (effectiveStyle === style).
    const effectiveStyle =
      el.cornerStyle || el.accentColor
        ? {
            ...style,
            cornerStyle: el.cornerStyle || style.cornerStyle,
            colors: el.accentColor ? { ...style.colors, accent: el.accentColor } : style.colors,
          }
        : style;

    ctx.save();
    ctx.globalAlpha = el.opacity ?? 1;
    if (rotation) {
      ctx.translate(cx, cy);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.translate(-cx, -cy);
    }

    if (el.type === "dayCard") {
      const entry = activeByDay.get(el.id) || { day: el.id, startTime: "Day Off", endTime: null, durationMinutes: null, label: null };
      drawDayCard(ctx, entry, rect, effectiveStyle, highlightRects, el.showStripe ?? true, rotation ? { rotation, cx, cy } : null);
    } else if (el.type === "header") {
      drawHeaderElement(ctx, rect, profile, effectiveStyle, highlightRects, rotation ? { rotation, cx, cy } : null);
    } else if (el.type === "logo") {
      drawLogoElement(ctx, rect, style);
    }

    ctx.restore();
  });
}

function drawListVariant(ctx, activeDays, style, contentArea, highlightRects) {
  if (activeDays.length === 0) {
    drawEmptyState(ctx, contentArea, style);
    return;
  }
  const rects = layout.listRows(contentArea, activeDays.length);
  activeDays.forEach((entry, i) => drawDayCard(ctx, entry, rects[i], style, highlightRects));
}

function drawGridVariant(ctx, activeDays, style, contentArea, highlightRects) {
  if (activeDays.length === 0) {
    drawEmptyState(ctx, contentArea, style);
    return;
  }
  const rects = layout.gridCells(contentArea, activeDays.length, 3);
  const accent = style.colors.accent || "#FFFFFF";
  const accent2 = style.colors.accentSecondary || "#FFFFFF";
  const panel = style.colors.panel || "#1A1A1A";
  const textPrimary = style.colors.textPrimary || "#FFFFFF";
  const textSecondary = style.colors.textSecondary || "#AAAAAA";

  activeDays.forEach((entry, i) => {
    const rect = rects[i];
    const [x0, y0, x1, y1] = rect;
    drawPanel(ctx, rect, style.cornerStyle, 24, panel, hexToRgba(accent2, 0.4), 2);

    const nodeR = 34;
    const cx = (x0 + x1) / 2;
    const nodeCy = y0 + 26 + nodeR;
    ctx.beginPath();
    ctx.arc(cx, nodeCy, nodeR, 0, Math.PI * 2);
    ctx.fillStyle = hexToRgba(accent, 0.9);
    ctx.fill();

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = fontString(style.fontBody, 30 * style.bodyScale);
    ctx.fillStyle = "#0A0A0F";
    ctx.fillText(DAY_LABELS_SHORT[entry.day] || entry.day.slice(0, 3).toUpperCase(), cx, nodeCy);

    const timeY = nodeCy + nodeR + 40;
    ctx.font = fontString(style.fontHeading, 40 * style.headingScale, "bold");
    ctx.fillStyle = textPrimary;
    ctx.fillText(entry.startTime, cx, timeY);

    const end = endDisplay(entry);
    if (end) {
      ctx.font = fontString(style.fontBody, 30 * style.bodyScale);
      ctx.fillStyle = textSecondary;
      ctx.fillText(end, cx, timeY + 40);
    }

    if (entry.label) {
      const noteFontSize = 34 * style.bodyScale;
      const noteLineH = noteFontSize * 1.2;
      ctx.font = fontString(style.fontBody, noteFontSize);
      ctx.fillStyle = textSecondary;
      const lines = wrapText(ctx, entry.label, x1 - x0 - 24, 2);
      let ly = y1 - 20 - (lines.length - 1) * noteLineH;
      lines.forEach((line) => {
        ctx.fillText(line, cx, ly);
        ly += noteLineH;
      });
    }

    highlightRects.push(rect);
  });
}

function drawTimelineVariant(ctx, activeDays, style, contentArea, highlightRects) {
  if (activeDays.length === 0) {
    drawEmptyState(ctx, contentArea, style);
    return;
  }
  const leftInset = 90;
  const rects = layout.listRows(contentArea, activeDays.length, leftInset);
  const accent = style.colors.accent || "#FFFFFF";
  const accent2 = style.colors.accentSecondary || "#FFFFFF";
  const lineX = contentArea[0] + leftInset / 2;

  if (rects.length) {
    ctx.strokeStyle = hexToRgba(accent2, 0.78);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(lineX, rects[0][1] + 10);
    ctx.lineTo(lineX, rects[rects.length - 1][3] - 10);
    ctx.stroke();
  }

  activeDays.forEach((entry, i) => {
    const rect = rects[i];
    const midY = (rect[1] + rect[3]) / 2;
    const nodeR = 14;
    ctx.beginPath();
    ctx.arc(lineX, midY, nodeR, 0, Math.PI * 2);
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.strokeStyle = accent2;
    ctx.lineWidth = 3;
    ctx.stroke();

    drawDayCard(ctx, entry, rect, style, highlightRects, false);
  });
}

function drawCalendarGridVariant(ctx, activeDays, style, contentArea, highlightRects) {
  if (activeDays.length === 0) {
    drawEmptyState(ctx, contentArea, style);
    return;
  }
  // Capped at 4 columns (wrapping to a 2nd row past that) instead of one
  // column per active day — a single-row-of-7 left each cell too narrow for
  // a legible note, no matter the font size.
  const columns = Math.min(4, activeDays.length);
  const rects = layout.gridCells(contentArea, activeDays.length, columns);
  const accent = style.colors.accent || "#FFFFFF";
  const accent2 = style.colors.accentSecondary || "#FFFFFF";
  const panel = style.colors.panel || "#1A1A1A";
  const textPrimary = style.colors.textPrimary || "#FFFFFF";
  const textSecondary = style.colors.textSecondary || "#AAAAAA";

  activeDays.forEach((entry, i) => {
    const rect = rects[i];
    const [x0, y0, x1, y1] = rect;
    drawPanel(ctx, rect, style.cornerStyle, 16, panel, hexToRgba(accent2, 0.35), 2);

    const headerH = 54;
    ctx.save();
    roundedRectPath(ctx, x0, y0, x1 - x0, y1 - y0, layout.cornerRadius(style.cornerStyle, 16));
    ctx.clip();
    ctx.fillStyle = hexToRgba(accent, 0.85);
    ctx.fillRect(x0, y0, x1 - x0, headerH);
    ctx.restore();

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = fontString(style.fontHeading, 24 * style.headingScale, "bold");
    ctx.fillStyle = "#0A0A0F";
    ctx.fillText(DAY_LABELS_SHORT[entry.day] || entry.day.slice(0, 3).toUpperCase(), (x0 + x1) / 2, y0 + headerH / 2);

    const cx = (x0 + x1) / 2;
    let ty = y0 + headerH + 46;
    ctx.font = fontString(style.fontBody, 30 * style.bodyScale, "bold");
    ctx.fillStyle = textPrimary;
    ctx.fillText(truncateText(ctx, entry.startTime, x1 - x0 - 16), cx, ty);

    const end = endDisplay(entry);
    if (end) {
      ty += 32;
      ctx.font = fontString(style.fontBody, 19 * style.bodyScale);
      ctx.fillStyle = textSecondary;
      ctx.fillText(truncateText(ctx, end, x1 - x0 - 16), cx, ty);
    }

    if (entry.label) {
      const noteFontSize = 24 * style.bodyScale;
      const noteLineH = noteFontSize * 1.2;
      ctx.font = fontString(style.fontBody, noteFontSize);
      ctx.fillStyle = textSecondary;
      const lines = wrapText(ctx, entry.label, x1 - x0 - 16, 2);
      let ly = y1 - 18 - (lines.length - 1) * noteLineH;
      lines.forEach((line) => {
        ctx.fillText(line, cx, ly);
        ly += noteLineH;
      });
    }

    highlightRects.push(rect);
  });
}

function drawCompactBadgesVariant(ctx, activeDays, style, contentArea, highlightRects) {
  if (activeDays.length === 0) {
    drawEmptyState(ctx, contentArea, style);
    return;
  }
  const [x0, y0, x1] = contentArea;
  const accent = style.colors.accent || "#FFFFFF";
  const panel = style.colors.panel || "#1A1A1A";
  const textPrimary = style.colors.textPrimary || "#FFFFFF";
  const textSecondary = style.colors.textSecondary || "#AAAAAA";
  const gap = 16;
  const rowGap = 18;
  const padX = 26;
  const pillH = 74;

  ctx.font = fontString(style.fontBody, 30 * style.bodyScale);
  const bodyFont = ctx.font;
  ctx.font = fontString(style.fontHeading, 30 * style.headingScale, "bold");
  const headingFont = ctx.font;

  const items = activeDays.map((entry) => {
    const end = endDisplay(entry);
    const timeText = end ? `${entry.startTime}–${end}` : entry.startTime;
    ctx.font = headingFont;
    const dayW = ctx.measureText((DAY_LABELS_SHORT[entry.day] || entry.day.slice(0, 3).toUpperCase()) + "  ").width;
    ctx.font = bodyFont;
    const timeW = ctx.measureText(timeText).width;
    const labelW = entry.label ? ctx.measureText("  ·  " + entry.label).width : 0;
    return { entry, timeText, w: padX * 2 + dayW + timeW + labelW };
  });

  let x = x0;
  let y = y0;
  items.forEach((item) => {
    if (x + item.w > x1 && x > x0) {
      x = x0;
      y += pillH + rowGap;
    }
    const rect = [x, y, x + item.w, y + pillH];
    drawPanel(ctx, rect, style.cornerStyle, pillH / 2, panel, hexToRgba(accent, 0.4), 2);

    let tx = x + padX;
    const midY = y + pillH / 2;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.font = headingFont;
    ctx.fillStyle = accent;
    const dayLabel = DAY_LABELS_SHORT[item.entry.day] || item.entry.day.slice(0, 3).toUpperCase();
    ctx.fillText(dayLabel, tx, midY);
    tx += ctx.measureText(dayLabel + "  ").width;

    ctx.font = bodyFont;
    ctx.fillStyle = textPrimary;
    ctx.fillText(item.timeText, tx, midY);
    tx += ctx.measureText(item.timeText).width;

    if (item.entry.label) {
      ctx.fillStyle = textSecondary;
      ctx.fillText("  ·  " + item.entry.label, tx, midY);
    }

    highlightRects.push(rect);
    x += item.w + gap;
  });
}

function drawSplitColumnsVariant(ctx, activeDays, style, contentArea, highlightRects) {
  if (activeDays.length === 0) {
    drawEmptyState(ctx, contentArea, style);
    return;
  }
  const weekdaySet = new Set(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]);
  const weekdays = activeDays.filter((e) => weekdaySet.has(e.day));
  const weekend = activeDays.filter((e) => !weekdaySet.has(e.day));
  const [leftRect, rightRect] = layout.splitColumnRects(contentArea, 0.6);
  const accent = style.colors.accent || "#FFFFFF";
  const textSecondary = style.colors.textSecondary || "#AAAAAA";

  const drawColumn = (rect, title, days) => {
    const [x0, y0, x1, y1] = rect;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.font = fontString(style.fontBody, 22 * style.bodyScale, "bold");
    ctx.fillStyle = hexToRgba(accent, 0.9);
    ctx.fillText(title, x0, y0 + 8);
    ctx.strokeStyle = hexToRgba(accent, 0.5);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x0, y0 + 22);
    ctx.lineTo(x1, y0 + 22);
    ctx.stroke();

    const innerArea = [x0, y0 + 46, x1, y1];
    if (days.length === 0) {
      ctx.font = fontString(style.fontBody, 20 * style.bodyScale);
      ctx.fillStyle = textSecondary;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("No days here.", (x0 + x1) / 2, (innerArea[1] + innerArea[3]) / 2);
      return;
    }
    const rects = layout.listRows(innerArea, days.length);
    days.forEach((entry, i) => drawDayCard(ctx, entry, rects[i], style, highlightRects, false));
  };

  drawColumn(leftRect, "WEEKDAYS", weekdays);
  drawColumn(rightRect, "WEEKEND", weekend);
}

function drawRadialClockVariant(ctx, activeDays, style, contentArea, highlightRects) {
  if (activeDays.length === 0) {
    drawEmptyState(ctx, contentArea, style);
    return;
  }
  const [x0, y0, x1, y1] = contentArea;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  // Shrunk a bit further in from the edge (was -90) to leave room below the
  // bottommost node for a note line without it running past contentArea.
  const radius = Math.min(x1 - x0, y1 - y0) / 2 - 110;
  const accent = style.colors.accent || "#FFFFFF";
  const accent2 = style.colors.accentSecondary || "#FFFFFF";
  const panel = style.colors.panel || "#1A1A1A";
  const textPrimary = style.colors.textPrimary || "#FFFFFF";
  const textSecondary = style.colors.textSecondary || "#AAAAAA";

  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.strokeStyle = hexToRgba(accent2, 0.35);
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.35, 0, Math.PI * 2);
  ctx.strokeStyle = hexToRgba(accent2, 0.22);
  ctx.stroke();

  const count = activeDays.length;
  const nodeR = 32;
  activeDays.forEach((entry, i) => {
    const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
    const nx = cx + Math.cos(angle) * radius;
    const ny = cy + Math.sin(angle) * radius;

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(nx, ny);
    ctx.strokeStyle = hexToRgba(accent, 0.3);
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(nx, ny, nodeR, 0, Math.PI * 2);
    ctx.fillStyle = hexToRgba(accent, 0.92);
    ctx.fill();

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = fontString(style.fontHeading, 22 * style.headingScale, "bold");
    ctx.fillStyle = "#0A0A0F";
    ctx.fillText(DAY_LABELS_SHORT[entry.day] || entry.day.slice(0, 3).toUpperCase(), nx, ny);

    ctx.font = fontString(style.fontBody, 25 * style.bodyScale, "bold");
    ctx.fillStyle = textPrimary;
    ctx.fillText(entry.startTime, nx, ny + nodeR + 32);

    let cursorY = ny + nodeR + 32;
    const end = endDisplay(entry);
    if (end) {
      cursorY += 26;
      ctx.font = fontString(style.fontBody, 17 * style.bodyScale);
      ctx.fillStyle = textSecondary;
      ctx.fillText(truncateText(ctx, end, radius * 0.8), nx, cursorY);
    }

    // Notes were missing entirely from this layout before — with up to 7
    // nodes spaced around the circle there's only so much width per node,
    // so this wraps to 2 short lines rather than trying to go large.
    if (entry.label) {
      const noteFontSize = 17 * style.bodyScale;
      const noteLineH = noteFontSize * 1.15;
      const noteMaxW = Math.min(230, radius * 0.5);
      ctx.font = fontString(style.fontBody, noteFontSize);
      ctx.fillStyle = textSecondary;
      const lines = wrapText(ctx, entry.label, noteMaxW, 2);
      cursorY += 14;
      lines.forEach((line) => {
        cursorY += noteLineH;
        ctx.fillText(line, nx, cursorY);
      });
    }

    highlightRects.push([nx - nodeR, ny - nodeR, nx + nodeR, ny + nodeR]);
  });

  ctx.beginPath();
  ctx.arc(cx, cy, 50, 0, Math.PI * 2);
  ctx.fillStyle = hexToRgba(panel, 0.92);
  ctx.fill();
  ctx.strokeStyle = hexToRgba(accent2, 0.6);
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawTicketStripVariant(ctx, activeDays, style, contentArea, highlightRects) {
  if (activeDays.length === 0) {
    drawEmptyState(ctx, contentArea, style);
    return;
  }
  const [x0, y0, x1] = contentArea;
  const desiredW = 340;
  const gap = 22;
  const availW = x1 - x0;
  const columns = Math.max(1, Math.min(activeDays.length, Math.floor((availW + gap) / (desiredW + gap))));
  const rects = layout.gridCells(contentArea, activeDays.length, columns);

  const accent = style.colors.accent || "#FFFFFF";
  const accent2 = style.colors.accentSecondary || "#FFFFFF";
  const panel = style.colors.panel || "#1A1A1A";
  const textPrimary = style.colors.textPrimary || "#FFFFFF";
  const textSecondary = style.colors.textSecondary || "#AAAAAA";

  activeDays.forEach((entry, i) => {
    const rect = rects[i];
    const [rx0, ry0, rx1, ry1] = rect;
    drawPanel(ctx, rect, style.cornerStyle, 14, panel, hexToRgba(accent2, 0.4), 2);

    const stubW = 76;
    drawPanel(ctx, [rx0, ry0, rx0 + stubW, ry1], style.cornerStyle, 14, hexToRgba(accent, 0.85), null, 0);

    ctx.save();
    ctx.strokeStyle = hexToRgba(style.colors.background || "#0A0A0F", 0.9);
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(rx0 + stubW, ry0 + 6);
    ctx.lineTo(rx0 + stubW, ry1 - 6);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.translate(rx0 + stubW / 2, (ry0 + ry1) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = fontString(style.fontHeading, 26 * style.headingScale, "bold");
    ctx.fillStyle = "#0A0A0F";
    ctx.fillText(DAY_LABELS_SHORT[entry.day] || entry.day.slice(0, 3).toUpperCase(), 0, 0);
    ctx.restore();

    const bodyX0 = rx0 + stubW + 20;
    const midY = (ry0 + ry1) / 2;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.font = fontString(style.fontBody, 30 * style.bodyScale);
    ctx.fillStyle = textPrimary;
    ctx.fillText(entry.startTime, bodyX0, midY - 14);

    const end = endDisplay(entry);
    if (end) {
      ctx.font = fontString(style.fontBody, 19 * style.bodyScale);
      ctx.fillStyle = textSecondary;
      ctx.fillText(truncateText(ctx, entry.endTime ? `until ${end}` : end, rx1 - bodyX0 - 12), bodyX0, midY + 18);
    }

    if (entry.label) {
      const noteFontSize = 22 * style.bodyScale;
      const noteLineH = noteFontSize * 1.2;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.font = fontString(style.fontBody, noteFontSize);
      ctx.fillStyle = textSecondary;
      const lines = wrapText(ctx, entry.label, rx1 - bodyX0 - 12, 2);
      let ly = ry1 - 20 - (lines.length - 1) * noteLineH;
      lines.forEach((line) => {
        ctx.fillText(line, bodyX0, ly);
        ly += noteLineH;
      });
    }

    highlightRects.push(rect);
  });
}

const VARIANT_DRAWERS = {
  grid7: drawGridVariant,
  verticalTimeline: drawTimelineVariant,
  calendarGrid: drawCalendarGridVariant,
  compactBadges: drawCompactBadgesVariant,
  splitColumns: drawSplitColumnsVariant,
  radialClock: drawRadialClockVariant,
  ticketStrip: drawTicketStripVariant,
};

// `outputSize` is the actual pixel size of the exported/rendered canvas —
// everything below still computes as if it were drawing at the fixed design
// resolution (CANVAS_WIDTH x CANVAS_HEIGHT), and a single uniform ctx.scale()
// upfront maps that onto whatever output size was requested. This keeps text
// and every layout variant crisp (real vector-ish redraw, not a blurry
// bitmap stretch) at any export resolution without touching a single one of
// their pixel constants — outputSize must keep the same aspect ratio as
// CANVAS_WIDTH:CANVAS_HEIGHT (see EXPORT_RESOLUTIONS in shared/constants.js).
export function renderStreamplan(canvas, profile, style, t = null, outputSize = [CANVAS_WIDTH, CANVAS_HEIGHT]) {
  const [outW, outH] = outputSize;
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, outW, outH);

  const scale = outW / CANVAS_WIDTH;
  ctx.save();
  ctx.scale(scale, scale);
  const size = [CANVAS_WIDTH, CANVAS_HEIGHT];
  const [w, h] = size;

  const images = {
    background:
      style.backgroundMode === "image" && style.backgroundImagePath ? getImage(style.backgroundImagePath) : null,
  };
  layout.buildBackground(ctx, size, style, images);

  const highlightRects = [];
  const activeDays = sortedDays(profile);

  if (style.customLayout && style.customLayout.elements?.length) {
    drawCustomLayout(ctx, activeDays, profile, style, size, highlightRects);
  } else {
    const headerRect = layout.computeHeaderRect(size);
    drawHeader(ctx, size, profile, style, headerRect, highlightRects);

    const contentArea = layout.computeContentArea(size, headerRect);

    const drawVariant = VARIANT_DRAWERS[style.layoutVariant] || drawListVariant;
    drawVariant(ctx, activeDays, style, contentArea, highlightRects);
  }

  // t !== null means we're on an animation timeline (live glow preview or
  // GIF export) — sample sticker frames against that same clock so motion
  // stays in sync. Otherwise (a plain static preview/export snapshot) fall
  // back to real wall-clock time so an uploaded GIF still visibly animates
  // while the user is just looking at / editing the plan.
  const stickerElapsedSeconds = t !== null ? t * STICKER_LOOP_SECONDS : performance.now() / 1000;
  (style.customImages || []).forEach((sticker) => {
    if (isGifPath(sticker.path)) {
      const gifFrame = getGifStickerFrame(sticker.path, stickerElapsedSeconds);
      if (gifFrame) layout.drawStickerImage(ctx, gifFrame.frame, gifFrame.width, gifFrame.height, sticker, size);
    } else {
      const img = getImage(sticker.path);
      if (img) layout.drawStickerImage(ctx, img, img.width, img.height, sticker, size);
    }
  });

  if (t !== null) {
    applyGlow(ctx, size, style, highlightRects, t);
  }

  ctx.restore();
  return canvas;
}
