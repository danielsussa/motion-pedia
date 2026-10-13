// Simulações (física, revoada, fluido) não são função pura de t. Solução: pré-calcular no setup()
// em passo fixo e o render só ler o frame correspondente. Mantenha o custo baixo (o setup roda a cada
// mudança de parâmetro): ~10 s × 30 fps × poucos milhares de entidades.
import { clamp } from './anim.js';

export function bake({ duration, fps = 30, init, step, snapshot }) {
  const n = Math.ceil(duration * fps) + 1;
  const frames = new Array(n);
  let state = init();
  for (let i = 0; i < n; i++) {
    frames[i] = snapshot(state, i);
    if (i < n - 1) state = step(state, 1 / fps, i) ?? state;
  }
  return {
    fps,
    frames,
    // frame mais próximo de t
    at: (t) => frames[clamp(Math.round(t * fps), 0, n - 1)],
    // índice fracionário para interpolar por conta própria
    index: (t) => clamp(t * fps, 0, n - 1),
  };
}
