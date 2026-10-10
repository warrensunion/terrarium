/**
 * Scene 3's living part: a real (tiny) brain driving a real creature. The
 * diagram is not an illustration of a network, it IS the network: the same
 * weights that light the edges turn and move the salmon creature toward the
 * seed the visitor holds. Its eight inputs are the simulation's eight senses
 * (src/sim, shared contracts), its four outputs the simulation's four actions,
 * so what you learn here is what happens in the jar.
 */
import { damp, clamp } from '../core/ease.js';
import { load } from './assets.js';
import { loadSpecies, createCreature } from './creature.js';

const IN = ['food left / right', 'food ahead', 'food distance', 'neighbour left / right', 'neighbour ahead', 'neighbour distance', 'energy', 'glass distance'];
const OUT = ['turn', 'walk', 'eat', 'mate'];
/** hidden ← inputs (8) + bias */
const W1 = [
  [2.6, 0, 0, 0.6, 0, 0, 0, 0, 0],
  [0, 1.5, -1.3, 0, 0, 0, 0.7, 0.8, -0.2],
  [0, 0.5, -3.2, 0, 0, 0, 0, 0, 0.9],
];
/** outputs ← hidden (3) + bias */
const W2 = [
  [2.1, 0, 0, 0],
  [0, 1.6, -0.7, 0.3],
  [0, 0, 2.6, -1.1],
  [0, -0.6, -0.5, -0.5],
];

export function forward(inputs) {
  const h = W1.map((w) => Math.tanh(w.reduce((s, wi, i) => s + wi * (i < 8 ? inputs[i] : 1), 0)));
  const o = W2.map((w) => Math.tanh(w.reduce((s, wi, i) => s + wi * (i < 3 ? h[i] : 1), 0)));
  return { h, o };
}

