/**
 * Legs: why procedural and not skinned animation. A creature's body is grown
 * from genes (2..7 segments, any leg length), so there is no rig to author.
 * Instead every foot is planted on the ground and only lifts when the body has
 * walked too far from it; a two-bone IK puts the knee in between. That gives
 * real stepping at any speed for ~8 000 legs a frame, and the gait reads as
 * alive because feet stay put while the body moves over them.
 *
 * Everything here works on plain {x, y, z} objects and flat Float32Arrays so it
 * is testable in node and allocates nothing in the hot loop.
 */

const EPS = 1e-9;
const RESULT = { knee: null, end: null, reached: false };

/**
 * Two-bone IK (hip → knee → foot).
 * @param {{x,y,z}} hip
 * @param {{x,y,z}} target where the foot wants to be
 * @param {number} l1 thigh length
 * @param {number} l2 shin length
 * @param {{x,y,z}} pole a point the knee bends toward
 * @param {{x,y,z}} [knee] out
 * @param {{x,y,z}} [end] out
 * @returns {{knee, end, reached:boolean}} reached = target lies within [|l1-l2|, l1+l2].
 *   The returned object is reused by the next call (no allocation per leg).
 */
export function solveTwoBone(hip, target, l1, l2, pole, knee = { x: 0, y: 0, z: 0 }, end = { x: 0, y: 0, z: 0 }) {
  let dx = target.x - hip.x, dy = target.y - hip.y, dz = target.z - hip.z;
  let d = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (d < EPS) { dx = 0; dy = -1; dz = 0; d = 0; } else { dx /= d; dy /= d; dz /= d; }

  const lo = Math.abs(l1 - l2), hi = l1 + l2;
  const reached = d >= lo - 1e-12 && d <= hi + 1e-12;
  const dc = d < lo ? lo : d > hi ? hi : d;

  // distance along the leg axis to the knee's foot-point, and its height off the axis
  const a = dc < EPS ? l1 : (l1 * l1 + dc * dc - l2 * l2) / (2 * dc);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));

  // bend direction: pole projected onto the plane perpendicular to the axis
  let px = pole.x - hip.x, py = pole.y - hip.y, pz = pole.z - hip.z;
  let k = px * dx + py * dy + pz * dz;
  px -= dx * k; py -= dy * k; pz -= dz * k;
  let pl = Math.sqrt(px * px + py * py + pz * pz);
  if (pl < 1e-7) {
    // pole on the axis: pick any perpendicular (world up unless the axis is vertical)
    if (Math.abs(dy) < 0.9) { px = 0; py = 1; pz = 0; } else { px = 1; py = 0; pz = 0; }
    k = px * dx + py * dy + pz * dz;
    px -= dx * k; py -= dy * k; pz -= dz * k;
    pl = Math.sqrt(px * px + py * py + pz * pz);
  }
  px /= pl; py /= pl; pz /= pl;

  knee.x = hip.x + dx * a + px * h;
  knee.y = hip.y + dy * a + py * h;
  knee.z = hip.z + dz * a + pz * h;
  if (reached && d >= EPS) {
    end.x = target.x; end.y = target.y; end.z = target.z;
  } else {
    end.x = hip.x + dx * dc; end.y = hip.y + dy * dc; end.z = hip.z + dz * dc;
  }
  RESULT.knee = knee; RESULT.end = end; RESULT.reached = reached;
  return RESULT;
}

/**
 * Gait state for one left/right leg pair, flat so thousands live in one
 * Float32Array. Positions are on the ground plane (x, z); height comes from the
 * terrain. T = −1 while planted, 0..1 through a step.
 */
export const GAIT = {
  LX: 0, LZ: 1, LFX: 2, LFZ: 3, LTX: 4, LTZ: 5, LT: 6,
  RX: 7, RZ: 8, RFX: 9, RFZ: 10, RTX: 11, RTZ: 12, RT: 13,
  LAST: 14, // side that stepped last: 0 left, 1 right, −1 none
  SIZE: 15,
};

