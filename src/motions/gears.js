import { TAU, clamp, spring, mixHex, rgba } from '../lib/anim.js';

// Trem de engrenagens. Todas as engrenagens que se tocam avançam o MESMO número de dentes por
// unidade de tempo; a motora avança K = 72·velocidade dentes por loop, e todo número de dentes
// usado divide 72 — então cada engrenagem dá um número inteiro de voltas e o loop é perfeito
// (inclusive raios e furos). Fase de encaixe: o dente de uma cai no vão da outra no ponto de contato.
//   θj = φ + π + π/Nj − (θi − φ)·Ni/Nj   (φ = direção de i para j)

// [dentes, pai, ângulo a partir do pai] — ordem importa (pai antes do filho)
const LAYOUT = [
  [36, -1, 0],
  [12, 0, -0.42],
  [24, 1, 0.55],
  [18, 0, 2.55],
  [9, 3, 1.45],
  [24, 2, -1.05],
  [8, 3, -2.2],
  [18, 5, 0.9],
];
const TONES = [0, 0.62, 0.86, 0.74, 0.5, 0.68, 0.9, 0.56];
const ADD = 1; // adendo (módulo = 1)
const DED = 1.25;

function gearPath(N, r) {
  const path = new Path2D();
  const p = TAU / N;
  const ra = r + ADD;
  const rr = r - DED;
  const pts = [];
  for (let k = 0; k < N; k++) {
    const c = k * p;
    const prof = [
      [rr, c - 0.36 * p],
      [r - 0.35, c - 0.255 * p],
      [r + 0.45, c - 0.205 * p],
      [ra, c - 0.15 * p],
      [ra, c + 0.15 * p],
      [r + 0.45, c + 0.205 * p],
      [r - 0.35, c + 0.255 * p],
      [rr, c + 0.36 * p],
    ];
    for (const [rad, a] of prof) pts.push([rad * Math.cos(a), rad * Math.sin(a)]);
  }
  path.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    // vão entre dentes: curva pela raiz
    if (i % 8 === 0) {
      const a = (i / 8) * p - p / 2;
      path.quadraticCurveTo(rr * 0.97 * Math.cos(a), rr * 0.97 * Math.sin(a), pts[i][0], pts[i][1]);
    } else path.lineTo(pts[i][0], pts[i][1]);
  }
  const a = N * p - p / 2;
  path.quadraticCurveTo(rr * 0.97 * Math.cos(a), rr * 0.97 * Math.sin(a), pts[0][0], pts[0][1]);
  path.closePath();

  // furo do eixo
  const hub = Math.max(1.1, r * 0.16);
  path.moveTo(hub, 0);
  path.arc(0, 0, hub, 0, TAU);
  // janelas entre os raios (só nas grandes)
  if (N >= 18) {
    const S = N >= 30 ? 6 : N >= 24 ? 5 : 4;
    const r0 = Math.max(hub + 1.6, r * 0.34);
    const r1 = rr - 1.5;
    const spoke = Math.max(0.9, r * 0.09); // meia largura do raio (em unidades)
    for (let s = 0; s < S; s++) {
      const c = (s / S) * TAU + TAU / (2 * S);
      const half = TAU / (2 * S);
      const d0 = half - spoke / r0;
      const d1 = half - spoke / r1;
      path.moveTo(r0 * Math.cos(c - d0), r0 * Math.sin(c - d0));
      path.arc(0, 0, r0, c - d0, c + d0);
      path.arc(0, 0, r1, c + d1, c - d1, true);
      path.closePath();
    }
  }
  const rim = new Path2D();
  rim.arc(0, 0, rr - 0.7, 0, TAU);
  return { path, rim, hub };
}

