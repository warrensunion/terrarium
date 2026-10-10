// The jar must fill the frame at every aspect (the makemepulse rule), so the
// fitted home view is checked against a real three.js projection.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { fitView, JAR_RINGS } from '../src/live/camera.js';


function extent(phi, aspect, fov, f) {
  const cam = new THREE.PerspectiveCamera(fov, aspect, 0.1, 500);
  cam.position.set(0, f.targetY + f.dist * Math.cos(phi), f.dist * Math.sin(phi));
  cam.lookAt(0, f.targetY, 0);
  cam.updateMatrixWorld(); cam.updateProjectionMatrix();
  let x0 = 1, x1 = -1, y0 = 1, y1 = -1;
  const v = new THREE.Vector3();
  for (let k = 0; k < 64; k++) for (const [r, y] of JAR_RINGS) {
    const a = (k / 64) * Math.PI * 2;
    v.set(Math.cos(a) * r, y, Math.sin(a) * r).project(cam);
    x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
  }
  return { x0, x1, y0, y1 };
}

for (const [label, aspect] of [['1440x900', 1440 / 900], ['1920x1080', 1920 / 1080], ['390x844', 390 / 844]]) {
  test(`fitView fills the frame and centres the jar at ${label}`, () => {
    const f = fitView(0.9, aspect, 38);
    const e = extent(0.9, aspect, 38, f);
    const h = (e.y1 - e.y0) / 2, w = (e.x1 - e.x0) / 2;
    // fills ~88% of the height, or ~90% of the width when the screen is narrow
    assert.ok(h <= 0.885 && w <= 0.91, `overflows: h ${h.toFixed(3)} w ${w.toFixed(3)}`);
    assert.ok(h >= 0.86 || w >= 0.88, `too small: h ${h.toFixed(3)} w ${w.toFixed(3)}`);
    assert.ok(Math.abs((e.y1 + e.y0) / 2) < 0.02, `not centred vertically: ${((e.y1 + e.y0) / 2).toFixed(3)}`);
  });
}
