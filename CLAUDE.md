# Terrarium

A 3D ecosystem in a glass jar where small creatures with neural-net brains
evolve while you watch. Built from a clean slate; `../BTTRURSLF-v2` is
**read-only reference** (its art tools and working style were copied, its
code never edited).

The site is three screens behind hash routes (`src/main.js`): the
**preloader + scroll intro** (`#/`), five layered scenes that explain the
idea (genes become bodies, brains become behaviour, generations become
species) with makemepulse-level parallax and authored transitions; the
**live jar** (`#/live`), a three.js scene of a glass jar holding a mossy
floor and 500+ creatures whose NEAT brains, bodies and species evolve in a
Web Worker; and **About** (`#/about`), how it works, written plainly.

The motion is measured, not guessed: `design-reference/makemepulse/NOTES.md`
holds the numbers taken off 2019.makemepulse.com at 1440x900 and 1920x1080
(depth planes and parallax per band, the cursor lag, every transition's
easing and timing, the preloader, the type scale, the grading), and section 6
lists the values Terrarium uses. Only the techniques and timings are
borrowed; every image, character and word is original.

## Run

```bash
npm install
npm run dev      # http://localhost:5173 (honours $PORT)
npm test         # node --test: NEAT, species, genes -> body, world, IK, easing
npm run build
node scripts/shoot.mjs [tag] [only,these] [1440|1920|390|all]
node scripts/smoke-prod.mjs   # the BUILT site: every route, asset types, a 3x route cycle
node scripts/compare.mjs [tag] [1440|1920]   # side-by-side with makemepulse
node scripts/shots-to-jpg.mjs design-reference/shots/<tag>   # JPEG copies for git
```

`?preloader=1` forces the preloader (it otherwise plays once per browser
session, `terrarium:preloaded` in sessionStorage), `?preloader=0` skips it.
`?scene=1..5` opens the intro at that scene. `?motion=reduce|full` beats the
OS reduced-motion setting. `?webgl=0` forces the static fallback.
`?simcheck=1` senses one world on both backends and logs the largest
difference. `?seed=` and `?count=` (60-2000) start the jar from another
world. In the jar: drag turns it, a click (or F, or "Follow a creature")
follows a creature and opens its brain, Esc lets go, Space pauses, 1/2/3
are 1x/4x/16x.

`scripts/shoot.mjs` starts its own Vite server and shoots every scene and
state at 1440x900, 1920x1080 and 390x844 into `design-reference/shots/<tag>/`
(preloader, scenes 1-5, each transition mid-way, About, the jar at 1x and
16x, following a creature, that creature dying, reduced motion, no WebGL),
measures fps and this screen's own main-thread work per frame in the jar,
and fails on any console error, horizontal scroll, under 500 creatures,
or more than 10 ms of main-thread work per frame at 1440 (the machine
may be shared, so frame time alone is not the budget). Shot PNGs stay
local; `shots-to-jpg.mjs` makes the copies that go in git.
Playwright's Chromium needs `--disable-dawn-features=use_dxc` for WebGPU
(no dxil.dll); real Chrome does not.
`design-reference/compare/` puts those shots beside the makemepulse
recordings.

## Stack

Vite + vanilla ES modules. No framework, no TypeScript, no CSS-in-JS.
**One runtime dependency: `three`**, loaded only by the live jar (the
intro prefetches it while it plays). Playwright (pinned 1.63.0, matching
the installed Chromium) is a dev dependency for the shoot and art scripts.
Every dependency decision is a line in `DECISIONS.md`; adding another is a
decision to log there, not to make in passing.

## Structure

```
index.html                 preloader markup + first-paint CSS (inline on purpose)
src/main.js                router: one screen mounted at a time
src/core/                  env (reduced motion, WebGL), ease (GSAP Power curves),
                           scroll (virtual scroll for the intro)
src/styles/                tokens.css (palette, fonts, type scale, easing), base.css
src/intro/                 preloader, five scenes, parallax, transitions
src/sim/                   PURE simulation, no DOM: rng, neat, species, genes, world, sense-cpu
src/worker/                sim.worker.js (owns the world), sense-gpu.js (WebGPU compute)
src/live/                  three.js: stage, jar, terrain, creatures (instancing + IK), food,
                           particles, camera; screen.js wires worker <-> stage <-> UI
src/ui/                    hud, river (species streamgraph), brain-panel
src/about/                 About
test/                      node --test suites
scripts/shoot.mjs          the checks above
art-src/                   gen/ (ChatGPT originals, gitignored PNGs), cut/ (cleaned),
                           tools/ (cutout, sheet-boxes, png, over, montage),
                           images.json (every prompt's subject), PROMPTS.md (every full prompt)
design-reference/          makemepulse/ (NOTES.md, recorder, analyser, sheets),
                           shots/, compare/
docs/                      spec.md, art-direction.md, intro-brief.md, plans
```

## Conventions

- **A screen is a function** `(root, { go }) => { destroy() }`. It builds
  itself when called; `destroy()` removes everything it made: DOM,
  listeners, rAF loops, the worker, WebGL contexts (`WEBGL_lose_context`).
  Screens never import each other; they move with `go('#/path')`.
- **The simulation is pure and seeded.** `src/sim/` never touches the
  DOM, `Math.random` or the clock; the same seed gives the same world on the
  CPU path (tested). The worker owns the world; the main thread only
  renders snapshots, interpolating between the last two.
- **WebGPU is an accelerator, never a requirement.** Sensing runs as a
  compute pass when the worker gets an adapter within 3.5 s; otherwise the
  CPU grid hash, and the worker logs why (`[terrarium] sim backend: ...`).
  GPU inputs are 1 step old at 1x and at most 3 at 4x/16x.
- **The jar is budgeted.** `POP_CAP` (1000, `src/sim/world.js`) stops
  births; the renderer animates legs by on-screen size (`src/live/lod.js`):
  under ~8 px no legs, 8-20 px IK one frame in three, larger every frame,
  the followed creature always full. A worker that errors or sends no
  frame within 8 s gets a message, never a silent empty jar.
- **Every WebGL screen has a static fallback** and logs why it used it.
- **Reduced motion goes through `src/core/env.js`**: cross-fades instead
  of motion, the jar starts paused.
- **Motion values come from NOTES.md.** Eases are the GSAP Power curves in
  `src/core/ease.js` and `--e-*` in tokens.css; nothing uses a default
  `ease`.
- **Class names carry their screen's prefix**: `pl-` preloader, `in-`
  intro, `lv-` live, `ui-` shared UI, `ab-` about.
- **Art is one cut-out per thing**, generated in ChatGPT with the fixed
  preamble in `art-src/preamble.txt` (= `docs/art-direction.md`), cleaned by
  `node art-src/process.mjs` (copied `cutout.mjs`: trim, alpha erode, edge
  decontamination, WebP). Sheets are split by `sheet-boxes.mjs`'s measured
  boxes, never eyeballed. New art: add it to `art-src/images.json`, run
  `node art-src/gen-all.mjs`, then `node art-src/process.mjs <name>`.
  Motion is code (IK gait, body bob, sway), never frame swapping.
- **File headers explain why**, not what.
- **Copy is plain**: sentence case, no all-caps labels, no arrows on
  buttons; a control's name says what it does.
- **Decisions go in `DECISIONS.md`**, one line each with the reason.
