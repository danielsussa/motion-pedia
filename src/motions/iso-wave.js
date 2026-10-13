import { TAU, hexToRgb, lerp, clamp } from '../lib/anim.js';

// Colunas isométricas numa grade n×n; a altura segue uma onda (radial, diagonal ou duas fontes).
// Sombreamento por face: topo na cor da altura, lateral esquerda e direita escurecidas.
// Pintura de trás para frente pela diagonal i+j (colunas na mesma diagonal não se sobrepõem).

const C30 = Math.cos(Math.PI / 6);
const rgbStr = (c, k = 1) => `rgb(${Math.round(c[0] * k)},${Math.round(c[1] * k)},${Math.round(c[2] * k)})`;

export default {
  id: 'iso-wave',
  title: 'Isometric Wave',
  description: 'Grade de colunas isométricas subindo e descendo numa onda, com sombreamento por face e topo colorido pela altura.',
  category: 'formas',
  tags: ['3d', 'padrão', 'loop'],
  duration: 6,

  params: {
    grid: { type: 'range', label: 'Grade', min: 6, max: 26, step: 1, default: 16 },
    wave: { type: 'select', label: 'Onda', options: ['radial', 'diagonal', 'duas fontes'], default: 'radial' },
    amp: { type: 'range', label: 'Amplitude', min: 0.5, max: 8, step: 0.1, default: 3 },
    freq: { type: 'range', label: 'Frequência', min: 0.1, max: 1.2, step: 0.01, default: 0.78 },
    cycles: { type: 'range', label: 'Ciclos/loop', min: 1, max: 4, step: 1, default: 1 },
    gap: { type: 'range', label: 'Vão', min: 0, max: 0.5, step: 0.01, default: 0.12 },
    low: { type: 'color', label: 'Cor baixa', default: '#2b2f3a' },
    high: { type: 'color', label: 'Cor alta', default: '#ff6a3d' },
    bg: { type: 'color', label: 'Fundo', default: '#0c0d11' },
    zoom: { type: 'range', label: 'Zoom', min: 0.6, max: 2.5, step: 0.05, default: 1 },
  },

  render(ctx, t, { w, h, p, progress: u }) {
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, w, h);
    // vinheta clara atrás da grade
    const m = Math.min(w, h);
    const glow = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.6);
    const [br, bgc, bb] = hexToRgb(p.high);
    glow.addColorStop(0, `rgba(${br},${bgc},${bb},0.08)`);
    glow.addColorStop(1, `rgba(${br},${bgc},${bb},0)`);
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    const n = p.grid;
    const base = 0.35;
    const hMax = base + p.amp;
    // escala que cabe na tela: largura 2·n·cos30, altura n + hMax (em unidades)
    const S = Math.min((w * 0.86) / (2 * n * C30), (h * 0.8) / (n + hMax)) * p.zoom;
    const cx = w / 2;
    const cy = h / 2 + (hMax * S) / 2;
    const P = (x, y, z) => [cx + (x - y) * C30 * S, cy + ((x + y) * 0.5 - z) * S];

    const lo = hexToRgb(p.low);
    const hi = hexToRgb(p.high);
    const phase = TAU * p.cycles * u;
    const f = 1 - p.gap;
    const half = n / 2;
    const k = p.freq;

    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(0.6, m * 0.0008);
    for (let s = 0; s <= 2 * (n - 1); s++) {
      for (let i = Math.max(0, s - n + 1); i <= Math.min(n - 1, s); i++) {
        const j = s - i;
        const gx = i - half + 0.5;
        const gy = j - half + 0.5;
        let v;
        if (p.wave === 'diagonal') v = 0.5 + 0.5 * Math.sin((gx + gy) * k * 0.75 - phase);
        else if (p.wave === 'duas fontes') {
          const d1 = Math.hypot(gx + half * 0.5, gy - half * 0.5);
          const d2 = Math.hypot(gx - half * 0.5, gy + half * 0.5);
          v = 0.5 + 0.25 * (Math.sin(d1 * k - phase) + Math.sin(d2 * k - phase));
        } else v = 0.5 + 0.5 * Math.sin(Math.hypot(gx, gy) * k - phase);
        v = clamp(v);
        const e = v * v * (3 - 2 * v); // achata vales e cristas
        const z = base + p.amp * e;

        const x0 = gx - f / 2;
        const y0 = gy - f / 2;
        const x1 = gx + f / 2;
        const y1 = gy + f / 2;
        const tA = P(x0, y0, z);
        const tB = P(x1, y0, z);
        const tC = P(x1, y1, z);
        const tD = P(x0, y1, z);
        const bB = P(x1, y0, 0);
        const bC = P(x1, y1, 0);
        const bD = P(x0, y1, 0);

        const c = [lerp(lo[0], hi[0], e), lerp(lo[1], hi[1], e), lerp(lo[2], hi[2], e)];

        // face x = x1 (direita, mais escura)
        ctx.fillStyle = rgbStr(c, 0.48);
        ctx.beginPath();
        ctx.moveTo(tB[0], tB[1]);
        ctx.lineTo(tC[0], tC[1]);
        ctx.lineTo(bC[0], bC[1]);
        ctx.lineTo(bB[0], bB[1]);
        ctx.closePath();
        ctx.fill();
        // face y = y1 (esquerda)
        ctx.fillStyle = rgbStr(c, 0.7);
        ctx.beginPath();
        ctx.moveTo(tD[0], tD[1]);
        ctx.lineTo(tC[0], tC[1]);
        ctx.lineTo(bC[0], bC[1]);
        ctx.lineTo(bD[0], bD[1]);
        ctx.closePath();
        ctx.fill();
        // topo + aresta clara
        ctx.fillStyle = rgbStr(c, 1);
        ctx.beginPath();
        ctx.moveTo(tA[0], tA[1]);
        ctx.lineTo(tB[0], tB[1]);
        ctx.lineTo(tC[0], tC[1]);
        ctx.lineTo(tD[0], tD[1]);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = `rgba(255,255,255,${0.06 + 0.22 * e})`;
        ctx.stroke();
      }
    }
  },
};
