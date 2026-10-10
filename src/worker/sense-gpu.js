/**
 * Sensing on the GPU: one compute invocation per creature scans every
 * pellet and every creature for the nearest within 0.35. Brute force is
 * the right shape for a GPU (no grid to build, no divergence beyond the
 * loop) and it frees the worker's CPU for thinking and acting.
 *
 * Results land late. Reading a buffer back is asynchronous, so the worker
 * starts sense() on the current positions, runs steps on the inputs the
 * previous readback delivered, then awaits this one, whose values feed
 * the next steps. At 1x that is exactly one step (1/60 s) late; at 4x/16x
 * the worker runs up to CHUNK steps per readback to hide its latency, so
 * inputs are up to 2·CHUNK-1 steps old (see sim.worker.js). Either way a
 * creature cannot tell; newborns see "nothing" until their first readback.
 *
 * The maths mirror sense-cpu.js exactly (same float32 snapshot, strict <
 * so ties go to the lower index, same relative-angle formula), so the
 * ?simcheck=1 parity run can hold the two paths to float precision.
 */
import { MAX_CREATURES, FOOD_MAX } from '../sim/world.js';
import { SENSE_R } from '../sim/sense-cpu.js';

const WG = 64;

const SHADER = /* wgsl */ `
struct Params { nc: u32, nf: u32, r2: f32, invR: f32 };
@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read> cre: array<f32>;
@group(0) @binding(2) var<storage, read> food: array<f32>;
@group(0) @binding(3) var<storage, read_write> outv: array<f32>;

fn write(o: u32, found: bool, dx: f32, dy: f32, sh: f32, ch: f32) {
  if (!found) {
    outv[o] = 0.0; outv[o + 1u] = 0.0; outv[o + 2u] = 1.0;
    return;
  }
  let d = sqrt(dx * dx + dy * dy);
  if (d < 1e-9) {
    outv[o] = 0.0; outv[o + 1u] = 1.0; outv[o + 2u] = 0.0;
    return;
  }
  outv[o] = (dy * ch - dx * sh) / d;
  outv[o + 1u] = (dx * ch + dy * sh) / d;
  outv[o + 2u] = d * P.invR;
}

@compute @workgroup_size(${WG})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= P.nc) { return; }
  let x = cre[i * 3u];
  let y = cre[i * 3u + 1u];
  let h = cre[i * 3u + 2u];
  let sh = sin(h);
  let ch = cos(h);

  var bf = -1;
  var bd = P.r2;
  for (var j = 0u; j < P.nf; j++) {
    if (food[j * 3u + 2u] <= 0.0) { continue; }
    let dx = food[j * 3u] - x;
    let dy = food[j * 3u + 1u] - y;
    let d2 = dx * dx + dy * dy;
    if (d2 < bd) { bd = d2; bf = i32(j); }
  }
  var bc = -1;
  var bcd = P.r2;
  for (var j = 0u; j < P.nc; j++) {
    if (j == i) { continue; }
    let dx = cre[j * 3u] - x;
    let dy = cre[j * 3u + 1u] - y;
    let d2 = dx * dx + dy * dy;
    if (d2 < bcd) { bcd = d2; bc = i32(j); }
  }

  let o = i * 6u;
  if (bf >= 0) {
    let j = u32(bf);
    write(o, true, food[j * 3u] - x, food[j * 3u + 1u] - y, sh, ch);
  } else {
    write(o, false, 0.0, 0.0, sh, ch);
  }
  if (bc >= 0) {
    let j = u32(bc);
    write(o + 3u, true, cre[j * 3u] - x, cre[j * 3u + 1u] - y, sh, ch);
  } else {
    write(o + 3u, false, 0.0, 0.0, sh, ch);
  }
}
`;

// A driver can leave requestAdapter/requestDevice pending forever, which would
// hold up init (and the visitor at the fog) for good. Both share one deadline;
// past it the worker senses on the CPU and says why.
const GPU_TIMEOUT_MS = 3500;
const TIMED_OUT = Symbol('timed out');

