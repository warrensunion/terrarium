# Terrarium Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Vite + vanilla-JS + three.js site: preloader → five-scene scroll intro → a live 3D jar of NEAT creatures evolving in a Web Worker → About.

**Architecture:** A pure, seeded, tested simulation (`src/sim/`) runs inside a worker (`src/worker/`) that streams packed snapshots; the main thread renders them with instanced three.js meshes and procedural IK (`src/live/`) and shows DOM UI (`src/ui/`). The intro (`src/intro/`) is DOM parallax on WebP cut-outs.

**Tech Stack:** Vite 7, three 0.180, vanilla ES modules, node:test, Playwright 1.63.0 (dev only).

**Spec:** `docs/spec.md`; art: `docs/art-direction.md`; measured motion: `design-reference/makemepulse/NOTES.md`.

## Global Constraints

- No framework, no TypeScript, no CSS-in-JS. Runtime dependency: `three` only. Any other dependency → one line in `DECISIONS.md`.
- A screen is a function `(root, { go }) => ({ destroy() })`; `destroy()` removes all DOM, listeners, rAF loops, workers, and calls `WEBGL_lose_context`.
- Every class name starts with its screen prefix: `pl-` preloader, `in-` intro, `lv-` live, `ui-` shared UI, `ab-` about.
- Reduced motion only through `src/core/env.js` `prefersReducedMotion()`; it gives cross-fades instead of motion.
- No WebGL → static fallback, logged with `console.info('[terrarium] fallback:', reason)`.
- Works from 390 px wide, never a horizontal scrollbar.
- Copy: sentence case, plain verbs, no all-caps labels, no "→" on buttons.
- Fonts self-hosted in `public/fonts/`: IM Fell English (display), Hanken Grotesk (text/UI).
- Palette tokens (CSS custom properties in `src/styles/tokens.css`): `--fog #C9D8D2`, `--moss #1F3A33`, `--lichen #D6C35A`, `--violet #6B4FA0`, `--cyan #5FE3D8`, `--peat #3B2E26`, `--salmon #F07A8C`, `--ink-lift #14241F`.
- File headers explain why, not what.

## Review Focus

1. Population collapse (all creatures die): the budding floor of 60 must keep the world alive — `test/world.test.js` "population never drops below the floor over 3000 steps".
2. Genome bloat at high mutation rate (1.0) for a long run: activation stays finite and node count stays ≤ 64 — `test/neat.test.js` "high mutation keeps genomes valid and bounded".
3. Following a creature that dies: the camera returns to orbit and the panel says the creature died — Task 8, a step that kills the inspected id.
4. Tab hidden then shown: no burst of thousands of queued steps — main loop clamps dt to 100 ms; Task 8 step.
5. 390 px wide with the brain panel open: the panel becomes a bottom sheet and the HUD does not overlap it — Task 7 shot at 390×844.

---

## File map

```
index.html, vite.config.js, src/main.js           router + preloader markup
src/core/env.js        prefersReducedMotion(), hasWebGL2(), log()
src/core/ease.js       power2/3/4 in/out/inOut, lerp, damp(current,target,lambda,dt)
src/core/scroll.js     smoothed virtual scroll (wheel/touch/keys) → progress 0..1
src/styles/tokens.css, base.css
src/sim/rng.js         createRng(seed)
src/sim/neat.js        genomes, mutation, crossover, distance, brains
src/sim/species.js     speciate(), adjustThreshold()
src/sim/genes.js       body genes → body
src/sim/world.js       createWorld(), step(), packFrame()
src/sim/sense-cpu.js   senseCPU(world)
src/worker/sim.worker.js, src/worker/sense-gpu.js
src/live/              screen.js jar.js terrain.js creatures.js ik.js food.js particles.js camera.js
src/ui/                hud.js river.js brain-panel.js
src/intro/             screen.js scenes.js parallax.js preloader.js
src/about/screen.js
test/                  rng neat species genes world .test.js
scripts/shoot.mjs
```

## Shared contracts (every task reads this)

**Sim units.** World = unit disc, radius 1, origin centre. Sim step dt = 1/60 s. Speed 1x/4x/16x = 1/4/16 steps per rendered frame; 0 = paused.

**`src/sim/rng.js`** `createRng(seed:number) -> { next():number /*[0,1)*/, int(n):number, range(a,b):number, normal():number, pick(arr) }` — mulberry32.

