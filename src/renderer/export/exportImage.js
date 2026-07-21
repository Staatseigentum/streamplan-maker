function canvasToBlob(canvas, mime, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, mime, quality));
}

export async function exportPngBytes(canvas) {
  const blob = await canvasToBlob(canvas, "image/png");
  return new Uint8Array(await blob.arrayBuffer());
}

export async function exportJpgBytes(canvas) {
  // The renderer always fills the entire canvas (solid/gradient/image
  // background), so there is no transparency to flatten before JPEG export.
  const blob = await canvasToBlob(canvas, "image/jpeg", 0.95);
  return new Uint8Array(await blob.arrayBuffer());
}
