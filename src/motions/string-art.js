import { TAU, clamp, seg, ease, lerp, hexToRgb, spring } from '../lib/anim.js';

// String art: pregos num aro (ou num quadrado) e linhas retas entre eles. Cada linha é reta, mas o
// conjunto desenha uma curva — o envelope (cardioide com i → 2i, nefroide com i → 3i, parábolas entre
// dois lados de um quadrado). Linha do tempo: pregos surgem em stagger → linhas esticam uma a uma
// (a ponta brilha como a agulha) → pausa → as linhas soltam na mesma ordem → pregos somem (loop vazio).
// Linhas prontas são desenhadas em lotes por faixa de cor (um stroke por lote).

const BUCKETS = 8;

// Cada preset devolve { nails: [[x,y]...] em -1..1, lines: [[a,b]...], board: 'circle'|'square' }
const PRESETS = {
  cardioide: (n) => circleTimes(n, 2),
  nefroide: (n) => circleTimes(n, 3),
  'rosácea': (n) => {
    const nails = ring(n);
    const lines = [];
    const k1 = Math.round(n * 0.36);
    const k2 = Math.round(n * 0.18);
    for (let i = 0; i < n; i++) lines.push([i, (i + k1) % n]);
    for (let i = 0; i < n; i++) lines.push([i, (i + k2) % n]);
    return { nails, lines, board: 'circle' };
  },
  'parábolas': (n) => {
    const m = Math.max(8, Math.round(n / 6)); // pregos por meio-lado
    // pregos ao longo de dois eixos em cruz (+) e no quadrado; curvas entre braços vizinhos
    const nails = [];
    const idx = new Map();
    const add = (x, y) => {
      const key = `${x.toFixed(4)},${y.toFixed(4)}`;
      if (!idx.has(key)) {
        idx.set(key, nails.length);
        nails.push([x, y]);
      }
      return idx.get(key);
    };
    const arms = [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
    ];
    const lines = [];
    for (let a = 0; a < 4; a++) {
      const A = arms[a];
      const B = arms[(a + 1) % 4];
      for (let j = 0; j <= m; j++) {
        const f = j / m;
        const pa = add(A[0] * f, A[1] * f);
        const pb = add(B[0] * (1 - f), B[1] * (1 - f));
        if (j > 0 && j < m) lines.push([pa, pb]);
      }
    }
    // curvas externas: entre lados do quadrado, nos quatro cantos
    const corners = [
      [1, 1],
      [-1, 1],
      [-1, -1],
      [1, -1],
    ];
    for (let c = 0; c < 4; c++) {
      const C = corners[c];
      for (let j = 0; j <= m; j++) {
        const f = j / m;
        const pa = add(C[0], C[1] * f);
        const pb = add(C[0] * (1 - f), C[1]);
        if (j > 0 && j < m) lines.push([pa, pb]);
      }
    }
    // reordena: alterna braços para a construção girar pela peça
    const per = m - 1;
    const ordered = [];
    for (let j = 0; j < per; j++) for (let g = 0; g < 8; g++) ordered.push(lines[g * per + j]);
    return { nails: nails.map(([x, y]) => [x * 0.94, y * 0.94]), lines: ordered, board: 'square' };
  },
};

function ring(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = Math.PI / 2 + (i / n) * TAU; // começa embaixo: a cardioide fica em pé
    out.push([Math.cos(a), Math.sin(a)]);
  }
  return out;
}

function circleTimes(n, k) {
  const nails = ring(n);
  const lines = [];
  for (let i = 0; i < n; i++) {
    const j = (i * k) % n;
    if (j !== i) lines.push([i, j]);
  }
  return { nails, lines, board: 'circle' };
}

const mixRgb = (A, B, t) => `rgb(${Math.round(lerp(A[0], B[0], t))},${Math.round(lerp(A[1], B[1], t))},${Math.round(lerp(A[2], B[2], t))})`;

