// The single source of truth for turning (profile, style) into pixels.
// renderStreamplan() is called identically by the live preview canvas and by
// every export format, so preview and export can never visually drift.
import { DAY_LABELS_SHORT, GIF_FRAME_COUNT, GIF_FRAME_DELAY_MS, CANVAS_WIDTH, CANVAS_HEIGHT } from "../../shared/constants.js";
import { sortedDays, endDisplay } from "../models/schedule.js";
import * as layout from "./layout.js";
import { hexToRgba, roundedRectPath, drawImageCover, drawCircularImage } from "./layout.js";
import { fontString } from "./fonts.js";
import { getImage } from "./assetImages.js";
import { drawAnimatedBackground } from "./animatedBackgrounds.js";
import { isGifPath, getGifStickerFrame } from "./gifSticker.js";
import { elementRectPx, elementCenterPx } from "../models/customLayout.js";
import { applyElementAnimation, drawElementGlow } from "./elementAnimations.js";

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
// drawTicketStripVariant (above), so a rotated card renders identically to
// how it would if drawDayCard itself supported rotation natively.

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

// -- Card skins (Layout Editor only) -------------------------------------
// Alternate visual treatments for a dayCard element, ported from the
// distinct looks of the built-in variants above but made self-contained to
// a single given rect (the originals draw within controlled grid/list
// rects; a free element can reach far more extreme aspect ratios, so every
// skin below sizes its own decorations off its own rect rather than fixed
// pixel constants, and drops secondary text (end time, etc.) when there's
// not clearly room for it instead of letting it overflow).

function drawBadgeCardSkin(ctx, entry, rect, style, highlightRects, stripe = true, rotationInfo = null) {
  const [x0, y0, x1, y1] = rect;
  const rectW = x1 - x0;
  const rectH = y1 - y0;
  const accent = style.colors.accent || "#FFFFFF";
  const accent2 = style.colors.accentSecondary || accent;
  const panel = style.colors.panel || "#1A1A1A";
  const textPrimary = style.colors.textPrimary || "#FFFFFF";
  const textSecondary = style.colors.textSecondary || "#AAAAAA";

  drawPanel(ctx, rect, style.cornerStyle, 24, panel, hexToRgba(accent2, 0.4), 2);

  const nodeR = Math.max(14, Math.min(34, Math.min(rectW, rectH) * 0.22));
  const cx = (x0 + x1) / 2;
  const nodeCy = y0 + Math.min(26, rectH * 0.18) + nodeR;
  ctx.beginPath();
  ctx.arc(cx, nodeCy, nodeR, 0, Math.PI * 2);
  ctx.fillStyle = hexToRgba(accent, 0.9);
  ctx.fill();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = fontString(style.fontBody, Math.min(30, nodeR * 0.85) * style.bodyScale);
  ctx.fillStyle = "#0A0A0F";
  ctx.fillText(DAY_LABELS_SHORT[entry.day] || entry.day.slice(0, 3).toUpperCase(), cx, nodeCy);

  let remaining = y1 - (nodeCy + nodeR + 10);
  if (remaining >= 24) {
    const timeY = nodeCy + nodeR + Math.min(40, remaining * 0.5);
    ctx.font = fontString(style.fontHeading, Math.min(40, remaining * 0.4) * style.headingScale, "bold");
    ctx.fillStyle = textPrimary;
    ctx.fillText(truncateText(ctx, entry.startTime, rectW - 16), cx, timeY);

    const end = endDisplay(entry);
    remaining = y1 - (timeY + 20);
    if (end && remaining >= 20) {
      const endY = timeY + Math.min(40, remaining);
      ctx.font = fontString(style.fontBody, 24 * style.bodyScale);
      ctx.fillStyle = textSecondary;
      ctx.fillText(truncateText(ctx, end, rectW - 16), cx, endY);
    }
  }

  highlightRects.push(
    rotationInfo ? { rect, rotation: rotationInfo.rotation, cx: rotationInfo.cx, cy: rotationInfo.cy } : rect
  );
}

