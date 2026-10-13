import { TAU, hexToRgb, rgba } from '../lib/anim.js';
import { rotate, project } from '../lib/space.js';

// Fita 3D seguindo um nó tórico (p, q). A direção da largura parte do vetor que sai da alma do toro
// (sempre bem definido nesse tipo de curva) e gira em torno da tangente: `twists` voltas inteiras ao
// longo do nó (fecha sem emenda) mais uma fase que corre com o tempo. Cada quadrilátero é pintado com
// a cor da face que está virada para a câmera (frente/verso), sombreado pela normal, de trás para frente.

const KNOTS = { '2,3': [2, 3], '3,2': [3, 2], '2,5': [2, 5], '3,4': [3, 4], '3,5': [3, 5], '5,2': [5, 2] };

const norm = (v) => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export default {
  id: 'ribbon',
  title: 'Ribbon',
  description: 'A twisted 3D ribbon tracing a torus knot, with different colors front and back, spinning in a loop.',
  category: 'formas',
  tags: ['3d', 'shape', 'loop'],
  duration: 10,

  params: {
    knot: { type: 'select', label: 'Knot (p,q)', options: Object.keys(KNOTS), default: '2,3' },
    front: { type: 'color', label: 'Front', default: '#ff5a36' },
    back: { type: 'color', label: 'Back', default: '#f1ebe0' },
    bg: { type: 'color', label: 'Background', default: '#0d0e12' },
    width: { type: 'range', label: 'Width', min: 0.1, max: 1.2, step: 0.01, default: 0.52 },
    twists: { type: 'range', label: 'Twists', min: 0, max: 12, step: 1, default: 3 },
    size: { type: 'range', label: 'Size', min: 0.5, max: 1.5, step: 0.01, default: 1 },
    segments: { type: 'range', label: 'Segments', min: 120, max: 900, step: 10, default: 400 },
    transparent: { type: 'boolean', label: 'Transparent background', default: false },
  },

  setup({ p }) {
    const [kp, kq] = KNOTS[p.knot] ?? [2, 3];
    const n = p.segments;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const f = (i / n) * TAU;
      const r = 2 + Math.cos(kq * f);
      const P = [r * Math.cos(kp * f), r * Math.sin(kp * f), -Math.sin(kq * f)];
      // derivada analítica
      const dr = -kq * Math.sin(kq * f);
      const T = norm([
        dr * Math.cos(kp * f) - r * kp * Math.sin(kp * f),
        dr * Math.sin(kp * f) + r * kp * Math.cos(kp * f),
        -kq * Math.cos(kq * f),
      ]);
      // saída da alma do toro, ortogonalizada contra a tangente
      const off = [Math.cos(kq * f) * Math.cos(kp * f), Math.cos(kq * f) * Math.sin(kp * f), -Math.sin(kq * f)];
      const d = dot(off, T);
      const N = norm([off[0] - T[0] * d, off[1] - T[1] * d, off[2] - T[2] * d]);
      const B = cross(T, N);
      pts.push({ P, T, N, B, f });
    }
    return { pts, front: hexToRgb(p.front), back: hexToRgb(p.back) };
  },

  render(ctx, t, { w, h, p, progress: u, state }) {
    const m = Math.min(w, h);
    const cx = w / 2;
    const cy = h / 2;
    if (!p.transparent) {
      ctx.fillStyle = p.bg;
      ctx.fillRect(0, 0, w, h);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, m * 0.7);
      g.addColorStop(0, rgba(p.front, 0.13));
      g.addColorStop(1, rgba(p.front, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    const { pts, front, back } = state;
    const n = pts.length;
    const rot = { rz: TAU * u, rx: 0.62 + 0.16 * Math.sin(TAU * u), ry: 0.3 * Math.sin(TAU * u + 1) };
    const view = (v) => rotate(rotate(v, { rz: rot.rz }), { rx: rot.rx, ry: rot.ry });
    const U = m * 0.118 * p.size;
    const dist = 13;
    const cam = { cx, cy, fov: dist * U, dist };
    const camPos = [0, 0, -dist];
    const hw = p.width / 2;
    const phase = TAU * u * 2;

    // bordas da fita em espaço de vista
    const A = new Array(n);
    const Bv = new Array(n);
    const Nv = new Array(n);
    const PA = new Array(n);
    const PB = new Array(n);
    for (let i = 0; i < n; i++) {
      const s = pts[i];
      const a = p.twists * s.f + phase;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      const W = [s.N[0] * c + s.B[0] * sn, s.N[1] * c + s.B[1] * sn, s.N[2] * c + s.B[2] * sn];
      const a3 = view([s.P[0] + W[0] * hw, s.P[1] + W[1] * hw, s.P[2] + W[2] * hw]);
      const b3 = view([s.P[0] - W[0] * hw, s.P[1] - W[1] * hw, s.P[2] - W[2] * hw]);
      A[i] = a3;
      Bv[i] = b3;
      // normal da superfície = T × W
      Nv[i] = view(cross(s.T, W));
      PA[i] = project(a3, cam);
      PB[i] = project(b3, cam);
    }

    const L = norm([-0.5, -0.7, -0.6]);
    const H = norm([L[0], L[1], L[2] - 1]); // meio-vetor para o especular (câmera em -z)
    const quads = new Array(n);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const c = [(A[i][0] + Bv[j][0]) / 2, (A[i][1] + Bv[j][1]) / 2, (A[i][2] + Bv[j][2]) / 2];
      let nn = norm([Nv[i][0] + Nv[j][0], Nv[i][1] + Nv[j][1], Nv[i][2] + Nv[j][2]]);
      const toCam = [c[0] - camPos[0], c[1] - camPos[1], c[2] - camPos[2]];
      const isFront = dot(nn, toCam) < 0;
      if (!isFront) nn = [-nn[0], -nn[1], -nn[2]];
      const diff = Math.max(0, dot(nn, L));
      const spec = Math.max(0, dot(nn, H)) ** 24;
      quads[i] = { i, j, d: Math.hypot(...toCam), isFront, diff, spec };
    }
    quads.sort((a, b) => b.d - a.d);

        for (const q of quads) {
      const col = q.isFront ? front : back;
      const k = 0.38 + 0.72 * q.diff;
      const sp = q.spec * (q.isFront ? 120 : 70);
      const r = Math.min(255, Math.round(col[0] * k + sp));
      const g = Math.min(255, Math.round(col[1] * k + sp));
      const b = Math.min(255, Math.round(col[2] * k + sp));
      const s = `rgb(${r},${g},${b})`;
      ctx.fillStyle = s;
      const a0 = PA[q.i];
      const a1 = PA[q.j];
      const b1 = PB[q.j];
      const b0 = PB[q.i];
      // avança um pouco além da emenda para não sobrar fresta de antialias entre quads
      const ex = 0.35;
      ctx.beginPath();
      ctx.moveTo(a0.x, a0.y);
      ctx.lineTo(a1.x + (a1.x - a0.x) * ex, a1.y + (a1.y - a0.y) * ex);
      ctx.lineTo(b1.x + (b1.x - b0.x) * ex, b1.y + (b1.y - b0.y) * ex);
      ctx.lineTo(b0.x, b0.y);
      ctx.closePath();
      ctx.fill();
    }
  },
};
