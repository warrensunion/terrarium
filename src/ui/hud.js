/**
 * The HUD is the quietest thing on the live screen: the jar is the hero, so the
 * numbers sit in two small frosted plates at the edges and the environment
 * sliders stay folded away until asked for. It owns no sim state; it only
 * reports intent (speed, params, reset) and mirrors what the worker says.
 *
 * It also hosts the species river's canvas (hud.riverCanvas), so the river
 * lands in the right place without the live screen knowing the HUD's layout.
 */
import './ui.css';
import { holdMotionClass } from './motion.js';

const SPEEDS = [0, 1, 4, 16];
const DEFAULT_PARAMS = { foodRate: 1, mutationRate: 0.3, temperature: 0.5 };
const SLIDERS = [
  { key: 'foodRate', label: 'Food rate', min: 0, max: 3, step: 0.05, accent: 'var(--lichen)', fmt: (v) => v.toFixed(2) },
  { key: 'mutationRate', label: 'Mutation rate', min: 0, max: 1, step: 0.01, accent: 'var(--ui-violet-lift)', fmt: (v) => v.toFixed(2) },
  { key: 'temperature', label: 'Temperature', min: 0, max: 1, step: 0.01, accent: 'var(--highlight)', fmt: (v) => v.toFixed(2) },
];

let uid = 0;

const PAUSE_ICON = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><rect x="3.5" y="2.5" width="3" height="11" rx="1.2"/><rect x="9.5" y="2.5" width="3" height="11" rx="1.2"/></svg>';
const SLIDERS_ICON = '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M2 4.5h7M12.5 4.5H14M2 11.5h1.5M7 11.5h7"/><circle cx="10.75" cy="4.5" r="1.75"/><circle cx="5.25" cy="11.5" r="1.75"/></svg>';
const RESET_ICON = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8a5 5 0 1 0 1.6-3.7"/><path d="M3.2 2.2v2.6h2.6"/></svg>';

/**
 * @param {HTMLElement} root
 * @param {{ onSpeed?(n:number):void, onParams?(p:object):void, onReset?():void, params?:object, speed?:number }} opts
 */
