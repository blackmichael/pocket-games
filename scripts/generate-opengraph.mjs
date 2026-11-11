import { readFile, writeFile } from 'node:fs/promises';
import { create } from 'fontkit';
import sharp from 'sharp';

const root = new URL('../', import.meta.url);
const font = create(await readFile(new URL('node_modules/@fontsource/lilita-one/files/lilita-one-latin-400-normal.woff2', root)));
const words = ['Pocket', 'Games'];
const scale = 176 / font.unitsPerEm;
const capHeight = font.capHeight * scale;
const lineGap = 28;
const bounds = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
const paths = words.map((word, line) => {
  const layout = font.layout(word);
  const baseline = line * (capHeight + lineGap);
  let x = 0;
  return layout.glyphs.map((glyph, index) => {
    const position = layout.positions[index];
    const glyphX = x + position.xOffset * scale;
    const glyphY = baseline - position.yOffset * scale;
    bounds.left = Math.min(bounds.left, glyphX + glyph.bbox.minX * scale);
    bounds.right = Math.max(bounds.right, glyphX + glyph.bbox.maxX * scale);
    bounds.top = Math.min(bounds.top, glyphY - glyph.bbox.maxY * scale);
    bounds.bottom = Math.max(bounds.bottom, glyphY - glyph.bbox.minY * scale);
    const path = `<path d="${glyph.path.toSVG()}" transform="translate(${glyphX} ${glyphY}) scale(${scale} ${-scale})"/>`;
    x += position.xAdvance * scale;
    return path;
  }).join('');
}).join('');

// The centered favicon's stroked artwork spans x=15…49 in its 64-unit viewBox.
const logoSize = 500;
const logoInkWidth = (49 - 15) / 64 * logoSize;
const gap = 64;
const groupWidth = logoInkWidth + gap + bounds.right - bounds.left;
const left = (1200 - groupWidth) / 2;
const logoX = left - 15 / 64 * logoSize;
const logoY = (630 - logoSize) / 2;
const textX = left + logoInkWidth + gap - bounds.left;
const textY = 315 - (bounds.top + bounds.bottom) / 2;
const logo = (await readFile(new URL('static/favicon.svg', root), 'utf8'))
  .replace('<svg ', `<svg x="${logoX}" y="${logoY}" width="${logoSize}" height="${logoSize}" `);

// Outlined lettering makes the committed image independent of system fonts.
const image = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><title>Pocket Games</title><rect width="1200" height="630" fill="#494786"/>${logo}<g fill="white" transform="translate(${textX} ${textY})">${paths}</g></svg>\n`;
await writeFile(new URL('static/opengraph.svg', root), image);
await sharp(Buffer.from(image)).png().toFile(new URL('static/opengraph.png', root).pathname);
console.log('Generated static/opengraph.svg and static/opengraph.png (1200 × 630).');
