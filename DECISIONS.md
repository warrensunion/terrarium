# Decisions

One line each: the decision, and why. Newest at the bottom.

- Brainstorming questions answered by me, not Warren — he asked for full autonomy; answers are in `docs/spec.md` §2.
- Spec saved to `docs/spec.md` (not `docs/superpowers/specs/`) — Warren named that path.
- One page with hash routes `#/`, `#/live`, `#/about` — no reload between the intro and the jar, and the static host needs no rewrites.
- Five intro scenes (world, genes→body, brain→behaviour, generations→species, open the lid) — the brief's 4–6, one per idea plus a title and a hand-off.
- Intro is DOM + CSS transforms on WebP cut-outs, not WebGL — layered parallax is what makemepulse-style depth needs, and it keeps three.js out of the first load.
- NEAT brains run on the CPU in the worker; WebGPU compute does the O(N·M) sensing — per-creature topologies don't map to GPU kernels, the nearest-neighbour search does.
- CPU fallback is a uniform-grid spatial hash, not WebGL2 GPGPU — WebGL2 has no compute and texture-ping-pong readback would cost more than the hash saves at 500–2000 creatures.
- Sim is a seeded 2D world on a unit disc, rendered onto 3D terrain — keeps the maths testable and deterministic; height is only visual.
- NEAT activation is one recurrent step per tick — allows loops and lets the brain panel show signals travelling.
- Fitness for crossover = energy gathered over the lifetime — the only thing the world actually rewards.
- Asexual budding as a population floor (60) — a crash to zero would end the show; the floor keeps evolution going.
- Main thread interpolates between the last two worker snapshots — smooth rendering at any sim speed.
- Copied `cutout.mjs` and `sheet-boxes.mjs` from BTTRURSLF-v2 unchanged — Warren allowed it and they are tuned for ChatGPT cut-outs.
- Art generated through ChatGPT via the codex CLI (`gpt-image-bridge` skill, Warren's ChatGPT Plus login), not the chatgpt.com web UI — the built-in browser is signed out of ChatGPT (signing in for him is off-limits) and Claude in Chrome was not connected; same account and image model, prompts logged the same way.
- `design-taste-frontend` and `image-to-code` skills are not installed here — used `frontend-design` for direction and did image-to-code by hand: two design comps generated first (`art-src/gen/comp-*.png`), then built to match.
- Display face IM Fell English + text face Hanken Grotesk, self-hosted — a letterpress specimen-book voice fits a naturalist's jar and avoids the overused display serifs; both OFL.
- Palette celadon fog / deep moss / lichen / beetle violet / spore cyan / peat / salmonberry — a glasshouse palette that avoids the cream+terracotta and black+acid-accent defaults.
- Playwright pinned to 1.63.0 — the newer default needs browser builds that are not installed; 1.63.0 matches the installed Chromium (as in BTTRURSLF-v2).
- makemepulse measured with CDP screencast frames (compositor timestamps) instead of screenshots — screenshots are too slow to read easing curves.
- Intro maps scroll onto makemepulse's authored transitions (scroll scrubs a drift within a scene, crossing a boundary plays the timed transition) — makemepulse has no scroll at all; scrubbing their transitions 1:1 would let a flick skip the craft.
- PNG measuring/keying tools written in plain node (`art-src/tools/png.mjs`) — no image library dependency.
- Population capped at 1000 births-wise (`POP_CAP`, buffers stay 2000) — evolved creatures get efficient and a jar grows past 1400, where leg IK for every creature costs most of a laptop frame; 1000 also still reads as individuals.
- Default food rate 1.3 (slider 0–3) — at 1.0 the first die-off dips to 320–430 creatures; 1.3 keeps it above 500 (measured, two seeds).
- Raised Vite's chunk-size warning to 750 kB — the only large chunk is three.js (181 kB gzip), lazy-loaded for the jar and prefetched during the intro.
- `web-design-guidelines` skill is not installed — ran the audit by hand against the Web Interface Guidelines checklist (docs/audit.md).
