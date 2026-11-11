import { readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const assets = new URL('../static/', import.meta.url);
const source = await readFile(new URL('favicon.svg', assets));
const background = '#494786';
const raster = (size) => sharp(source, { density: 384 }).resize(size, size);

for (const [name, size] of [
  ['favicon-16x16.png', 16],
  ['favicon-32x32.png', 32],
  ['android-chrome-192x192.png', 192],
  ['android-chrome-512x512.png', 512]
]) {
  await raster(size).png().toFile(new URL(name, assets).pathname);
}
await raster(180).flatten({ background }).png().toFile(new URL('apple-touch-icon.png', assets).pathname);

// Uncompressed BGRA entries support ICO readers without PNG-in-ICO support.
const sizes = [16, 32, 48];
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
const entries = [];
let offset = header.length;
for (const [index, size] of sizes.entries()) {
  const rgba = await raster(size).ensureAlpha().raw().toBuffer();
  const maskStride = Math.ceil(size / 32) * 4;
  const bitmap = Buffer.alloc(40 + size * size * 4 + maskStride * size);
  bitmap.writeUInt32LE(40, 0);
  bitmap.writeInt32LE(size, 4);
  bitmap.writeInt32LE(size * 2, 8);
  bitmap.writeUInt16LE(1, 12);
  bitmap.writeUInt16LE(32, 14);
  bitmap.writeUInt32LE(size * size * 4, 20);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const input = (y * size + x) * 4;
      const output = 40 + ((size - 1 - y) * size + x) * 4;
      bitmap[output] = rgba[input + 2];
      bitmap[output + 1] = rgba[input + 1];
      bitmap[output + 2] = rgba[input];
      bitmap[output + 3] = rgba[input + 3];
      if (rgba[input + 3] === 0) {
        bitmap[40 + size * size * 4 + (size - 1 - y) * maskStride + (x >> 3)] |= 0x80 >> (x % 8);
      }
    }
  }
  const entry = 6 + index * 16;
  header[entry] = size;
  header[entry + 1] = size;
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(bitmap.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  entries.push(bitmap);
  offset += bitmap.length;
}
await writeFile(new URL('favicon.ico', assets), Buffer.concat([header, ...entries]));
console.log('Generated PNG, Apple touch, and multi-size ICO assets from static/favicon.svg.');
