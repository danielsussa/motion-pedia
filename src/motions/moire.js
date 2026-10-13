import { TAU, mixHex, rgba } from '../lib/anim.js';

// Moiré: duas grades finas (anéis concêntricos ou linhas paralelas) sobrepostas. A interferência
// aparece onde as duas quase coincidem; mexer um pouco o centro/ângulo de uma faz as franjas varrerem a
// tela muito mais rápido que o próprio movimento. Loop: centros em Lissajous de frequência inteira,
// ângulos em seno de frequência inteira e fase das grades avançando um número inteiro de períodos.

export default {
  id: 'moire',
  title: 'Moiré',
  description: 'Duas grades de anéis ou linhas sobrepostas, girando devagar e criando ondas de interferência.',
  category: 'fundos',
  tags: ['fundo', 'loop', 'padrão'],
  duration: 16,
  poster: 3,

  params: {
    mode: { type: 'select', label: 'Padrão', options: ['anéis', 'linhas', 'misto'], default: 'anéis' },
    bg: { type: 'color', label: 'Fundo', default: '#0e0e11' },
    colorA: { type: 'color', label: 'Linhas', default: '#ece6da' },
    colorB: { type: 'color', label: 'Destaque (centro da 2ª grade)', default: '#ff5a36' },
    accent: { type: 'range', label: 'Quanto de destaque', min: 0, max: 1, step: 0.05, default: 0.8 },
    spacing: { type: 'range', label: 'Espaço entre linhas', min: 0.006, max: 0.03, step: 0.001, default: 0.016 },
    weight: { type: 'range', label: 'Espessura', min: 0.15, max: 0.7, step: 0.01, default: 0.5 },
    vignette: { type: 'range', label: 'Vinheta', min: 0, max: 1, step: 0.05, default: 0.55 },
    drift: { type: 'range', label: 'Movimento', min: 0, max: 2, step: 0.05, default: 1 },
    flow: { type: 'range', label: 'Fluxo (períodos/loop)', min: 0, max: 8, step: 1, default: 2 },
  },

  render(ctx, t, { w, h, p, progress: u }) {
    const m = Math.min(w, h);
    const d = m * p.spacing;
    const R = Math.hypot(w, h) / 2;
    const cx = w / 2;
    const cy = h / 2;
    const a = TAU * u;
    const k = p.drift;
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, w, h);
    ctx.lineWidth = d * p.weight;
    ctx.lineCap = 'butt';

    const rings = (x, y, phase) => {
      const reach = R + Math.hypot(x - cx, y - cy) + d;
      const n = Math.ceil(reach / d);
      ctx.beginPath();
      for (let i = 0; i <= n; i++) {
        const r = (i + phase) * d;
        if (r <= 0.5) continue;
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, TAU);
        ctx.closePath(); // sem closePath o traço deixa uma emenda visível em ângulo 0
      }
      ctx.stroke();
    };
    const lines = (ang, phase, ox = 0, oy = 0) => {
      // o caminho é montado no espaço girado e traçado fora dele (o gradiente fica na tela)
      ctx.save();
      ctx.translate(cx + ox, cy + oy);
      ctx.rotate(ang);
      const L = R + d * 2 + Math.hypot(ox, oy);
      const n = Math.ceil(L / d);
      ctx.beginPath();
      for (let i = -n; i <= n; i++) {
        const x = (i + phase) * d;
        ctx.moveTo(x, -L);
        ctx.lineTo(x, L);
      }
      ctx.restore();
      ctx.stroke();
    };
    // 2ª grade: destaque no centro da tela, dissolvendo na cor das linhas para fora
    const g2 = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    g2.addColorStop(0, mixHex(p.colorA, p.colorB, p.accent));
    g2.addColorStop(0.55, mixHex(p.colorA, p.colorB, p.accent * 0.35));
    g2.addColorStop(1, p.colorA);
    const vignette = () => {
      if (p.vignette <= 0) return;
      const v = ctx.createRadialGradient(cx, cy, m * 0.25, cx, cy, R * 1.05);
      v.addColorStop(0, rgba(p.bg, 0));
      v.addColorStop(1, rgba(p.bg, 0.9 * p.vignette));
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, w, h);
    };
    // fase em [0,1): a grade se desloca `flow` períodos inteiros por loop
    const ph = (s) => ((u * p.flow * s) % 1 + 1) % 1;

    if (p.mode === 'linhas') {
      // duas grades quase paralelas: o ângulo relativo (≈ 1,5–5°) define a largura das franjas
      const base = 0.45 * Math.sin(a);
      const rel = (0.035 + 0.025 * Math.sin(2 * a + 1)) * Math.max(0.15, k);
      ctx.strokeStyle = p.colorA;
      lines(base - rel / 2, ph(1));
      ctx.strokeStyle = g2;
      lines(base + rel / 2, ph(-1));
      vignette();
      return;
    }

    if (p.mode === 'misto') {
      // anéis por cima de linhas: franjas em parábolas que deslizam
      ctx.strokeStyle = p.colorA;
      lines(0.3 * Math.sin(a), ph(1));
      ctx.strokeStyle = g2;
      rings(cx + m * 0.12 * k * Math.cos(a), cy + m * 0.1 * k * Math.sin(2 * a), ph(-1));
      vignette();
      return;
    }

    // anéis: dois centros orbitando em Lissajous, em oposição
    const ox = m * 0.05 * k * Math.cos(a);
    const oy = m * 0.04 * k * Math.sin(2 * a);
    ctx.strokeStyle = p.colorA;
    rings(cx - ox, cy - oy, ph(1));
    ctx.strokeStyle = g2;
    rings(cx + ox * 0.6 + m * 0.04 * k * Math.sin(a), cy + oy * 0.6, ph(1));
    vignette();
  },
};
