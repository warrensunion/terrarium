/**
 * Scene 4's living part: a family tree that grows down the page as you
 * scroll, from one ancestor at the top to three living species walking on
 * the rocks below. Lineages start the same moss colour and drift toward
 * violet, salmon and lichen as they part, the way the genes drift; short dead
 * twigs are the families that did not make it. Seeded, so it is the same
 * tree every visit.
 */
import { clamp, damp, lerp, smooth } from '../core/ease.js';
import { loadSpecies, createCreature } from './creature.js';
import { card } from './brain.js';

const MOSS = [31, 58, 51];
const CLADES = [
  { name: 'violet', rgb: [107, 79, 160], x: 0.17 },
  { name: 'salmon', rgb: [240, 122, 140], x: 0.5 },
  { name: 'lichen', rgb: [176, 156, 52], x: 0.83 },
];

function rng(seed) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** edges as polylines in unit space (x 0..1, y 0..1 top-down), each with a clade (-1 = shared) */
export function buildTree(seed = 11) {
  const r = rng(seed);
  const edges = [];
  const curve = (a, b, clade, w, dead = false) => {
    const pts = [];
    for (let i = 0; i <= 20; i++) {
      const t = i / 20, e = smooth(t);
      pts.push([lerp(a[0], b[0], e), lerp(a[1], b[1], t)]);
    }
    edges.push({ pts, clade, w, dead, y0: a[1], y1: b[1] });
  };
  const root = [0.5, 0.02], split1 = [0.5, 0.2];
  curve(root, split1, -1, 5);
  // first split: violet goes its own way early; salmon and lichen share a while longer
  const left = [0.3, 0.42], right = [0.66, 0.38];
  curve(split1, left, 0, 4);
  curve(split1, right, -2, 4);
  curve(left, [CLADES[0].x, 1], 0, 3);
  curve(right, [0.56, 0.62], 1, 3.4);
  curve(right, [0.78, 0.6], 2, 3.4);
  curve([0.56, 0.62], [CLADES[1].x, 1], 1, 2.6);
  curve([0.78, 0.6], [CLADES[2].x, 1], 2, 2.6);
  // extinct twigs off every main edge
  for (const e of edges.slice()) {
    const n = 1 + Math.floor(r() * 2);
    for (let k = 0; k < n; k++) {
      const at = e.pts[6 + Math.floor(r() * 10)];
      if (at[1] > 0.86) continue;
      const dir = r() < 0.5 ? -1 : 1;
      curve(at, [clamp(at[0] + dir * (0.05 + r() * 0.08), 0.03, 0.97), at[1] + 0.08 + r() * 0.12], e.clade, Math.max(1.2, e.w * 0.45), true);
    }
  }
  return edges;
}

function colourAt(clade, y) {
  const c = clade === -2 ? [(240 + 176) / 2, (122 + 156) / 2, (140 + 52) / 2] : clade >= 0 ? CLADES[clade].rgb : MOSS;
  const k = clamp((y - 0.12) / 0.7, 0, 1) * (clade === -2 ? 0.45 : 1);
  return MOSS.map((m, i) => Math.round(lerp(m, c[i], k)));
}

export function createTree(host, { reduced }) {
  const canvas = document.createElement('canvas');
  canvas.className = 'in-canvas in-tree-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'A family tree growing from one ancestor into three species: violet, salmon and lichen');
  host.append(canvas);
  const ctx = canvas.getContext('2d');
  const edges = buildTree();
  const walkers = [];
  const ready = Promise.all(CLADES.map((c, i) => loadSpecies(c.name).then((k) => {
    walkers[i] = { cr: createCreature(k, { segments: [4, 3, 3][i], legs: [1, 1.1, 0.9][i], size: 0.95 }), x: 0, dir: i === 1 ? 1 : -1, walk: i * 2, home: c.x };
  })));
  let W = 0, H = 0, dpr = 1, grown = 0, auto = 0;

  return {
    ready,
    resize() {
      dpr = Math.min(devicePixelRatio || 1, 2);
      W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    },
    /** entering forward starts small and grows a little by itself; backward arrives grown */
    enter(dir) { auto = 0; grown = dir < 0 ? 1 : 0; },
    update(dt, t, p) {
      if (!W) return;
      auto = Math.min(0.5, auto + dt * 0.3);
      const goal = clamp(Math.max(auto, 0.45 + p * 0.65), 0, 1);
      grown = reduced ? goal : damp(grown, goal, 4, dt);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const treeH = H * 0.7; // the tree ends where the creatures stand
      ctx.save(); ctx.translate(W * 0.05, H * 0.03); ctx.scale(0.9, 1);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const e of edges) {
        if (e.y0 > grown) continue;
        const [r, g, b] = colourAt(e.clade, (e.y0 + e.y1) / 2);
        ctx.strokeStyle = `rgba(${r},${g},${b},${e.dead ? 0.55 : 0.9})`;
        ctx.lineWidth = e.w * 1.5 * Math.max(1, W / 900);
        ctx.beginPath();
        let last = null;
        for (const [x, y] of e.pts) {
          if (y > grown) break;
          const px = x * W, py = y * treeH;
          if (!last) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          last = [px, py];
        }
        // a fog halo under the line so it reads over any painting
        const stroke = ctx.strokeStyle, lw = ctx.lineWidth;
        ctx.strokeStyle = 'rgba(222,232,226,.72)';
        ctx.lineWidth = lw + 7;
        ctx.stroke();
        ctx.strokeStyle = stroke;
        ctx.lineWidth = lw;
        ctx.stroke();
        if (e.dead && last && e.pts[e.pts.length - 1][1] <= grown) {
          ctx.fillStyle = ctx.strokeStyle;
          ctx.beginPath(); ctx.arc(last[0], last[1], 2.6 * Math.max(1, W / 900), 0, 7); ctx.fill();
        }
      }
      // the ancestor
      ctx.fillStyle = 'rgb(31,58,51)';
      ctx.beginPath(); ctx.arc(W * 0.5, 0.02 * treeH, 5 * Math.max(1, W / 900), 0, 7); ctx.fill();
      ctx.restore();

      // three living species on the rocks, each pacing near the end of its lineage
      const unit = Math.min(W * 0.05, H * 0.09);
      walkers.forEach((w, i) => {
        if (!w) return;
        if (!reduced) {
          w.x += w.dir * dt * 0.018;
          if (Math.abs(w.x) > 0.06) { w.dir = -Math.sign(w.x); }
          w.walk += dt * 5;
        }
        w.cr.face(w.dir);
        const tip = grown >= 0.97 ? 1 : 0;
        const cx = W * 0.05 + (w.home + w.x) * W * 0.9, gy = H * 0.95;
        // the lineage reaches down to its living species
        if (tip) {
          const [r, g, b] = CLADES[i].rgb;
          ctx.strokeStyle = `rgba(${r},${g},${b},.35)`;
          ctx.setLineDash([2, 5]);
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(W * 0.05 + w.home * W * 0.9, treeH + H * 0.03); ctx.lineTo(cx, gy - unit * 2.6); ctx.stroke();
          ctx.setLineDash([]);
        }
        w.cr.draw(ctx, cx, gy, unit, { walk: w.walk, speed: reduced ? 0 : 0.7, dt });
      });
    },
    destroy() {},
  };
}
