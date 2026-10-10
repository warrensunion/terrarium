// One contact sheet of several PNGs (over the fog colour, box-downscaled),
// to review a batch of generated art at a glance.
//   node art-src/tools/montage.mjs <out.png> <cell px> <a.png> <b.png> ...
import { readPng, writePng } from './png.mjs';
const [out, cellArg, ...files] = process.argv.slice(2);
const cell = Number(cellArg); const cols = Math.min(4, files.length); const rows = Math.ceil(files.length / cols);
const W = cols * cell, H = rows * cell; const data = new Uint8ClampedArray(W * H * 4);
for (let i = 0; i < data.length; i += 4) { data[i] = 201; data[i + 1] = 216; data[i + 2] = 210; data[i + 3] = 255; }
files.forEach((f, k) => {
  const im = readPng(f); const s = Math.max(im.w, im.h) / (cell - 8); const w = Math.floor(im.w / s), h = Math.floor(im.h / s);
  const ox = (k % cols) * cell + ((cell - w) >> 1), oy = Math.floor(k / cols) * cell + ((cell - h) >> 1);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0, g = 0, b = 0, a = 0, n = 0;
    for (let yy = Math.floor(y * s); yy < Math.floor((y + 1) * s); yy++) for (let xx = Math.floor(x * s); xx < Math.floor((x + 1) * s); xx++) { const i = (yy * im.w + xx) * 4; const al = im.data[i + 3] / 255; r += im.data[i] * al; g += im.data[i + 1] * al; b += im.data[i + 2] * al; a += al; n++; }
    const d = ((oy + y) * W + ox + x) * 4; const al = a / n;
    data[d] = r / n + 201 * (1 - al); data[d + 1] = g / n + 216 * (1 - al); data[d + 2] = b / n + 210 * (1 - al);
  }
});
writePng(out, { w: W, h: H, data });
