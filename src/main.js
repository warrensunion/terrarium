/**
 * The router. One screen is mounted at a time and destroyed (not hidden) on
 * leave, so a screen's WebGL context, worker and listeners never outlive it.
 * Screens never import each other; they move with go('#/path').
 * Each screen is a lazy chunk: three.js only downloads when the jar opens.
 */
import './styles/tokens.css';
import './styles/base.css';
import { log } from './core/env.js';

const routes = {
  '/': () => import('./intro/screen.js'),
  '/live': () => import('./live/screen.js'),
  '/about': () => import('./about/screen.js'),
};

const app = document.getElementById('app');
let current = null;
let seq = 0;

function path() {
  const h = location.hash.replace(/^#/, '') || '/';
  return routes[h] ? h : '/';
}

export function go(to) {
  const target = to.startsWith('#') ? to : '#' + to;
  if (location.hash === target) mount(); else location.hash = target;
}

async function mount() {
  const id = ++seq;
  const p = path();
  const mod = await routes[p]();
  if (id !== seq) return; // a newer navigation won
  if (current) { try { current.destroy(); } catch (e) { console.error(e); } current = null; }
  app.replaceChildren();
  app.dataset.route = p;
  current = mod.default(app, { go });
  log('screen', p);
}

addEventListener('hashchange', mount);
mount();
