/**
 * The brain inspector: a specimen plate for one creature's mind. The point of
 * the whole project is that you can watch a NEAT network think, so the
 * network is drawn live: every frame each edge glows with the signal it is
 * carrying (|source activation x weight|), nodes glow with their activation,
 * and strong signals send a spore-cyan pulse down the wire. Cyan appears only
 * when something fires; at rest the brain is beetle violet on moss.
 *
 * Layout is columnar (inputs, hidden by longest path, outputs) and *stable*:
 * a hidden node gets a sort key the first time it is seen, from where its
 * neighbours were, and keeps it, so when the genome grows the new neuron
 * slides in between its parents and nothing else jumps. Every value the eye
 * tracks (position, opacity, glow) is eased, so there is no flicker.
 *
 * The worker sends values per node in genome.nodes order; ids 0..7 are the
 * senses, 8 bias, 9..12 the actions, hidden from 13.
 */
import './ui.css';
import { prefersReducedMotion } from '../core/env.js';

const IN_LABELS = ['food ←→', 'food ahead', 'food near', 'others ←→', 'others ahead', 'others near', 'energy', 'wall near', 'bias'];
const OUT_LABELS = ['turn', 'thrust', 'eat', 'mate'];
const LABEL_FONT = '500 11px "Hanken Grotesk", system-ui, sans-serif';