export function createBrain(host, { reduced, touch }) {
  const canvas = document.createElement('canvas');
  canvas.className = 'in-canvas in-brain-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'A brain of eight senses, three hidden neurons and four actions, steering a creature toward a seed');
  host.append(canvas);
  const ctx = canvas.getContext('2d');

  let creature = null, seedImg = null;
  const ready = Promise.all([
    loadSpecies('salmon').then((k) => { creature = createCreature(k, { segments: 3, legs: 1, size: 0.95 }); }),
    load('pt-2').then((i) => { seedImg = i; }),
  ]);

  let W = 0, H = 0, dpr = 1, rect = null;
  // ground area in canvas px (bottom part of the canvas)
  const ground = { x0: 0, x1: 0, y0: 0, y1: 0 };
  const cr = { x: 0, y: 0, a: Math.PI, v: 0, e: 0.7, walk: 0 };
  const seed = { x: 0, y: 0, tx: 0, ty: 0, shown: 1, gone: 0 };
  let pointerAt = -1e9, vals = { inputs: new Array(8).fill(0), h: [0, 0, 0], o: [0, 0, 0, 0] };

  const respawn = () => {
    seed.tx = seed.x = ground.x0 + (0.15 + Math.random() * 0.7) * (ground.x1 - ground.x0);
    seed.ty = seed.y = ground.y0 + (0.2 + Math.random() * 0.6) * (ground.y1 - ground.y0);
  };

  return {
    ready,
    warm() { creature?.warm(); },
    resize() {
      dpr = Math.min(devicePixelRatio || 1, 2);
      W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      const r = canvas.getBoundingClientRect();
      rect = { left: r.left, top: r.top };
      ground.x0 = W * 0.08; ground.x1 = W * 0.92; ground.y0 = H * (W < 560 ? 0.74 : 0.7); ground.y1 = H * 0.95;
      if (!cr.x) { cr.x = W * 0.7; cr.y = H * 0.85; respawn(); seed.tx = seed.x = W * 0.25; }
    },
    /** client coords from the stage's pointer listener */
    pointer(cx, cy) {
      if (!rect || reduced) return; // reduced motion: the seed stays put
      pointerAt = performance.now();
      seed.tx = clamp(cx - rect.left, ground.x0, ground.x1);
      seed.ty = clamp(cy - rect.top, ground.y0, ground.y1);
    },
    update(dt, t) {
      if (!W) return;
      // seed: held by the pointer, or wandering on its own (touch, or a still mouse)
      if (!reduced && (performance.now() - pointerAt > 2500 || touch)) {
        const gx = (ground.x0 + ground.x1) / 2, gw = (ground.x1 - ground.x0) / 2;
        const gy = (ground.y0 + ground.y1) / 2, gh = (ground.y1 - ground.y0) / 2;
        seed.tx = gx + Math.sin(t * 0.21) * gw * 0.85;
        seed.ty = gy + Math.sin(t * 0.37 + 1) * gh * 0.8;
      }
      seed.x = damp(seed.x, seed.tx, 7, dt);
      seed.y = damp(seed.y, seed.ty, 7, dt);
      if (seed.gone > 0) { seed.gone -= dt; if (seed.gone <= 0) seed.shown = 0; }
      seed.shown = Math.min(1, seed.shown + dt * 2.5);

      // senses, exactly the simulation's eight inputs
      const dx = seed.x - cr.x, dy = (seed.y - cr.y) * 1.6; // the ground is foreshortened
      const dist = Math.hypot(dx, dy);
      const rel = Math.atan2(dy, dx) - cr.a;
      const reach = W * 0.9;
      const visible = seed.gone <= 0;
      const wall = Math.min(cr.x - ground.x0, ground.x1 - cr.x, (cr.y - ground.y0) * 2, (ground.y1 - cr.y) * 2) / (W * 0.2);
      const inputs = [
        visible ? Math.sin(rel) : 0, visible ? Math.cos(rel) : 0, visible ? clamp(dist / reach, 0, 1) : 1,
        0, 0, 1, cr.e, clamp(wall, 0, 1),
      ];
      const { h, o } = forward(inputs);
      vals = { inputs, h, o };

      // act
      if (!reduced) {
        cr.a += o[0] * 3.0 * dt;
        const speed = Math.max(0, o[1]) * W * 0.16;
        cr.v = damp(cr.v, speed, 5, dt);
        cr.x = clamp(cr.x + Math.cos(cr.a) * cr.v * dt, ground.x0, ground.x1);
        cr.y = clamp(cr.y + (Math.sin(cr.a) * cr.v * dt) / 1.6, ground.y0, ground.y1);
        cr.walk += dt * (2 + (cr.v / (W * 0.16)) * 7);
      } else {
        cr.a = Math.atan2(dy, dx);
      }
      if (!reduced) cr.e = Math.max(0.05, cr.e - dt * 0.035);
      if (!reduced && o[2] > 0 && dist < W * 0.045 && visible) {
        cr.e = Math.min(1, cr.e + 0.35);
        seed.gone = 0.9; // a beat before a new seed appears
        respawn();
        seed.shown = 0;
      }
      if (creature) creature.face(Math.cos(cr.a));
      draw(dt, t);
    },
    destroy() {},
  };

  function draw(dt, t) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    drawNet(t);
    // seed
    if (seed.gone <= 0 && seedImg) {
      const s = W * 0.05 * (0.6 + 0.4 * seed.shown) * (reduced ? 1 : 1 + Math.sin(t * 3) * 0.04);
      ctx.globalAlpha = seed.shown;
      ctx.drawImage(seedImg, seed.x - s / 2, seed.y - s / 2, s, s);
      ctx.globalAlpha = 1;
    }
    // creature: nearer the bottom = nearer the camera = bigger
    if (creature) {
      const depth = (cr.y - ground.y0) / (ground.y1 - ground.y0);
      const unit = Math.min(W * 0.045, H * 0.05) * (0.85 + 0.3 * depth);
      const g = ctx.createRadialGradient(cr.x, cr.y, 0, cr.x, cr.y, unit * 3);
      g.addColorStop(0, 'rgba(31,58,51,.25)'); g.addColorStop(1, 'rgba(31,58,51,0)');
      ctx.fillStyle = g;
      ctx.save(); ctx.translate(cr.x, cr.y); ctx.scale(1, 0.18); ctx.beginPath(); ctx.arc(0, 0, unit * 3, 0, 7); ctx.fill(); ctx.restore();
      creature.draw(ctx, cr.x, cr.y, unit, { walk: cr.walk, speed: reduced ? 0 : clamp(cr.v / (W * 0.08), 0.15, 1), dt });
    }
  }

  function drawNet() {
    const narrow = W < 560;
    const top = H * 0.04, bottom = H * (narrow ? 0.58 : 0.5);
    const xIn = W * (narrow ? 0.44 : 0.3), xH = W * (narrow ? 0.64 : 0.55), xOut = W * (narrow ? 0.8 : 0.78);
    const yAt = (i, n) => top + ((i + 0.5) / n) * (bottom - top);
    const pIn = IN.map((_, i) => [xIn, yAt(i, 8)]);
    const pH = [0, 1, 2].map((i) => [xH, yAt(i + 2.5, 8)]);
    const pOut = OUT.map((_, i) => [xOut, yAt(i * 1.6 + 1.6, 8)]);
    const { inputs, h, o } = vals;
    // a field-note card behind the diagram, so its labels read over any painting
    card(ctx, W * (narrow ? 0.01 : 0.03), 0, W * (narrow ? 0.99 : 0.9), bottom + H * 0.035);
    ctx.lineCap = 'round';
    const edge = (a, b, w, v) => {
      if (!w) return;
      const k = Math.min(1, Math.abs(w * v) / 1.5);
      ctx.strokeStyle = k > 0.35 ? `rgba(95,227,216,${0.25 + 0.75 * k})` : `rgba(107,79,160,${0.18 + 0.3 * k})`;
      ctx.lineWidth = 1 + Math.abs(w) * 0.55;
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      const mx = (a[0] + b[0]) / 2;
      ctx.bezierCurveTo(mx, a[1], mx, b[1], b[0], b[1]);
      ctx.stroke();
    };
    W1.forEach((w, j) => w.forEach((wi, i) => i < 8 && edge(pIn[i], pH[j], wi, inputs[i])));
    W2.forEach((w, j) => w.forEach((wi, i) => i < 3 && edge(pH[i], pOut[j], wi, h[i])));
    const node = (p, v, r) => {
      const fire = Math.abs(v) > 0.5;
      if (fire) {
        const g = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], r * 3.2);
        g.addColorStop(0, 'rgba(95,227,216,.55)'); g.addColorStop(1, 'rgba(95,227,216,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p[0], p[1], r * 3.2, 0, 7); ctx.fill();
      }
      ctx.fillStyle = fire ? '#5FE3D8' : '#6B4FA0';
      ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(255,244,214,.7)'; ctx.lineWidth = 1; ctx.stroke();
    };
    const r = Math.max(4.5, W * 0.0085);
    pIn.forEach((p, i) => node(p, inputs[i], r));
    pH.forEach((p, i) => node(p, h[i], r * 1.15));
    pOut.forEach((p, i) => node(p, o[i], r * 1.25));
    ctx.font = `500 ${narrow ? 11 : Math.max(12, Math.round(W * 0.016))}px "Hanken Grotesk", system-ui, sans-serif`;
    ctx.fillStyle = 'rgba(31,58,51,.82)';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    pIn.forEach((p, i) => ctx.fillText(IN[i], p[0] - r * 2.2, p[1]));
    ctx.textAlign = 'left';
    pOut.forEach((p, i) => ctx.fillText(OUT[i], p[0] + r * 2.4, p[1]));
  }
}

/** paper card with a 1 px moss rule: the same material as the title plate */
export function card(ctx, x0, y0, x1, y1, a = 0.86) {
  ctx.save();
  ctx.fillStyle = `rgba(217,228,222,${a})`;
  ctx.strokeStyle = 'rgba(31,58,51,.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x0 + 0.5, y0 + 0.5, x1 - x0 - 1, y1 - y0 - 1, 3); else ctx.rect(x0 + 0.5, y0 + 0.5, x1 - x0 - 1, y1 - y0 - 1);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}
