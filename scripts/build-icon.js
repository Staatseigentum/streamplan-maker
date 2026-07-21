const path = require("path");
const fs = require("fs");
const { app, BrowserWindow } = require("electron");

const SIZES = [16, 24, 32, 48, 64, 128, 256];
const OUT_DIR = path.join(__dirname, "..", "build");
const SVG_PATH = path.join(__dirname, "icon-source.svg");

function buildIco(pngBuffers) {
  const entries = pngBuffers.map((buf, i) => ({ size: SIZES[i], buf }));
  const headerSize = 6 + entries.length * 16;
  let offset = headerSize;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);

  const dirEntries = [];
  for (const { size, buf } of entries) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(buf.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += buf.length;
    dirEntries.push(entry);
  }

  return Buffer.concat([header, ...dirEntries, ...entries.map((e) => e.buf)]);
}

async function main() {
  await app.whenReady();

  const svgMarkup = fs.readFileSync(SVG_PATH, "utf-8");
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;background:transparent;}
    #wrap{width:1024px;height:1024px;}
    #wrap svg{width:1024px;height:1024px;display:block;}
  </style></head><body><div id="wrap">${svgMarkup}</div></body></html>`;

  const win = new BrowserWindow({
    width: 1024,
    height: 1024,
    show: false,
    transparent: true,
    webPreferences: { offscreen: false },
  });
  await win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
  await new Promise((r) => setTimeout(r, 150));

  const fullImage = await win.webContents.capturePage();

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const pngBuffers = [];
  for (const size of SIZES) {
    const resized = fullImage.resize({ width: size, height: size, quality: "best" });
    const buf = resized.toPNG();
    pngBuffers.push(buf);
    if (size === 256) fs.writeFileSync(path.join(OUT_DIR, "icon.png"), buf);
  }
  fs.writeFileSync(path.join(OUT_DIR, "icon-16.png"), pngBuffers[0]);

  const icoBuffer = buildIco(pngBuffers);
  fs.writeFileSync(path.join(OUT_DIR, "icon.ico"), icoBuffer);

  console.log("Wrote build/icon.ico, build/icon.png, build/icon-16.png");
  win.destroy();
  app.quit();
}

main().catch((err) => {
  console.error(err);
  app.exit(1);
});
