/**
 * JPEG copies (q 0.85) of a shoot's PNGs, for the repo. shoot.mjs writes
 * lossless PNGs for measuring; at ~90 MB a set they stay local (gitignored).
 *
 *   node scripts/shots-to-jpg.mjs design-reference/shots/final
 */
import { chromium } from 'playwright';
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const files = [];
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (f.endsWith('.png')) files.push(p); } };
walk(process.argv[2]);
const b = await chromium.launch();
const p = await b.newPage();
await p.route('http://c.local/**', (r) => {
  const f = decodeURIComponent(new URL(r.request().url()).pathname.slice(1));
  return f ? r.fulfill({ body: readFileSync(f), contentType: 'image/png' }) : r.fulfill({ body: '<!doctype html>', contentType: 'text/html' });
});
await p.goto('http://c.local/');
for (const f of files) {
  const b64 = await p.evaluate(async (src) => {
    const i = new Image(); i.src = 'http://c.local/' + encodeURIComponent(src); await i.decode();
    const c = new OffscreenCanvas(i.width, i.height); c.getContext('2d').drawImage(i, 0, 0);
    const u = new Uint8Array(await (await c.convertToBlob({ type: 'image/jpeg', quality: 0.85 })).arrayBuffer());
    let s = ''; for (let k = 0; k < u.length; k += 0x8000) s += String.fromCharCode(...u.subarray(k, k + 0x8000));
    return btoa(s);
  }, f.split('\\').join('/'));
  writeFileSync(f.replace(/\.png$/, '.jpg'), Buffer.from(b64, 'base64'));
}
await b.close();
console.log(files.length, 'converted');
