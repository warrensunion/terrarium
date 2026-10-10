/**
 * Turns art-src/gen/*.png into public/art/*.webp.
 *
 * Why a script: every image goes through the same copied cutout.mjs
 * (trim, alpha snap + erode, edge decontamination, WebP), and sheets are
 * split into parts by sheet-boxes.mjs's measured blob boxes, never by
 * eyeballed crops. Re-running is cheap and reproducible.
 *
 *   node art-src/process.mjs [only,these]
 *
 * Starts its own static Vite server (own cache dir: worktrees share
 * node_modules) because cutout.mjs decodes images in Chromium.
 */
import { readFileSync, existsSync, mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { createServer } from 'vite';

const only = process.argv[2] ? new Set(process.argv[2].split(',')) : null;
const list = JSON.parse(readFileSync('art-src/images.json', 'utf8'));
mkdirSync('art-src/cut', { recursive: true }); mkdirSync('public/art', { recursive: true });

// per-image settings: max edge for the web, and how many px to erode
const SETTINGS = {
  'jar': { max: 1400, erode: 1 },
  'jar-world': { max: 1400, erode: 1 },
  'fg-moss': { max: 2400, erode: 1 },
  'mid-rocks': { max: 2000, erode: 1 },
  'leaves-left': { max: 1600, erode: 1 },
  'leaves-right': { max: 1600, erode: 1 },
  'preloader-sprout': { max: 600, erode: 1 },
  'gene-strand': { max: 2000, erode: 1 },
  'bg-fog': { opaque: true, max: 2400, q: 0.86 },
  'room-backdrop': { opaque: true, max: 2400, q: 0.86 },
  'moss-floor': { opaque: true, max: 1024, q: 0.9 },
  'paper-grain': { opaque: true, max: 512, q: 0.9 },
  'comp-intro': { skip: true },
  'comp-live': { skip: true },
};
// sheets: split into parts, named in reading order
const SHEETS = { 'species-violet': 'sp-violet', 'species-salmon': 'sp-salmon', 'species-lichen': 'sp-lichen', 'particles': 'pt' };

const port = 5300 + Math.floor(Math.random() * 300);
const vite = await createServer({ root: process.cwd(), cacheDir: tmpdir() + '/vite-art', logLevel: 'error', server: { port, strictPort: true, hmr: false, watch: { ignored: ['**/*'] } } });
await vite.listen();
const base = `http://localhost:${port}`;
const manifest = existsSync('art-src/cut/manifest.json') ? JSON.parse(readFileSync('art-src/cut/manifest.json', 'utf8')) : {};
// async: a sync exec would block this process's own Vite server
// saved after every image, so a killed run keeps what it finished
const save = () => writeFileSync('art-src/cut/manifest.json', JSON.stringify(manifest, null, 1));
const run = async (args) => (await promisify(execFile)('node', args, { encoding: 'utf8' })).stdout.trim();

try {
  for (const name of ['jar', ...list.map((x) => x.name)]) {
    if (only && !only.has(name)) continue;
    const src = `art-src/gen/${name}.png`;
    if (!existsSync(src)) { console.log('missing', name); continue; }
    const s = SETTINGS[name] || {};
    if (s.skip) continue;
    if (SHEETS[name]) {
      const boxes = (await run(['art-src/tools/sheet-boxes.mjs', base, src, '--pad', '6'])).split('\n').filter((l) => l.startsWith('--crop')).map((l) => l.split(/\s+/)[1]);
      manifest[name] = [];
      for (const [k, crop] of boxes.entries()) {
        const out = `art-src/cut/${SHEETS[name]}-${k}`;
        console.log(await run(['art-src/tools/cutout.mjs', base, src, out, '--crop', crop, '--erode', '1', '--islands', '--max', '700']));
        copyFileSync(`${out}.webp`, `public/art/${SHEETS[name]}-${k}.webp`);
        manifest[name].push({ file: `${SHEETS[name]}-${k}.webp`, crop: crop.split(',').map(Number) }); save();
      }
      continue;
    }
    const out = `art-src/cut/${name}`;
    const args = ['art-src/tools/cutout.mjs', base, src, out, '--max', String(s.max || 1600), '--q', String(s.q || 0.9)];
    if (s.opaque) args.push('--opaque'); else args.push('--erode', String(s.erode ?? 1), '--islands');
    const line = await run(args); console.log(line);
    copyFileSync(`${out}.webp`, `public/art/${name}.webp`);
    const m = line.match(/trim (\d+),(\d+),(\d+),(\d+) -> webp (\d+)x(\d+)/);
    if (m) manifest[name] = { file: `${name}.webp`, trim: m.slice(1, 5).map(Number), size: m.slice(5, 7).map(Number), source: [] }; save();
  }
} finally {
  await vite.close();
}
save();
console.log('manifest:', Object.keys(manifest).length, 'entries');