function drawCalendarCardSkin(ctx, entry, rect, style, highlightRects, stripe = true, rotationInfo = null) {
  const [x0, y0, x1, y1] = rect;
  const rectW = x1 - x0;
  const rectH = y1 - y0;
  const accent = style.colors.accent || "#FFFFFF";
  const accent2 = style.colors.accentSecondary || accent;
  const panel = style.colors.panel || "#1A1A1A";
  const textPrimary = style.colors.textPrimary || "#FFFFFF";
  const textSecondary = style.colors.textSecondary || "#AAAAAA";

  drawPanel(ctx, rect, style.cornerStyle, 16, panel, hexToRgba(accent2, 0.35), 2);

  const headerH = Math.max(20, Math.min(54, rectH * 0.32));
  ctx.save();
  roundedRectPath(ctx, x0, y0, rectW, rectH, layout.cornerRadius(style.cornerStyle, 16));
  ctx.clip();
  ctx.fillStyle = hexToRgba(accent, 0.85);
  ctx.fillRect(x0, y0, rectW, headerH);
  ctx.restore();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = fontString(style.fontHeading, Math.min(24, headerH * 0.55) * style.headingScale, "bold");
  ctx.fillStyle = "#0A0A0F";
  ctx.fillText(DAY_LABELS_SHORT[entry.day] || entry.day.slice(0, 3).toUpperCase(), (x0 + x1) / 2, y0 + headerH / 2);

  const cx = (x0 + x1) / 2;
  const remaining = rectH - headerH;
  if (remaining >= 26) {
    let ty = y0 + headerH + Math.min(46, remaining * 0.4);
    ctx.font = fontString(style.fontBody, Math.min(30, remaining * 0.28) * style.bodyScale, "bold");
    ctx.fillStyle = textPrimary;
    ctx.fillText(truncateText(ctx, entry.startTime, rectW - 16), cx, ty);

    const end = endDisplay(entry);
    if (end && y1 - ty >= 24) {
      ty += Math.min(32, (y1 - ty) * 0.6);
      ctx.font = fontString(style.fontBody, 19 * style.bodyScale);
      ctx.fillStyle = textSecondary;
      ctx.fillText(truncateText(ctx, end, rectW - 16), cx, ty);
    }
  }

  highlightRects.push(
    rotationInfo ? { rect, rotation: rotationInfo.rotation, cx: rotationInfo.cx, cy: rotationInfo.cy } : rect
  );
}

function drawTicketCardSkin(ctx, entry, rect, style, highlightRects, stripe = true, rotationInfo = null) {
  const [rx0, ry0, rx1, ry1] = rect;
  const rectW = rx1 - rx0;
  const rectH = ry1 - ry0;
  const accent = style.colors.accent || "#FFFFFF";
  const accent2 = style.colors.accentSecondary || accent;
  const panel = style.colors.panel || "#1A1A1A";
  const textPrimary = style.colors.textPrimary || "#FFFFFF";
  const textSecondary = style.colors.textSecondary || "#AAAAAA";

  drawPanel(ctx, rect, style.cornerStyle, 14, panel, hexToRgba(accent2, 0.4), 2);

  const stubW = Math.max(30, Math.min(76, rectW * 0.28));
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
  ctx.font = fontString(style.fontHeading, Math.min(26, stubW * 0.55, rectH * 0.4) * style.headingScale, "bold");
  ctx.fillStyle = "#0A0A0F";
  ctx.fillText(DAY_LABELS_SHORT[entry.day] || entry.day.slice(0, 3).toUpperCase(), 0, 0);
  ctx.restore();

  const bodyX0 = rx0 + stubW + 20;
  const midY = (ry0 + ry1) / 2;
  if (rx1 - bodyX0 >= 40) {
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.font = fontString(style.fontBody, Math.min(30, rectH * 0.3) * style.bodyScale);
    ctx.fillStyle = textPrimary;
    ctx.fillText(truncateText(ctx, entry.startTime, rx1 - bodyX0 - 12), bodyX0, midY - Math.min(14, rectH * 0.15));

    const end = endDisplay(entry);
    if (end && rectH >= 60) {
      ctx.font = fontString(style.fontBody, 19 * style.bodyScale);
      ctx.fillStyle = textSecondary;
      ctx.fillText(
        truncateText(ctx, entry.endTime ? `until ${end}` : end, rx1 - bodyX0 - 12),
        bodyX0,
        midY + Math.min(18, rectH * 0.18)
      );
    }
  }

  highlightRects.push(
    rotationInfo ? { rect, rotation: rotationInfo.rotation, cx: rotationInfo.cx, cy: rotationInfo.cy } : rect
  );
}

