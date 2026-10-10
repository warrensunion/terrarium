/**
 * The live jar: wires the sim worker to the three.js stage and the DOM UI.
 *
 * The worker owns the world; this screen only asks for steps and renders
 * what comes back. One step request is in flight at a time, sent once per
 * rAF with the current speed (1, 4 or 16 steps), so the sim can never run
 * ahead of the renderer and a slow device slows the sim, not the frame
 * rate. The stage interpolates between the last two frames by how long ago
 * the newest arrived, so motion stays smooth whatever the speed.
 *
 * A hidden tab sends no requests (no burst of queued steps on return), and
 * frame dt is clamped to 100 ms. Reduced motion starts paused, and the hint
 * says so. No WebGL2 gets a painting of the jar and the reason.
 *
 * A jar that fails says so instead of sitting empty: a failed init, a step
 * that keeps throwing (STEP_ERRORS in a row) or no frame within WATCHDOG_MS
 * of starting the worker all show the error, and a world that never started
 * never lifts the fog.
 *
 * Clicking is not the only way in: "Follow a creature" (and the F key) picks
 * a well-fed creature near the middle, so keyboard users can inspect too.
 */
import { hasWebGL2, prefersReducedMotion, param, log } from '../core/env.js';
import { STRIDE } from '../sim/world.js';
import './live.css';

const SEED = Number(param('seed')) || 20261010;
const COUNT = Number(param('count')) || 600;
// 1.3 keeps the first die-off above 500 creatures (food 1 dips to ~320-430)
const PARAMS = { foodRate: 1.3, mutationRate: 0.3, temperature: 0.5 };
const STEP_ERRORS = 3; // consecutive failed steps before the jar gives up
const WATCHDOG_MS = 8000; // the worker's GPU probe gives up at 3.5 s, so 8 s is a stall
const isTyping = (t) => t instanceof Element && !!t.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]');

