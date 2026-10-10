# Intro, preloader and About: build brief

Read with: `docs/art-direction.md` (look), `design-reference/makemepulse/NOTES.md`
(motion: **use its numbers**, especially §6 "What Terrarium takes"),
`art-src/gen/comp-intro.png` (design comp: build to match its feel: deep
layered diorama, quiet text block on the left, warm light).

## Art in `public/art/` (all WebP, cut out; sizes in `art-src/cut/manifest.json`)

| file | what | depth role |
|---|---|---|
| `bg-fog.webp` (1536x1024, opaque) | misty glasshouse interior, light shafts | farthest plate |
| `mid-rocks.webp` | mossy stones round a small pool | midground ground plane |
| `jar-world.webp` | the jar with a tiny world and creatures inside | the subject (parallax pivot) |
| `jar.webp` | the same jar, empty | scene 5 / transitions |
| `fg-moss.webp` | wide moss bank, ferns, pebbles, along the bottom | near |
| `leaves-left.webp`, `leaves-right.webp` | big soft leaves from the edges | closest (frame) |
| `gene-strand.webp` | a curved strand of 12 coloured glass beads | scene 2 |
| `sp-violet-*.webp`, `sp-salmon-*.webp`, `sp-lichen-*.webp` | body-part sheets, 7 parts each: head, 3 body segments, upper leg, lower leg, tail (check order in the manifest crops / by looking) | scenes 2-4: creatures assembled from parts |
| `pt-*.webp` | 18 particles: cyan spores, pollen, glowing seeds, motes, fluff | drifting particles, food seeds |
| `preloader-sprout.webp` | a seed splitting with a sprout | preloader |
| `paper-grain.webp` (opaque tile) | celadon paper grain | multiply overlay over everything (4%) |

Never stretch art beyond ~1.3x its pixel size at the viewport it is shown;
on 1920 wide, scale the composition, do not upscale one layer alone.

## Flow

