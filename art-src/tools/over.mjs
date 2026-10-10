// Composites a cut-out over a flat colour, to judge it the way the page will show it.
//   node art-src/tools/over.mjs <in.png> <out.png> [#C9D8D2]
import { readPng, writePng } from './png.mjs';
const [src, out, hex = '#C9D8D2'] = process.argv.slice(2);
const im = readPng(src); const bg = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
for (let i = 0; i < im.data.length; i += 4) { const a = im.data[i + 3] / 255; for (let c = 0; c < 3; c++) im.data[i + c] = im.data[i + c] * a + bg[c] * (1 - a); im.data[i + 3] = 255; }
writePng(out, im);
