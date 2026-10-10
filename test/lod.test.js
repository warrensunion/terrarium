// The leg LOD decides who gets real IK. It must pick full detail for anything
// big on screen and must not flicker at a boundary, so it is pinned here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectedPx, lodFor, LOD_FAR, LOD_MID, LOD_FULL, LOD_FAR_PX, LOD_NEAR_PX } from '../src/live/lod.js';

test('projectedPx: body diameter on screen shrinks with distance', () => {
  // 1000 px per unit at distance 1: a 0.1-radius body 10 units away is 20 px across
  assert.equal(projectedPx(0.1, 10, 1000), 20);
  assert.ok(projectedPx(0.1, 20, 1000) < projectedPx(0.1, 10, 1000));
  assert.ok(Number.isFinite(projectedPx(0.1, 0, 1000)), 'no divide by zero at the lens');
});

test('lodFor: far below ~8 px, mid up to ~20 px, full above', () => {
  assert.equal(lodFor(2, LOD_FULL), LOD_FAR);
  assert.equal(lodFor(12, LOD_FULL), LOD_MID);
  assert.equal(lodFor(40, LOD_FAR), LOD_FULL);
  assert.ok(LOD_FAR_PX >= 5 && LOD_FAR_PX <= 9 && LOD_NEAR_PX >= 18 && LOD_NEAR_PX <= 22);
});

test('lodFor: hysteresis, so a creature hovering at a boundary does not flicker', () => {
  // just above the far boundary: a far creature stays far, a mid one stays mid
  const justAbove = LOD_FAR_PX * 1.05, justBelow = LOD_FAR_PX * 0.95;
  assert.equal(lodFor(justAbove, LOD_FAR), LOD_FAR);
  assert.equal(lodFor(justBelow, LOD_MID), LOD_MID);
  // same at the near boundary
  assert.equal(lodFor(LOD_NEAR_PX * 1.05, LOD_MID), LOD_MID);
  assert.equal(lodFor(LOD_NEAR_PX * 0.95, LOD_FULL), LOD_FULL);
  // a clear move does switch
  assert.equal(lodFor(LOD_FAR_PX * 1.3, LOD_FAR), LOD_MID);
  assert.equal(lodFor(LOD_NEAR_PX * 0.7, LOD_FULL), LOD_MID);
});