// Rewritten from drawCompactBadgesVariant's inline pill: the original
// measures its content and GROWS the pill to fit; a free element has a
// fixed rect it must fit within instead, so this truncates content that
// doesn't fit rather than expanding the shape.
function drawCompactCardSkin(ctx, entry, rect, style, highlightRects, stripe = true, rotationInfo = null) {
  const [x0, y0, x1, y1] = rect;
  const rectW = x1 - x0;
  const rectH = y1 - y0;
  const accent = style.colors.accent || "#FFFFFF";
  const panel = style.colors.panel || "#1A1A1A";
  const textPrimary = style.colors.textPrimary || "#FFFFFF";
  const textSecondary = style.colors.textSecondary || "#AAAAAA";

  drawPanel(ctx, rect, "pill", 0, panel, hexToRgba(accent, 0.4), 2);

  const padX = Math.max(10, Math.min(26, rectW * 0.08));
  const midY = (y0 + y1) / 2;
  let tx = x0 + padX;
  const maxTx = x1 - padX;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";

  ctx.font = fontString(style.fontHeading, Math.min(30, rectH * 0.4) * style.headingScale, "bold");
  ctx.fillStyle = accent;
  const dayLabel = DAY_LABELS_SHORT[entry.day] || entry.day.slice(0, 3).toUpperCase();
  const dayText = truncateText(ctx, dayLabel, Math.max(0, maxTx - tx));
  ctx.fillText(dayText, tx, midY);
  tx += ctx.measureText(dayText + "  ").width;

  if (maxTx - tx > 20) {
    const end = endDisplay(entry);
    const timeText = end ? `${entry.startTime}–${end}` : entry.startTime;
    ctx.font = fontString(style.fontBody, Math.min(30, rectH * 0.35) * style.bodyScale);
    ctx.fillStyle = textPrimary;
    const shownTime = truncateText(ctx, timeText, maxTx - tx);
    ctx.fillText(shownTime, tx, midY);
    tx += ctx.measureText(shownTime).width;
  }

  if (entry.label && maxTx - tx > 20) {
    ctx.fillStyle = textSecondary;
    ctx.fillText(truncateText(ctx, "  ·  " + entry.label, maxTx - tx), tx, midY);
  }

  highlightRects.push(
    rotationInfo ? { rect, rotation: rotationInfo.rotation, cx: rotationInfo.cx, cy: rotationInfo.cy } : rect
  );
}

