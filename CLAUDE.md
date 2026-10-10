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
```

`?preloader=1` forces the preloader (it otherwise plays once per browser
session, `terrarium:preloaded` in sessionStorage), `?preloader=0` skips it.
`?scene=1..5` opens the intro at that scene. `?motion=reduce|full` beats the
OS reduced-motion setting. `?webgl=0` forces the static fallback.
`?simcheck=1` runs one sim step on both sensing backends and logs the
largest difference.

`scripts/shoot.mjs` starts its own Vite server and shoots every scene and
state at 1440x900, 1920x1080 and 390x844 into `design-reference/shots/<tag>/`
(preloader, scenes 1-5, each transition mid-way, About, the jar at 1x and
16x, following a creature, that creature dying, reduced motion, no WebGL),
measures fps in the jar, and fails on any console error, horizontal
scroll, or under 50 fps with 500+ creatures at 1440.
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
  compute pass when the worker gets an adapter; otherwise the CPU grid
  hash, and the worker logs why (`[terrarium] sim backend: ...`).
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
