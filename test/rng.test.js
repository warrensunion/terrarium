import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/sim/rng.js';

const take = (r, n) => Array.from({ length: n }, () => r.next());

test('same seed gives the same sequence', () => {
  assert.deepEqual(take(createRng(42), 100), take(createRng(42), 100));
});

test('different seeds give different sequences', () => {
  assert.notDeepEqual(take(createRng(1), 20), take(createRng(2), 20));
});

test('next() is in [0, 1)', () => {
  const r = createRng(7);
  for (let i = 0; i < 10000; i++) {
    const v = r.next();
    assert.ok(v >= 0 && v < 1, String(v));
  }
});

test('int(n) stays in range over 10k draws and hits every value', () => {
  const r = createRng(3);
  const seen = new Set();
  for (let i = 0; i < 10000; i++) {
    const v = r.int(7);
    assert.ok(Number.isInteger(v) && v >= 0 && v < 7, String(v));
    seen.add(v);
  }
  assert.equal(seen.size, 7);
});

test('range, normal and pick behave', () => {
  const r = createRng(9);
  let sum = 0, sq = 0;
  const n = 20000;
  for (let i = 0; i < n; i++) {
    const v = r.range(-2, 3);
    assert.ok(v >= -2 && v < 3);
    const g = r.normal();
    assert.ok(Number.isFinite(g));
    sum += g; sq += g * g;
  }
  assert.ok(Math.abs(sum / n) < 0.05, 'normal mean ~0');
  assert.ok(Math.abs(sq / n - 1) < 0.05, 'normal variance ~1');
  const arr = ['a', 'b', 'c'];
  for (let i = 0; i < 100; i++) assert.ok(arr.includes(r.pick(arr)));
});
