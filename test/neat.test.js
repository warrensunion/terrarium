import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/sim/rng.js';
import {
  N_IN, N_OUT, createTracker, createGenome, mutate, crossover, distance, validateGenome, createBrain,
} from '../src/sim/neat.js';

const fresh = (seed = 1) => {
  const rng = createRng(seed);
  const tracker = createTracker();
  return { rng, tracker, g: createGenome(rng, tracker) };
};
const structure = (g) => ({
  nodes: g.nodes.map((n) => `${n.id}:${n.type}:${n.act}`),
  conns: g.conns.map((c) => `${c.inn}:${c.from}>${c.to}`),
});
const hidden = (g) => g.nodes.filter((n) => n.type === 'hidden').length;

test('createGenome is valid with 9x4 connections', () => {
  const { g } = fresh();
  assert.equal(N_IN, 8);
  assert.equal(N_OUT, 4);
  assert.deepEqual(validateGenome(g), []);
  assert.equal(g.nodes.length, 13);
  assert.equal(g.conns.length, 9 * 4);
  assert.deepEqual(g.nodes.map((n) => n.id), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.equal(g.nodes[8].type, 'bias');
  assert.ok(g.nodes.slice(9).every((n) => n.type === 'out' && n.act === 'tanh'));
  for (const c of g.conns) {
    assert.ok(c.from <= 8 && c.to >= 9 && c.to <= 12 && c.on);
    assert.ok(Number.isFinite(c.w));
  }
});

test('validateGenome reports broken genomes', () => {
  const { g } = fresh();
  const dupe = { nodes: [...g.nodes, { id: 3, type: 'hidden', act: 'tanh' }], conns: g.conns };
  assert.ok(validateGenome(dupe).length > 0);
  const dangling = { nodes: g.nodes, conns: [...g.conns, { inn: 999, from: 0, to: 77, w: 1, on: true }] };
  assert.ok(validateGenome(dangling).length > 0);
  const intoInput = { nodes: g.nodes, conns: [...g.conns, { inn: 998, from: 9, to: 2, w: 1, on: true }] };
  assert.ok(validateGenome(intoInput).length > 0);
  const intoBias = { nodes: g.nodes, conns: [...g.conns, { inn: 997, from: 9, to: 8, w: 1, on: true }] };
  assert.ok(validateGenome(intoBias).length > 0);
});

test('crossover of a genome with itself equals it structurally', () => {
  const { rng, tracker, g } = fresh(2);
  let a = g;
  for (let i = 0; i < 30; i++) a = mutate(a, rng, tracker, 1);
  const child = crossover(a, a, rng);
  assert.deepEqual(structure(child), structure(a));
  assert.deepEqual(child.conns.map((c) => c.w), a.conns.map((c) => c.w));
});

test('crossover child has every matching innovation and only the fitter parent\'s disjoint/excess', () => {
  const rng = createRng(5);
  const tracker = createTracker();
  const base = createGenome(rng, tracker);
  let fit = base, other = base;
  for (let i = 0; i < 40; i++) fit = mutate(fit, rng, tracker, 1);
  for (let i = 0; i < 40; i++) other = mutate(other, rng, tracker, 1);
  const fitInn = new Set(fit.conns.map((c) => c.inn));
  const otherInn = new Set(other.conns.map((c) => c.inn));
  const matching = [...fitInn].filter((i) => otherInn.has(i));
  const onlyOther = [...otherInn].filter((i) => !fitInn.has(i));
  assert.ok(onlyOther.length > 0, 'test needs disjoint genes in the weaker parent');
  for (let k = 0; k < 20; k++) {
    const child = crossover(fit, other, rng);
    const childInn = new Set(child.conns.map((c) => c.inn));
    assert.deepEqual([...childInn].sort((a, b) => a - b), [...fitInn].sort((a, b) => a - b));
    for (const i of matching) assert.ok(childInn.has(i));
    for (const i of onlyOther) assert.ok(!childInn.has(i));
    assert.deepEqual(validateGenome(child), []);
  }
  // matching genes really are drawn from both parents
  const fromOther = new Set();
  for (let k = 0; k < 20; k++) {
    const child = crossover(fit, other, rng);
    for (const c of child.conns) {
      const o = other.conns.find((x) => x.inn === c.inn);
      const f = fit.conns.find((x) => x.inn === c.inn);
      if (o && o.w !== f.w && c.w === o.w) fromOther.add(c.inn);
    }
  }
  assert.ok(fromOther.size > 0);
});

test('each mutation type keeps the genome valid', () => {
  const rng = createRng(11);
  const tracker = createTracker();
  let g = createGenome(rng, tracker);
  const seen = { weight: false, conn: false, node: false, toggle: false };
  for (let i = 0; i < 600; i++) {
    const next = mutate(g, rng, tracker, 1);
    assert.deepEqual(validateGenome(next), [], `after mutation ${i}`);
    if (next.nodes.length > g.nodes.length) seen.node = true;
    else if (next.conns.length > g.conns.length) seen.conn = true;
    const prevOn = new Map(g.conns.map((c) => [c.inn, c]));
    for (const c of next.conns) {
      const p = prevOn.get(c.inn);
      if (!p) continue;
      if (p.w !== c.w) seen.weight = true;
      if (p.on !== c.on && next.nodes.length === g.nodes.length) seen.toggle = true;
    }
    g = next;
  }
  assert.deepEqual(seen, { weight: true, conn: true, node: true, toggle: true });
});

test('mutate returns a copy and leaves the parent untouched', () => {
  const { rng, tracker, g } = fresh(4);
  const before = JSON.stringify(g);
  mutate(g, rng, tracker, 1);
  assert.equal(JSON.stringify(g), before);
});

test('add-node splits a connection: old disabled, two new with weights 1 and old w', () => {
  const rng = createRng(12);
  const tracker = createTracker();
  let g = createGenome(rng, tracker);
  for (let i = 0; i < 500; i++) {
    const next = mutate(g, rng, tracker, 1);
    if (next.nodes.length === g.nodes.length + 1) {
      const node = next.nodes.find((n) => !g.nodes.some((m) => m.id === n.id));
      assert.equal(node.type, 'hidden');
      const into = next.conns.filter((c) => c.to === node.id);
      const out = next.conns.filter((c) => c.from === node.id);
      assert.equal(into.length, 1);
      assert.equal(out.length, 1);
      assert.equal(into[0].w, 1);
      const old = next.conns.find((c) => c.from === into[0].from && c.to === out[0].to && c.inn < into[0].inn);
      assert.ok(old, 'split connection kept');
      assert.equal(old.on, false);
      assert.equal(out[0].w, old.w);
      return;
    }
    g = next;
  }
  assert.fail('no add-node mutation happened');
});

test('distance is 0 to itself, symmetric, and grows with weight perturbation', () => {
  const { rng, tracker, g } = fresh(6);
  assert.equal(distance(g, g), 0);
  let other = g;
  for (let i = 0; i < 20; i++) other = mutate(other, rng, tracker, 1);
  assert.ok(distance(g, other) > 0);
  assert.equal(distance(g, other), distance(other, g));
  const shift = (d) => ({ nodes: g.nodes, conns: g.conns.map((c) => ({ ...c, w: c.w + d })) });
  const a = distance(g, shift(0.1));
  const b = distance(g, shift(0.5));
  const c = distance(g, shift(2));
  assert.ok(a > 0 && a < b && b < c, `${a} ${b} ${c}`);
  assert.ok(Math.abs(distance(g, shift(1), { c3: 2 }) - 2) < 1e-9);
});

test('the same structural mutation in two genomes gets the same innovation', () => {
  const rng = createRng(8);
  const tracker = createTracker();
  const a = createGenome(rng, tracker);
  const b = createGenome(rng, tracker);
  assert.deepEqual(a.conns.map((c) => c.inn), b.conns.map((c) => c.inn));
  const i1 = tracker.connInn(9, 10);
  assert.equal(tracker.connInn(9, 10), i1);
  assert.notEqual(tracker.connInn(10, 9), i1);
  const n1 = tracker.splitNode(3);
  assert.equal(tracker.splitNode(3), n1);
  assert.ok(n1 >= 13);
  assert.notEqual(tracker.splitNode(4), n1);
});

test('brain outputs are finite and in [-1, 1] for tanh outputs', () => {
  const rng = createRng(13);
  const tracker = createTracker();
  let g = createGenome(rng, tracker);
  for (let i = 0; i < 100; i++) g = mutate(g, rng, tracker, 1);
  const brain = createBrain(g);
  assert.equal(brain.values.length, g.nodes.length);
  assert.deepEqual(brain.order, g.nodes.map((n) => n.id));
  const inputs = new Float32Array(8);
  for (let t = 0; t < 500; t++) {
    for (let i = 0; i < 8; i++) inputs[i] = rng.range(-1, 1);
    const out = brain.activate(inputs);
    assert.equal(out.length, 4);
    for (const v of out) assert.ok(Number.isFinite(v) && v >= -1 && v <= 1, String(v));
  }
});

test('brain is one recurrent step per call: inputs reach outputs in one step, hidden in two', () => {
  const g = {
    nodes: [
      ...Array.from({ length: 8 }, (_, id) => ({ id, type: 'in', act: 'id' })),
      { id: 8, type: 'bias', act: 'id' },
      ...[9, 10, 11, 12].map((id) => ({ id, type: 'out', act: 'tanh' })),
      { id: 13, type: 'hidden', act: 'id' },
    ],
    conns: [
      { inn: 0, from: 0, to: 9, w: 0.5, on: true },
      { inn: 1, from: 0, to: 13, w: 1, on: true },
      { inn: 2, from: 13, to: 10, w: 1, on: true },
      { inn: 3, from: 8, to: 11, w: 0.25, on: true },
      { inn: 4, from: 1, to: 12, w: 5, on: false },
    ],
  };
  const brain = createBrain(g);
  const x = new Float32Array(8);
  x[0] = 1; x[1] = 1;
  let out = brain.activate(x);
  assert.ok(Math.abs(out[0] - Math.tanh(0.5)) < 1e-6);
  assert.equal(out[1], 0, 'hidden had no value yet');
  assert.ok(Math.abs(out[2] - Math.tanh(0.25)) < 1e-6, 'bias is 1');
  assert.equal(out[3], 0, 'disabled connection ignored');
  out = brain.activate(x);
  assert.ok(Math.abs(out[1] - Math.tanh(1)) < 1e-6, 'signal crossed the hidden node on step 2');
  assert.equal(brain.values[13], 1);
});

test('high mutation keeps genomes valid and bounded', () => {
  const rng = createRng(21);
  const tracker = createTracker();
  let g = createGenome(rng, tracker);
  const inputs = new Float32Array(8);
  for (let i = 0; i < 2000; i++) {
    g = mutate(g, rng, tracker, 1);
    if (i % 100 === 99) {
      assert.deepEqual(validateGenome(g), []);
      const brain = createBrain(g);
      for (let t = 0; t < 300; t++) {
        for (let k = 0; k < 8; k++) inputs[k] = rng.range(-1, 1);
        for (const v of brain.activate(inputs)) assert.ok(Number.isFinite(v));
        // inputs are in [-1, 1] and every activation is bounded, so every node is too
        for (const v of brain.values) assert.ok(v >= -1 && v <= 1, `node value ${v}`);
      }
    }
  }
  assert.ok(hidden(g) <= 48, `hidden ${hidden(g)}`);
  assert.ok(g.nodes.length <= 64);
  assert.ok(hidden(g) > 10, 'it did actually grow');
});
