import { TAU, clamp, seg, ease, rng, hexToRgb, rgba } from '../lib/anim.js';

// Fileira de dominós em perspectiva caindo em cadeia por um caminho em S, e levantando de volta
// numa onda de mola (o loop emenda: no fim estão todos de pé de novo).
// O caminho é desenhado em coordenadas de tela (se adapta ao formato) e projetado de volta no chão;
// os dominós ficam a passo constante no chão. Cada um é uma caixa que gira em torno da aresta de
// baixo da frente. A queda é "cinemática": cai acelerando até encostar no próximo (ângulo de
// contato) e depois acompanha o próximo até o ângulo de repouso em que as peças ficam paralelas.

const H = 1; // altura do dominó (unidade do mundo)
const T = 0.17; // espessura
const WD = 0.5; // largura
const PITCH = 0.56; // passo entre dominós, em alturas
const TH_C = Math.asin((PITCH - T) / H); // encosta no próximo
const TH_R = Math.acos(T / PITCH); // repouso (peças paralelas)
const FLAT = Math.PI / 2 - Math.asin(T / H) * 0.3;

function hull(pts) {
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [];
  for (const p of pts) {
    while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop();
    lo.push(p);
  }
  const up = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop();
    up.push(p);
  }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

const shade = (c, k, add = 0) =>
  `rgb(${Math.min(255, Math.round(c[0] * k + add))},${Math.min(255, Math.round(c[1] * k + add))},${Math.min(255, Math.round(c[2] * k + add))})`;

