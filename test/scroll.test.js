import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wheelPixels, swipeIntent, createScrollState, MAX_EVENT_PX, LINE_PX } from '../src/core/scroll.js';

test('wheelPixels normalises delta modes and clamps flings', () => {
  assert.equal(wheelPixels(100, 0, 900), 100);
  assert.equal(wheelPixels(3, 1, 900), 3 * LINE_PX);
  assert.equal(wheelPixels(1, 2, 900), MAX_EVENT_PX);
  assert.equal(wheelPixels(-5000, 0, 900), -MAX_EVENT_PX);
});

test('swipeIntent needs distance and speed', () => {
  assert.equal(swipeIntent(-120, 150), 1);
  assert.equal(swipeIntent(120, 150), -1);
  assert.equal(swipeIntent(-20, 30), 0);
  assert.equal(swipeIntent(-120, 2000), 0);
});

test('scroll state clamps to its bounds and smooths toward the target', () => {
  const s = createScrollState({ min: -0.2, max: 1.2, lambda: 7 });
  s.add(5);
  assert.equal(s.target, 1.2);
  assert.equal(s.value, 0);
  let prev = 0;
  for (let i = 0; i < 120; i++) { const v = s.update(1 / 60); assert.ok(v >= prev && v <= 1.2); prev = v; }
  assert.ok(Math.abs(s.value - 1.2) < 1e-3);
});

test('a locked scroll ignores input; set() snaps', () => {
  const s = createScrollState({ min: 0, max: 1 });
  s.lock(true);
  s.add(0.5);
  assert.equal(s.target, 0);
  s.set(0.7);
  assert.equal(s.value, 0.7);
  s.lock(false);
  s.add(NaN);
  assert.equal(s.target, 0.7);
  s.bounds(0, 0.5);
  assert.equal(s.target, 0.5);
});
