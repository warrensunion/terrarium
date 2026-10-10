/**
 * The four authored scene changes, one per boundary (intro-brief.md, NOTES.md
 * §3). makemepulse never cross-fades: every change is a camera move or a
 * mask, played at its own timing whatever the scroll speed. Each transition
 * is a PURE function of time t (seconds): it writes requests into the planes'
 * `mod` objects (reset every frame) and says which scene shows. Purity is
 * what makes back-scrolling free: playing t from dur down to 0 is the exact
 * reverse.
 *
 * A = the earlier scene, B = the later one, whichever way we travel.
 * ui = stage overlays: shade (the leaf mass), fog (a flat fog wash).
 */
import { seg, p1inOut, p2in, p2out, p2inOut, p3in, p3out, p3inOut, p4out, lerp } from '../core/ease.js';

const ROLES = ['far', 'mid', 'pivot', 'fx', 'near', 'closeL', 'closeR'];
/** the fog sheet (intro.css .in-fog, 230vh, soft at both ends): y offsets in viewport heights */
const FOG_COVER = -0.345, FOG_ABOVE = -2.3, FOG_BELOW = 1.05;

/** how far each plane travels in a vertical camera move, in viewport heights */
const DEPTH_TRAVEL = { far: 0.22, mid: 0.42, pivot: 0.6, fx: 0.75, near: 0.95, closeL: 1.25, closeR: 1.25 };

function each(scene, fn) { for (const r of ROLES) if (scene.planes[r]) fn(scene.planes[r].mod, r, scene.planes[r]); }

/** 1 → 2: push into the foliage. Leaves close over the frame (1.2 s Power3.easeIn), cut, new leaves open (1.3 s Power3.easeOut). */
const foliage = {
  dur: 2.5,
  run(t, A, B, ui, { W, H }) {
    const close = seg(t, 0, 1.2, p3in);
    const open = seg(t, 1.2, 1.3, p3out);
    const cut = t >= 1.2;
    const push = (scene, k) => {
      each(scene, (m, r) => {
        const s = { far: 0.06, mid: 0.16, pivot: 0.24, fx: 0.4, near: 0.42, closeL: 2.5, closeR: 2.5 }[r];
        m.s = 1 + s * k;
        // camera pushes toward the subject's feet
        m.fx = W * 0.55; m.fy = H * 0.62;
        if (r === 'closeL') { m.fx = 0; m.fy = H * 0.7; m.x = W * 0.1 * k; }
        if (r === 'closeR') { m.fx = W; m.fy = H * 0.35; m.x = -W * 0.1 * k; }
      });
    };
    if (!cut) push(A, close); else push(B, 1 - open);
    // the dark leaf mass that seals the frame at the cut, gone as the new leaves part
    ui.shade.o = cut ? 1 - seg(t, 1.2, 0.6, p2out) : seg(t, 0.55, 0.65, p2in);
    A.copy.o = 1 - seg(t, 0, 0.35, p2out);
    return { a: !cut, b: cut };
  },
};

/** 2 → 3: tilt up into the fog. Planes slide down at their depth speeds while the frame fills with fog (1.0 s Power3.easeInOut), then scene 3 rises in under it (1.1 s Power2.easeOut). */
const fogTilt = {
  dur: 2.1,
  run(t, A, B, ui, { H }) {
    const up = seg(t, 0, 1.0, p3inOut);
    const rise = seg(t, 1.0, 1.1, p2out);
    const cut = t >= 1.0;
    if (!cut) each(A, (m, r) => { m.y = up * H * DEPTH_TRAVEL[r]; });
    else each(B, (m, r) => { m.y = (1 - rise) * H * DEPTH_TRAVEL[r] * 0.7; });
    // fog sheet: comes down from above, covers, then thins out downward
    ui.fog.y = (cut ? lerp(FOG_COVER, 0.35, rise) : lerp(FOG_ABOVE, FOG_COVER, up)) * H;
    ui.fog.o = cut ? 1 - seg(t, 1.0, 1.0, p2inOut) : 1;
    A.copy.o = 1 - seg(t, 0, 0.35, p2out);
    return { a: !cut, b: cut };
  },
};

