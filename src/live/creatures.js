/**
 * Hundreds of creatures in four draw calls. Every body part (segments, leg
 * bones, eyes, contact shadows) is one hardware-instanced mesh whose per-
 * instance data is written straight into typed arrays each frame; the vertex
 * shaders build the transforms (a bone is just "from A to B"), so the CPU
 * never composes a matrix. Nothing in update() allocates.
 *
 * The sim only knows a point, a heading and a speed per creature. The body is
 * grown here: a follow-the-leader chain of segments (spacing 1.6·radius), two
 * planted legs per segment that step when the body walks away from them
 * (ik.js), a bob, and a colour from the body genes tinted 35% toward the
 * species hue so species read at a glance.
 */
import * as THREE from 'three';
import { WORLD_R, LIGHT_GLSL, lightUniforms, hslLinear, PALETTE } from './look.js';
import { heightAt } from './terrain.js';
import { solveTwoBone, stepFeet, resetPair, GAIT, legLayout, stepDuration, horizontalReach } from './ik.js';

const MAX_SEG = 7;
const STRIDE = 10; // frame row: id,x,y,heading,speed,energy,species,age,flags,generation
const SPACING = 1.6;
const SPECIES_TINT = 0.35;
const GROW_S = 0.6, DIE_S = 0.5;
// bodies are drawn smaller than their sim radius: at the sim's true size 600 creatures
// carpet the moss; at 0.65 they read as a crowd with ground between them
const BODY_SCALE = 0.65;

// ---------------------------------------------------------------- shaders
const segVert = /* glsl */ `
attribute vec4 aPos;   // centre, radius
attribute vec4 aFwd;   // forward, pattern
attribute vec4 aCol;   // rgb, energy
attribute vec4 aMisc;  // t along body (0 head .. 1 tail), parity, selected, seed
varying vec3 vPos; varying vec3 vN; varying vec3 vObj;
varying vec4 vCol; varying vec4 vMisc; varying float vPattern;
void main() {
  vec3 f = normalize(aFwd.xyz);
  vec3 r = normalize(cross(vec3(0.0, 1.0, 0.0), f));
  vec3 u = cross(f, r);
  vec3 sc = vec3(1.0, 0.82, 1.12);
  vec3 q = position * sc * aPos.w;
  vec3 n = normal / sc;
  vPos = aPos.xyz + r * q.x + u * q.y + f * q.z;
  vN = normalize(r * n.x + u * n.y + f * n.z);
  vObj = position; vCol = aCol; vMisc = aMisc; vPattern = aFwd.w;
  gl_Position = projectionMatrix * viewMatrix * vec4(vPos, 1.0);
}`;
const segFrag = /* glsl */ `
${LIGHT_GLSL}
uniform vec3 uCream, uLichen;
varying vec3 vPos; varying vec3 vN; varying vec3 vObj;
varying vec4 vCol; varying vec4 vMisc; varying float vPattern;
void main() {
  vec3 N = normalize(vN); vec3 V = normalize(cameraPosition - vPos);
  vec3 alb = vCol.rgb;
  float seed = vMisc.w;
  // countershading: a darker back, a pale belly, like real small animals
  alb *= mix(1.0, 0.82, smoothstep(0.2, 0.95, vObj.y));
  alb = mix(alb, mix(alb, uCream, 0.55), smoothstep(-0.15, -0.7, vObj.y));
  if (vPattern > 1.5) {
    // spotted: a few soft dark spots across the back
    // spotted: a few large irregular blotches, different on every segment
    vec2 sp = vObj.xz * 1.35 + seed * 9.0 + vMisc.x * 5.3;
    vec2 ci = floor(sp); vec2 g = fract(sp) - 0.5;
    vec2 jit = vec2(lvHash(ci), lvHash(ci + 2.0)) - 0.5;
    float rr = 0.17 + 0.12 * lvHash(ci + 4.0);
    float wob = 0.04 * sin(atan(g.y - jit.y * 0.4, g.x - jit.x * 0.4) * 3.0 + seed * 20.0);
    float s = smoothstep(rr + 0.03, rr - 0.03, length(g - jit * 0.4) + wob) * step(0.3, lvHash(ci + 6.0));
    alb = mix(alb, alb * 0.42, s * smoothstep(-0.2, 0.25, vObj.y));
  } else if (vPattern > 0.5) {
    // banded: alternate segments darker, with a pale dorsal line
    alb *= mix(1.0, 0.6, vMisc.y);
    alb = mix(alb, uCream * 0.9, smoothstep(0.14, 0.06, abs(vObj.x)) * smoothstep(0.3, 0.8, vObj.y) * 0.6);
  }
  // starving creatures fade toward grey
  float e = clamp(vCol.a, 0.0, 1.0);
  alb = mix(vec3(dot(alb, vec3(0.3, 0.55, 0.15))) * 0.8, alb, 0.45 + 0.55 * e);
  // gouache brush grain
  alb *= 0.93 + 0.14 * lvNoise(vObj.xy * 6.0 + vObj.z * 3.0 + seed * 17.0);
  float ao = smoothstep(-1.0, 0.3, vObj.y) * 0.75 + 0.25;
  vec3 c = lvGouache(alb, N, V, ao, 1.1);
  float fr = 1.0 - max(dot(N, V), 0.0);
  c += uLichen * pow(fr, 2.0) * vMisc.z * 1.4;
  gl_FragColor = vec4(c, 1.0);
}`;

