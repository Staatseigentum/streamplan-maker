// .stplan project files are a zip archive (JSZip, loaded as a classic UMD
// <script> for the same bare-import reasons as jsPDF) containing project.json
// plus an assets/ folder with copied-in background/logo/font files, so a
// saved project is a single portable file.
import { projectToDict, projectFromDict } from "../models/project.js";
import { addCustomFontToLibrary } from "../rendering/fontLibrary.js";

function extOf(p) {
  const m = /\.[a-zA-Z0-9]+$/.exec(p || "");
  return m ? m[0] : "";
}

async function addAssetToZip(zip, absPath, zipBaseName) {
  if (!absPath) return null;
  const bytes = await window.streamplanAPI.readFile(absPath);
  const zipPath = `assets/${zipBaseName}${extOf(absPath)}`;
  zip.file(zipPath, bytes);
  return zipPath;
}

export async function buildProjectZipBytes(doc) {
  const zip = new window.JSZip();
  const dict = projectToDict(doc);
  const style = doc.style;

  const bgRel = await addAssetToZip(zip, style.backgroundImagePath, "background");
  dict.style.background_image_path = bgRel;

  const logoRel = await addAssetToZip(zip, style.logoPath, "logo");
  dict.style.logo_path = logoRel;

  const headingRel = await addAssetToZip(zip, style.fontHeading.path, "font_heading");
  if (headingRel) dict.style.font_heading.path = headingRel;

  const bodyRel = await addAssetToZip(zip, style.fontBody.path, "font_body");
  if (bodyRel) dict.style.font_body.path = bodyRel;

  const stickers = style.customImages || [];
  dict.style.custom_images = await Promise.all(
    stickers.map(async (sticker, i) => {
      const rel = await addAssetToZip(zip, sticker.path, `sticker_${i}`);
      return { ...sticker, path: rel };
    })
  );

  const dayEntries = dict.profile.days || [];
  dict.profile.days = await Promise.all(
    dayEntries.map(async (d, i) => {
      const rel = await addAssetToZip(zip, d.image_path, `day_image_${i}`);
      return { ...d, image_path: rel };
    })
  );

  zip.file("project.json", JSON.stringify(dict, null, 2));
  return zip.generateAsync({ type: "uint8array" });
}

async function extractAssetToTemp(zip, relPath) {
  if (!relPath || !relPath.startsWith("assets/")) return { path: null, bytes: null };
  const file = zip.file(relPath);
  if (!file) return { path: null, bytes: null };
  const data = await file.async("uint8array");
  const filename = relPath.split("/").pop();
  const diskPath = await window.streamplanAPI.writeTempFile(filename, data);
  return { path: diskPath, bytes: data };
}

async function resolveFontAsset(zip, fontDict) {
  const fallback = { family: "Georgia", path: null };
  if (!fontDict || !fontDict.path) return { family: fontDict?.family || fallback.family, path: null };
  const { path: diskPath, bytes } = await extractAssetToTemp(zip, fontDict.path);
  if (!diskPath || !bytes) return fallback;
  const entry = await addCustomFontToLibrary(diskPath);
  return { family: entry.family, path: entry.path };
}

export async function loadProjectFromZipBytes(bytes) {
  const zip = await window.JSZip.loadAsync(bytes);
  const jsonFile = zip.file("project.json");
  if (!jsonFile) throw new Error("This file is not a valid Streamplan project (missing project.json).");
  const dict = JSON.parse(await jsonFile.async("string"));

  const bg = await extractAssetToTemp(zip, dict.style?.background_image_path);
  const logo = await extractAssetToTemp(zip, dict.style?.logo_path);
  dict.style.background_image_path = bg.path;
  dict.style.logo_path = logo.path;
  dict.style.font_heading = await resolveFontAsset(zip, dict.style?.font_heading);
  dict.style.font_body = await resolveFontAsset(zip, dict.style?.font_body);

  const stickers = dict.style?.custom_images || [];
  dict.style.custom_images = (
    await Promise.all(
      stickers.map(async (sticker) => {
        const { path: diskPath } = await extractAssetToTemp(zip, sticker.path);
        return diskPath ? { ...sticker, path: diskPath } : null;
      })
    )
  ).filter(Boolean);

  // Unlike stickers (dropped entirely if their image fails to extract, since
  // the image IS the sticker), a day's schedule entry is still valid data
  // without its image — just null the field out rather than losing the day.
  const dayEntries = dict.profile?.days || [];
  dict.profile.days = await Promise.all(
    dayEntries.map(async (d) => {
      const { path: diskPath } = await extractAssetToTemp(zip, d.image_path);
      return { ...d, image_path: diskPath };
    })
  );

  return projectFromDict(dict);
}
