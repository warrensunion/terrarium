/**
 * The preloader: the first thing anyone sees, so it has to be honest and
 * crafted. A hand-drawn stem is traced from the bottom up by REAL progress
 * (fonts + scene 1's art + the intro chunk, weighted by size), never by a
 * timer, but never faster than 1.2 s so it cannot flash. Then the
 * makemepulse rhythm (NOTES.md §1, §6): the line fades (0.3 s), one empty
 * beat (0.6 s), the sprout pops in (expo-out 0.28 s from scale 0.6) with the
 * wordmark, and its disc grows to fill the screen (1.2 s Power3.easeInOut)
 * as a circular window onto scene 1.
 *
 * The markup and first-paint CSS live inline in index.html (it must look right
 * before any JS runs); a tiny classic script there decides on/off before
 * first paint. This module runs from the entry chunk and is shared with the
 * intro screen, which calls reveal() once its stage is decoded.
 */
import { prefersReducedMotion, log } from '../core/env.js';
import { expoOut, p3inOut, p4out, damp, clamp, range } from '../core/ease.js';
import { FIRST_SCENE, KB, load } from './assets.js';

const KEY = 'terrarium:preloaded';
const MIN_TRACE = 1.2; // s
const GUIDE_AT = 0.4; // s

const root = typeof document !== 'undefined' ? document.getElementById('pl') : null;
const on = !!root && document.documentElement.dataset.pl === 'on';

let real = 0;           // weighted real progress 0..1
let shown = 0;          // what the stem shows
let phase = on ? 'load' : 'off'; // load → popped → revealing → off
let resolveReady;
const popped = new Promise((r) => (resolveReady = r));
let raf = 0;

function weighted(items) {
  const total = items.reduce((s, i) => s + i.w, 0);
  let done = 0;
  return items.map((i) => i.p.then(() => { done += i.w; real = done / total; }));
}

function start() {
  if (!on) return;
  const reduced = prefersReducedMotion();
  root.classList.toggle('pl-reduced', reduced);
  try { sessionStorage.setItem(KEY, '1'); } catch { /* private mode */ }

  // the intro chunk counts: it is the biggest single wait on a cold load
  const chunk = import('./screen.js').catch((e) => console.error(e));
  const fonts = document.fonts
    ? Promise.all([document.fonts.load('400 1em "IM Fell English"'), document.fonts.load('400 1em "Hanken Grotesk"')]).catch(() => {})
    : Promise.resolve();
  weighted([
    { p: fonts, w: 120 },
    { p: chunk, w: 160 },
    { p: load('preloader-sprout'), w: KB['preloader-sprout'] },
    ...FIRST_SCENE.map((n) => ({ p: load(n), w: KB[n] || 12 })),
  ]);

  const trace = root.querySelector('.pl-trace');
  const num = root.querySelector('.pl-num');
  const t0 = performance.now();
  let last = t0, doneAt = 0;

  const tick = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = (now - t0) / 1000;
    if (phase === 'load') {
      root.classList.toggle('pl-guide-on', t > GUIDE_AT);
      const cap = reduced ? 1 : clamp((t - GUIDE_AT) / MIN_TRACE, 0, 1);
      const goal = Math.min(real, cap);
      shown = goal >= 1 && shown > 0.995 ? 1 : damp(shown, goal, 9, dt);
      trace.style.strokeDashoffset = String(1 - shown);
      const pct = Math.round(shown * 100);
      root.setAttribute('aria-valuenow', String(pct));
      if (num) num.textContent = pct + '%';
      if (shown >= 1) { phase = 'out'; doneAt = t; root.classList.add('pl-traced'); }
    } else if (phase === 'out') {
      // 0.3 s line fade (CSS) + 0.6 s empty beat, then the pop
      if (t - doneAt >= (reduced ? 0 : 0.9)) {
        phase = 'popped';
        root.classList.add('pl-pop');
        if (!reduced) popIn(root.querySelector('.pl-disc'));
        // let the wordmark be read before the curtain lifts
        setTimeout(resolveReady, reduced ? 200 : 1100);
      }
    }
    if (phase === 'load' || phase === 'out') raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  // leaving for another route while loading: just get out of the way
  addEventListener('hashchange', onRoute);
  breathe(root.querySelector('.pl-disc'));
  log('preloader on');
}

