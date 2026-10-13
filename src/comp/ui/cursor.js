import { el } from '../core.js';
import './ui.css';

// Cursor falso. update({ x, y, press }) — press 0..1 encolhe a seta (clique).
export function cursor() {
  const node = el('div.ui-cursor');
  node.innerHTML = `<svg viewBox="0 0 32 32" width="46" height="46"><path d="M6 3 L6 25 L12 19.5 L16 29 L20 27.3 L16.2 18 L24 18 Z" fill="#111" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"/></svg>`;
  return {
    el: node,
    update({ x, y, press = 0, opacity = 1 }) {
      node.style.transform = `translate(${x - 9}px,${y - 4}px) scale(${1 - press * 0.18})`;
      node.style.opacity = opacity;
    },
  };
}

// Anel que expande a partir do clique. k = 0..1.
export function ripple() {
  const node = el('div.ui-ripple');
  return {
    el: node,
    update({ x, y, k }) {
      node.style.display = k > 0 && k < 1 ? '' : 'none';
      node.style.transform = `translate(${x}px,${y}px) scale(${1 + k * 7})`;
      node.style.opacity = 1 - k;
    },
  };
}