const boneVert = /* glsl */ `
attribute vec4 aA; attribute vec4 aB; attribute vec3 aCol;
varying vec3 vPos; varying vec3 vN; varying vec3 vCol; varying float vT;
void main() {
  vec3 ax = aB.xyz - aA.xyz;
  vec3 d = normalize(ax + vec3(0.0, 1e-6, 0.0));
  vec3 s1 = normalize(cross(abs(d.y) < 0.95 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0), d));
  vec3 s2 = cross(d, s1);
  float th = mix(aA.w, aB.w, position.y);
  vPos = aA.xyz + ax * position.y + (s1 * position.x + s2 * position.z) * th;
  vN = normalize(s1 * normal.x + s2 * normal.z);
  vCol = aCol; vT = position.y;
  gl_Position = projectionMatrix * viewMatrix * vec4(vPos, 1.0);
}`;
const boneFrag = /* glsl */ `
${LIGHT_GLSL}
varying vec3 vPos; varying vec3 vN; varying vec3 vCol; varying float vT;
void main() {
  vec3 N = normalize(vN); vec3 V = normalize(cameraPosition - vPos);
  gl_FragColor = vec4(lvGouache(vCol, N, V, 0.85, 0.9), 1.0);
}`;

const eyeVert = /* glsl */ `
attribute vec4 aPos; attribute vec3 aLook;
varying vec3 vPos; varying vec3 vN; varying vec3 vLook;
void main() {
  vPos = aPos.xyz + position * aPos.w; vN = normal; vLook = aLook;
  gl_Position = projectionMatrix * viewMatrix * vec4(vPos, 1.0);
}`;
const eyeFrag = /* glsl */ `
${LIGHT_GLSL}
uniform vec3 uInk;
varying vec3 vPos; varying vec3 vN; varying vec3 vLook;
void main() {
  vec3 N = normalize(vN); vec3 V = normalize(cameraPosition - vPos);
  // a glossy bead: the window caught as one hard highlight
  vec3 c = uInk * (0.6 + 0.4 * max(dot(N, uKeyDir), 0.0));
  float spec = pow(max(dot(reflect(-uKeyDir, N), V), 0.0), 24.0);
  c += vec3(1.0, 0.95, 0.85) * smoothstep(0.35, 0.6, spec) * 1.4;
  gl_FragColor = vec4(c, 1.0);
}`;

