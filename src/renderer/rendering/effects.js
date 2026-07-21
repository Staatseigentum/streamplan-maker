// Glow/shimmer animation overlay, driven purely by t in [0, 1) so looping is
// seamless. Used only for the animated GIF export (and an optional
// live-animated preview); static exports call with t=null and skip this.
import { hexToRgba, roundedRectPath } from "./layout.js";

export function applyGlow(ctx, size, style, highlightRects, t) {
  const [w, h] = size;
  const glowColor = style.colors.glow || style.colors.accent || "#FFFFFF";

  const pulse = (Math.sin(2 * Math.PI * t) + 1) / 2; // seamless: sin(0) === sin(2*pi)
  const alpha = 0.2 + pulse * 0.35;

  ctx.save();
  ctx.shadowColor = hexToRgba(glowColor, alpha);
  ctx.shadowBlur = 28;
  ctx.strokeStyle = hexToRgba(glowColor, alpha);
  ctx.lineWidth = 4;
  for (const entry of highlightRects) {
    // Plain [x0,y0,x1,y1] arrays (every built-in layout variant, forever)
    // stroke directly. Rotated custom-layout elements instead push
    // {rect, rotation, cx, cy} so the glow ring can be rotated to match —
    // otherwise it would highlight the pre-rotation axis-aligned box, which
    // no longer matches where the card visually ended up on screen.
    if (Array.isArray(entry)) {
      const [x0, y0, x1, y1] = entry;
      roundedRectPath(ctx, x0 - 5, y0 - 5, x1 - x0 + 10, y1 - y0 + 10, 18);
      ctx.stroke();
    } else {
      const { rect, rotation, cx, cy } = entry;
      const [x0, y0, x1, y1] = rect;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.translate(-cx, -cy);
      roundedRectPath(ctx, x0 - 5, y0 - 5, x1 - x0 + 10, y1 - y0 + 10, 18);
      ctx.stroke();
      ctx.restore();
    }
  }
  ctx.restore();

  const bandW = w * 0.35;
  const travel = w + bandW;
  const xPos = t * travel - bandW / 2;

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.translate(xPos, h / 2);
  ctx.rotate((16 * Math.PI) / 180);
  const grad = ctx.createLinearGradient(-bandW / 2, 0, bandW / 2, 0);
  grad.addColorStop(0, hexToRgba(glowColor, 0));
  grad.addColorStop(0.5, hexToRgba(glowColor, 0.3));
  grad.addColorStop(1, hexToRgba(glowColor, 0));
  ctx.fillStyle = grad;
  ctx.fillRect(-bandW / 2, -h * 1.5, bandW, h * 3);
  ctx.restore();
}
