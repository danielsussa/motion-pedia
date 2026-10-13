import { seg, ease, rng, clamp, mixHex } from '../lib/anim.js';

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

const SHADES = 12; // tons pré-calculados da iluminação (agrupa fills)

export default {
  id: 'tile-flip',
  title: 'Tile Flip',
  description: 'A grid of cards flipping in 3D in a cascade: they turn from edge-on to face-forward to cover the frame, then keep turning until they vanish.',
  category: 'transicoes',
  tags: ['transition', '3d', 'alpha'],
  duration: 1.8,
  poster: 0.6,

  params: {
    color: { type: 'color', label: 'Front', default: '#ff4d2e' },
    shadow: { type: 'color', label: 'Flip shadow', default: '#5a1306' },
    cells: { type: 'range', label: 'Cards (short side)', min: 2, max: 16, step: 1, default: 5 },
    axis: { type: 'select', label: 'Axis', options: ['vertical', 'horizontal'], default: 'vertical' },
    order: { type: 'select', label: 'Order', options: ['diagonal', 'centro', 'colunas', 'aleatória'], default: 'diagonal' },
    depth: { type: 'range', label: 'Perspective', min: 0, max: 1, step: 0.01, default: 0.6 },
    gap: { type: 'range', label: 'Flip gap', min: 0, max: 0.4, step: 0.01, default: 0.12 },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 5 },
    colorA: { type: 'color', label: 'Preview A', default: '#1a1c22' },
    colorB: { type: 'color', label: 'Preview B', default: '#e7e2d8' },
    transparent: { type: 'boolean', label: 'Shapes only (alpha)', default: false },
  },

  setup({ w, h, p }) {
    const m = Math.min(w, h);
    const size = m / Math.round(p.cells);
    const cols = Math.ceil(w / size - 1e-6);
    const rows = Math.ceil(h / size - 1e-6);
    // células esticadas para caber exatamente na tela
    const cw = w / cols;
    const ch = h / rows;
    const r = rng(p.seed * 131);
    const maxD = Math.hypot(cols, rows) / 2;
    const tiles = [];
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        let k;
        if (p.order === 'centro') k = Math.hypot(x + 0.5 - cols / 2, y + 0.5 - rows / 2) / maxD;
        else if (p.order === 'colunas') k = x / (cols - 1 || 1);
        else if (p.order === 'aleatória') k = r();
        else k = (x + y) / (cols + rows - 2 || 1);
        tiles.push({ cx: (x + 0.5) * cw, cy: (y + 0.5) * ch, k: clamp(k + (r() - 0.5) * 0.06) });
      }
    const shades = Array.from({ length: SHADES }, (_, i) => mixHex(p.color, p.shadow, (i / (SHADES - 1)) * 0.85));
    return { tiles, cw, ch, shades };
  },

  render(ctx, t, env) {
    const { p, duration, state } = env;
    preview(ctx, t, env);
    const { tiles, cw, ch, shades } = state;
    const mid = duration / 2;
    const life = mid * 0.5;
    const spread = mid * 0.95 - life;
    const vert = p.axis === 'vertical';
    const half = (vert ? cw : ch) / 2; // meia-largura no sentido do giro
    const other = (vert ? ch : cw) / 2;
    const fov = (vert ? cw : ch) * (1.2 + (1 - p.depth) * 8);
    const pad = 0.75;
    const paths = shades.map(() => new Path2D());

    for (const c of tiles) {
      const dIn = c.k * spread;
      const dOut = mid + c.k * spread;
      const a = ease.inOutExpo(seg(t, dIn, dIn + life));
      const b = ease.inOutExpo(seg(t, dOut, dOut + life));
      if (a <= 0 || b >= 1) continue;
      // ângulo: -90° (perfil) → 0 (frente) → +90° (perfil), sempre no mesmo sentido
      const th = (-(1 - a) + b) * (Math.PI / 2);
      const cs = Math.cos(th);
      const sn = Math.sin(th);
      if (cs < 0.004) continue;
      const shrink = 1 - p.gap * Math.abs(sn);
      const hx = half * shrink + pad * cs;
      const ho = other * shrink + pad * cs;
      // borda +: x = hx·cos, z = hx·sin (afasta) — perspectiva encolhe a borda distante
      const z1 = hx * sn;
      const s1 = fov / (fov + z1);
      const s2 = fov / (fov - z1);
      const u1 = hx * cs * s1;
      const u2 = -hx * cs * s2;
      const q = [
        [u1, -ho * s1],
        [u1, ho * s1],
        [u2, ho * s2],
        [u2, -ho * s2],
      ];
      const path = paths[Math.min(SHADES - 1, Math.round(Math.abs(sn) * (SHADES - 1)))];
      q.forEach(([u, v], i) => {
        const X = c.cx + (vert ? u : v);
        const Y = c.cy + (vert ? v : u);
        if (i) path.lineTo(X, Y);
        else path.moveTo(X, Y);
      });
      path.closePath();
    }
    for (let i = 0; i < SHADES; i++) {
      ctx.fillStyle = shades[i];
      ctx.fill(paths[i]);
    }
  },
};