**`src/sim/neat.js`**
- Genome `{ nodes: [{ id:int, type:'in'|'bias'|'hidden'|'out', act:'tanh'|'sigmoid'|'relu'|'sin'|'id' }], conns: [{ inn:int, from:int, to:int, w:number, on:boolean }] }`. Node ids 0..7 inputs, 8 bias, 9..12 outputs (turn, thrust, eat, mate), hidden from 13. `N_IN = 8`, `N_OUT = 4`.
- `createTracker() -> { connInn(from,to):int, splitNode(inn):int }` (same structural mutation → same innovation/node id within a world).
- `createGenome(rng, tracker) -> Genome` (fully connected in+bias → out, random weights N(0,1)).
- `mutate(g, rng, tracker, rate /*0..1, default 0.3*/) -> Genome` (returns a copy; weight perturb p=0.8·rate·… , add-conn p=0.08·rate, add-node p=0.04·rate, toggle p=0.02·rate; hidden nodes capped at 48).
- `crossover(fitter, other, rng) -> Genome` (matching genes random parent; disjoint/excess from fitter).
- `distance(a, b, { c1=1, c2=1, c3=0.4 } = {}) -> number`.
- `validateGenome(g) -> string[]` (empty = valid: unique ids, conns reference existing nodes, no conn into an input/bias).
- `createBrain(g) -> { activate(inputs:Float32Array(8)) -> Float32Array(4), values:Float32Array /*per node, in g.nodes order*/, order:number[] /*node ids*/ }` — one recurrent step per call: every node's new value = act(Σ w·previous values of sources), inputs/bias set first.

**`src/sim/species.js`**
- `speciate(pop:[{id, genome}], prev:[Species], threshold, rng, nextId:()=>int) -> Species[]` where `Species = { id, rep:Genome, members:int[], hue:number /*0..360*/, born:number /*tick*/ }`; members compared to each previous rep in order, first under threshold wins; empty species dropped; new species' rep = first member; hue = new species get a hue 137.5° (golden angle) from the last one.
- `adjustThreshold(t, count, lo=6, hi=14) -> number` (×0.9 if count > hi, ×1.1 if count < lo, clamped [0.5, 12]).

**`src/sim/genes.js`**
- Body genes `{ segments, limb, size, hue, sat, pattern }`, each in [0,1].
- `randomBodyGenes(rng)`, `mutateBodyGenes(b, rng, rate)` (each gene += N(0, 0.08·rate·…) clamped), `crossBodyGenes(a, b, rng)` (per gene from either parent).
- `bodyFromGenes(b) -> { segments:int 2..7, legLength:number 0.6..1.8 /*× radius*/, radius:number 0.012..0.03 /*world units*/, hue:0..360, sat:0.35..0.85, light:0.45..0.7, pattern:0|1|2 }` — linear and monotonic in each gene; `segments = 2 + round(segments·5)`.

**`src/sim/world.js`**
- `createWorld({ seed=1, count=600, params }) -> World`; `params = { foodRate=1 /*0..3*/, mutationRate=0.3 /*0..1*/, temperature=0.5 /*0..1*/ }`.
- `world.step()`, `world.tick`, `world.creatures` (live list), `world.food` (Float32Array pool), `world.species`, `world.generation` (max generation alive).
- Creature `{ id, x, y, heading, speed, energy /*0..1*/, age, genome, body:bodyGenes, brain, species, generation, parents:[id,id]|[id]|[], gathered, flags }`.
- Sensing (inputs, in order): food angle sin, cos (relative to heading), food distance (0..1, 1 = none within 0.35), creature angle sin, cos, creature distance (same), energy, wall distance (1 − r).
- Acting: turn → heading += out0·3.0·dt; thrust → speed = max(0, out1)·0.25; eat when out2 > 0 and food within 0.02 (gain 0.25 per pellet); mate when out3 > 0, partner within 0.03, same species, both energy > 0.55 → child, both parents pay 0.25.
- Metabolism per step: `0.0009·(1 + radius/0.02)·(0.3 + speed/0.25) + 0.00015·segments + 0.0006·|temperature − 0.5|`·(1 + size gene). Death at energy ≤ 0 or age > 90 s. Food: pool of 900, regrows at `foodRate·6` pellets/s at random disc points (biased toward 3 fixed patches by seed). Re-speciate every 120 steps. Budding floor 60.
- `packFrame(world, inspectId, sinceTick) -> FrameMessage` (below).

**Worker protocol** (`src/worker/sim.worker.js`)
- main → worker: `{type:'init', seed, count, params}`, `{type:'step', steps}` (sent once per rAF; 0 still returns a frame), `{type:'params', params}`, `{type:'inspect', id:number|null}`, `{type:'reset', seed}`.
- worker → main: `{type:'ready', backend:'webgpu'|'cpu', reason:string}` then per step request `{type:'frame', tick, creatures:Float32Array /*STRIDE=10: id,x,y,heading,speed,energy,species,age,flags,generation*/, food:Float32Array /*x,y,amount*/, births:[{id, body, species, generation, parents}], deaths:int[], stats:{ tick, population, generation, species:[[id, count, hue]] }, inspect:{ id, values:Float32Array, genome, age, energy, generation, parents, lineage:int[] /*ancestor ids, nearest first, ≤ 12*/, species, gathered } | null, dead:int|null /*inspected id that died this frame*/}` with typed arrays transferred. The first frame lists every initial creature in `births`.

