import { readFile, writeFile } from 'node:fs/promises';
import { create } from 'fontkit';
import sharp from 'sharp';

const root = new URL('../', import.meta.url);
const font = create(await readFile(new URL('node_modules/@fontsource/lilita-one/files/lilita-one-latin-400-normal.woff2', root)));
const words = ['Pocket', 'Games'];
const scale = 176 / font.unitsPerEm;
const capHeight = font.capHeight * scale;
const lineGap = 28;
const top = (630 - (2 * capHeight + lineGap)) / 2;
const paths = words.map((word, line) => {
  const layout = font.layout(word);
  const baseline = top + capHeight + line * (capHeight + lineGap);
  let x = 480;
  return layout.glyphs.map((glyph, index) => {
    const position = layout.positions[index];
    const path = `<path d="${glyph.path.toSVG()}" transform="translate(${x + position.xOffset * scale} ${baseline - position.yOffset * scale}) scale(${scale} ${-scale})"/>`;
    x += position.xAdvance * scale;
    return path;
  }).join('');
}).join('');
const logo = (await readFile(new URL('static/favicon.svg', root), 'utf8'))
  .replace('<svg ', '<svg x="40" y="42" width="500" height="500" ');

// Outlined lettering makes the committed image independent of system fonts.
const image = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><title>Pocket Games</title><rect width="1200" height="630" fill="#494786"/>${logo}<g fill="white">${paths}</g></svg>\n`;
await writeFile(new URL('static/opengraph.svg', root), image);
await sharp(Buffer.from(image)).png().toFile(new URL('static/opengraph.png', root).pathname);
console.log('Generated static/opengraph.svg and static/opengraph.png (1200 × 630).');
