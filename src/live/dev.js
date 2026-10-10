/**
 * live-dev.html: the live scene driven by a fake world, so the renderer can be
 * built, tuned and timed before the real sim/worker exists. The fake emits
 * frames in exactly the worker's format (STRIDE 10 rows, food triples,
 * births/deaths, stats.species) at 1/4/16 steps per frame, and the loop below
 * is the same prev/next/alpha interpolation the live screen will run.
 */
import { createStage } from './stage.js';
import { bodyFromGenes } from './dev-genes.js';
import { prefersReducedMotion, param } from '../core/env.js';

const STRIDE = 10, DT = 1 / 60, FOOD = 900;

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function createFakeWorld(count, seed = 3) {
  const R = rng(seed);
  const nSpecies = 6;
  const species = [];
  for (let i = 0; i < nSpecies; i++) {
    species.push({
      id: i + 1, hue: (350 + i * 137.5) % 360,
      genes: { segments: R(), limb: R(), size: R(), hue: R(), sat: R(), pattern: R() },
    });
  }
  const jitter = (g) => {
    const o = {};
    for (const k in g) o[k] = Math.min(1, Math.max(0, g[k] + (R() - 0.5) * (k === 'hue' ? 0.06 : 0.2)));
    return o;
  };
  const patches = [[-0.4, 0.3], [0.5, -0.35], [0.2, 0.6]];
  const food = new Float32Array(FOOD * 3);
  const spawnFood = (i) => {
    let x, y;
    if (R() < 0.7) { const p = patches[(R() * 3) | 0]; const a = R() * 6.283, r = Math.sqrt(R()) * 0.28; x = p[0] + Math.cos(a) * r; y = p[1] + Math.sin(a) * r; }
    else { const a = R() * 6.283, r = Math.sqrt(R()) * 0.95; x = Math.cos(a) * r; y = Math.sin(a) * r; }
    const k = Math.hypot(x, y); if (k > 0.96) { x *= 0.96 / k; y *= 0.96 / k; }
    food[i * 3] = x; food[i * 3 + 1] = y; food[i * 3 + 2] = 0.5 + R() * 0.5;
  };
  for (let i = 0; i < FOOD; i++) { if (R() < 0.55) spawnFood(i); }

  let nextId = 1, tick = 0;
  const pop = [];
  let births = [], deaths = [];
  const make = (sp, x, y, gen, parents) => {
    const c = {
      id: nextId++, x, y, heading: R() * 6.283, speed: 0, energy: 0.6 + R() * 0.3, species: sp.id,
      age: 0, flags: 0, generation: gen, body: jitter(sp.genes), target: -1, think: (R() * 30) | 0,
      life: 50 + R() * 40, rest: 0, wander: R() * 6.283,
    };
    pop.push(c);
    // like the real worker: body is already derived, raw genes ride along
    births.push({ id: c.id, body: bodyFromGenes(c.body), genes: c.body, species: c.species, generation: gen, parents });
    return c;
  };
  for (let i = 0; i < count; i++) {
    const a = R() * 6.283, r = Math.sqrt(R()) * 0.93;
    make(species[(R() * nSpecies) | 0], Math.cos(a) * r, Math.sin(a) * r, 0, []);
  }

  function step() {
    tick++;
    // regrow food at 6 pellets / s
    if (R() < 6 * DT * 1.5) { const i = (R() * FOOD) | 0; if (food[i * 3 + 2] <= 0) spawnFood(i); }
    for (let k = pop.length - 1; k >= 0; k--) {
      const c = pop[k];
      c.age += DT;
      if (--c.think <= 0) {
        c.think = 20 + ((R() * 20) | 0);
        let best = -1, bd = 0.35 * 0.35;
        for (let s = 0; s < 8; s++) {
          const i = (R() * FOOD) | 0;
          if (food[i * 3 + 2] <= 0) continue;
          const dx = food[i * 3] - c.x, dy = food[i * 3 + 1] - c.y, d = dx * dx + dy * dy;
          if (d < bd) { bd = d; best = i; }
        }
        if (best >= 0 || c.target < 0 || food[c.target * 3 + 2] <= 0) c.target = best;
        if (R() < 0.08) c.rest = 0.5 + R() * 1.5; // pause now and then, like real animals
      }
      let want, sp;
      if (c.target >= 0 && food[c.target * 3 + 2] > 0) {
        want = Math.atan2(food[c.target * 3 + 1] - c.y, food[c.target * 3] - c.x); sp = 0.17;
      } else {
        c.wander += (R() - 0.5) * 0.3; want = c.heading + Math.sin(c.wander) * 0.5; sp = 0.07;
      }
      const r = Math.hypot(c.x, c.y);
      if (r > 0.9) want = Math.atan2(-c.y, -c.x);
      if (c.rest > 0) { c.rest -= DT; sp = 0; }
      let d = want - c.heading; d -= Math.round(d / 6.2832) * 6.2832;
      c.heading += Math.max(-3 * DT, Math.min(3 * DT, d));
      c.speed += (sp - c.speed) * 0.08;
      c.x += Math.cos(c.heading) * c.speed * DT;
      c.y += Math.sin(c.heading) * c.speed * DT;
      const r2 = Math.hypot(c.x, c.y); if (r2 > 0.99) { c.x *= 0.99 / r2; c.y *= 0.99 / r2; }
      if (c.target >= 0 && food[c.target * 3 + 2] > 0) {
        const dx = food[c.target * 3] - c.x, dy = food[c.target * 3 + 1] - c.y;
        if (dx * dx + dy * dy < 0.02 * 0.02) { food[c.target * 3 + 2] = 0; c.energy = Math.min(1, c.energy + 0.25); c.target = -1; }
      }
      c.energy -= 0.0009 * (0.3 + c.speed / 0.25) * 0.6;
      if (c.energy <= 0 || c.age > c.life) { deaths.push(c.id); pop[k] = pop[pop.length - 1]; pop.pop(); }
    }
    // keep the jar populated: well-fed creatures bud
    while (pop.length < count) {
      const p = pop[(R() * pop.length) | 0];
      const sp = species.find((s) => s.id === p.species);
      const a = R() * 6.283;
      make(sp, p.x + Math.cos(a) * 0.02, p.y + Math.sin(a) * 0.02, p.generation + 1, [p.id]);
      p.energy *= 0.6;
    }
  }

  function frame(steps) {
    for (let i = 0; i < steps; i++) step();
    const creatures = new Float32Array(pop.length * STRIDE);
    const counts = new Map();
    let gen = 0;
    pop.forEach((c, i) => {
      creatures.set([c.id, c.x, c.y, c.heading, c.speed, c.energy, c.species, c.age, c.flags, c.generation], i * STRIDE);
      counts.set(c.species, (counts.get(c.species) || 0) + 1);
      gen = Math.max(gen, c.generation);
    });
    const out = {
      type: 'frame', tick, creatures, food: food.slice(), births, deaths,
      stats: { tick, population: pop.length, generation: gen, species: species.filter((s) => counts.get(s.id)).map((s) => [s.id, counts.get(s.id), s.hue]) },
      inspect: null, dead: null,
    };
    births = []; deaths = [];
    return out;
  }
  return { frame, get population() { return pop.length; } };
}

