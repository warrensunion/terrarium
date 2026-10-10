// Temporary stub so the router builds; replaced by the real live screen.
export default function liveScreen(root) {
  const el = document.createElement('main');
  el.textContent = 'live';
  root.append(el);
  return { destroy() { el.remove(); } };
}
