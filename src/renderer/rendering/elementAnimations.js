// Per-element animation for the Layout Editor's freeform elements — a small
// sibling to animatedBackgrounds.js's mood system, but scoped to one
// element's own transform instead of the whole canvas. Reuses the exact
// same [0,1) phase contract (resolvePhase: real t when driven by GIF
// export, a wall-clock fallback otherwise so live preview/editing still
// animates) so both systems stay in sync and neither invents a second
// notion of "animation time."
import { resolvePhase } from "./animatedBackgrounds.js";
import { hexToRgba, roundedRectPath } from "./layout.js";

const INTENSITY_SCALE = { low: 0.5, med: 1, high: 1.8 };

// Deterministic per-element phase offset (simple string hash into [0,1))
// so multiple animated elements don't all move in lockstep.
function hashId(id) {
  let h = 0;
  const s = id || "";
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return (h % 1000) / 1000;
}

function elementPhase(t, el) {
  return (resolvePhase(t) + hashId(el.id)) % 1;
}

// Called inside drawCustomLayout's existing per-element ctx.save()/rotate()
// block, BEFORE the type dispatch — layers an extra translate/alpha
// modulation on top of whatever's already there (el.opacity, el.rotation)
// rather than replacing it. "glow" is handled separately (see
// drawElementGlow) since it draws extra pixels rather than transforming.
export function applyElementAnimation(ctx, t, el) {
  const anim = el.animStyle;
  if (!anim || anim === "none" || anim === "glow") return;
  const phase = elementPhase(t, el);
  const k = INTENSITY_SCALE[el.animIntensity] || 1;
  const wave = Math.sin(phase * Math.PI * 2);

  if (anim === "pulse") {
    ctx.globalAlpha = ctx.globalAlpha * (0.72 + ((wave + 1) / 2) * 0.28 * k);
  } else if (anim === "drift") {
    ctx.translate(wave * 10 * k, Math.cos(phase * Math.PI * 2) * 6 * k);
  } else if (anim === "bob") {
    ctx.translate(0, wave * 12 * k);
  } else if (anim === "spin") {
    ctx.rotate(phase * Math.PI * 2);
  }
}

// Scoped revival of the deleted effects.js's ring-stroke glow technique —
// scoped to just this one element's own rect (and its rotation, via the
// already-open save/rotate block this is called inside), not the old
// global highlightRects sweep across the whole canvas. Called AFTER the
// element's normal draw call so the ring sits on top, matching the
// original's visual layering.
export function drawElementGlow(ctx, t, el, rect, style) {
  if (el.animStyle !== "glow") return;
  const phase = elementPhase(t, el);
  const k = Math.min(1.6, INTENSITY_SCALE[el.animIntensity] || 1);
  const pulse = (Math.sin(phase * Math.PI * 2) + 1) / 2;
  const alpha = (0.25 + pulse * 0.35) * k;
  const glowColor = el.accentColor || style?.colors?.accent || "#FFFFFF";
  const [x0, y0, x1, y1] = rect;

  ctx.save();
  // Reset offset explicitly: an element can carry BOTH this glow ring and a
  // Template Studio drop shadow (applyElementShadow, renderer.js) at once —
  // without this, the ring would inherit that shadow's offsetX/Y and drift
  // off-center instead of staying centered on the element.
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.shadowColor = hexToRgba(glowColor, alpha);
  ctx.shadowBlur = 28 * k;
  ctx.strokeStyle = hexToRgba(glowColor, alpha);
  ctx.lineWidth = 4;
  roundedRectPath(ctx, x0 - 6, y0 - 6, x1 - x0 + 12, y1 - y0 + 12, 18);
  ctx.stroke();
  ctx.restore();
}