// ---------------------------------------------------------------- page
const host = document.querySelector('.lv-stage');
const reduced = prefersReducedMotion();
const stage = createStage(host, { bodyFromGenes: (b) => b, reducedMotion: reduced, pixelRatio: Number(param('dpr')) || undefined });
const canvas = stage.canvas;
const world = createFakeWorld(Number(param('n')) || 600);
let speed = Number(param('speed')) || 1;
let prev = null, next = null, acc = 0, followId = null;

const fit = () => stage.resize();
addEventListener('resize', fit);
fit();

function apply(f) {
  for (const b of f.births) stage.creatures.add(b);
  for (const id of f.deaths) stage.creatures.remove(id);
}
next = world.frame(0); apply(next);
stage.setFrames(null, next);

// UI
const ui = document.querySelector('.lv-dev');
if (param('hud') === '0') ui.style.display = 'none';
const readout = ui.querySelector('.lv-dev__ms');
for (const b of ui.querySelectorAll('[data-speed]')) {
  b.addEventListener('click', () => setSpeed(Number(b.dataset.speed)));
}
function setSpeed(n) {
  speed = n;
  for (const b of ui.querySelectorAll('[data-speed]')) b.setAttribute('aria-pressed', String(Number(b.dataset.speed) === n));
}
setSpeed(speed);

function follow(id) {
  followId = id;
  stage.creatures.setSelected(id);
  stage.rig.follow(() => stage.creatures.positionOf(followId));
}
function unfollow() { followId = null; stage.creatures.setSelected(null); stage.rig.release(); }
canvas.addEventListener('pointerup', (e) => {
  if (stage.rig.dragDistance > 6) return;
  const id = stage.pick(e.clientX, e.clientY);
  if (id != null) follow(id);
});
addEventListener('keydown', (e) => { if (e.key === 'Escape') unfollow(); });

// timing: CPU ms for update + render submission, and the full frame interval
const stats = { cpu: 0, frame: 0, frames: 0, cpuMax: 0 };
const syncGPU = param('sync') === '1';
const gl = stage.renderer.getContext();
const px = new Uint8Array(4);
let last = performance.now(), shown = 0;

function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const t0 = performance.now();
  acc += dt;
  let made = 0;
  while (acc >= DT && made < 2) {
    acc -= DT; made++;
    prev = next; next = world.frame(speed); apply(next);
  }
  if (made === 2) acc = Math.min(acc, DT);
  if (made) stage.setFrames(prev, next);
  stage.render(dt, acc / DT);
  if (followId != null && !stage.creatures.positionOf(followId)) unfollow();
  if (syncGPU) gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const cpu = performance.now() - t0;
  const k = 0.05;
  stats.cpu += (cpu - stats.cpu) * k; stats.frame += (dt * 1000 - stats.frame) * k; stats.frames++;
  if (stats.frames > 30) stats.cpuMax = Math.max(stats.cpuMax, cpu);
  if (now - shown > 250) {
    shown = now;
    readout.textContent = `${stats.cpu.toFixed(2)} ms work · ${stats.frame.toFixed(1)} ms/frame · ${world.population} creatures`;
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// for the headless measuring script
window.__lv = { stage, stats, follow, unfollow, setSpeed, world };
if (param('follow')) setTimeout(() => {
  // follow the creature nearest the middle of the screen
  const id = stage.pick(innerWidth / 2, innerHeight * 0.55) ?? next.creatures[0];
  follow(id);
}, 600);
