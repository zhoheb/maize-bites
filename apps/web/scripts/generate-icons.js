// Generates the PWA icons in public/icons from one geometric logo: a maize circle with a bite
// taken out and a crumb beside it, on navy. No image dependencies: shapes are rasterized with 4x4
// supersampling and written as PNG with node:zlib.
//
//   node scripts/generate-icons.js
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const OUT = new URL('../public/icons/', import.meta.url);
const BLUE = [11, 31, 58];
const MAIZE = [255, 203, 5];

// Logo in unit coordinates (0..1). Bites are circles cut out of the plate.
// Keep in step with src/components/Logo.tsx, which draws the same mark in the header.
const PLATE = { x: 0.5, y: 0.53, r: 0.3 };
const BITES = [
  { x: 0.76, y: 0.29, r: 0.13 },
  { x: 0.62, y: 0.2, r: 0.08 },
  { x: 0.85, y: 0.43, r: 0.08 },
];
const CRUMB = { x: 0.8, y: 0.18, r: 0.035 };

const inCircle = (px, py, c) => (px - c.x) ** 2 + (py - c.y) ** 2 <= c.r ** 2;

function inRoundedRect(px, py, radius) {
  const cx = Math.min(Math.max(px, radius), 1 - radius);
  const cy = Math.min(Math.max(py, radius), 1 - radius);
  return (px - cx) ** 2 + (py - cy) ** 2 <= radius ** 2;
}

/** RGBA pixels for one icon. `scale` shrinks the logo toward the center (maskable safe zone). */
function render(size, { rounded, scale = 1 }) {
  const px = Buffer.alloc(size * size * 4);
  const S = 4;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let bg = 0;
      let maize = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const u = (x + (sx + 0.5) / S) / size;
          const v = (y + (sy + 0.5) / S) / size;
          const inBg = rounded ? inRoundedRect(u, v, 0.22) : true;
          if (!inBg) continue;
          bg++;
          const lu = 0.5 + (u - 0.5) / scale;
          const lv = 0.5 + (v - 0.5) / scale;
          if (
            (inCircle(lu, lv, PLATE) && !BITES.some((b) => inCircle(lu, lv, b))) ||
            inCircle(lu, lv, CRUMB)
          )
            maize++;
        }
      }
      const i = (y * size + x) * 4;
      const coverage = bg / (S * S);
      const m = bg === 0 ? 0 : maize / bg;
      px[i] = Math.round(BLUE[0] + (MAIZE[0] - BLUE[0]) * m);
      px[i + 1] = Math.round(BLUE[1] + (MAIZE[1] - BLUE[1]) * m);
      px[i + 2] = Math.round(BLUE[2] + (MAIZE[2] - BLUE[2]) * m);
      px[i + 3] = Math.round(255 * coverage);
    }
  }
  return px;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++)
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="22" fill="#0b1f3a"/>
  <mask id="bite"><rect width="100" height="100" fill="#fff"/>${BITES.map(
    (b) => `<circle cx="${b.x * 100}" cy="${b.y * 100}" r="${b.r * 100}" fill="#000"/>`,
  ).join('')}</mask>
  <circle cx="${PLATE.x * 100}" cy="${PLATE.y * 100}" r="${PLATE.r * 100}" fill="#ffcb05" mask="url(#bite)"/>
  <circle cx="${CRUMB.x * 100}" cy="${CRUMB.y * 100}" r="${CRUMB.r * 100}" fill="#ffcb05"/>
</svg>
`;

mkdirSync(OUT, { recursive: true });
const files = {
  'icon-192.png': png(192, render(192, { rounded: true })),
  'icon-512.png': png(512, render(512, { rounded: true })),
  // Maskable: full bleed; logo inside the 80% safe zone.
  'icon-maskable-512.png': png(512, render(512, { rounded: false, scale: 0.8 })),
  // iOS rounds corners itself and dislikes transparency.
  'apple-touch-icon.png': png(180, render(180, { rounded: false, scale: 0.9 })),
  'favicon.svg': svg,
};
for (const [name, data] of Object.entries(files)) {
  writeFileSync(new URL(name, OUT), data);
  console.log(`wrote public/icons/${name}`);
}
