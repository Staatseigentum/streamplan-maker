// Cosmic animated backgrounds for streamplan templates — drawn directly onto
// the export canvas (unlike the app chrome's CSS-only "Galaxy Veil" theme in
// appThemes.css, which this is visually inspired by) so the motion shows up
// identically in the live preview, every static export, and the animated GIF
// export. `t` loops seamlessly in [0, 1) — GIF export drives it directly
// (one full loop per exported GIF); a null t (static export, or an idle
// preview redraw) falls back to a wall-clock-derived phase, the same
// fallback pattern already used for GIF sticker frames in renderer.js.
import { hexToRgba } from "./layout.js";

export const BACKGROUND_ANIM_VALUES = ["none", "nebulaDrift", "aurora", "starfield", "novaPulse", "meteorShower"];

const WALL_CLOCK_LOOP_SECONDS = 6;

// Deterministic pseudo-random generator (mulberry32) — star/particle layouts
// must stay fixed across renders. Real Math.random() would reshuffle their
// positions on every redraw instead of letting them drift smoothly.
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function makePoints(count, seed) {
  const rand = mulberry32(seed);
  const points = [];
  for (let i = 0; i < count; i++) {
    points.push({ x: rand(), y: rand(), r: 1 + rand() * 2.4, phase: rand(), speed: 0.6 + rand() * 0.9 });
  }
  return points;
}

const STARS = makePoints(110, 1337);
const EMBERS = makePoints(26, 4242);
const METEORS = makePoints(6, 777);

export function resolvePhase(t) {
  if (t !== null) return t;
  return (performance.now() / 1000 / WALL_CLOCK_LOOP_SECONDS) % 1;
}

function drawStars(ctx, w, h, phase, color, { count = STARS.length, alphaBase = 0.15, alphaRange = 0.75 } = {}) {
  ctx.save();
  for (let i = 0; i < count; i++) {
    const s = STARS[i];
    const tw = (Math.sin((phase + s.phase) * Math.PI * 2 * s.speed) + 1) / 2;
    ctx.globalAlpha = alphaBase + tw * alphaRange;
    ctx.beginPath();
    ctx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }
  ctx.restore();
}

function nebulaDrift(ctx, [w, h], style, phase) {
  const accent = style.colors.accent || "#7b5fd9";
  const accent2 = style.colors.accentSecondary || "#b98bff";
  const driftX = Math.sin(phase * Math.PI * 2) * w * 0.05;
  const driftY = Math.cos(phase * Math.PI * 2) * h * 0.035;

  ctx.save();
  const g1x = w * 0.25 + driftX;
  const g1y = h * 0.28 + driftY;
  const g1 = ctx.createRadialGradient(g1x, g1y, 0, g1x, g1y, w * 0.55);
  g1.addColorStop(0, hexToRgba(accent, 0.32));
  g1.addColorStop(1, hexToRgba(accent, 0));
  ctx.fillStyle = g1;
  ctx.fillRect(0, 0, w, h);

  const g2x = w * 0.78 - driftX;
  const g2y = h * 0.72 - driftY;
  const g2 = ctx.createRadialGradient(g2x, g2y, 0, g2x, g2y, w * 0.5);
  g2.addColorStop(0, hexToRgba(accent2, 0.28));
  g2.addColorStop(1, hexToRgba(accent2, 0));
  ctx.fillStyle = g2;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();

  drawStars(ctx, w, h, phase, style.colors.textPrimary || "#FFFFFF", { count: 70 });

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  for (let i = 0; i < 3; i++) {
    const local = (phase + i / 3) % 1;
    const fade = Math.min(1, Math.min(local, 1 - local) * 6);
    const cx = -0.2 * w + local * 1.4 * w;
    const cy = h * (0.12 + i * 0.32) + local * h * 0.22;
    const len = 150;
    const grad = ctx.createLinearGradient(cx, cy, cx - len, cy - len * 0.35);
    grad.addColorStop(0, hexToRgba(accent2, 0.85 * fade));
    grad.addColorStop(1, hexToRgba(accent2, 0));
    ctx.strokeStyle = grad;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx - len, cy - len * 0.35);
    ctx.stroke();
  }
  ctx.restore();
}

