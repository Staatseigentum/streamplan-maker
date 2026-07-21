import { exportPngBytes, exportJpgBytes } from "../export/exportImage.js";
import { exportPdfBytes } from "../export/exportPdf.js";
import { exportGifBytes } from "../export/exportGif.js";
import { EXPORT_RESOLUTIONS, DEFAULT_EXPORT_RESOLUTION } from "../../shared/constants.js";
import { renderStreamplan } from "../rendering/renderer.js";
import { ensureAllStickersLoaded } from "../rendering/gifSticker.js";

const FORMAT_META = {
  png: { label: "PNG Image", ext: "png" },
  jpg: { label: "JPG Image", ext: "jpg" },
  pdf: { label: "PDF Document", ext: "pdf" },
  gif: { label: "Animated GIF", ext: "gif" },
};

const RESOLUTION_LABELS = {
  "1080p": "1080p",
  "2k": "2K",
  "4k": "4K",
};

function sanitizeFilename(name) {
  const cleaned = (name || "").trim().replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, "_");
  return cleaned || "streamplan";
}

export function buildExportBar(container, setStatus, { getProfile, getStyle }) {
  const select = document.createElement("select");
  select.id = "exportFormatSelect";
  Object.entries(FORMAT_META).forEach(([value, meta]) => {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = meta.label;
    select.appendChild(opt);
  });

  const resolutionSelect = document.createElement("select");
  resolutionSelect.id = "exportResolutionSelect";
  resolutionSelect.title = "Export resolution";
  Object.keys(EXPORT_RESOLUTIONS).forEach((key) => {
    const [w, h] = EXPORT_RESOLUTIONS[key];
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = `${RESOLUTION_LABELS[key] || key} (${w}×${h})`;
    resolutionSelect.appendChild(opt);
  });
  resolutionSelect.value = DEFAULT_EXPORT_RESOLUTION;

  const button = document.createElement("button");
  button.className = "primary";
  button.textContent = "Export Plan";
  button.id = "exportButton";

  container.append(select, resolutionSelect, button);

  button.addEventListener("click", async () => {
    const format = select.value;
    const meta = FORMAT_META[format];
    const resolution = EXPORT_RESOLUTIONS[resolutionSelect.value] || EXPORT_RESOLUTIONS[DEFAULT_EXPORT_RESOLUTION];
    const profile = getProfile();
    const style = getStyle();
    const defaultName = `${sanitizeFilename(profile.displayName)}_streamplan.${meta.ext}`;

    let path;
    try {
      path = await window.streamplanAPI.chooseSaveExportPath(defaultName, format);
    } catch (err) {
      setStatus(`Could not open the save dialog: ${err.message}`, "error");
      return;
    }
    if (!path) return;

    button.disabled = true;
    setStatus(`Exporting ${meta.label}…`);
    try {
      await ensureAllStickersLoaded(style);
      let bytes;
      if (format === "gif") {
        bytes = await exportGifBytes(profile, style, resolution, (progress) => {
          setStatus(`Exporting ${meta.label}… ${Math.round(progress * 100)}%`);
        });
      } else {
        const canvas = document.createElement("canvas");
        renderStreamplan(canvas, profile, style, null, resolution);
        if (format === "png") bytes = await exportPngBytes(canvas);
        else if (format === "jpg") bytes = await exportJpgBytes(canvas);
        else bytes = exportPdfBytes(canvas);
      }
      await window.streamplanAPI.writeFile(path, bytes);
      setStatus(`Saved to ${path}`, "success");
    } catch (err) {
      console.error(err);
      setStatus(`Export failed: ${err.message}`, "error");
    } finally {
      button.disabled = false;
    }
  });
}
