/**
 * Fake world for ui-dev.html. The UI is judged by how it behaves with data
 * that moves like the real thing, so this fakes the worker's messages
 * faithfully: species that branch off a parent and run dry, a genome that
 * grows hidden neurons while you watch, and a real recurrent activation step
 * through that genome every frame (so the brain viz shows true signal flow,
 * not noise). It also paints a stand-in for the jar so the frosted glass has
 * something to frost.
 */
import { createHud } from './hud.js';
import { createRiver } from './river.js';
import { createBrainPanel } from './brain-panel.js';

const q = new URLSearchParams(location.search);
let seed = 7;
const rnd = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const gauss = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());

/* --------------------------------------------------------------- species */
let tick = 0, speed = 1, generation = 1;
const params = { foodRate: 1, mutationRate: 0.3, temperature: 0.5 };
let species, nextSpecies, lastHue;
function resetWorld() {
  tick = 0; generation = 1; nextSpecies = 1; lastHue = 140; species = [];
  for (let i = 0; i < 4; i++) addSpecies(150);
}
function addSpecies(count) {
  lastHue = (lastHue + 137.5) % 360;
  species.push({ id: nextSpecies++, count, hue: Math.round(lastHue), fit: gauss() * 0.02 });
}
function census() {
  // logistic growth with drifting fitness, food rate as carrying capacity
  const total = species.reduce((a, s) => a + s.count, 0);
  const cap = 300 + 260 * params.foodRate;
  for (const s of species) {
    s.fit += gauss() * 0.012;
    s.fit *= 0.97;
    const g = 1 + s.fit + 0.06 * (1 - total / cap) + gauss() * 0.05 - (s.count < 20 ? 0.05 : 0);
    s.count = Math.max(0, Math.round(s.count * g));
  }
  // branching: a big species buds a new one
  const big = species.filter((s) => s.count > 60);
  if (big.length && species.length < 14 && rnd() < 0.03 + 0.06 * params.mutationRate) {
    const p = big[Math.floor(rnd() * big.length)];
    const take = Math.round(p.count * (0.12 + rnd() * 0.15));
    p.count -= take;
    addSpecies(take);
  }
  species = species.filter((s) => s.count >= 2);
  while (species.length < 3) addSpecies(40);
  if (rnd() < 0.3) generation++;
}
const stats = () => ({
  tick,
  population: Math.max(60, species.reduce((a, s) => a + s.count, 0)),
  generation,
  species: species.map((s) => [s.id, s.count, s.hue]),
});

/* --------------------------------------------------------------- genome */
const ACTS = ['tanh', 'sigmoid', 'relu', 'sin', 'id'];
const actFn = { tanh: Math.tanh, sigmoid: (x) => 1 / (1 + Math.exp(-4.9 * x)), relu: (x) => Math.max(0, x), sin: Math.sin, id: (x) => x };
let inn = 0, nextNode = 13;
function newGenome() {
  inn = 0; nextNode = 13;
  const nodes = [];
  for (let i = 0; i < 8; i++) nodes.push({ id: i, type: 'in', act: 'id' });
  nodes.push({ id: 8, type: 'bias', act: 'id' });
  for (let i = 9; i < 13; i++) nodes.push({ id: i, type: 'out', act: 'tanh' });
  const conns = [];
  for (let f = 0; f <= 8; f++) for (let t = 9; t < 13; t++) if (rnd() < 0.62) conns.push({ inn: inn++, from: f, to: t, w: gauss(), on: true });
  const g = { nodes, conns };
  for (let i = 0; i < 4 + Math.floor(rnd() * 4); i++) grow(g);
  return g;
}
/** one structural mutation: mostly add-node (split), sometimes add-conn or toggle */
function grow(g) {
  const hidden = g.nodes.filter((n) => n.type === 'hidden');
  const r = rnd();
  if (r < 0.5 && hidden.length < 40) {
    const on = g.conns.filter((c) => c.on);
    if (!on.length) return;
    const c = on[Math.floor(rnd() * on.length)];
    c.on = false;
    const id = nextNode++;
    g.nodes.push({ id, type: 'hidden', act: ACTS[Math.floor(rnd() * ACTS.length)] });
    g.conns.push({ inn: inn++, from: c.from, to: id, w: 1, on: true });
    g.conns.push({ inn: inn++, from: id, to: c.to, w: c.w, on: true });
  } else if (r < 0.92 && g.conns.length < 150) {
    const srcs = g.nodes.filter((n) => n.type !== 'out' || rnd() < 0.1);
    const dsts = g.nodes.filter((n) => n.type === 'hidden' || n.type === 'out');
    for (let k = 0; k < 20; k++) {
      const f = srcs[Math.floor(rnd() * srcs.length)], t = dsts[Math.floor(rnd() * dsts.length)];
      if (g.conns.some((c) => c.from === f.id && c.to === t.id)) continue;
      g.conns.push({ inn: inn++, from: f.id, to: t.id, w: gauss() * 1.3, on: true });
      return;
    }
  } else {
    const c = g.conns[Math.floor(rnd() * g.conns.length)];
    c.on = !c.on;
  }
}

