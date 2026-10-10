/**
 * The five scenes: their words (verbatim from docs/intro-brief.md), which
 * painted plate sits on which depth plane, and which small living thing each
 * one carries. Layout lives in intro.css (per-scene classes); this file only
 * builds the DOM and hands planes to the camera. Every scene has the same
 * seven planes (far, mid, pivot, fx particles, near, two frame-leaf planes)
 * plus the DOM copy, so the transitions can treat them alike.
 */
import { layerImg } from './assets.js';
import { createPlane } from './parallax.js';
import { createParticles } from './particles.js';

export const SCENES = [
  {
    title: 'Terrarium',
    text: 'A few hundred small creatures live in this jar. Nobody designed them. Scroll, and we’ll show you how they got this way.',
    far: 'bg-fog', mid: 'mid-rocks', near: 'fg-moss', pivot: 'jar-world',
    motes: ['pt-0', 'pt-3', 'pt-5', 'pt-10', 'pt-1', 'pt-11'],
  },
  {
    title: 'Genes become bodies', lines: ['Genes become', 'bodies'],
    text: 'Every creature carries a short string of genes. Some decide how many segments it has, how long its legs are, how big it grows and what colour it is. Change a gene and the body changes with it.',
    far: 'bg-fog', mid: 'mid-rocks', near: 'fg-moss', live: 'genes',
    motes: ['pt-2', 'pt-7', 'pt-9', 'pt-16', 'pt-5'],
  },
  {
    title: 'Brains become behaviour', lines: ['Brains become', 'behaviour'],
    text: 'Each one also has a tiny brain, a handful of neurons wired together. It senses where the nearest food is, who is close by, how much energy it has left and how near the glass is. From that it decides to turn, to walk, to eat or to look for a mate.',
    far: 'bg-fog', mid: 'mid-rocks', near: 'fg-moss', live: 'brain',
    motes: ['pt-6', 'pt-8', 'pt-13', 'pt-15', 'pt-10'],
  },
  {
    title: 'Generations become species', lines: ['Generations', 'become species'],
    text: 'Creatures that find food live long enough to have young. Each child is a mix of its parents with a few small mistakes. Over many generations the mistakes add up, families drift apart, and new species appear.',
    far: 'bg-fog', mid: 'mid-rocks', near: 'fg-moss', live: 'tree',
    motes: ['pt-12', 'pt-14', 'pt-17', 'pt-5'],
  },
  {
    title: 'Open the jar',
    text: 'None of this is scripted. Every creature inside was born in your browser a moment ago, and what they become is up to them.',
    far: 'room-backdrop', mid: 'mid-rocks', near: 'fg-moss', pivot: 'jar-world',
    motes: ['pt-5', 'pt-10', 'pt-11', 'pt-0', 'pt-4'],
    cta: true,
  },
];

const el = (tag, cls, attrs = {}) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
};

/** body text split for the letter-by-letter beat; the sr-only copy is what assistive tech reads */
function splitText(p, text, perWord) {
  const sr = el('span', 'sr-only');
  sr.textContent = text;
  const vis = el('span', 'in-letters', { 'aria-hidden': 'true' });
  let i = 0;
  for (const word of text.split(' ')) {
    const w = el('span', 'in-word');
    if (perWord) {
      w.textContent = word;
      w.style.setProperty('--i', String(i++));
    } else {
      for (const ch of word) {
        const c = el('span', 'in-ch');
        c.textContent = ch;
        c.style.setProperty('--i', String(i++));
        w.append(c);
      }
      i++; // the space between words takes its 18 ms too
    }
    vis.append(w, ' ');
  }
  p.append(sr, vis);
  return i;
}

/**
 * Build scene n (0-based). Returns the DOM, its planes by role, and a
 * `host` element in the pivot plane where the scene's living part mounts.
 */
export function buildScene(n, { perWord, go, touch }) {
  const def = SCENES[n];
  const root = el('section', `in-scene in-s${n + 1}`, { 'aria-labelledby': `in-t${n + 1}`, 'data-scene': String(n + 1) });
  const planesEl = el('div', 'in-planes');
  const ready = [];
  const plane = (role, depth, cls, img) => {
    const p = el('div', `in-plane in-${cls}`);
    if (img) { const l = layerImg(img, 'in-art'); p.append(l.img); ready.push(l.ready); }
    planesEl.append(p);
    return createPlane(p, depth);
  };
  const planes = {
    far: plane('far', 'far', 'far', def.far),
    mid: plane('mid', 'mid', 'mid', def.mid),
    pivot: plane('pivot', 'pivot', 'pivot', def.pivot),
    fx: plane('fx', 'fx', 'fx'),
    near: plane('near', 'near', 'near', def.near),
    closeL: plane('closeL', 'close', 'close-l', 'leaves-left'),
    closeR: plane('closeR', 'close', 'close-r', 'leaves-right'),
  };
  const motes = createParticles(planes.fx.el, def.motes, { count: n === 0 || n === 4 ? 16 : 12 });
  ready.push(motes.ready);

  // copy: chapter number, the title plate, body, prompt
  const copy = el('div', 'in-copy');
  const plateMask = el('div', 'in-plate');
  const plateIn = el('div', 'in-plate-in');
  const num = el('p', 'in-num');
  num.innerHTML = `<span class="sr-only">Part </span>${n + 1}<span class="in-num-of"> of 5</span>`;
  const h = el(n === 0 ? 'h1' : 'h2', 'in-title', { id: `in-t${n + 1}`, tabindex: '-1' });
  // authored line breaks (never more than two) so the plate hugs its words like a specimen label
  for (const line of def.lines || [def.title]) {
    const l = el('span', 'in-title-line');
    l.textContent = line;
    h.append(l, ' ');
  }
  plateIn.append(num, h);
  plateMask.append(plateIn);
  const body = el('p', 'in-body');
  const letters = splitText(body, def.text, perWord);
  body.style.setProperty('--n', String(letters));
  copy.append(plateMask, body);
  if (def.cta) {
    const row = el('div', 'in-cta');
    const open = el('button', 'in-btn', { type: 'button' });
    open.textContent = 'Open the jar';
    const how = el('a', 'in-link', { href: '#/about' });
    how.textContent = 'How it works';
    row.append(open, how);
    copy.append(row);
  } else {
    const prompt = el('p', 'in-prompt', { 'aria-hidden': 'true' });
    prompt.innerHTML = `<span>${touch ? 'Swipe up' : 'Scroll'}</span>`;
    copy.append(prompt);
  }
  root.append(planesEl, copy);

  const copyPlane = { el: copy, mod: { o: 1 }, lastO: '' };
  return {
    n, def, root, planes, copy: copyPlane, motes, heading: h,
    host: planes.pivot.el,
    ready: Promise.all(ready),
    rootMod: { x: 0, y: 0, s: 1, o: 1, card: 0 },
  };
}
