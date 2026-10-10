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
// a tab title per screen, so history and tabs say where you are
const titles = {
  '/': 'Terrarium: a world in a jar that evolves while you watch',
  '/live': 'Terrarium: the live jar',
  '/about': 'Terrarium: how it works',
};

const app = document.getElementById('app');
let current = null;
let seq = 0;
let first = true;

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
  let mod;
  try {
    mod = await routes[p]();
  } catch (e) {
    // a stale deploy or a dropped connection: say so instead of a blank page
    console.error(e);
    if (id !== seq) return;
    // the old screen's worker and WebGL context must not run on behind the message
    if (current) { try { current.destroy(); } catch (err) { console.error(err); } current = null; }
    app.innerHTML = '<p class="route-error" role="alert">This part of the site could not load. <a href="">Reload the page</a> to try again.</p>';
    return;
  }
  if (id !== seq) return; // a newer navigation won
  if (current) { try { current.destroy(); } catch (e) { console.error(e); } current = null; }
  app.replaceChildren();
  app.dataset.route = p;
  current = mod.default(app, { go });
  document.title = titles[p];
  // after an in-page navigation, move focus to the new screen's heading so
  // keyboard and screen-reader users land where the content changed
  if (!first) {
    scrollTo(0, 0);
    const h = app.querySelector('h1');
    if (h) { if (!h.hasAttribute('tabindex')) h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
  }
  first = false;
  log('screen', p);
}

addEventListener('hashchange', mount);
mount();
