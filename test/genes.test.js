import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/sim/rng.js';
import { randomBodyGenes, mutateBodyGenes, crossBodyGenes, bodyFromGenes } from '../src/sim/genes.js';

const KEYS = ['segments', 'limb', 'size', 'hue', 'sat', 'pattern'];
const all = (v) => Object.fromEntries(KEYS.map((k) => [k, v]));
const close = (a, b) => Math.abs(a - b) < 1e-9;

test('bodyFromGenes spans the documented ranges at 0 and 1', () => {
  const lo = bodyFromGenes(all(0));
  const hi = bodyFromGenes(all(1));
  assert.equal(lo.segments, 2);
  assert.equal(hi.segments, 7);
  assert.ok(close(lo.legLength, 0.6) && close(hi.legLength, 1.8));
  assert.ok(close(lo.radius, 0.012) && close(hi.radius, 0.03));
  assert.ok(close(lo.hue, 0) && close(hi.hue, 360));
  assert.ok(close(lo.sat, 0.35) && close(hi.sat, 0.85));
  for (const b of [lo, hi]) assert.ok(b.light >= 0.45 - 1e-9 && b.light <= 0.7 + 1e-9);
  assert.equal(lo.pattern, 0);
  assert.equal(hi.pattern, 2);
  assert.equal(bodyFromGenes({ ...all(0), pattern: 0.5 }).pattern, 1);
});

test('segments follow 2 + round(g*5)', () => {
  for (let i = 0; i <= 20; i++) {
    const g = i / 20;
    assert.equal(bodyFromGenes({ ...all(0.5), segments: g }).segments, 2 + Math.round(g * 5));
  }
});

test('bodyFromGenes is monotonic in segments, limb and size', () => {
  for (let i = 1; i <= 50; i++) {
    const v = i / 50;
    const segs = bodyFromGenes({ ...all(0), segments: v }).segments;
    const leg = bodyFromGenes({ ...all(0), limb: v }).legLength;
    const rad = bodyFromGenes({ ...all(0), size: v }).radius;
    const p = { segs: bodyFromGenes({ ...all(0), segments: (i - 1) / 50 }).segments,
      leg: bodyFromGenes({ ...all(0), limb: (i - 1) / 50 }).legLength,
      rad: bodyFromGenes({ ...all(0), size: (i - 1) / 50 }).radius };
    assert.ok(segs >= p.segs && leg > p.leg && rad > p.rad);
  }
});

test('bodyFromGenes clamps out-of-range genes', () => {
  assert.deepEqual(bodyFromGenes(all(-3)), bodyFromGenes(all(0)));
  assert.deepEqual(bodyFromGenes(all(7)), bodyFromGenes(all(1)));
  const b = bodyFromGenes({ ...all(0.5), segments: NaN });
  assert.equal(b.segments, 2, 'NaN treated as 0');
});

test('random and mutated genes stay in [0, 1]', () => {
  const rng = createRng(1);
  let b = randomBodyGenes(rng);
  assert.deepEqual(Object.keys(b).sort(), [...KEYS].sort());
  for (let i = 0; i < 3000; i++) {
    const next = mutateBodyGenes(b, rng, 1);
    assert.notEqual(next, b, 'returns a copy');
    for (const k of KEYS) assert.ok(next[k] >= 0 && next[k] <= 1, `${k}=${next[k]}`);
    b = next;
  }
  const edge = mutateBodyGenes(all(1), rng, 1);
  for (const k of KEYS) assert.ok(edge[k] <= 1);
});

test('mutation strength scales with rate', () => {
  const drift = (rate) => {
    const rng = createRng(2);
    let sum = 0;
    for (let i = 0; i < 500; i++) sum += Math.abs(mutateBodyGenes(all(0.5), rng, rate).limb - 0.5);
    return sum;
  };
  assert.equal(drift(0), 0);
  assert.ok(drift(0.1) < drift(0.5));
});

test('crossBodyGenes takes each gene from one of the parents', () => {
  const rng = createRng(3);
  const a = all(0.1);
  const b = all(0.9);
  const fromA = new Set(), fromB = new Set();
  for (let i = 0; i < 50; i++) {
    const c = crossBodyGenes(a, b, rng);
    for (const k of KEYS) {
      assert.ok(c[k] === a[k] || c[k] === b[k]);
      (c[k] === a[k] ? fromA : fromB).add(k);
    }
  }
  assert.equal(fromA.size, 6);
  assert.equal(fromB.size, 6);
});
