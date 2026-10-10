# Final audit: web interface guidelines

The `web-design-guidelines` skill is not installed in this environment, so
this audit was run by hand against the Web Interface Guidelines checklist
(keyboard, focus, forms and controls, motion, layout, content, images,
performance, navigation, touch, theming). Every finding was either fixed
(commit noted) or recorded with a reason.

## Keyboard and focus

| check | result |
|---|---|
| Every control reachable by Tab, in visual order | pass: intro rail and CTA, HUD (speed radio group with arrows, Environment drawer, Reset), brain panel close and lineage chips, About links |
| Visible focus on every control | pass: `:focus-visible` lichen ring (base.css); headings that take programmatic focus hide the ring only for pointer focus |
| Focus moves where content changes | fixed: router focuses the new screen's `h1` after in-page navigation (main.js); intro focuses the new scene heading unless the rail was used; brain panel returns focus to its opener on close |
| Nothing focusable under an overlay | fixed: intro stage is `inert` under the preloader; the closed brain panel is `inert` |
| Esc closes the panel; Space / 1 / 2 / 3 scoped away from inputs, no key-repeat toggling | pass |
| Skip link | pass: "Skip to the jar" in the intro |

## Motion

| check | result |
|---|---|
| `prefers-reduced-motion` honoured, with an override for testing | pass: everything goes through `src/core/env.js` (`?motion=reduce\|full`); intro cross-fades, scene 3 frozen, jar starts paused, camera cuts instead of gliding, HUD/About classes driven from env.js |
| No animation of layout properties | pass: transforms and opacity only; one rAF loop per screen |
| Easing is never the browser default | pass: GSAP Power curves (`src/core/ease.js`, `--e-*`) |

## Layout and responsiveness

| check | result |
|---|---|
| No horizontal scroll from 390 px | pass at 390, 1440, 1920 (shoot.mjs fails on overflow); HUD dock also checked at 360 |
| Safe areas | pass: `viewport-fit=cover`, live nav uses `env(safe-area-inset-bottom)` |
| Zoom never blocked | fixed: no `user-scalable=no`; intro stage `touch-action: pinch-zoom`, two fingers stop the scrub |
| Long headings | fixed: `text-wrap: balance` on headings, `pretty` on paragraphs; scene titles at most 2 lines |

## Content and typography

| check | result |
|---|---|
| `lang`, title, description, theme colour, favicon | fixed: per-screen `document.title`; `public/favicon.svg` added |
| Typographic quotes and apostrophes | fixed in the WebGL fallback copy |
| Tabular numbers for changing figures | pass: HUD, panel stats |
| Sentence case, no all-caps labels, no arrows on buttons, no middle-dot meta strings | pass (scene 2 readout and page titles changed to avoid middle dots) |
| Fonts self-hosted with `font-display: swap` and preloaded | pass |

## Images and media

| check | result |
|---|---|
| Decorative images have empty `alt`, meaningful ones describe the content | pass: intro layers `alt=""`; the fallback and About jar have descriptive alt |
| Intrinsic sizes to avoid layout shift | pass on `<img>` with fixed layout; intro layers are absolutely positioned planes |
| Images decoded before shown, missing files never show a broken icon | pass |

## Errors, empty states, fallbacks

| check | result |
|---|---|
| No WebGL | pass: painting of the jar, the reason in plain words, links on |
| Worker fails / sim error | pass: an alert in the jar says what happened and what to do |
| Lazy chunk fails to load | fixed: the router shows a "could not load, reload" message; the preloader dismisses itself if the intro chunk fails |
| Empty river before the first census | pass: "Waiting for the first census" |

## Performance

| check | result |
|---|---|
| Heavy code lazy-loaded | pass: three.js only for `#/live`, prefetched while the intro plays (live chunk too) |
| 60 fps targets | see the final report and `design-reference/shots/*/report.json`: jar 60 fps at 1x and 16x at 1440 and 1920 with 500+ creatures; our main-thread work measured per frame |
| Work stops when hidden | pass: no step requests from a hidden tab; dt clamped to 100 ms |

## Known, accepted

- The brain legend's 12 px text sits at about 44% fog on dark glass:
  borderline contrast. It is a legend for a canvas and the same words
  label the nodes at full contrast.
- Not tested in Safari or Firefox (no browsers installed here). The
  scene 2 colour gene uses `ctx.filter`, which Safari supports from 18.
