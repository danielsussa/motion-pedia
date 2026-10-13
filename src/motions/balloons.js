import { TAU, rng, rgba, clamp, ease, mixHex } from '../lib/anim.js';

// Balões de festa subindo. Cada balão vive K vezes por loop (vida = duração/K) com sorteio por (balão, vida):
// idade = (t/P + fase) mod 1, então o loop fecha sozinho. O corpo é um sprite pré-renderizado por cor
// (forma de gota invertida, sombreado radial, brilho especular e nó); por frame só há drawImage com
// inclinação acompanhando a velocidade lateral, e o barbante (um path por lote) que ondula atrás.
// Estouro opcional: clarão, anel, retalhos de borracha girando e caindo, e o barbante solto despencando.

const hash = (a, b) => {
  let x = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263);
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
};

// sprite: raio lógico R = 100 px, centro do "bojo" em (CX, CY)
const R0 = 100;
const SW = 240;
const SH = 290;
const CX = SW / 2;
const CY = 125;

function balloonPath(g) {
  // unidades: raio horizontal 1; topo em -1.12; bico em +1.1
  g.beginPath();
  g.moveTo(0, -1.12);
  g.bezierCurveTo(0.58, -1.12, 1, -0.7, 1, -0.1);
  g.bezierCurveTo(1, 0.45, 0.5, 0.92, 0.08, 1.1);
  g.lineTo(-0.08, 1.1);
  g.bezierCurveTo(-0.5, 0.92, -1, 0.45, -1, -0.1);
  g.bezierCurveTo(-1, -0.7, -0.58, -1.12, 0, -1.12);
  g.closePath();
}

function sprite(color) {
  const c = document.createElement('canvas');
  c.width = SW;
  c.height = SH;
  const g = c.getContext('2d');
  g.translate(CX, CY);
  g.scale(R0, R0);
  // nó
  g.fillStyle = mixHex(color, '#000000', 0.25);
  g.beginPath();
  g.moveTo(-0.1, 1.06);
  g.lineTo(0.1, 1.06);
  g.lineTo(0.13, 1.22);
  g.quadraticCurveTo(0, 1.17, -0.13, 1.22);
  g.closePath();
  g.fill();
  // corpo
  balloonPath(g);
  g.save();
  g.clip();
  g.fillStyle = color;
  g.fillRect(-1.2, -1.3, 2.4, 2.6);
  // luz de cima à esquerda (mesma cor clara variando só o alpha)
  let rg = g.createRadialGradient(-0.38, -0.5, 0, -0.38, -0.5, 1.1);
  rg.addColorStop(0, 'rgba(255,255,255,0.42)');
  rg.addColorStop(0.45, 'rgba(255,255,255,0.1)');
  rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg;
  g.fillRect(-1.2, -1.3, 2.4, 2.6);
  // sombra própria embaixo à direita
  rg = g.createRadialGradient(-0.25, -0.35, 0.4, -0.25, -0.35, 1.75);
  rg.addColorStop(0, 'rgba(0,0,0,0)');
  rg.addColorStop(0.55, 'rgba(0,0,0,0.12)');
  rg.addColorStop(1, 'rgba(0,0,0,0.45)');
  g.fillStyle = rg;
  g.fillRect(-1.2, -1.3, 2.4, 2.6);
  // luz rebatida na borda de baixo à direita
  g.strokeStyle = 'rgba(255,255,255,0.09)';
  g.lineWidth = 0.07;
  g.beginPath();
  g.arc(0.02, -0.05, 0.9, 0.15, 1.2);
  g.stroke();
  g.restore();
  // brilho especular
  g.save();
  g.translate(-0.45, -0.55);
  g.rotate(-0.75);
  g.scale(1, 0.55);
  rg = g.createRadialGradient(0, 0, 0, 0, 0, 0.28);
  rg.addColorStop(0, 'rgba(255,255,255,0.95)');
  rg.addColorStop(0.5, 'rgba(255,255,255,0.6)');
  rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg;
  g.beginPath();
  g.arc(0, 0, 0.28, 0, TAU);
  g.fill();
  g.restore();
  rg = g.createRadialGradient(-0.12, -0.86, 0, -0.12, -0.86, 0.08);
  rg.addColorStop(0, 'rgba(255,255,255,0.8)');
  rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg;
  g.fillRect(-0.3, -1.1, 0.4, 0.4);
  return c;
}