**Renderer contract** (`src/live/`)
- `WORLD_R = 5` three units per sim unit; sim (x, y) → three (x·5, heightAt(x,y), y·5).
- `terrain.js`: `heightAt(x, y) -> number` (sim units in, three units out), `createTerrain(textures) -> THREE.Group`.
- `creatures.js`: `createCreatures(scene, { max = 2000 }) -> { add(birth), remove(id), update(prev:Frame, next:Frame, alpha:number, dt:number), pick(raycaster) -> id|null, positionOf(id) -> THREE.Vector3|null, dispose() }`.
- `camera.js`: `createCameraRig(camera, dom) -> { follow(getPos:()=>Vector3|null), release(), update(dt) }`.

**UI contract** (`src/ui/`)
- `createHud(root, { onSpeed(n), onParams(p), onReset() }) -> { update(stats), setSpeed(n), destroy() }`.
- `createRiver(canvas) -> { push(stats), draw(), destroy() }` (samples every 120 ticks; keeps the last 300 samples).
- `createBrainPanel(root, { onClose }) -> { show(inspect), update(inspect), died(), hide(), destroy() }`.

---

### Task 1: Scaffold and core (lead)

**Files:** Create `index.html`, `vite.config.js`, `src/main.js`, `src/core/{env,ease,scroll}.js`, `src/styles/{tokens,base}.css`, `public/fonts/*`, `test/ease.test.js`.

- [ ] Write `test/ease.test.js`: power eases hit 0 at 0 and 1 at 1, `inOut(0.5) === 0.5`, `damp` moves toward target and never overshoots for dt ≤ 1.
- [ ] Run `node --test test/` — fails (no module).
- [ ] Implement `src/core/ease.js` (`p2in p2out p2inOut p3* p4*` mirroring GSAP Power2–4, `lerp`, `clamp`, `damp(a,b,lambda,dt) = lerp(a,b,1-exp(-lambda·dt))`).
- [ ] Run tests — pass.
- [ ] Router `src/main.js`: hash routes `#/` intro, `#/live`, `#/about`; mounts one screen, destroys the previous.
- [ ] `npm run build` clean; commit `feat: scaffold, router, core`.

### Task 2: Simulation core (agent: sim) — TDD

**Files:** Create `src/sim/{rng,neat,species,genes,world,sense-cpu}.js`, `test/{rng,neat,species,genes,world}.test.js`.

Tests (each written first, seen failing, then made to pass):
- rng: same seed same sequence; different seeds differ; `int(n)` in range over 10k draws.
- neat: `createGenome` valid with 9×4 conns; crossover of a genome with itself equals it structurally; crossover child contains every matching innovation and only fitter's disjoint/excess; each mutation type (forced via rate=1 and a seeded loop) keeps `validateGenome` empty; add-node splits a conn (old disabled, two new with weights 1 and old w); `distance(g,g) === 0`, symmetric, grows with weight perturbation; same structural mutation in two genomes gets the same innovation; brain outputs finite and in [-1,1] for tanh outputs; "high mutation keeps genomes valid and bounded" (rate 1, 2000 mutations, hidden ≤ 48, outputs finite).
- species: clones of one genome → one species; two genomes at distance > threshold → two species; `adjustThreshold` direction and clamp; hue spacing 137.5°.
- genes: `bodyFromGenes` ranges at 0 and 1; monotonic in segments/limb/size; clamps out-of-range input; mutate stays in [0,1]; cross takes each gene from a parent.
- world: two worlds with the same seed are identical after 500 steps (compare packFrame creatures arrays); different seeds differ; nobody's r > 1 after 1000 steps; energy within [0,1]; "population never drops below the floor over 3000 steps"; births record parents and generation = max(parent)+1; packFrame STRIDE 10.
- [ ] Commit after each module goes green: `feat(sim): <module>`.

### Task 3: Worker and WebGPU sensing (agent: sim, after Task 2)

**Files:** Create `src/worker/sim.worker.js`, `src/worker/sense-gpu.js`; Modify `src/sim/world.js` (accept an injected sensor).

