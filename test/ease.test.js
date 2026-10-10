import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/core/ease.js';

const curves = ['p1in', 'p1out', 'p1inOut', 'expoOut', 'smooth', 'p2in', 'p2out', 'p2inOut', 'p3in', 'p3out', 'p3inOut', 'p4in', 'p4out', 'p4inOut'];

test('power eases start at 0 and end at 1', () => {
  for (const k of curves) {
    assert.equal(E[k](0), 0, k);
    assert.ok(Math.abs(E[k](1) - 1) < 1e-12, k);
  }
});

test('inOut eases pass through the middle', () => {
  for (const k of ['p2inOut', 'p3inOut', 'p4inOut']) assert.ok(Math.abs(E[k](0.5) - 0.5) < 1e-12, k);
});

test('eases are monotonic', () => {
  for (const k of curves) for (let i = 1; i <= 100; i++) assert.ok(E[k](i / 100) >= E[k]((i - 1) / 100), k);
});

test('damp moves toward the target without overshooting', () => {
  let v = 0;
  for (let i = 0; i < 50; i++) { const n = E.damp(v, 10, 8, 0.016); assert.ok(n > v && n <= 10); v = n; }
  assert.ok(E.damp(0, 10, 8, 1) <= 10);
  assert.equal(E.damp(3, 3, 8, 0.016), 3);
});

test('clamp and lerp', () => {
  assert.equal(E.clamp(5, 0, 1), 1);
  assert.equal(E.clamp(-5, 0, 1), 0);
  assert.equal(E.lerp(2, 4, 0.5), 3);
});

test('expoOut is fast early and lands exactly', () => {
  assert.ok(E.expoOut(0.28) > 0.8);
  assert.equal(E.expoOut(1), 1);
});

test('seg maps a window of a timeline onto an ease', () => {
  assert.equal(E.seg(0.1, 0.4, 1), 0);
  assert.equal(E.seg(2, 0.4, 1), 1);
  assert.ok(Math.abs(E.seg(0.9, 0.4, 1) - 0.5) < 1e-12);
  assert.ok(Math.abs(E.seg(0.9, 0.4, 1, E.p2inOut) - 0.5) < 1e-12);
});
