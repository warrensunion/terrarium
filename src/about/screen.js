// Temporary stub so the router builds; replaced by the real about screen.
export default function aboutScreen(root) {
  const el = document.createElement('main');
  el.textContent = 'about';
  root.append(el);
  return { destroy() { el.remove(); } };
}
