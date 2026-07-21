// Loads user-referenced asset files (background image, logo) into <img>
// elements via Blob URLs (not file:// URLs) so the canvas is never
// cross-origin "tainted" and toDataURL()/getImageData() keep working for export.

const cache = new Map(); // path -> { img, loaded, objectUrl }
const listeners = new Set();

function mimeFor(path) {
  const ext = path.split(".").pop().toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "application/octet-stream";
}

export function getImage(path) {
  if (!path) return null;
  const entry = cache.get(path);
  if (entry) return entry.loaded ? entry.img : null;

  const placeholder = { img: new Image(), loaded: false, objectUrl: null };
  cache.set(path, placeholder);
  loadImage(path, placeholder);
  return null;
}

async function loadImage(path, entry) {
  try {
    const bytes = await window.streamplanAPI.readFile(path);
    const blob = new Blob([bytes], { type: mimeFor(path) });
    const url = URL.createObjectURL(blob);
    entry.objectUrl = url;
    await new Promise((resolve, reject) => {
      entry.img.onload = resolve;
      entry.img.onerror = reject;
      entry.img.src = url;
    });
    entry.loaded = true;
    listeners.forEach((cb) => cb(path));
  } catch (err) {
    console.error("Failed to load asset image", path, err);
  }
}

export function onImageLoaded(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export function invalidate(path) {
  const entry = cache.get(path);
  if (entry?.objectUrl) URL.revokeObjectURL(entry.objectUrl);
  cache.delete(path);
}