function drawRingCardSkin(ctx, entry, rect, style, highlightRects, stripe = true, rotationInfo = null) {
  const [x0, y0, x1, y1] = rect;
  const rectW = x1 - x0;
  const accent = style.colors.accent || "#FFFFFF";
  const accent2 = style.colors.accentSecondary || accent;
  const textPrimary = style.colors.textPrimary || "#FFFFFF";
  const textSecondary = style.colors.textSecondary || "#AAAAAA";
  const rectH = y1 - y0;

  const cx = (x0 + x1) / 2;
  const nodeR = Math.max(18, Math.min(40, Math.min(rectW, rectH * 0.6) * 0.42));
  const cy = y0 + nodeR + Math.min(10, rectH * 0.08);

  ctx.beginPath();
  ctx.arc(cx, cy, nodeR, 0, Math.PI * 2);
  ctx.fillStyle = hexToRgba(accent, 0.92);
  ctx.fill();
  ctx.strokeStyle = hexToRgba(accent2, 0.6);
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = fontString(style.fontHeading, Math.min(22, nodeR * 0.6) * style.headingScale, "bold");
  ctx.fillStyle = "#0A0A0F";
  ctx.fillText(DAY_LABELS_SHORT[entry.day] || entry.day.slice(0, 3).toUpperCase(), cx, cy);

  let remaining = y1 - (cy + nodeR + 8);
  if (remaining >= 24) {
    let ty = cy + nodeR + Math.min(30, remaining * 0.5);
    ctx.font = fontString(style.fontBody, Math.min(24, remaining * 0.4) * style.bodyScale, "bold");
    ctx.fillStyle = textPrimary;
    ctx.fillText(truncateText(ctx, entry.startTime, rectW - 16), cx, ty);

    const end = endDisplay(entry);
    remaining = y1 - (ty + 16);
    if (end && remaining >= 18) {
      ty += Math.min(26, remaining);
      ctx.font = fontString(style.fontBody, 16 * style.bodyScale);
      ctx.fillStyle = textSecondary;
      ctx.fillText(truncateText(ctx, end, rectW - 16), cx, ty);
    }
  }

  highlightRects.push(
    rotationInfo ? { rect, rotation: rotationInfo.rotation, cx: rotationInfo.cx, cy: rotationInfo.cy } : rect
  );
}

const CARD_SKIN_DRAWERS = {
  badge: drawBadgeCardSkin,
  calendar: drawCalendarCardSkin,
  ticket: drawTicketCardSkin,
  compact: drawCompactCardSkin,
  ring: drawRingCardSkin,
};

// -- Freeform elements (Layout Editor "+ Text"/"+ Shape"/"+ Image") ------

function drawTextElement(ctx, rect, el, style) {
  const [x0, y0, x1, y1] = rect;
  const rectW = x1 - x0;
  const rectH = y1 - y0;
  const size = (el.fontSize || 0.03) * CANVAS_HEIGHT;
  const color = el.color || style.colors.textPrimary || "#FFFFFF";
  const font = el.fontFamily ? { family: el.fontFamily } : style.fontBody;

  ctx.font = fontString(font, size);
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  const align = el.align || "center";
  ctx.textAlign = align;
  const anchorX = align === "left" ? x0 : align === "right" ? x1 : (x0 + x1) / 2;

  const lineH = size * 1.25;
  const maxLines = Math.max(1, Math.floor(rectH / lineH));
  const lines = wrapText(ctx, el.text || "", rectW, maxLines);
  let ly = (y0 + y1) / 2 - ((lines.length - 1) * lineH) / 2;
  lines.forEach((line) => {
    ctx.fillText(line, anchorX, ly);
    ly += lineH;
  });
}

// Vertex generators for the polygon-based shape kinds, all working in the
// element's own rect (x0,y0,x1,y1) so they inherit non-uniform aspect ratios
// (a wide/short rect) the same way the existing ellipse already does via its
// independent rx/ry radii, instead of forcing a regular/undistorted shape.
function regularPolygonPoints(cx, cy, rx, ry, sides) {
  const points = [];
  for (let i = 0; i < sides; i++) {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / sides;
    points.push([cx + rx * Math.cos(angle), cy + ry * Math.sin(angle)]);
  }
  return points;
}

function starPoints(cx, cy, rx, ry, spikes, innerRatio) {
  const points = [];
  for (let i = 0; i < spikes * 2; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI) / spikes;
    const r = i % 2 === 0 ? 1 : innerRatio;
    points.push([cx + rx * r * Math.cos(angle), cy + ry * r * Math.sin(angle)]);
  }
  return points;
}

function trianglePoints(x0, y0, x1, y1) {
  return [
    [(x0 + x1) / 2, y0],
    [x1, y1],
    [x0, y1],
  ];
}

function diamondPoints(x0, y0, x1, y1) {
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  return [
    [cx, y0],
    [x1, cy],
    [cx, y1],
    [x0, cy],
  ];
}

