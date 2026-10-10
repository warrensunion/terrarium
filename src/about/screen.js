/**
 * About: how the jar works, in plain words. Deliberately not a scene: after
 * the intro's motion this is a quiet page you can read at your own speed,
 * scroll natively, and link to. Everything it claims matches the simulation's
 * shared contracts (8 senses, 4 actions, NEAT brains, species by genome
 * distance, a worker that runs on WebGPU or the CPU, nothing sent anywhere).
 */
import './about.css';
import { url } from '../intro/assets.js';
import { prefersReducedMotion } from '../core/env.js';

const SECTIONS = [
  ['What you are looking at', [
    'A glass jar with a few hundred small creatures inside. Each one walks, eats, looks for a mate and, if it gets the chance, has young. Nobody tells them what to do and nobody drew them: their bodies and their behaviour come from their genes, and their genes come from their parents.',
    'Watch for a while and you will see families spread, shrink and split. That is evolution, happening in your browser.',
  ]],
  ['Genes', [
    'Every creature carries two sets of genes. The body genes are six numbers. They decide how many segments it has, how long its legs are, how big it grows, its colour, how strong that colour is, and its markings.',
    'A child takes each gene from one parent or the other, then a few genes shift a little by chance. Those small changes are mutations. You can turn the mutation rate up or down in the jar.',
  ]],
  ['Brains', [
    'The other set of genes builds a brain: a small network of neurons, which are simple units that add up signals and pass one on. Every creature senses eight things: which way the nearest food is, how far away it is, the same for the nearest neighbour, how much energy it has left, and how near the glass is.',
    'From those eight signals the brain decides four things: turn, walk, eat, and look for a mate. A newborn’s brain starts as a copy of its parents’, with small changes.',
    'The brains use a method called NEAT (NeuroEvolution of Augmenting Topologies). In plain terms: brains are not only tuned, they grow. Over generations a mutation can add a new neuron or a new connection, so behaviour can become more complicated if that helps a family survive.',
  ]],
  ['Food, energy and children', [
    'Food grows on the floor of the jar, more in a few favourite patches. Eating gives energy; walking, being big and having many segments cost it, and so does a jar that is too hot or too cold. A creature that runs out of energy, or grows old, dies.',
    'Two creatures of the same species that are both well fed can have a child. It costs each parent a quarter of its energy. So the creatures that are good at finding food are the ones that have young, and their genes spread.',
    'If the jar ever gets nearly empty, a few new creatures bud from the survivors, so the world never dies out completely.',
  ]],
  ['Species', [
    'Every so often the jar sorts the creatures into species by comparing their brain genes. Creatures that are similar enough belong together; when a family has drifted far enough from everyone else, it becomes a new species with its own colour in the river at the bottom of the screen.',
    'Species can only mate among themselves, so once a family splits off, it goes its own way.',
  ]],
  ['What runs where', [
    'The simulation runs in a background worker, a separate thread of your browser, so the jar stays smooth while it thinks. If your browser has WebGPU, the creatures’ senses are worked out on the graphics card; if not, on the processor. The picture is drawn with WebGL.',
    'Nothing is sent anywhere. There is no account and no tracking: every creature is born, lives and dies on your computer, and when you close the tab, the jar is gone.',
  ]],
  ['Controls', [
    'Drag to look around the jar and scroll or pinch to move closer. Click or tap a creature to follow it and see its brain at work: its neurons light up as it decides. Close the panel to let it go.',
    'The panel at the edge sets the speed (pause, 1×, 4×, 16×) and three dials: how much food grows, how often genes mutate, and the temperature. Reset starts a new jar.',
    'With a keyboard: press F, or use the Follow a creature button at the top, to follow a well-fed creature near the middle; press F again for another. Space pauses and resumes, 1, 2 and 3 pick 1×, 4× and 16×, and Escape closes the panel.',
  ]],
];

export default function aboutScreen(root, { go }) {
  const page = document.createElement('main');
  page.className = 'ab-page';
  const head = document.createElement('header');
  head.className = 'ab-head';
  head.innerHTML = `
    <nav class="ab-nav" aria-label="Terrarium">
      <a class="ab-back" href="#/">Back to the intro</a>
      <a class="ab-open" href="#/live">Open the jar</a>
    </nav>
    <img class="ab-jar" src="${url('jar-world')}" alt="The jar, with moss, ferns, a small pool and creatures inside" width="834" height="1385" decoding="async">
    <h1 class="ab-title" tabindex="-1">How it works</h1>
    <p class="ab-lede">A plain account of what happens inside the jar.</p>`;
  const img = head.querySelector('.ab-jar');
  img.addEventListener('error', () => img.remove(), { once: true });
  page.append(head);
  for (const [title, paras] of SECTIONS) {
    const sec = document.createElement('section');
    sec.className = 'ab-sec';
    const h = document.createElement('h2');
    h.textContent = title;
    sec.append(h);
    for (const t of paras) { const p = document.createElement('p'); p.textContent = t; sec.append(p); }
    page.append(sec);
  }
  const foot = document.createElement('footer');
  foot.className = 'ab-foot';
  foot.innerHTML = '<a class="ab-open" href="#/live">Open the jar</a><a class="ab-back" href="#/">Watch the intro again</a>';
  page.append(foot);
  root.append(page);
  document.documentElement.classList.add('ab-on');
  // reduced motion comes from env.js (it also honours ?motion=reduce), never a raw media query
  document.documentElement.classList.toggle('ab-reduced', prefersReducedMotion());
  scrollTo(0, 0);
  page.querySelector('.ab-title').focus({ preventScroll: true });
  void go;
  return {
    destroy() {
      page.remove();
      document.documentElement.classList.remove('ab-on', 'ab-reduced');
    },
  };
}
