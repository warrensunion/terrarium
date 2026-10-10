/**
 * The world lives here, off the main thread, so a 16x frame of stepping
 * never costs the renderer a frame. The main thread asks for N steps once
 * per rAF and always gets exactly one answer back: a frame (even for 0
 * steps, and an empty one before init), with its typed arrays transferred
 * rather than copied, or `{type:'error', message, request}` if handling
 * failed. An error ends that request; no frame follows for it.
 *
 * Sensing goes to WebGPU when the worker can get an adapter and device,
 * otherwise to the CPU grid; the choice and its reason are posted in
 * `ready` and logged, so "why is it on the CPU?" always has an answer.
 * If the device is lost mid-run the world quietly falls back to the CPU.
 *
 * A GPU readback takes milliseconds of latency, far longer than a step, so
 * awaiting one per step made 16x run at half the CPU's speed. Steps are
 * therefore run in chunks of up to CHUNK: a chunk launches a sense on the
 * current positions, runs its steps on the previous readback, then awaits
 * its own. A readback taken before a chunk drives the next chunk's steps,
 * so inputs are k..2k-1 steps old for chunks of k: exactly one step at 1x
 * and at most 2·CHUNK-1 steps at 4x/16x.
 *
 * Messages are handled strictly in order through one promise chain (GPU
 * steps await a readback). If step requests pile up faster than they can
 * be served, each runs its steps divided by the backlog, so a slow device
 * slows the sim down instead of drowning in queued work.
 *
 * ?simcheck=1 (forwarded as `simcheck: true` in `init`, or on the worker
 * URL) senses the same world once on each backend and logs the largest
 * difference: '[terrarium] simcheck max abs diff: <d>'.
 *
 * For tests only: `{type:'debug-kill', id}` makes that creature die at the
 * next step through the normal death path, so it shows up in `deaths`
 * and, if inspected, as `dead` (the shoot script checks the
 * "followed creature died" UI with it).
 */
import { createWorld, packFrame } from '../sim/world.js';
import { senseCPU } from '../sim/sense-cpu.js';
import { createGpuSensor } from './sense-gpu.js';

let world = null;
let config = null;
let gpu = null;
let backend = 'cpu';
let reason = '';
let backendReady = null;
let inspectId = null;
let since = -1;
let carryDeaths = []; // ids from a world replaced by reset, not yet reported
let carryDead = null;
let queue = Promise.resolve();
let pendingSteps = 0;
const CHUNK = 2; // GPU steps per readback; inputs are up to 2·CHUNK-1 steps old
const MAX_STALE = 2 * CHUNK - 1;

const urlSimcheck = (() => {
  try {
    return new URLSearchParams(self.location.search).get('simcheck') === '1';
  } catch {
    return false;
  }
})();

self.onmessage = (e) => {
  const msg = e.data;
  if (msg?.type === 'step') pendingSteps++;
  queue = queue.then(() => handle(msg)).catch((err) => {
    console.error('[terrarium] sim worker:', err);
    self.postMessage({ type: 'error', message: String(err?.message || err), request: msg?.type ?? null });
  });
};

async function handle(msg) {
  switch (msg?.type) {
    case 'init':
      config = { seed: msg.seed ?? 1, count: msg.count ?? 600, params: { ...msg.params } };
      await chooseBackend();
      newWorld(config.seed, 0);
      self.postMessage({ type: 'ready', backend, reason });
      if (msg.simcheck || urlSimcheck) await simcheck();
      return;
    case 'step':
      pendingSteps--;
      if (!world) {
        self.postMessage(emptyFrame());
        return;
      }
      await runSteps(Math.ceil((msg.steps | 0) / Math.max(1, pendingSteps)));
      postFrame();
      return;
    case 'params':
      if (config) config.params = { ...config.params, ...msg.params };
      world?.setParams(msg.params);
      return;
    case 'inspect':
      inspectId = msg.id ?? null;
      return;
    case 'reset':
      if (!world) return;
      reset(msg.seed ?? config.seed + 1);
      return;
    case 'debug-kill':
      world?.kill(msg.id);
      return;
    default:
      return;
  }
}

