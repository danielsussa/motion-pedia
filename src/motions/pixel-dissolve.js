import { seg, ease, rng, clamp } from '../lib/anim.js';

// Fundo de prévia das transições: cena "A" antes do meio, "B" depois.
function preview(ctx, t, { w, h, p, duration }) {
  if (p.transparent) return;
  const isA = t < duration / 2;
  ctx.fillStyle = isA ? p.colorA : p.colorB;
  ctx.fillRect(0, 0, w, h);
  const m = Math.min(w, h);
  ctx.font = `800 ${m * 0.32}px Inter, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = isA ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.14)';
  ctx.fillText(isA ? 'A' : 'B', w / 2, h / 2 + m * 0.02);
}

export default {
  id: 'pixel-dissolve',
  title: 'Pixel Dissolve',
  description: 'Mosaico de blocos que surgem em ordem aleatória, em onda diagonal ou a partir do centro, fecham a tela e se desfazem.',
  category: 'transicoes',
  tags: ['transição', 'padrão', 'alpha'],
  duration: 1.6,
  poster: 0.55,

  params: {
    color1: { type: 'color', label: 'Cor 1', default: '#ff4d2e' },
    color2: { type: 'color', label: 'Cor 2', default: '#111114' },
    color3: { type: 'color', label: 'Cor 3', default: '#f4f1ea' },
    mix: { type: 'range', label: 'Mistura de cores', min: 0, max: 1, step: 0.01, default: 0.22 },
    cells: { type: 'range', label: 'Blocos (lado menor)', min: 4, max: 40, step: 1, default: 12 },
    order: { type: 'select', label: 'Ordem', options: ['aleatória', 'onda diagonal', 'centro', 'horizontal'], default: 'onda diagonal' },
    jitter: { type: 'range', label: 'Desordem', min: 0, max: 1, step: 0.01, default: 0.35 },
    pop: { type: 'select', label: 'Bloco', options: ['cresce', 'instantâneo'], default: 'cresce' },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 7 },
    colorA: { type: 'color', label: 'Prévia A', default: '#1a1c22' },
    colorB: { type: 'color', label: 'Prévia B', default: '#e7e2d8' },
    transparent: { type: 'boolean', label: 'Só as formas (alpha)', default: false },
  },

  setup({ w, h, p }) {
    const m = Math.min(w, h);
    const size = m / Math.round(p.cells);
    const cols = Math.ceil(w / size);
    const rows = Math.ceil(h / size);
    const ox = (w - cols * size) / 2;
    const oy = (h - rows * size) / 2;
    const r = rng(p.seed * 7919);
    const cells = [];
    const maxD = Math.hypot(cols, rows) / 2;
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        const rnd = r();
        let k;
        if (p.order === 'aleatória') k = rnd;
        else {
          if (p.order === 'onda diagonal') k = (x + y) / (cols + rows - 2 || 1);
          else if (p.order === 'centro') k = Math.hypot(x + 0.5 - cols / 2, y + 0.5 - rows / 2) / maxD;
          else k = x / (cols - 1 || 1);
          k = clamp(k * (1 - p.jitter * 0.6) + rnd * p.jitter * 0.6);
        }
        // cor: maioria cor 1; `mix` espalha cor 2 / cor 3
        const c = r();
        const ci = c < p.mix * 0.5 ? 1 : c < p.mix ? 2 : 0;
        cells.push({ x: ox + x * size, y: oy + y * size, k, ci, k2: clamp(k + (r() - 0.5) * 0.12) });
      }
    return { cells, size };
  },

  render(ctx, t, env) {
    const { w, h, p, duration, state } = env;
    preview(ctx, t, env);
    const { cells, size } = state;
    const mid = duration / 2;
    const life = mid * (p.pop === 'instantâneo' ? 0.06 : 0.32);
    const spread = mid * 0.95 - life;
    const pad = 0.75; // sobreposição: sem frestas de anti-alias
    const cols = [p.color1, p.color2, p.color3];
    // A cascata acelera (inOutExpo no tempo de cada bloco), cada bloco cresce com outExpo.
    const paths = [new Path2D(), new Path2D(), new Path2D()];
    for (const c of cells) {
      const dIn = ease.inOutCubic(c.k) * spread;
      const dOut = mid + ease.inOutCubic(c.k2) * spread;
      const a = seg(t, dIn, dIn + life);
      const b = seg(t, dOut, dOut + life);
      let s;
      if (p.pop === 'instantâneo') s = a >= 0.5 && b < 0.5 ? 1 : 0;
      else s = ease.outExpo(a) * (1 - ease.inExpo(b));
      if (s <= 0.001) continue;
      const q = (size * s) / 2 + (s >= 0.999 ? pad : 0);
      const cx = c.x + size / 2;
      const cy = c.y + size / 2;
      paths[c.ci].rect(cx - q, cy - q, q * 2, q * 2);
    }
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = cols[i];
      ctx.fill(paths[i]);
    }
  },
};
