import { GIFEncoder, quantize, applyPalette } from "../../../node_modules/gifenc/dist/gifenc.esm.js";
import { renderStreamplan } from "../rendering/renderer.js";
import { EXPORT_RESOLUTIONS, DEFAULT_EXPORT_RESOLUTION, GIF_FRAME_COUNT, GIF_FRAME_DELAY_MS } from "../../shared/constants.js";

// GIFs render at half the chosen export resolution — full 4K-tier frames
// would make color quantization noticeably slower and balloon file size for
// a format that's already lossy-by-palette, and this loop is deliberately
// synchronous (see below) so it needs to stay fast at every tier.
const GIF_SCALE = 0.5;

// Deliberately synchronous (no per-frame setTimeout/rAF yield): Chromium
// throttles those timers heavily on backgrounded/occluded windows, which
// previously made this take 10s+ instead of ~2s. The whole loop is fast
// enough (~2s at 24 frames) to run as one blocking call from the Export click.
export function exportGifBytes(profile, style, resolution = EXPORT_RESOLUTIONS[DEFAULT_EXPORT_RESOLUTION], onProgress) {
  const gifWidth = Math.round(resolution[0] * GIF_SCALE);
  const gifHeight = Math.round(resolution[1] * GIF_SCALE);
  const canvas = document.createElement("canvas");
  const gif = GIFEncoder();

  for (let i = 0; i < GIF_FRAME_COUNT; i++) {
    const t = i / GIF_FRAME_COUNT;
    renderStreamplan(canvas, profile, style, t, [gifWidth, gifHeight]);

    const ctx = canvas.getContext("2d");
    const { data } = ctx.getImageData(0, 0, gifWidth, gifHeight);
    const palette = quantize(data, 256);
    const index = applyPalette(data, palette);
    gif.writeFrame(index, gifWidth, gifHeight, { palette, delay: GIF_FRAME_DELAY_MS });

    if (onProgress) onProgress((i + 1) / GIF_FRAME_COUNT);
  }

  gif.finish();
  return gif.bytes();
}