/* --------------------------------------------------------------- creature */
let creature = null, nextCreature = 4127;
function newCreature() {
  const genome = newGenome();
  const sp = species[Math.floor(rnd() * species.length)];
  creature = {
    id: nextCreature, genome, values: new Float32Array(genome.nodes.length), age: 3 + rnd() * 20, energy: 0.55 + rnd() * 0.3,
    generation, parents: rnd() < 0.8 ? [nextCreature - 37, nextCreature - 211] : [nextCreature - 37], species: sp.id, gathered: Math.floor(rnd() * 8),
    lineage: Array.from({ length: 6 + Math.floor(rnd() * 6) }, (_, i) => nextCreature - 37 - i * 173 - Math.floor(rnd() * 90)),
  };
  nextCreature += 1 + Math.floor(rnd() * 900);
  return creature;
}
/** one recurrent step, the same rule as neat.createBrain: value = act(sum w * previous) */
function think(c, t) {
  const g = c.genome;
  if (c.values.length !== g.nodes.length) {
    const v = new Float32Array(g.nodes.length);
    v.set(c.values.subarray(0, Math.min(v.length, c.values.length)));
    c.values = v;
  }
  const prev = c.values;
  const at = new Map(g.nodes.map((n, i) => [n.id, i]));
  const next = new Float32Array(prev.length);
  // senses: a creature circling a food patch, with others passing by
  const fa = t * 0.9 + Math.sin(t * 0.37) * 2;
  const oa = t * 1.7 + 1;
  const sense = [Math.sin(fa), Math.cos(fa), 0.5 + 0.45 * Math.sin(t * 0.53), Math.sin(oa), Math.cos(oa), Math.max(0, Math.sin(t * 0.21)) ** 2, c.energy, 0.3 + 0.25 * Math.sin(t * 0.13)];
  const sum = new Float32Array(prev.length);
  for (const cn of g.conns) if (cn.on) sum[at.get(cn.to)] += cn.w * prev[at.get(cn.from)];
  g.nodes.forEach((n, i) => {
    if (n.type === 'in') next[i] = sense[n.id];
    else if (n.type === 'bias') next[i] = 1;
    else next[i] = Math.max(-4, Math.min(4, actFn[n.act](sum[i])));
  });
  c.values = next;
  return c;
}
const inspect = (c) => ({
  id: c.id, values: new Float32Array(c.values), genome: { nodes: c.genome.nodes.map((n) => ({ ...n })), conns: c.genome.conns.map((x) => ({ ...x })) },
  age: c.age, energy: c.energy, generation: c.generation, parents: c.parents, lineage: c.lineage, species: c.species, gathered: c.gathered,
});

/* --------------------------------------------------------------- wiring */
const root = document.getElementById('ui-root');
const hud = createHud(root, {
  onSpeed: (n) => { speed = n; },
  onParams: (p) => Object.assign(params, p),
  onReset: () => { resetWorld(); },
});
const river = createRiver(hud.riverCanvas);
let dead = false;
const panel = createBrainPanel(root, {
  onClose: () => { creature = null; },
  onLineage: (id) => {
    if (id % 3 === 0) return false; // a third of the ancestors have died
    panel.show(inspect(newCreatureWithId(id)));
    return true;
  },
  speciesHue: (id) => species.find((s) => s.id === id)?.hue,
});
function newCreatureWithId(id) { const c = newCreature(); c.id = id; return c; }

// a long history so the river is full on first look
resetWorld();
for (let i = 0; i < 280; i++) { tick += 120; census(); river.push(stats()); }
generation = 41;

if (q.get('env') === '1') hud.setEnvironmentOpen(true);
if (q.get('tools') === '0') document.querySelector('.ui-dev-tools').remove();

function openCreature() {
  dead = false;
  newCreature();
  for (let i = 0; i < 30; i++) think(creature, i / 60);
  panel.show(inspect(creature));
}
if (q.get('panel') === '1' || q.get('died') === '1') openCreature();
if (q.get('died') === '1') setTimeout(() => { dead = true; panel.died(); }, 1500);

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-dev]');
  if (!b) return;
  if (b.dataset.dev === 'inspect') openCreature();
  if (b.dataset.dev === 'die' && creature) { dead = true; panel.died(); }
  if (b.dataset.dev === 'grow' && creature && !dead) grow(creature.genome);
});

