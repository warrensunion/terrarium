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
