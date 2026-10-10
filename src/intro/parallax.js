/**
 * Depth planes and the camera that looks at them. makemepulse's scenes are
 * real 3D seen by a camera orbiting a pivot in the midground; we fake that
 * with flat painted planes, so each plane needs the shift a camera would give
 * it: measured in NOTES.md §2/§7 as a fraction of the viewport WIDTH per
 * half-screen of pointer travel. Far planes follow the pointer, the pivot
 * (where the subject stands, ~62% down) stays put, near and frame planes move
 * against it at about twice the far amplitude. Vertical is a third. The
 * pointer is damped with lambda 2.2/s (the measured cursor lag).
 *
 * Every transform the intro writes goes through Plane.write(): parallax +
 * the in-scene dolly + whatever the playing transition asks, composed once per
 * frame into one translate3d/scale, and only written when it changed. No
 * layout is read here: plane centres are measured on resize.
 */
import { damp } from '../core/ease.js';

/** px: parallax fraction of W per half-screen; dolly/drift: in-scene camera move at progress 1 */
export const DEPTHS = {
  far: { px: 0.011, dolly: 0.03, drift: 0.008 },
  mid: { px: 0.004, dolly: 0.05, drift: 0.016 },
  pivot: { px: 0, dolly: 0.065, drift: 0.022 },
  fx: { px: -0.008, dolly: 0.085, drift: 0.034 },
  near: { px: -0.015, dolly: 0.11, drift: 0.046 },
  close: { px: -0.03, dolly: 0.17, drift: 0.07 },
  text: { px: 0, dolly: 0, drift: 0 },
};

export const POINTER_LAMBDA = 2.2;
export const PIVOT_Y = 0.62;

/** pointer offset (nx, ny in -1..1 = half-screen travel) → plane shift in px */
export function parallaxOffset(depth, nx, ny, W) {
  const k = DEPTHS[depth]?.px ?? 0;
  return [k * nx * W, (k * ny * W) / 3];
}

/** the scroll-scrubbed dolly inside a scene's rest segment: near planes move more than far ones */
export function dollyAt(depth, p) {
  const d = DEPTHS[depth] || DEPTHS.text;
  return { s: 1 + d.dolly * p, y: -d.drift * p };
}

/**
 * The damped pointer. On touch there is no hover, so it drifts on its own:
 * an 8 s sine at a third of the amplitude (intro-brief.md).
 */
export function createPointer({ idle = false } = {}) {
  const p = { x: 0, y: 0, tx: 0, ty: 0, idle, moved: 0 };
  p.move = (cx, cy, W, H) => {
    p.tx = Math.max(-1, Math.min(1, (cx - W / 2) / (W / 2)));
    p.ty = Math.max(-1, Math.min(1, (cy - H / 2) / (H / 2)));
    p.moved = performance.now();
  };
  p.update = (dt, t) => {
    if (p.idle) {
      const w = (2 * Math.PI * t) / 8;
      p.tx = Math.sin(w) / 3;
      p.ty = Math.sin(w * 0.5 + 1.1) / 3;
    }
    p.x = damp(p.x, p.tx, POINTER_LAMBDA, dt);
    p.y = damp(p.y, p.ty, POINTER_LAMBDA, dt);
  };
  return p;
}

/** a transition's per-frame request for one plane; reset to identity every frame */
export const identity = () => ({ x: 0, y: 0, s: 1, o: 1, fx: null, fy: null });

/**
 * One moving element. cx/cy are its untransformed centre in viewport px
 * (measured on resize). A transition's scale happens about (fx, fy), the
 * dolly's about the pivot point, both folded into one translate + scale
 * about the element's own centre.
 */
export function createPlane(el, depth) {
  const plane = { el, depth, cx: 0, cy: 0, mod: identity(), last: '', lastO: '' };
  plane.measure = () => {
    plane.cx = el.offsetLeft + el.offsetWidth / 2;
    plane.cy = el.offsetTop + el.offsetHeight / 2;
  };
  plane.reset = () => { const m = plane.mod; m.x = 0; m.y = 0; m.s = 1; m.o = 1; m.fx = null; m.fy = null; };
  /** cam = { nx, ny, p, W, H, still } */
  plane.write = (cam) => {
    const { W, H } = cam;
    const m = plane.mod;
    let tx = 0, ty = 0, s = 1;
    if (!cam.still) {
      const d = dollyAt(depth, cam.p);
      // dolly: scale about the pivot point, then drift up
      const px = W / 2, py = H * PIVOT_Y;
      const c1x = px + (plane.cx - px) * d.s;
      const c1y = py + (plane.cy - py) * d.s + d.y * H;
      s = d.s;
      // transition: scale about its focus, then translate
      const fx = m.fx ?? W / 2, fy = m.fy ?? H / 2;
      const c2x = fx + (c1x - fx) * m.s + m.x;
      const c2y = fy + (c1y - fy) * m.s + m.y;
      s *= m.s;
      const [ox, oy] = parallaxOffset(depth, cam.nx, cam.ny, W);
      tx = c2x - plane.cx + ox;
      ty = c2y - plane.cy + oy;
    }
    // reduced motion: no transforms at all, only opacity
    const t = cam.still ? '' : `translate3d(${tx.toFixed(2)}px,${ty.toFixed(2)}px,0) scale(${s.toFixed(4)})`;
    if (t !== plane.last) { el.style.transform = t; plane.last = t; }
    const o = m.o >= 0.999 ? '' : m.o.toFixed(3);
    if (o !== plane.lastO) { el.style.opacity = o; plane.lastO = o; }
  };
  return plane;
}
