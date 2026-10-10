import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, packFrame, STRIDE, FLOOR } from '../src/sim/world.js';
import { senseCPU, SENSE_R } from '../src/sim/sense-cpu.js';

const run = (w, n, each) => { for (let i = 0; i < n; i++) { w.step(); each?.(w); } return w; };

test('packFrame uses STRIDE 10 and mirrors the live creatures', () => {
  assert.equal(STRIDE, 10);
  const w = createWorld({ seed: 3, count: 120 });
  run(w, 30);
  const f = packFrame(w, null, -1);
  assert.equal(f.type, 'frame');
  assert.equal(f.tick, w.tick);
  assert.ok(f.creatures instanceof Float32Array);
  assert.equal(f.creatures.length, w.creatures.length * STRIDE);
  w.creatures.forEach((c, i) => {
    const row = f.creatures.subarray(i * STRIDE, i * STRIDE + STRIDE);
    const want = [c.id, c.x, c.y, c.heading, c.speed, c.energy, c.species, c.age, c.flags, c.generation];
    want.forEach((v, k) => assert.ok(Math.abs(row[k] - Math.fround(v)) < 1e-6, `field ${k}`));
  });
  assert.ok(f.food instanceof Float32Array);
  assert.equal(f.food.length, 900 * 3);
  assert.equal(f.stats.population, w.creatures.length);
  assert.equal(f.stats.tick, w.tick);
  assert.equal(f.stats.species.reduce((s, [, n]) => s + n, 0), w.creatures.length);
  assert.equal(f.inspect, null);
  assert.equal(f.dead, null);
});

test('the first frame lists every initial creature in births', () => {
  const w = createWorld({ seed: 4, count: 150 });
  const f = packFrame(w, null, -1);
  assert.equal(f.births.length, 150);
  const b = f.births[0];
  assert.deepEqual(Object.keys(b).sort(), ['body', 'generation', 'genes', 'id', 'parents', 'species']);
  assert.ok(b.body.segments >= 2 && b.body.segments <= 7 && b.body.radius >= 0.012);
  assert.deepEqual(b.parents, []);
  assert.equal(b.generation, 0);
  assert.deepEqual(packFrame(w, null, w.tick).births, [], 'nothing new since the last frame');
});

test('two worlds with the same seed are identical after 500 steps', () => {
  const a = run(createWorld({ seed: 7, count: 300 }), 500);
  const b = run(createWorld({ seed: 7, count: 300 }), 500);
  assert.deepEqual(packFrame(a, null, -1).creatures, packFrame(b, null, -1).creatures);
  assert.deepEqual(packFrame(a, null, -1).food, packFrame(b, null, -1).food);
});

test('different seeds give different worlds', () => {
  const a = run(createWorld({ seed: 7, count: 300 }), 50);
  const b = run(createWorld({ seed: 8, count: 300 }), 50);
  assert.notDeepEqual(packFrame(a, null, -1).creatures, packFrame(b, null, -1).creatures);
});

test('nobody leaves the disc and energy stays in [0, 1] over 1000 steps', () => {
  const w = createWorld({ seed: 11, count: 400 });
  run(w, 1000, () => {
    for (const c of w.creatures) {
      const r = Math.hypot(c.x, c.y);
      assert.ok(r <= 1, `creature ${c.id} at r=${r}`);
      assert.ok(c.energy >= 0 && c.energy <= 1, `energy ${c.energy}`);
      assert.ok(Number.isFinite(c.heading) && c.speed >= 0 && c.speed <= 0.25);
    }
  });
});

test('population never drops below the floor over 3000 steps', () => {
  assert.equal(FLOOR, 60);
  // a harsh world: no food at all and the worst temperature
  const w = createWorld({ seed: 5, count: 200, params: { foodRate: 0, temperature: 1 } });
  run(w, 3000, () => assert.ok(w.creatures.length >= FLOOR, `population ${w.creatures.length} at ${w.tick}`));
  const normal = createWorld({ seed: 6, count: 600 });
  run(normal, 3000, () => assert.ok(normal.creatures.length >= FLOOR));
});

test('default params sustain a large population with several species', () => {
  const w = createWorld({ seed: 6, count: 600 });
  let low = Infinity;
  run(w, 3000, () => { if (w.tick > 1200) low = Math.min(low, w.creatures.length); });
  assert.ok(low >= 250, `population fell to ${low}`);
  assert.ok(w.species.length >= 3, `${w.species.length} species`);
  assert.ok(w.creatures.some((c) => c.parents.length === 2), 'sexual reproduction happens');
});

