import { CANVAS_WIDTH, CANVAS_HEIGHT, PREVIEW_DEBOUNCE_MS, DEFAULT_PREVIEW_FPS } from "../../shared/constants.js";
import { renderStreamplan } from "../rendering/renderer.js";
import { onImageLoaded } from "../rendering/assetImages.js";
import { isGifPath, onGifStickerLoaded } from "../rendering/gifSticker.js";

export class PreviewCanvas {
  constructor(canvasEl, fps = DEFAULT_PREVIEW_FPS) {
    this.canvas = canvasEl;
    this.profile = null;
    this.style = null;
    this._debounceHandle = null;
    this._animating = false;
    this._t = 0;
    this._animHandle = null;
    this._fps = fps;
    this._stickerTickHandle = null;
    this._paused = false;
    onImageLoaded(() => this._renderNow());
    onGifStickerLoaded(() => this._renderNow());

    this._startStickerTicker();
  }

  // Uploaded GIF stickers should visibly animate even when the glow/shimmer
  // preview toggle is off, so a separate lightweight ticker keeps sampling
  // real time and redrawing whenever the current style actually has one —
  // it's a no-op the rest of the time, and skipped entirely while the glow
  // loop is already re-rendering every frame anyway.
  _startStickerTicker() {
    if (this._stickerTickHandle) clearInterval(this._stickerTickHandle);
    if (this._paused) return;
    this._stickerTickHandle = setInterval(() => {
      if (this._animating) return;
      if ((this.style?.customImages || []).some((img) => isGifPath(img.path))) this._renderNow();
    }, 1000 / this._fps);
  }

  setFps(fps) {
    this._fps = fps;
    this._startStickerTicker();
    if (this._animating && !this._paused) this.setAnimating(true);
  }

  // Called when the app window is minimized: stops the animation-loop and
  // sticker-ticker intervals entirely (rather than just visually hiding
  // them) so a minimized window burns effectively no CPU/GPU on preview
  // redraws. resume() restores whatever animation state is currently
  // desired (setAnimating keeps `_animating` up to date even while paused).
  pause() {
    if (this._paused) return;
    this._paused = true;
    clearInterval(this._animHandle);
    clearInterval(this._stickerTickHandle);
  }

  resume() {
    if (!this._paused) return;
    this._paused = false;
    this._startStickerTicker();
    if (this._animating) this.setAnimating(true);
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

  setAnimating(enabled) {
    this._animating = enabled;
    clearInterval(this._animHandle);
    if (this._paused) return;
    if (enabled) {
      this._animHandle = setInterval(() => {
        this._t = (this._t + 1 / (this._fps * 2.4)) % 1;
        this._renderNow();
      }, 1000 / this._fps);
    } else {
      this._t = 0;
      this._renderNow();
    }
  }

  isAnimating() {
    return this._animating;
  }

  _renderNow() {
    if (!this.profile || !this.style) return;
    const t = this._animating ? this._t : null;
    renderStreamplan(this.canvas, this.profile, this.style, t, [CANVAS_WIDTH, CANVAS_HEIGHT]);
  }
}