function arrowPoints(x0, y0, x1, y1) {
  const w = x1 - x0;
  const h = y1 - y0;
  const midY = (y0 + y1) / 2;
  const shaftEnd = x0 + w * 0.6;
  return [
    [x0, midY - h * 0.2],
    [shaftEnd, midY - h * 0.2],
    [shaftEnd, midY - h * 0.5],
    [x1, midY],
    [shaftEnd, midY + h * 0.5],
    [shaftEnd, midY + h * 0.2],
    [x0, midY + h * 0.2],
  ];
}

function polygonPath(ctx, points) {
  ctx.beginPath();
  points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
}

function drawShapeElement(ctx, rect, el) {
  const [x0, y0, x1, y1] = rect;
  const fill = el.fillColor;
  const stroke = el.strokeColor;
  const strokeWidth = el.strokeWidth || 0;
  const kind = el.shapeKind;

  if (kind === "line") {
    ctx.beginPath();
    ctx.moveTo(x0, (y0 + y1) / 2);
    ctx.lineTo(x1, (y0 + y1) / 2);
    ctx.strokeStyle = stroke || fill || "#FFFFFF";
    ctx.lineWidth = strokeWidth > 0 ? strokeWidth : 4;
    ctx.stroke();
    return;
  }

  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const rx = Math.max(0, (x1 - x0) / 2);
  const ry = Math.max(0, (y1 - y0) / 2);

  if (kind === "ellipse") {
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  } else if (kind === "triangle") {
    polygonPath(ctx, trianglePoints(x0, y0, x1, y1));
  } else if (kind === "diamond") {
    polygonPath(ctx, diamondPoints(x0, y0, x1, y1));
  } else if (kind === "pentagon") {
    polygonPath(ctx, regularPolygonPoints(cx, cy, rx, ry, 5));
  } else if (kind === "hexagon") {
    polygonPath(ctx, regularPolygonPoints(cx, cy, rx, ry, 6));
  } else if (kind === "star") {
    polygonPath(ctx, starPoints(cx, cy, rx, ry, 5, 0.5));
  } else if (kind === "arrow") {
    polygonPath(ctx, arrowPoints(x0, y0, x1, y1));
  } else {
    roundedRectPath(ctx, x0, y0, x1 - x0, y1 - y0, layout.cornerRadius(el.cornerStyle, 12));
  }

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

// `elapsedSeconds` mirrors renderStreamplan's sticker-frame clock (see
// STICKER_LOOP_SECONDS below) so an animated GIF image element stays in
// sync with GIF stickers/backgrounds instead of running on its own clock.
function drawImageElement(ctx, rect, el, elapsedSeconds) {
  if (!el.imagePath) return;
  const [x0, y0, x1, y1] = rect;
  let source = null;
  if (isGifPath(el.imagePath)) {
    const gifFrame = getGifStickerFrame(el.imagePath, elapsedSeconds);
    if (gifFrame) source = gifFrame.frame;
  } else {
    source = getImage(el.imagePath);
  }
  if (!source) return;
  drawImageCover(ctx, source, x0, y0, x1 - x0, y1 - y0);
}

// A static drop shadow (Template Studio's per-element "Shadow" section) —
// distinct from animStyle:"glow"'s pulsing accent ring (drawElementGlow,
// drawn AFTER the element). Setting the canvas's native shadow properties
// here, before the element's own type-dispatch draw call below, makes every
// fill/stroke that draw call performs (panel, stripe, text…) cast the same
// shadow, the way a design tool's shadow would. A no-op when shadowColor is
// unset, so every element saved before this feature existed is unaffected.
function applyElementShadow(ctx, el) {
  if (!el.shadowColor) return;
  ctx.shadowColor = hexToRgba(el.shadowColor, el.shadowOpacity ?? 0.6);
  ctx.shadowBlur = el.shadowBlur ?? 16;
  ctx.shadowOffsetX = el.shadowOffsetX ?? 0;
  ctx.shadowOffsetY = el.shadowOffsetY ?? 8;
}

function drawCustomLayout(ctx, activeDays, profile, style, size, highlightRects, t, elapsedSeconds) {
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

    // Per-element style overrides (corner shape, accent/font) are applied
    // by shallow-cloning the template's style just for this one draw call —
    // drawDayCard/drawHeaderElement already read cornerStyle/colors.accent/
    // fontHeading/fontBody off whatever style object they're given, so no
    // signature changes were needed there; a fresh element with no
    // overrides renders byte-identical to before (effectiveStyle === style).
    const hasOverride = el.cornerStyle || el.accentColor || el.fontFamily;
    const effectiveStyle = hasOverride
      ? {
          ...style,
          cornerStyle: el.cornerStyle || style.cornerStyle,
          colors: el.accentColor ? { ...style.colors, accent: el.accentColor } : style.colors,
          fontHeading: el.fontFamily ? { family: el.fontFamily } : style.fontHeading,
          fontBody: el.fontFamily ? { family: el.fontFamily } : style.fontBody,
        }
      : style;

    ctx.save();
    ctx.globalAlpha = el.opacity ?? 1;
    if (rotation) {
      ctx.translate(cx, cy);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.translate(-cx, -cy);
    }
    applyElementAnimation(ctx, t, el);
    applyElementShadow(ctx, el);

    if (el.type === "dayCard") {
      const entry = activeByDay.get(el.id) || { day: el.id, startTime: "Day Off", endTime: null, durationMinutes: null, label: null };
      const drawSkin = CARD_SKIN_DRAWERS[el.cardStyle] || drawDayCard;
      drawSkin(ctx, entry, rect, effectiveStyle, highlightRects, el.showStripe ?? true, rotation ? { rotation, cx, cy } : null);
    } else if (el.type === "header") {
      drawHeaderElement(ctx, rect, profile, effectiveStyle, highlightRects, rotation ? { rotation, cx, cy } : null);
    } else if (el.type === "logo") {
      drawLogoElement(ctx, rect, style);
    } else if (el.type === "text") {
      drawTextElement(ctx, rect, el, effectiveStyle);
    } else if (el.type === "shape") {
      drawShapeElement(ctx, rect, el);
    } else if (el.type === "image") {
      drawImageElement(ctx, rect, el, elapsedSeconds);
    }

    drawElementGlow(ctx, t, el, rect, effectiveStyle);

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

// -- New "cosmic" layout variants (paired with the animated-template batch
// in animatedBackgrounds.js) ---------------------------------------------

function drawCascadeFlowVariant(ctx, activeDays, style, contentArea, highlightRects) {
  if (activeDays.length === 0) {
    drawEmptyState(ctx, contentArea, style);
    return;
  }
  const [x0, y0, x1, y1] = contentArea;
  const count = activeDays.length;
  const gap = 20;
  const rowH = Math.max((y1 - y0 - gap * (count - 1)) / count, 64);
  const maxIndent = (x1 - x0) * 0.22;

  activeDays.forEach((entry, i) => {
    const frac = count > 1 ? i / (count - 1) : 0;
    const indent = maxIndent * frac;
    const rowY0 = y0 + i * (rowH + gap);
    const rect = [x0 + indent, rowY0, x1, rowY0 + rowH];
    drawDayCard(ctx, entry, rect, style, highlightRects);
  });
}

function drawOrbitRingVariant(ctx, activeDays, style, contentArea, highlightRects) {
  if (activeDays.length === 0) {
    drawEmptyState(ctx, contentArea, style);
    return;
  }
  const [x0, y0, x1, y1] = contentArea;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2 - 10;
  const radius = Math.min(x1 - x0, y1 - y0) / 2 - 70;
  const startAngle = -Math.PI * 0.82;
  const endAngle = Math.PI * 0.32;
  const count = activeDays.length;
  const accent = style.colors.accent || "#FFFFFF";
  const accent2 = style.colors.accentSecondary || "#FFFFFF";
  const textPrimary = style.colors.textPrimary || "#FFFFFF";
  const textSecondary = style.colors.textSecondary || "#AAAAAA";

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, startAngle, endAngle);
  ctx.strokeStyle = hexToRgba(accent2, 0.35);
  ctx.lineWidth = 3;
  ctx.setLineDash([2, 14]);
  ctx.stroke();
  ctx.restore();

  const nodeR = 40;
  activeDays.forEach((entry, i) => {
    const frac = count > 1 ? i / (count - 1) : 0.5;
    const angle = startAngle + (endAngle - startAngle) * frac;
    const nx = cx + Math.cos(angle) * radius;
    const ny = cy + Math.sin(angle) * radius;

    ctx.beginPath();
    ctx.arc(nx, ny, nodeR, 0, Math.PI * 2);
    ctx.fillStyle = hexToRgba(accent, 0.92);
    ctx.fill();
    ctx.strokeStyle = hexToRgba(accent2, 0.6);
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = fontString(style.fontHeading, 22 * style.headingScale, "bold");
    ctx.fillStyle = "#0A0A0F";
    ctx.fillText(DAY_LABELS_SHORT[entry.day] || entry.day.slice(0, 3).toUpperCase(), nx, ny);

    let ty = ny + nodeR + 30;
    ctx.font = fontString(style.fontBody, 24 * style.bodyScale, "bold");
    ctx.fillStyle = textPrimary;
    ctx.fillText(entry.startTime, nx, ty);

    const end = endDisplay(entry);
    if (end) {
      ty += 26;
      ctx.font = fontString(style.fontBody, 16 * style.bodyScale);
      ctx.fillStyle = textSecondary;
      ctx.fillText(truncateText(ctx, end, 170), nx, ty);
    }

    if (entry.label) {
      const noteFontSize = 15 * style.bodyScale;
      const lines = wrapText(ctx, entry.label, 170, 2);
      ctx.font = fontString(style.fontBody, noteFontSize);
      ctx.fillStyle = textSecondary;
      lines.forEach((line) => {
        ty += noteFontSize * 1.2;
        ctx.fillText(line, nx, ty);
      });
    }

    highlightRects.push([nx - nodeR, ny - nodeR, nx + nodeR, ny + nodeR]);
  });
}

function drawNovaRadiateVariant(ctx, activeDays, style, contentArea, highlightRects) {
  if (activeDays.length === 0) {
    drawEmptyState(ctx, contentArea, style);
    return;
  }
  const [x0, y0, x1, y1] = contentArea;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const maxRadius = Math.min(x1 - x0, y1 - y0) / 2 - 90;
  const count = activeDays.length;
  const accent = style.colors.accent || "#FFFFFF";
  const accent2 = style.colors.accentSecondary || "#FFFFFF";
  const textPrimary = style.colors.textPrimary || "#FFFFFF";
  const textSecondary = style.colors.textSecondary || "#AAAAAA";

  ctx.save();
  const rayCount = 16;
  ctx.strokeStyle = hexToRgba(accent2, 0.12);
  ctx.lineWidth = 2;
  for (let i = 0; i < rayCount; i++) {
    const a = (i / rayCount) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * maxRadius * 1.05, cy + Math.sin(a) * maxRadius * 1.05);
    ctx.stroke();
  }
  ctx.restore();

  ctx.beginPath();
  ctx.arc(cx, cy, 54, 0, Math.PI * 2);
  ctx.fillStyle = hexToRgba(accent, 0.95);
  ctx.fill();

  const nodeR = 38;
  activeDays.forEach((entry, i) => {
    const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
    const radius = maxRadius * (i % 2 === 0 ? 1 : 0.62);
    const nx = cx + Math.cos(angle) * radius;
    const ny = cy + Math.sin(angle) * radius;

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(nx, ny);
    ctx.strokeStyle = hexToRgba(accent2, 0.4);
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(nx, ny, nodeR, 0, Math.PI * 2);
    ctx.fillStyle = hexToRgba(accent2, 0.92);
    ctx.fill();

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = fontString(style.fontHeading, 20 * style.headingScale, "bold");
    ctx.fillStyle = "#0A0A0F";
    ctx.fillText(DAY_LABELS_SHORT[entry.day] || entry.day.slice(0, 3).toUpperCase(), nx, ny);

    let ty = ny + nodeR + 28;
    ctx.font = fontString(style.fontBody, 22 * style.bodyScale, "bold");
    ctx.fillStyle = textPrimary;
    ctx.fillText(entry.startTime, nx, ty);

    const end = endDisplay(entry);
    if (end) {
      ty += 24;
      ctx.font = fontString(style.fontBody, 15 * style.bodyScale);
      ctx.fillStyle = textSecondary;
      ctx.fillText(truncateText(ctx, end, 150), nx, ty);
    }

    highlightRects.push([nx - nodeR, ny - nodeR, nx + nodeR, ny + nodeR]);
  });
}

