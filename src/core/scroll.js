/**
 * Virtual scroll. The intro is a fixed stage that never scrolls natively,
 * because every scene boundary plays an authored transition at its own
 * timing (NOTES.md §6): a native scroll position would let a flick skip it.
 * Wheel, touch and keys all feed one smoothed value in "scene units"
 * (1 = one scene's rest segment), and the gestures that mean "the next page"
 * (a quick swipe, PageDown, Space, Home, End) are reported as intents so the
 * caller can play a transition instead of scrubbing.
 *
 * The state machine is pure (createScrollState) so it can be tested in Node;
 * createVirtualScroll only wires DOM events into it.
 */
import { clamp, damp } from './ease.js';

export const LINE_PX = 16;
/** one wheel event never moves more than this many px (tames trackpad flings and line-mode mice) */
export const MAX_EVENT_PX = 240;

/** wheel event → pixels, whatever its deltaMode */
export function wheelPixels(deltaY, deltaMode, pageH) {
  let d = deltaY;
  if (deltaMode === 1) d *= LINE_PX;
  else if (deltaMode === 2) d *= pageH;
  return clamp(d, -MAX_EVENT_PX, MAX_EVENT_PX);
}

/**
 * A finished touch: is it a swipe that means "next" (+1) or "previous" (-1)?
 * dy is finger travel in px (negative = finger moved up = forward), ms its duration.
 */
export function swipeIntent(dy, ms, { minDist = 40, minSpeed = 0.35 } = {}) {
  if (Math.abs(dy) < minDist) return 0;
  if (Math.abs(dy) / Math.max(ms, 1) < minSpeed) return 0;
  return dy < 0 ? 1 : -1;
}

/** the smoothed value; input is ignored while locked (a transition is playing) */
export function createScrollState({ min = -Infinity, max = Infinity, lambda = 7 } = {}) {
  let value = 0, target = 0, locked = false, lo = min, hi = max;
  return {
    get value() { return value; },
    get target() { return target; },
    get locked() { return locked; },
    add(d) {
      if (locked || !Number.isFinite(d)) return;
      target = clamp(target + d, lo, hi);
    },
    set(v, snap = true) {
      target = clamp(v, lo, hi);
      if (snap) value = target;
    },
    bounds(a, b) { lo = a; hi = b; target = clamp(target, lo, hi); },
    lock(on) { locked = !!on; },
    update(dt) {
      value = damp(value, target, lambda, dt);
      if (Math.abs(value - target) < 1e-4) value = target;
      return value;
    },
  };
}

const KEY_STEP = 0.18;

/**
 * Wire wheel / touch / keys on `el` (and keys on window) into a scroll state.
 * unit(): how many px of wheel travel make one scene unit.
 * onIntent('next'|'prev'|'first'|'last') for page-like gestures.
 * onInput() fires on any user input (used to wake idle loops).
 */
export function createVirtualScroll(el, { unit = () => innerHeight * 0.9, onIntent = () => {}, onInput = () => {}, ...opts } = {}) {
  const state = createScrollState(opts);
  let touchY = 0, touchStartY = 0, touchStartT = 0, touching = false;

  const onWheel = (e) => {
    if (e.ctrlKey) return; // pinch-zoom on trackpads
    e.preventDefault();
    state.add(wheelPixels(e.deltaY, e.deltaMode, innerHeight) / unit());
    onInput();
  };
  const onTouchStart = (e) => {
    // a second finger means pinch-zoom (WCAG 1.4.4): stop scrubbing and leave the gesture to the browser
    if (e.touches.length !== 1) { touching = false; return; }
    touching = true;
    touchY = touchStartY = e.touches[0].clientY;
    touchStartT = performance.now();
  };
  const onTouchMove = (e) => {
    if (!touching) return;
    if (e.touches.length > 1) { touching = false; return; }
    const y = e.touches[0].clientY;
    // a finger drag scrubs a little faster than the wheel: thumbs travel less
    state.add(((touchY - y) / unit()) * 1.4);
    touchY = y;
    if (e.cancelable) e.preventDefault();
    onInput();
  };
  const onTouchEnd = () => {
    if (!touching) return;
    touching = false;
    const dir = swipeIntent(touchY - touchStartY, performance.now() - touchStartT);
    if (dir && !state.locked) onIntent(dir > 0 ? 'next' : 'prev');
  };
  const onKey = (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const t = e.target;
    const tag = t && t.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable) return;
    const onControl = tag === 'BUTTON' || tag === 'A';
    let handled = true;
    switch (e.key) {
      case 'ArrowDown': state.add(KEY_STEP); break;
      case 'ArrowUp': state.add(-KEY_STEP); break;
      case 'PageDown': onIntent('next'); break;
      case 'PageUp': onIntent('prev'); break;
      case ' ':
        if (onControl) { handled = false; break; } // Space presses the focused button
        onIntent(e.shiftKey ? 'prev' : 'next'); break;
      case 'Home': onIntent('first'); break;
      case 'End': onIntent('last'); break;
      default: handled = false;
    }
    if (handled) { e.preventDefault(); onInput(); }
  };

  el.addEventListener('wheel', onWheel, { passive: false });
  el.addEventListener('touchstart', onTouchStart, { passive: true });
  el.addEventListener('touchmove', onTouchMove, { passive: false });
  el.addEventListener('touchend', onTouchEnd);
  el.addEventListener('touchcancel', onTouchEnd);
  addEventListener('keydown', onKey);

  return {
    state,
    destroy() {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
      removeEventListener('keydown', onKey);
    },
  };
}
