/**
 * Shoots every scene and state of Terrarium and checks it, the way
 * BTTRURSLF-v2's shoot-*.mjs do: a real Chromium on its own Vite server.
 *
 *   node scripts/shoot.mjs [tag] [only,these] [1440|1920|390|all]
 *
 * Starts Vite (watcher + HMR off, own cache dir) on a spare port and saves to
 * design-reference/shots/<tag>/<size>/ (tag defaults to "latest"), plus
 * report.json. Fails (exit 1) on any console error / page error, any
 * horizontal scroll, or the jar under 50 fps with 500+ creatures at 1440.
 *
 *   preloader-*   ?preloader=1 at 0.6 / 1.6 / done
 *   scene-1..5    each intro scene at rest (?scene=N)
 *   trans-a-b     each transition caught halfway (window.__intro.go)
 *   about         #/about, top and scrolled
 *   live          #/live after 4 s; live-16x after 20 s at 16x;
 *                 live-inspect with a creature followed and its brain open;
 *                 live-died the inspected creature killed (panel says so)
 *   fps           frame times over 5 s in the jar at 1x and 16x
 *   reduced       ?motion=reduce: scene 2 and the jar
 *   nowebgl       ?webgl=0: the static fallback
 *   hidden        tab hidden 5 s then shown: no burst of steps
 *
 * Hooks it relies on (dev builds only): window.__intro {scene, go, settled},
 * window.__live {ready, stats, frames, inspect(id), kill(id), speed(n), backend}.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TAG = process.argv[2] || 'latest';
const ONLY = process.argv[3] && process.argv[3] !== 'all' ? new Set(process.argv[3].split(',')) : null;
const SIZES = { 1440: [1440, 900], 1920: [1920, 1080], 390: [390, 844] };
const WHICH = !process.argv[4] || process.argv[4] === 'all' ? ['1440', '1920', '390'] : process.argv[4].split(',');
const want = (n) => !ONLY || ONLY.has(n);
const PORT = 5600 + Math.floor(Math.random() * 300);
const BASE = `http://localhost:${PORT}`;

const vite = await createServer({ root: ROOT, cacheDir: join(tmpdir(), 'vite-terrarium-shoot'), logLevel: 'error', server: { port: PORT, strictPort: true, hmr: false, watch: { ignored: ['**/*'] } } });
await vite.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=default', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu'] });
const failures = [];
const report = {};
try { for (const k of WHICH) await shootAt(k); } finally { await browser.close(); await vite.close(); }
writeFileSync(resolve(ROOT, 'design-reference/shots', TAG, 'report.json'), JSON.stringify({ failures, report }, null, 1));
console.log(failures.length ? `\nFAILED (${failures.length}):\n- ` + failures.join('\n- ') : '\nall checks passed');
process.exit(failures.length ? 1 : 0);

