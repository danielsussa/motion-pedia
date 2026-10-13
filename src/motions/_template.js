// Copie este arquivo para um nome sem "_" (ex.: meu-motion.js) e ele aparece na galeria.
import { TAU, seg, ease } from '../lib/anim.js';

export default {
  id: 'meu-motion',
  title: 'Meu Motion',
  description: 'Uma frase sobre o que ele faz.',
  category: 'formas',
  tags: ['forma'],
  duration: 4, // segundos; o player faz loop nessa duração

  params: {
    color: { type: 'color', label: 'Cor', default: '#ffffff' },
    bg: { type: 'color', label: 'Fundo', default: '#0d0d10' },
    size: { type: 'range', label: 'Tamanho', min: 0.1, max: 1, step: 0.01, default: 0.4 },
    // também existem: text, select (options: [...]), boolean
  },

  // Opcional: roda quando muda tamanho/parâmetro. O que retornar chega em render como `state`.
  setup({ w, h, p }) {
    return {};
  },

  // Desenha o frame no tempo t (segundos). Precisa ser função pura de t: nada de Math.random aqui.
  render(ctx, t, { w, h, p, duration, progress, state, px }) {
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, w, h);
    const r = Math.min(w, h) * p.size * (0.5 + 0.5 * ease.inOutCubic(seg(t, 0, duration / 2)));
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, r, 0, TAU);
    ctx.fill();
  },
};