/** n pairs, all feet planted; neighbouring pairs start on opposite sides so the gait ripples */
export function createGait(n) {
  const g = new Float32Array(n * GAIT.SIZE);
  for (let i = 0; i < n; i++) resetPair(g, i * GAIT.SIZE, 0, 0, 0, 0, i & 1);
  return g;
}

export function resetPair(g, o, lx, lz, rx, rz, last = -1) {
  g[o + GAIT.LX] = lx; g[o + GAIT.LZ] = lz; g[o + GAIT.LT] = -1;
  g[o + GAIT.RX] = rx; g[o + GAIT.RZ] = rz; g[o + GAIT.RT] = -1;
  g[o + GAIT.LAST] = last;
}

const ease = (t) => t * t * (3 - 2 * t);

// advance one foot already in the air; returns true when it lands
function advance(g, o, X, FX, TX, T, dt, dur) {
  let t = g[o + T] + dt / dur;
  if (t >= 1) {
    g[o + X] = g[o + TX]; g[o + X + 1] = g[o + TX + 1]; g[o + T] = -1;
    return true;
  }
  const e = ease(t);
  g[o + X] = g[o + FX] + (g[o + TX] - g[o + FX]) * e;
  g[o + X + 1] = g[o + FX + 1] + (g[o + TX + 1] - g[o + FX + 1]) * e;
  g[o + T] = t;
  return false;
}

function lift(g, o, X, FX, TX, T, rx, rz, overshoot) {
  const fx = g[o + X], fz = g[o + X + 1];
  g[o + FX] = fx; g[o + FX + 1] = fz;
  // land a little past the rest spot so the foot is not immediately behind again
  g[o + TX] = rx + (rx - fx) * overshoot;
  g[o + TX + 1] = rz + (rz - fz) * overshoot;
  g[o + T] = 0;
}

/**
 * Advance one leg pair. A foot lifts only when it lags more than `threshold`
 * behind its rest spot, never while its partner is in the air, and the pair
 * alternates sides. A foot more than 6× threshold behind (16x sim speed,
 * a teleport) snaps to its rest spot instead of skating.
 */
export function stepFeet(g, o, rlx, rlz, rrx, rrz, threshold, dt, duration, overshoot = 0.3) {
  const S = GAIT;
  if (g[o + S.LT] >= 0 && advance(g, o, S.LX, S.LFX, S.LTX, S.LT, dt, duration)) g[o + S.LAST] = 0;
  if (g[o + S.RT] >= 0 && advance(g, o, S.RX, S.RFX, S.RTX, S.RT, dt, duration)) g[o + S.LAST] = 1;

  const ax = rlx - g[o + S.LX], az = rlz - g[o + S.LZ], bx = rrx - g[o + S.RX], bz = rrz - g[o + S.RZ];
  const lagL = Math.sqrt(ax * ax + az * az);
  const lagR = Math.sqrt(bx * bx + bz * bz);
  const far = threshold * 6;
  if (lagL > far) { g[o + S.LX] = rlx; g[o + S.LZ] = rlz; g[o + S.LT] = -1; }
  if (lagR > far) { g[o + S.RX] = rrx; g[o + S.RZ] = rrz; g[o + S.RT] = -1; }
  if (lagL > far || lagR > far) return;

  if (g[o + S.LT] >= 0 || g[o + S.RT] >= 0) return; // one foot is up: the other waits
  const wantL = lagL > threshold, wantR = lagR > threshold;
  if (!wantL && !wantR) return;
  let left;
  if (wantL && wantR) {
    const last = g[o + S.LAST];
    left = last === 1 ? true : last === 0 ? false : lagL >= lagR;
  } else left = wantL;
  if (left) lift(g, o, S.LX, S.LFX, S.LTX, S.LT, rlx, rlz, overshoot);
  else lift(g, o, S.RX, S.RFX, S.RTX, S.RT, rrx, rrz, overshoot);
}