function paintBg(w, h, px, p) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * px));
  c.height = Math.max(1, Math.round(h * px));
  const g = c.getContext('2d');
  g.scale(px, px);
  const lg = g.createLinearGradient(0, 0, 0, h);
  lg.addColorStop(0, p.bg2);
  lg.addColorStop(1, p.bg);
  g.fillStyle = lg;
  g.fillRect(0, 0, w, h);
  const rg = g.createRadialGradient(w * 0.5, h * 0.05, 0, w * 0.5, h * 0.05, Math.hypot(w, h) * 0.7);
  rg.addColorStop(0, rgba('#ffffff', 0.18));
  rg.addColorStop(1, rgba('#ffffff', 0));
  g.fillStyle = rg;
  g.fillRect(0, 0, w, h);
  return c;
}

const POP = 0.9; // duração do estouro (s)

export default {
  id: 'balloons',
  title: 'Balloons',
  description: 'Party balloons on strings rising and swaying, some popping into shreds of rubber.',
  category: 'particulas',
  tags: ['particles', 'loop', 'alpha', 'overlay'],
  duration: 12,
  poster: 5,

  params: {
    c1: { type: 'color', label: 'Color 1', default: '#f0484e' },
    c2: { type: 'color', label: 'Color 2', default: '#f6eee4' },
    c3: { type: 'color', label: 'Color 3', default: '#e8b04a' },
    bg: { type: 'color', label: 'Background', default: '#d9d2c7' },
    bg2: { type: 'color', label: 'Background (top)', default: '#efeae2' },
    transparent: { type: 'boolean', label: 'Transparent background', default: false },
    count: { type: 'range', label: 'Count', min: 3, max: 40, step: 1, default: 14 },
    size: { type: 'range', label: 'Size', min: 0.4, max: 2, step: 0.01, default: 1 },
    pops: { type: 'range', label: 'Pops', min: 0, max: 1, step: 0.01, default: 0.3 },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 4 },
  },

  setup({ w, h, px, p }) {
    const rand = rng(p.seed);
    const cols = [p.c1, p.c2, p.c3];
    const sprites = cols.map(sprite);
    const weights = [0.5, 0.25, 0.25];
    const N = Math.round(p.count * Math.max(1, Math.sqrt(h / w)));
    const balloons = Array.from({ length: N }, (_, i) => {
      const z = (i + 0.2 + rand() * 0.6) / N; // profundidade estratificada
      const u = rand();
      const ci = u < weights[0] ? 0 : u < weights[0] + weights[1] ? 1 : 2;
      return { i, z, ci, phase: rand(), lane: (i * 0.618 + rand() * 0.3) % 1 };
    });
    balloons.sort((a, b) => a.z - b.z);
    return { sprites, cols, balloons, bg: p.transparent ? null : paintBg(w, h, Math.min(1, px || 1), p) };
  },

  render(ctx, t, { w, h, p, duration, state: S }) {
    const m = Math.min(w, h);
    if (!p.transparent) ctx.drawImage(S.bg, 0, 0, w, h);
    const K = 2;
    const P = duration / K;
    const strColor = p.transparent ? 'rgba(235,235,235,0.75)' : 'rgba(70,62,58,0.45)';

    for (const b of S.balloons) {
      const tt = t / P + b.phase;
      const life = ((Math.floor(tt) % K) + K) % K;
      const a = (tt - Math.floor(tt)) * P;
      const H = (k) => hash(b.i * 11 + 5, life * 37 + k);
      const r = m * p.size * (0.045 + 0.05 * b.z) * (0.9 + 0.2 * H(1));
      const strL = r * (2.4 + 0.8 * H(2));
      const cross = P * (1.0 - 0.3 * b.z); // perto = mais rápido
      const y0 = h + r * 1.3;
      const y1 = -r * 1.4 - strL;
      if (a > cross + POP) continue;
      const lane = (b.lane + 0.37 * life + 0.15 * (H(3) - 0.5)) % 1;
      const x0 = w * (0.06 + 0.88 * lane);
      const fl = H(4) * TAU;
      const sw = r * 0.6 + m * 0.012;
      const fq = 0.35 + 0.2 * H(5);
      const X = (ag) => x0 + Math.sin(ag * fq * TAU + fl) * sw + Math.sin(ag * fq * 2.3 * TAU + fl * 3) * sw * 0.25;
      // sobe com leve aceleração inicial (solto da mão) e depois em velocidade constante
      const Y = (ag) => {
        const q = ag / cross;
        return y0 + (y1 - y0) * (0.12 * q * q + 0.88 * q);
      };
      const popAt = H(6) < p.pops ? cross * (0.3 + 0.45 * H(7)) : Infinity;
      const img = S.sprites[b.ci];
      const ag = Math.min(a, popAt);
      const x = X(ag);
      const y = Y(ag);
      const vx = (X(ag + 0.05) - X(ag - 0.05)) / 0.1;
      const vy = (y1 - y0) / cross;
      const tilt = clamp(Math.atan2(vx, -vy) * 0.6, -0.35, 0.35);

      // barbante: segue o nó com atraso (amostra o passado da trajetória)
      const knot = (ax, ay, ang) => [ax - Math.sin(ang) * r * 1.2, ay + Math.cos(ang) * r * 1.2];
      if (a < popAt) {
        const [kx, ky] = knot(x, y, tilt);
        ctx.beginPath();
        ctx.moveTo(kx, ky);
        const N = 10;
        for (let j = 1; j <= N; j++) {
          const q = j / N;
          const lag = q * 0.45;
          const sx = X(Math.max(0, a - lag)) - x;
          const wig = Math.sin(a * 3.1 + q * 5 + fl) * r * 0.12 * q;
          ctx.lineTo(kx + sx * 0.8 + wig, ky + q * strL);
        }
        ctx.strokeStyle = strColor;
        ctx.lineWidth = Math.max(0.6, m * 0.0016);
        ctx.stroke();
        // corpo (balança: leve squash no ritmo do vento)
        const s = (r / R0);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(tilt);
        const wob = Math.sin(a * 2.2 + fl) * 0.02;
        ctx.scale(s * (1 + wob), s * (1 - wob));
        ctx.drawImage(img, -CX, -CY);
        ctx.restore();
      } else {
        // estouro
        const e = a - popAt;
        const k = e / POP;
        const col = S.cols[b.ci];
        // clarão + anel
        if (e < 0.12) {
          const q = e / 0.12;
          ctx.fillStyle = rgba(col, 0.55 * (1 - q) * (1 - q));
          ctx.beginPath();
          ctx.arc(x, y, r * (1 + 0.3 * q), 0, TAU);
          ctx.fill();
          ctx.strokeStyle = `rgba(255,255,255,${0.7 * (1 - q)})`;
          ctx.lineWidth = Math.max(0.6, r * 0.05 * (1 - q));
          ctx.beginPath();
          ctx.arc(x, y, r * (1.05 + 0.6 * ease.outCubic(q)), 0, TAU);
          ctx.stroke();
        }
        // retalhos de borracha: tiras curvas que voam, giram e caem
        const n = 9;
        ctx.fillStyle = mixHex(col, '#000000', 0.12);
        ctx.beginPath();
        const fade = 1 - ease.inCubic(clamp(k));
        if (fade > 0.01) {
          for (let j = 0; j < n; j++) {
            const ang = ((j + 0.8 * H(20 + j)) / n) * TAU;
            const sp = r * (2.2 + 2.5 * H(30 + j));
            const dr = (1 - Math.exp(-6 * e)) / 6;
            const px_ = x + Math.cos(ang) * (r * 0.7 + sp * dr);
            const py_ = y + Math.sin(ang) * (r * 0.8 + sp * dr) + 0.5 * m * 2.4 * e * e;
            const rot = ang + e * (6 + 8 * H(40 + j)) * (H(50 + j) < 0.5 ? -1 : 1);
            const L = r * (0.18 + 0.32 * H(60 + j)) * (0.6 + 0.4 * fade);
            const W = L * 0.32;
            const c = Math.cos(rot), s2 = Math.sin(rot);
            // tira curva: quadrilátero com o meio arqueado
            ctx.moveTo(px_ - c * L, py_ - s2 * L);
            ctx.quadraticCurveTo(px_ - s2 * W * 2, py_ + c * W * 2, px_ + c * L, py_ + s2 * L);
            ctx.quadraticCurveTo(px_ - s2 * W * 0.6, py_ + c * W * 0.6, px_ - c * L, py_ - s2 * L);
          }
          ctx.globalAlpha = fade;
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        // barbante solto despencando (e o nó com um pedacinho de borracha)
        const fall = 0.5 * m * 1.4 * e * e;
        const [kx, ky] = knot(x, y, tilt);
        const sFade = 1 - clamp((ky + fall - h) / (strL + r) );
        if (sFade > 0.01) {
          ctx.beginPath();
          ctx.moveTo(kx, ky + fall);
          const N = 10;
          for (let j = 1; j <= N; j++) {
            const q = j / N;
            const wig = Math.sin(e * 7 + q * 6 + fl) * r * 0.35 * q * Math.min(1, e * 2);
            ctx.lineTo(kx + wig, ky + fall + q * strL * (1 - 0.25 * Math.min(1, e * 2)));
          }
          ctx.strokeStyle = strColor;
          ctx.lineWidth = Math.max(0.6, m * 0.0016);
          ctx.stroke();
          ctx.fillStyle = mixHex(col, '#000000', 0.25);
          ctx.beginPath();
          ctx.arc(kx, ky + fall, Math.max(0.8, r * 0.1), 0, TAU);
          ctx.fill();
        }
      }
    }
  },
};