export default {
  id: 'dominoes',
  title: 'Dominoes',
  description: 'A row of dominoes in perspective toppling in a chain along an S-shaped path, then standing back up in a wave.',
  category: 'formas',
  tags: ['3d', 'shape', 'simulation', 'loop'],
  duration: 10,
  poster: 3.4,

  params: {
    bg: { type: 'color', label: 'Background', default: '#e9e5dd' },
    body: { type: 'color', label: 'Domino', default: '#17181c' },
    pip: { type: 'color', label: 'Pips', default: '#f1ede5' },
    accent: { type: 'color', label: 'Accent (1st)', default: '#ff5a36' },
    count: { type: 'range', label: 'Dominoes', min: 12, max: 80, step: 1, default: 30 },
    speed: { type: 'range', label: 'Fall duration (s)', min: 2, max: 6, step: 0.1, default: 4.2 },
    tilt: { type: 'range', label: 'Camera tilt', min: 25, max: 75, step: 1, default: 48 },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 3 },
  },

  setup({ w, h, p }) {
    const m = Math.min(w, h);
    const n = Math.round(p.count);
    const el = (p.tilt * Math.PI) / 180;
    const D = 30;
    const F = m * 2.2;
    const cam = { el, D, F, cx: w / 2, cy: h / 2 };
    // raio da tela para o chão (y = 0), câmera sem yaw
    const C = [0, D * Math.sin(el), -D * Math.cos(el)];
    const fw = [0, -Math.sin(el), Math.cos(el)];
    const upv = [0, Math.cos(el), Math.sin(el)];
    const toGround = (sx, sy) => {
      const xc = (sx - w / 2) / F;
      const yc = -(sy - h / 2) / F;
      const d = [xc, upv[1] * yc + fw[1], upv[2] * yc + fw[2]];
      const k = -C[1] / d[1];
      return [C[0] + d[0] * k, C[2] + d[2] * k];
    };
    // caminho na tela, conforme o formato
    const land = w >= h * 1.05;
    const N = 400;
    const raw = [];
    for (let i = 0; i <= N; i++) {
      const s = i / N;
      let sx;
      let sy;
      if (land) {
        sx = w / 2 + (s - 0.5) * w * 0.82;
        sy = h * 0.56 - Math.sin(TAU * s) * h * 0.25;
      } else {
        sy = h * 0.2 + s * h * 0.66;
        sx = w / 2 + Math.sin(TAU * s) * w * 0.27;
      }
      raw.push(toGround(sx, sy));
    }
    const acc = [0];
    for (let i = 1; i <= N; i++) acc.push(acc[i - 1] + Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1]));
    const L = acc[N];
    const pitch = L / (n - 1);
    const unit = pitch / PITCH; // tamanho do mundo para H = 1
    const at = (d) => {
      let j = 1;
      while (j < N && acc[j] < d) j++;
      const f = (d - acc[j - 1]) / (acc[j] - acc[j - 1] || 1);
      const x = raw[j - 1][0] + (raw[j][0] - raw[j - 1][0]) * f;
      const z = raw[j - 1][1] + (raw[j][1] - raw[j - 1][1]) * f;
      const tx = raw[j][0] - raw[j - 1][0];
      const tz = raw[j][1] - raw[j - 1][1];
      const tl = Math.hypot(tx, tz) || 1;
      return { x, z, tx: tx / tl, tz: tz / tl };
    };
    const r = rng(p.seed * 97);
    const dom = [];
    for (let i = 0; i < n; i++) {
      const q = at(i * pitch);
      dom.push({ ...q, a: Math.floor(r() * 7), b: Math.floor(r() * 7) });
    }
    return { cam, dom, unit, body: hexToRgb(p.body), acc: hexToRgb(p.accent) };
  },

  render(ctx, t, { w, h, p, duration, progress, state }) {
    const { cam, dom, unit } = state;
    const n = dom.length;
    const m = Math.min(w, h);
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, w, h);

    // ---------- ângulos (função pura de t) ----------
    const t0 = 0.7;
    const dt = p.speed / n;
    const own = (i) => {
      const x = seg(t, t0 + i * dt, t0 + (i + 1) * dt);
      if (i === n - 1) {
        // último: cai deitado, com um quique pequeno
        const y = seg(t, t0 + i * dt, t0 + (i + 2.2) * dt);
        const fall = clamp(y / 0.62);
        const bounce = y > 0.62 ? Math.sin(((y - 0.62) / 0.38) * Math.PI) * 0.07 * (1 - (y - 0.62) / 0.38) : 0;
        return FLAT * fall ** 1.8 - bounce;
      }
      return TH_C * x ** 1.7;
    };
    const ang = new Float32Array(n);
    for (let i = n - 1; i >= 0; i--) {
      const a = own(i);
      if (i < n - 1 && t >= t0 + (i + 1) * dt) {
        const nxt = ang[i + 1];
        const lim = i + 1 === n - 1 ? FLAT : TH_R;
        ang[i] = TH_C + (TH_R - TH_C) * clamp(nxt / lim);
      } else ang[i] = a;
    }
    // volta: onda de mola, do primeiro ao último
    const rise0 = t0 + p.speed + 1.4;
    const rise1 = duration - 0.9;
    const riseSpread = Math.max(0.5, rise1 - rise0 - 0.7);
    for (let i = 0; i < n; i++) {
      const k = seg(t, rise0 + (i / (n - 1)) * riseSpread, rise0 + (i / (n - 1)) * riseSpread + 0.7);
      if (k > 0) ang[i] *= 1 - ease.outBack(k);
    }
    // empurrãozinho do primeiro (antecipação)
    ang[0] -= 0.08 * Math.sin(Math.PI * seg(t, t0 - 0.45, t0)) * (t < t0 ? 1 : 0);

    // ---------- câmera ----------
    const yaw = 0.05 * Math.sin(TAU * progress);
    const cy0 = Math.cos(yaw);
    const sy0 = Math.sin(yaw);
    const sel = Math.sin(cam.el);
    const cel = Math.cos(cam.el);
    const P = (x, y, z) => {
      // yaw em torno do eixo vertical e depois câmera
      const xr = x * cy0 - z * sy0;
      const zr = x * sy0 + z * cy0;
      const dy = y - cam.D * sel;
      const dz = zr + cam.D * cel;
      const yc = dy * cel + dz * sel;
      const zc = -dy * sel + dz * cel;
      const s = cam.F / zc;
      return [cam.cx + xr * s, cam.cy - yc * s, zc];
    };
    const light = [-0.45, 0.8, -0.4];
    const ll = Math.hypot(...light);
    for (let i = 0; i < 3; i++) light[i] /= ll;
    const sdir = [0.55, -1, 0.25]; // direção da luz da sombra (para baixo)

    // ---------- geometria ----------
    const items = [];
    const Hh = H * unit;
    const Tt = T * unit;
    const Ww = WD * unit;
    for (let i = 0; i < n; i++) {
      const d = dom[i];
      const th = ang[i];
      const c = Math.cos(th);
      const s = Math.sin(th);
      const piv = th >= 0 ? Tt / 2 : -Tt / 2;
      const side = [-d.tz, 0, d.tx];
      // ponto local (a ao longo do caminho, b lateral, cc para cima) → mundo
      const W3 = (a, b, cc) => {
        const a2 = piv + (a - piv) * c + cc * s;
        const c2 = -(a - piv) * s + cc * c;
        return [d.x + d.tx * a2 + side[0] * b, c2, d.z + d.tz * a2 + side[2] * b];
      };
      const V = [];
      for (const a of [-Tt / 2, Tt / 2]) for (const b of [-Ww / 2, Ww / 2]) for (const cc of [0, Hh]) V.push(W3(a, b, cc));
      const ctr = W3(0, 0, Hh / 2);
      items.push({ i, V, W3, th, z: P(...ctr)[2] });
    }

    // sombras (casco convexo da caixa projetada no chão), num fill só
    ctx.fillStyle = rgba('#000000', 0.13);
    ctx.beginPath();
    for (const it of items) {
      const pts = it.V.map((v) => {
        const k = v[1] / -sdir[1];
        const g = P(v[0] + sdir[0] * k, 0, v[2] + sdir[2] * k);
        return [g[0], g[1]];
      });
      const hp = hull(pts);
      ctx.moveTo(hp[0][0], hp[0][1]);
      for (let j = 1; j < hp.length; j++) ctx.lineTo(hp[j][0], hp[j][1]);
      ctx.closePath();
    }
    ctx.fill();
    // contato mais escuro na base
    ctx.fillStyle = rgba('#000000', 0.1);
    ctx.beginPath();
    for (const it of items) {
      const v = it.V;
      const q = [v[0], v[2], v[6], v[4]].map((x) => P(x[0], 0, x[2]));
      ctx.moveTo(q[0][0], q[0][1]);
      for (let j = 1; j < 4; j++) ctx.lineTo(q[j][0], q[j][1]);
      ctx.closePath();
    }
    ctx.fill();

    items.sort((a, b) => b.z - a.z);
    // faces da caixa: índices em V (a,b,c → bit 2,1,0)
    const FACES = [
      [[0, 1, 3, 2], [-1, 0, 0]], // trás (a-)
      [[4, 6, 7, 5], [1, 0, 0]], // frente (a+)
      [[0, 4, 5, 1], [0, -1, 0]], // lado b-
      [[2, 3, 7, 6], [0, 1, 0]], // lado b+
      [[1, 5, 7, 3], [0, 0, 1]], // topo
      [[0, 2, 6, 4], [0, 0, -1]], // base
    ];
    ctx.lineJoin = 'round';
    for (const it of items) {
      const { i, V, W3 } = it;
      const PV = V.map((v) => P(v[0], v[1], v[2]));
      const col = i === 0 ? state.acc : state.body;
      const isAcc = i === 0;
      for (let f = 0; f < 6; f++) {
        const [ix] = FACES[f];
        const a = PV[ix[0]];
        const b = PV[ix[1]];
        const c = PV[ix[2]];
        // descarte por orientação na tela (as faces estão em ordem consistente)
        const cr = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
        if (cr <= 0) continue;
        // normal no mundo
        const A = V[ix[0]];
        const B = V[ix[1]];
        const Cc = V[ix[2]];
        const u1 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
        const u2 = [Cc[0] - A[0], Cc[1] - A[1], Cc[2] - A[2]];
        let nx = u1[1] * u2[2] - u1[2] * u2[1];
        let ny = u1[2] * u2[0] - u1[0] * u2[2];
        let nz = u1[0] * u2[1] - u1[1] * u2[0];
        const nl = Math.hypot(nx, ny, nz) || 1;
        nx /= nl;
        ny /= nl;
        nz /= nl;
        const lit = Math.abs(nx * light[0] + ny * light[1] + nz * light[2]);
        const big = f < 2;
        ctx.fillStyle = isAcc ? shade(col, 0.62 + 0.5 * lit) : shade(col, 0.8 + 0.5 * lit, (big ? 6 : 26) + 40 * lit * lit);
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = m * 0.0012;
        ctx.beginPath();
        for (let j = 0; j < 4; j++) {
          const q = PV[ix[j]];
          if (j) ctx.lineTo(q[0], q[1]);
          else ctx.moveTo(q[0], q[1]);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // pontos e divisória nas faces largas
        if (!big) continue;
        const d = dom[i];
        const aa = f === 0 ? -Tt / 2 - 1e-4 : Tt / 2 + 1e-4;
        const s0 = f === 0 ? 1 : -1; // espelha para ler igual dos dois lados
        const Pp = (b, cc) => {
          const v = W3(aa, b * s0, cc);
          return P(v[0], v[1], v[2]);
        };
        ctx.fillStyle = isAcc ? rgba('#ffffff', 0.85) : p.pip;
        ctx.strokeStyle = ctx.fillStyle;
        // divisória
        const d0 = Pp(-Ww * 0.36, Hh / 2);
        const d1 = Pp(Ww * 0.36, Hh / 2);
        ctx.lineWidth = Math.max(0.5, Math.abs(d1[0] - d0[0]) * 0.03 + Math.abs(d1[1] - d0[1]) * 0.03);
        ctx.beginPath();
        ctx.moveTo(d0[0], d0[1]);
        ctx.lineTo(d1[0], d1[1]);
        ctx.stroke();
        // pips (círculo afim: centro + dois eixos projetados)
        const pr = Ww * 0.075;
        ctx.beginPath();
        for (const [val, half] of [[d.a, 1], [d.b, 0]]) {
          const yc = Hh * (half ? 0.75 : 0.25);
          const g = Ww * 0.22;
          const spots = PIPS[val];
          for (const [sx, sy] of spots) {
            const c0 = Pp(sx * g, yc + sy * g);
            const cx1 = Pp(sx * g + pr, yc + sy * g);
            const cy1 = Pp(sx * g, yc + sy * g + pr);
            ctx.save();
            ctx.transform(cx1[0] - c0[0], cx1[1] - c0[1], cy1[0] - c0[0], cy1[1] - c0[1], c0[0], c0[1]);
            ctx.moveTo(1, 0);
            ctx.arc(0, 0, 1, 0, TAU);
            ctx.restore();
          }
        }
        ctx.fill();
      }
    }
  },
};

// posições dos pontos (grade 3×3 em -1..1)
const PIPS = [
  [],
  [[0, 0]],
  [[-1, -1], [1, 1]],
  [[-1, -1], [0, 0], [1, 1]],
  [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
];
