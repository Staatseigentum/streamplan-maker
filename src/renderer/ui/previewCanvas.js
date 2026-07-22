import { CANVAS_WIDTH, CANVAS_HEIGHT, PREVIEW_DEBOUNCE_MS, DEFAULT_PREVIEW_FPS } from "../../shared/constants.js";
import { renderStreamplan } from "../rendering/renderer.js";
import { onImageLoaded } from "../rendering/assetImages.js";
import { isGifPath, onGifStickerLoaded } from "../rendering/gifSticker.js";

export class PreviewCanvas {
  // onStickerDrag: called (no args) after a drag mutates style.customImages
  // in place — mirrors stylePanel.js's onStyleChange callback shape exactly,
  // so app.js can touch()/refreshPreview()/scheduleAutosave() the same way
  // it already does for the Customize tab's position sliders (this is just
  // a second, on-canvas way to edit the same x/y fields).
  constructor(canvasEl, fps = DEFAULT_PREVIEW_FPS, { onStickerDrag } = {}) {
    this.canvas = canvasEl;
    this.profile = null;
    this.style = null;
    this._debounceHandle = null;
    this._fps = fps;
    this._stickerTickHandle = null;
    this._paused = false;
    this._onStickerDrag = onStickerDrag || (() => {});
    this._stickerHitRects = [];
    this._drag = null;
    onImageLoaded(() => this._renderNow());
    onGifStickerLoaded(() => this._renderNow());

    this._startStickerTicker();
    this._setupStickerDrag();
  }

  // Converts a pointer event's client coordinates into the renderer's fixed
  // internal 1400x1750 pixel space — matching the space _stickerHitRects and
  // sticker.x/y (as fractions of CANVAS_WIDTH/HEIGHT) are defined in,
  // regardless of how large the canvas is actually displayed on screen. Same
  // (clientX - rect.left) / rect.width idiom used by layoutEditor.js /
  // templateStudio.js for their own drag handling.
  _pointerToCanvasPx(e) {
    const rect = this.canvas.getBoundingClientRect();
    return [((e.clientX - rect.left) / rect.width) * CANVAS_WIDTH, ((e.clientY - rect.top) / rect.height) * CANVAS_HEIGHT];
  }

  _stickerAtPoint(px, py) {
    for (let i = this._stickerHitRects.length - 1; i >= 0; i--) {
      const { id, rect } = this._stickerHitRects[i];
      if (px >= rect[0] && px <= rect[2] && py >= rect[1] && py <= rect[3]) return id;
    }
    return null;
  }

  _setupStickerDrag() {
    this.canvas.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      const [px, py] = this._pointerToCanvasPx(e);
      const id = this._stickerAtPoint(px, py);
      if (!id) return;
      const sticker = (this.style?.customImages || []).find((img) => img.id === id);
      if (!sticker) return;
      e.preventDefault();
      this.canvas.setPointerCapture(e.pointerId);
      this._drag = { id, startPx: px, startPy: py, startX: sticker.x ?? 0.5, startY: sticker.y ?? 0.5 };
      this.canvas.classList.add("sticker-dragging");
    });

    this.canvas.addEventListener("pointermove", (e) => {
      if (this._drag) {
        const sticker = (this.style?.customImages || []).find((img) => img.id === this._drag.id);
        if (!sticker) return;
        const [px, py] = this._pointerToCanvasPx(e);
        const clamp01 = (v) => Math.min(1, Math.max(0, v));
        sticker.x = clamp01(this._drag.startX + (px - this._drag.startPx) / CANVAS_WIDTH);
        sticker.y = clamp01(this._drag.startY + (py - this._drag.startPy) / CANVAS_HEIGHT);
        this._onStickerDrag();
        return;
      }
      const [px, py] = this._pointerToCanvasPx(e);
      this.canvas.classList.toggle("sticker-hover", !!this._stickerAtPoint(px, py));
    });

    const endDrag = () => {
      if (!this._drag) return;
      this._drag = null;
      this.canvas.classList.remove("sticker-dragging");
    };
    this.canvas.addEventListener("pointerup", endDrag);
    this.canvas.addEventListener("pointercancel", endDrag);
    this.canvas.addEventListener("pointerleave", () => this.canvas.classList.remove("sticker-hover"));
  }

  // Uploaded GIF stickers and animated template backgrounds should visibly
  // animate in the live preview — this lightweight ticker samples real time
  // and redraws whenever the current style actually has one of those; it's a
  // no-op the rest of the time.
  _startStickerTicker() {
    if (this._stickerTickHandle) clearInterval(this._stickerTickHandle);
    if (this._paused) return;
    this._stickerTickHandle = setInterval(() => {
      const hasGifSticker = (this.style?.customImages || []).some((img) => isGifPath(img.path));
      const hasAnimatedBg = this.style?.backgroundAnim && this.style.backgroundAnim !== "none";
      const hasAnimatedElements = (this.style?.customLayout?.elements || []).some(
        (el) => el.animStyle && el.animStyle !== "none"
      );
      if (hasGifSticker || hasAnimatedBg || hasAnimatedElements) this._renderNow();
    }, 1000 / this._fps);
  }

  setFps(fps) {
    this._fps = fps;
    this._startStickerTicker();
  }

  // Called when the app window is minimized: stops the sticker-ticker
  // interval entirely (rather than just visually hiding it) so a minimized
  // window burns effectively no CPU/GPU on preview redraws.
  pause() {
    if (this._paused) return;
    this._paused = true;
    clearInterval(this._stickerTickHandle);
  }

  resume() {
    if (!this._paused) return;
    this._paused = false;
    this._startStickerTicker();
  }

  setData(profile, style) {
    this.profile = profile;
    this.style = style;
    if (this._debounceHandle) clearTimeout(this._debounceHandle);
    this._debounceHandle = setTimeout(() => this._renderNow(), PREVIEW_DEBOUNCE_MS);
  }

  setDataImmediate(profile, style) {
    this.profile = profile;
    this.style = style;
    if (this._debounceHandle) clearTimeout(this._debounceHandle);
    this._renderNow();
  }

  renderNowSync() {
    if (this._debounceHandle) clearTimeout(this._debounceHandle);
    this._renderNow();
  }

  _renderNow() {
    if (!this.profile || !this.style) return;
    this._stickerHitRects = [];
    renderStreamplan(this.canvas, this.profile, this.style, null, [CANVAS_WIDTH, CANVAS_HEIGHT], this._stickerHitRects);
  }
}
