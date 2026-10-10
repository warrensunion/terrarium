/**
 * Side-by-side sheets of Terrarium against the makemepulse recordings, so a
 * "less polished" judgement is made looking at both at once, not from memory.
 *
 *   node scripts/compare.mjs [tag=latest] [size=1440]
 *
 * Reads design-reference/shots/<tag>/<size>/ (scripts/shoot.mjs) and
 * design-reference/makemepulse/{frames,rec}/<size>x.../ (record.mjs,
 * analyse.mjs) and writes design-reference/compare/<tag>-<size>-*.jpg:
 *   scenes       each of our scenes beside a makemepulse scene at rest
 *   transitions  our mid-transition frames beside theirs (contact sheets)
 *   preloader    our preloader beside theirs
 *   live         the jar and the inspector beside their busiest scene
 * Frames are composed in Chromium (no image library).
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TAG = process.argv[2] || 'latest';
const SIZE = process.argv[3] || '1440';
const MMP = { 1440: '1440x900', 1920: '1920x1080' }[SIZE] || '1440x900';
const OURS = resolve(ROOT, 'design-reference/shots', TAG, SIZE);
const REC = resolve(ROOT, 'design-reference/makemepulse/rec', MMP);
const FRAMES = resolve(ROOT, 'design-reference/makemepulse/frames', MMP);
const OUT = resolve(ROOT, 'design-reference/compare');
mkdirSync(OUT, { recursive: true });

// a makemepulse frame at an event (+ offset, seconds), from the analysis' CDP clock
const A = JSON.parse(readFileSync(`${REC}/analysis.json`, 'utf8'));
const J = JSON.parse(readFileSync(`${REC}/events.json`, 'utf8'));
function frameAt(ev, dt = 0) {
  const t = A.eventsCdp[ev] + dt; let best = 0;
  J.frames.forEach(([ft], i) => { if (Math.abs(ft - t) < Math.abs(J.frames[best][0] - t)) best = i; });
  const f = `${FRAMES}/${String(best).padStart(5, '0')}.jpg`;
  return existsSync(f) ? f : null;
}
const ours = (n) => { for (const e of ['.png', '.jpg']) if (existsSync(`${OURS}/${n}${e}`)) return `${OURS}/${n}${e}`; return null; };

const pairs = {
  scenes: [
    ['makemepulse: scene 1 at rest', frameAt('mouse-C', -0.2), 'Terrarium: scene 1', ours('scene-1')],
    ['makemepulse: scene 2 at rest', frameAt('scene-2-settled'), 'Terrarium: scene 2', ours('scene-2')],
    ['makemepulse: scene 3 at rest', frameAt('scene-3-settled'), 'Terrarium: scene 3', ours('scene-3')],
    ['makemepulse: scene 4 at rest', frameAt('scene-4-settled'), 'Terrarium: scene 4', ours('scene-4')],
    ['makemepulse: ending', frameAt('scene-5-settled'), 'Terrarium: scene 5', ours('scene-5')],
  ],
  transitions: [
    ['makemepulse: push into foliage (+1.2 s)', frameAt('scene-1-click-next', 1.2), 'Terrarium: 1 -> 2', ours('trans-1-2')],
    ['makemepulse: tilt into the sky (+1.4 s)', frameAt('scene-2-click-next', 1.4), 'Terrarium: 2 -> 3', ours('trans-2-3')],
    ['makemepulse: layered rise (+0.3 s)', frameAt('scene-3-click-next', 0.3), 'Terrarium: 3 -> 4', ours('trans-3-4')],
    ['makemepulse: page turn (+0.9 s)', frameAt('scene-4-click-next', 0.9), 'Terrarium: 4 -> 5', ours('trans-4-5')],
  ],
  preloader: [
    ['makemepulse: traced line', frameAt('disc-visible', -3), 'Terrarium: traced stem', ours('preloader-a')],
    ['makemepulse: the disc', frameAt('hover-disc', 1), 'Terrarium: the sprout', ours('preloader-b')],
  ],
  live: [
    ['makemepulse: busiest scene', frameAt('scene-3-settled'), 'Terrarium: the jar', ours('live-16x')],
    ['makemepulse: UI over art', frameAt('scene-1-hover-next', 0.8), 'Terrarium: following a creature', ours('live-inspect')],
  ],
};

const b = await chromium.launch();
const p = await b.newPage();
await p.route('http://cmp.local/**', (r) => {
  const f = decodeURIComponent(new URL(r.request().url()).pathname.slice(1));
  return f ? r.fulfill({ body: readFileSync(f), contentType: extname(f) === '.png' ? 'image/png' : 'image/jpeg' }) : r.fulfill({ body: '<!doctype html>', contentType: 'text/html' });
});
await p.goto('http://cmp.local/');
for (const [name, rows] of Object.entries(pairs)) {
  const list = rows.filter((r) => r[1] && r[3]);
  if (!list.length) { console.log('skip', name, '(missing shots)'); continue; }
  const b64 = await p.evaluate(async (rows) => {
    const W = 760, H = 475, L = 26, G = 12;
    const c = new OffscreenCanvas(W * 2 + G * 3, rows.length * (H + L + G) + G); const x = c.getContext('2d');
    x.fillStyle = '#1b1f1d'; x.fillRect(0, 0, c.width, c.height); x.font = '15px sans-serif'; x.fillStyle = '#e8ece9';
    const load = async (f) => { const i = new Image(); i.src = 'http://cmp.local/' + encodeURIComponent(f); await i.decode(); return i; };
    for (let k = 0; k < rows.length; k++) {
      const [la, fa, lb, fb] = rows[k]; const y = G + k * (H + L + G);
      for (const [j, lab, f] of [[0, la, fa], [1, lb, fb]]) {
        const img = await load(f); const xx = G + j * (W + G);
        x.fillText(lab, xx + 2, y + 17);
        const s = Math.min(W / img.width, H / img.height); const w = img.width * s, h = img.height * s;
        x.drawImage(img, xx + (W - w) / 2, y + L + (H - h) / 2, w, h);
      }
    }
    const blob = await c.convertToBlob({ type: 'image/jpeg', quality: 0.82 }); const buf = new Uint8Array(await blob.arrayBuffer());
    let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000)); return btoa(s);
  }, list.map((r) => [r[0], r[1].replace(/\\/g, '/'), r[2], r[3].replace(/\\/g, '/')]));
  const out = `${OUT}/${TAG}-${SIZE}-${name}.jpg`;
  writeFileSync(out, Buffer.from(b64, 'base64'));
  console.log('wrote', out);
}
await b.close();
