# 2019.makemepulse.com ("Nomadic Tribe"), measured (10 Oct 2026)

What Terrarium borrows is the **technique and the timing**, never the art,
characters, logo or words. This file is the measured reference; the
Terrarium numbers derived from it are in the last section.

## How it was measured

- `tools/record.mjs <size>` drives the live site in Playwright's Chromium
  (GPU via ANGLE) at **1440x900** and **1920x1080**. It records every
  composited frame with its own compositor timestamp (CDP
  `Page.startScreencast`, frames every 34-70 ms; raw frames in
  `frames/<size>/`, gitignored), a video (`rec/<size>/video.webm`) and a log
  of every scripted action on the same clock (`rec/<size>/events.json`).
  The script: waits out the preloader, hovers / un-hovers the landing disc,
  hovers Enter and clicks it, hovers Start and clicks it, then in scene 1
  makes **instant mouse jumps** (centre, left edge, right edge, top, bottom,
  each held 3 s) for step responses, sweeps a circle, wheels 6 ticks, then
  walks every scene (its gesture, hover Next, click Next) with a left/right
  jump in each.
- `tools/analyse.mjs <size>` turns that into `rec/<size>/analysis.json` and
  contact sheets (`rec/<size>/sheet-*.jpg`): progress curves of every
  transition (distance to the end frame) **fitted against GSAP's Power0-4
  in/out/inOut and expo**, per-band horizontal / vertical shift after each
  mouse jump (cross-correlation of luminance profiles in 8 horizontal bands,
  sub-pixel), the preloader line, the disc radius, and grading per scene.
- The site's own bundle (`main.js`, 2 MB unminified-ish) names its tweens;
  those are quoted below as **code** next to the **measured** value. Where
  they disagree, the measured one is what a visitor sees.

The site is a WebGL piece (two canvases, its own engine "GLXP", glTF
scenes), GSAP 1.20 TweenLite for UI, Vue for DOM. **There is no scrolling**:
the page is `overflow:hidden`, 900 px tall, and the wheel does nothing
(frame difference before/after 6 wheel ticks: 1.8/255, the ambient sway).
Scenes advance by a gesture (drag up / hold) and then a **Next** tag.

## 1. Preloader (`sheet-preloader.jpg`)

