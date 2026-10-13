import { mixHex, hexToRgb } from '../lib/anim.js';
import { createNoise } from '../lib/noise.js';

// Curvas de nível (marching squares) sobre um ruído que fecha o loop (noise.loop2).
// Grade de amostras em resolução relativa a min(w,h); linhas finas num Path2D e as "mestras"
// (a cada N níveis) em outro, com a cor de destaque. Sombreamento de relevo opcional em ImageData.

// segmentos por caso (arestas: 0 topo, 1 direita, 2 base, 3 esquerda)
const SEGS = [
  [], [3, 2], [2, 1], [3, 1], [0, 1], [3, 0, 2, 1], [0, 2], [3, 0],
  [3, 0], [0, 2], [0, 1, 3, 2], [0, 1], [3, 1], [2, 1], [3, 2], [],
];

export default {
  id: 'topo-contours',
  title: 'Topographic',
  description: 'Curvas de nível de um relevo que respira em loop, com linhas mestras em destaque.',
  category: 'fundos',
  tags: ['fundo', 'loop', 'padrão'],
  duration: 12,

  params: {
    bg: { type: 'color', label: 'Fundo', default: '#0c0d10' },
    line: { type: 'color', label: 'Linhas', default: '#d9d4c7' },
    accent: { type: 'color', label: 'Mestras', default: '#ff7a3d' },
    levels: { type: 'range', label: 'Níveis', min: 6, max: 40, step: 1, default: 22 },
    major: { type: 'range', label: 'Mestra a cada', min: 0, max: 10, step: 1, default: 5 },
    scale: { type: 'range', label: 'Escala', min: 0.5, max: 4, step: 0.05, default: 1.5 },
    speed: { type: 'range', label: 'Evolução', min: 0.2, max: 3, step: 0.05, default: 1.1 },
    weight: { type: 'range', label: 'Espessura', min: 0.5, max: 4, step: 0.1, default: 1.4 },
    shade: { type: 'boolean', label: 'Relevo sombreado', default: true },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 11 },
  },

  setup({ w, h, p, px }) {
    const m = Math.min(w, h);
    // miniaturas (px pequeno) usam grade mais grossa
    const cell = m / (px < 0.5 ? 55 : 85);
    const cols = Math.ceil(w / cell) + 1;
    const rows = Math.ceil(h / cell) + 1;
    const shadeCanvas = document.createElement('canvas');
    shadeCanvas.width = cols;
    shadeCanvas.height = rows;
    const sctx = shadeCanvas.getContext('2d');
    return {
      noise: createNoise(p.seed),
      cell, cols, rows,
      field: new Float32Array(cols * rows),
      shadeCanvas, sctx,
      img: sctx.createImageData(cols, rows),
    };
  },

  render(ctx, t, { w, h, p, progress: u, state }) {
    const { noise, cell, cols, rows, field } = state;
    const m = Math.min(w, h);
    const s = p.scale / m;
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, w, h);

    // campo: oitava base + detalhe, ambos fechando o loop
    for (let j = 0; j < rows; j++) {
      const y = (j * cell - h / 2) * s;
      for (let i = 0; i < cols; i++) {
        const x = (i * cell - w / 2) * s;
        field[j * cols + i] =
          0.78 * noise.loop2(x, y, u, p.speed) + 0.28 * noise.loop2(x * 2.4 + 31.7, y * 2.4 - 12.3, u, p.speed * 1.6);
      }
    }

    // relevo: cor por altitude + luz vinda de cima à esquerda
    if (p.shade) {
      const d = state.img.data;
      const [br, bgc, bb] = hexToRgb(p.bg);
      const [lr, lg, lb] = hexToRgb(mixHex(p.bg, p.line, 0.16));
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const k = j * cols + i;
          const v = field[k];
          const gx = field[j * cols + Math.min(i + 1, cols - 1)] - field[j * cols + Math.max(i - 1, 0)];
          const gy = field[Math.min(j + 1, rows - 1) * cols + i] - field[Math.max(j - 1, 0) * cols + i];
          const lit = Math.max(0, Math.min(1, 0.5 + 0.5 * (v * 0.6) - (gx + gy) * 2.2));
          const o = k * 4;
          d[o] = br + (lr - br) * lit;
          d[o + 1] = bgc + (lg - bgc) * lit;
          d[o + 2] = bb + (lb - bb) * lit;
          d[o + 3] = 255;
        }
      }
      state.sctx.putImageData(state.img, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'low';
      ctx.drawImage(state.shadeCanvas, -cell / 2, -cell / 2, cols * cell, rows * cell);
    }

    // marching squares
    const L = p.levels;
    const lo = -1;
    const step = 2 / L;
    const thin = new Path2D();
    const major = new Path2D();
    const ex = new Float32Array(4);
    const ey = new Float32Array(4);
    for (let j = 0; j < rows - 1; j++) {
      const y0 = j * cell;
      for (let i = 0; i < cols - 1; i++) {
        const a = field[j * cols + i];
        const b = field[j * cols + i + 1];
        const c = field[(j + 1) * cols + i + 1];
        const dd = field[(j + 1) * cols + i];
        const mn = Math.min(a, b, c, dd);
        const mx = Math.max(a, b, c, dd);
        const k0 = Math.floor((mn - lo) / step) + 1;
        const k1 = Math.floor((mx - lo) / step);
        if (k1 < k0) continue;
        const x0 = i * cell;
        for (let k = k0; k <= k1; k++) {
          const lv = lo + k * step;
          const idx = (a > lv ? 8 : 0) | (b > lv ? 4 : 0) | (c > lv ? 2 : 0) | (dd > lv ? 1 : 0);
          const seg = SEGS[idx];
          if (!seg.length) continue;
          ex[0] = x0 + ((lv - a) / (b - a)) * cell; ey[0] = y0;
          ex[1] = x0 + cell; ey[1] = y0 + ((lv - b) / (c - b)) * cell;
          ex[2] = x0 + ((lv - dd) / (c - dd)) * cell; ey[2] = y0 + cell;
          ex[3] = x0; ey[3] = y0 + ((lv - a) / (dd - a)) * cell;
          const path = p.major > 0 && k % p.major === 0 ? major : thin;
          for (let q = 0; q < seg.length; q += 2) {
            path.moveTo(ex[seg[q]], ey[seg[q]]);
            path.lineTo(ex[seg[q + 1]], ey[seg[q + 1]]);
          }
        }
      }
    }
    const lw = (p.weight * m) / 1080;
    ctx.lineCap = 'butt';
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = p.line;
    ctx.lineWidth = lw;
    ctx.stroke(thin);
    ctx.globalAlpha = 0.95;
    ctx.strokeStyle = p.accent;
    ctx.lineWidth = lw * 1.8;
    ctx.stroke(major);
    ctx.globalAlpha = 1;

    // vinheta
    const g = ctx.createRadialGradient(w / 2, h / 2, m * 0.3, w / 2, h / 2, Math.hypot(w, h) * 0.6);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  },
};
