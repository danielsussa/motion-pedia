// Utilitários das composições (cenas em DOM). Regra de ouro: mount() monta o DOM uma vez,
// update(t) define TODOS os estilos animados a partir de t. Nada de transition/animation CSS.
import { clamp, lerp, seg, ease } from '../lib/anim.js';

export { clamp, lerp, seg, ease, win, spring, springWin, keys, stagger, rng } from '../lib/anim.js';
export { el } from '../ui/dom.js';

// Está dentro da cena [a, b)?
export const inScene = (t, a, b) => t >= a && t < b;

// Liga/desliga um nó preservando o display original (ex.: flex).
export function show(node, on) {
  if (on) {
    if (node.style.display === 'none') node.style.display = node.dataset.display ?? '';
  } else if (node.style.display !== 'none') {
    node.dataset.display = node.style.display;
    node.style.display = 'none';
  }
}

export const typedChars = (total, t, start, cps = 24) => clamp(Math.floor((t - start) * cps), 0, total);

export function tf({ x = 0, y = 0, z = 0, s = 1, sx = 1, sy = 1, rx = 0, ry = 0, rz = 0 } = {}) {
  return `translate3d(${x}px,${y}px,${z}px) rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${rz}deg) scale(${s * sx},${s * sy})`;
}

export function set(node, styles) {
  Object.assign(node.style, styles);
}

// Quantos caracteres já foram "digitados" (cps = caracteres por segundo).
export const typedCount = (text, t, start, cps = 24) => clamp(Math.floor((t - start) * cps), 0, text.length);

// Caret piscando ~2 Hz, sempre aceso enquanto digita.
export const caretOn = (t, typing) => typing || Math.floor(t * 2.2) % 2 === 0;

// Câmera 2.5D: coloca o ponto (fx, fy) do plano no centro da tela, com zoom e inclinação.
// O desfoque (DOF) vai no `lens` — um nó do tamanho da tela com overflow:hidden que contém o plano.
// Nunca aplique filter no próprio plano: ele pode ser enorme e o blur fica caríssimo.
export function camera(plane, { fx, fy, zoom = 1, rx = 0, rz = 0, blur = 0, w = 1920, h = 1080 }, lens) {
  plane.style.transformOrigin = '0 0';
  plane.style.transform = `translate(${w / 2}px,${h / 2}px) rotateX(${rx}deg) rotateZ(${rz}deg) scale(${zoom}) translate(${-fx}px,${-fy}px)`;
  if (lens) lens.style.filter = blur > 0.05 ? `blur(${blur}px)` : 'none';
}