| t (s from request) | on screen |
|---|---|
| 0 - 5.5 | flat slate-blue paper (#5f657d, with a fine noise grain), nothing else |
| 5.5 | a faint hand-drawn **guide line** appears: a wavy vertical stroke, centred, **31% of the viewport height** tall; "Best experienced with sound" (Gotham Book 12 px) bottom right |
| 7 - 19 | a solid off-white stroke **traces the guide from the bottom up** as assets load (real progress, not a timer; it stalls and jumps with the network) |
| 19.8 | the line is gone; a beat of empty paper (~0.6 s) |
| 20.4 | a **paper disc** pops in at the centre, radius **0.29 x viewport height**, with the wordmark inside |

The disc **breathes on hover**: radius 0.290 -> 0.337 H (+16%), fitted
**expo-out over 0.28 s** (code: `circleBackground.size .35 -> .45, 0.9 s
Power2.easeOut`; the visible part is the first ~0.3 s). Un-hover returns
over **1.64 s Power4.easeOut** (measured). The cursor is a small white dot
that lags the pointer.

Enter -> title: the disc grows to fill the screen (code: `size -> 1, 1.2 s
Power3.easeInOut`), the title triptych's panels slide in from both sides
(at +0.9 s they are still travelling, settled at +2.2 s), the first
subtitle box appears at **+3.6 s**. Whole-screen progress fits
**expo-out, 3.5 s, 0.18 s delay**.

## 2. Depth layers and parallax (`analysis.json` -> `parallax`)

The scenes are real 3D (glTF) seen through a camera that **orbits a pivot
in the midground** as the mouse moves. So parallax is continuous with depth,
but the art is built in clear planes. Scene 1 reads as **6 depth planes +
2 overlays**: sky gradient; far clouds and a distant crystal; far bushes
and rocks; the meadow floor; midground plants (spirals, flowers);
foreground leaves (bottom corners) and hanging vines (top corners); then a
paper-grain overlay over everything and the DOM UI on top.

Shift per band for an instant mouse jump **centre -> left edge (0.45 of the
width)** at 1440x900, scene 4 (the cleanest: no wind):

| band (top -> bottom) | 0 sky | 1 | 2 horizon | 3 | 4 | 5 floor | 6 near | 7 foreground |
|---|---|---|---|---|---|---|---|---|
| dx (px) | -15.8 | -16.4 | -15.0 | -12.9 | -4.4 | +1.5 | +9.1 | +24.1 |

and **left -> right edge (0.9 W)**: +32.7, +33.0, +30.7, +26.4, +9.5, +2.1,
-18.8, **-55.3**. Scene 1 shows the same shape (far -4..-14 px, floor +18,
near +27, foreground **+51 px**).

So per half-screen of mouse travel: **far planes move ~16 px with the
mouse, the pivot (about 60-65% down, where the subject stands) does not
move, near planes move ~10-20 px against it and the foreground ~25-50 px
against it**. Foreground : far = **about -2 : 1** (opposite sign, double
the amplitude). Vertical mouse travel gives about **a third** of that
(+/-12-14 px on the near bands, +/-3-7 on the far).

**Cursor-follow lag** (the camera eases toward the mouse): 63% of the
final shift is reached at **0.29-0.48 s**, 90% at **~1.05 s** (scene 1 and
4 agree). That is exponential damping with **lambda ~ 2.2 /s** (time constant
0.45 s; at 60 fps a per-frame lerp of ~0.036). Hover on a hotspot uses a
faster damping (code: `damping = .12` per frame).

## 3. Transitions (`analysis.json` -> `transitions`, `sheet-*.jpg`)

Every scene change is a **camera move or a mask**, never a plain fade:

| transition | what happens | measured |
|---|---|---|
| Start -> scene 1 (`sheet-start-scene1`) | the title page **slides down** off screen (code: `y 0 -> 100%, 1 s Power2.easeInOut`); the new scene arrives as an **inset card on the paper (~3% margin) and grows to full bleed** | card visible +1.55 s, full bleed +2.1 s; scene title wipes in **+3.6 -> +4.9 s**; overall expo-out 3.3 s after a 1.4 s hold |
| scene 1 -> 2 (`sheet-next1-scene2`) | the camera **pushes forward into the foreground foliage** until a dark-green leaf mass covers the frame (+1.2 s), then the new scene is there | covered at +1.2 s, new scene fully up at +2.5 s; subtitle box at +2.9 s; title plate +4.2 -> +5.5 s |
| scene 2 -> 3 (`sheet-next2-scene3`) | **tilt up into the sky**: clouds slide down past the camera, the frame becomes a flat sky gradient (+1.7 s), the new scene (seen from above) arrives under it, framed by a big **oval mask** | sky +1.7 s, new scene +2.1 s, title +4.6 -> +5.6 s |
| scene 3 -> 4 (`sheet-next3-scene4`) | **descent through cloud**: cloud silhouettes rise past, then the dune layers **rise into place at different speeds** (a layered reveal) | layers arrive +0.27 -> +0.42 s; Power2.easeOut, 2.9 s overall |
| scene 4 -> end (`sheet-next4-scene5`) | the scene **shrinks into a card** on paper (+0.65 -> +1.2 s, scale ~0.88), slides off; the end illustration **drops in from the top** (+2 s) | Power1.easeIn, 2.0 s |

Inside every scene the same choreography repeats:
1. scene settles;
2. **subtitle box** (paper, 1 px rule, Gotham Book 16/24) fades in and its
   text appears **letter by letter** (`anim-letter`);
3. **title plate** (a paper strip flush with the left edge, 22% down) is
   **wiped in from the left by a mask**, ~1.3 s, with a slight jitter at
   the wipe edge;
4. a gesture prompt (a small paper disc: "Drag", "Hold") pops in
   (code: `0.6 s, autoAlpha 0 -> 1, scale 0 -> 1, Power2.easeOut`);
5. after the gesture the **Next tag drops in on a string from the top
   edge** and sways (code: `y -100vh -> 0, 2 s Power4.easeInOut`).

Hover states: buttons scale to 0.9 (code: `0.4 s Power2.easeOut`), back to
1 on leave with the same tween; the Next tag swings on its string.

Other code constants worth reusing: in-scene camera moves between points
`1.75 s Power3.easeInOut`; text lines rise into place `0.8 s Power2.easeOut`
with per-line delay; mask progress for a reveal `0.9 s Power4.easeIn` then
`0.8 s Power4.easeInOut` (delay 0.3); hold-to-act fills over `2 s
Power1.easeIn`; long ambient moves `6-8 s linear`.

Easing vocabulary, by frequency in the bundle: Power2.easeOut (11),
Power4.easeInOut (5), Power2.easeInOut (4), Power3.easeInOut (3); CSS uses
one curve, `cubic-bezier(.215,.61,.355,1)` (= Power2.easeOut), 14 times.
**Nothing uses a default `ease`/`ease-in-out`.**

## 4. Typography

- One family, **Gotham**: Bold (700) for scene titles and buttons, Book
  (400) for body.
- **Scene titles are image plates** (`title-1..4.png`): all caps, 2 lines,
  cap height **~45 px at 1440 (5% of the height)**, line pitch ~50 px, set
  flush left at 55 px inside a paper strip 410 x 140 px touching the left
  edge, about 22% down.
- **Subtitles**: Gotham Book **16/24 px**, dark ink on a paper box with a
  1 px rule, ~300-500 px wide, bottom centre-right.
- **Buttons**: Gotham Bold 12-16 px, uppercase (Start, Next).
- **Small print**: Gotham Book 12 px.
- So the scale is tiny body (12 / 16) against huge display (~64 px): a
  **x4 jump**, nothing in between. The contrast is the effect.

## 5. Colour grading (`analysis.json` -> `grading`)

| frame | lum P1 | lum P50 | lum P99 | mean sat | palette (largest first) |
|---|---|---|---|---|---|
| landing | 98 | 102 | 240 | 0.17 | #f0ece3 paper, #5f657d slate |
| title | 75 | 233 | 246 | 0.10 | #f0ece3, #677082, #ece2dc, #93a1aa |
| scene 1 | 66 | 177 | 227 | 0.21 | #c0e4c7 mint, #72a89d teal, #526663 slate, #e0d7cb paper, #a87979 dusty rose |
| scene 2 | 62 | 175 | 240 | 0.15 | #eaccc9 blush, #606575, #acb1c2, #94a1a4 |
| scene 4 | 64 | 221 | 238 | 0.10 | #e4dbd0 sand, #d6e5e9 sky, #685453 |

- **Lifted blacks**: the darkest 1% of pixels sits at luminance **62-66**
  (about #404040). Nothing on screen is ever black.
- **Soft highlights**: P99 at 227-240; only the paper UI reaches 246.
- **Low saturation**: mean 0.10-0.21. Pastel, chalky, with one stronger
  accent per scene (rose rocks, a yellow flower, a pink lily).
- **Paper over everything**: noise / hatching / paper-tile textures are
  multiplied over the WebGL frame and the UI, so flat colour never looks
  digital.
- No lens vignette. Darkening at the edges comes from the art (foreground
  leaves, vines).

## 6. What Terrarium takes (numbers to build with)

Terrarium is scroll-driven (the brief), makemepulse is not, so its
authored transitions are mapped onto scroll like this: each scene has a
**rest** segment where scroll scrubs a gentle camera drift and the mouse
drives the parallax, and crossing into the next scene **plays the authored
transition at its own timing** (scroll input is held, as during
makemepulse's transitions), so a fast flick never shortcuts the craft.
Back-scrolling plays the reverse.

- **Preloader**: a hand-drawn guide path traced by real load progress;
  then one beat of empty (0.6 s); then the opening object pops in with
  expo-out 0.28 s; hover breathes +16% (expo-out 0.28 s), un-hover
  Power4.easeOut 1.6 s.
- **Depth**: >= 6 planes per scene + grain overlay. Parallax per
  half-screen of mouse: far +16 px, pivot 0 at ~62% down, near -15 px,
  foreground -30 to -50 px (at 1440; scale with the viewport width).
  Vertical = a third of horizontal.
- **Cursor lag**: exponential damping, **lambda = 2.2 /s**.
- **Scene enter**: mask or camera move, 1.2-2.1 s, Power3/Power4
  easeInOut; never a plain cross-fade (except for reduced motion).
- **In-scene beats**: subtitle at +0.4 s after settle (letters 18 ms
  apart), title plate mask-wipe ~1.3 s starting +1.1 s, prompt pops in
  0.6 s Power2.easeOut.
- **Hover**: 0.4 s Power2.easeOut, scale 0.9 (buttons).
- **Type**: tiny text (12-17 px) against huge display (~4x), one display
  voice per scene title, set in a plate pinned to an edge.
- **Grading**: darkest pixel ~#14241F (lum ~32, our darker palette's
  equivalent of their 62), P99 <= 240, mean saturation 0.2-0.3, paper grain
  over everything.

## 7. 1920x1080 cross-check (`rec/1920x1080/analysis.json`)

The same script at 1920x1080 (1982 frames over 372 s) agrees:

- **Parallax scales with the viewport width.** Scene 4, centre -> left:
  -19.1, -19.9, -17.6, -14.0, -5.6, +0.3, +10.7, +29.4 px (1440: -15.8 ...
  +24.1), i.e. x1.2-1.25 for x1.33 the width; left -> right: +40 ...
  -66.7 px. Scene 1 foreground: +60 px (1440: +51). So parallax is set in
  **fractions of the viewport width**: far ~1.0-1.1%, foreground ~-1.6 to
  -3.5% per half-screen of mouse.
- **Lag**: 63% at 0.38-0.44 s, 90% at 0.86-1.30 s, so **lambda 2.2-2.6 /s**:
  same camera damping at both sizes.
- **Disc**: radius 0.302 -> 0.370 H on hover (wider frame, bigger disc);
  un-hover expo-out ~1.7 s.
- **Transitions**: the same staging; whole-frame fits are expo-out /
  Power2-4 easeOut over 2.6-3.5 s after a 0.4-1.4 s hold, i.e. **long tails
  that settle softly**: nothing stops abruptly.
- **Grading**: identical (P1 63-65 in scenes, P99 237-239, mean
  saturation 0.10-0.21).