function drawMeteorRowVariant(ctx, activeDays, style, contentArea, highlightRects) {
  if (activeDays.length === 0) {
    drawEmptyState(ctx, contentArea, style);
    return;
  }
  const [x0, y0, x1, y1] = contentArea;
  const count = activeDays.length;
  const gap = 20;
  const rowH = Math.max((y1 - y0 - gap * (count - 1)) / count, 66);
  const accent = style.colors.accent || "#FFFFFF";

  activeDays.forEach((entry, i) => {
    const rowY0 = y0 + i * (rowH + gap);
    const rowY1 = rowY0 + rowH;
    const rect = [x0, rowY0, x1, rowY1];
    const midY = (rowY0 + rowY1) / 2;

    ctx.save();
    const tailLen = 130;
    const grad = ctx.createLinearGradient(x0, midY, x0 - tailLen, midY - tailLen * 0.4);
    grad.addColorStop(0, hexToRgba(accent, 0.55));
    grad.addColorStop(1, hexToRgba(accent, 0));
    ctx.strokeStyle = grad;
    ctx.lineWidth = 10;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x0, midY);
    ctx.lineTo(x0 - tailLen, midY - tailLen * 0.4);
    ctx.stroke();
    ctx.restore();

    drawDayCard(ctx, entry, rect, style, highlightRects);
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
  cascadeFlow: drawCascadeFlowVariant,
  orbitRing: drawOrbitRingVariant,
  novaRadiate: drawNovaRadiateVariant,
  meteorRow: drawMeteorRowVariant,
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
  if (style.backgroundAnim && style.backgroundAnim !== "none") {
    drawAnimatedBackground(ctx, size, style, t);
  }

  const highlightRects = [];
  const activeDays = sortedDays(profile);

  // t !== null means we're on an animation timeline (GIF export) — sample
  // sticker/image-element frames against that same clock so motion stays in
  // sync. Otherwise (a plain static preview/export snapshot, or the Layout
  // Editor's live draft) fall back to real wall-clock time so uploaded GIFs
  // and per-element animation still visibly animate while the user is just
  // looking at / editing the plan. Hoisted above the branch below so a
  // custom layout's own image elements share this exact clock with the
  // style.customImages sticker loop further down.
  const stickerElapsedSeconds = t !== null ? t * STICKER_LOOP_SECONDS : performance.now() / 1000;

  if (style.customLayout && style.customLayout.elements?.length) {
    drawCustomLayout(ctx, activeDays, profile, style, size, highlightRects, t, stickerElapsedSeconds);
  } else {
    const headerRect = layout.computeHeaderRect(size);
    drawHeader(ctx, size, profile, style, headerRect, highlightRects);

    const contentArea = layout.computeContentArea(size, headerRect);

    const drawVariant = VARIANT_DRAWERS[style.layoutVariant] || drawListVariant;
    drawVariant(ctx, activeDays, style, contentArea, highlightRects);
  }

  (style.customImages || []).forEach((sticker) => {
    if (isGifPath(sticker.path)) {
      const gifFrame = getGifStickerFrame(sticker.path, stickerElapsedSeconds);
      if (gifFrame) layout.drawStickerImage(ctx, gifFrame.frame, gifFrame.width, gifFrame.height, sticker, size);
    } else {
      const img = getImage(sticker.path);
      if (img) layout.drawStickerImage(ctx, img, img.width, img.height, sticker, size);
    }
  });

  ctx.restore();
  return canvas;
}
