/**
 * The camera is how a visitor handles the jar, so it should feel like turning
 * a real object: every input sets a goal and the camera damps toward it, so
 * nothing snaps. Orbit by drag (or one finger), zoom by wheel (or pinch),
 * clamped so the jar never leaves view; follow(getPos) glides down onto a
 * creature at λ = 4 and release() glides back out to where you were.
 */
import * as THREE from 'three';
import { damp, clamp } from '../core/ease.js';
import { heightAt } from './terrain.js';
import { WORLD_R, JAR_R } from './look.js';

const HOME = new THREE.Vector3(0, 1.9, 0);
const PHI_MIN = 0.22, PHI_MAX = 1.42;
const ORBIT_MIN = 7.5, ORBIT_MAX = 26;
const FOLLOW_MIN = 0.7, FOLLOW_MAX = 5;

/**
 * @param {THREE.PerspectiveCamera} camera
 * @param {HTMLElement} dom element that receives pointer and wheel input
 * @param {{ reducedMotion?:boolean }} [opts]
 */
export function createCameraRig(camera, dom, { reducedMotion = false } = {}) {
  const target = HOME.clone();
  let theta = -0.32, phi = 1.02, dist = 24;
  let thetaT = theta, phiT = phi, distT = dist;
  let orbitDistT = dist; // remembered while following
  let getPos = null;
  let idle = 0, reduced = reducedMotion;
  let cut = false; // reduced motion: follow/release jump instead of gliding
  const goal = new THREE.Vector3();
  const pointers = new Map();
  let pinch0 = 0, pinchDist0 = 0, moved = 0;

  const onDown = (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved = 0; idle = 0;
    dom.setPointerCapture?.(e.pointerId);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch0 = Math.hypot(a.x - b.x, a.y - b.y); pinchDist0 = distT;
    }
  };
  const onMove = (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    moved += Math.abs(dx) + Math.abs(dy);
    idle = 0;
    if (pointers.size === 1) {
      const k = 1 / Math.max(320, Math.min(dom.clientWidth, dom.clientHeight));
      thetaT -= dx * k * 3.2;
      phiT = clamp(phiT - dy * k * 2.4, PHI_MIN, PHI_MAX);
    } else if (pointers.size === 2 && pinch0 > 0) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      setDist(pinchDist0 * (pinch0 / Math.max(1, d)));
    }
  };
  const onUp = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch0 = 0;
  };
  const onWheel = (e) => {
    e.preventDefault();
    idle = 0;
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    setDist(distT * Math.exp(clamp(dy, -200, 200) * 0.0012));
  };
  function setDist(d) {
    distT = getPos ? clamp(d, FOLLOW_MIN, FOLLOW_MAX) : clamp(d, ORBIT_MIN, ORBIT_MAX * fitScale());
  }
  // narrow screens need more distance to show the whole jar
  // (the jar is ~11 units wide; past this aspect its width, not its height, sets the distance)
  const fitScale = () => Math.max(1, 0.7 / Math.max(0.3, camera.aspect));

  dom.addEventListener('pointerdown', onDown);
  dom.addEventListener('pointermove', onMove);
  dom.addEventListener('pointerup', onUp);
  dom.addEventListener('pointercancel', onUp);
  dom.addEventListener('wheel', onWheel, { passive: false });

  let lastFit = fitScale();
  const rig = {
    follow(fn) {
      if (!getPos) orbitDistT = distT;
      getPos = fn;
      distT = clamp(1.9, FOLLOW_MIN, FOLLOW_MAX);
      phiT = clamp(phiT, 0.5, 1.15);
      if (reduced) cut = true;
    },
    release() {
      if (!getPos) return;
      getPos = null;
      distT = orbitDistT;
      if (reduced) cut = true;
    },
    get following() { return !!getPos; },
    /** total pointer travel (px) of the current/last press: < 6 means it was a click */
    get dragDistance() { return moved; },
    setReducedMotion(v) { reduced = !!v; },
    update(dt) {
      dt = Math.min(dt, 0.1);
      const fit = fitScale();
      if (!getPos && fit !== lastFit) { distT *= fit / lastFit; lastFit = fit; }
      if (getPos) {
        const p = getPos();
        if (!p) rig.release();
        else goal.copy(p);
      }
      if (!getPos) {
        goal.copy(HOME);
        // when left alone the jar turns very slowly on its own, like a display stand
        idle += dt;
        if (!reduced && idle > 5 && pointers.size === 0) thetaT += dt * 0.025 * Math.min(1, (idle - 5) / 3);
      }
      if (cut) {
        // a cut, not a glide: land on the goal this frame
        cut = false;
        target.copy(goal); theta = thetaT; phi = phiT; dist = distT;
      }
      const lam = getPos ? 4 : 2.5;
      target.x = damp(target.x, goal.x, lam, dt);
      target.y = damp(target.y, goal.y, lam, dt);
      target.z = damp(target.z, goal.z, lam, dt);
      theta = damp(theta, thetaT, 7, dt);
      phi = damp(phi, phiT, 7, dt);
      dist = damp(dist, distT, getPos ? 4 : 3.2, dt);
      const sp = Math.sin(phi);
      camera.position.set(
        target.x + dist * sp * Math.sin(theta),
        target.y + dist * Math.cos(phi),
        target.z + dist * sp * Math.cos(theta),
      );
      // inside the jar never dip under the moss
      const cx = camera.position.x, cz = camera.position.z;
      if (cx * cx + cz * cz < JAR_R * JAR_R) {
        const floor = heightAt(cx / WORLD_R, cz / WORLD_R) + 0.3;
        if (camera.position.y < floor) camera.position.y = floor;
      }
      camera.lookAt(target);
    },
    dispose() {
      dom.removeEventListener('pointerdown', onDown);
      dom.removeEventListener('pointermove', onMove);
      dom.removeEventListener('pointerup', onUp);
      dom.removeEventListener('pointercancel', onUp);
      dom.removeEventListener('wheel', onWheel);
    },
  };
  return rig;
}