function aurora(ctx, [w, h], style, phase) {
  const accent = style.colors.accent || "#4FFFD1";
  const accent2 = style.colors.accentSecondary || "#A78BFA";
  const glow = style.colors.glow || accent;

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  const bandCount = 3;
  for (let i = 0; i < bandCount; i++) {
    const localPhase = (phase + i / bandCount) % 1;
    const yCenter = h * (0.2 + i * 0.3) + Math.sin(localPhase * Math.PI * 2) * h * 0.06;
    const xShift = Math.sin((phase + i * 0.3) * Math.PI * 2) * w * 0.15;
    const colors = [accent, glow, accent2];
    const grad = ctx.createLinearGradient(0, yCenter - h * 0.22, w, yCenter + h * 0.22);
    grad.addColorStop(0, hexToRgba(colors[i % colors.length], 0));
    grad.addColorStop(0.5, hexToRgba(colors[i % colors.length], 0.28));
    grad.addColorStop(1, hexToRgba(colors[i % colors.length], 0));
    ctx.save();
    ctx.translate(xShift, 0);
    ctx.fillStyle = grad;
    ctx.fillRect(-w * 0.2, yCenter - h * 0.22, w * 1.4, h * 0.44);
    ctx.restore();
  }
  ctx.restore();

  drawStars(ctx, w, h, phase, style.colors.textPrimary || "#FFFFFF", { count: 40, alphaBase: 0.1, alphaRange: 0.4 });
}

function starfield(ctx, [w, h], style, phase) {
  drawStars(ctx, w, h, phase, style.colors.textPrimary || "#FFFFFF", { count: STARS.length });
}

function novaPulse(ctx, [w, h], style, phase) {
  const accent = style.colors.accent || "#FF7A3D";
  const accent2 = style.colors.accentSecondary || "#FFD166";
  const cx = w / 2;
  const cy = h * 0.42;
  const pulse = (Math.sin(phase * Math.PI * 2) + 1) / 2;

  ctx.save();
  const r = w * (0.35 + pulse * 0.12);
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  grad.addColorStop(0, hexToRgba(accent2, 0.32 + pulse * 0.12));
  grad.addColorStop(0.6, hexToRgba(accent, 0.14));
  grad.addColorStop(1, hexToRgba(accent, 0));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();

  ctx.save();
  EMBERS.forEach((e) => {
    const local = (phase + e.phase) % 1;
    const dist = local * Math.max(w, h) * 0.6;
    const angle = e.x * Math.PI * 2;
    const ex = cx + Math.cos(angle) * dist;
    const ey = cy + Math.sin(angle) * dist * 0.85;
    const fade = 1 - local;
    ctx.globalAlpha = Math.max(0, fade * 0.8);
    ctx.beginPath();
    ctx.arc(ex, ey, e.r, 0, Math.PI * 2);
    ctx.fillStyle = accent2;
    ctx.fill();
  });
  ctx.restore();
}

function meteorShower(ctx, [w, h], style, phase) {
  const accent = style.colors.accent || "#6FE3FF";
  drawStars(ctx, w, h, phase, style.colors.textPrimary || "#FFFFFF", { count: 60, alphaBase: 0.1, alphaRange: 0.45 });

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  METEORS.forEach((m) => {
    const local = (phase * m.speed + m.phase) % 1;
    const fade = Math.min(1, Math.min(local, 1 - local) * 5);
    const startX = m.x * w * 1.3 - w * 0.15;
    const startY = -h * 0.1;
    const endX = startX - w * 0.45;
    const endY = h * 1.1;
    const cx = startX + (endX - startX) * local;
    const cy = startY + (endY - startY) * local;
    const len = 90;
    const dx = endX - startX;
    const dy = endY - startY;
    const mag = Math.hypot(dx, dy) || 1;
    const tailX = cx - (dx / mag) * len;
    const tailY = cy - (dy / mag) * len;

    const grad = ctx.createLinearGradient(cx, cy, tailX, tailY);
    grad.addColorStop(0, hexToRgba(accent, 0.9 * fade));
    grad.addColorStop(1, hexToRgba(accent, 0));
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(tailX, tailY);
    ctx.stroke();
  });
  ctx.restore();
}

const MOODS = { nebulaDrift, aurora, starfield, novaPulse, meteorShower };

export function drawAnimatedBackground(ctx, size, style, t) {
  const mood = MOODS[style.backgroundAnim];
  if (!mood) return;
  mood(ctx, size, style, resolvePhase(t));
}
