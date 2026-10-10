/**
 * What this device can do. Every reduced-motion and WebGL decision goes
 * through here, so one place answers "why did it fall back?".
 */
const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
const qs = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();

// ?motion=reduce|full beats the OS setting, for testing
export function prefersReducedMotion() {
  if (qs.get('motion') === 'reduce') return true;
  if (qs.get('motion') === 'full') return false;
  return !!mq?.matches;
}

export function onReducedMotionChange(fn) {
  mq?.addEventListener?.('change', fn);
  return () => mq?.removeEventListener?.('change', fn);
}

let webgl;
/** @returns {{ ok: boolean, reason: string }} */
export function hasWebGL2() {
  if (webgl) return webgl;
  if (qs.get('webgl') === '0') return (webgl = { ok: false, reason: 'forced off by ?webgl=0' });
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    if (!gl) return (webgl = { ok: false, reason: 'canvas.getContext("webgl2") returned null' });
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return (webgl = { ok: true, reason: '' });
  } catch (e) {
    return (webgl = { ok: false, reason: 'webgl2 threw: ' + e.message });
  }
}

export const param = (k) => qs.get(k);
export const log = (...a) => console.info('[terrarium]', ...a);
