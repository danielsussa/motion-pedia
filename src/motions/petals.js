import { TAU, rng, rgba, mixHex, fract } from '../lib/anim.js';

// Pétalas / folhas / confete caindo em loop perfeito. Cada peça: polígono-base (curvas amostradas no
// setup), um eixo de giro no próprio plano e um ângulo de "flip" — a componente perpendicular ao eixo é
// achatada por cos(flip) (rotação 3D barata). Flip, giro, balanço e queda usam frequências inteiras do
// progresso e passagens inteiras por loop. Desenho em lotes: camada × cor × tom (frente/verso, de lado).

const hash = (a, b) => {
  let x = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263);
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
};

// amostra uma sequência de curvas cúbicas [x0,y0, c1x,c1y, c2x,c2y, x1,y1] num polígono
function sampleCubics(curves, n = 8) {
  const pts = [];
  for (const [x0, y0, ax, ay, bx, by, x1, y1] of curves) {
    for (let i = 0; i < n; i++) {
      const t = i / n, s = 1 - t;
      pts.push([
        s * s * s * x0 + 3 * s * s * t * ax + 3 * s * t * t * bx + t * t * t * x1,
        s * s * s * y0 + 3 * s * s * t * ay + 3 * s * t * t * by + t * t * t * y1,
      ]);
    }
  }
  return pts;
}

const SHAPES = {
  // pétala de cerejeira: base afilada embaixo, entalhe em cima
  petal: sampleCubics([
    [0, 1, 0.5, 0.65, 0.78, -0.35, 0.4, -0.95],
    [0.4, -0.95, 0.3, -1.05, 0.12, -0.98, 0, -0.76],
    [0, -0.76, -0.12, -0.98, -0.3, -1.05, -0.4, -0.95],
    [-0.4, -0.95, -0.78, -0.35, -0.5, 0.65, 0, 1],
  ]),
  // folha: pontas finas, levemente assimétrica
  leaf: sampleCubics([
    [0, -1, 0.55, -0.62, 0.62, 0.42, 0, 1],
    [0, 1, -0.5, 0.45, -0.6, -0.55, 0, -1],
  ], 10),
  rect: [[-0.55, -1], [0.55, -1], [0.55, 1], [-0.55, 1]],
};

const PALETTES = {
  sakura: ['#ffc9d6', '#ffaec4', '#fff0f4'],
  outono: ['#e4672c', '#b8361d', '#f2ae3c', '#8a3a1a'],
  confete: ['#ff5233', '#ffc93c', '#3b7bff', '#f4f1ea'],
};

const LAYERS = 3;

