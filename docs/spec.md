# Terrarium — design spec

Written 10 Oct 2026 by brainstorming. Warren asked for full autonomy, so each
brainstorming question below is answered with my own recommendation
(marked **A:**); the one-line reasons are in `DECISIONS.md`.

## 1. Intent

**What:** a website where a 3D ecosystem lives inside a glass jar. Small
creatures with evolving neural-net (NEAT) brains walk, eat, mate and die; their
genes set their bodies; species split off as their genomes drift.

**Who for:** a curious visitor with no biology or ML background, and the
craft-minded designer who judges it against award-site work.

**Success:** (1) the intro makes "genes → body, brain → behaviour,
generations → species" understood in under a minute of scrolling, at
makemepulse-2019 craft; (2) the live jar runs 500+ creatures at 60 fps on a
laptop and visibly evolves (species river grows branches within minutes at
16x); (3) clicking a creature shows its brain firing live; (4) it works from
390 px wide, with reduced motion and without WebGL.

Said by Warren: everything in the brief (stack, sections, tests, art via
ChatGPT, makemepulse as the bar). Assumed by me: everything marked **A:**.

## 2. Questions answered

- **Single page or several pages?** **A:** one page, hash routes:
  `#/` (preloader → scroll intro), `#/live` (the jar), `#/about`. The intro's
  last scene hands off into the jar without a reload.
- **How many intro scenes?** **A:** five — 1 *A world in a jar* (title),
  2 *Genes become bodies*, 3 *Brains become behaviour*, 4 *Generations
  become species*, 5 *Open the lid* (CTA into the live jar).