// colours as rgb triples so alpha can be eased per frame
const WARM = [214, 195, 90]; // lichen: excitatory
const COOL = [146, 124, 214]; // lifted beetle violet: inhibitory
const VIOLET = [140, 114, 200];
const CYAN = [95, 227, 216];
const FOG = [201, 216, 210];
const INK = 'rgb(20,36,31)';
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a < 0 ? 0 : a > 1 ? 1 : a})`;
const damp = (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt));

let uid = 0;

/**
 * @param {HTMLElement} root
 * @param {{ onClose?():void, onLineage?(id:number):boolean, speciesHue?(id:number):number|undefined }} opts
 *   onLineage: optional; return true if that ancestor could be inspected, false if it has died.
 *   speciesHue: optional; hue for the species swatch (the HUD's stats know it).
 */
export function createBrainPanel(root, { onClose = () => {}, onLineage, speciesHue } = {}) {
  const id = `ui-brain-${++uid}`;
  const el = document.createElement('aside');
  el.className = 'ui-brain';
  el.dataset.open = 'false';
  el.setAttribute('aria-labelledby', `${id}-title`);
  el.inert = true;
  el.innerHTML = `
    <div class="ui-brain-grip" aria-hidden="true"></div>
    <header class="ui-brain-head">
      <p class="ui-brain-kicker"><span class="ui-brain-swatch" aria-hidden="true"></span><span data-k="species"></span></p>
      <h2 class="ui-brain-title" id="${id}-title"></h2>
      <p class="ui-brain-status" data-k="status"></p>
      <button type="button" class="ui-brain-close" aria-label="Close the brain inspector" title="Close (Esc)">
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9"/></svg>
      </button>
    </header>
    <div class="ui-brain-body">
      <figure class="ui-brain-figure">
        <canvas class="ui-brain-canvas" role="img"></canvas>
        <p class="ui-brain-epitaph" aria-hidden="true">Its last thoughts, fading</p>
        <figcaption class="ui-brain-legend">
          <span class="ui-brain-key ui-brain-key--warm">excites</span>
          <span class="ui-brain-key ui-brain-key--cool">inhibits</span>
          <span class="ui-brain-key ui-brain-key--fire">firing</span>
          <span class="ui-brain-key ui-brain-key--off">switched off</span>
        </figcaption>
      </figure>
      <div class="ui-brain-energy">
        <span class="ui-brain-energy-label">Energy</span>
        <span class="ui-brain-energy-val" data-k="energy"></span>
        <span class="ui-brain-energy-track" aria-hidden="true"><span class="ui-brain-energy-fill"></span></span>
      </div>
      <dl class="ui-brain-stats">
        <div class="ui-brain-stat"><dt>Age</dt><dd data-k="age"></dd></div>
        <div class="ui-brain-stat"><dt>Generation</dt><dd data-k="gen"></dd></div>
        <div class="ui-brain-stat"><dt>Food gathered</dt><dd data-k="gathered"></dd></div>
        <div class="ui-brain-stat"><dt>Neurons</dt><dd data-k="neurons"></dd></div>
        <div class="ui-brain-stat"><dt>Connections</dt><dd data-k="conns"></dd></div>
        <div class="ui-brain-stat"><dt>Hidden layers</dt><dd data-k="depth"></dd></div>
      </dl>
      <section class="ui-brain-lineage" aria-labelledby="${id}-lin">
        <h3 class="ui-brain-h3" id="${id}-lin">Lineage</h3>
        <p class="ui-brain-parents" data-k="parents"></p>
        <ol class="ui-brain-chips" data-k="chips"></ol>
      </section>
    </div>
    <p class="sr-only" aria-live="polite" data-k="live"></p>`;
  root.append(el);

  const $ = (s) => el.querySelector(s);
  const k = (name) => $(`[data-k=${name}]`);
  const refs = {
    title: $('.ui-brain-title'), species: k('species'), status: k('status'), energy: k('energy'),
    age: k('age'), gen: k('gen'), gathered: k('gathered'), neurons: k('neurons'), conns: k('conns'),
    depth: k('depth'), parents: k('parents'), chips: k('chips'), live: k('live'),
  };
  const swatch = $('.ui-brain-swatch');
  const fill = $('.ui-brain-energy-fill');
  const canvas = $('.ui-brain-canvas');
  const closeBtn = $('.ui-brain-close');
  const viz = createBrainViz(canvas);

  let open = false, dead = false, currentId = null, sig = '', lineageKey = '';
  const shown = {};
  const put = (key, v) => {
    const s = String(v);
    if (shown[key] !== s) refs[key].textContent = shown[key] = s;
  };

  const fmtAge = (s) => (s < 60 ? `${Math.floor(s)} s` : `${Math.floor(s / 60)} min ${String(Math.floor(s % 60)).padStart(2, '0')} s`);
  const no = (n) => `no. ${n}`;

  function signature(g) {
    let on = 0;
    for (const c of g.conns) if (c.on) on++;
    return `${g.nodes.length}:${g.conns.length}:${on}`;
  }

  function render(ins) {
    const g = ins.genome;
    put('title', `Specimen no. ${ins.id}`);
    put('species', `Species ${ins.species}`);
    const hue = speciesHue?.(ins.species);
    swatch.style.background = hue == null ? 'var(--ui-violet-lift)' : `hsl(${hue}, 55%, 55%)`;
    if (!dead) put('status', 'Alive, thinking');
    const e = Math.max(0, Math.min(1, ins.energy ?? 0));
    put('energy', `${Math.round(e * 100)}%`);
    fill.style.transform = `scaleX(${e})`;
    el.dataset.hungry = String(e < 0.2);
    put('age', fmtAge(ins.age ?? 0));
    put('gen', ins.generation ?? 0);
    put('gathered', ins.gathered ?? 0);
    const hidden = g.nodes.filter((n) => n.type === 'hidden').length;
    put('neurons', hidden ? `${g.nodes.length}, ${hidden} hidden` : `${g.nodes.length}`);
    const on = g.conns.filter((c) => c.on).length;
    put('conns', on === g.conns.length ? `${on}` : `${on} of ${g.conns.length}`);
    put('depth', viz.depth());
    const ps = ins.parents || [];
    put('parents', ps.length === 2 ? `Born to ${no(ps[0])} and ${no(ps[1])}.` : ps.length === 1 ? `Budded from ${no(ps[0])}.` : 'A founder, first of its line.');
    const lk = (ins.lineage || []).join(',');
    if (lk !== lineageKey) {
      lineageKey = lk;
      refs.chips.replaceChildren(...(ins.lineage || []).map((a, i) => {
        const li = document.createElement('li');
        const b = document.createElement(onLineage ? 'button' : 'span');
        b.className = 'ui-brain-chip';
        b.textContent = no(a);
        b.style.setProperty('--ui-i', String(i));
        if (onLineage) {
          b.type = 'button';
          b.dataset.ancestor = String(a);
          b.setAttribute('aria-label', `Inspect ancestor ${a}, ${i === 0 ? 'parent' : `${i + 1} generations back`}`);
        }
        li.append(b);
        return li;
      }));
    }
    $('.ui-brain-lineage').hidden = !ps.length && !(ins.lineage || []).length;
    canvas.setAttribute('aria-label', `Neural network: ${g.nodes.length} neurons (${hidden} hidden) and ${on} active connections, firing live.`);
  }

  function announce(text) {
    refs.live.textContent = '';
    requestAnimationFrame(() => { refs.live.textContent = text; });
  }

  function setOpen(v) {
    if (open === v) return;
    open = v;
    el.dataset.open = String(v);
    el.inert = !v;
    document.documentElement.dataset.uiBrain = v ? 'open' : 'closed';
    if (v) viz.start(); else viz.stopSoon();
  }

  const onChip = (e) => {
    const b = e.target.closest('[data-ancestor]');
    if (!b || !onLineage || b.dataset.gone === 'true') return;
    const a = Number(b.dataset.ancestor);
    if (!onLineage(a)) {
      b.dataset.gone = 'true';
      b.setAttribute('aria-disabled', 'true');
      b.title = 'No longer alive';
      announce(`Ancestor ${a} is no longer alive.`);
    }
  };
  refs.chips.addEventListener('click', onChip);

  const userClose = () => { setOpen(false); onClose(); };
  closeBtn.addEventListener('click', userClose);
  const onKey = (e) => {
    if (e.key === 'Escape' && open && !e.defaultPrevented) { e.preventDefault(); userClose(); }
  };
  window.addEventListener('keydown', onKey);

  if (prefersReducedMotion()) document.documentElement.classList.add('ui-motion-reduce');

  const api = {
    show(ins) {
      if (!ins) return;
      const fresh = ins.id !== currentId || dead;
      currentId = ins.id;
      if (fresh) {
        dead = false;
        el.dataset.dead = 'false';
        lineageKey = '';
        viz.setGenome(ins.genome, true);
        sig = signature(ins.genome);
        announce(`Inspecting specimen ${ins.id}.`);
      }
      viz.setValues(ins.values);
      viz.revive();
      render(ins);
      setOpen(true);
    },
    update(ins) {
      if (!open || dead || !ins) return;
      if (ins.id !== currentId) return api.show(ins);
      const s = signature(ins.genome);
      if (s !== sig) { sig = s; viz.setGenome(ins.genome, false); }
      viz.setValues(ins.values);
      render(ins);
    },
    died() {
      if (dead || currentId == null) return;
      dead = true;
      el.dataset.dead = 'true';
      put('status', `Died at ${shown.age ?? 'an unknown age'}`);
      viz.die();
      announce(`Specimen ${currentId} died.`);
    },
    hide() { setOpen(false); },
    destroy() {
      window.removeEventListener('keydown', onKey);
      closeBtn.removeEventListener('click', userClose);
      refs.chips.removeEventListener('click', onChip);
      viz.destroy();
      if (open) delete document.documentElement.dataset.uiBrain;
      el.remove();
    },
  };
  return api;
}

/* ------------------------------------------------------------------ canvas */

function sprite(c, size = 64) {
  const s = document.createElement('canvas');
  s.width = s.height = size;
  const g = s.getContext('2d');
  const r = size / 2;
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, rgba([255, 255, 255], 0.95));
  grad.addColorStop(0.12, rgba(c, 0.9));
  grad.addColorStop(0.4, rgba(c, 0.32));
  grad.addColorStop(1, rgba(c, 0));
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return s;
}

/** longest-path depth of each hidden node; recurrent (back) edges are ignored */
function hiddenDepths(g) {
  const hidden = new Set(g.nodes.filter((n) => n.type === 'hidden').map((n) => n.id));
  const succ = new Map([...hidden].map((h) => [h, []]));
  for (const c of g.conns) if (hidden.has(c.from) && hidden.has(c.to) && c.from !== c.to) succ.get(c.from).push(c.to);
  // DFS colouring finds back edges so cycles cannot stretch the layout
  const state = new Map();
  const back = new Set();
  for (const h of [...hidden].sort((a, b) => a - b)) {
    if (state.has(h)) continue;
    const stack = [[h, 0]];
    state.set(h, 1);
    while (stack.length) {
      const top = stack[stack.length - 1];
      const out = succ.get(top[0]);
      if (top[1] < out.length) {
        const t = out[top[1]++];
        const st = state.get(t);
        if (st === 1) back.add(`${top[0]}>${t}`);
        else if (!st) { state.set(t, 1); stack.push([t, 0]); }
      } else { state.set(top[0], 2); stack.pop(); }
    }
  }
  const indeg = new Map([...hidden].map((h) => [h, 0]));
  for (const [f, outs] of succ) for (const t of outs) if (!back.has(`${f}>${t}`)) indeg.set(t, indeg.get(t) + 1);
  const depth = new Map([...hidden].map((h) => [h, 1]));
  const queue = [...hidden].filter((h) => indeg.get(h) === 0);
  while (queue.length) {
    const f = queue.shift();
    for (const t of succ.get(f)) {
      if (back.has(`${f}>${t}`)) continue;
      depth.set(t, Math.max(depth.get(t), depth.get(f) + 1));
      indeg.set(t, indeg.get(t) - 1);
      if (!indeg.get(t)) queue.push(t);
    }
  }
  return depth;
}

function createBrainViz(canvas) {
  const ctx = canvas.getContext('2d');
  const reduced = prefersReducedMotion();
  const cyan = sprite(CYAN);
  const violet = sprite(VIOLET);
  /** @type {Map<number, any>} */
  const nodes = new Map();
  /** @type {Map<number, any>} */
  const edges = new Map();
  const keys = new Map(); // stable vertical sort key per hidden node
  let idx = new Map(); // node id -> index into values
  let ncols = 2;
  let W = 0, H = 0, dpr = 1, padL = 84, padR = 48;
  let raf = 0, lastT = 0, time = 0, life = 1, tLife = 1, stopAt = 0;

  const ro = new ResizeObserver(measure);
  ro.observe(canvas);
  measure();
  document.fonts?.ready.then(measure);

  function measure() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, Math.round(r.width));
    H = Math.max(1, Math.round(r.height));
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.font = LABEL_FONT;
    padL = Math.ceil(Math.max(...IN_LABELS.map((s) => ctx.measureText(s).width))) + 20;
    padR = Math.ceil(Math.max(...OUT_LABELS.map((s) => ctx.measureText(s).width))) + 20;
    if (!raf) frame(performance.now(), true);
  }

  function setGenome(g, fresh) {
    if (fresh) { nodes.clear(); edges.clear(); keys.clear(); life = tLife = 1; }
    idx = new Map(g.nodes.map((n, i) => [n.id, i]));
    const depth = hiddenDepths(g);
    let maxD = 0;
    for (const d of depth.values()) maxD = Math.max(maxD, d);
    ncols = maxD + 2;
    const colOf = (n) => (n.type === 'in' || n.type === 'bias' ? 0 : n.type === 'out' ? ncols - 1 : depth.get(n.id));

    // target ys for fixed columns first, so new hidden nodes can key off them
    const ty = new Map();
    const ins = g.nodes.filter((n) => n.type === 'in').sort((a, b) => a.id - b.id);
    const bias = g.nodes.filter((n) => n.type === 'bias');
    const outs = g.nodes.filter((n) => n.type === 'out').sort((a, b) => a.id - b.id);
    const slots = ins.length + bias.length + 0.5; // a half-step gap sets bias apart
    ins.forEach((n, i) => ty.set(n.id, i / slots));
    bias.forEach((n) => ty.set(n.id, 1));
    const oSpan = Math.min(1, 0.26 * (outs.length - 1));
    outs.forEach((n, i) => ty.set(n.id, outs.length > 1 ? 0.5 - oSpan / 2 + (i / (outs.length - 1)) * oSpan : 0.5));

    // stable keys: a new hidden node is keyed by where its neighbours are
    const nbr = new Map();
    for (const c of g.conns) {
      if (!nbr.has(c.to)) nbr.set(c.to, []);
      if (!nbr.has(c.from)) nbr.set(c.from, []);
      nbr.get(c.to).push(c.from);
      nbr.get(c.from).push(c.to);
    }
    const hidden = g.nodes.filter((n) => n.type === 'hidden').sort((a, b) => depth.get(a.id) - depth.get(b.id) || a.id - b.id);
    const known = (nid) => (keys.has(nid) ? keys.get(nid) : ty.has(nid) ? ty.get(nid) : nodes.get(nid)?.ty);
    for (const h of hidden) {
      if (keys.has(h.id)) continue;
      const ys = (nbr.get(h.id) || []).map(known).filter((v) => v != null);
      keys.set(h.id, ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : 0.5);
    }
    const cols = new Map();
    for (const h of hidden) {
      const c = depth.get(h.id);
      if (!cols.has(c)) cols.set(c, []);
      cols.get(c).push(h);
    }
    for (const list of cols.values()) {
      list.sort((a, b) => keys.get(a.id) - keys.get(b.id) || a.id - b.id);
      const n = list.length;
      const step = n > 1 ? Math.min(1 / (n - 1), 0.17) : 0;
      // centre the column on its members' average key so it sits near its wiring
      const centre = Math.min(1 - (step * (n - 1)) / 2, Math.max((step * (n - 1)) / 2, list.reduce((a, h) => a + keys.get(h.id), 0) / n));
      list.forEach((h, i) => ty.set(h.id, centre - (step * (n - 1)) / 2 + i * step));
    }

    const live = new Set();
    for (const n of g.nodes) {
      live.add(n.id);
      const tx = ncols > 1 ? colOf(n) / (ncols - 1) : 0;
      let s = nodes.get(n.id);
      if (!s) {
        // a newborn neuron grows out of the wiring it splits; on a fresh brain
        // everything fades in where it belongs, column by column
        let x = tx, y = ty.get(n.id);
        if (!fresh) {
          const ps = (nbr.get(n.id) || []).map((m) => nodes.get(m)).filter(Boolean);
          if (ps.length) { x = ps.reduce((a, p) => a + p.x, 0) / ps.length; y = ps.reduce((a, p) => a + p.y, 0) / ps.length; }
        }
        s = { id: n.id, x, y, a: 0, v: 0, tv: 0, delay: fresh ? colOf(n) * 0.07 : 0 };
        nodes.set(n.id, s);
      }
      s.type = n.type;
      s.tx = tx;
      s.ty = ty.get(n.id);
      s.ta = 1;
      s.label = n.type === 'in' || n.type === 'bias' ? IN_LABELS[n.id] ?? `in ${n.id}` : n.type === 'out' ? OUT_LABELS[n.id - 9] ?? `out ${n.id}` : '';
    }
    for (const [nid, s] of nodes) if (!live.has(nid)) s.ta = 0;
    const liveE = new Set();
    for (const c of g.conns) {
      liveE.add(c.inn);
      let e = edges.get(c.inn);
      if (!e) { e = { inn: c.inn, a: 0, s: 0, ts: 0, phase: (c.inn * 0.6180339887) % 1 }; edges.set(c.inn, e); }
      e.from = c.from; e.to = c.to; e.w = c.w; e.on = c.on; e.ta = 1;
    }
    for (const [inn, e] of edges) if (!liveE.has(inn)) e.ta = 0;
  }

  function setValues(values) {
    if (!values) return;
    for (const s of nodes.values()) {
      const i = idx.get(s.id);
      if (i != null) s.tv = Number.isFinite(values[i]) ? values[i] : 0;
    }
    for (const e of edges.values()) {
      const i = idx.get(e.from);
      const v = i != null ? values[i] : 0;
      e.ts = e.on && Number.isFinite(v) ? Math.tanh(Math.abs(v * e.w) * 1.1) : 0;
    }
  }

  // cubic from a to b; forward edges are horizontal S-curves, recurrent ones arch over
  function curve(a, b, out) {
    const ax = X(a.x), ay = Y(a.y), bx = X(b.x), by = Y(b.y);
    if (a === b) {
      out[0] = ax; out[1] = ay; out[2] = ax + 26; out[3] = ay - 30; out[4] = ax - 26; out[5] = ay - 30; out[6] = ax; out[7] = ay;
      return out;
    }
    const dx = bx - ax;
    if (dx > 4) {
      const k = dx * 0.5;
      out[2] = ax + k; out[3] = ay; out[4] = bx - k; out[5] = by;
    } else {
      const lift = -(28 + Math.abs(dx) * 0.25 + Math.abs(by - ay) * 0.15);
      out[2] = ax + 34; out[3] = ay + lift; out[4] = bx - 34; out[5] = by + lift;
    }
    out[0] = ax; out[1] = ay; out[6] = bx; out[7] = by;
    return out;
  }
  const bez = (p, t, o) => {
    const u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    o[0] = a * p[0] + b * p[2] + c * p[4] + d * p[6];
    o[1] = a * p[1] + b * p[3] + c * p[5] + d * p[7];
    return o;
  };
  const X = (x) => padL + x * Math.max(10, W - padL - padR);
  const Y = (y) => 16 + y * Math.max(10, H - 32);
  const P = new Float64Array(8);
  const Q = new Float64Array(2);

  function frame(now, still = false) {
    const dt = lastT ? Math.min(0.05, (now - lastT) / 1000) : 1 / 60;
    lastT = now;
    if (!still) time += dt;

    // ease everything the eye follows
    life = damp(life, tLife, 2.2, dt);
    for (const [nid, s] of nodes) {
      if (s.delay > 0) { s.delay -= dt; continue; }
      s.x = damp(s.x, s.tx, 6, dt);
      s.y = damp(s.y, s.ty, 6, dt);
      s.a = damp(s.a, s.ta, 5, dt);
      s.v = damp(s.v, s.tv * (tLife ? 1 : 0), tLife ? 16 : 1.6, dt);
      if (!s.ta && s.a < 0.01) nodes.delete(nid);
    }
    for (const [inn, e] of edges) {
      const f = nodes.get(e.from), t = nodes.get(e.to);
      const ready = f && t && f.a > 0.05 && t.a > 0.05;
      e.a = damp(e.a, ready ? e.ta : 0, 4, dt);
      e.s = damp(e.s, e.ts * life, 12, dt);
      if (!e.ta && e.a < 0.01) edges.delete(inn);
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const dim = 0.55 + 0.45 * life;
    const span = (H - 32) / 9.5;
    const rScale = Math.max(0.6, Math.min(1, span / 24));

    // 1. the wiring at rest: sign as warm or cool, weight as width
    ctx.lineCap = 'round';
    for (const e of edges.values()) {
      if (e.a < 0.01) continue;
      const f = nodes.get(e.from), t = nodes.get(e.to);
      if (!f || !t) continue;
      curve(f, t, P);
      const mag = Math.min(Math.abs(e.w), 3) / 3;
      ctx.beginPath();
      ctx.moveTo(P[0], P[1]);
      ctx.bezierCurveTo(P[2], P[3], P[4], P[5], P[6], P[7]);
      if (e.on) {
        ctx.setLineDash([]);
        ctx.lineWidth = 0.6 + 2.2 * mag;
        ctx.strokeStyle = rgba(e.w >= 0 ? WARM : COOL, (0.16 + 0.3 * mag) * e.a * dim);
      } else {
        ctx.setLineDash([2, 4]);
        ctx.lineWidth = 0.9;
        ctx.strokeStyle = rgba(FOG, 0.16 * e.a);
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // 2. signal: additive glow per edge, and pulses that travel the wire
    ctx.globalCompositeOperation = 'lighter';
    for (const e of edges.values()) {
      const s = e.s * e.a;
      if (!e.on || s < 0.02) continue;
      const f = nodes.get(e.from), t = nodes.get(e.to);
      if (!f || !t) continue;
      curve(f, t, P);
      const mag = Math.min(Math.abs(e.w), 3) / 3;
      const c = e.w >= 0 ? WARM : COOL;
      ctx.beginPath();
      ctx.moveTo(P[0], P[1]);
      ctx.bezierCurveTo(P[2], P[3], P[4], P[5], P[6], P[7]);
      ctx.lineWidth = 2 + 2.2 * mag + 5 * s;
      ctx.strokeStyle = rgba(c, 0.1 * s);
      ctx.stroke();
      ctx.lineWidth = 0.6 + 1.6 * mag;
      ctx.strokeStyle = rgba(c, 0.6 * s);
      ctx.stroke();
      if (!reduced && s > 0.14 && f.type !== 'bias') {
        // one or two pulses, faster for stronger signal; they fade at the ends
        const speed = 0.35 + 1.1 * s;
        const count = s > 0.6 ? 2 : 1;
        for (let k = 0; k < count; k++) {
          const tt = (e.phase + time * speed + k / count) % 1;
          bez(P, tt, Q);
          const edgeFade = Math.sin(Math.PI * tt);
          const r = (4 + 6 * s) * rScale;
          ctx.globalAlpha = Math.min(1, s * 1.2) * edgeFade;
          ctx.drawImage(cyan, Q[0] - r, Q[1] - r, r * 2, r * 2);
        }
        ctx.globalAlpha = 1;
      }
    }
    ctx.globalCompositeOperation = 'source-over';

    // 3. neurons: ink body, violet ring, glow with |activation|
    ctx.font = LABEL_FONT;
    ctx.textBaseline = 'middle';
    for (const s of nodes.values()) {
      if (s.a < 0.01) continue;
      const x = X(s.x), y = Y(s.y);
      const big = s.type !== 'hidden';
      const r = (big ? 4.6 : 3.6) * rScale;
      const act = Math.min(1, Math.abs(s.v));
      // cyan only once a neuron is really firing; below that a violet breath
      const fire = s.type === 'bias' ? 0 : Math.max(0, (act - 0.18) / 0.82) * life;
      ctx.globalCompositeOperation = 'lighter';
      if (s.type !== 'bias') {
        const vr = r * (2.4 + 2.5 * act);
        ctx.globalAlpha = s.a * (0.18 + 0.35 * act) * dim;
        ctx.drawImage(violet, x - vr, y - vr, vr * 2, vr * 2);
      }
      if (fire > 0.01) {
        const cr = r * (2 + 4.5 * fire);
        ctx.globalAlpha = s.a * fire * 0.95;
        ctx.drawImage(cyan, x - cr, y - cr, cr * 2, cr * 2);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = INK;
      ctx.globalAlpha = s.a;
      ctx.fill();
      ctx.lineWidth = big ? 1.4 : 1.1;
      ctx.strokeStyle = s.type === 'bias' ? rgba(FOG, 0.5) : rgba(VIOLET, 0.95 * dim);
      ctx.stroke();
      if (fire > 0.01) {
        ctx.beginPath();
        ctx.arc(x, y, r * 0.55, 0, Math.PI * 2);
        ctx.fillStyle = rgba(CYAN, fire);
        ctx.fill();
      }
      if (s.label) {
        const left = s.type === 'in' || s.type === 'bias';
        ctx.textAlign = left ? 'right' : 'left';
        ctx.fillStyle = rgba(FOG, (0.5 + 0.5 * act * life) * s.a);
        ctx.fillText(s.label, left ? x - r - 7 : x + r + 7, y + 0.5);
      }
      ctx.globalAlpha = 1;
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    if (still) return;
    if (stopAt && now > stopAt) { raf = 0; stopAt = 0; lastT = 0; return; }
    raf = requestAnimationFrame(frame);
  }

  return {
    start() {
      stopAt = 0;
      if (!raf) { lastT = 0; raf = requestAnimationFrame(frame); }
    },
    /** keep drawing through the close transition, then rest */
    stopSoon() { stopAt = performance.now() + 600; },
    setGenome,
    setValues,
    die() { tLife = 0; },
    revive() { tLife = 1; },
    depth: () => Math.max(0, ncols - 2),
    destroy() {
      cancelAnimationFrame(raf);
      raf = 0;
      ro.disconnect();
    },
  };
}