export default {
  id: 'petals',
  title: 'Petals',
  description: 'Cherry blossoms, autumn leaves or paper confetti falling, spinning in 3D and swaying in the wind.',
  category: 'particulas',
  tags: ['particles', 'loop', '3d', 'overlay', 'alpha'],
  duration: 10,

  params: {
    mode: { type: 'select', label: 'Type', options: ['sakura', 'outono', 'confete'], default: 'sakura' },
    bg: { type: 'color', label: 'Background', default: '#17121a' },
    transparent: { type: 'boolean', label: 'Transparent background', default: false },
    custom: { type: 'boolean', label: 'Custom colors', default: false },
    c1: { type: 'color', label: 'Color 1', default: '#ffaec4' },
    c2: { type: 'color', label: 'Color 2', default: '#fff0f4' },
    count: { type: 'range', label: 'Amount', min: 10, max: 250, step: 1, default: 90 },
    size: { type: 'range', label: 'Size', min: 0.4, max: 2.5, step: 0.01, default: 1 },
    wind: { type: 'range', label: 'Wind', min: -1, max: 1, step: 0.01, default: 0.3 },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 8 },
  },

  setup({ w, h, px, p }) {
    const rand = rng(p.seed);
    const palette = p.custom ? [p.c1, p.c2, mixHexToHex(p.c1, p.c2, 0.5)] : PALETTES[p.mode] ?? PALETTES.sakura;
    const shape = p.mode === 'outono' ? 'leaf' : p.mode === 'confete' ? 'rect' : 'petal';
    // tons: 0 frente, 1 frente de lado (escura), 2 verso, 3 verso de lado
    const tones = palette.map((c) => [c, mixHex(c, '#000000', 0.22), mixHex(c, '#000000', 0.14), mixHex(c, '#000000', 0.34)]);
    const items = [];
    for (let i = 0; i < p.count; i++) {
      const d = Math.pow(rand(), 0.8);
      const laps = d < 0.45 ? 1 : 2;
      items.push({
        d,
        layer: Math.min(LAYERS - 1, Math.floor(d * LAYERS)),
        laps,
        r: rand(),
        extra: rand() * 0.5,
        color: Math.floor(rand() * palette.length),
        axis: rand() * Math.PI,
        f0: rand() * TAU,
        fN: (1 + Math.floor(rand() * 4)) * (rand() < 0.5 ? -1 : 1) * (shape === 'rect' ? 2 : 1), // flips por passagem
        r0: rand() * TAU,
        rN: Math.floor(rand() * 3) - 1, // voltas inteiras por passagem
        sw: 1 + Math.floor(rand() * 2),
        swP: rand() * TAU,
        swA: 0.04 + rand() * 0.06,
        aspect: shape === 'rect' ? 0.55 + rand() * 0.45 : 0.85 + rand() * 0.3,
        scale: 0.8 + rand() * 0.45,
        seed: i * 13 + 5,
      });
    }
    items.sort((a, b) => a.d - b.d);
    const bg = p.transparent ? null : paintBg(w, h, Math.min(1, px || 1), p, tones);
    return { items, tones, bg, shape: SHAPES[shape], veins: shape === 'leaf', k: shape === 'leaf' ? 1.25 : shape === 'rect' ? 0.8 : 1 };
  },

  render(ctx, t, { w, h, p, duration, state }) {
    const S = Math.min(w, h);
    const u = t / duration;

    if (!p.transparent) ctx.drawImage(state.bg, 0, 0, w, h);

    const nC = state.tones.length;
    const batches = Array.from({ length: LAYERS * nC * 4 }, () => new Path2D());
    const veins = Array.from({ length: LAYERS }, () => new Path2D());
    const shape = state.shape;
    const m = S * 0.1;
    const W = w + 2 * m;

    for (const o of state.items) {
      const ph = u * o.laps + o.r;
      const k = Math.floor(ph) % o.laps;
      const s = fract(ph);
      const span = (h + 2 * m) * (1 + o.extra);
      const y = -m + span * s;
      if (y > h + m) continue;
      const lp = u * o.laps; // tempo em passagens (inteiro no fim do loop)
      const sp = 0.4 + 0.6 * o.d;
      const swing = Math.sin(TAU * o.sw * lp + o.swP);
      const drift = p.wind * S * 0.8 * sp * s * (span / (h + 2 * m));
      const x = ((((hash(o.seed, k) * W + drift + swing * o.swA * S * 1.6 * sp) % W) + W) % W) - m;

      const flip = o.f0 + TAU * o.fN * lp;
      const c = Math.cos(flip);
      // giro: voltas inteiras + pêndulo acoplado ao balanço (folha "planando")
      const rot = o.r0 + TAU * o.rN * lp + 0.6 * Math.cos(TAU * o.sw * lp + o.swP);
      const size = S * 0.024 * p.size * o.scale * (0.35 + 0.95 * o.d) * state.k;
      const ca = Math.cos(o.axis), sa = Math.sin(o.axis);
      const cr = Math.cos(rot), sr = Math.sin(rot);
      const face = c >= 0 ? 0 : 2;
      const edge = Math.abs(c) < 0.45 ? 1 : 0;
      const P = batches[(o.layer * nC + o.color) * 4 + face + edge];
      const fl = Math.max(0.06, Math.abs(c));
      for (let i = 0; i < shape.length; i++) {
        const lx = shape[i][0] * o.aspect, ly = shape[i][1];
        // para o eixo do flip: (a, b); achata b; volta e aplica giro
        const a = lx * ca + ly * sa;
        const b = (-lx * sa + ly * ca) * fl;
        const qx = a * ca - b * sa, qy = a * sa + b * ca;
        const px = x + (qx * cr - qy * sr) * size;
        const py = y + (qx * sr + qy * cr) * size;
        if (i === 0) P.moveTo(px, py);
        else P.lineTo(px, py);
      }
      P.closePath();
      if (state.veins && fl > 0.35) {
        // nervura central (eixo y local)
        const V = veins[o.layer];
        for (const ly of [-0.85, 0.95]) {
          const a = ly * sa, b = ly * ca * fl;
          const qx = a * ca - b * sa, qy = a * sa + b * ca;
          const px = x + (qx * cr - qy * sr) * size, py = y + (qx * sr + qy * cr) * size;
          if (ly < 0) V.moveTo(px, py);
          else V.lineTo(px, py);
        }
      }
    }

    for (let L = 0; L < LAYERS; L++) {
      ctx.globalAlpha = [0.6, 0.85, 1][L];
      for (let ci = 0; ci < nC; ci++) {
        for (let tn = 0; tn < 4; tn++) {
          ctx.fillStyle = state.tones[ci][tn];
          ctx.fill(batches[(L * nC + ci) * 4 + tn]);
        }
      }
      if (state.veins) {
        ctx.strokeStyle = 'rgba(60,20,8,0.45)';
        ctx.lineWidth = S * 0.0012 * p.size * (0.6 + 0.6 * L);
        ctx.stroke(veins[L]);
      }
    }
    ctx.globalAlpha = 1;
  },
};

// fundo estático, pintado uma vez no setup
function paintBg(w, h, px, p, tones) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * px));
  c.height = Math.max(1, Math.round(h * px));
  const ctx = c.getContext('2d');
  ctx.scale(px, px);
  const accent = tones[0][0];
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, p.bg);
  g.addColorStop(1, mixHex(p.bg, '#000000', 0.35));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const R = Math.hypot(w, h) * 0.6;
  const lg = ctx.createRadialGradient(w * 0.3, h * 0.15, 0, w * 0.3, h * 0.15, R);
  lg.addColorStop(0, rgba(accent, 0.13));
  lg.addColorStop(1, rgba(accent, 0));
  ctx.fillStyle = lg;
  ctx.fillRect(0, 0, w, h);
  return c;
}

function mixHexToHex(a, b, t) {
  const m = mixHex(a, b, t).match(/\d+/g).map(Number);
  return '#' + m.map((v) => v.toString(16).padStart(2, '0')).join('');
}