/** @returns {Promise<{ sense(world): Promise<void>, destroy(): void } | { error: string }>} */
export async function createGpuSensor({ timeoutMs = GPU_TIMEOUT_MS } = {}) {
  const gpu = typeof navigator !== 'undefined' ? navigator.gpu : undefined;
  if (!gpu) return { error: 'navigator.gpu missing in worker' };
  const deadline = Date.now() + timeoutMs;
  const inTime = (p) => {
    let timer = 0;
    const late = new Promise((r) => { timer = setTimeout(() => r(TIMED_OUT), Math.max(0, deadline - Date.now())); });
    return Promise.race([p, late]).finally(() => clearTimeout(timer));
  };
  let adapter;
  try {
    adapter = await inTime(gpu.requestAdapter());
  } catch (e) {
    return { error: 'requestAdapter threw: ' + e.message };
  }
  if (adapter === TIMED_OUT) return { error: `requestAdapter timed out after ${timeoutMs} ms` };
  if (!adapter) return { error: 'requestAdapter returned null' };
  let device;
  let pending;
  try {
    pending = adapter.requestDevice();
    device = await inTime(pending);
  } catch (e) {
    return { error: 'requestDevice failed: ' + e.message };
  }
  if (device === TIMED_OUT) {
    pending.then((d) => d.destroy(), () => {}); // a device that turns up late must not linger
    return { error: `requestDevice timed out after ${timeoutMs} ms` };
  }

  let lost = '';
  device.lost.then((info) => (lost = 'device lost: ' + (info.message || info.reason)));

  device.pushErrorScope('validation');
  const S = GPUBufferUsage;
  const params = device.createBuffer({ size: 16, usage: S.UNIFORM | S.COPY_DST });
  const creBuf = device.createBuffer({ size: MAX_CREATURES * 12, usage: S.STORAGE | S.COPY_DST });
  const foodBuf = device.createBuffer({ size: FOOD_MAX * 12, usage: S.STORAGE | S.COPY_DST });
  const outBuf = device.createBuffer({ size: MAX_CREATURES * 24, usage: S.STORAGE | S.COPY_SRC });
  const readBuf = device.createBuffer({ size: MAX_CREATURES * 24, usage: S.MAP_READ | S.COPY_DST });
  const module = device.createShaderModule({ code: SHADER });
  const pipeline = device.createComputePipeline({ layout: 'auto', compute: { module, entryPoint: 'main' } });
  const bind = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [params, creBuf, foodBuf, outBuf].map((buffer, binding) => ({ binding, resource: { buffer } })),
  });
  const err = await device.popErrorScope();
  if (err) {
    device.destroy();
    return { error: 'pipeline setup failed: ' + err.message };
  }

  const snap = new Float32Array(MAX_CREATURES * 3);
  const head = new ArrayBuffer(16);
  const headU = new Uint32Array(head);
  const headF = new Float32Array(head);
  headF[2] = SENSE_R * SENSE_R;
  headF[3] = 1 / SENSE_R;
  const targets = [];

  return {
    get lost() {
      return lost;
    },
    async sense(world) {
      if (lost) throw new Error(lost);
      const cs = world.creatures;
      const n = cs.length;
      targets.length = n;
      for (let i = 0; i < n; i++) {
        const c = cs[i];
        targets[i] = c;
        snap[i * 3] = c.x;
        snap[i * 3 + 1] = c.y;
        snap[i * 3 + 2] = c.heading;
      }
      headU[0] = n;
      headU[1] = FOOD_MAX;
      device.queue.writeBuffer(params, 0, head);
      device.queue.writeBuffer(creBuf, 0, snap.buffer, 0, n * 12);
      device.queue.writeBuffer(foodBuf, 0, world.food.buffer, world.food.byteOffset, FOOD_MAX * 12);
      const enc = device.createCommandEncoder();
      const pass = enc.beginComputePass();
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bind);
      pass.dispatchWorkgroups(Math.ceil(n / WG));
      pass.end();
      enc.copyBufferToBuffer(outBuf, 0, readBuf, 0, n * 24);
      device.queue.submit([enc.finish()]);

      await readBuf.mapAsync(GPUMapMode.READ, 0, n * 24);
      const out = new Float32Array(readBuf.getMappedRange(0, n * 24));
      for (let i = 0; i < n; i++) {
        const inp = targets[i].inputs; // creatures that died meanwhile are written harmlessly
        const o = i * 6;
        inp[0] = out[o]; inp[1] = out[o + 1]; inp[2] = out[o + 2];
        inp[3] = out[o + 3]; inp[4] = out[o + 4]; inp[5] = out[o + 5];
      }
      readBuf.unmap();
      targets.length = 0;
    },
    destroy() {
      device.destroy();
    },
  };
}
