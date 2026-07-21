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
    this._fps = fps;
    this._stickerTickHandle = null;
    this._paused = false;
    onImageLoaded(() => this._renderNow());
    onGifStickerLoaded(() => this._renderNow());

    this._startStickerTicker();
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
    renderStreamplan(this.canvas, this.profile, this.style, null, [CANVAS_WIDTH, CANVAS_HEIGHT]);
  }
}
