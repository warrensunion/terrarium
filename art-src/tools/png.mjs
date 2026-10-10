/**
 * A tiny PNG reader/writer (8-bit RGB/RGBA, non-interlaced) so the art tools
 * can measure and key images in plain node, without adding an image library.
 * ChatGPT's PNGs are always 8-bit RGB or RGBA, non-interlaced.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { inflateSync, deflateSync } from 'node:zlib';

export function readPng(path) {
  const b = readFileSync(path);
  const w = b.readUInt32BE(16), h = b.readUInt32BE(20), depth = b[24], type = b[25], interlace = b[28];
  if (depth !== 8 || (type !== 2 && type !== 6) || interlace) throw new Error(`${path}: unsupported PNG (depth ${depth}, type ${type}, interlace ${interlace})`);
  const ch = type === 6 ? 4 : 3;
  const idat = []; let o = 8;
  while (o < b.length) { const len = b.readUInt32BE(o); const t = b.toString('ascii', o + 4, o + 8); if (t === 'IDAT') idat.push(b.subarray(o + 8, o + 8 + len)); o += 12 + len; }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * ch; const out = new Uint8ClampedArray(w * h * 4);
  const prev = new Uint8Array(stride), cur = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? cur[i - ch] : 0, up = prev[i], c = i >= ch ? prev[i - ch] : 0;
      let v = line[i];
      if (f === 1) v += a; else if (f === 2) v += up; else if (f === 3) v += (a + up) >> 1;
      else if (f === 4) { const p = a + up - c, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? up : c; }
      cur[i] = v & 255;
    }
    for (let x = 0; x < w; x++) {
      const d = (y * w + x) * 4;
      out[d] = cur[x * ch]; out[d + 1] = cur[x * ch + 1]; out[d + 2] = cur[x * ch + 2]; out[d + 3] = ch === 4 ? cur[x * ch + 3] : 255;
    }
    prev.set(cur);
  }
  return { w, h, data: out };
}

const crcTable = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc = (buf) => { let c = -1; for (const x of buf) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, 'ascii'), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };

export function writePng(path, { w, h, data }) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; Buffer.from(data.buffer, data.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1); }
  writeFileSync(path, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]));
}

/** alpha coverage summary: fraction transparent / partial / solid, plus corner colours */
export function stats({ w, h, data }) {
  let t = 0, p = 0, s = 0;
  for (let i = 3; i < data.length; i += 4) { const a = data[i]; if (a < 8) t++; else if (a > 247) s++; else p++; }
  const n = w * h; const px = (x, y) => Array.from(data.subarray((y * w + x) * 4, (y * w + x) * 4 + 4));
  return { w, h, transparent: +(t / n).toFixed(3), partial: +(p / n).toFixed(3), solid: +(s / n).toFixed(3), corners: [px(2, 2), px(w - 3, 2), px(2, h - 3), px(w - 3, h - 3)] };
}

if (process.argv[1]?.endsWith('png.mjs')) for (const f of process.argv.slice(2)) console.log(f, JSON.stringify(stats(readPng(f))));
