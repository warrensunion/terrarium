/**
 * Generates every image in art-src/images.json that is not already in
 * art-src/gen/, a few at a time (codex takes ~3 min an image, and Warren's
 * ChatGPT quota is the limit, so finished images are never redone).
 *   node art-src/gen-all.mjs [concurrency=4] [only,these]
 */
import { readFileSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
const list = JSON.parse(readFileSync('art-src/images.json', 'utf8'));
const N = Number(process.argv[2] || 4);
const only = process.argv[3] ? new Set(process.argv[3].split(',')) : null;
const todo = list.filter((x) => (!only || only.has(x.name)) && !existsSync(`art-src/gen/${x.name}.png`));
console.log('to generate:', todo.map((x) => x.name).join(', ') || 'nothing');
const failed = [];
async function worker() {
  while (todo.length) {
    const x = todo.shift(); const t = Date.now();
    const code = await new Promise((res) => { const p = spawn('bash', ['art-src/gen.sh', x.name, x.size, x.mode, x.subject], { stdio: ['ignore', 'pipe', 'pipe'] }); let err = ''; p.stderr.on('data', (d) => (err += d)); p.on('close', (c) => { if (c) console.log(x.name, 'stderr:', err.slice(-400)); res(c); }); });
    console.log(x.name, code === 0 && existsSync(`art-src/gen/${x.name}.png`) ? 'ok' : 'FAILED', ((Date.now() - t) / 1000).toFixed(0) + 's');
    if (code) failed.push(x.name);
  }
}
await Promise.all(Array.from({ length: N }, worker));
console.log('failed:', failed.join(', ') || 'none');
