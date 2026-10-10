import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/sim/rng.js';
import { createTracker, createGenome, distance } from '../src/sim/neat.js';
import { speciate, adjustThreshold } from '../src/sim/species.js';

const counter = (start = 1) => { let n = start; return () => n++; };
const scaled = (g, k) => ({ nodes: g.nodes, conns: g.conns.map((c) => ({ ...c, w: c.w * k + k })) });

test('clones of one genome form one species', () => {
  const rng = createRng(1);
  const g = createGenome(rng, createTracker());
  const pop = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, genome: g }));
  const sp = speciate(pop, [], 1, rng, counter(), 0);
  assert.equal(sp.length, 1);
  assert.deepEqual(sp[0].members, pop.map((p) => p.id));
  assert.equal(sp[0].rep, g);
  assert.equal(sp[0].born, 0);
});

test('two genomes further apart than the threshold form two species', () => {
  const rng = createRng(2);
  const a = createGenome(rng, createTracker());
  const b = scaled(a, 6);
  assert.ok(distance(a, b) > 1);
  const pop = [{ id: 1, genome: a }, { id: 2, genome: b }, { id: 3, genome: a }];
  const sp = speciate(pop, [], 1, rng, counter(), 5);
  assert.equal(sp.length, 2);
  assert.deepEqual(sp.map((s) => s.members), [[1, 3], [2]]);
  assert.deepEqual(sp.map((s) => s.id), [1, 2]);
});

test('members join the first previous species under the threshold; empty ones are dropped', () => {
  const rng = createRng(3);
  const a = createGenome(rng, createTracker());
  const b = scaled(a, 6);
  const prev = [
    { id: 7, rep: b, members: [], hue: 10, born: 0 },
    { id: 8, rep: a, members: [], hue: 147.5, born: 0 },
    { id: 9, rep: a, members: [], hue: 285, born: 0 },
  ];
  const sp = speciate([{ id: 1, genome: a }, { id: 2, genome: a }], prev, 1, rng, counter(100), 50);
  assert.equal(sp.length, 1);
  assert.equal(sp[0].id, 8, 'first matching previous species wins');
  assert.equal(sp[0].hue, 147.5, 'continuing species keep their hue');
  assert.equal(sp[0].born, 0, 'and their birth tick');
  assert.deepEqual(sp[0].members, [1, 2]);
});

test('new species hues step by the golden angle 137.5', () => {
  const rng = createRng(4);
  const base = createGenome(rng, createTracker());
  const pop = [1, 2, 3, 4, 5].map((k) => ({ id: k, genome: scaled(base, k * 8) }));
  const sp = speciate(pop, [], 0.5, rng, counter(), 0);
  assert.equal(sp.length, 5);
  for (let i = 1; i < sp.length; i++) {
    const d = (sp[i].hue - sp[i - 1].hue + 360) % 360;
    assert.ok(Math.abs(d - 137.5) < 1e-9, `hue step ${d}`);
  }
  for (const s of sp) assert.ok(s.hue >= 0 && s.hue < 360);
  const prev = [{ id: 1, rep: base, members: [], hue: 300, born: 0 }];
  const next = speciate([{ id: 9, genome: scaled(base, 50) }], prev, 0.5, rng, counter(2), 10);
  assert.ok(Math.abs(next[0].hue - (300 + 137.5 - 360)) < 1e-9, 'continues from the last previous species');
});

test('adjustThreshold moves toward the target species count and clamps', () => {
  assert.ok(Math.abs(adjustThreshold(3, 20) - 2.7) < 1e-12, 'too many species: lower');
  assert.ok(Math.abs(adjustThreshold(3, 2) - 3.3) < 1e-12, 'too few species: raise');
  assert.equal(adjustThreshold(3, 10), 3, 'in band: keep');
  assert.equal(adjustThreshold(3, 6), 3);
  assert.equal(adjustThreshold(3, 14), 3);
  assert.equal(adjustThreshold(0.51, 100), 0.5, 'clamped low');
  assert.equal(adjustThreshold(11.9, 0), 12, 'clamped high');
  assert.ok(Math.abs(adjustThreshold(3, 5, 2, 4) - 2.7) < 1e-12, 'custom band');
});
