/**
 * Scene 2's living part: the bead strand is a genome, the violet creature is
 * its body. Scrolling through the scene walks along the strand changing one
 * gene at a time; hovering or tapping a bead nudges that gene directly. The
 * body is rebuilt from parts every frame, so the visitor sees cause and
 * effect, which is the whole point of the scene.
 */
import { seg, lerp, damp } from '../core/ease.js';
import { layerImg } from './assets.js';
import { loadSpecies, createCreature } from './creature.js';

/** bead centres in gene-strand.webp (1536 x 260), measured from its alpha */
const BEADS = [[97, 91], [221, 67], [350, 101], [468, 156], [586, 193], [711, 189], [826, 146], [946, 106], [1071, 83], [1197, 87], [1317, 125], [1442, 161]];
const GENES = [
  { key: 'segments', name: 'segments', presets: [2, 4, 7], show: (v) => `${Math.round(v)} segments` },
  { key: 'legs', name: 'leg length', presets: [0.7, 1.1, 1.6], show: (v) => `legs ${v.toFixed(1)}×` },
  { key: 'size', name: 'size', presets: [0.8, 1.0, 1.3], show: (v) => `size ${v.toFixed(1)}×` },
  { key: 'hue', name: 'colour', presets: [0, 70, 200], show: (v) => `colour ${v >= 0 ? '+' : ''}${Math.round(v)}°` },
  { key: 'sat', name: 'colour strength', presets: [0.55, 1, 1.45], show: (v) => `strength ${v.toFixed(1)}` },
  { key: 'contrast', name: 'markings', presets: [0.85, 1, 1.3], show: (v) => `markings ${v.toFixed(1)}` },
];

/** the choreographed path scroll takes through gene space */
export function genesAt(p) {
  return {
    segments: lerp(3, 6, seg(p, 0.02, 0.26)),
    legs: lerp(0.8, 1.45, seg(p, 0.24, 0.24)),
    size: lerp(0.85, 1.2, seg(p, 0.46, 0.24)),
    hue: lerp(0, 120, seg(p, 0.68, 0.28)),
    sat: 1,
    contrast: 1,
  };
}
const activeAt = (p) => (p < 0.24 ? 0 : p < 0.46 ? 1 : p < 0.68 ? 2 : 3);

export function createGenes(host, { reduced }) {
  const strand = document.createElement('div');
  strand.className = 'in-strand';
  const art = layerImg('gene-strand', 'in-strand-art');
  strand.append(art.img);
  const beads = BEADS.map(([x, y], i) => {
    const g = GENES[i % 6];
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'in-bead';
    b.style.left = (x / 1536) * 100 + '%';
    b.style.top = (y / 260) * 100 + '%';
    b.setAttribute('aria-label', `Change the ${g.name} gene`);
    b.dataset.gene = String(i % 6);
    strand.append(b);
    return b;
  });
  const canvas = document.createElement('canvas');
  canvas.className = 'in-canvas in-genes-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'A violet creature whose body changes as its genes change');
  const readout = document.createElement('p');
  readout.className = 'in-readout';
  host.append(strand, canvas, readout);
  const ctx = canvas.getContext('2d');

  let kit = null, creature = null;
  const ready = Promise.all([art.ready, loadSpecies('violet').then((k) => { kit = k; creature = createCreature(k, genesAt(0)); })]);

  const shown = { ...genesAt(0) };
  const override = {};
  let overrideP = null, lastP = 0, presetIx = [1, 1, 1, 0, 1, 1];
  let hoverAt = 0, W = 0, H = 0, dpr = 1, walk = 0, active = -1, lastText = '';

  const bump = (gi) => {
    presetIx[gi] = (presetIx[gi] + 1) % 3;
    override[GENES[gi].key] = GENES[gi].presets[presetIx[gi]];
    overrideP = lastP;
    pulse(gi);
  };
  const pulse = (gi) => {
    for (const b of beads) b.classList.toggle('is-on', Number(b.dataset.gene) === gi);
  };
  const onEnter = (e) => {
    if (e.pointerType !== 'mouse') return;
    hoverAt = performance.now();
    bump(Number(e.currentTarget.dataset.gene));
  };
  const onClick = (e) => {
    if (performance.now() - hoverAt < 400) return; // the hover already changed it
    bump(Number(e.currentTarget.dataset.gene));
  };
  for (const b of beads) { b.addEventListener('pointerenter', onEnter); b.addEventListener('click', onClick); }

  return {
    ready,
    resize() {
      dpr = Math.min(devicePixelRatio || 1, 2);
      W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    },
    update(dt, t, p) {
      if (!creature || !W) return;
      lastP = p;
      if (overrideP !== null && Math.abs(p - overrideP) > 0.05) { for (const k in override) delete override[k]; overrideP = null; }
      const target = { ...genesAt(p), ...override };
      for (const k in target) shown[k] = reduced ? target[k] : damp(shown[k], target[k], 6, dt);
      creature.set(shown);
      const a = overrideP === null ? activeAt(p) : active;
      if (a !== active) { active = a; pulse(a); }
      const text = GENES.slice(0, 4).map((g) => g.show(shown[g.key])).join('  ·  ');
      if (text !== lastText) { readout.textContent = text; lastText = text; }

      walk += dt * (reduced ? 0 : 3.2);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const unit = Math.min(W / 7.2, H / 2.7);
      const gy = H * 0.86;
      // soft contact shadow
      const sw = creature.length * unit * 0.5;
      const grd = ctx.createRadialGradient(W / 2, gy, 0, W / 2, gy, sw);
      grd.addColorStop(0, 'rgba(31,58,51,0.28)');
      grd.addColorStop(1, 'rgba(31,58,51,0)');
      ctx.fillStyle = grd;
      ctx.save(); ctx.translate(W / 2, gy); ctx.scale(1, 0.14); ctx.translate(-W / 2, -gy);
      ctx.beginPath(); ctx.arc(W / 2, gy, sw, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      creature.draw(ctx, W / 2, gy, unit, { walk, speed: reduced ? 0 : 0.8, dt });
    },
    destroy() {
      for (const b of beads) { b.removeEventListener('pointerenter', onEnter); b.removeEventListener('click', onClick); }
    },
    get kit() { return kit; },
  };
}