/** 3 → 4: descent. Scene 4's planes rise into place from below, far first, each 0.9 s Power4.easeOut, ~0.3 s apart, over the fading scene 3. */
const STAGGER = { far: 0, mid: 0.3, pivot: 0.6, fx: 0.6, near: 0.9, closeL: 1.2, closeR: 1.2 };
const descent = {
  dur: 2.1,
  run(t, A, B, ui, { H }) {
    const sink = seg(t, 0, 1.1, p2in);
    each(A, (m, r) => { m.y = -sink * H * DEPTH_TRAVEL[r] * 0.35; });
    A.root.o = 1 - seg(t, 0.15, 0.9, p1inOut);
    each(B, (m, r) => {
      const k = seg(t, STAGGER[r], 0.9, p4out);
      m.y = (1 - k) * H * (1.05 + DEPTH_TRAVEL[r] * 0.25);
    });
    // a veil of fog passing upward as the camera sinks through it
    const veil = seg(t, 0, 1.4);
    ui.fog.y = lerp(FOG_BELOW, FOG_ABOVE, veil) * H;
    ui.fog.o = 0.55 * Math.sin(Math.PI * veil);
    A.copy.o = 1 - seg(t, 0, 0.35, p2out);
    return { a: t < 1.2, b: true };
  },
};

/** 4 → 5: page turn. Scene 4 shrinks into a card on paper (0.88, 0.55 s Power2.easeInOut), slides off upward (0.6 s Power3.easeIn), scene 5 drops in from the top (1.0 s Power4.easeOut). */
const pageTurn = {
  dur: 2.05,
  run(t, A, B, ui, { H }) {
    const shrink = seg(t, 0, 0.55, p2inOut);
    const lift = seg(t, 0.55, 0.6, p3in);
    const drop = seg(t, 1.05, 1.0, p4out);
    A.root.s = 1 - 0.12 * shrink;
    A.root.y = -lift * H * 1.08;
    A.root.card = shrink;
    B.root.y = -(1 - drop) * H * 1.06;
    B.root.card = 1 - seg(t, 1.6, 0.45, p2out);
    A.copy.o = 1 - seg(t, 0, 0.3, p2out);
    return { a: t < 1.15, b: t >= 1.05 };
  },
};

export const TRANSITIONS = [foliage, fogTilt, descent, pageTurn];

/** reduced motion: a plain 400 ms cross-fade, no transforms */
export const crossFade = {
  dur: 0.4,
  run(t, A, B) {
    const k = seg(t, 0, 0.4);
    A.root.o = 1 - k;
    B.root.o = k;
    return { a: k < 1, b: k > 0 };
  },
};

/** scene 5's exit: the jar comes toward the camera until its glass fills the frame (1.2 s Power3.easeInOut) */
export const pushIn = {
  dur: 1.2,
  run(t, A, B, ui, { W, H, jar }) {
    const k = seg(t, 0, 1.2, p3inOut);
    const S = { far: 0.25, mid: 0.9, pivot: 4.2, fx: 1.6, near: 1.9, closeL: 3, closeR: 3 };
    each(A, (m, r) => {
      m.s = 1 + S[r] * k;
      m.fx = jar ? jar[0] : W * 0.62;
      m.fy = jar ? jar[1] : H * 0.5;
      if (r === 'near' || r === 'closeL' || r === 'closeR') m.o = 1 - seg(t, 0.2, 0.6);
    });
    A.copy.o = 1 - seg(t, 0, 0.3, p2out);
    ui.fog.y = FOG_COVER * H;
    ui.fog.o = seg(t, 0.62, 0.58, p2in);
    return { a: true, b: false };
  },
};

/** reduced motion's exit to the jar: no push, the fog simply fills the frame (400 ms) */
export const fogFade = {
  dur: 0.4,
  run(t, A, B, ui, { H }) {
    ui.fog.y = FOG_COVER * H;
    ui.fog.o = seg(t, 0, 0.4);
    return { a: true, b: false };
  },
};
