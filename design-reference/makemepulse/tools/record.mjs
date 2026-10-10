/**
 * Records 2019.makemepulse.com for measurement, at one viewport size.
 *
 * Why a screencast and not screenshots: page.screenshot() takes 50-100 ms, too
 * slow to read an easing curve. CDP's Page.startScreencast hands over every
 * composited frame with its own timestamp, so the curves in NOTES.md come from
 * real frame times. Every scripted action is logged with the same clock
 * (events.json), so analyse.mjs can cut the frame stream into segments.
 *
 *   node design-reference/makemepulse/tools/record.mjs 1440x900
 *   node design-reference/makemepulse/tools/record.mjs 1920x1080
 *
 * Writes design-reference/makemepulse/frames/<size>/ (gitignored: raw frames)
 * and design-reference/makemepulse/rec/<size>/ (video.webm, events.json, keyframes).
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, rmSync, readdirSync, renameSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

const HERE = dirname(fileURLToPath(import.meta.url));
const SIZE = process.argv[2] || '1440x900';
const [W, H] = SIZE.split('x').map(Number);
const FR = resolve(HERE, '../frames', SIZE);
const REC = resolve(HERE, '../rec', SIZE);
rmSync(FR, { recursive: true, force: true }); mkdirSync(FR, { recursive: true }); mkdirSync(REC, { recursive: true });

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=default', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: REC, size: { width: W, height: H } } });
const p = await ctx.newPage();
const cdp = await ctx.newCDPSession(p);

// --- frame stream -----------------------------------------------------------
const frames = []; // { i, t } t = seconds on the CDP clock
let T0 = null;
cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
  if (T0 === null) T0 = metadata.timestamp;
  const i = frames.length; const t = metadata.timestamp - T0;
  frames.push({ i, t: +t.toFixed(4), w: wall0 === null ? 0 : +now().toFixed(4) });
  writeFileSync(`${FR}/${String(i).padStart(5, '0')}.jpg`, Buffer.from(data, 'base64'));
  cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
});
const events = [];
// the event clock: wall time mapped onto the CDP clock at start
let wall0 = null;
const now = () => (Date.now() - wall0) / 1000;
const ev = (name, extra = {}) => { const e = { name, t: +now().toFixed(3), ...extra }; events.push(e); console.log(`[${SIZE}] ${e.t.toFixed(2)}s ${name}`, Object.keys(extra).length ? JSON.stringify(extra) : ''); };
const wait = (ms) => p.waitForTimeout(ms);

// one pixel of the composited page, decoded from a 1x1 PNG (no image library)
async function pixel(x, y) {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', clip: { x, y, width: 1, height: 1, scale: 1 } });
  const buf = Buffer.from(data, 'base64');
  let o = 8; const idat = [];
  while (o < buf.length) { const len = buf.readUInt32BE(o); const type = buf.toString('ascii', o + 4, o + 8); if (type === 'IDAT') idat.push(buf.subarray(o + 8, o + 8 + len)); o += 12 + len; }
  const raw = inflateSync(Buffer.concat(idat)); // filter byte + RGB(A)
  return [raw[1], raw[2], raw[3]];
}
const lum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

// a DOM button (Start / Next) that is really on screen
const visibleButton = (text) => p.evaluate((text) => {
  for (const e of document.querySelectorAll('.button-xp')) {
    if (!e.textContent.trim().toLowerCase().includes(text)) continue;
    const r = e.getBoundingClientRect(); if (r.width < 5) continue;
    let o = 1; for (let n = e; n; n = n.parentElement) o *= +getComputedStyle(n).opacity;
    if (o > 0.9 && !e.classList.contains('is-hidden')) return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height };
  }
  return null;
}, text);
async function waitButton(text, ms) { const t = Date.now(); while (Date.now() - t < ms) { const b = await visibleButton(text); if (b) return b; await wait(150); } return null; }

// --- go ---------------------------------------------------------------------
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 70, everyNthFrame: 1 });
wall0 = Date.now();
ev('goto');
await p.goto('https://2019.makemepulse.com/', { timeout: 90000 });
ev('loaded');

// preloader: wait for the paper disc (centre pixel turns light)
for (let k = 0; k < 400; k++) { if (lum(await pixel(W / 2, H * 0.3)) > 200) break; await wait(100); }
ev('disc-visible');
await wait(2500);
await p.mouse.move(W / 2, H / 2, { steps: 1 }); ev('hover-disc'); await wait(2500);
await p.mouse.move(W * 0.1, H / 2, { steps: 1 }); ev('unhover-disc'); await wait(2500);
await p.mouse.move(W / 2, H / 2, { steps: 1 }); ev('hover-disc-2'); await wait(1500);
// Enter sits low in the grown disc (0.70 of the height at every size seen)
await p.mouse.move(W / 2, H * 0.70, { steps: 1 }); ev('hover-enter'); await wait(1200);
await p.mouse.click(W / 2, H * 0.70); ev('click-enter');

const start = await waitButton('start', 40000);
ev('start-visible', { start });
await wait(2000);
if (start) {
  await p.mouse.move(start.x, start.y, { steps: 1 }); ev('hover-start'); await wait(1200);
  await p.mouse.move(start.x, start.y + 120, { steps: 1 }); ev('unhover-start'); await wait(1200);
  await p.mouse.click(start.x, start.y); ev('click-start');
}
await wait(9000); ev('scene-1-settled');

// mouse step tests: instant jumps, held 3 s, to read parallax per layer and the lag
const steps = [['C', 0.5, 0.5], ['L', 0.05, 0.5], ['R', 0.95, 0.5], ['C', 0.5, 0.5], ['T', 0.5, 0.08], ['B', 0.5, 0.92], ['C', 0.5, 0.5]];
for (const [n, x, y] of steps) { await p.mouse.move(W * x, H * y, { steps: 1 }); ev(`mouse-${n}`, { x, y }); await wait(3000); }
// slow sweep (circle) for the video
for (let k = 0; k <= 120; k++) { const a = (k / 120) * Math.PI * 2; await p.mouse.move(W * (0.5 + 0.4 * Math.cos(a)), H * (0.5 + 0.35 * Math.sin(a))); await wait(33); }
ev('sweep-done');
// wheel: does anything scroll?
await p.mouse.move(W / 2, H / 2);
for (let k = 0; k < 6; k++) { await p.mouse.wheel(0, 400); await wait(120); }
ev('wheel-done'); await wait(2000);

// scenes: do the scene's gesture, wait for Next, hover it, click it
const gestures = [
  async () => { await p.mouse.move(W * 0.496, H * 0.797); await p.mouse.down(); for (let k = 1; k <= 30; k++) { await p.mouse.move(W * 0.496, H * (0.797 - 0.55 * k / 30)); await wait(40); } await p.mouse.up(); },
  async () => { await p.mouse.move(W / 2, H / 2); await p.mouse.down(); await wait(3500); await p.mouse.up(); },
  async () => { await p.mouse.move(W * 0.2, H / 2); await p.mouse.down(); for (let k = 1; k <= 30; k++) { await p.mouse.move(W * (0.2 + 0.6 * k / 30), H / 2); await wait(40); } await p.mouse.up(); },
  async () => { await p.mouse.move(W * 0.5, H * 0.3); await p.mouse.down(); for (let k = 1; k <= 30; k++) { await p.mouse.move(W * 0.5, H * (0.3 + 0.5 * k / 30)); await wait(40); } await p.mouse.up(); },
];
for (let scene = 1; scene <= 6; scene++) {
  let next = null;
  for (let g = 0; g < gestures.length && !next; g++) {
    await gestures[g](); ev(`scene-${scene}-gesture-${g}`);
    next = await waitButton('next', 7000);
  }
  if (!next) { ev(`scene-${scene}-no-next`); await p.screenshot({ path: `${REC}/stuck-${scene}.jpg`, quality: 70 }); break; }
  await wait(1500);
  await p.mouse.move(next.x, next.y, { steps: 1 }); ev(`scene-${scene}-hover-next`, { next }); await wait(1200);
  await p.mouse.click(next.x, next.y); ev(`scene-${scene}-click-next`);
  await wait(10000); ev(`scene-${scene + 1}-settled`);
  await p.screenshot({ path: `${REC}/scene-${scene + 1}.jpg`, quality: 80 });
  // a short step test in every scene: left, right
  await p.mouse.move(W * 0.05, H / 2, { steps: 1 }); ev(`s${scene + 1}-mouse-L`); await wait(2500);
  await p.mouse.move(W * 0.95, H / 2, { steps: 1 }); ev(`s${scene + 1}-mouse-R`); await wait(2500);
  await p.mouse.move(W * 0.5, H / 2, { steps: 1 }); ev(`s${scene + 1}-mouse-C`); await wait(1500);
}

// typography in the DOM (subtitles, buttons)
const type = await p.evaluate(() => {
  const out = new Map();
  for (const e of document.querySelectorAll('body *')) {
    if (e.children.length || !e.textContent.trim()) continue;
    const s = getComputedStyle(e);
    const k = `${s.fontFamily} ${s.fontWeight} ${s.fontSize}/${s.lineHeight} ls=${s.letterSpacing} tt=${s.textTransform} ${s.color}`;
    out.set(k, (out.get(k) || []).concat(e.className + ': ' + e.textContent.trim().slice(0, 40)).slice(0, 4));
  }
  return [...out].map(([k, v]) => ({ style: k, eg: v }));
});
await cdp.send('Page.stopScreencast');
ev('end');
writeFileSync(`${REC}/events.json`, JSON.stringify({ size: SIZE, events, frames: frames.map(f => [f.t, f.w]), type }, null, 1));
const video = await p.video().path();
await ctx.close(); await browser.close();
renameSync(video, `${REC}/video.webm`);
for (const f of readdirSync(REC)) if (f.endsWith('.webm') && f !== 'video.webm') rmSync(`${REC}/${f}`);
console.log(`[${SIZE}] ${frames.length} frames over ${frames.at(-1)?.t.toFixed(1)} s`);