async function shootAt(key) {
  const [W, H] = SIZES[key];
  const OUT = resolve(ROOT, 'design-reference/shots', TAG, key);
  mkdirSync(OUT, { recursive: true });
  const R = (report[key] = {});
  const log = (s) => console.log(`[${key}] ${s}`);
  const fail = (s) => { failures.push(`[${key}] ${s}`); log('FAIL ' + s); };

  async function open(url, { reduced = false } = {}) {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, reducedMotion: reduced ? 'reduce' : 'no-preference', hasTouch: W < 700, isMobile: W < 700 });
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); if (/\[terrarium\]/.test(m.text())) R.logs = [...(R.logs || []), m.text()].slice(-40); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    await page.goto(BASE + url, { waitUntil: 'load' });
    const done = async (name) => {
      const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      if (over > 0) fail(`${name}: horizontal overflow ${over}px`);
      for (const e of errors) fail(`${name}: console ${e.slice(0, 200)}`);
      await ctx.close();
    };
    return { page, done };
  }
  const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png` });

  if (want('preloader')) {
    const { page, done } = await open('/?preloader=1');
    await page.waitForTimeout(600); await shot(page, 'preloader-a');
    await page.waitForTimeout(1000); await shot(page, 'preloader-b');
    await page.waitForFunction(() => window.__intro?.settled, null, { timeout: 20000 }).catch(() => fail('preloader never reached scene 1'));
    await shot(page, 'preloader-done'); await done('preloader');
  }
  if (want('scenes')) {
    for (let n = 1; n <= 5; n++) {
      const { page, done } = await open(`/?preloader=0&scene=${n}`);
      await page.waitForFunction(() => window.__intro?.settled, null, { timeout: 15000 }).catch(() => fail(`scene ${n} never settled`));
      await page.waitForTimeout(2600); // in-scene beats: text, title wipe, prompt
      if (W >= 700) await page.mouse.move(W * 0.7, H * 0.4, { steps: 8 });
      await page.waitForTimeout(1200);
      await shot(page, `scene-${n}`); await done(`scene-${n}`);
    }
  }
  if (want('transitions')) {
    const { page, done } = await open('/?preloader=0&scene=1');
    await page.waitForFunction(() => window.__intro?.settled, null, { timeout: 15000 });
    for (let n = 2; n <= 5; n++) {
      await page.evaluate((n) => { window.__shootGo = window.__intro.go(n); }, n);
      await page.waitForTimeout(650); await shot(page, `trans-${n - 1}-${n}`);
      await page.evaluate(() => window.__shootGo);
      await page.waitForTimeout(400);
    }
    await done('transitions');
  }
  if (want('about')) {
    const { page, done } = await open('/?preloader=0#/about');
    await page.waitForTimeout(1200); await shot(page, 'about');
    await page.mouse.wheel(0, H * 1.5); await page.waitForTimeout(700); await shot(page, 'about-scrolled');
    await done('about');
  }
  if (want('live')) {
    const { page, done } = await open('/?preloader=0#/live');
    await page.waitForFunction(() => window.__live?.ready, null, { timeout: 30000 }).catch(() => fail('jar never became ready'));
    await page.waitForTimeout(4000); await shot(page, 'live');
    R.backend = await page.evaluate(() => window.__live?.backend);
    const fps = async (label) => {
      const ms = await page.evaluate(() => new Promise((res) => { const d = []; let last = performance.now(); const end = last + 5000; const f = (t) => { d.push(t - last); last = t; if (t < end) requestAnimationFrame(f); else res(d); }; requestAnimationFrame(f); }));
      ms.sort((a, b) => a - b);
      const avg = ms.reduce((a, b) => a + b, 0) / ms.length;
      const r = { fps: +(1000 / avg).toFixed(1), p50: +ms[ms.length >> 1].toFixed(1), p95: +ms[Math.floor(ms.length * 0.95)].toFixed(1), population: (await page.evaluate(() => window.__live?.stats?.population)) };
      R[`fps-${label}`] = r; log(`fps ${label}: ${JSON.stringify(r)}`);
      return r;
    };
    if (key === '1440' || key === '1920') {
      const a = await fps('1x');
      if (key === '1440' && (a.fps < 50 || a.population < 500)) fail(`jar ${a.fps} fps with ${a.population} creatures (want >= 50 fps, >= 500)`);
      await page.evaluate(() => window.__live.speed(16));
      await fps('16x');
    } else {
      await page.evaluate(() => window.__live.speed(16));
    }
    await page.waitForTimeout(16000); await shot(page, 'live-16x');
    // follow a creature near the middle of the jar
    const id = await page.evaluate(() => window.__live.pickSome());
    await page.evaluate((id) => window.__live.inspect(id), id);
    await page.waitForTimeout(2500); await shot(page, 'live-inspect');
    await page.evaluate((id) => window.__live.kill(id), id);
    await page.waitForTimeout(1500); await shot(page, 'live-died');
    const panel = await page.evaluate(() => document.querySelector('.ui-brain')?.textContent || '');
    if (!/died/i.test(panel)) fail('panel did not say the followed creature died');
    // hidden tab: no burst
    const t0 = await page.evaluate(() => window.__live.stats.tick);
    await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForTimeout(5000);
    await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForTimeout(500);
    const t1 = await page.evaluate(() => window.__live.stats.tick);
    R.hiddenSteps = t1 - t0; log(`steps across a hidden 5 s: ${t1 - t0}`);
    await done('live');
  }
  if (want('reduced')) {
    let o = await open('/?preloader=0&scene=2', { reduced: true });
    await o.page.waitForTimeout(2500); await shot(o.page, 'reduced-scene-2'); await o.done('reduced intro');
    o = await open('/?preloader=0#/live', { reduced: true });
    await o.page.waitForTimeout(5000); await shot(o.page, 'reduced-live'); await o.done('reduced live');
  }
  if (want('nowebgl')) {
    const o = await open('/?preloader=0&webgl=0#/live');
    await o.page.waitForTimeout(2000); await shot(o.page, 'nowebgl');
    const t = await o.page.evaluate(() => document.body.innerText);
    if (!/WebGL/i.test(t)) fail('no-WebGL fallback does not explain itself');
    await o.done('nowebgl');
  }
}
