/**
 * The intro: five scenes on a fixed stage, driven by a virtual scroll.
 *
 * Why it is built this way (NOTES.md §6): each scene has a REST segment where
 * scroll scrubs a gentle camera dolly (and the scene's living part), and the
 * pointer drives the parallax; crossing a scene's edge plays that boundary's
 * authored transition at its own timing while input is held, so a fast flick
 * never shortcuts the craft. Scrolling back plays the same transition in
 * reverse. One rAF loop does everything; it never reads layout (plane centres
 * and canvas sizes are measured on resize), and it writes only transforms and
 * opacity.
 */
import './intro.css';
import { prefersReducedMotion, param, log } from '../core/env.js';
import { clamp, p2out, p3inOut } from '../core/ease.js';
import { createVirtualScroll } from '../core/scroll.js';
import { createPointer } from './parallax.js';
import { SCENES, buildScene } from './scenes.js';
import { TRANSITIONS, crossFade, pushIn } from './transitions.js';
import { preloader } from './preloader.js';
import { createGenes } from './genes.js';
import { createBrain } from './brain.js';
import { createTree } from './tree.js';

const EDGE = 0.12; // scroll this far past a scene's end to cross into the next
const LIVING = { genes: createGenes, brain: createBrain, tree: createTree };

export default function introScreen(root, { go }) {
  const reduced = prefersReducedMotion();
  const touch = matchMedia('(hover: none) and (pointer: coarse)').matches;
  const perWord = innerWidth < 700;
  document.documentElement.classList.add('in-lock');

  // ---- DOM ---------------------------------------------------------------
  const stage = document.createElement('main');
  stage.className = 'in-stage' + (reduced ? ' in-reduced' : '') + (touch ? ' in-touch' : '');
  stage.setAttribute('aria-label', 'Terrarium, an introduction in five parts');
  const scenes = SCENES.map((_, i) => buildScene(i, { perWord, touch }));
  for (const s of scenes) {
    s.view = { planes: s.planes, copy: s.copy.mod, root: s.rootMod };
    s.living = s.def.live ? LIVING[s.def.live](s.host, { reduced, touch }) : null;
    s.isReady = false;
    Promise.all([s.ready, s.living?.ready]).then(() => { s.isReady = true; });
    stage.append(s.root);
  }
  const div = (cls) => { const d = document.createElement('div'); d.className = cls; return d; };
  const shade = div('in-shade');
  const fog = div('in-fog');
  const grain = div('in-grain');
  const vignette = div('in-vignette');
  const live = document.createElement('p');
  live.className = 'sr-only';
  live.setAttribute('aria-live', 'polite');
  const rail = document.createElement('nav');
  rail.className = 'in-rail';
  rail.setAttribute('aria-label', 'Intro parts');
  const dots = SCENES.map((d, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'in-dot';
    b.setAttribute('aria-label', `Part ${i + 1}: ${d.title}`);
    b.innerHTML = `<span class="in-dot-label" aria-hidden="true">${d.title}</span>`;
    b.addEventListener('click', () => goTo(i));
    rail.append(b);
    return b;
  });
  const skip = document.createElement('a');
  skip.className = 'in-skip';
  skip.href = '#/live';
  skip.textContent = 'Skip to the jar';
  stage.prepend(skip); // first in tab order
  stage.append(shade, fog, vignette, grain, rail, live);
  root.append(stage);

  const ui = { shade: { o: 0, last: '' }, fog: { y: 0, o: 0, last: '' } };

  // ---- state -------------------------------------------------------------
  const startAt = clamp((parseInt(param('scene'), 10) || 1) - 1, 0, 4);
  let cur = startAt;
  let play = null; // { tr, A, B, t, dir, done }
  let settled = false, started = false, destroyed = false;
  let W = innerWidth, H = innerHeight;
  let raf = 0, last = performance.now();
  const t0 = last;
  let unlockTimer = 0, idleId = 0, resizeTimer = 0, pendingTo = false;
  const waiters = [];
  let timeScale = 1; // dev hook: slow transitions down to inspect them
  const pointer = createPointer({ idle: touch });

  const scroll = createVirtualScroll(stage, {
    unit: () => H * 0.9,
    min: 0, max: 1.2, lambda: 6,
    onIntent: (k) => {
      if (k === 'next') goTo(cur + 1);
      else if (k === 'prev') goTo(cur - 1);
      else if (k === 'first') goTo(0);
      else if (k === 'last') goTo(4);
    },
  });
  const bounds = () => scroll.state.bounds(cur === 0 ? 0 : -0.2, cur === 4 ? 1 : 1.2);

  // ---- layout (never inside the frame loop) ------------------------------
  function measureAll() {
    W = innerWidth; H = innerHeight;
    for (const s of scenes) {
      const hidden = !s.root.classList.contains('is-on');
      if (hidden) s.root.classList.add('is-measure');
      for (const k in s.planes) s.planes[k].measure();
      s.fxW = s.planes.fx.el.clientWidth; s.fxH = s.planes.fx.el.clientHeight;
      s.living?.resize();
      if (hidden) s.root.classList.remove('is-measure');
    }
  }
  const onResize = () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(measureAll, 120); };
  addEventListener('resize', onResize);

  const onPointer = (e) => {
    if (e.pointerType === 'touch') return;
    pointer.move(e.clientX, e.clientY, W, H);
    scenes[cur].living?.pointer?.(e.clientX, e.clientY);
  };
  stage.addEventListener('pointermove', onPointer);
  const onClick = (e) => { if (e.target.closest('.in-btn')) openJar(); };
  stage.addEventListener('click', onClick);

  // ---- scene changes -----------------------------------------------------
  const show = (s, on) => s.root.classList.toggle('is-on', on);

  function setCurrent(i) {
    dots.forEach((d, k) => { if (k === i) d.setAttribute('aria-current', 'step'); else d.removeAttribute('aria-current'); });
    stage.dataset.scene = String(i + 1);
  }

  function settle() {
    play = null;
    settled = true;
    const s = scenes[cur];
    for (const o of scenes) if (o !== s) { show(o, false); o.root.classList.remove('is-beats', 'is-moving'); }
    s.root.classList.remove('is-moving');
    s.root.classList.add('is-beats');
    live.textContent = `Part ${cur + 1} of 5: ${s.def.title}`;
    setCurrent(cur);
    bounds();
    clearTimeout(unlockTimer);
    // a short cooldown, so trackpad inertia from the last flick does not scrub on
    unlockTimer = setTimeout(() => scroll.state.lock(false), 300);
    if (cur === 0 && !idleId) prefetchJar();
    while (waiters.length) waiters.shift()();
  }

  /** play the authored transition into scene `to` (any distance: the boundary entering `to` is used) */
  function goTo(to) {
    to = clamp(to, 0, 4);
    if (!started || play || to === cur) return;
    // never show a scene before its art is decoded: wait (input stays held) and go then
    if (!scenes[to].isReady) {
      if (!pendingTo) { pendingTo = true; scroll.state.lock(true); Promise.all([scenes[to].ready, scenes[to].living?.ready]).then(() => { pendingTo = false; scenes[to].isReady = true; if (!destroyed) { scroll.state.lock(false); goTo(to); } }); }
      return;
    }
    const dir = to > cur ? 1 : -1;
    // forward: the transition that enters `to`; backward: the one that leaves `to`, reversed
    const tr = reduced ? crossFade : TRANSITIONS[dir > 0 ? to - 1 : to];
    const A = dir > 0 ? scenes[cur] : scenes[to];
    const B = dir > 0 ? scenes[to] : scenes[cur];
    scroll.state.lock(true);
    settled = false;
    scenes[to].root.classList.remove('is-beats');
    for (const s of [A, B]) { show(s, true); s.root.classList.add('is-moving'); }
    // the arriving scene's scrub position: its start going forward, its end going back
    scenes[to].p = dir > 0 ? 0 : 1;
    scenes[to].living?.enter?.(dir);
    play = { tr, A, B, t: dir > 0 ? 0 : tr.dur, dir };
    cur = to;
    scroll.state.set(dir > 0 ? 0 : 1);
    log('intro part', to + 1);
  }

  function openJar() {
    if (play || !started) return;
    const s = scenes[4];
    const pv = s.planes.pivot;
    scroll.state.lock(true);
    settled = false;
    s.root.classList.add('is-moving');
    const dummy = { planes: {}, copy: { o: 1 }, root: { x: 0, y: 0, s: 1, o: 1, card: 0 } };
    play = {
      tr: reduced ? crossFade : pushIn, A: s, B: { view: dummy, root: null }, t: 0, dir: 1,
      jar: [pv.cx, pv.cy + pv.el.offsetHeight * 0.1],
      done: () => go('#/live'),
    };
  }

  function prefetchJar() {
    // the jar screen uses three.js: fetch it while people read, when the browser is idle
    const ric = window.requestIdleCallback || ((fn) => setTimeout(fn, 1200));
    idleId = ric(() => { import('three').then(() => log('prefetched three')).catch(() => {}); }, { timeout: 4000 });
  }

  // ---- the frame ----------------------------------------------------------
  function writeRoot(s) {
    const m = s.rootMod;
    const t = reduced || (m.x === 0 && m.y === 0 && m.s === 1) ? '' : `translate3d(${m.x.toFixed(1)}px,${m.y.toFixed(1)}px,0) scale(${m.s.toFixed(4)})`;
    if (t !== s.lastT) { s.root.style.transform = t; s.lastT = t; }
    const o = m.o >= 0.999 ? '' : m.o.toFixed(3);
    if (o !== s.lastO) { s.root.style.opacity = o; s.lastO = o; }
    const card = m.card > 0.01;
    if (card !== s.card) { s.root.classList.toggle('is-card', card); s.card = card; }
    const co = s.copy.mod.o >= 0.999 ? '' : Math.max(0, s.copy.mod.o).toFixed(3);
    if (co !== s.copy.lastO) { s.copy.el.style.opacity = co; s.copy.lastO = co; }
  }
  function resetMods(s) {
    for (const k in s.planes) s.planes[k].reset();
    const m = s.rootMod; m.x = 0; m.y = 0; m.s = 1; m.o = 1; m.card = 0;
    s.copy.mod.o = 1;
  }
  function writeUi() {
    const sh = ui.shade.o.toFixed(3);
    if (sh !== ui.shade.last) { shade.style.opacity = sh; shade.style.visibility = ui.shade.o > 0.001 ? 'visible' : 'hidden'; ui.shade.last = sh; }
    const f = `${ui.fog.o.toFixed(3)}|${ui.fog.y.toFixed(1)}`;
    if (f !== ui.fog.last) {
      fog.style.opacity = ui.fog.o.toFixed(3);
      fog.style.transform = reduced ? '' : `translate3d(0,${ui.fog.y.toFixed(1)}px,0)`;
      fog.style.visibility = ui.fog.o > 0.001 ? 'visible' : 'hidden';
      ui.fog.last = f;
    }
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000) * timeScale;
    last = now;
    const t = (now - t0) / 1000;
    const st = scroll.state;
    const v = st.update(dt);
    pointer.update(dt, t);

    if (started && !play && !st.locked) {
      if (st.target >= 1 + EDGE - 1e-6 && cur < 4) goTo(cur + 1);
      else if (st.target <= -EDGE + 1e-6 && cur > 0) goTo(cur - 1);
    }
    const s = scenes[cur];
    if (!play) s.p = clamp(v, 0, 1);

    ui.shade.o = 0; ui.fog.o = 0; ui.fog.y = 0;
    const visible = [];
    if (play) {
      const { A, B } = play;
      resetMods(A);
      if (B.root) resetMods(B);
      play.t += dt * play.dir;
      const tt = clamp(play.t, 0, play.tr.dur);
      const vis = play.tr.run(tt, A.view, B.view, ui, { W, H, jar: play.jar });
      // the departing scene's words leave first (0.35 s), whichever way we travel
      const leaving = play.dir > 0 ? A : B;
      if (leaving.copy) leaving.copy.mod.o = 1 - p2out(clamp((play.dir > 0 ? tt : play.tr.dur - tt) / 0.35, 0, 1));
      show(A, vis.a);
      if (B.root) show(B, vis.b);
      if (vis.a) visible.push(A);
      if (B.root && vis.b) visible.push(B);
      const finished = play.dir > 0 ? play.t >= play.tr.dur : play.t <= 0;
      if (finished && play.done) {
        writeUi();
        for (const sc of visible) { for (const k in sc.planes) sc.planes[k].write({ nx: pointer.x, ny: pointer.y, p: sc.p ?? 0, W, H, still: reduced }); writeRoot(sc); }
        const d = play.done; play = null; d(); return;
      }
      if (finished) {
        resetMods(A); if (B.root) resetMods(B);
        ui.shade.o = 0; ui.fog.o = 0;
        settle();
      }
    } else {
      resetMods(s);
      visible.push(s);
    }
    writeUi();
    for (const sc of visible) {
      const cam = { nx: pointer.x, ny: pointer.y, p: sc.p ?? 0, W, H, still: reduced };
      for (const k in sc.planes) sc.planes[k].write(cam);
      writeRoot(sc);
      if (!reduced) sc.motes.update(dt, t, sc.fxW, sc.fxH);
      sc.living?.update(dt, t, sc.p ?? 0);
    }
  }

  // ---- start -------------------------------------------------------------
  const first = scenes[cur];
  show(first, true);
  first.p = 0;
  setCurrent(cur);
  measureAll();
  if (reduced) for (const sc of scenes) sc.motes.update(0, 0, sc.fxW || W, sc.fxH || H);
  scroll.state.lock(true);
  raf = requestAnimationFrame(frame);

  (async () => {
    await Promise.all([first.ready, first.living?.ready]);
    if (destroyed) return;
    measureAll();
    if (preloader.active) await preloader.reveal(stage);
    else if (!param('scene') && !reduced) await revealFromCentre(stage);
    if (destroyed) return;
    started = true;
    settle();
    // decode the other scenes' art while people read the first
    Promise.all(scenes.map((sc) => Promise.all([sc.ready, sc.living?.ready]))).then(() => {
      if (destroyed) return;
      measureAll();
      // bake every creature's sprites in idle time, one scene per idle slot
      const ric = window.requestIdleCallback || ((fn) => setTimeout(fn, 200));
      const queue = scenes.filter((sc) => sc.living?.warm);
      const next = () => {
        const sc = queue.shift();
        if (!sc || destroyed) return;
        sc.living.warm();
        sc.living.update(0, 0, 0); // first draw: the 2D canvas allocates its GPU surface now, not mid-transition
        ric(next, { timeout: 2000 });
      };
      ric(next, { timeout: 2000 });
    });
  })();

  if (import.meta.env.DEV) {
    window.__intro = {
      scene: () => cur + 1,
      /** plays the real transition(s) to part n; resolves when settled there */
      go: (n) => new Promise((resolve) => {
        const to = clamp(n - 1, 0, 4);
        const tryGo = () => {
          if (destroyed) return resolve();
          if (!started || play) return setTimeout(tryGo, 50);
          if (cur === to) return resolve();
          waiters.push(resolve);
          goTo(to);
        };
        tryGo();
      }),
      get settled() { return settled; },
      set timeScale(v) { timeScale = v; },
    };
  }

  return {
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      clearTimeout(unlockTimer); clearTimeout(resizeTimer);
      if (idleId) (window.cancelIdleCallback || clearTimeout)(idleId);
      removeEventListener('resize', onResize);
      stage.removeEventListener('pointermove', onPointer);
      stage.removeEventListener('click', onClick);
      scroll.destroy();
      for (const s of scenes) s.living?.destroy();
      stage.remove();
      document.documentElement.classList.remove('in-lock');
      if (import.meta.env.DEV) delete window.__intro;
      while (waiters.length) waiters.shift()();
    },
  };
}

/** a later visit (preloader already seen): scene 1 opens as the same growing circle, without the sprout */
function revealFromCentre(stage) {
  return new Promise((resolve) => {
    const r1 = Math.hypot(innerWidth, innerHeight) / 2 + 2;
    const r0 = Math.min(innerHeight * 0.29, innerWidth * 0.42) * 0.25;
    const t0 = performance.now();
    const step = (now) => {
      const k = clamp((now - t0) / 1200, 0, 1);
      stage.style.clipPath = `circle(${(r0 + (r1 - r0) * p3inOut(k)).toFixed(1)}px at 50% 50%)`;
      if (k < 1) requestAnimationFrame(step); else { stage.style.clipPath = ''; resolve(); }
    };
    requestAnimationFrame(step);
  });
}