export default function liveScreen(root) {
  const gl = hasWebGL2();
  if (!gl.ok) return fallback(root, gl.reason);

  const el = document.createElement('main');
  el.className = 'lv';
  el.innerHTML = `
    <h1 class="sr-only">Terrarium: the live jar</h1>
    <div class="lv-stage"></div>
    <div class="lv-top">
      <nav class="lv-nav" aria-label="Site">
        <a class="lv-mark" href="#/">Terrarium</a>
        <a class="lv-link" href="#/about">How it works</a>
      </nav>
      <button type="button" class="lv-follow" title="Follow a creature (F)">Follow a creature</button>
    </div>
    <p class="lv-hint" role="status"></p>
    <p class="lv-error" role="alert" hidden></p>`;
  root.append(el);
  const stageEl = el.querySelector('.lv-stage');
  const hint = el.querySelector('.lv-hint');
  const errorEl = el.querySelector('.lv-error');
  const followBtn = el.querySelector('.lv-follow');

  const reduced = prefersReducedMotion();
  hint.textContent = reduced
    ? 'Paused. Press Space or 1 to start, F to follow a creature.'
    : 'Drag to turn the jar. Click a creature, or press F, to follow it.';
  let destroyed = false;
  let stage = null, hud = null, river = null, panel = null, worker = null;
  let speed = reduced ? 0 : 1;
  let prev = null, next = null, nextAt = 0, interval = 1000 / 60;
  let inFlight = false, lastStepSent = 0, sentSteps = 0;
  let inspectId = null, panelOpen = false;
  let stats = null, backend = '', ready = false, stageReady = false;
  let worldReady = false, failed = false, stepErrors = 0, watchdog = 0;
  let hues = new Map();
  const alive = new Set();
  let raf = 0, last = performance.now();
  const perf = { work: 0, frames: 0 }; // main-thread ms spent by this screen, for shoot.mjs
  let inner = null; // a fallback that replaced this screen after a failed start

  // unhide first, then set the text, so the alert is announced
  const showError = (text) => { errorEl.hidden = false; errorEl.textContent = text; };
  // a jar that cannot go on: say so, and stop asking the worker for steps
  const fail = (text) => { failed = true; clearTimeout(watchdog); showError(text); };

  Promise.all([import('./stage.js'), import('../ui/hud.js'), import('../ui/river.js'), import('../ui/brain-panel.js')])
    .then(([{ createStage }, { createHud }, { createRiver }, { createBrainPanel }]) => {
      if (destroyed) return;
      try {
        stage = createStage(stageEl, { bodyFromGenes: (b) => b, reducedMotion: reduced });
      } catch (e) {
        console.error(e);
        el.remove();
        inner = fallback(root, 'the 3D scene failed to start: ' + e.message);
        // focus went to body with the removed screen; land on the fallback's heading
        inner.focus();
        return;
      }
      // shaders compile and textures upload during warm-up; reveal after it
      Promise.resolve(stage.ready).then(() => { stageReady = true; });
      hud = createHud(el, {
        speed,
        params: PARAMS,
        onSpeed: (n) => { speed = n; },
        onParams: (p) => worker?.postMessage({ type: 'params', params: p }),
        onReset: () => { closeInspect(); worker?.postMessage({ type: 'reset', seed: (Math.random() * 1e9) | 0 }); },
      });
      river = createRiver(hud.riverCanvas);
      panel = createBrainPanel(el, {
        onClose: () => closeInspect(),
        speciesHue: (id) => hues.get(id),
        onLineage: (id) => { if (!alive.has(id)) return false; inspect(id); return true; },
      });
      startWorker();
      stageEl.addEventListener('pointerup', onPointerUp);
      followBtn.addEventListener('click', followSome);
      addEventListener('keydown', onKey);
      addEventListener('resize', onResize);
      document.addEventListener('visibilitychange', onVisibility);
      raf = requestAnimationFrame(loop);
    })
    .catch((e) => { console.error(e); showError('The jar could not load. Reload the page to try again.'); });

  function startWorker() {
    try {
      worker = new Worker(new URL('../worker/sim.worker.js', import.meta.url), { type: 'module' });
    } catch (e) {
      log('worker failed to start:', e.message);
      fail('The simulation could not start in this browser (it needs module workers).');
      return;
    }
    worker.onmessage = onMessage;
    worker.onerror = (e) => { console.error('[terrarium] worker error', e.message); fail('The simulation stopped. Reload the page to start a new jar.'); };
    worker.postMessage({ type: 'init', seed: SEED, count: COUNT, params: PARAMS, simcheck: param('simcheck') === '1' });
    armWatchdog();
  }

  // no frame within WATCHDOG_MS: say so. A hidden tab sends no steps, so it waits.
  function armWatchdog() {
    watchdog = setTimeout(() => {
      if (destroyed || failed || next) return;
      if (document.visibilityState === 'hidden') { armWatchdog(); return; }
      log(`no frame within ${WATCHDOG_MS} ms of starting the worker`);
      fail('The simulation is taking too long to start. Reload the page to try again.');
    }, WATCHDOG_MS);
  }

  function onMessage({ data: m }) {
    if (destroyed) return;
    if (m.type === 'ready') { backend = m.backend; worldReady = true; log('jar ready on', m.backend, m.reason || ''); return; }
    if (m.type === 'error') { onSimError(m); return; }
    if (m.type !== 'frame' || failed) return;
    const w0 = performance.now();
    inFlight = false;
    stepErrors = 0;
    clearTimeout(watchdog);
    const now = performance.now();
    // paused frames trickle in every ~100 ms; they say nothing about step pace
    if (next && sentSteps > 0) interval = Math.min(100, Math.max(8, now - nextAt)) * 0.3 + interval * 0.7;
    for (const b of m.births) { stage.creatures.add(b); alive.add(b.id); }
    for (const id of m.deaths) { stage.creatures.remove(id); alive.delete(id); }
    prev = next || m; next = m; nextAt = now;
    stage.setFrames(prev, next);
    stats = m.stats;
    hues = new Map(stats.species.map(([id, , hue]) => [id, hue]));
    hud.update(stats);
    river.push(stats);
    if (m.dead != null && m.dead === inspectId) {
      // while this one's inspect is in flight the panel still shows the previous
      // specimen, which did not die: only let go of the camera and the selection
      if (panelOpen) panel.died(); else stage.rig.release();
      stage.creatures.setSelected(null);
      inspectId = null;
    } else if (m.inspect && m.inspect.id === inspectId) {
      if (!panelOpen) { panel.show(m.inspect); panelOpen = true; } else panel.update(m.inspect);
    }
    // an empty frame from a world that never started must not lift the fog
    if (!ready && stageReady && worldReady) { ready = true; el.classList.add('is-ready'); }
    perf.work += performance.now() - w0;
  }

  function onSimError(m) {
    log('sim error:', m.request, m.message);
    if (failed) return;
    if (m.request === 'init') { fail('The simulation could not start. Reload the page to try again.'); return; }
    if (m.request !== 'step') return; // params, inspect and reset had no step in flight
    inFlight = false;
    if (++stepErrors >= STEP_ERRORS) fail('The simulation stopped. Reload the page to start a new jar.');
  }

  function loop(t) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.1, (t - last) / 1000); last = t;
    const hidden = document.visibilityState === 'hidden';
    if (worker && !inFlight && !hidden && !failed) {
      // paused: a slow trickle of 0-step frames keeps the brain panel live
      if (speed > 0 || t - lastStepSent > 100) { worker.postMessage({ type: 'step', steps: speed }); inFlight = true; lastStepSent = t; sentSteps = speed; }
    }
    if (!next) return;
    const w0 = performance.now();
    const alpha = speed > 0 ? Math.min(1, (performance.now() - nextAt) / interval) : 1;
    stage.render(dt, alpha);
    river.draw();
    perf.work += performance.now() - w0; perf.frames++;
  }

  function inspect(id) {
    inspectId = id;
    panelOpen = false;
    worker.postMessage({ type: 'inspect', id });
    stage.rig.follow(() => stage.creatures.positionOf(id));
    stage.creatures.setSelected(id);
    hint.classList.add('is-gone');
  }
  function closeInspect() {
    if (inspectId == null && !panelOpen) return;
    inspectId = null; panelOpen = false;
    worker?.postMessage({ type: 'inspect', id: null });
    stage?.rig.release();
    stage?.creatures.setSelected(null);
    panel?.hide();
  }
  /**
   * A well-fed adult near the middle, so it lives long enough to watch (and,
   * in shoot.mjs, to be shot). Skips the one already followed, so asking
   * again moves on to another.
   */
  function pickWellFed() {
    if (!next) return null;
    const c = next.creatures;
    let best = null, bs = -Infinity;
    for (let i = 0; i < c.length; i += STRIDE) {
      if (c[i] === inspectId) continue;
      const s = c[i + 5] - Math.hypot(c[i + 1], c[i + 2]) - (c[i + 7] > 60 ? 1 : 0);
      if (s > bs) { bs = s; best = c[i]; }
    }
    return best;
  }
  function followSome() {
    if (!stage || failed) return;
    const id = pickWellFed();
    if (id != null && alive.has(id)) inspect(id);
  }
  function onKey(e) {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.repeat || isTyping(e.target)) return;
    if (e.key === 'f' || e.key === 'F') { e.preventDefault(); followSome(); }
  }
  function onPointerUp(e) {
    if (!stage || stage.rig.dragDistance > 6) return;
    const id = stage.pick(e.clientX, e.clientY);
    if (id != null) inspect(id);
  }
  function onResize() { stage?.resize(); }
  function onVisibility() { if (document.visibilityState === 'visible') last = performance.now(); }

  if (import.meta.env.DEV) {
    // test hooks for scripts/shoot.mjs
    window.__live = {
      get ready() { return ready; },
      get stats() { return stats; },
      get backend() { return backend; },
      perf() { const r = perf.frames ? perf.work / perf.frames : 0; perf.work = 0; perf.frames = 0; return r; },
      speed(n) { speed = n; hud?.setSpeed(n); },
      inspect,
      kill(id) { worker?.postMessage({ type: 'debug-kill', id }); },
      pickSome: pickWellFed,
      get error() { return errorEl.hidden ? '' : errorEl.textContent; },
    };
  }

  return {
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      clearTimeout(watchdog);
      removeEventListener('resize', onResize);
      removeEventListener('keydown', onKey);
      followBtn.removeEventListener('click', followSome);
      document.removeEventListener('visibilitychange', onVisibility);
      worker?.terminate();
      hud?.destroy(); river?.destroy(); panel?.destroy();
      stage?.dispose();
      inner?.destroy();
      el.remove();
      if (import.meta.env.DEV) delete window.__live;
    },
  };
}

function fallback(root, reason) {
  log('fallback:', reason);
  const el = document.createElement('main');
  el.className = 'lv-fallback';
  el.innerHTML = `
    <img class="lv-fallback-art" src="/art/jar-world.webp" alt="A glass jar holding a mossy floor, ferns and a few small segmented creatures" width="834" height="1385">
    <div class="lv-fallback-text">
      <h1 tabindex="-1">The live jar needs WebGL</h1>
      <p></p>
      <p>Try a recent Chrome, Edge, Firefox or Safari with hardware acceleration turned on.</p>
      <p class="lv-fallback-links"><a href="#/about">How it works</a> <a href="#/">Back to the start</a></p>
    </div>`;
  el.querySelector('.lv-fallback-text p').textContent = `This browser can’t draw the 3D jar (${reason}). The painting above shows what is inside: a few hundred small creatures that eat, have young and slowly evolve into new species.`;
  root.append(el);
  return { focus() { el.querySelector('h1').focus({ preventScroll: true }); }, destroy() { el.remove(); } };
}
