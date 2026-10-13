import { createNoise } from '../lib/noise.js';

// Joy plot no estilo "Unknown Pleasures": linhas empilhadas de trás para frente; cada uma é
// preenchida com a cor do fundo antes do traço, então esconde as de trás (oclusão de graça).
export default {
  id: 'ridge-lines',
  title: 'Ridge Lines',
  description: 'Stacked ridge lines with peaks pulsing in the center, in the style of the "Unknown Pleasures" cover.',
  category: 'fundos',
  tags: ['background', 'loop', 'pattern', 'data'],
  duration: 8,

  params: {
    color: { type: 'color', label: 'Line color', default: '#f2efe8' },
    accent: { type: 'color', label: 'Accent', default: '#ff5a36' },
    bg: { type: 'color', label: 'Background', default: '#0b0b0d' },
    lines: { type: 'range', label: 'Lines', min: 12, max: 90, step: 1, default: 56 },
    amp: { type: 'range', label: 'Peak height', min: 0.2, max: 3, step: 0.01, default: 1.2 },
    width: { type: 'range', label: 'Width', min: 0.3, max: 1, step: 0.01, default: 0.5 },
    speed: { type: 'range', label: 'Motion', min: 1, max: 4, step: 1, default: 1 },
    highlight: { type: 'boolean', label: 'Highlighted line', default: true },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 21 },
  },

  setup({ p }) {
    return { nz: createNoise(p.seed) };
  },

  render(ctx, t, { w, h, p, progress: u, state }) {
    const { nz } = state;
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, w, h);

    const m = Math.min(w, h);
    // Bloco central em retrato (como a capa); no vertical ocupa quase toda a largura.
    const bw = Math.min(w * 0.86, m * (0.4 + 0.75 * p.width));
    const bh = Math.min(h * 0.8, bw * 1.25);
    const x0 = (w - bw) / 2;
    const y0 = (h - bh) / 2 + bh * 0.08;
    const n = p.lines;
    const gap = (bh * 0.92) / (n - 1);
    const N = 110; // pontos por linha
    const peak = gap * 7 * p.amp;
    const hiIndex = Math.floor(n * 0.62);

    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(1, m * 0.0021);
    const xs = new Float32Array(N + 1);
    const ys = new Float32Array(N + 1);

    for (let i = 0; i < n; i++) {
      const by = y0 + i * gap;
      const row = i * 0.37;
      for (let k = 0; k <= N; k++) {
        const s = k / N;
        // envelope: plano nas bordas, picos concentrados no meio
        const c = (s - 0.5) * 2;
        const env = Math.exp(-c * c * 5.5);
        const big = Math.max(0, nz.loop2(s * 3.2 + 5, row, u, p.speed * 1.4) * 0.5 + 0.5);
        const fine = nz.loop2(s * 14, row + 30, u, p.speed * 2.2);
        const v = env * (Math.pow(big, 2.4) * 1.0 + Math.abs(fine) * 0.18) + Math.abs(fine) * 0.02;
        xs[k] = x0 + s * bw;
        ys[k] = by - v * peak;
      }
      const path = new Path2D();
      path.moveTo(xs[0], ys[0]);
      for (let k = 1; k <= N; k++) path.lineTo(xs[k], ys[k]);
      const fill = new Path2D(path);
      fill.lineTo(xs[N], by + gap * 2);
      fill.lineTo(xs[0], by + gap * 2);
      fill.closePath();
      ctx.fillStyle = p.bg;
      ctx.fill(fill);
      const hi = p.highlight && i === hiIndex;
      ctx.strokeStyle = hi ? p.accent : p.color;
      if (hi) ctx.lineWidth *= 1.6;
      ctx.stroke(path);
      if (hi) ctx.lineWidth /= 1.6;
    }
  },
};