export default {
  id: 'gears',
  title: 'Gears',
  description: 'Meshed gears turning in sync, with exact tooth ratios and springy step-by-step advance.',
  category: 'formas',
  tags: ['shape', 'loop', 'simulation'],
  duration: 12,
  poster: 2.3,

  params: {
    count: { type: 'range', label: 'Gears', min: 2, max: 8, step: 1, default: 7 },
    mode: { type: 'select', label: 'Motion', options: ['passos', 'contínuo'], default: 'passos' },
    speed: { type: 'range', label: 'Speed', min: 1, max: 3, step: 1, default: 1 },
    zoom: { type: 'range', label: 'Zoom', min: 0.5, max: 1.6, step: 0.01, default: 1 },
    accent: { type: 'color', label: 'Drive gear', default: '#ff6a3d' },
    ink: { type: 'color', label: 'Gears', default: '#ece6da' },
    bg: { type: 'color', label: 'Background', default: '#0e0f13' },
    transparent: { type: 'boolean', label: 'Transparent background', default: false },
  },

  setup({ w, h, p }) {
    const vertical = h > w * 1.05;
    const n = clamp(Math.round(p.count), 2, LAYOUT.length);
    const gears = [];
    for (let i = 0; i < n; i++) {
      const [N, parent, ang] = LAYOUT[i];
      const phi = ang + (vertical ? Math.PI / 2 : 0);
      const r = N / 2;
      let x = 0;
      let y = 0;
      if (parent >= 0) {
        const q = gears[parent];
        const d = q.r + r;
        x = q.x + d * Math.cos(phi);
        y = q.y + d * Math.sin(phi);
      }
      gears.push({ N, r, x, y, parent, phi, ...gearPath(N, r), color: i === 0 ? p.accent : mixHex(p.bg, p.ink, TONES[i]) });
    }
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const g of gears) {
      x0 = Math.min(x0, g.x - g.r - ADD);
      x1 = Math.max(x1, g.x + g.r + ADD);
      y0 = Math.min(y0, g.y - g.r - ADD);
      y1 = Math.max(y1, g.y + g.r + ADD);
    }
    const s = Math.min((w * 0.84) / (x1 - x0), (h * 0.8) / (y1 - y0)) * p.zoom;
    return { gears, s, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  },

  render(ctx, t, { w, h, p, duration, progress, state }) {
    if (!p.transparent) {
      ctx.fillStyle = p.bg;
      ctx.fillRect(0, 0, w, h);
    }
    const { gears, s, cx, cy } = state;
    const K = 72 * Math.round(p.speed);
    let teeth;
    if (p.mode === 'contínuo') teeth = K * progress;
    else {
      const S = 12;
      const dt = duration / S;
      const k = Math.floor(t / dt);
      const x = (t - k * dt) / Math.min(dt, 0.7);
      teeth = (K / S) * (k + spring(Math.min(1, x), 0.12));
    }
    // ângulos (pai antes do filho)
    const th = [];
    for (let i = 0; i < gears.length; i++) {
      const g = gears[i];
      if (g.parent < 0) th.push((teeth * TAU) / g.N);
      else {
        const q = gears[g.parent];
        th.push(g.phi + Math.PI + Math.PI / g.N - (th[g.parent] - g.phi) * (q.N / g.N));
      }
    }

    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(s, s);
    ctx.translate(-cx, -cy);
    // sombra projetada (um lote só)
    const off = Math.min(w, h) * 0.012 / s;
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    for (let i = 0; i < gears.length; i++) {
      const g = gears[i];
      ctx.save();
      ctx.translate(g.x + off * 0.6, g.y + off);
      ctx.rotate(th[i]);
      ctx.fill(g.path, 'evenodd');
      ctx.restore();
    }
    const unit = 1 / s;
    for (let i = 0; i < gears.length; i++) {
      const g = gears[i];
      ctx.save();
      ctx.translate(g.x, g.y);
      ctx.rotate(th[i]);
      ctx.fillStyle = g.color;
      ctx.fill(g.path, 'evenodd');
      // aro interno e luz de cima
      ctx.lineWidth = Math.max(unit * 1.2, 0.18);
      ctx.strokeStyle = 'rgba(0,0,0,0.16)';
      ctx.stroke(g.rim);
      ctx.restore();
      // brilho fixo (não gira): meia-lua clara em cima
      ctx.save();
      ctx.translate(g.x, g.y);
      ctx.beginPath();
      ctx.arc(0, 0, g.r - DED - 0.2, Math.PI * 1.08, Math.PI * 1.92);
      ctx.strokeStyle = 'rgba(255,255,255,0.13)';
      ctx.lineWidth = Math.max(unit * 1.5, 0.35);
      ctx.stroke();
      // eixo
      ctx.fillStyle = rgba(p.ink, 0.92);
      ctx.beginPath();
      ctx.arc(0, 0, g.hub * 0.55, 0, TAU);
      ctx.fill();
      ctx.fillStyle = p.transparent ? 'rgba(0,0,0,0.5)' : p.bg;
      ctx.beginPath();
      ctx.arc(0, 0, g.hub * 0.22, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  },
};
