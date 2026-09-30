const path = require("path");
const fs = require("fs");
const { app, BrowserWindow } = require("electron");

const SIZES = [16, 24, 32, 48, 64, 128, 256];
const OUT_DIR = path.join(__dirname, "..", "build");
const RENDERER_ASSETS_DIR = path.join(__dirname, "..", "src", "renderer", "assets");
const SVG_PATH = path.join(__dirname, "icon-source.svg");
const TINY_SVG_PATH = path.join(__dirname, "icon-tiny.svg");

function buildBmpIconImage(image, size) {
  const pixels = image.toBitmap();
  if (pixels.length !== size * size * 4) throw new Error(`Unexpected ${size}px bitmap size`);
  const maskStride = Math.ceil(size / 32) * 4;
  const maskBytes = maskStride * size;
  const dib = Buffer.alloc(40 + pixels.length + maskBytes);
  dib.writeUInt32LE(40, 0);
  dib.writeInt32LE(size, 4);
  dib.writeInt32LE(size * 2, 8);
  dib.writeUInt16LE(1, 12);
  dib.writeUInt16LE(32, 14);
  dib.writeUInt32LE(pixels.length, 20);
  for (let row = 0; row < size; row++) {
    const sourceRow = size - 1 - row;
    pixels.copy(dib, 40 + row * size * 4, sourceRow * size * 4, (sourceRow + 1) * size * 4);
    for (let col = 0; col < size; col++) {
      if (pixels[(sourceRow * size + col) * 4 + 3] < 128) {
        dib[40 + pixels.length + row * maskStride + (col >> 3)] |= 0x80 >> (col & 7);
      }
    }
  }
  return dib;
}

function buildIco(iconBuffers) {
  const entries = iconBuffers.map((buf, i) => ({ size: SIZES[i], buf }));
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

  const iconSvg = fs.readFileSync(SVG_PATH, "utf-8");
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;background:transparent;}
    #wrap{width:1024px;height:1024px;}
    #wrap svg{width:1024px;height:1024px;display:block;}
  </style></head><body><div id="wrap">${iconSvg}</div></body></html>`;

  const win = new BrowserWindow({
    width: 1024,
    height: 1024,
    show: false,
    transparent: true,
    frame: false,
    useContentSize: true,
    webPreferences: { offscreen: false },
  });
  await win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
  await new Promise((r) => setTimeout(r, 150));

  const iconImage = await win.webContents.capturePage();
  const tinySvg = fs.readFileSync(TINY_SVG_PATH, "utf-8");
  await win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html.replace(iconSvg, tinySvg)));
  await new Promise((r) => setTimeout(r, 150));
  const tinyImage = await win.webContents.capturePage();

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  if (!fs.existsSync(RENDERER_ASSETS_DIR)) fs.mkdirSync(RENDERER_ASSETS_DIR, { recursive: true });

  const pngBuffers = [];
  const iconBuffers = [];
  for (const size of SIZES) {
    const source = size === 16 ? tinyImage : iconImage;
    const resized = source.resize({ width: size, height: size, quality: "best" });
    const buf = resized.toPNG();
    pngBuffers.push(buf);
    iconBuffers.push(size === 256 ? buf : buildBmpIconImage(resized, size));
    if (size === 256) {
      fs.writeFileSync(path.join(OUT_DIR, "icon.png"), buf);
      fs.writeFileSync(path.join(RENDERER_ASSETS_DIR, "icon.png"), buf);
    }
  }
  fs.writeFileSync(path.join(OUT_DIR, "icon-16.png"), pngBuffers[0]);

  const icoBuffer = buildIco(iconBuffers);
  fs.writeFileSync(path.join(OUT_DIR, "icon.ico"), icoBuffer);
  fs.writeFileSync(path.join(RENDERER_ASSETS_DIR, "icon.ico"), icoBuffer);

  const coverHtml = `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}html,body{margin:0;width:1600px;height:900px;overflow:hidden}
    body{font-family:Arial,sans-serif;color:#f7f3ff;background:
      radial-gradient(circle at 88% 18%,#533484 0,transparent 34%),
      radial-gradient(circle at 62% 96%,#243a75 0,transparent 39%),
      linear-gradient(132deg,#0b0b19 0%,#17102b 55%,#0a1020 100%)}
    .grid{position:absolute;inset:0;opacity:.14;background-image:
      linear-gradient(#a68ef0 1px,transparent 1px),linear-gradient(90deg,#a68ef0 1px,transparent 1px);
      background-size:80px 80px;mask-image:linear-gradient(90deg,transparent 27%,#000 100%)}
    .accent{position:absolute;left:102px;top:151px;width:90px;height:8px;border-radius:8px;background:#ad7bfa}
    .eyebrow{position:absolute;left:102px;top:192px;font-size:26px;font-weight:700;letter-spacing:7px;color:#baa7e4}
    .title{position:absolute;left:94px;top:288px;font-size:102px;font-weight:900;line-height:.97;letter-spacing:-5px}
    .title span{display:block}.title span:last-child{color:#bd91ff}
    .subtitle{position:absolute;left:103px;top:550px;font-size:28px;font-weight:700;letter-spacing:4px;color:#d3c3eb}
    .footer{position:absolute;left:102px;bottom:109px;display:flex;align-items:center;gap:15px;color:#d8c8f3;font-size:24px;font-weight:700;letter-spacing:3px}
    .live{width:18px;height:18px;border-radius:50%;background:#ff638d;box-shadow:0 0 23px #ff638d}
    .schedule{position:absolute;left:1010px;top:118px;width:480px;height:645px;border:2px solid #a389d8;border-radius:43px;background:#211b3c;transform:rotate(10deg);opacity:.78;box-shadow:0 38px 95px #050612}
    .schedule:before{content:"";display:block;height:104px;border-radius:40px 40px 0 0;background:linear-gradient(90deg,#7951c7,#555dc1)}
    .row{height:53px;margin:21px 38px;border-radius:15px;background:#4b3c70;opacity:.9}
    .row:nth-child(2n){width:69%}.row:nth-child(2n+1){width:78%}
    .mark{position:absolute;left:932px;top:213px;width:514px;height:514px;transform:rotate(-8deg);filter:drop-shadow(0 33px 36px #050512)}
    .mark svg{display:block;width:100%;height:100%}
  </style></head><body>
    <div class="grid"></div><div class="schedule"><div class="row"></div><div class="row"></div><div class="row"></div><div class="row"></div><div class="row"></div><div class="row"></div></div>
    <div class="mark">${iconSvg}</div><div class="accent"></div>
    <div class="eyebrow">STREAM SCHEDULE STUDIO</div>
    <div class="title"><span>STREAMPLAN</span><span>MAKER</span></div>
    <div class="subtitle">CRAFT YOUR STREAM SCHEDULE</div>
    <div class="footer"><span class="live"></span> PLAN THE WEEK. GO LIVE.</div>
  </body></html>`;
  const coverWin = new BrowserWindow({
    width: 1600,
    height: 900,
    show: false,
    frame: false,
    useContentSize: true,
  });
  await coverWin.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(coverHtml));
  await new Promise((r) => setTimeout(r, 150));
  fs.writeFileSync(path.join(RENDERER_ASSETS_DIR, "cover.png"), (await coverWin.webContents.capturePage()).toPNG());

  console.log("Wrote build/icon.ico, build/icon.png, build/icon-16.png and renderer brand assets");
  coverWin.destroy();
  win.destroy();
  app.quit();
}

main().catch((err) => {
  console.error(err);
  app.exit(1);
});
