/**
 * The production build, not the dev server: worker bundling, asset paths and
 * lazy chunks only show their problems after `vite build`. Builds, serves
 * dist/ with `vite preview`, and walks every route in Chromium.
 *
 *   node scripts/smoke-prod.mjs
 *
 * Fails on any console error, page error, failed request, a jar that never
 * draws (canvas pixels all one colour) or a route without its heading.
 *
 * `vite preview` answers a missing file with index.html (200, text/html),
 * which hid a missing texture; so every /art/ and /fonts/ response must also
 * carry an image/* or font/* type. And it walks intro -> live -> about three
 * times by hash, then checks nothing outlived its screen: one canvas, the
 * <html> classes back to where they started, no data-ui-brain.
 */
import { build, preview } from 'vite';
import { chromium } from 'playwright';
import { resolve, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { readPng } from '../art-src/tools/png.mjs';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
await build({ root: ROOT, logLevel: 'warn' });
const port = 4600 + Math.floor(Math.random() * 300);
const server = await preview({ root: ROOT, preview: { port, strictPort: true } });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=default', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu', '--disable-dawn-features=use_dxc'] });
const failures = [];
try {
  for (const [name, url, check] of [
    ['intro', '/?preloader=0', async (p) => p.waitForSelector('h1, h2', { timeout: 15000 })],
    ['preloader', '/?preloader=1', async (p) => { await p.waitForTimeout(6000); }],
    ['about', '/?preloader=0#/about', async (p) => p.waitForSelector('h1', { timeout: 15000 })],
    ['live', '/?preloader=0#/live', async (p) => {
      await p.waitForSelector('.lv.is-ready', { timeout: 40000 });
      await p.waitForTimeout(3000);
      // a screenshot, not a canvas readback: WebGL buffers read back blank
      const shot = join(tmpdir(), 'terrarium-smoke-live.png');
      await p.screenshot({ path: shot });
      const { data } = readPng(shot);
      let mn = 255, mx = 0; for (let i = 0; i < data.length; i += 4 * 97) { const l = (data[i] + data[i + 1] + data[i + 2]) / 3; mn = Math.min(mn, l); mx = Math.max(mx, l); }
      const spread = mx - mn;
      if (spread < 30) failures.push(`live: the canvas looks blank (luminance spread ${spread.toFixed(0)})`);
    }],
    ['cycle', '/?preloader=0', async (p) => {
      await p.waitForSelector('h1, h2', { timeout: 15000 });
      await p.waitForTimeout(1500);
      const snap = () => p.evaluate(() => ({
        canvases: document.querySelectorAll('canvas').length,
        jarCanvases: document.querySelectorAll('canvas.lv-canvas').length,
        classes: [...document.documentElement.classList].sort().join(' '),
        brain: document.documentElement.hasAttribute('data-ui-brain'),
        hooks: '__live' in window || '__intro' in window,
      }));
      const initial = await snap();
      for (let i = 0; i < 3; i++) {
        await p.evaluate(() => { location.hash = '#/live'; });
        await p.waitForSelector('.lv.is-ready', { timeout: 40000 });
        await p.waitForTimeout(1000);
        await p.evaluate(() => { location.hash = '#/about'; });
        await p.waitForSelector('.ab-title', { timeout: 15000 });
        await p.waitForTimeout(500);
        await p.evaluate(() => { location.hash = '#/'; });
        await p.waitForSelector('[data-route="/"] h1, [data-route="/"] h2', { timeout: 15000 });
        await p.waitForTimeout(1500);
      }
      const after = await snap();
      // the intro draws a few canvases of its own: back on it, exactly those, and no jar
      if (after.canvases !== initial.canvases || after.jarCanvases) failures.push(`cycle: ${after.canvases} canvases (${after.jarCanvases} jar) after three round trips, ${initial.canvases} at the start`);
      if (after.classes !== initial.classes) failures.push(`cycle: <html> classes "${after.classes}", started as "${initial.classes}"`);
      if (after.brain) failures.push('cycle: data-ui-brain left on <html>');
      if (after.hooks) failures.push('cycle: dev hooks (window.__live / __intro) in the production build');
      console.log(`cycle: start ${JSON.stringify(initial)} end ${JSON.stringify(after)}`);
    }],
  ]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errs = [];
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    page.on('requestfailed', (r) => errs.push('request failed: ' + r.url()));
    page.on('response', (r) => {
      if (r.status() >= 400) errs.push(`${r.status()} ${r.url()}`);
      const { pathname } = new URL(r.url());
      const type = r.headers()['content-type'] || '';
      if (pathname.startsWith('/art/') && !type.startsWith('image/')) errs.push(`${pathname} served as "${type}", not an image (missing file?)`);
      if (pathname.startsWith('/fonts/') && !type.startsWith('font/')) errs.push(`${pathname} served as "${type}", not a font (missing file?)`);
    });
    await page.goto(`http://localhost:${port}${url}`);
    try { await check(page); } catch (e) { errs.push('check: ' + e.message.split('\n')[0]); }
    for (const e of errs) failures.push(`${name}: ${e.slice(0, 200)}`);
    console.log(`${name}: ${errs.length ? 'FAIL' : 'ok'}`);
    await page.close();
  }
} finally {
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
}
console.log(failures.length ? 'FAILED:\n- ' + failures.join('\n- ') : 'production build: all routes ok');
process.exit(failures.length ? 1 : 0);
