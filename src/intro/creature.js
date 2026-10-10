/**
 * Creatures assembled from painted part sheets (sp-<species>-0..6: head,
 * three body segments, two legs, tail), laid along a spine by code. This is
 * the intro's way of showing the real thing: genes decide how many segments,
 * how long the legs, how big and what colour, and the body is rebuilt live.
 *
 * Drawn on a 2D canvas rather than as DOM parts: one canvas per scene keeps
 * the DOM small and lets legs swing every frame without restyling twenty
 * elements. Colour genes are a CSS-style filter (hue-rotate, saturate,
 * contrast) baked into cached sprites only when the gene changes, so a frame
 * costs a few drawImage calls. Browsers without ctx.filter keep the painted
 * colour.
 */
import { load } from './assets.js';

/**
 * Local frame: every species faces LEFT (lichen's art faces right, so it is
 * mirrored). Units: 1 = the first body segment's height.
 */
const SPECIES = {
  violet: { flip: false, head: { h: 1.08, dx: 0.12, dy: -0.08 }, segH: [1, 0.9, 0.76], tail: { h: 0.62, dy: 0.12 }, leg: 1.05, overlap: 0.4, hip: 0.3 },
  salmon: { flip: false, head: { h: 0.95, dx: 0.3, dy: -0.06, crop: [0, 0, 0.64, 1] }, segH: [1, 0.98, 0.9], tail: { h: 1.25, dy: 0.02, dx: -0.12 }, leg: 1.25, overlap: 0.42, hip: 0.22 },
  lichen: { flip: true, head: { h: 1.0, dx: 0.1, dy: -0.06 }, segH: [1, 0.96, 1.0], tail: { h: 0.62, dy: 0.1 }, leg: 0.9, overlap: 0.5, hip: 0.3 },
};

export const DEFAULT_GENES = { segments: 3, legs: 1, size: 1, hue: 0, sat: 1, contrast: 1 };

export async function loadSpecies(name) {
  const imgs = await Promise.all([0, 1, 2, 3, 4, 5, 6].map((i) => load(`sp-${name}-${i}`)));
  return { name, imgs, spec: SPECIES[name] };
}

const canFilter = typeof document !== 'undefined' && 'filter' in (document.createElement('canvas').getContext('2d') || {});

function bake(img, filter, crop, mirror = false) {
  if (!img) return null;
  const sx = crop ? crop[0] * img.naturalWidth : 0, sy = crop ? crop[1] * img.naturalHeight : 0;
  const sw = crop ? crop[2] * img.naturalWidth : img.naturalWidth, sh = crop ? crop[3] * img.naturalHeight : img.naturalHeight;
  // half resolution is plenty at intro sizes, and baking is 4x cheaper
  const k = 0.5;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(sw * k));
  c.height = Math.max(1, Math.round(sh * k));
  const x = c.getContext('2d');
  if (canFilter && filter) x.filter = filter;
  if (mirror) { x.translate(c.width, 0); x.scale(-1, 1); }
  x.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return c;
}

/** the colour genes as a filter string, quantised so scrubbing does not rebake every frame */
export function geneFilter(g, extra = '') {
  const h = Math.round(g.hue / 4) * 4;
  const s = Math.round(g.sat * 20) / 20;
  const c = Math.round(g.contrast * 20) / 20;
  return `hue-rotate(${h}deg) saturate(${s}) contrast(${c})${extra ? ' ' + extra : ''}`;
}

