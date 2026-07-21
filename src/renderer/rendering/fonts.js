// Custom font registration via the FontFace API, shared by the live preview
// and every export path (all draw through the same canvas font strings).

let customFontCounter = 0;
const registeredByPath = new Map(); // path -> family name

export async function registerCustomFont(path, arrayBuffer) {
  if (registeredByPath.has(path)) {
    return registeredByPath.get(path);
  }
  const family = `StreamplanCustom${++customFontCounter}`;
  const fontFace = new FontFace(family, arrayBuffer);
  await fontFace.load();
  document.fonts.add(fontFace);
  registeredByPath.set(path, family);
  return family;
}

export function fontString(fontSpec, size, weight = "normal") {
  const family = (fontSpec && fontSpec.family) || "Segoe UI";
  return `${weight} ${size}px "${family}"`;
}
