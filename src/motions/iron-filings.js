import { TAU, rng, rgba, mixHex, clamp } from '../lib/anim.js';

// Limalha de ferro: milhares de traços curtos (posições fixas, sorteadas no setup) orientados pelo campo
// de ímãs em barra que se movem em órbita. Cada polo é uma "carga" com campo 1/r² (B = q·d/|d|³).
// Longe dos ímãs o campo é fraco: a limalha fica na orientação sorteada e apagada; perto, alinha,
// cresce e acende. Desenho em lotes: um Path2D por nível de opacidade.

const LEVELS = 7;

function paintBg(w, h, px, p) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * px));
  c.height = Math.max(1, Math.round(h * px));
  const g = c.getContext('2d');
  g.scale(px, px);
  g.fillStyle = p.bg;
  g.fillRect(0, 0, w, h);
  const m = Math.min(w, h);
  // luz suave de cima (mesma cor, variando só alpha) + vinheta
  const lit = g.createRadialGradient(w * 0.5, h * 0.42, 0, w * 0.5, h * 0.42, Math.hypot(w, h) * 0.55);
  lit.addColorStop(0, rgba(p.color, 0.06));
  lit.addColorStop(1, rgba(p.color, 0));
  g.fillStyle = lit;
  g.fillRect(0, 0, w, h);
  const v = g.createRadialGradient(w / 2, h / 2, m * 0.3, w / 2, h / 2, Math.hypot(w, h) * 0.62);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.5)');
  g.fillStyle = v;
  g.fillRect(0, 0, w, h);
  return c;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export default {
  id: 'iron-filings',
  title: 'Iron Filings',
  description: 'Iron filings aligning to the field lines of orbiting, spinning bar magnets.',
  category: 'particulas',
  tags: ['particles', 'simulation', 'loop', 'background'],
  duration: 16,
  poster: 3,

  params: {
    bg: { type: 'color', label: 'Background', default: '#0f1013' },
    color: { type: 'color', label: 'Filings', default: '#c9ced8' },
    accent: { type: 'color', label: 'North pole', default: '#e5484d' },
    magnets: { type: 'range', label: 'Magnets', min: 1, max: 4, step: 1, default: 2 },
    density: { type: 'range', label: 'Density', min: 30, max: 120, step: 1, default: 72 },
    length: { type: 'range', label: 'Length', min: 0.4, max: 2, step: 0.01, default: 1 },
    strength: { type: 'range', label: 'Field strength', min: 0.2, max: 3, step: 0.01, default: 1 },
    showMagnets: { type: 'boolean', label: 'Show magnets', default: true },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 7 },
  },

  setup({ w, h, px, p }) {
    const rand = rng(p.seed);
    const m = Math.min(w, h);
    const cell = m / p.density;
    const cols = Math.ceil(w / cell) + 1;
    const rows = Math.ceil(h / cell) + 1;
    const n = cols * rows;
    const fx = new Float32Array(n), fy = new Float32Array(n);
    const rx = new Float32Array(n), ry = new Float32Array(n), fl = new Float32Array(n), fa = new Float32Array(n);
    let k = 0;
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < cols; i++) {
        fx[k] = (i + rand()) * cell - cell / 2;
        fy[k] = (j + rand()) * cell - cell / 2;
        const a = rand() * TAU;
        rx[k] = Math.cos(a);
        ry[k] = Math.sin(a);
        fl[k] = 0.55 + rand() * 0.9;
        fa[k] = 0.6 + rand() * 0.4;
        k++;
      }
    const mags = Array.from({ length: p.magnets }, (_, i) => ({
      spin: p.magnets === 1 ? 1 : [1, -1, 0, 1][i] ?? 1,
      ph: rand() * TAU,
      ph2: rand() * TAU,
      off: rand() * TAU,
    }));
    return { n, fx, fy, rx, ry, fl, fa, cell, mags, bg: paintBg(w, h, Math.min(1, px || 1), p) };
  },

  render(ctx, t, { w, h, p, progress: u, state }) {
    const S = state;
    const m = Math.min(w, h);
    ctx.drawImage(S.bg, 0, 0, w, h);

    // —— ímãs: posição/ângulo em loop (voltas inteiras de u)
    const N = S.mags.length;
    const Lm = m * 0.2;
    const Tm = Lm * 0.28;
    const poleD = Lm * 0.36;
    const mags = S.mags.map((g, i) => {
      let cx, cy, ang;
      if (N === 1) {
        cx = w / 2 + Math.sin(TAU * u + g.ph) * w * 0.2;
        cy = h / 2 + Math.sin(TAU * 2 * u + g.ph2) * h * 0.14;
        ang = g.off + TAU * u + 0.5 * Math.sin(TAU * 2 * u);
      } else {
        const th = (TAU * i) / N + TAU * u + g.ph * 0.2;
        const rr = 1 + 0.18 * Math.sin(TAU * 2 * u + g.ph2);
        cx = w / 2 + Math.cos(th) * w * 0.24 * rr;
        cy = h / 2 + Math.sin(th) * h * (h > w ? 0.27 : 0.2) * rr;
        ang = g.off + TAU * g.spin * u + 0.6 * Math.sin(TAU * u + g.ph);
      }
      const c = Math.cos(ang), s = Math.sin(ang);
      return { cx, cy, c, s, nx: cx + c * poleD, ny: cy + s * poleD, sx: cx - c * poleD, sy: cy - s * poleD };
    });

    // —— limalha
    const paths = Array.from({ length: LEVELS }, () => new Path2D());
    const eps2 = (Lm * 0.08) ** 2;
    const K = Lm * Lm * p.strength;
    const baseLen = S.cell * 0.62 * p.length;
    const hw = Lm / 2 + S.cell * 0.3, hh = Tm / 2 + S.cell * 0.3;
    const { fx, fy, rx, ry, fl, fa } = S;
    outer: for (let k = 0; k < S.n; k++) {
      const x = fx[k], y = fy[k];
      let bx = 0, by = 0;
      for (let i = 0; i < N; i++) {
        const g = mags[i];
        if (p.showMagnets) {
          const lx = (x - g.cx) * g.c + (y - g.cy) * g.s;
          const ly = -(x - g.cx) * g.s + (y - g.cy) * g.c;
          if (Math.abs(lx) < hw && Math.abs(ly) < hh) continue outer; // embaixo do ímã
        }
        let dx = x - g.nx, dy = y - g.ny;
        let d2 = dx * dx + dy * dy + eps2;
        let f = 1 / (d2 * Math.sqrt(d2));
        bx += dx * f;
        by += dy * f;
        dx = x - g.sx;
        dy = y - g.sy;
        d2 = dx * dx + dy * dy + eps2;
        f = 1 / (d2 * Math.sqrt(d2));
        bx -= dx * f;
        by -= dy * f;
      }
      const B = Math.hypot(bx, by) * K + 1e-9;
      const align = 1 - Math.exp(-B * 9);
      const vis = 1 - Math.exp(-B * 1.6);
      // orientação: mistura a sorteada (com o mesmo sentido do campo) com a do campo
      let ox = rx[k], oy = ry[k];
      const ux = (bx / B) * K, uy = (by / B) * K;
      if (ox * ux + oy * uy < 0) (ox = -ox), (oy = -oy);
      let dx = ux * align + ox * (1 - align), dy = uy * align + oy * (1 - align);
      const dl = Math.hypot(dx, dy) || 1;
      const L = baseLen * fl[k] * (0.55 + 0.75 * vis);
      dx = (dx / dl) * L * 0.5;
      dy = (dy / dl) * L * 0.5;
      const a = clamp((0.1 + 0.9 * vis) * fa[k]);
      const lv = Math.min(LEVELS - 1, Math.floor(a * LEVELS));
      paths[lv].moveTo(x - dx, y - dy);
      paths[lv].lineTo(x + dx, y + dy);
    }
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(0.6, S.cell * 0.13);
    for (let i = 0; i < LEVELS; i++) {
      ctx.strokeStyle = rgba(p.color, (i + 0.5) / LEVELS);
      ctx.stroke(paths[i]);
    }

    // —— ímãs
    if (!p.showMagnets) return;
    const B0 = ctx.getTransform();
    const r = Tm * 0.22;
    const S2 = mixHex(p.bg, '#ffffff', 0.62);
    for (const g of mags) {
      ctx.save();
      ctx.translate(g.cx, g.cy);
      ctx.rotate(Math.atan2(g.s, g.c));
      // sombra barata: 2 retângulos escuros deslocados
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      roundRect(ctx, -Lm / 2 + Tm * 0.06, -Tm / 2 + Tm * 0.16, Lm, Tm, r);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      roundRect(ctx, -Lm / 2 - Tm * 0.08, -Tm / 2 + Tm * 0.02, Lm + Tm * 0.16, Tm + Tm * 0.3, r * 1.6);
      ctx.fill();
      roundRect(ctx, -Lm / 2, -Tm / 2, Lm, Tm, r);
      ctx.save();
      ctx.clip();
      ctx.fillStyle = S2;
      ctx.fillRect(-Lm / 2, -Tm / 2, Lm / 2, Tm);
      ctx.fillStyle = p.accent;
      ctx.fillRect(0, -Tm / 2, Lm / 2, Tm);
      // brilho na aresta de cima
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(-Lm / 2, -Tm / 2, Lm, Tm * 0.22);
      ctx.fillStyle = 'rgba(0,0,0,0.16)';
      ctx.fillRect(-Lm / 2, Tm * 0.3, Lm, Tm * 0.2);
      ctx.restore();
      // letras N / S (sempre em pé)
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.font = `600 ${Tm * 0.5}px "JetBrains Mono"`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const [lab, sx] of [['N', Lm * 0.3], ['S', -Lm * 0.3]]) {
        ctx.save();
        ctx.translate(sx, 0);
        ctx.rotate(-Math.atan2(g.s, g.c));
        ctx.fillText(lab, 0, Tm * 0.03);
        ctx.restore();
      }
      ctx.restore();
    }
    ctx.setTransform(B0);
  },
};
