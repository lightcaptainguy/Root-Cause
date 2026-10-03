// Generates local fixture PNGs (no external deps). Run: node scripts/gen_fixtures.mjs
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "fixtures");

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return (buf) => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
})();

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(CRC(body));
  return Buffer.concat([len, body, crc]);
}

function writePng(path, width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  writeFileSync(path, png);
  console.log("wrote", path);
}

// Base leaf: green gradient with slight texture; lesion: brown blob.
function leaf(width, height, blob) {
  const px = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const g = 90 + Math.round(50 * Math.sin(x / 90) * Math.cos(y / 70)) + ((x * 7 + y * 13) % 17);
      px[i] = 60 + ((x + y) % 23);
      px[i + 1] = Math.max(70, Math.min(150, g + 40));
      px[i + 2] = 50 + ((x * 3 + y) % 15);
      px[i + 3] = 255;
      const dx = x - blob.cx, dy = y - blob.cy;
      const d = Math.sqrt(dx * dx + dy * dy) / blob.r;
      if (d < 1) {
        px[i] = 140 + ((x * y) % 30);
        px[i + 1] = 85;
        px[i + 2] = 45;
      }
    }
  }
  return px;
}

// Mask: amber, semi-transparent where lesion; alpha 0 elsewhere (preserves alpha).
function lesionMask(width, height, blob) {
  const px = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - blob.cx, dy = y - blob.cy;
      const d = Math.sqrt(dx * dx + dy * dy) / blob.r;
      if (d < 1) {
        const i = (y * width + x) * 4;
        px[i] = 230; px[i + 1] = 150; px[i + 2] = 40;
        px[i + 3] = d < 0.8 ? 170 : 110;
      }
    }
  }
  return px;
}

function aerial(width, height) {
  const px = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const field = Math.floor(x / (width / 6)) % 2;
      px[i] = 70 + field * 30 + ((x + y) % 12);
      px[i + 1] = 120 + field * 20 + ((x * y) % 9);
      px[i + 2] = 55 + ((x + y) % 10);
      px[i + 3] = 255;
    }
  }
  return px;
}

const L = { width: 1200, height: 800, blob: { cx: 760, cy: 430, r: 130 } };
const P = { width: 800, height: 1200, blob: { cx: 310, cy: 720, r: 160 } };

writePng(join(outDir, "leaf_landscape.png"), L.width, L.height, leaf(L.width, L.height, L.blob));
writePng(join(outDir, "mask_landscape.png"), L.width, L.height, lesionMask(L.width, L.height, L.blob));
writePng(join(outDir, "leaf_portrait.png"), P.width, P.height, leaf(P.width, P.height, P.blob));
writePng(join(outDir, "mask_portrait.png"), P.width, P.height, lesionMask(P.width, P.height, P.blob));
writePng(join(outDir, "aerial.png"), 1600, 900, aerial(1600, 900));
