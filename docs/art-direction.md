# Terrarium — art direction

Fixed before any image was generated. Every ChatGPT prompt starts with the
**preamble** below, word for word, so all images match.

## Idea

A naturalist's specimen plate come to life. The jar is a glass vitrine in a
quiet room at the end of the afternoon: celadon fog, wet moss, a warm shaft of
light through the glass. The creatures are small, soft, toy-like gouache
animals, readable as species by colour and silhouette. The one bold thing
is the jar; everything around it stays quiet.

Rejected defaults (frontend-design's calibration list): cream paper +
terracotta accent; near-black + acid accent; newspaper rules; SaaS cards.
makemepulse's own look (ink outlines, pastel lilac, Gotham) is not borrowed:
we paint without outlines, in a green-grey glasshouse palette, with a
serif display.

## Palette

| name | hex | role |
|---|---|---|
| Fog glass | `#C9D8D2` | page ground, intro sky, glass tint |
| Deep moss | `#1F3A33` | ink: text, dark UI, shadows |
| Lichen | `#D6C35A` | food, energy, the warm key light |
| Beetle violet | `#6B4FA0` | brains: nodes, edges, inspect UI |
| Spore cyan | `#5FE3D8` | a neuron firing (only ever lit, never flat fill) |
| Peat | `#3B2E26` | soil, the jar's cork |
| Salmonberry | `#F07A8C` | mating, birth, one creature species |

Grading: lifted blacks (darkest pixel ≈ `#14241F`, never pure black), warm
highlights (`#FFF4D6`), cool shadows; a soft vignette (≈ 18% at the corners)
and 3–4% film grain over everything, as makemepulse grades its frames.

## Type

- **Display:** IM Fell English (OFL), regular and italic — letterpress
  specimen-book voice for scene titles and the wordmark. Never below 28 px.
- **Text and UI:** Hanken Grotesk (OFL, variable 300–700) — body copy,
  HUD, numbers (`font-variant-numeric: tabular-nums`).
- Scale (1440 wide, ratio 1.333, base 17 px): 17 / 22.7 / 30.2 / 40.3 /
  53.7 / 71.6 / 95.5. Titles clamp down to 40 px at 390 wide.
- Sentence case everywhere. No all-caps labels, no tracking-out.

## Lighting (for every image)

One warm late-afternoon key light from the upper left, filtered through
glass; a cool blue-green fill from the right; soft ambient occlusion where
things touch; a thin warm rim light on the top-left edges of every subject.

## Preamble (pasted at the top of every prompt)

> Art direction for the project "Terrarium" — keep identical across every
> image: hand-painted gouache illustration with soft visible brush texture
> and a fine paper grain; no ink outlines, shapes are defined by colour and
> light; naturalist field-guide plate, calm and precise. Palette: pale
> celadon fog #C9D8D2, deep moss #1F3A33, lichen yellow #D6C35A, beetle
> violet #6B4FA0, spore cyan #5FE3D8 (glows only), peat brown #3B2E26,
> salmonberry pink #F07A8C. Lighting: one warm late-afternoon key light from
> the upper left filtered through glass, cool blue-green fill from the
> right, soft ambient occlusion, thin warm rim light on upper-left edges.
> Lifted blacks, never pure black. Original design — not in the style of
> any existing studio, film or website. No text, no letters, no logos, no
> watermark, no border, no frame.
