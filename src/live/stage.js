/**
 * Everything the live screen draws, assembled once: renderer, scene, jar,
 * terrain, creatures, food, spores, camera rig and the grade. The live screen
 * only wires the worker and the UI to this; live-dev.html uses the same
 * module, so what the dev page measures is exactly what ships.
 */
import * as THREE from 'three';
import { createJar } from './jar.js';
import { createTerrain } from './terrain.js';
import { createCreatures } from './creatures.js';
import { createFood } from './food.js';
import { createParticles } from './particles.js';
import { createCameraRig } from './camera.js';
import { createGrade } from './grade.js';
import { lightUniforms } from './look.js';

const ART = { moss: '/art/moss-floor.webp', soil: '/art/soil.webp', backdrop: '/art/room-backdrop.webp' };

/** resolves to a texture, or null if the file is missing or not an image */
function loadOptional(url) {
  return new Promise((resolve) => {
    new THREE.TextureLoader().load(url, resolve, undefined, () => resolve(null));
  });
}

/**
 * @param {HTMLElement} container the stage fills it (a canvas.lv-canvas is appended)
 * @param {{ bodyFromGenes:Function, reducedMotion?:boolean, max?:number, pixelRatio?:number }} opts
 */
export function createStage(container, { bodyFromGenes, reducedMotion = false, max = 2000, pixelRatio } = {}) {
  const canvas = document.createElement('canvas');
  canvas.className = 'lv-canvas';
  canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none';
  container.append(canvas);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(pixelRatio || Math.min(2, globalThis.devicePixelRatio || 1));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.03, 200);

  const jar = createJar();
  const terrain = createTerrain();
  scene.add(jar.group, terrain);
  const creatures = createCreatures(scene, { max, bodyFromGenes, reducedMotion });
  const food = createFood(scene);
  const particles = createParticles(scene);
  particles.setReducedMotion(reducedMotion);
  const rig = createCameraRig(camera, canvas, { reducedMotion });
  const grade = createGrade(renderer);
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2(), buf = new THREE.Vector2();
  let prev = null, next = null, time = 0, disposed = false;

  // art is optional: the jar is fully procedural without it
  Promise.all([loadOptional(ART.moss), loadOptional(ART.soil), loadOptional(ART.backdrop)]).then(([moss, soil, backdrop]) => {
    if (disposed) return;
    terrain.userData.setTextures({ moss, soil });
    jar.setBackdrop(backdrop);
  });

  const stage = {
    renderer, scene, camera, rig, creatures, food, particles, canvas,
    /** match the container's size (call on window resize) */
    resize() {
      const w = Math.max(1, container.clientWidth), h = Math.max(1, container.clientHeight);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      const s = renderer.getDrawingBufferSize(buf);
      grade.setSize(s.x, s.y);
      particles.setSize(s.y);
    },
    /** the two latest sim frames (worker format); render() interpolates between them */
    setFrames(p, n) {
      prev = p; next = n;
      if (n) food.update(n.food);
    },
    /** draw one frame; alpha 0..1 = how far between prev and next, dt = seconds since last render */
    render(dt, alpha = 1) {
      time += dt;
      lightUniforms.uTime.value = time;
      if (next) creatures.update(prev, next, alpha, dt);
      rig.update(dt);
      const s = renderer.getDrawingBufferSize(buf);
      jar.update(camera, s.x, s.y);
      grade.render(scene, camera, time);
    },
    /** creature id under a client-space point, or null */
    pick(clientX, clientY) {
      const r = canvas.getBoundingClientRect();
      ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      return creatures.pick(raycaster);
    },
    setReducedMotion(v) { creatures.setReducedMotion(v); particles.setReducedMotion(v); rig.setReducedMotion(v); },
    dispose() {
      if (disposed) return;
      disposed = true;
      rig.dispose(); creatures.dispose(); food.dispose(); particles.dispose(); jar.dispose(); grade.dispose();
      terrain.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
      renderer.dispose();
      renderer.forceContextLoss(); // WEBGL_lose_context
      canvas.remove();
    },
  };
  stage.resize();
  return stage;
}