1. **Preloader** (`index.html` inline markup + `src/intro/preloader.js`):
   fog-coloured paper with grain. After 0.4 s a faint hand-drawn **stem
   path** (SVG, wavy, centred, 31% of the viewport height) appears and is
   **traced from the bottom up by real load progress** (fonts + the first
   scene's images + the intro chunk; weight them). At 100%: path fades
   (0.3 s), one empty beat (0.6 s), the **sprout pops in** (expo-out
   0.28 s, from scale 0.6) with the wordmark "Terrarium" in IM Fell English
   under it. Then the sprout's disc of fog **grows to fill the screen**
   (1.2 s Power3.easeInOut, a circular mask) revealing scene 1. Auto, no
   click needed. Shows once per session (sessionStorage
   `terrarium:preloaded`); `?preloader=1` forces, `?preloader=0` skips.
   If loading takes < 1.2 s, still trace over 1.2 s minimum (no flash).
2. **Scenes 1-5** (`src/intro/screen.js`, `scenes.js`, `parallax.js`).
3. Scene 5's button **Open the jar** goes to `#/live` with the jar
   push-in (the jar scales toward the camera, its glass fills the frame,
   ~1.2 s Power3.easeInOut), then route change.
4. **About** (`src/about/screen.js`): `#/about`.

## Scene copy (use verbatim)

Chapter labels are a real sequence, so a small chapter number is fine
(no all-caps, no tracking).

1. **Title:** Terrarium
   **Text:** A few hundred small creatures live in this jar. Nobody
   designed them. Scroll, and we'll show you how they got this way.
2. **Title:** Genes become bodies
   **Text:** Every creature carries a short string of genes. Some decide
   how many segments it has, how long its legs are, how big it grows and
   what colour it is. Change a gene and the body changes with it.
   **Interactive:** the bead strand: scrubbing scroll through the scene
   (or hovering / tapping a bead) changes one gene, and a violet creature
   assembled from `sp-violet-*` parts gains or loses segments, its legs
   lengthen, it grows and recolours (CSS `filter: hue-rotate` on parts)
   live. Parts are positioned by code along a spine, legs swing.
3. **Title:** Brains become behaviour
   **Text:** Each one also has a tiny brain, a handful of neurons wired
   together. It senses where the nearest food is, who is close by, how
   much energy it has left and how near the glass is. From that it
   decides to turn, to walk, to eat or to look for a mate.
   **Interactive:** a small canvas brain (8 inputs, 3 hidden, 4 outputs,
   violet nodes, cyan when firing) wired to a creature (salmon parts) that
   steers toward a glowing seed (`pt-*` seed) the visitor can move with
   the pointer (or that wanders by itself on touch); edges light as the
   brain decides.
4. **Title:** Generations become species
   **Text:** Creatures that find food live long enough to have young. Each
   child is a mix of its parents with a few small mistakes. Over many
   generations the mistakes add up, families drift apart, and new species
   appear.
   **Visual:** a branching family tree drawn on canvas, growing with
   scroll, its branches tinted violet / salmon / lichen, ending at three
   creatures (one per species, assembled from parts) walking on
   `mid-rocks`.
5. **Title:** Open the jar
   **Text:** None of this is scripted. Every creature inside was born in
   your browser a moment ago, and what they become is up to them.
   **Primary button:** Open the jar   **Link:** How it works (to `#/about`)

## Layers and parallax

Each scene has **at least 6 planes + the grain overlay**: far plate, mid
ground, the subject (pivot, does not move with the mouse), near, closest
frame leaves, a particle layer, DOM text. Mouse parallax per half-screen of
pointer travel, as a fraction of viewport width (NOTES §2, §7): far
**+1.1%**, mid +0.4%, pivot 0, near **-1.5%**, closest **-3%**; vertical a
third of that. Damped toward the pointer with **lambda 2.2/s**
(`damp()` in `src/core/ease.js`). Touch devices: a slow idle drift
instead (8 s sine, a third of the amplitude). Also a scroll-scrubbed dolly
inside each scene's rest segment: far planes drift less than near ones.

## Scroll and transitions

Use a virtual scroll (`src/core/scroll.js`: wheel, touch swipe, keys:
arrows, PageUp/PageDown, Space, Home/End) driving progress 0..1 within the
current scene; the page itself does not scroll (fixed full-viewport stage,
`overflow:hidden`, no horizontal scrollbar at 390). Crossing the end of a
scene **plays the next transition at its authored timing** and ignores
input until it finishes; scrolling back past the start plays it in
reverse. A progress rail with five dots (buttons: jump to scene) on the
right edge.

Transitions (NOTES §3), one per boundary:
- 1 -> 2: **push into the foliage**: the closest leaves scale up (to
  ~3.5x) and close over the frame (1.2 s Power3.easeIn), cut, new scene's
  leaves open outward (1.3 s Power3.easeOut).
- 2 -> 3: **tilt up into the fog**: all planes slide down at their depth
  speeds, the frame becomes the flat fog colour (1.0 s Power3.easeInOut),
  scene 3 rises in under it (1.1 s Power2.easeOut).
- 3 -> 4: **descent**: scene 4's planes rise into place from below at
  staggered speeds (far first, ~0.27-0.42 s apart, each 0.9 s
  Power4.easeOut) over the fading scene 3.
- 4 -> 5: **page turn**: scene 4 shrinks into an inset card on paper
  (scale 0.88, 0.55 s Power2.easeInOut), slides off upward (0.6 s
  Power3.easeIn), scene 5 drops in from the top (1.0 s Power4.easeOut).

In-scene beats after each transition settles (NOTES §6): text block line
1 rises 0.8 s Power2.easeOut at +0.4 s, letters of the body text appear
18 ms apart (visually: per-word is fine below 700 px), the **title plate is
mask-wiped in from the left** (clip-path inset, 1.3 s Power4.easeInOut,
starting +1.1 s), the scroll prompt pops in 0.6 s Power2.easeOut.

## Typography

Titles IM Fell English at `--t-6` (clamped), set in a **plate** (paper
grain, 1 px moss rule at 30%) flush with the left edge like a specimen
label, about 22% down; body Hanken Grotesk 17/27 (`--t-0`), max 34ch; small
UI 13-14 px. Huge-vs-tiny contrast (~4x) as in NOTES §4. On 390 wide: the
plate and text sit at the bottom over a soft fog gradient; title 40-44 px.

## Reduced motion and fallbacks

`prefersReducedMotion()` from `src/core/env.js`: no parallax, no drift, no
transforms; scenes cross-fade (400 ms opacity) and the preloader shows a
static sprout + a progress number. Everything still reachable with keys and
the rail. No JS needed for the preloader markup to look right.

## About (`#/about`)

A calm, readable page (not a scene): fog paper, `jar-world.webp` small
at the top, then plain sections: What you are looking at; Genes; Brains
(NEAT: brains that grow new neurons and connections as they evolve,
said plainly); Food, energy and children; Species; What runs where
(the simulation runs in a background worker, WebGPU when your browser has
it, otherwise the processor; nothing is sent anywhere); Controls.
Links back to the intro and to the jar. Write it plainly: short
sentences, no jargon without a one-line explanation.
