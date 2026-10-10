/**
 * Stand-in for src/sim/genes.js bodyFromGenes while the sim is built in
 * parallel. It implements the shared contract exactly (linear, monotonic in
 * each gene) so the renderer can be judged on real body ranges. At
 * integration the live screen passes the real bodyFromGenes to
 * createCreatures and this file is only used by live-dev.html.
 */
const c01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** body genes {segments, limb, size, hue, sat, pattern} (each 0..1) → body */
export function bodyFromGenes(b) {
  return {
    segments: 2 + Math.round(c01(b.segments) * 5),
    legLength: 0.6 + c01(b.limb) * 1.2,
    radius: 0.012 + c01(b.size) * 0.018,
    hue: c01(b.hue) * 360,
    sat: 0.35 + c01(b.sat) * 0.5,
    light: 0.45 + c01(b.sat) * 0.25,
    pattern: Math.min(2, Math.floor(c01(b.pattern) * 3)),
  };
}