export default {
  id: 'string-art',
  title: 'String Art',
  description: 'Straight threads strung between nails, one by one, until their envelope forms curves (cardioid, nephroid, parabolas).',
  category: 'formas',
  tags: ['shape', 'loop', 'pattern'],
  duration: 12,
  poster: 8.4,

  params: {
    preset: { type: 'select', label: 'Figure', options: Object.keys(PRESETS), default: 'cardioide' },
    nails: { type: 'range', label: 'Nails', min: 60, max: 300, step: 2, default: 180 },
    colorA: { type: 'color', label: 'Thread (start)', default: '#f3eee6' },
    colorB: { type: 'color', label: 'Thread (end)', default: '#ff6a3d' },
    bg: { type: 'color', label: 'Background', default: '#0d0e12' },
    width: { type: 'range', label: 'Thickness', min: 0.4, max: 3, step: 0.1, default: 1.1 },
    opacity: { type: 'range', label: 'Opacity', min: 0.15, max: 1, step: 0.01, default: 0.6 },
    size: { type: 'range', label: 'Size', min: 0.25, max: 0.48, step: 0.01, default: 0.41 },
    board: { type: 'boolean', label: 'Board', default: true },
  },

  setup({ w, h, p, px }) {
    const shape = PRESETS[p.preset](Math.round(p.nails));
    // fundo estático (placa + vinheta) num buffer
    const bgc = document.createElement('canvas');
    bgc.width = Math.max(1, Math.round(w * px));
    bgc.height = Math.max(1, Math.round(h * px));
    const g = bgc.getContext('2d');
    g.scale(px, px);
    g.fillStyle = p.bg;
    g.fillRect(0, 0, w, h);
    const m = Math.min(w, h);
    const R = m * p.size;
    const [r, gg, b] = hexToRgb(p.bg);
    const lum = (0.3 * r + 0.59 * gg + 0.11 * b) / 255;
    const tone = lum < 0.5 ? '255,255,255' : '0,0,0';
    if (p.board) {
      const pad = R * 1.13;
      g.fillStyle = `rgba(${tone},0.025)`;
      g.strokeStyle = `rgba(${tone},0.07)`;
      g.lineWidth = Math.max(1, m * 0.0012);
      g.beginPath();
      if (shape.board === 'circle') g.arc(w / 2, h / 2, pad, 0, TAU);
      else g.roundRect(w / 2 - pad, h / 2 - pad, pad * 2, pad * 2, m * 0.02);
      g.fill();
      g.stroke();
    }
    const v = g.createRadialGradient(w / 2, h / 2, m * 0.3, w / 2, h / 2, Math.hypot(w, h) * 0.62);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.45)');
    g.fillStyle = v;
    g.fillRect(0, 0, w, h);

    const L = shape.lines.length;
    const A = hexToRgb(p.colorA);
    const B = hexToRgb(p.colorB);
    const colors = Array.from({ length: BUCKETS }, (_, k) => mixRgb(A, B, k / (BUCKETS - 1)));
    const bucket = shape.lines.map((_, i) => Math.min(BUCKETS - 1, Math.floor((i / L) * BUCKETS)));
    return { ...shape, L, bgc, colors, bucket };
  },

  render(ctx, t, { w, h, p, px, duration, state }) {
    const { nails, lines, L, bgc, colors, bucket } = state;
    ctx.drawImage(bgc, 0, 0, w, h);

    const m = Math.min(w, h);
    const R = m * p.size;
    const cx = w / 2;
    const cy = h / 2;
    const N = nails.length;
    const X = (i) => cx + nails[i][0] * R;
    const Y = (i) => cy + nails[i][1] * R;

    // linha do tempo (escala com a duração)
    const k = duration / 12;
    const drawA = 0.8 * k;
    const drawB = 7.8 * k;
    const each = 0.9 * k;
    const relA = 9.3 * k;
    const relB = 10.9 * k;
    const relEach = 0.45 * k;
    const spreadIn = drawB - drawA - each;
    const spreadOut = relB - relA - relEach;

    const lw = (p.width * m) / 1080;
    ctx.lineCap = 'round';
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = lw;
    ctx.globalAlpha = p.opacity;

    // lotes de linhas completas por cor; linhas em movimento à parte
    const moving = [];
    for (let bk = 0; bk < BUCKETS; bk++) {
      let any = false;
      ctx.beginPath();
      const i0 = Math.ceil((bk * L) / BUCKETS);
      for (let i = i0; i < L && bucket[i] === bk; i++) {
        const s = drawA + (L > 1 ? (i / (L - 1)) * spreadIn : 0);
        const r0 = relA + (L > 1 ? (i / (L - 1)) * spreadOut : 0);
        const grow = ease.outCubic(seg(t, s, s + each));
        const rel = ease.inOutCubic(seg(t, r0, r0 + relEach));
        if (grow <= 0 || rel >= 1) continue;
        if (grow < 1 || rel > 0) {
          moving.push([i, grow, rel]);
          continue;
        }
        const [a, b] = lines[i];
        ctx.moveTo(X(a), Y(a));
        ctx.lineTo(X(b), Y(b));
        any = true;
      }
      if (any) {
        ctx.strokeStyle = colors[bk];
        ctx.stroke();
      }
    }
    const heads = [];
    for (const [i, grow, rel] of moving) {
      const [a, b] = lines[i];
      const ax = X(a);
      const ay = Y(a);
      const bx = X(b);
      const by = Y(b);
      // ao soltar, a linha encolhe em direção ao prego final
      const x0 = lerp(ax, bx, rel);
      const y0 = lerp(ay, by, rel);
      const x1 = lerp(ax, bx, grow);
      const y1 = lerp(ay, by, grow);
      ctx.strokeStyle = colors[bucket[i]];
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      if (grow < 1) heads.push([x1, y1, 1 - grow, bucket[i]]);
    }
    // agulha: ponto brilhante na ponta das linhas que estão esticando
    if (heads.length) {
      const hr = Math.max(1.2, m * 0.0032);
      for (const [x, y, f, bk] of heads) {
        ctx.fillStyle = colors[bk];
        ctx.globalAlpha = 0.18 * f;
        ctx.beginPath();
        ctx.arc(x, y, hr * 3.2, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 0.9 * f;
        ctx.beginPath();
        ctx.arc(x, y, hr, 0, TAU);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // pregos: surgem em stagger pelo aro, somem no fim
    const popA = 0;
    const popSpread = 0.9 * k;
    const outA = 11.0 * k;
    const outSpread = 0.55 * k;
    const nr = Math.max(0.9, m * Math.min(0.0042, 2.6 / N));
    const out = seg(t, outA, outA + outSpread + 0.3 * k);
    if (out >= 1) return;
    ctx.beginPath();
    const hl = [];
    for (let i = 0; i < N; i++) {
      const d = N > 1 ? i / (N - 1) : 0;
      const s = spring(seg(t, popA + d * popSpread, popA + d * popSpread + 0.45 * k), 0.35);
      const o = 1 - ease.inCubic(seg(t, outA + d * outSpread, outA + d * outSpread + 0.3 * k));
      const r = nr * clamp(s, 0, 1.6) * o;
      if (r <= 0.05) continue;
      const x = X(i);
      const y = Y(i);
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, TAU);
      hl.push([x - r * 0.3, y - r * 0.3, r * 0.42]);
    }
    ctx.fillStyle = '#8a8f99';
    ctx.fill();
    ctx.beginPath();
    for (const [x, y, r] of hl) {
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, TAU);
    }
    ctx.fillStyle = '#e8eaee';
    ctx.fill();
  },
};
