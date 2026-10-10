/**
 * Everything the live screen draws, assembled once: renderer, scene, jar,
 * terrain, creatures, food, spores, camera rig and the grade. The live
 * screen (and live-dev.html) only feeds frames in and calls render(), so the
 * dev page measures exactly what ships.
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
 * @param {{ canvas:HTMLCanvasElement, bodyFromGenes:Function, max?:number, reducedMotion?:boolean, pixelRatio?:number }} o
 */
export function createLiveStage({ canvas, bodyFromGenes, max = 2000, reducedMotion = false, pixelRatio = Math.min(2, globalThis.devicePixelRatio || 1) }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(pixelRatio);
  renderer.autoClear = true;
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
  let w = 1, h = 1, time = 0, disposed = false;

  // art is optional: the jar is fully procedural without it
  Promise.all([loadOptional(ART.moss), loadOptional(ART.soil), loadOptional(ART.backdrop)]).then(([moss, soil, backdrop]) => {
    if (disposed) return;
    terrain.userData.setTextures({ moss, soil });
    jar.setBackdrop(backdrop);
  });

  const stage = {
    renderer, scene, camera, rig, creatures, food, particles, jar, terrain,
    resize(width, height) {
      w = Math.max(1, width); h = Math.max(1, height);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      const s = renderer.getDrawingBufferSize(buf);
      grade.setSize(s.x, s.y);
      particles.setSize(s.y);
    },
    /** feed the latest two sim frames; alpha 0..1 between them */
    frame(prev, next, alpha, dt) {
      creatures.update(prev, next, alpha, dt);
      food.update(next && next.food);
    },
    render(dt) {
      time += dt;
      lightUniforms.uTime.value = time;
      rig.update(dt);
      const s = renderer.getDrawingBufferSize(buf);
      jar.update(camera, s.x, s.y);
      grade.render(scene, camera, time);
    },
    /** creature id under a client-space point, or null */
    pickAt(clientX, clientY) {
      const r = canvas.getBoundingClientRect();
      ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      return creatures.pick(raycaster);
    },
    setReducedMotion(v) { creatures.setReducedMotion(v); particles.setReducedMotion(v); rig.setReducedMotion(v); },
    dispose() {
      disposed = true;
      rig.dispose(); creatures.dispose(); food.dispose(); particles.dispose(); jar.dispose(); grade.dispose();
      terrain.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
  return stage;
}