function onRoute() {
  const h = location.hash.replace(/^#/, '') || '/';
  if (h !== '/') dismiss();
}

/** pop: expo-out 0.28 s from scale 0.6 (NOTES.md §6) */
function popIn(el) {
  const t0 = performance.now();
  const step = (now) => {
    const k = clamp((now - t0) / 280, 0, 1);
    const e = expoOut(k);
    el.style.setProperty('--pop', String(0.6 + 0.4 * e));
    el.style.opacity = String(clamp(k * 3, 0, 1));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** hover breath: +16% expo-out 0.28 s, back with Power4.easeOut 1.6 s */
function breathe(el) {
  let from = 1, to = 1, t0 = 0, dur = 1, ease = expoOut, v = 1, id = 0;
  const run = (now) => {
    const k = clamp((now - t0) / dur, 0, 1);
    v = from + (to - from) * ease(k);
    el.style.setProperty('--breath', String(v));
    id = k < 1 ? requestAnimationFrame(run) : 0;
  };
  const go = (target, ms, e) => {
    if (phase !== 'popped' || prefersReducedMotion()) return;
    from = v; to = target; dur = ms; ease = e; t0 = performance.now();
    if (!id) id = requestAnimationFrame(run);
  };
  el.addEventListener('pointerenter', () => go(1.16, 280, expoOut));
  el.addEventListener('pointerleave', () => go(1, 1600, p4out));
}

export const preloader = {
  get active() { return phase !== 'off'; },
  /** resolves when the sprout has popped and been seen; immediately if off */
  ready() { return on ? popped : Promise.resolve(); },
  /**
   * The disc grows into a circular window onto `stage` (1.2 s
   * Power3.easeInOut), then the preloader is removed. Reduced motion: a 400 ms
   * cross-fade.
   */
  async reveal(stage) {
    if (phase === 'off') return;
    await popped;
    if (phase === 'off') return;
    phase = 'revealing';
    const reduced = prefersReducedMotion();
    const disc = root.querySelector('.pl-disc');
    stage.style.zIndex = '60';
    if (reduced) {
      stage.style.opacity = '0';
      stage.style.transition = 'opacity 400ms linear';
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      stage.style.opacity = '1';
      await new Promise((r) => setTimeout(r, 420));
      stage.style.transition = '';
    } else {
      const W = innerWidth, H = innerHeight;
      const r0 = discRadius(W, H);
      const r1 = Math.hypot(W, H) / 2 + 2;
      await new Promise((resolve) => {
        const t0 = performance.now();
        const step = (now) => {
          const t = (now - t0) / 1000;
          const k = clamp(t / 1.2, 0, 1);
          const r = r0 + (r1 - r0) * p3inOut(k);
          stage.style.clipPath = `circle(${r.toFixed(1)}px at 50% 50%)`;
          // the jar world fades up inside the disc while the sprout lets go
          stage.style.opacity = String(range(t, 0.12, 0.85));
          disc.style.setProperty('--grow', String(r / r0));
          if (k < 1) requestAnimationFrame(step); else resolve();
        };
        requestAnimationFrame(step);
      });
      stage.style.clipPath = '';
    }
    stage.style.opacity = '';
    stage.style.zIndex = '';
    dismiss();
  },
};

/** the fog disc's radius: 0.29 of the viewport height (NOTES.md §1), smaller on narrow phones */
export function discRadius(W, H) {
  return Math.min(0.29 * H, 0.42 * W);
}

function dismiss() {
  if (phase === 'off' && !root?.isConnected) return;
  phase = 'off';
  cancelAnimationFrame(raf);
  removeEventListener('hashchange', onRoute);
  resolveReady?.();
  root?.remove();
  document.documentElement.dataset.pl = 'off';
}

start();