- [ ] `sense-gpu.js`: `createGpuSensor() -> Promise<{ sense(world) -> Promise<void>, destroy() } | { error:string }>` — WGSL compute, one invocation per creature, brute-force nearest food + nearest creature within 0.35, writes the same 6 sensing values the CPU path writes; results applied one step late (documented).
- [ ] Worker picks GPU when `navigator.gpu` and an adapter exist, else CPU; posts `ready` with `reason` (e.g. "navigator.gpu missing in worker", "requestAdapter returned null") and `console.info('[terrarium] sim backend:', backend, reason)`.
- [ ] Parity: `?simcheck=1` dev flag runs 1 step both ways and logs max abs difference (shoot.mjs asserts < 1e-4).
- [ ] Commit `feat(worker): sim worker with WebGPU sensing and CPU fallback`.

### Task 4: Live 3D scene (agent: live)

**Files:** Create `src/live/{jar,terrain,creatures,ik,food,particles,camera}.js`, `test/ik.test.js`, dev page `live-dev.html` using a fake frame source until Task 3 lands.

- [ ] `ik.test.js`: `solveTwoBone(hip, target, l1, l2, pole)` reaches reachable targets within 1e-6, stretches toward unreachable ones without NaN; `stepFeet` moves a foot only when it lags > threshold and alternates sides.
- [ ] Implement `ik.js`; creatures as InstancedMesh: segments (icosahedron spheres), leg bones (capsules), eyes; segment chain follow-the-leader spacing = 1.6·radius; feet step when > 0.9·legLength from rest; body bob = 0.15·radius·|sin(phase)|; colour from body + species hue tint 35%.
- [ ] Jar: open cylinder with fresnel glass shader (rim highlights, celadon tint, refraction-look offset of the background), cork lid, inner rim; terrain disc with moss/soil textures from `public/art/` when present; food = instanced glowing seeds (`--lichen`); particles = drifting spores.
- [ ] Picking via raycaster against an invisible proxy sphere per creature; camera rig: orbit by drag, zoom by wheel, follow with damp λ=4.
- [ ] Measure: 600 creatures at 60 fps in `live-dev.html` (log ms/frame).
- [ ] Commit `feat(live): jar, terrain, instanced creatures with IK`.

### Task 5: UI components (agent: ui)

**Files:** Create `src/ui/{hud,river,brain-panel}.js`, `src/ui/ui.css`, dev page `ui-dev.html` with fake stats/inspect data.

- [ ] HUD: generation, population, species count; speed buttons (pause, 1x, 4x, 16x; keyboard Space toggles pause, 1/2/3 speeds); sliders for food rate (0–3), mutation rate (0–1), temperature (0–1) with live values; reset.
- [ ] River: streamgraph (wiggle offset), species colour = `hsl(hue, 55%, 55%)`, newest at the right, labels for the 3 biggest species.
- [ ] Brain panel: nodes laid out in columns (inputs left, outputs right, hidden by depth), edges coloured by sign, width by |w|, glow by |activation·w| this tick (canvas, additive), labels for inputs/outputs in plain words; genome stats, age, energy bar, generation, lineage chips (clicking one does nothing if dead). Desktop: right-side panel 360 px; < 700 px wide: bottom sheet 46 vh.
- [ ] Commit `feat(ui): hud, species river, brain panel`.

### Task 6: Preloader, scroll intro, About (agent: intro, after NOTES.md and art)

**Files:** Create `src/intro/{preloader,parallax,scenes,screen}.js`, `src/intro/intro.css`, `src/about/{screen.js,about.css}`.

- [ ] Preloader per NOTES.md (rhythm, easing, exit transition), real progress from asset loads.
- [ ] Five scenes, each with ≥ 4 depth layers at NOTES.md's parallax ratios, mouse parallax with NOTES.md's lag, scene changes with NOTES.md's mask/dissolve transitions and easings; scroll → scene mapping as NOTES.md recommends; scene 5 CTA "Open the jar" goes to `#/live`.
- [ ] Reduced motion: no transforms, 400 ms cross-fades.
- [ ] About: plain-language how-it-works.
- [ ] Commit `feat(intro): preloader, five-scene intro, about`.

### Task 7: Integration (lead)

- [ ] `src/live/screen.js` wires worker ↔ creatures ↔ HUD ↔ river ↔ brain panel; interpolation between last two frames; dt clamp 100 ms; inspected creature dying → `died()` + `camera.release()`.
- [ ] No-WebGL fallback screen; reduced motion starts paused with a play button.
- [ ] Commit.

### Task 8: Verification (lead)

- [ ] `scripts/shoot.mjs`: every scene/state at 1440×900, 1920×1080, 390×844; fps; console errors; horizontal scroll; reduced motion; no WebGL (`--disable-webgl`); kill-inspected; tab hidden 5 s then shown.
- [ ] `design-reference/compare/` side-by-side sheets; fix what is less polished.
- [ ] `npm test`, `npm run build`; web-design-guidelines audit; CLAUDE.md; commit.