const shadowVert = /* glsl */ `
attribute vec4 aPos; attribute float aK;
varying vec2 vUv; varying float vK;
void main() {
  vUv = position.xz; vK = aK;
  vec3 p = aPos.xyz + vec3(position.x, 0.0, position.z) * aPos.w;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;
const shadowFrag = /* glsl */ `
uniform vec3 uShade;
varying vec2 vUv; varying float vK;
void main() {
  float d = length(vUv);
  float s = smoothstep(1.0, 0.0, d); s *= s * vK;
  // multiplied onto the moss: cool and soft, never black
  gl_FragColor = vec4(mix(vec3(1.0), uShade, s), 1.0);
}`;

// ---------------------------------------------------------------- helpers
function instanced(geo, attrs, max) {
  const ig = new THREE.InstancedBufferGeometry();
  ig.index = geo.index;
  ig.setAttribute('position', geo.attributes.position);
  if (geo.attributes.normal) ig.setAttribute('normal', geo.attributes.normal);
  const out = {};
  for (const [name, size] of Object.entries(attrs)) {
    const a = new THREE.InstancedBufferAttribute(new Float32Array(max * size), size);
    a.setUsage(THREE.DynamicDrawUsage);
    ig.setAttribute(name, a);
    out[name] = a;
  }
  ig.instanceCount = 0;
  return { geo: ig, attrs: out };
}

function commit(attrs, count) {
  for (const k in attrs) {
    const a = attrs[k];
    a.clearUpdateRanges();
    a.addUpdateRange(0, count * a.itemSize);
    a.needsUpdate = true;
  }
}

const angLerp = (a, b, t) => {
  let d = b - a;
  d -= Math.round(d / (Math.PI * 2)) * Math.PI * 2;
  return a + d * t;
};

/**
 * @param {THREE.Scene|THREE.Object3D} scene
 * @param {{ max?:number, bodyFromGenes:(genes)=>object, reducedMotion?:boolean }} opts
 */
export function createCreatures(scene, { max = 2000, bodyFromGenes, reducedMotion = false } = {}) {
  if (typeof bodyFromGenes !== 'function') throw new Error('createCreatures needs opts.bodyFromGenes');

  // --- per-slot state (structure of arrays)
  const ids = new Int32Array(max).fill(-1);
  const slotOf = new Map();
  const free = new Int32Array(max);
  let freeTop = 0;
  for (let i = max - 1; i >= 0; i--) free[freeTop++] = i;
  const active = new Int32Array(max); // dense list of live slots
  let nActive = 0;
  const activeIdx = new Int32Array(max).fill(-1);

  const nSeg = new Uint8Array(max), pattern = new Uint8Array(max);
  const rad = new Float32Array(max), leg = new Float32Array(max), seed = new Float32Array(max);
  const bodyRGB = new Float32Array(max * 3), rgb = new Float32Array(max * 3);
  const bodyHSL = new Float32Array(max * 3);
  const spec = new Int32Array(max).fill(-1), specHue = new Float32Array(max).fill(-1);
  const P = new Float32Array(max * 3), N = new Float32Array(max * 3); // x, y, heading (sim units)
  const energy = new Float32Array(max);
  const placed = new Uint8Array(max);
  const stampPrev = new Int32Array(max), stampNext = new Int32Array(max);
  const grow = new Float32Array(max), dying = new Float32Array(max); // dying < 0: alive
  const phase = new Float32Array(max), speedEst = new Float32Array(max);
  const lastX = new Float32Array(max), lastZ = new Float32Array(max);
  const chain = new Float32Array(max * MAX_SEG * 3); // three-units x, y, z per segment
  const gait = new Float32Array(max * MAX_SEG * GAIT.SIZE);
  const mid = new Float32Array(max * 4); // proxy sphere: centre + radius

  const speciesHue = new Map();
  let stamp = 0, lastNext = null, selectedSlot = -1, reduced = !!reducedMotion, time = 0;

  // --- meshes
  const segMesh = instanced(new THREE.IcosahedronGeometry(1, 2), { aPos: 4, aFwd: 4, aCol: 4, aMisc: 4 }, max * MAX_SEG);
  const boneGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, false).translate(0, 0.5, 0);
  const boneMesh = instanced(boneGeo, { aA: 4, aB: 4, aCol: 3 }, max * MAX_SEG * 4);
  const eyeMesh = instanced(new THREE.IcosahedronGeometry(1, 1), { aPos: 4, aLook: 3 }, max * 2);
  const shGeo = new THREE.PlaneGeometry(2, 2, 1, 1).rotateX(-Math.PI / 2);
  const shMesh = instanced(shGeo, { aPos: 4, aK: 1 }, max * MAX_SEG);

  const U = { ...lightUniforms, uCream: { value: new THREE.Color('#EFE3C4') }, uLichen: { value: PALETTE.lichen.clone() } };
  const meshes = [
    new THREE.Mesh(shMesh.geo, new THREE.ShaderMaterial({
      uniforms: { uShade: { value: new THREE.Color('#2E4A44').multiplyScalar(0.9) } }, vertexShader: shadowVert, fragmentShader: shadowFrag,
      transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.ZeroFactor, blendDst: THREE.SrcColorFactor,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    })),
    new THREE.Mesh(boneMesh.geo, new THREE.ShaderMaterial({ uniforms: U, vertexShader: boneVert, fragmentShader: boneFrag })),
    new THREE.Mesh(segMesh.geo, new THREE.ShaderMaterial({ uniforms: U, vertexShader: segVert, fragmentShader: segFrag })),
    new THREE.Mesh(eyeMesh.geo, new THREE.ShaderMaterial({ uniforms: { ...U, uInk: { value: PALETTE.inkLift.clone() } }, vertexShader: eyeVert, fragmentShader: eyeFrag })),
  ];
  const group = new THREE.Group();
  group.name = 'lv-creatures';
  for (const m of meshes) { m.frustumCulled = false; group.add(m); }
  meshes[0].renderOrder = 2;
  scene.add(group);

  const tmpRGB = [0, 0, 0];
  function recolor(s) {
    const o = s * 3;
    const hue = spec[s] >= 0 ? speciesHue.get(spec[s]) : undefined;
    if (hue === undefined) {
      rgb[o] = bodyRGB[o]; rgb[o + 1] = bodyRGB[o + 1]; rgb[o + 2] = bodyRGB[o + 2];
      specHue[s] = -1;
      return;
    }
    hslLinear(hue, bodyHSL[o + 1], bodyHSL[o + 2], tmpRGB);
    for (let k = 0; k < 3; k++) rgb[o + k] = bodyRGB[o + k] * (1 - SPECIES_TINT) + tmpRGB[k] * SPECIES_TINT;
    specHue[s] = hue;
  }

  function add(birth) {
    if (!birth || slotOf.has(birth.id) || freeTop === 0) return;
    const s = free[--freeTop];
    const b = bodyFromGenes(birth.body || {});
    ids[s] = birth.id; slotOf.set(birth.id, s);
    nSeg[s] = Math.max(1, Math.min(MAX_SEG, b.segments | 0));
    rad[s] = b.radius * WORLD_R * BODY_SCALE;
    leg[s] = b.legLength * b.radius * WORLD_R * BODY_SCALE;
    pattern[s] = b.pattern | 0;
    seed[s] = (birth.id * 0.618034) % 1;
    const o = s * 3;
    bodyHSL[o] = b.hue; bodyHSL[o + 1] = b.sat; bodyHSL[o + 2] = b.light;
    hslLinear(b.hue, b.sat, b.light, tmpRGB);
    bodyRGB[o] = tmpRGB[0]; bodyRGB[o + 1] = tmpRGB[1]; bodyRGB[o + 2] = tmpRGB[2];
    spec[s] = birth.species ?? -1;
    recolor(s);
    placed[s] = 0; grow[s] = 0; dying[s] = -1; phase[s] = seed[s] * 6.28; speedEst[s] = 0; energy[s] = 1;
    stampPrev[s] = stampNext[s] = -1;
    activeIdx[s] = nActive; active[nActive++] = s;
  }

  function release(s) {
    slotOf.delete(ids[s]);
    ids[s] = -1;
    const i = activeIdx[s], last = active[--nActive];
    active[i] = last; activeIdx[last] = i; activeIdx[s] = -1;
    free[freeTop++] = s;
    if (selectedSlot === s) selectedSlot = -1;
  }

  function remove(id) {
    const s = slotOf.get(id);
    if (s === undefined || dying[s] >= 0) return;
    if (!placed[s]) { release(s); return; }
    dying[s] = 0;
  }

  // lay a freshly seen creature down along its heading, feet planted
  function place(s, x, y, h) {
    const n = nSeg[s], r = rad[s], X = x * WORLD_R, Z = y * WORLD_R;
    const fx = Math.cos(h), fz = Math.sin(h);
    for (let i = 0; i < n; i++) {
      const o = (s * MAX_SEG + i) * 3;
      chain[o] = X - fx * SPACING * r * i; chain[o + 2] = Z - fz * SPACING * r * i;
      chain[o + 1] = 0;
      const gx = chain[o], gz = chain[o + 2], lat = legLayout(r, leg[s], lay).latF;
      resetPair(gait, (s * MAX_SEG + i) * GAIT.SIZE, gx - fz * lat, gz + fx * lat, gx + fz * lat, gz - fx * lat, i & 1);
    }
    lastX[s] = X; lastZ[s] = Z;
    placed[s] = 1;
  }

  function ingest(prev, next) {
    stamp++;
    const sp = next.stats && next.stats.species;
    if (sp) for (let i = 0; i < sp.length; i++) speciesHue.set(sp[i][0], sp[i][2]);
    if (prev && prev.creatures) {
      const c = prev.creatures;
      for (let i = 0; i + STRIDE <= c.length; i += STRIDE) {
        const s = slotOf.get(c[i]);
        if (s === undefined) continue;
        P[s * 3] = c[i + 1]; P[s * 3 + 1] = c[i + 2]; P[s * 3 + 2] = c[i + 3];
        stampPrev[s] = stamp;
      }
    }
    const c = next.creatures;
    for (let i = 0; i + STRIDE <= c.length; i += STRIDE) {
      const s = slotOf.get(c[i]);
      if (s === undefined) continue;
      const o = s * 3;
      N[o] = c[i + 1]; N[o + 1] = c[i + 2]; N[o + 2] = c[i + 3];
      energy[s] = c[i + 5];
      const sid = c[i + 6];
      if (sid !== spec[s]) { spec[s] = sid; recolor(s); }
      else if (spec[s] >= 0 && speciesHue.get(spec[s]) !== specHue[s]) recolor(s);
      stampNext[s] = stamp;
      if (stampPrev[s] !== stamp) { P[o] = N[o]; P[o + 1] = N[o + 1]; P[o + 2] = N[o + 2]; }
      if (!placed[s]) place(s, N[o], N[o + 1], N[o + 2]);
    }
    // anything not in the new frame holds still where it was last seen
    for (let k = 0; k < nActive; k++) {
      const s = active[k];
      if (stampNext[s] !== stamp) { const o = s * 3; P[o] = N[o]; P[o + 1] = N[o + 1]; P[o + 2] = N[o + 2]; }
    }
  }

  // scratch vectors for IK (reused)
  const hip = { x: 0, y: 0, z: 0 }, tgt = { x: 0, y: 0, z: 0 }, pole = { x: 0, y: 0, z: 0 };
  const knee = { x: 0, y: 0, z: 0 }, end = { x: 0, y: 0, z: 0 };
  const lay = legLayout(1, 1);
  /** per-frame counters for the dev page: planted feet the legs could not reach (should stay ~0) */
  const debug = { unreached: 0, planted: 0 };

  function update(prev, next, alpha = 1, dt = 1 / 60) {
    if (!next || !next.creatures) return;
    if (next !== lastNext) { ingest(prev, next); lastNext = next; }
    time += dt;
    const a = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha;
    const sA = segMesh.attrs, bA = boneMesh.attrs, eA = eyeMesh.attrs, hA = shMesh.attrs;
    const aPos = sA.aPos.array, aFwd = sA.aFwd.array, aCol = sA.aCol.array, aMisc = sA.aMisc.array;
    const bA_ = bA.aA.array, bB = bA.aB.array, bC = bA.aCol.array;
    const ePos = eA.aPos.array, eLook = eA.aLook.array;
    const hPos = hA.aPos.array, hK = hA.aK.array;
    let ns = 0, nb = 0, ne = 0;
    debug.unreached = 0; debug.planted = 0;
    const bobAmt = reduced ? 0 : 0.15;
    const liftAmt = reduced ? 0.18 : 0.5;

    for (let k = nActive - 1; k >= 0; k--) {
      const s = active[k];
      if (!placed[s]) continue;
      // birth and death envelopes
      if (dying[s] >= 0) {
        dying[s] += dt;
        if (dying[s] >= DIE_S) { release(s); continue; }
      } else if (grow[s] < 1) grow[s] = Math.min(1, grow[s] + dt / GROW_S);
      const g = dying[s] >= 0 ? 1 - dying[s] / DIE_S : grow[s];
      const env = g * g * (3 - 2 * g);

      const o = s * 3;
      const x = P[o] + (N[o] - P[o]) * a, y = P[o + 1] + (N[o + 1] - P[o + 1]) * a;
      const h = angLerp(P[o + 2], N[o + 2], a);
      const X = x * WORLD_R, Z = y * WORLD_R;
      const n = nSeg[s], r = rad[s], L = leg[s];

      // walking speed (three units / s) drives the gait
      const mdx = X - lastX[s], mdz = Z - lastZ[s];
      const moved = Math.sqrt(mdx * mdx + mdz * mdz);
      lastX[s] = X; lastZ[s] = Z;
      const v = dt > 0 ? moved / dt : 0;
      speedEst[s] += (v - speedEst[s]) * (1 - Math.exp(-10 * dt));
      phase[s] += moved / (0.9 * L + r) * Math.PI;

      // follow-the-leader chain
      const base = s * MAX_SEG * 3;
      chain[base] = X; chain[base + 2] = Z;
      const sp = SPACING * r;
      for (let i = 1; i < n; i++) {
        const c = base + i * 3, p = c - 3;
        let dx = chain[c] - chain[p], dz = chain[c + 2] - chain[p + 2];
        let d = Math.sqrt(dx * dx + dz * dz);
        if (d < 1e-6) { dx = -Math.cos(h); dz = -Math.sin(h); d = 1; }
        chain[c] = chain[p] + (dx / d) * sp;
        chain[c + 2] = chain[p + 2] + (dz / d) * sp;
      }
      const bodyY = legLayout(r, L, lay).bodyY;
      const stepDur = stepDuration(L, speedEst[s]);
      let mx = 0, my = 0, mz = 0;
      const selected = s === selectedSlot ? 1 : 0;

      for (let i = 0; i < n; i++) {
        const c = base + i * 3;
        // forward of this segment: toward the one ahead (head: its heading)
        let fx, fz;
        if (i === 0) { fx = Math.cos(h); fz = Math.sin(h); }
        else { fx = chain[c - 3] - chain[c]; fz = chain[c - 1] - chain[c + 2]; const d = Math.sqrt(fx * fx + fz * fz) || 1; fx /= d; fz /= d; }
        const t = n > 1 ? i / (n - 1) : 0;
        const ri = r * (i === 0 ? 0.92 : 1 - 0.35 * t * t) * env;
        const gx = chain[c], gz = chain[c + 2];
        const ground = heightAt(gx / WORLD_R, gz / WORLD_R);
        const bob = bobAmt * r * Math.abs(Math.sin(phase[s] + i * 0.9));
        // births/deaths scale the whole creature (no sinking into the ground), so its legs stay in reach at every size
        const gy = ground + (bodyY + bob) * env;
        chain[c + 1] = gy;
        mx += gx; my += gy; mz += gz;

        // segment instance
        let q = ns * 4;
        aPos[q] = gx; aPos[q + 1] = gy; aPos[q + 2] = gz; aPos[q + 3] = ri;
        aFwd[q] = fx; aFwd[q + 1] = 0; aFwd[q + 2] = fz; aFwd[q + 3] = pattern[s];
        aCol[q] = rgb[o]; aCol[q + 1] = rgb[o + 1]; aCol[q + 2] = rgb[o + 2]; aCol[q + 3] = energy[s];
        aMisc[q] = t; aMisc[q + 1] = i & 1; aMisc[q + 2] = selected; aMisc[q + 3] = seed[s];
        // contact shadow
        hPos[q] = gx; hPos[q + 1] = ground + 0.004; hPos[q + 2] = gz; hPos[q + 3] = ri * 1.7;
        hK[ns] = 0.75 * env;
        ns++;

        // legs: left and right, planted, IK'd
        // (shared geometry with the gait test in ik.test.js: planted feet stay in reach)
        legLayout(ri, L * env, lay);
        const latR = lay.latR, latF = lay.latF;
        const lead = (1 - 2 * t) * lay.lead; // front legs reach forward, rear legs back
        const hipY = gy - lay.hipDrop;
        const hlx = gx - fz * latR, hlz = gz + fx * latR, hrx = gx + fz * latR, hrz = gz - fx * latR;
        const go = (s * MAX_SEG + i) * GAIT.SIZE;
        stepFeet(gait, go,
          gx - fz * latF + fx * lead, gz + fx * latF + fz * lead,
          gx + fz * latF + fx * lead, gz - fx * latF + fz * lead,
          lay.threshold, dt, stepDur, 0.3,
          hlx, hlz, hrx, hrz, horizontalReach(lay.l1, lay.l2, Math.abs(hipY - ground) + 0.3 * lay.l1));
        const l1 = lay.l1, l2 = lay.l2, th = Math.max(0.006, 0.16 * r) * env;
        const lr = rgb[o] * 0.5 + 0.02, lg = rgb[o + 1] * 0.45 + 0.016, lb = rgb[o + 2] * 0.42 + 0.012;
        for (let side = 0; side < 2; side++) {
          const sg = side === 0 ? 1 : -1;
          const FX = side === 0 ? GAIT.LX : GAIT.RX, FT = side === 0 ? GAIT.LT : GAIT.RT;
          hip.x = sg > 0 ? hlx : hrx; hip.y = hipY; hip.z = sg > 0 ? hlz : hrz;
          const footX = gait[go + FX], footZ = gait[go + FX + 1], st = gait[go + FT];
          if (st < 0) debug.planted++;
          tgt.x = footX; tgt.z = footZ;
          tgt.y = heightAt(footX / WORLD_R, footZ / WORLD_R) + (st >= 0 ? Math.sin(st * Math.PI) * liftAmt * L : 0);
          pole.x = hip.x - fz * L * sg; pole.y = hip.y + 1.6 * L; pole.z = hip.z + fx * L * sg;
          // a planted foot the legs cannot reach steps next frame instead of skating
          if (!solveTwoBone(hip, tgt, l1, l2, pole, knee, end).reached && st < 0) { gait[go + (side === 0 ? GAIT.LF : GAIT.RF)] = 1; debug.unreached++; }
          let b = nb * 4;
          bA_[b] = hip.x; bA_[b + 1] = hip.y; bA_[b + 2] = hip.z; bA_[b + 3] = th;
          bB[b] = knee.x; bB[b + 1] = knee.y; bB[b + 2] = knee.z; bB[b + 3] = th * 0.8;
          let cc = nb * 3; bC[cc] = lr; bC[cc + 1] = lg; bC[cc + 2] = lb;
          nb++;
          b = nb * 4;
          bA_[b] = knee.x; bA_[b + 1] = knee.y; bA_[b + 2] = knee.z; bA_[b + 3] = th * 0.8;
          bB[b] = end.x; bB[b + 1] = end.y; bB[b + 2] = end.z; bB[b + 3] = th * 0.45;
          cc = nb * 3; bC[cc] = lr * 0.7; bC[cc + 1] = lg * 0.7; bC[cc + 2] = lb * 0.7;
          nb++;
        }

        if (i === 0) {
          // two bead eyes on the front of the head
          for (let side = -1; side <= 1; side += 2) {
            const e = ne * 4;
            ePos[e] = gx + fx * 0.68 * ri - fz * 0.42 * ri * side;
            ePos[e + 1] = gy + 0.3 * ri;
            ePos[e + 2] = gz + fz * 0.68 * ri + fx * 0.42 * ri * side;
            ePos[e + 3] = 0.24 * ri;
            eLook[ne * 3] = fx; eLook[ne * 3 + 1] = 0; eLook[ne * 3 + 2] = fz;
            ne++;
          }
        }
      }
      // proxy sphere for picking and the follow camera
      const m4 = s * 4;
      mid[m4] = mx / n; mid[m4 + 1] = my / n; mid[m4 + 2] = mz / n;
      mid[m4 + 3] = Math.max(0.18, 0.5 * SPACING * r * (n - 1) + r * 1.5);
    }

    segMesh.geo.instanceCount = ns; commit(sA, ns);
    hA.aPos.needsUpdate = true; shMesh.geo.instanceCount = ns; commit(hA, ns);
    boneMesh.geo.instanceCount = nb; commit(bA, nb);
    eyeMesh.geo.instanceCount = ne; commit(eA, ne);
  }

  function pick(raycaster) {
    const ray = raycaster.ray;
    const ox = ray.origin.x, oy = ray.origin.y, oz = ray.origin.z;
    const dx = ray.direction.x, dy = ray.direction.y, dz = ray.direction.z;
    let best = null, bestScore = Infinity;
    for (let k = 0; k < nActive; k++) {
      const s = active[k];
      if (!placed[s] || dying[s] >= 0) continue;
      const m = s * 4, R = mid[m + 3];
      const cx = mid[m] - ox, cy = mid[m + 1] - oy, cz = mid[m + 2] - oz;
      const t = cx * dx + cy * dy + cz * dz;
      if (t <= 0) continue;
      const px = cx - dx * t, py = cy - dy * t, pz = cz - dz * t;
      const d2 = px * px + py * py + pz * pz;
      if (d2 > R * R) continue;
      // closest to the ray's centre line wins; distance breaks near-ties
      const score = Math.sqrt(d2) / R + t * 0.002;
      if (score < bestScore) { bestScore = score; best = ids[s]; }
    }
    return best;
  }

  const scratch = new THREE.Vector3();
  /** current body centre; returns `out` (a shared vector if omitted: copy it if you keep it) */
  function positionOf(id, out = scratch) {
    const s = slotOf.get(id);
    if (s === undefined || !placed[s] || dying[s] >= 0) return null;
    return out.set(mid[s * 4], mid[s * 4 + 1], mid[s * 4 + 2]);
  }

  return {
    add, remove, update, pick, positionOf, debug,
    /** highlight one creature (or null) with a lichen rim */
    setSelected(id) { const s = id == null ? undefined : slotOf.get(id); selectedSlot = s === undefined ? -1 : s; },
    setReducedMotion(v) { reduced = !!v; },
    get count() { return nActive; },
    group,
    dispose() {
      scene.remove(group);
      for (const m of meshes) { m.geometry.dispose(); m.material.dispose(); }
      slotOf.clear(); speciesHue.clear();
    },
  };
}
