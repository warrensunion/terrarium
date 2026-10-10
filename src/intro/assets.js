/**
 * Art the intro needs, and the one loader every intro module goes through.
 * Kept free of DOM building so the preloader (in the entry chunk) can import
 * it cheaply and weight real load progress by file size. A missing file must
 * never show a broken-image icon: load() resolves null, logs once, and the
 * caller simply leaves that layer out.
 */
import { log } from '../core/env.js';

export const ART = '/art/';

/** approximate bytes (KB) of each file: progress weights, not truth */
export const KB = {
  'bg-fog': 210, 'mid-rocks': 280, 'jar-world': 486, 'jar': 248, 'fg-moss': 333,
  'leaves-left': 265, 'leaves-right': 231, 'paper-grain': 40, 'gene-strand': 63,
  'room-backdrop': 152, 'preloader-sprout': 53,
};

/** what scene 1 needs before the curtain may lift */
export const FIRST_SCENE = ['bg-fog', 'mid-rocks', 'jar-world', 'fg-moss', 'leaves-left', 'leaves-right', 'paper-grain', 'pt-0', 'pt-3', 'pt-5', 'pt-10'];

export const url = (name) => `${ART}${name}.webp`;

const cache = new Map();
const missing = new Set();

/** load + decode once; resolves the image, or null if it is missing or broken */
export function load(name) {
  if (cache.has(name)) return cache.get(name);
  const p = new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      // decode() off the main thread so showing the layer never janks
      (img.decode ? img.decode() : Promise.resolve()).then(() => resolve(img), () => resolve(img));
    };
    img.onerror = () => {
      if (!missing.has(name)) { missing.add(name); log('missing art:', url(name)); }
      resolve(null);
    };
    img.src = url(name);
  });
  cache.set(name, p);
  return p;
}

export const loadAll = (names) => Promise.all(names.map(load));

/**
 * An <img> for a DOM layer. It stays hidden until its pixels are decoded, and
 * is removed if the file is missing, so no broken icon ever paints.
 */
export function layerImg(name, className = '') {
  const img = document.createElement('img');
  img.alt = '';
  img.className = className;
  img.decoding = 'async';
  img.draggable = false;
  img.style.visibility = 'hidden';
  const ready = load(name).then((src) => {
    if (!src) { img.remove(); return null; }
    img.src = src.src;
    return (img.decode ? img.decode() : Promise.resolve()).catch(() => {}).then(() => {
      img.style.visibility = '';
      return img;
    });
  });
  return { img, ready };
}