function chooseBackend() {
  backendReady ??= (async () => {
    const res = await createGpuSensor().catch((e) => ({ error: 'createGpuSensor threw: ' + e.message }));
    if (res.error) {
      backend = 'cpu';
      reason = firstLine(res.error);
    } else {
      gpu = res;
      backend = 'webgpu';
      reason = `compute sensing, inputs 1 step old at 1x, up to ${MAX_STALE} at 4x/16x`;
    }
    console.info('[terrarium] sim backend:', backend, reason);
  })();
  return backendReady;
}

const firstLine = (text) => text.split('\n')[0].trim(); // Dawn appends C++ stack lines

function newWorld(seed, idBase) {
  config.seed = seed;
  world = createWorld({ seed, count: config.count, params: config.params, sensor: gpu ? null : senseCPU, idBase });
  since = -1;
}

async function runSteps(n) {
  while (n > 0) {
    if (!gpu) {
      world.step();
      n--;
      continue;
    }
    const k = Math.min(n, CHUNK);
    // reads positions now, lands after this chunk and drives the next one;
    // only a sensing failure means falling back, a step error propagates
    const sensed = gpu.sense(world).then(() => null, (err) => err);
    try {
      for (let i = 0; i < k; i++) world.step();
    } finally {
      const err = await sensed; // never leave a readback mapped behind us
      if (err) fallBack(err);
    }
    n -= k;
  }
}

function fallBack(err) {
  gpu?.destroy();
  gpu = null;
  backend = 'cpu';
  reason = firstLine(String(err?.message || err));
  world.sensor = senseCPU;
  console.info('[terrarium] sim backend:', backend, reason);
}

function reset(seed) {
  const last = packFrame(world, null, since);
  // creatures whose birth was never reported were never added on the main side
  const unseen = new Set(last.births.map((b) => b.id));
  const gone = last.deaths.concat(world.creatures.map((c) => c.id)).filter((id) => !unseen.has(id));
  carryDeaths = carryDeaths.concat(gone);
  if (inspectId != null) {
    carryDead = inspectId;
    inspectId = null;
  }
  newWorld(seed, world.lastId);
}

function postFrame() {
  const frame = packFrame(world, inspectId, since);
  since = frame.tick;
  if (carryDeaths.length) {
    frame.deaths = carryDeaths.concat(frame.deaths);
    carryDeaths = [];
  }
  if (carryDead != null) {
    frame.dead = carryDead;
    carryDead = null;
  }
  if (frame.dead != null && frame.dead === inspectId) inspectId = null;
  const transfer = [frame.creatures.buffer, frame.food.buffer];
  if (frame.inspect) transfer.push(frame.inspect.values.buffer);
  self.postMessage(frame, transfer);
}

function emptyFrame() {
  return {
    type: 'frame', tick: 0, creatures: new Float32Array(0), food: new Float32Array(0), births: [], deaths: [],
    stats: { tick: 0, population: 0, generation: 0, species: [] }, inspect: null, dead: null,
  };
}

/** Sense one world state on both backends and log the largest difference. */
async function simcheck() {
  if (!gpu) {
    console.info('[terrarium] simcheck skipped:', reason);
    return;
  }
  const cs = world.creatures;
  await gpu.sense(world);
  const viaGpu = new Float32Array(cs.length * 6);
  cs.forEach((c, i) => viaGpu.set(c.inputs.subarray(0, 6), i * 6));
  world.indexSpace();
  senseCPU(world);
  let max = 0;
  let worst = -1;
  cs.forEach((c, i) => {
    for (let k = 0; k < 6; k++) {
      const d = Math.abs(c.inputs[k] - viaGpu[i * 6 + k]);
      if (d > max) { max = d; worst = i; }
    }
  });
  console.info('[terrarium] simcheck max abs diff:', max, `(${cs.length} creatures, worst #${worst})`);
}
