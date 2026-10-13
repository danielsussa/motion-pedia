import { TAU, clamp, rng, mixHex } from '../lib/anim.js';

// Dupla hélice ao longo de um eixo que atravessa a tela (horizontal em paisagem, vertical em retrato).
// Fase φ(s) = 2π·s/passo + 2π·voltas·progress → loop perfeito. As duas fitas ficam defasadas
// (sulco maior/menor, como no DNA real). Profundidade z = sin φ: tamanho por perspectiva leve,
// neblina misturando com o fundo. Desenho em camadas de profundidade (Z_BINS), cada camada com
// poucos lotes (fitas, meias-pontes de cada cor, nós) — barato mesmo com centenas de pedaços.

const Z_BINS = 10;

export default {
  id: 'dna-helix',
  title: 'DNA Helix',
  description: 'Dupla hélice girando em 3D, com pares de bases coloridos, sulcos maior e menor e neblina de profundidade.',
  category: 'formas',
  tags: ['3d', 'forma', 'loop'],
  duration: 8,
  poster: 1.3,

  params: {
    turns: { type: 'range', label: 'Voltas por loop', min: 1, max: 4, step: 1, default: 1 },
    radius: { type: 'range', label: 'Raio', min: 0.08, max: 0.3, step: 0.005, default: 0.17 },
    pairs: { type: 'range', label: 'Pares por volta', min: 6, max: 16, step: 1, default: 10 },
    tilt: { type: 'range', label: 'Inclinação', min: -0.8, max: 0.8, step: 0.01, default: -0.22 },
    groove: { type: 'range', label: 'Sulco', min: 0.5, max: 1, step: 0.01, default: 0.78 },
    accent: { type: 'color', label: 'Bases A', default: '#ff6a3d' },
    second: { type: 'color', label: 'Bases B', default: '#8fa3b8' },
    ink: { type: 'color', label: 'Fitas', default: '#ece6da' },
    bg: { type: 'color', label: 'Fundo', default: '#0e0f13' },
    seed: { type: 'range', label: 'Semente', min: 1, max: 99, step: 1, default: 7 },
  },

  setup({ w, h, p }) {
    const r = rng(p.seed);
    const types = Array.from({ length: 400 }, () => (r() < 0.5 ? 0 : 1));
    // paletas por camada (fundo → frente)
    const fog = (k) => 0.18 + 0.82 * k ** 1.2;
    const ink = [];
    const acc = [];
    const sec = [];
    for (let b = 0; b < Z_BINS; b++) {
      const k = b / (Z_BINS - 1);
      ink.push(mixHex(p.bg, p.ink, fog(k)));
      acc.push(mixHex(p.bg, p.accent, fog(k)));
      sec.push(mixHex(p.bg, p.second, fog(k)));
    }
    return { types, ink, acc, sec };
  },

  render(ctx, t, { w, h, p, progress, state }) {
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, w, h);
    const m = Math.min(w, h);
    const R = m * p.radius;
    const pitch = R * 3.4 * 1.15;
    const ax = (w >= h ? 0 : Math.PI / 2) + p.tilt;
    const dx = Math.cos(ax);
    const dy = Math.sin(ax);
    const nx = -dy;
    const ny = dx;
    const L = Math.hypot(w, h) * 0.5 + R * 2;
    const cx = w / 2;
    const cy = h / 2;
    const rot = TAU * Math.round(p.turns) * progress;
    const off = p.groove * Math.PI;
    const view = 0.07; // olhando de leve "de cima": z vaza para o eixo
    const persp = 0.16;

    const pt = (s, phi) => {
      const c = Math.cos(phi);
      const z = Math.sin(phi);
      const k = 1 + persp * z;
      const along = s + z * R * view;
      return [cx + dx * along + nx * c * R * k, cy + dy * along + ny * c * R * k, z, k];
    };
    const bin = (z) => clamp(Math.floor(((z + 1) / 2) * Z_BINS), 0, Z_BINS - 1);

    // lotes por camada
    const strands = Array.from({ length: Z_BINS }, () => []);
    const rungA = Array.from({ length: Z_BINS }, () => []);
    const rungB = Array.from({ length: Z_BINS }, () => []);
    const nodes = Array.from({ length: Z_BINS }, () => []);

    const step = pitch / Math.round(p.pairs);
    const sub = 5;
    const ds = step / sub;
    const nMin = Math.floor(-L / step) - 1;
    const nMax = Math.ceil(L / step) + 1;
    const phiAt = (s) => (TAU * s) / pitch + rot;
    for (let strand = 0; strand < 2; strand++) {
      const o = strand ? off : 0;
      let prev = null;
      for (let i = nMin * sub; i <= nMax * sub; i++) {
        const s = i * ds;
        const q = pt(s, phiAt(s) + o);
        if (prev) {
          const zm = (q[2] + prev[2]) / 2;
          strands[bin(zm)].push(prev[0], prev[1], q[0], q[1], (q[3] + prev[3]) / 2);
        }
        prev = q;
      }
    }
    for (let i = nMin; i <= nMax; i++) {
      const s = i * step;
      const phi = phiAt(s);
      const a = pt(s, phi);
      const b = pt(s, phi + off);
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
      const ty = state.types[((i % 400) + 400) % 400];
      // meia-ponte de cada lado (cor por base), cada uma na camada da sua profundidade média
      const za = (a[2] + mid[2]) / 2;
      const zb = (b[2] + mid[2]) / 2;
      (ty ? rungB : rungA)[bin(za)].push(a[0], a[1], mid[0], mid[1], a[3]);
      (ty ? rungA : rungB)[bin(zb)].push(mid[0], mid[1], b[0], b[1], b[3]);
      nodes[bin(a[2])].push(a[0], a[1], a[3]);
      nodes[bin(b[2])].push(b[0], b[1], b[3]);
    }

    const sw = R * 0.075;
    const rw = R * 0.05;
    const nr = R * 0.07;
    ctx.lineCap = 'round';
    const drawSegs = (arr, width, color) => {
      if (!arr.length) return;
      // largura média da camada (k varia pouco dentro dela)
      let kk = 0;
      for (let j = 4; j < arr.length; j += 5) kk += arr[j];
      kk /= arr.length / 5;
      ctx.strokeStyle = color;
      ctx.lineWidth = width * kk;
      ctx.beginPath();
      for (let j = 0; j < arr.length; j += 5) {
        ctx.moveTo(arr[j], arr[j + 1]);
        ctx.lineTo(arr[j + 2], arr[j + 3]);
      }
      ctx.stroke();
    };
    for (let b = 0; b < Z_BINS; b++) {
      drawSegs(rungA[b], rw, state.acc[b]);
      drawSegs(rungB[b], rw, state.sec[b]);
      drawSegs(strands[b], sw, state.ink[b]);
      const nd = nodes[b];
      if (nd.length) {
        ctx.fillStyle = state.ink[b];
        ctx.beginPath();
        for (let j = 0; j < nd.length; j += 3) {
          const r = nr * nd[j + 2];
          ctx.moveTo(nd[j] + r, nd[j + 1]);
          ctx.arc(nd[j], nd[j + 1], r, 0, TAU);
        }
        ctx.fill();
      }
    }
  },
};