/* --------------------------------------------------------------- loop */
let last = performance.now(), growAt = 0, t = 0;
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (speed) {
    const before = Math.floor(tick / 120);
    tick += speed;
    for (let b = before; b < Math.floor(tick / 120); b++) census();
  }
  const s = stats();
  hud.update(s);
  river.push(s);
  river.draw();
  if (creature && !dead && speed) {
    t += dt * speed;
    creature.age += dt * speed;
    creature.energy = Math.max(0.04, Math.min(1, creature.energy + (Math.sin(t * 0.3) * 0.004 - 0.0012) * speed));
    if (rnd() < 0.004 * speed) creature.gathered++;
    // the genome grows while you watch (a dev-only liberty: real genomes are fixed for life)
    growAt += dt * speed * (0.3 + params.mutationRate);
    if (growAt > 2.5) { growAt = 0; grow(creature.genome); }
    think(creature, t);
    panel.update(inspect(creature));
  }
  paintScene(now / 1000);
  requestAnimationFrame(loop);
}

/* --------------------------------------------------------------- stand-in jar */
const scene = document.querySelector('.ui-dev-scene');
const sx = scene.getContext('2d');
const bugs = Array.from({ length: 260 }, () => ({ a: rnd() * 6.28, r: Math.sqrt(rnd()), h: 0, v: 0.2 + rnd() * 0.6, s: rnd() }));
function paintScene(time) {
  const dpr = Math.min(2, devicePixelRatio || 1);
  const w = innerWidth, h = innerHeight;
  if (scene.width !== Math.round(w * dpr) || scene.height !== Math.round(h * dpr)) { scene.width = Math.round(w * dpr); scene.height = Math.round(h * dpr); }
  sx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // room: celadon fog falling to moss, warm light from the upper left
  const bg = sx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#9FB5AC'); bg.addColorStop(0.45, '#56736A'); bg.addColorStop(1, '#1F3A33');
  sx.fillStyle = bg; sx.fillRect(0, 0, w, h);
  const key = sx.createRadialGradient(w * 0.15, h * 0.05, 0, w * 0.15, h * 0.05, Math.max(w, h) * 0.8);
  key.addColorStop(0, 'rgba(255,244,214,0.45)'); key.addColorStop(1, 'rgba(255,244,214,0)');
  sx.fillStyle = key; sx.fillRect(0, 0, w, h);
  // the jar: a soil disc seen from above at an angle, glass walls, a rim
  const cx = w / 2, cy = h * 0.56, rx = Math.min(w * 0.42, h * 0.62), ry = rx * 0.42;
  const top = cy - rx * 0.9;
  sx.fillStyle = 'rgba(201,216,210,0.10)';
  sx.beginPath(); sx.ellipse(cx, top, rx, ry, 0, Math.PI, 0); sx.lineTo(cx + rx, cy); sx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI); sx.closePath(); sx.fill();
  const soil = sx.createRadialGradient(cx - rx * 0.2, cy - ry * 0.3, 0, cx, cy, rx);
  soil.addColorStop(0, '#5B6A3A'); soil.addColorStop(0.55, '#33452F'); soil.addColorStop(1, '#3B2E26');
  sx.fillStyle = soil; sx.beginPath(); sx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); sx.fill();
  for (const b of bugs) {
    b.a += 0.004 * b.v * (speed || 0) * (b.s > 0.5 ? 1 : -1);
    const sp = species[Math.floor(b.s * species.length)];
    const x = cx + Math.cos(b.a) * b.r * rx * 0.94, y = cy + Math.sin(b.a) * b.r * ry * 0.94;
    sx.fillStyle = `hsl(${sp ? sp.hue : 90}, 55%, 58%)`;
    sx.beginPath(); sx.ellipse(x, y, 3.2, 2.2, 0, 0, Math.PI * 2); sx.fill();
  }
  sx.strokeStyle = 'rgba(255,244,214,0.35)'; sx.lineWidth = 1.5;
  sx.beginPath(); sx.ellipse(cx, top, rx, ry, 0, 0, Math.PI * 2); sx.stroke();
  sx.strokeStyle = 'rgba(201,216,210,0.28)';
  sx.beginPath(); sx.moveTo(cx - rx, top); sx.lineTo(cx - rx, cy); sx.moveTo(cx + rx, top); sx.lineTo(cx + rx, cy); sx.stroke();
  sx.beginPath(); sx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI); sx.stroke();
  // vignette
  const vg = sx.createRadialGradient(cx, h / 2, Math.min(w, h) * 0.35, cx, h / 2, Math.max(w, h) * 0.8);
  vg.addColorStop(0, 'rgba(20,36,31,0)'); vg.addColorStop(1, 'rgba(20,36,31,0.45)');
  sx.fillStyle = vg; sx.fillRect(0, 0, w, h);
  void time;
}
requestAnimationFrame(loop);
