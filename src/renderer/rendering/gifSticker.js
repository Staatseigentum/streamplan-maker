// Animated-GIF sticker support, backed by the browser's native ImageDecoder
// (WebCodecs) API instead of a hand-rolled GIF parser — Electron's Chromium
// ships it, and it handles GIF frame disposal/compositing per-spec for us.
// Frames are decoded once per path and cached as VideoFrames, then picked by
// elapsed time so both the live preview and every export can sample "what
// the sticker looks like at time t" instead of being stuck on frame 0.
const cache = new Map(); // path -> { loaded, error, frames: [{ frame, durationSeconds }], totalDurationSeconds }
const listeners = new Set();

export function isGifPath(path) {
  return /\.gif$/i.test(path || "");
}

export function onGifStickerLoaded(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

async function loadGifSticker(path) {
  const entry = { loaded: false, error: false, frames: [], totalDurationSeconds: 0 };
  cache.set(path, entry);
  try {
    const bytes = await window.streamplanAPI.readFile(path);
    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const decoder = new ImageDecoder({ data: arrayBuffer, type: "image/gif" });
    await decoder.tracks.ready;
    const track = decoder.tracks.selectedTrack;
    await decoder.completed;
    const frameCount = Math.max(1, track.frameCount);

    let total = 0;
    for (let i = 0; i < frameCount; i++) {
      const result = await decoder.decode({ frameIndex: i });
      const durationSeconds = (result.image.duration || 100000) / 1_000_000;
      total += durationSeconds;
      entry.frames.push({ frame: result.image, durationSeconds });
    }
    entry.totalDurationSeconds = total || 1;
    entry.loaded = true;
  } catch (err) {
    console.error("Failed to decode GIF sticker", path, err);
    entry.error = true;
  }
  listeners.forEach((cb) => cb(path));
}

// Returns { frame, width, height } for whichever frame is "current" at
// elapsedSeconds (looped over the GIF's own duration), or null while the
// GIF is still decoding / failed to load.
export function getGifStickerFrame(path, elapsedSeconds) {
  if (!path) return null;
  let entry = cache.get(path);
  if (!entry) {
    loadGifSticker(path);
    return null;
  }
  if (!entry.loaded || entry.error || entry.frames.length === 0) return null;

  const t = ((elapsedSeconds % entry.totalDurationSeconds) + entry.totalDurationSeconds) % entry.totalDurationSeconds;
  let acc = 0;
  for (const f of entry.frames) {
    acc += f.durationSeconds;
    if (t < acc) return { frame: f.frame, width: f.frame.displayWidth, height: f.frame.displayHeight };
  }
  const last = entry.frames[entry.frames.length - 1];
  return { frame: last.frame, width: last.frame.displayWidth, height: last.frame.displayHeight };
}

export function isGifStickerReady(path) {
  const entry = cache.get(path);
  return !!entry && (entry.loaded || entry.error);
}

// Kicks off decoding (if not already started/cached) and resolves once it
// settles, so exports can await readiness once up front instead of racing
// the async decode inside their tight, intentionally-synchronous frame loop.
export function ensureGifStickerLoaded(path) {
  if (!path) return Promise.resolve();
  const entry = cache.get(path);
  if (entry && (entry.loaded || entry.error)) return Promise.resolve();
  return new Promise((resolve) => {
    const off = onGifStickerLoaded((loadedPath) => {
      if (loadedPath === path) {
        off();
        resolve();
      }
    });
    if (!cache.has(path)) loadGifSticker(path);
  });
}

// Awaits every GIF sticker referenced by a style, so an export triggered
// right after upload doesn't race the (usually already-finished) decode.
export function ensureAllStickersLoaded(style) {
  const paths = (style?.customImages || []).map((img) => img.path).filter(isGifPath);
  return Promise.all(paths.map(ensureGifStickerLoaded));
}

export function invalidateGifSticker(path) {
  const entry = cache.get(path);
  if (entry) {
    entry.frames.forEach((f) => {
      try {
        f.frame.close();
      } catch {
        // already closed
      }
    });
  }
  cache.delete(path);
}
