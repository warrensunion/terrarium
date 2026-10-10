// Legs are the one part of the live scene that can silently go wrong (NaN
// knees, feet skating, both feet lifting at once), so the maths is pinned here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solveTwoBone, stepFeet, GAIT, createGait } from '../src/live/ik.js';

const v = (x, y, z) => ({ x, y, z });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const finite = (p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);

test('solveTwoBone reaches reachable targets within 1e-6 with exact bone lengths', () => {
  const hip = v(0.3, 1, -0.2);
  for (const [tx, ty, tz] of [[1, 0, 0.5], [0.4, 0.2, -0.1], [-0.4, 0.3, 0.6], [0.3, -0.4, -0.2]]) {
    const target = v(tx, ty, tz);
    const r = solveTwoBone(hip, target, 0.8, 0.7, v(0, 3, 0));
    assert.ok(dist(r.end, target) < 1e-6, `end misses target ${tx},${ty},${tz}`);
    assert.ok(Math.abs(dist(hip, r.knee) - 0.8) < 1e-6, 'thigh length');
    assert.ok(Math.abs(dist(r.knee, r.end) - 0.7) < 1e-6, 'shin length');
    assert.equal(r.reached, true);
  }
});

test('solveTwoBone bends the knee toward the pole', () => {
  const hip = v(0, 1, 0);
  const r = solveTwoBone(hip, v(1, 0, 0), 0.8, 0.8, v(0.5, 5, 0));
  // the knee sits above the hip→target line (the pole side)
  const midY = 0.5;
  assert.ok(r.knee.y > midY, `knee y ${r.knee.y}`);
  const r2 = solveTwoBone(hip, v(1, 0, 0), 0.8, 0.8, v(0.5, -5, 0));
  assert.ok(r2.knee.y < midY);
});

test('solveTwoBone stretches toward unreachable targets without NaN', () => {
  const hip = v(0, 0, 0);
  const target = v(10, 0, 0);
  const r = solveTwoBone(hip, target, 1, 1, v(0, 1, 0));
  assert.ok(finite(r.knee) && finite(r.end));
  assert.equal(r.reached, false);
  assert.ok(Math.abs(dist(hip, r.end) - 2) < 1e-6, 'fully extended');
  // end lies on the hip→target ray
  assert.ok(Math.abs(r.end.y) < 1e-9 && Math.abs(r.end.z) < 1e-9 && r.end.x > 0);
});

test('solveTwoBone survives degenerate input: target on the hip, pole on the line, too close', () => {
  const cases = [
    [v(0, 0, 0), v(0, 0, 0), v(0, 1, 0)],      // zero distance
    [v(0, 0, 0), v(0, 1, 0), v(0, 2, 0)],      // pole collinear with the leg
    [v(0, 0, 0), v(0.01, 0, 0), v(0, 1, 0)],   // closer than |l1 - l2|
  ];
  for (const [h, t, p] of cases) {
    const r = solveTwoBone(h, t, 1, 0.5, p);
    assert.ok(finite(r.knee) && finite(r.end), JSON.stringify([h, t, p]));
    assert.ok(Math.abs(dist(h, r.knee) - 1) < 1e-6);
  }
});

test('solveTwoBone writes into out vectors when given (no allocation in the hot loop)', () => {
  const knee = v(0, 0, 0), end = v(0, 0, 0);
  const r = solveTwoBone(v(0, 1, 0), v(1, 0, 0), 1, 1, v(0, 3, 0), knee, end);
  assert.equal(r.knee, knee);
  assert.equal(r.end, end);
});

// --- gait ---------------------------------------------------------------

function pair() {
  const g = createGait(1);
  // feet planted at their rest spots: left at (-1, 0), right at (1, 0)
  g[GAIT.LX] = -1; g[GAIT.LZ] = 0; g[GAIT.RX] = 1; g[GAIT.RZ] = 0;
  return g;
}
const run = (g, rest, seconds, thr = 0.5, dur = 0.1) => {
  for (let t = 0; t < seconds; t += 1 / 60) stepFeet(g, 0, rest[0], rest[1], rest[2], rest[3], thr, 1 / 60, dur);
};

test('stepFeet leaves a foot planted while it lags less than the threshold', () => {
  const g = pair();
  run(g, [-1, 0.4, 1, 0.4], 1);
  assert.equal(g[GAIT.LX], -1); assert.equal(g[GAIT.LZ], 0);
  assert.equal(g[GAIT.RX], 1); assert.equal(g[GAIT.RZ], 0);
});

test('stepFeet moves a lagging foot to (or past) its rest spot', () => {
  const g = pair();
  run(g, [-1, 0.8, 1, 0], 0.5);
  assert.ok(g[GAIT.LZ] >= 0.8 - 1e-9, `left z ${g[GAIT.LZ]}`);
  assert.equal(g[GAIT.RZ], 0, 'the planted right foot did not move');
  assert.equal(g[GAIT.LT], -1, 'step finished');
});

test('stepFeet never lifts both feet of a pair and alternates sides', () => {
  const g = pair();
  const order = [];
  let wasL = false, wasR = false;
  for (let z = 0; z < 6; z += 0.05) {
    stepFeet(g, 0, -1, z, 1, z, 0.5, 1 / 60, 0.1);
    const l = g[GAIT.LT] >= 0, r = g[GAIT.RT] >= 0;
    assert.ok(!(l && r), 'both feet in the air');
    if (l && !wasL) order.push('L');
    if (r && !wasR) order.push('R');
    wasL = l; wasR = r;
  }
  assert.ok(order.length >= 4, `steps: ${order.join('')}`);
  for (let i = 1; i < order.length; i++) assert.notEqual(order[i], order[i - 1], `order ${order.join('')}`);
});

test('stepFeet reports lift height through the step phase', () => {
  const g = pair();
  stepFeet(g, 0, -1, 0.9, 1, 0, 0.5, 1 / 60, 0.1);
  assert.ok(g[GAIT.LT] >= 0 && g[GAIT.LT] < 1);
});

test('stepFeet snaps a foot that is hopelessly far behind (16x speed)', () => {
  const g = pair();
  stepFeet(g, 0, -1, 50, 1, 50, 0.5, 1 / 60, 0.1);
  assert.equal(g[GAIT.LZ], 50);
  assert.equal(g[GAIT.RZ], 50);
});
