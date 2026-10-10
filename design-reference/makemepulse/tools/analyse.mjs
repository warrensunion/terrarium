/**
 * Turns a record.mjs run into numbers for NOTES.md.
 *
 *   node design-reference/makemepulse/tools/analyse.mjs 1440x900
 *
 * Frames are JPEGs; decoding them needs an image library or a browser, and
 * Playwright's Chromium is already here, so every pixel measure runs in a
 * page (file:// next to the frames) on frames scaled to 480 px wide.
 *
 * Measures:
 *  - progress curves for every transition (1 - distance to the end frame
 *    / distance start->end), fitted against GSAP's Power0-4 in/out/inOut
 *    to name the ease, its duration and its delay after the click
 *  - per-band horizontal/vertical shift after each instant mouse jump
 *    (1-D cross-correlation of column / row luminance profiles, sub-pixel),
 *    giving the parallax amplitude per depth band and the follow lag
 *  - the preloader line's length and the landing disc's radius over time
 *  - grading per scene: luminance percentiles, saturation, vignette ratio,
 *    a 6-colour palette
 *  - contact sheets of each transition (rec/<size>/sheet-*.jpg)
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SIZE = process.argv[2] || '1440x900';
const [W, H] = SIZE.split('x').map(Number);
const FR = resolve(HERE, '../frames', SIZE);
const REC = resolve(HERE, '../rec', SIZE);
const J = JSON.parse(readFileSync(`${REC}/events.json`, 'utf8'));
const frames = J.frames.map(([t, w], i) => ({ i, t, w, f: `${String(i).padStart(5, '0')}.jpg` }));
const nFiles = readdirSync(FR).length;
if (nFiles !== frames.length) console.warn(`frames on disk ${nFiles} vs logged ${frames.length}`);

// event time (wall clock) -> CDP clock: the wall stamp of a frame is its CDP
// time plus delivery latency; the smallest latency nearby is the true offset.
function toCdp(tw) {
  const near = frames.filter((f) => Math.abs(f.w - tw) < 6);
  const off = Math.min(...near.map((f) => f.w - f.t));
  return tw - off;
}
const E = {}; for (const e of J.events) E[e.name] = toCdp(e.t);
const between = (a, b) => frames.filter((f) => f.t >= a && f.t <= b);

// --- browser helpers --------------------------------------------------------
const browser = await chromium.launch();
const page = await browser.newPage();
// frames served from disk on a fake origin: file:// pages taint every canvas read
await page.route('http://frames.local/**', (r) => { const f = r.request().url().split('/').pop(); return f ? r.fulfill({ body: readFileSync(`${FR}/${f}`), contentType: 'image/jpeg' }) : r.fulfill({ body: '<!doctype html>', contentType: 'text/html' }); });
await page.goto('http://frames.local/');
await page.evaluate(() => {
  const SW = 480;
  window.__load = async (f) => {
    const img = new Image(); img.src = f; await img.decode();
    const sh = Math.round(img.height * SW / img.width);
    const c = new OffscreenCanvas(SW, sh); const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0, SW, sh);
    return { w: SW, h: sh, d: x.getImageData(0, 0, SW, sh).data };
  };
  const cache = new Map();
  window.__get = async (f) => { if (!cache.has(f)) { if (cache.size > 400) cache.clear(); cache.set(f, await window.__load(f)); } return cache.get(f); };
  window.__lum = (d, i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
});

// mean abs pixel difference between two frames
const diff = (a, b) => page.evaluate(async ([a, b]) => {
  const A = await __get(a), B = await __get(b); let s = 0;
  for (let i = 0; i < A.d.length; i += 4) s += Math.abs(A.d[i] - B.d[i]) + Math.abs(A.d[i + 1] - B.d[i + 1]) + Math.abs(A.d[i + 2] - B.d[i + 2]);
  return s / (A.d.length / 4) / 3;
}, [a, b]);

// --- ease fitting -----------------------------------------------------------
const pin = (n) => (t) => t ** n, pout = (n) => (t) => 1 - (1 - t) ** n;
const pinout = (n) => (t) => (t < 0.5 ? (2 * t) ** n / 2 : 1 - (2 - 2 * t) ** n / 2);
const EASES = { linear: (t) => t };
['Power1', 'Power2', 'Power3', 'Power4'].forEach((k, j) => { const n = j + 2; EASES[k + '.easeIn'] = pin(n); EASES[k + '.easeOut'] = pout(n); EASES[k + '.easeInOut'] = pinout(n); });
EASES['expo.out'] = (t) => (t === 1 ? 1 : 1 - 2 ** (-10 * t));
function fit(samples) { // samples [{t, p}], t relative to the trigger
  let best = null;
  for (const [name, e] of Object.entries(EASES))
    for (let t0 = -0.1; t0 <= 1.5; t0 += 0.02)
      for (let D = 0.2; D <= 3.5; D += 0.02) {
        let s = 0; for (const { t, p } of samples) { const u = Math.min(1, Math.max(0, (t - t0) / D)); const r = e(u) - p; s += r * r; }
        if (!best || s < best.sse) best = { ease: name, delay: +t0.toFixed(2), duration: +D.toFixed(2), sse: s };
      }
  best.rms = +Math.sqrt(best.sse / samples.length).toFixed(3); delete best.sse; return best;
}
// progress of a transition from trigger time a over `span` seconds
async function progress(a, span, tag) {
  const fs = between(a - 0.15, a + span);
  if (fs.length < 4) return { tag, error: 'too few frames' };
  const s = fs[0].f, e = fs.at(-1).f; const total = await diff(s, e);
  const samples = [];
  for (const f of fs) samples.push({ t: +(f.t - a).toFixed(3), p: +(1 - (await diff(f.f, e)) / total).toFixed(3) });
  // the curve may overshoot/settle; clamp for the fit
  const clean = samples.map((x) => ({ t: x.t, p: Math.min(1, Math.max(0, x.p)) }));
  return { tag, frames: fs.length, startToEndDiff: +total.toFixed(1), fit: fit(clean), curve: samples.filter((_, k) => k % Math.ceil(samples.length / 24) === 0) };
}

// --- parallax: shift per band after an instant mouse jump ---------------------
const BANDS = 8;
const shiftsVs = (ref, f) => page.evaluate(async ([ref, f, BANDS]) => {
  const A = await __get(ref), B = await __get(f); const out = [];
  for (let b = 0; b < BANDS; b++) {
    const y0 = Math.floor(A.h * b / BANDS), y1 = Math.floor(A.h * (b + 1) / BANDS);
    const colA = new Float32Array(A.w), colB = new Float32Array(A.w);
    const rowA = new Float32Array(y1 - y0), rowB = new Float32Array(y1 - y0);
    for (let y = y0; y < y1; y++) for (let x = 0; x < A.w; x++) {
      const i = (y * A.w + x) * 4; const la = __lum(A.d, i), lb = __lum(B.d, i);
      colA[x] += la; colB[x] += lb; rowA[y - y0] += la; rowB[y - y0] += lb;
    }
    const best = (p, q, R) => { // shift s maximising normalised correlation of q(x) with p(x - s)
      const m = (v) => { let s = 0; for (const x of v) s += x; return s / v.length; };
      const mp = m(p), mq = m(q); const sc = [];
      for (let s = -R; s <= R; s++) {
        let num = 0, da = 0, db = 0;
        for (let x = R; x < p.length - R; x++) { const a = p[x - s] - mp, c = q[x] - mq; num += a * c; da += a * a; db += c * c; }
        sc.push(num / Math.sqrt(da * db + 1e-9));
      }
      let k = 0; for (let j = 1; j < sc.length; j++) if (sc[j] > sc[k]) k = j;
      let sub = 0; if (k > 0 && k < sc.length - 1) { const a = sc[k - 1], c = sc[k + 1], d = a - 2 * sc[k] + c; if (d < 0) sub = 0.5 * (a - c) / d; }
      return { s: k - R + sub, c: sc[k] };
    };
    const bx = best(colA, colB, 30), by = best(rowA, rowB, Math.min(12, (y1 - y0) >> 2));
    out.push({ dx: bx.s, cx: bx.c, dy: by.s, cy: by.c });
  }
  return out;
}, [ref, f, BANDS]);
async function stepResponse(name, next, axis) {
  const a = E[name], b = E[next] ?? a + 3;
  const ref = between(a - 0.6, a).at(-1); if (!ref) return { name, error: 'no ref' };
  const fs = between(a, b);
  const scale = W / 480; const series = [];
  for (const f of fs) series.push({ t: +(f.t - a).toFixed(3), bands: (await shiftsVs(ref.f, f.f)).map((s) => +(s[axis] * scale).toFixed(1)) });
  const final = series.at(-1)?.bands || [];
  const lag = final.map((v, k) => { // time to 63% and 90% of the final shift, per band
    if (Math.abs(v) < 2) return null;
    const t63 = series.find((s) => s.bands[k] / v >= 0.63)?.t, t90 = series.find((s) => s.bands[k] / v >= 0.9)?.t;
    return { t63, t90, lambda: t63 ? +(1 / t63).toFixed(2) : null };
  });
  return { name, axis, finalShiftPx: final, lag, series: series.filter((_, k) => k % 2 === 0).slice(0, 30) };
}

// --- preloader & landing ----------------------------------------------------
async function preloader() {
  const fs = between(E.goto, E['disc-visible'] + 1.5); const out = [];
  for (const f of fs) out.push({ t: +(f.t - E.goto).toFixed(2), ...(await page.evaluate(async (f) => {
    const A = await __get(f); let line = 0, disc = 0; const cx = A.w >> 1, cy = A.h >> 1;
    for (let y = 0; y < A.h; y++) { let lit = false; for (let x = cx - 12; x <= cx + 12; x++) if (__lum(A.d, (y * A.w + x) * 4) > 200) lit = true; if (lit) line++; }
    for (let x = 0; x < A.w; x++) if (__lum(A.d, (cy * A.w + x) * 4) > 200) disc++;
    return { lineFrac: +(line / A.h).toFixed(3), discFracW: +(disc / A.w).toFixed(3) };
  }, f.f)) });
  return out;
}
async function discRadius(a, span) {
  const out = [];
  for (const f of between(a - 0.1, a + span)) out.push({ t: +(f.t - a).toFixed(3), r: await page.evaluate(async (f) => { const A = await __get(f); const cy = A.h >> 1; let n = 0; for (let x = 0; x < A.w; x++) if (__lum(A.d, (cy * A.w + x) * 4) > 200) n++; return n / A.h / 2; }, f.f) });
  const r0 = out[0]?.r, r1 = out.at(-1)?.r;
  const samples = out.map((o) => ({ t: o.t, p: Math.min(1, Math.max(0, (o.r - r0) / ((r1 - r0) || 1))) }));
  return { r0: +r0?.toFixed(3), r1: +r1?.toFixed(3), unit: 'radius / viewport height', fit: fit(samples) };
}

// --- grading ----------------------------------------------------------------
async function grading(file) {
  return page.evaluate(async (src) => {
    const A = await __get(src); const L = []; let sat = 0; const px = [];
    for (let i = 0; i < A.d.length; i += 4) {
      const r = A.d[i], g = A.d[i + 1], b = A.d[i + 2]; L.push(__lum(A.d, i));
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b); sat += mx ? (mx - mn) / mx : 0;
      if ((i / 4) % 7 === 0) px.push([r, g, b]);
    }
    const s = [...L].sort((a, b) => a - b); const q = (p) => +s[Math.floor(p * (s.length - 1))].toFixed(0);
    const region = (x0, y0, x1, y1) => { let t = 0, n = 0; for (let y = Math.floor(y0 * A.h); y < y1 * A.h; y++) for (let x = Math.floor(x0 * A.w); x < x1 * A.w; x++) { t += L[y * A.w + x]; n++; } return t / n; };
    const corners = (region(0, 0, 0.12, 0.12) + region(0.88, 0, 1, 0.12) + region(0, 0.88, 0.12, 1) + region(0.88, 0.88, 1, 1)) / 4;
    // k-means, 6 colours, 8 rounds, deterministic seeds along the luminance range
    const byL = [...px].sort((a, b) => a[0] + a[1] + a[2] - b[0] - b[1] - b[2]);
    let C = [0, 1, 2, 3, 4, 5].map((k) => [...byL[Math.floor((k + 0.5) / 6 * (byL.length - 1))]]);
    let cnt;
    for (let round = 0; round < 8; round++) {
      const acc = C.map(() => [0, 0, 0]); cnt = C.map(() => 0);
      for (const p of px) { let bi = 0, bd = 1e9; C.forEach((c, k) => { const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2; if (d < bd) { bd = d; bi = k; } }); acc[bi][0] += p[0]; acc[bi][1] += p[1]; acc[bi][2] += p[2]; cnt[bi]++; }
      C = C.map((c, k) => (cnt[k] ? acc[k].map((v) => v / cnt[k]) : c));
    }
    const hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
    return { lumP1: q(0.01), lumP50: q(0.5), lumP99: q(0.99), meanSat: +(sat / L.length).toFixed(3), vignette: +(corners / region(0.35, 0.35, 0.65, 0.65)).toFixed(3), palette: C.map((c, k) => ({ hex: hex(c), share: +(cnt[k] / px.length).toFixed(2) })).sort((a, b) => b.share - a.share) };
  }, file);
}

// --- contact sheets -----------------------------------------------------------
async function sheet(name, a, span, n = 12) {
  const fs = between(a, a + span); if (!fs.length) return;
  const pick = Array.from({ length: n }, (_, k) => fs[Math.min(fs.length - 1, Math.round(k * (fs.length - 1) / (n - 1)))]);
  const b64 = await page.evaluate(async (pick) => {
    const cols = 4, tw = 360, th = Math.round(tw * 0.625) + 18; const c = new OffscreenCanvas(cols * tw, Math.ceil(pick.length / cols) * th); const x = c.getContext('2d');
    x.fillStyle = '#111'; x.fillRect(0, 0, c.width, c.height); x.font = '13px sans-serif'; x.fillStyle = '#eee';
    for (let k = 0; k < pick.length; k++) { const img = new Image(); img.src = pick[k].f; await img.decode(); const cx = (k % cols) * tw, cy = Math.floor(k / cols) * th; x.drawImage(img, cx, cy + 18, tw, th - 18); x.fillText(`+${pick[k].dt.toFixed(2)} s`, cx + 4, cy + 13); }
    const blob = await c.convertToBlob({ type: 'image/jpeg', quality: 0.8 }); const buf = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000)); return btoa(s);
  }, pick.map((f) => ({ f: f.f, dt: f.t - a })));
  writeFileSync(`${REC}/sheet-${name}.jpg`, Buffer.from(b64, 'base64'));
}

// --- run ----------------------------------------------------------------------
const R = { size: SIZE, eventsCdp: Object.fromEntries(Object.entries(E).map(([k, v]) => [k, +v.toFixed(3)])) };
R.preloader = await preloader();
R.discHover = await discRadius(E['hover-disc'], 2.4);
R.discUnhover = await discRadius(E['unhover-disc'], 2.4);
R.transitions = [];
const T = [['enter->title', 'click-enter', 9], ['start->scene1', 'click-start', 6], ['hover-start', 'hover-start', 1.2], ['hover-enter', 'hover-enter', 1.2]];
for (const n of Object.keys(E)) { const m = n.match(/^scene-(\d)-click-next$/); if (m) T.push([`next${m[1]}->scene${+m[1] + 1}`, n, 8]); const h = n.match(/^scene-(\d)-hover-next$/); if (h) T.push([`hover-next${h[1]}`, n, 1.2]); }
for (const [tag, ev, span] of T) if (E[ev] !== undefined) { R.transitions.push(await progress(E[ev], span, tag)); await sheet(tag.replace(/[^a-z0-9]+/gi, '-'), E[ev], span); }
await sheet('preloader', E.goto, E['disc-visible'] - E.goto + 1.5, 16);
R.parallax = [];
for (const [n, nx, ax] of [['mouse-L', 'mouse-R', 'dx'], ['mouse-R', 'mouse-C', 'dx'], ['mouse-T', 'mouse-B', 'dy'], ['mouse-B', 'sweep-done', 'dy']]) if (E[n] !== undefined) R.parallax.push(await stepResponse(n, nx, ax));
for (const n of Object.keys(E)) { const m = n.match(/^s(\d)-mouse-([LR])$/); if (m) R.parallax.push(await stepResponse(n, m[2] === 'L' ? `s${m[1]}-mouse-R` : `s${m[1]}-mouse-C`, 'dx')); }
R.wheel = { diffBeforeAfter: await (async () => { const a = between(E['wheel-done'] - 1.2, E['wheel-done'] - 0.8).at(0), b = between(E['wheel-done'] + 1, E['wheel-done'] + 1.6).at(-1); return a && b ? +(await diff(a.f, b.f)).toFixed(2) : null; })() };
R.grading = {};
for (const [k, ev] of [['landing', 'hover-disc'], ['title', 'hover-start'], ['scene1', 'mouse-C'], ...Object.keys(E).filter((n) => /^scene-\d-settled$/.test(n)).map((n) => [n.replace('-settled', ''), n])]) { const f = between(E[ev] - 0.8, E[ev]).at(-1); if (f) R.grading[k] = await grading(f.f); }
R.type = J.type;
await browser.close();
writeFileSync(`${REC}/analysis.json`, JSON.stringify(R, null, 1));
console.log('wrote', `${REC}/analysis.json`);