export function createHud(root, { onSpeed = () => {}, onParams = () => {}, onReset = () => {}, params, speed = 1 } = {}) {
  const id = `ui-hud-${++uid}`;
  const p = { ...DEFAULT_PARAMS, ...params };
  let current = SPEEDS.includes(speed) ? speed : 1;
  let lastRunning = current || 1;

  const el = document.createElement('div');
  el.className = 'ui-hud';
  el.innerHTML = `
    <section class="ui-hud-stats" aria-label="World">
      <p class="ui-hud-gen"><span class="ui-hud-gen-label">Generation</span> <span class="ui-hud-gen-num" data-k="gen">0</span></p>
      <p class="ui-hud-counts">
        <span class="ui-hud-count"><span class="ui-hud-count-num" data-k="pop">0</span> creatures</span>
        <span class="ui-hud-count"><span class="ui-hud-count-num" data-k="sp">0</span> species</span>
      </p>
    </section>
    <div class="ui-hud-console">
      <figure class="ui-hud-river">
        <figcaption class="ui-hud-river-cap">Species over time</figcaption>
        <canvas class="ui-river" role="img" aria-label="Species population over time, as a river chart"></canvas>
      </figure>
      <div class="ui-hud-env" id="${id}-env" data-open="false">
        <div class="ui-hud-env-inner">
          ${SLIDERS.map((s) => `
          <div class="ui-hud-field" style="--ui-accent:${s.accent}">
            <label class="ui-hud-field-label" for="${id}-${s.key}">${s.label}</label>
            <output class="ui-hud-field-val" for="${id}-${s.key}" data-out="${s.key}"></output>
            <input class="ui-range" type="range" id="${id}-${s.key}" data-key="${s.key}" min="${s.min}" max="${s.max}" step="${s.step}">
          </div>`).join('')}
        </div>
      </div>
      <div class="ui-hud-dock">
        <div class="ui-speed" role="radiogroup" aria-label="Simulation speed">
          <span class="ui-speed-thumb" aria-hidden="true"></span>
          ${SPEEDS.map((n) => `<button type="button" class="ui-speed-opt" role="radio" data-speed="${n}" aria-label="${n === 0 ? 'Pause' : `Speed ${n}x`}" title="${n === 0 ? 'Pause (space)' : `${n}x (key ${SPEEDS.indexOf(n)})`}">${n === 0 ? PAUSE_ICON : `${n}<span class="ui-speed-x">×</span>`}</button>`).join('')}
        </div>
        <span class="ui-hud-sep" aria-hidden="true"></span>
        <button type="button" class="ui-hud-btn" data-act="env" aria-expanded="false" aria-controls="${id}-env">${SLIDERS_ICON}<span>Environment</span></button>
        <button type="button" class="ui-hud-btn ui-hud-btn--quiet" data-act="reset" title="Start the world again">${RESET_ICON}<span>Reset</span></button>
      </div>
    </div>`;
  root.append(el);
  const releaseMotion = holdMotionClass();

  const $ = (s) => el.querySelector(s);
  const out = { gen: $('[data-k=gen]'), pop: $('[data-k=pop]'), sp: $('[data-k=sp]') };
  const group = $('.ui-speed');
  const thumb = $('.ui-speed-thumb');
  const radios = [...el.querySelectorAll('.ui-speed-opt')];
  const env = $('.ui-hud-env');
  const envBtn = $('[data-act=env]');
  const inputs = [...el.querySelectorAll('.ui-range')];

  // sliders: value, live output, filled track
  const paint = (input) => {
    const s = SLIDERS.find((x) => x.key === input.dataset.key);
    const v = Number(input.value);
    input.style.setProperty('--ui-p', `${((v - s.min) / (s.max - s.min)) * 100}%`);
    const o = el.querySelector(`[data-out=${s.key}]`);
    o.value = o.textContent = s.fmt(v);
    input.setAttribute('aria-valuetext', s.fmt(v));
  };
  for (const input of inputs) {
    input.value = String(p[input.dataset.key]);
    paint(input);
  }
  const onInput = (e) => {
    const input = e.target.closest('.ui-range');
    if (!input) return;
    p[input.dataset.key] = Number(input.value);
    paint(input);
    onParams({ ...p });
  };
  el.addEventListener('input', onInput);

  // speed radio group: roving tabindex, arrows move and select
  function renderSpeed() {
    for (const r of radios) {
      const on = Number(r.dataset.speed) === current;
      r.setAttribute('aria-checked', String(on));
      r.tabIndex = on ? 0 : -1;
    }
    placeThumb();
    el.dataset.paused = String(current === 0);
  }
  function placeThumb() {
    const r = radios.find((x) => Number(x.dataset.speed) === current);
    if (!r || !r.offsetWidth) return;
    thumb.style.width = `${r.offsetWidth}px`;
    thumb.style.transform = `translateX(${r.offsetLeft}px)`;
  }
  function choose(n, focus = false) {
    if (n === current) return;
    current = n;
    if (n) lastRunning = n;
    renderSpeed();
    if (focus) radios.find((x) => Number(x.dataset.speed) === n)?.focus();
    onSpeed(n);
  }
  const onGroupKey = (e) => {
    const i = SPEEDS.indexOf(current);
    let j = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % SPEEDS.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i - 1 + SPEEDS.length) % SPEEDS.length;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = SPEEDS.length - 1;
    if (j < 0) return;
    e.preventDefault();
    choose(SPEEDS[j], true);
  };
  group.addEventListener('keydown', onGroupKey);

  function setEnv(open) {
    env.dataset.open = String(open);
    envBtn.setAttribute('aria-expanded', String(open));
    for (const i of inputs) i.tabIndex = open ? 0 : -1;
  }
  setEnv(false);

  const onClick = (e) => {
    const b = e.target.closest('button');
    if (!b || !el.contains(b)) return;
    if (b.dataset.speed !== undefined) choose(Number(b.dataset.speed));
    else if (b.dataset.act === 'env') {
      const open = env.dataset.open !== 'true';
      setEnv(open);
      // the sliders sit above the dock, so a keyboard user is taken to them
      if (open && e.detail === 0) inputs[0].focus({ preventScroll: true });
    } else if (b.dataset.act === 'reset') onReset();
    // a mouse click must not leave focus on a button, or the next Space would
    // press it again instead of toggling pause
    if (e.detail > 0) b.blur();
  };
  el.addEventListener('click', onClick);

  const isTyping = (t) => t instanceof Element && !!t.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]');
  const onKey = (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || isTyping(e.target)) return;
    if (e.key === ' ' || e.code === 'Space') {
      // keyboard users pressing Space on a focused control mean that control
      if (e.target instanceof Element && e.target.closest('button, a, [role=radio], [role=button], summary')) return;
      e.preventDefault();
      // holding Space must not flicker between paused and running
      if (e.repeat) return;
      choose(current === 0 ? lastRunning : 0);
    } else if (e.key === '1' || e.key === '2' || e.key === '3') {
      choose(SPEEDS[Number(e.key)]);
    }
  };
  window.addEventListener('keydown', onKey);

  const ro = new ResizeObserver(placeThumb);
  ro.observe(group);
  document.fonts?.ready.then(placeThumb);
  renderSpeed();

  const last = { gen: '', pop: '', sp: '' };
  const put = (k, v) => {
    const s = String(v);
    if (last[k] !== s) out[k].textContent = last[k] = s;
  };
  const nf = new Intl.NumberFormat('en');

  return {
    /** the canvas the species river should draw into */
    riverCanvas: $('.ui-river'),
    update(stats) {
      if (!stats) return;
      put('gen', nf.format(stats.generation ?? 0));
      put('pop', nf.format(stats.population ?? 0));
      put('sp', nf.format(stats.species?.length ?? 0));
    },
    setSpeed(n) {
      if (!SPEEDS.includes(n) || n === current) return;
      current = n;
      if (n) lastRunning = n;
      renderSpeed();
    },
    /** open or close the environment sliders (not in the contract; dev and deep links) */
    setEnvironmentOpen: setEnv,
    destroy() {
      window.removeEventListener('keydown', onKey);
      el.removeEventListener('input', onInput);
      el.removeEventListener('click', onClick);
      group.removeEventListener('keydown', onGroupKey);
      ro.disconnect();
      releaseMotion();
      el.remove();
    },
  };
}
