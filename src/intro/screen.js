// Temporary stub so the router builds; replaced by the real intro screen.
export default function introScreen(root) {
  const el = document.createElement('main');
  el.textContent = 'intro';
  root.append(el);
  return { destroy() { el.remove(); } };
}