test('births record parents and generation = max(parent) + 1; deaths are reported', () => {
  const w = createWorld({ seed: 9, count: 300 });
  const gen = new Map();
  let since = -1, sexual = 0, budded = 0, deaths = 0;
  for (let i = 0; i < 3000; i++) {
    const f = packFrame(w, null, since);
    since = f.tick;
    deaths += f.deaths.length;
    for (const b of f.births) {
      if (b.parents.length) {
        const want = Math.max(...b.parents.map((p) => gen.get(p))) + 1;
        assert.equal(b.generation, want, `child ${b.id} of ${b.parents}`);
      } else {
        assert.equal(b.generation, 0, "founders and fresh spawns start at generation 0");
      }
      if (b.parents.length === 2) sexual++;
      if (b.parents.length === 1) budded++;
      gen.set(b.id, b.generation);
    }
    w.step();
  }
  assert.ok(sexual + budded > 0, 'somebody was born');
  assert.ok(deaths > 0, 'somebody died');
  assert.equal(w.generation, Math.max(...w.creatures.map((c) => c.generation)));
});

test('re-speciation every 120 steps keeps every creature in a live species', () => {
  const w = run(createWorld({ seed: 2, count: 300 }), 241);
  const ids = new Set(w.species.map((s) => s.id));
  for (const c of w.creatures) assert.ok(ids.has(c.species), `species ${c.species}`);
  for (const s of w.species) assert.ok(s.hue >= 0 && s.hue < 360);
});

test('inspecting a creature returns its brain and lineage, and reports its death', () => {
  const w = createWorld({ seed: 12, count: 200 });
  run(w, 300);
  const child = w.creatures.find((c) => c.parents.length) ?? w.creatures[0];
  const f = packFrame(w, child.id, w.tick);
  assert.equal(f.inspect.id, child.id);
  assert.ok(f.inspect.values instanceof Float32Array);
  assert.equal(f.inspect.values.length, child.genome.nodes.length);
  assert.equal(f.inspect.genome, child.genome);
  assert.ok(Array.isArray(f.inspect.lineage) && f.inspect.lineage.length <= 12);
  if (child.parents.length) assert.equal(f.inspect.lineage[0], child.parents[0]);
  for (const k of ['age', 'energy', 'generation', 'parents', 'species', 'gathered']) assert.ok(k in f.inspect, k);
  child.energy = 0; // starve it
  w.step();
  const g = packFrame(w, child.id, f.tick);
  assert.equal(g.dead, child.id);
  assert.equal(g.inspect, null);
  assert.ok(g.deaths.includes(child.id));
});

test('grid sensing matches a brute-force scan', () => {
  const w = run(createWorld({ seed: 14, count: 500 }), 200);
  w.indexSpace();
  senseCPU(w);
  const { snap, food, creatures } = w;
  const ref = (px, py, h, xy, n, self, skipEaten) => {
    let best = -1, bd = SENSE_R * SENSE_R;
    for (let j = 0; j < n; j++) {
      if (j === self || (skipEaten && !(xy[j * 3 + 2] > 0))) continue;
      const d2 = (xy[j * 3] - px) ** 2 + (xy[j * 3 + 1] - py) ** 2;
      if (d2 < bd) { bd = d2; best = j; }
    }
    if (best < 0) return [0, 0, 1];
    const dx = xy[best * 3] - px, dy = xy[best * 3 + 1] - py, d = Math.hypot(dx, dy);
    return [(dy * Math.cos(h) - dx * Math.sin(h)) / d, (dx * Math.cos(h) + dy * Math.sin(h)) / d, d / SENSE_R];
  };
  let seen = 0, none = 0;
  creatures.forEach((c, i) => {
    const x = snap[i * 3], y = snap[i * 3 + 1], h = snap[i * 3 + 2];
    const want = [...ref(x, y, h, food, food.length / 3, -1, true), ...ref(x, y, h, snap, creatures.length, i, false)];
    want.forEach((v, k) => assert.ok(Math.abs(c.inputs[k] - v) < 1e-5, `creature ${i} input ${k}: ${c.inputs[k]} vs ${v}`));
    if (want[2] < 1) seen++; else none++;
  });
  assert.ok(seen > 100, 'most creatures see food');
});

test('an injected sensor replaces CPU sensing', () => {
  let calls = 0;
  const w = createWorld({ seed: 1, count: 100, sensor: (world) => { calls++; for (const c of world.creatures) c.inputs.fill(0, 0, 6); } });
  run(w, 5);
  assert.equal(calls, 5);
  assert.equal(w.creatures[0].inputs[2], 0);
});

test('params update live and are clamped', () => {
  const w = createWorld({ seed: 1, count: 80 });
  w.setParams({ foodRate: 9, mutationRate: -1 });
  assert.deepEqual(w.params, { foodRate: 3, mutationRate: 0, temperature: 0.5 });
});

test('a world started with idBase never reuses an earlier world\'s ids', () => {
  const a = run(createWorld({ seed: 1, count: 100 }), 50);
  assert.ok(a.lastId >= Math.max(...a.creatures.map((c) => c.id)));
  const b = createWorld({ seed: 2, count: 100, idBase: a.lastId });
  assert.ok(Math.min(...b.creatures.map((c) => c.id)) > a.lastId);
});
