// jsPDF is loaded as a classic UMD <script> in index.html (window.jspdf.jsPDF)
// because its ESM build has unresolvable bare-specifier imports and we have
// no bundler/import-map to resolve them.

export function exportPdfBytes(canvas) {
  const { jsPDF } = window.jspdf;
  // Embed as JPEG, not PNG: jsPDF's PNG path stores raw uncompressed pixels
  // (a 1400x1750 canvas balloons to ~10MB), while JPEG reuses the encoded
  // DCT stream directly and stays close to the JPEG's own file size. The
  // canvas has no transparency (renderer always fills the full background),
  // so JPEG's lack of alpha is not a loss here.
  const imgData = canvas.toDataURL("image/jpeg", 0.95);
  const pdf = new jsPDF({
    orientation: canvas.width >= canvas.height ? "landscape" : "portrait",
    unit: "px",
    format: [canvas.width, canvas.height],
  });
  pdf.addImage(imgData, "JPEG", 0, 0, canvas.width, canvas.height);
  return new Uint8Array(pdf.output("arraybuffer"));
}