- **Is the intro WebGL or DOM?** **A:** DOM + CSS transforms on cut-out
  WebP layers (like makemepulse's layered parallax), driven by one smoothed
  scroll value; one small canvas per scene for the diagrams (a live mini
  brain, a gene strip morphing a body, a species tree). Three.js is loaded
  only for the jar, and prefetched while the intro plays.
- **What runs on the GPU?** **A:** each NEAT brain has its own topology, so
  brains run on the CPU in the worker (they are tiny). The O(N·M) sensing —
  nearest food and nearest creature for every creature — is the part that
  scales, so it is a WebGPU compute pass when `navigator.gpu` exists in the
  worker. Fallback: a CPU uniform-grid spatial hash, and the worker logs
  why. Rendering is three.js WebGL2 in all cases; no WebGL → a static
  fallback page with a still of the jar and the About text.
- **Determinism?** **A:** the sim is seeded (mulberry32) and fully
  deterministic on the CPU path; tests run the CPU path. The GPU path gives
  the same answers as the CPU one for sensing (checked by a parity test in
  the browser shoot), but its one-tick readback lag means a GPU run is not
  bit-identical to a CPU run.
- **Sim world shape?** **A:** 2D sim on a disc (the jar's floor, radius 1),
  rendered on 3D terrain whose height is a function of (x, z) the renderer
  samples. Creatures never leave the disc; "wall distance" is distance to
  the rim.
- **Body animation?** **A:** procedural on the main thread: segments follow
  the head like a chain (follow-the-leader), each segment has a pair of
  two-bone legs solved by analytic IK onto foot targets that step when they
  lag behind (alternating gait), body bobs with the step phase. All
  instanced meshes (spheres for segments, capsules for leg bones), so 500
  creatures cost a handful of draw calls.
- **How are species drawn?** **A:** NEAT compatibility distance δ against
  each species' representative (threshold adapts to keep 6–14 species).
  Each species gets a hue from its founding genome; members tint toward
  that hue from their gene colour. The river chart is a stacked
  streamgraph of species counts sampled every 2 s of sim time.
- **Art pipeline?** **A:** ChatGPT (Warren's Plus, in the browser) with one
  fixed art-direction preamble; transparent PNGs; `cutout.mjs` cleans them
  into `public/art/*.webp`. Missing images get labelled placeholders drawn
  in code, and are listed in the final report.
- **Fonts?** **A:** self-hosted variable fonts from Google Fonts' OFL set,
  copied into `public/fonts/` (no CDN at runtime): a soft-serif display
  face for titles and a geometric grotesk for UI / numbers (chosen in the
  art-direction pass and logged in DECISIONS.md).

## 3. Architecture

```
index.html                 preloader markup + first-paint CSS (inline)
src/main.js                router: mounts one screen at a time
src/core/                  env (reduced motion, webgl/webgpu checks), smooth
                           scroll, easing, rng, loader
src/intro/                 scroll intro: scenes.js (layer data), parallax.js,
                           transitions.js, per-scene canvases
src/sim/                   PURE, no DOM: rng.js, neat.js (genome, mutate,
                           crossover, distance, activate), species.js,
                           genes.js (gene → body), world.js (step), sense-cpu.js
src/worker/sim.worker.js   owns the World; sense-gpu.js (WebGPU compute);
                           posts packed Float32Array snapshots each tick
src/live/                  three.js: jar.js, terrain.js, creatures.js
                           (instancing + IK), food.js, particles.js,
                           camera.js (orbit + follow), picking
src/ui/                    hud.js, river.js (streamgraph), brain-panel.js,
                           controls.js
src/about/                 about screen
```

**Data flow.** Main thread → worker: `init {seed, params}`, `params`,
`speed`, `inspect id`. Worker → main: every sim tick batch a transferable
`Float32Array` of per-creature state (id, x, y, heading, speed, energy,
species, age, eat/mate flags) + food positions; on birth a creature's body
genes; for the inspected creature its node activations and genome; every
2 s species counts for the river. The main thread interpolates between the
last two snapshots so rendering stays smooth at any sim speed.

**Sim step (fixed dt = 1/30 s of sim time; speed = steps per frame).**
Sense → think (activate NEAT) → act (turn, thrust, eat if over food, mate if
touching a willing partner of the same species and both have energy) →
metabolise (energy cost ∝ size·thrust + base·segments + temperature term) →
die at 0 energy or max age → food regrows by food rate → every 600 steps
re-speciate. Births: sexual (crossover + mutation) when mating; asexual
budding as a floor when the population would fall below 60.

**NEAT.** Genome = node genes (input/bias/hidden/output, activation) +
connection genes (in, out, weight, enabled, innovation). Global innovation
tracker per world. Mutation: weight perturb (90%) / reset, add connection,
add node (split), toggle. Crossover aligns by innovation; disjoint/excess
from the fitter parent (fitness = energy gathered over lifetime). Distance
δ = c1·E/N + c2·D/N + c3·W̄. Activation evaluated recurrently, one step per
tick (so loops are allowed and the brain panel can show a pulse travel).

Inputs (8): food angle sin/cos, food distance, nearest-creature angle
sin/cos, nearest-creature distance, energy, wall distance; + bias.
Outputs (4): turn, thrust, eat, mate.

**Body genes** (floats in [0,1], mutated with the brain): segments (2–7),
limb length, size, hue, saturation, pattern. `genes.js` maps them to
`{segments, legLength, radius, color}` — tested.

## 4. Visual design

Fixed in the art-direction pass (`docs/art-direction.md`), before any image
is generated: palette, light (one warm key from the upper left through
glass, cool fill), rendering style. makemepulse is measured in
`design-reference/makemepulse/NOTES.md` and its techniques and timings
(layer count, parallax ratios, easings, scroll mapping, mask transitions,
preloader rhythm, type scale, grading) are reused with all-original art.

## 5. Errors and fallbacks

- No WebGL → static fallback (`.fallback` still + About text), logged.
- No WebGPU, or adapter/device fails → CPU sensing, logged with the reason.
- Worker fails to start → message in the HUD, sim not run; logged.
- Missing art file → labelled placeholder layer; logged once per file.
- Reduced motion → no parallax/transform motion; scenes cross-fade at
  fixed opacity transitions; the jar starts paused with a play button.

## 6. Testing

- `node --test`: NEAT (crossover alignment, each mutation keeps the genome
  valid, distance properties, speciation groups clones together and splits
  distant genomes, seeded runs are identical), genes → body mapping
  (ranges, monotonicity, clamping), world step invariants (energy
  conservation bounds, nobody leaves the disc).
- `scripts/shoot.mjs`: every scene/state at 1440×900, 1920×1080, 390×844;
  fps over 5 s in the jar with 500+ creatures; console errors fail the run;
  no horizontal scroll; reduced-motion and no-WebGL runs.
- `npm run build` clean.
