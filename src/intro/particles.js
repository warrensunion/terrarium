/**
 * Drifting spores, pollen and seed fluff: the air in the glasshouse. Small
 * DOM sprites moved only by transform, so they composite without repainting
 * (a full-screen canvas would redraw 2 million pixels a frame to move twenty
 * dots). A few are big and soft-focused, as if close to the lens.
 */
import { layerImg } from './assets.js';

let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

export function createParticles(container, names, { count = 14, rise = 0.018 } = {}) {
  const items = [];
  for (let i = 0; i < count; i++) {
    const near = i < 2; // two out-of-focus ones close to the lens
    const { img, ready } = layerImg(names[i % names.length], 'in-mote' + (near ? ' in-mote-near' : ''));
    const size = near ? 70 + rnd() * 40 : 14 + rnd() * 30;
    img.style.width = size.toFixed(0) + 'px';
    container.append(img);
    const a = near ? 0.5 : 0.55 + rnd() * 0.45;
    img.style.opacity = a.toFixed(2);
    items.push({
      img, ready, size,
      x: rnd(), y: rnd(),
      vy: (rise * (0.5 + rnd())) * (near ? 1.6 : 1),
      sway: 0.004 + rnd() * 0.012, f: 0.15 + rnd() * 0.3, ph: rnd() * 6.28,
      spin: (rnd() - 0.5) * 30, last: '',
    });
  }
  return {
    ready: Promise.all(items.map((i) => i.ready)),
    /** W, H: container size in px (cached by the caller) */
    update(dt, t, W, H) {
      for (const p of items) {
        p.y -= p.vy * dt;
        if (p.y < -0.08) { p.y = 1.08; p.x = rnd(); }
        const x = (p.x + Math.sin(t * p.f + p.ph) * p.sway) * W;
        const y = p.y * H;
        const tf = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) rotate(${(p.spin * Math.sin(t * 0.3 + p.ph)).toFixed(1)}deg)`;
        if (tf !== p.last) { p.img.style.transform = tf; p.last = tf; }
      }
    },
  };
}
