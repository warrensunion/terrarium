/**
 * One switch for reduced motion in the UI's CSS. The class on <html> comes
 * only from env.js prefersReducedMotion() (so ?motion=reduce|full beats the OS
 * setting), follows OS changes live, and is reference-counted so the HUD and
 * the brain panel can each hold it and the last destroy() removes it.
 */
import { prefersReducedMotion, onReducedMotionChange } from '../core/env.js';

let holders = 0;
let unlisten = null;
const apply = () => document.documentElement.classList.toggle('ui-motion-reduce', prefersReducedMotion());

/** @returns {() => void} release */
export function holdMotionClass() {
  if (holders++ === 0) {
    apply();
    unlisten = onReducedMotionChange(apply);
  }
  let held = true;
  return () => {
    if (!held) return;
    held = false;
    if (--holders === 0) {
      unlisten?.();
      unlisten = null;
      document.documentElement.classList.remove('ui-motion-reduce');
    }
  };
}