export function createCreature(kit, genes = {}) {
  const { spec, imgs } = kit;
  const g = { ...DEFAULT_GENES, ...genes };
  let baked = null, bakedKey = '';
  let facing = -1, face = -1; // -1 = looking left (art's own direction)

  function sprites() {
    const key = geneFilter(g);
    if (key === bakedKey && baked) return baked;
    bakedKey = key;
    const m = spec.flip; // lichen is painted facing right: mirror each part, not the layout
    baked = {
      head: bake(imgs[0], key, spec.head.crop, m),
      segs: [bake(imgs[1], key, null, m), bake(imgs[2], key, null, m), bake(imgs[3], key, null, m)],
      legs: [bake(imgs[4], key, null, m), bake(imgs[5], key, null, m)],
      farLegs: [bake(imgs[4], geneFilter(g, 'brightness(0.62)'), null, m), bake(imgs[5], geneFilter(g, 'brightness(0.62)'), null, m)],
      tail: bake(imgs[6], key, null, m),
    };
    return baked;
  }

  /** segment layout along the spine, head first, in units */
  function layout(sp) {
    const n = Math.max(2, Math.min(7, Math.round(g.segments)));
    const segs = [];
    let x = 0;
    const headW = sp.head ? (sp.head.width / sp.head.height) * spec.head.h : 1;
    let prevW = headW, prevX = 0;
    for (let i = 0; i < n; i++) {
      // first, middles, last: taper from the first sheet to the last
      const which = i === 0 ? 0 : i === n - 1 ? 2 : 1;
      const img = sp.segs[which];
      const taper = n === 1 ? 1 : 1 - (0.22 * i) / (n - 1);
      const h = spec.segH[which] * taper;
      const w = img ? (img.width / img.height) * h : h * 1.3;
      x = prevX + (prevW / 2 + w / 2) * (1 - spec.overlap);
      segs.push({ x, h, w, img });
      prevW = w; prevX = x;
    }
    const tailImg = sp.tail;
    const th = spec.tail.h;
    const tw = tailImg ? (tailImg.width / tailImg.height) * th : th;
    const tailX = prevX + (prevW / 2 + tw / 2) * (1 - spec.overlap) + (spec.tail.dx || 0);
    return { segs, headW, tail: { x: tailX, w: tw, h: th }, length: tailX + tw / 2 + headW / 2 };
  }

  return {
    genes: g,
    set(next) { Object.assign(g, next); },
    get length() { return layout(sprites()).length * this.scaleOf(1); },
    scaleOf(u) { return u * (0.75 + 0.5 * (g.size - 0.8)); },
    /** turn smoothly: the body squashes through its own width, like turning round */
    face(dir) { facing = dir < 0 ? -1 : 1; },
    /**
     * Draw standing on the ground point (x, y). unit = px per segment height
     * at size 1. walk = stride phase in radians; speed 0..1 scales the swing.
     */
    draw(ctx, x, y, unit, { walk = 0, speed = 1, dt = 0.016, alpha = 1 } = {}) {
      const sp = sprites();
      if (!sp.segs[0]) return;
      face += (facing - face) * (1 - Math.exp(-9 * dt));
      const u = unit * (0.75 + 0.5 * (g.size - 0.8));
      const L = layout(sp);
      const legLen = spec.leg * g.legs;
      const bodyY = -(legLen * 0.62 + 0.42); // spine height above the ground, in units
      const bob = Math.sin(walk * 2) * 0.025 * speed;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(x, y);
      ctx.scale(-u * face, u);
      ctx.translate(-L.length / 2 + L.headW / 2, bodyY + bob);

      const legAt = (seg, i, far) => {
        const img = (far ? sp.farLegs : sp.legs)[i % 2];
        if (!img) return;
        const swing = Math.sin(walk + i * 1.9 + (far ? Math.PI : 0)) * 0.42 * speed;
        const lh = legLen;
        const lw = (img.width / img.height) * lh;
        ctx.save();
        ctx.translate(seg.x + (far ? 0.08 : -0.04), seg.h * spec.hip);
        ctx.rotate(swing);
        ctx.drawImage(img, -lw * 0.45, -0.06, lw, lh);
        ctx.restore();
      };
      // far legs, tail, body tail-to-head, near legs, head on top
      L.segs.forEach((s, i) => legAt(s, i, true));
      if (sp.tail) ctx.drawImage(sp.tail, L.tail.x - L.tail.w / 2, -L.tail.h / 2 + spec.tail.dy, L.tail.w, L.tail.h);
      for (let i = L.segs.length - 1; i >= 0; i--) {
        const s = L.segs[i];
        if (s.img) ctx.drawImage(s.img, s.x - s.w / 2, -s.h / 2 + Math.sin(walk * 2 + i) * 0.012 * speed, s.w, s.h);
      }
      L.segs.forEach((s, i) => legAt(s, i, false));
      if (sp.head) {
        const hh = spec.head.h, hw = L.headW;
        ctx.drawImage(sp.head, -hw / 2 + spec.head.dx, -hh / 2 + spec.head.dy, hw, hh);
      }
      ctx.restore();
    },
  };
}
