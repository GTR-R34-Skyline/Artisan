import sharp from 'sharp';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'icons');

async function makeIcon(size, { maskable = false } = {}) {
  const pad = Math.round(size * (maskable ? 0.18 : 0.12));
  const inner = size - pad * 2;
  const fontSize = Math.round(inner * (maskable ? 0.42 : 0.48));
  const radius = Math.round(inner * 0.18);
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="100%" height="100%" fill="#f4f1ea"/>
  <rect x="${pad}" y="${pad}" width="${inner}" height="${inner}" rx="${radius}" fill="#264336"/>
  <text x="50%" y="52%" text-anchor="middle" dominant-baseline="middle"
    font-family="Georgia, 'Times New Roman', serif" font-size="${fontSize}" font-weight="600" fill="#f4f1ea">A</text>
</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

mkdirSync(outDir, { recursive: true });
const files = [
  ['icon-192.png', await makeIcon(192)],
  ['icon-512.png', await makeIcon(512)],
  ['icon-512-maskable.png', await makeIcon(512, { maskable: true })],
  ['apple-touch-icon.png', await makeIcon(180)],
];

for (const [name, buf] of files) {
  writeFileSync(join(outDir, name), buf);
  console.log(`wrote ${name} (${buf.length} bytes)`);
}
