/**
 * CPU-path step cost, so performance regressions in src/sim show up as a
 * number rather than as a stuttering jar. Prints a float-loop calibration
 * too, because a busy machine can be several times slower than usual.
 * Usage: node scripts/bench-sim.mjs [count=600] [steps=1200]
 */
import { createWorld } from '../src/sim/world.js';

const count = +(process.argv[2] || 600);
const steps = +(process.argv[3] || 1200);

const a = new Float32Array(1e6).map((_, i) => i % 7);
let t = performance.now();
let s = 0;
for (let r = 0; r < 20; r++) for (let i = 0; i < a.length; i++) s += a[i] * 1.0001;
console.log(`calibration: 20M float mults ${(performance.now() - t).toFixed(0)} ms (an idle laptop: ~20)`, s > 0 ? '' : '!');

const w = createWorld({ seed: 1, count });
for (let i = 0; i < 300; i++) w.step(); // warm up the JIT
let pop = 0;
t = performance.now();
for (let i = 0; i < steps; i++) {
  w.step();
  pop += w.creatures.length;
}
const ms = (performance.now() - t) / steps;
console.log(`${ms.toFixed(3)} ms/step, mean population ${(pop / steps).toFixed(0)}, ${(ms * 16).toFixed(1)} ms per 16x frame`);
