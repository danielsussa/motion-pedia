import { seg, lerp, ease, hexToRgb, rgba } from '../lib/anim.js';

// Folha de papel que se dobra em etapas até virar um avião de papel (dardo clássico), levanta voo e sai.
//
// Como funciona:
// 1. No setup, um simulador de dobras PLANAS (2D) aplica as etapas na folha: cada dobra corta as facetas
//    que cruzam o vinco (em coordenadas do papel), reflete as do lado que se move e atualiza a ordem das
//    camadas (vale = por cima de tudo, montanha = por baixo). Sai daí: as facetas (polígonos no papel),
//    o vinco de cada etapa no referencial de uma faceta de referência, e a camada final de cada faceta.
// 2. No render, cada etapa vira uma rotação 3D em torno do vinco *na posição atual* da faceta de
//    referência (calculada com os ângulos atuais das etapas anteriores). Isso deixa reabrir dobras
//    depois (as asas abrem a 90°) sem quebrar a geometria.
// 3. As camadas coplanares ganham um afastamento minúsculo ao longo da normal (pela camada final), e a
//    ordem de pintura vem de testes de plano par a par (estilo Newell) + ordenação topológica.

const W = 1;
const HH = Math.SQRT2; // proporção A4
const Y0 = HH / 2;
let EPS = 0.0002; // afastamento entre camadas (unidades do papel); ajustado pelo nº de camadas

// etapas: vinco (P→Q, mundo plano no momento da dobra), ponto do lado que se move, tipo, filtro
const xB = -0.5;
const yB = Y0 - 0.5 * Math.tan((67.5 * Math.PI) / 180);
const WING = [[0.035, Y0], [0.135, -Y0]];
const STEPS = [
  { P: [0, Y0], Q: [-0.5, Y0 - 0.5], side: [-0.45, Y0 - 0.05], kind: 'v' }, // 0 ponta esq.
  { P: [0, Y0], Q: [0.5, Y0 - 0.5], side: [0.45, Y0 - 0.05], kind: 'v' }, // 1 ponta dir.
  { P: [0, Y0], Q: [xB, yB], side: [-0.45, 0], kind: 'v' }, // 2 borda esq.
  { P: [0, Y0], Q: [-xB, yB], side: [0.45, 0], kind: 'v' }, // 3 borda dir.
  { P: [0, 1], Q: [0, -1], side: [-0.2, 0], kind: 'm' }, // 4 ao meio (por trás)
  { P: WING[0], Q: WING[1], side: [0.4, -0.6], kind: 'v', filter: (cx) => cx > 0 }, // 5 asa de cima
  { P: WING[0], Q: WING[1], side: [0.4, -0.6], kind: 'm', filter: (cx) => cx < 0 }, // 6 asa de baixo
];

// --- geometria 2D -----------------------------------------------------------------------------
const apply2 = (M, [x, y]) => [M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]];
const compose2 = (A, B) => [
  A[0] * B[0] + A[2] * B[1],
  A[1] * B[0] + A[3] * B[1],
  A[0] * B[2] + A[2] * B[3],
  A[1] * B[2] + A[3] * B[3],
  A[0] * B[4] + A[2] * B[5] + A[4],
  A[1] * B[4] + A[3] * B[5] + A[5],
];
const inv2 = (M) => {
  // isometria: inversa = transposta
  const [a, b, c, d, e, f] = M;
  return [a, c, b, d, -(a * e + b * f), -(c * e + d * f)];
};
function reflectM(P, Q) {
  let dx = Q[0] - P[0];
  let dy = Q[1] - P[1];
  const l = Math.hypot(dx, dy);
  dx /= l;
  dy /= l;
  const a = 2 * dx * dx - 1;
  const b = 2 * dx * dy;
  const d = 2 * dy * dy - 1;
  return [a, b, b, d, P[0] - (a * P[0] + b * P[1]), P[1] - (b * P[0] + d * P[1])];
}
const crossL = (P, Q, v) => (Q[0] - P[0]) * (v[1] - P[1]) - (Q[1] - P[1]) * (v[0] - P[0]);

// corta um polígono (pts + tag por aresta) pelo sinal s; devolve o lado S (+1/-1)
function clipSide(pts, tags, s, S, k) {
  const out = [];
  const ot = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const sc = s[i] * S;
    const sn = s[j] * S;
    const X = () => {
      const f = s[i] / (s[i] - s[j]);
      return [pts[i][0] + (pts[j][0] - pts[i][0]) * f, pts[i][1] + (pts[j][1] - pts[i][1]) * f];
    };
    if (sc >= 0) {
      if (sn >= 0) {
        out.push(pts[i]);
        ot.push(tags[i]);
      } else if (sc > 0) {
        out.push(pts[i]);
        ot.push(tags[i]);
        out.push(X());
        ot.push(k);
      } else {
        out.push(pts[i]);
        ot.push(k);
      }
    } else if (sn > 0) {
      out.push(X());
      ot.push(tags[i]);
    }
  }
  return { pts: out, tags: ot };
}
const area = (pts) => {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
};
const centroid = (pts) => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];

function simulate() {
  let facets = [
    {
      pts: [[-W / 2, -Y0], [W / 2, -Y0], [W / 2, Y0], [-W / 2, Y0]],
      tags: [-1, -1, -1, -1],
      M: [1, 0, 0, 1, 0, 0],
      L: 0,
      moves: [],
      anc: [0],
    },
  ];
  let uid = 1;
  const steps = [];
  STEPS.forEach((st, k) => {
    let { P, Q } = st;
    const sideSign = Math.sign(crossL(P, Q, st.side));
    const next = [];
    for (const f of facets) {
      const pc = centroid(f.pts);
      if (st.filter && !st.filter(pc[0])) {
        next.push(f);
        continue;
      }
      const s = f.pts.map((v) => {
        const c = crossL(P, Q, apply2(f.M, v));
        return Math.abs(c) < 1e-9 ? 0 : c;
      });
      const hasP = s.some((v) => v > 1e-7);
      const hasN = s.some((v) => v < -1e-7);
      if (hasP && hasN) {
        for (const S of [1, -1]) {
          const c = clipSide(f.pts, f.tags, s, S, k);
          if (c.pts.length >= 3 && Math.abs(area(c.pts)) > 1e-7) next.push({ ...f, pts: c.pts, tags: c.tags, moves: [...f.moves], anc: [...f.anc, uid++] });
        }
      } else next.push(f);
    }
    facets = next;
    // quem se move
    let maxL = -Infinity;
    let minL = Infinity;
    for (const f of facets) {
      maxL = Math.max(maxL, f.L);
      minL = Math.min(minL, f.L);
    }
    const R = reflectM(P, Q);
    const moving = [];
    for (let i = 0; i < facets.length; i++) {
      const f = facets[i];
      const pc = centroid(f.pts);
      if (st.filter && !st.filter(pc[0])) continue;
      const wc = apply2(f.M, pc);
      if (Math.sign(crossL(P, Q, wc)) === sideSign) moving.push(i);
    }
    // vinco no referencial da 1ª faceta que se move; orienta o eixo para +θ subir (vale) ou descer (montanha)
    const want = st.kind === 'v' ? 1 : -1;
    if (sideSign !== want) [P, Q] = [Q, P];
    const ref = moving[0];
    const iv = inv2(facets[ref].M);
    steps.push({ refId: facets[ref].anc[facets[ref].anc.length - 1], Pp: apply2(iv, P), Qp: apply2(iv, Q) });
    for (const i of moving) {
      const f = facets[i];
      f.M = compose2(R, f.M);
      f.L = st.kind === 'v' ? 2 * maxL + 1 - f.L : 2 * minL - 1 - f.L;
      f.moves.push(k);
    }
  });
  // camadas → posições compactas
  const Ls = [...new Set(facets.map((f) => f.L))].sort((a, b) => a - b);
  EPS = 0.002 / Math.max(1, Ls.length);
  for (const f of facets) {
    f.rank = Ls.indexOf(f.L);
    f.parity = Math.sign(f.M[0] * f.M[3] - f.M[1] * f.M[2]);
    f.zoff = f.parity * f.rank * EPS;
  }
  // os índices mudam quando cortamos: quem se move vem de "moves"; a referência é qualquer
  // descendente da faceta de referência original (compartilha a transformação até a etapa k)
  const out = steps.map((s, k) => {
    const mov = [];
    facets.forEach((f, i) => {
      if (f.moves.includes(k)) mov.push(i);
    });
    const ref = facets.findIndex((f) => f.anc.includes(s.refId));
    return { ref, Pp: s.Pp, Qp: s.Qp, moving: mov };
  });
  return { facets, steps: out, eps: EPS };
}

// --- 3D ---------------------------------------------------------------------------------------
// matriz 3×4 [r00 r01 r02 tx | r10 r11 r12 ty | r20 r21 r22 tz]
const I3 = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
const ap3 = (M, x, y, z) => [
  M[0] * x + M[1] * y + M[2] * z + M[3],
  M[4] * x + M[5] * y + M[6] * z + M[7],
  M[8] * x + M[9] * y + M[10] * z + M[11],
];
function mul3(A, B) {
  const o = new Array(12);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) o[r * 4 + c] = A[r * 4] * B[c] + A[r * 4 + 1] * B[4 + c] + A[r * 4 + 2] * B[8 + c];
    o[r * 4 + 3] = A[r * 4] * B[3] + A[r * 4 + 1] * B[7] + A[r * 4 + 2] * B[11] + A[r * 4 + 3];
  }
  return o;
}
function axisRot(A, B, th) {
  let ux = B[0] - A[0];
  let uy = B[1] - A[1];
  let uz = B[2] - A[2];
  const l = Math.hypot(ux, uy, uz);
  ux /= l;
  uy /= l;
  uz /= l;
  const c = Math.cos(th);
  const s = Math.sin(th);
  const t = 1 - c;
  const R = [
    t * ux * ux + c, t * ux * uy - s * uz, t * ux * uz + s * uy, 0,
    t * ux * uy + s * uz, t * uy * uy + c, t * uy * uz - s * ux, 0,
    t * ux * uz - s * uy, t * uy * uz + s * ux, t * uz * uz + c, 0,
  ];
  // translação: A - R·A
  const RA = ap3(R, A[0], A[1], A[2]);
  R[3] = A[0] - RA[0];
  R[7] = A[1] - RA[1];
  R[11] = A[2] - RA[2];
  return R;
}
// quatérnios (para interpolar a orientação do avião)
function matToQuat(m) {
  const [a, b, c, , d, e, f, , g, h, i] = m;
  const tr = a + e + i;
  let q;
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2;
    q = [s / 4, (h - f) / s, (c - g) / s, (d - b) / s];
  } else if (a > e && a > i) {
    const s = Math.sqrt(1 + a - e - i) * 2;
    q = [(h - f) / s, s / 4, (b + d) / s, (c + g) / s];
  } else if (e > i) {
    const s = Math.sqrt(1 + e - a - i) * 2;
    q = [(c - g) / s, (b + d) / s, s / 4, (f + h) / s];
  } else {
    const s = Math.sqrt(1 + i - a - e) * 2;
    q = [(d - b) / s, (c + g) / s, (f + h) / s, s / 4];
  }
  return q;
}
function quatToMat([w, x, y, z]) {
  return [
    1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w), 0,
    2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w), 0,
    2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y), 0,
  ];
}
function slerp(a, b, t) {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  if (d < 0) {
    b = b.map((v) => -v);
    d = -d;
  }
  if (d > 0.9995) {
    const r = a.map((v, i) => v + (b[i] - v) * t);
    const l = Math.hypot(...r);
    return r.map((v) => v / l);
  }
  const th = Math.acos(d);
  const s = Math.sin(th);
  const ka = Math.sin((1 - t) * th) / s;
  const kb = Math.sin(t * th) / s;
  return a.map((v, i) => v * ka + b[i] * kb);
}
const rotX = (a) => [1, 0, 0, 0, 0, Math.cos(a), -Math.sin(a), 0, 0, Math.sin(a), Math.cos(a), 0];
const rotY = (a) => [Math.cos(a), 0, Math.sin(a), 0, 0, 1, 0, 0, -Math.sin(a), 0, Math.cos(a), 0];
const rotZ = (a) => [Math.cos(a), -Math.sin(a), 0, 0, Math.sin(a), Math.cos(a), 0, 0, 0, 0, 1, 0];

const DIH_R = 0.25;
const DIH_L = 0.25;

const LABELS = [
  [1.0, 'Corners to the center crease'],
  [2.7, 'Edges to the center'],
  [4.5, 'Fold in half'],
  [6.3, 'Fold down the wings'],
  [8.2, 'Open and throw'],
];

const shade = (c, k) => `rgb(${Math.min(255, Math.round(c[0] * k))},${Math.min(255, Math.round(c[1] * k))},${Math.min(255, Math.round(c[2] * k))})`;

export default {
  id: 'origami',
  title: 'Origami',
  description: 'A sheet of paper folds in 3D, step by step, into a paper plane that spreads its wings and flies away.',
  category: 'formas',
  tags: ['3d', 'shape'],
  duration: 14,
  poster: 10.6,

  params: {
    bg: { type: 'color', label: 'Background', default: '#16171b' },
    front: { type: 'color', label: 'Paper (front)', default: '#f3efe7' },
    back: { type: 'color', label: 'Paper (back)', default: '#ff6a3d' },
    accent: { type: 'color', label: 'Accent (captions)', default: '#ff6a3d' },
    size: { type: 'range', label: 'Size', min: 0.5, max: 1.4, step: 0.01, default: 1 },
    speed: { type: 'range', label: 'Fold pace', min: 0.6, max: 1.6, step: 0.05, default: 1 },
    labels: { type: 'boolean', label: 'Step captions', default: true },
  },

  setup({ w, h, p, px }) {
    const sim = simulate();
    // fundo com halo, pintado uma vez
    const bgc = document.createElement('canvas');
    bgc.width = Math.max(1, Math.round(w * px));
    bgc.height = Math.max(1, Math.round(h * px));
    const g = bgc.getContext('2d');
    g.scale(px, px);
    g.fillStyle = p.bg;
    g.fillRect(0, 0, w, h);
    const m = Math.min(w, h);
    const rg = g.createRadialGradient(w / 2, h * 0.48, 0, w / 2, h * 0.48, Math.hypot(w, h) * 0.6);
    rg.addColorStop(0, rgba('#ffffff', 0.06));
    rg.addColorStop(1, rgba('#ffffff', 0));
    g.fillStyle = rg;
    g.fillRect(0, 0, w, h);
    const vg = g.createRadialGradient(w / 2, h / 2, m * 0.3, w / 2, h / 2, Math.hypot(w, h) * 0.62);
    vg.addColorStop(0, rgba('#000000', 0));
    vg.addColorStop(1, rgba('#000000', 0.35));
    g.fillStyle = vg;
    g.fillRect(0, 0, w, h);
    return { ...sim, bgc, front: hexToRgb(p.front), back: hexToRgb(p.back) };
  },

  render(ctx, t, { w, h, p, state: S }) {
    const { facets, steps, front, back } = S;
    ctx.drawImage(S.bgc, 0, 0, w, h);
    const m = Math.min(w, h);

    // ---------- linha do tempo ----------
    const sp = 1 / p.speed;
    const T = (x) => 1 + (x - 1) * sp; // estica as dobras em torno de t=1
    const fold = (a, b) => Math.PI * ease.inOutCubic(seg(t, T(a), T(b)));
    const tLift0 = T(8.3);
    const tLift1 = tLift0 + 1.6;
    const lift = ease.inOutCubic(seg(t, tLift0, tLift1));
    const open = ease.inOutCubic(seg(t, tLift0 + 0.2, tLift1));
    const ang = [
      fold(1.0, 2.0),
      fold(1.35, 2.35),
      fold(2.8, 3.8),
      fold(3.15, 4.15),
      fold(4.7, 6.0) - 0.16 * open,
      fold(6.5, 7.5) - (Math.PI / 2 - DIH_R) * open,
      fold(6.8, 7.8) - (Math.PI / 2 + DIH_L) * open,
    ];

    // ---------- dobras: transformação de cada faceta ----------
    const Tf = facets.map(() => I3());
    for (let k = 0; k < steps.length; k++) {
      const th = ang[k];
      if (Math.abs(th) < 1e-6) continue;
      const st = steps[k];
      const R0 = Tf[st.ref];
      const A = ap3(R0, st.Pp[0], st.Pp[1], 0);
      const B = ap3(R0, st.Qp[0], st.Qp[1], 0);
      const R = axisRot(A, B, th);
      for (const i of st.moving) Tf[i] = mul3(R, Tf[i]);
    }

    // ---------- pose global (mesa → voo) ----------
    const tEnter = ease.outCubic(seg(t, 0, 0.9));
    const tableRz = lerp(-0.32, 0.14, ease.inOutSine(seg(t, 0, T(8.3)))) + (1 - tEnter) * -0.25;
    const qTable = matToQuat(rotZ(tableRz));
    // voo: cima do avião (+x) → +y, nariz (+y) → +x, asa (+z) → -z; depois guinada e arfagem
    const hero = t - tLift1;
    const yaw = -1.0 + 0.18 * Math.sin(hero * 0.9) + -0.25 * lift;
    const base = [0, 1, 0, 0, 1, 0, 0, 0, 0, 0, -1, 0];
    const roll = 0.12 * Math.sin(hero * 1.3 + 0.5);
    const heroM = mul3(rotY(yaw), mul3(rotX(0.38 + 0.06 * Math.sin(hero * 1.1)), mul3(rotZ(0.06), base)));
    const qHero = matToQuat(mulRoll(heroM, roll));
    const q = slerp(qTable, qHero, lift);
    const G = quatToMat(q);
    const pivot = [lerp(0, 0.09, lift), lerp(0, 0.05, lift), 0];
    // saída: voa na direção do nariz
    const tOut0 = T(8.3) + 4.2;
    const fly = ease.inCubic(seg(t, tOut0, tOut0 + 1.3));
    const nose = ap3(G, 0, 1, 0).map((v, i) => v - [G[3], G[7], G[11]][i]);
    const bob = 0.04 * Math.sin(Math.max(0, hero) * 1.6) * lift;
    const trans = [nose[0] * fly * 4.5, bob + lift * 0.02 + nose[1] * fly * 4.5 + fly * 0.6, lift * 0.35 + nose[2] * fly * 4.5];
    const enterS = lerp(0.9, 1, tEnter) * lerp(1, 1.5, lift);

    // ---------- câmera ----------
    const tilt = lerp(0.72, 0.0, lift);
    const ct = Math.cos(tilt);
    const st_ = Math.sin(tilt);
    const U = m * 0.4 * p.size;
    const DIST = 4.2;
    const cx = w / 2;
    const cy = h / 2 + m * lerp(0.03, 0, lift);
    const toView = (v) => {
      // G·(v - pivot)·escala + trans
      const x0 = (v[0] - pivot[0]) * enterS;
      const y0 = (v[1] - pivot[1]) * enterS;
      const z0 = (v[2] - pivot[2]) * enterS;
      const x = G[0] * x0 + G[1] * y0 + G[2] * z0 + trans[0];
      const y = G[4] * x0 + G[5] * y0 + G[6] * z0 + trans[1];
      const z = G[8] * x0 + G[9] * y0 + G[10] * z0 + trans[2];
      return [x, y * ct + z * st_, -y * st_ + z * ct, z];
    };
    const proj = (v) => {
      const s = (U * DIST) / (DIST - v[2]);
      return [cx + v[0] * s, cy - v[1] * s];
    };

    // ---------- facetas em vista ----------
    const L = [-0.62, 0.7, 0.38];
    const ll = Math.hypot(...L);
    const items = [];
    for (let i = 0; i < facets.length; i++) {
      const f = facets[i];
      const M = Tf[i];
      const V = f.pts.map(([x, y]) => toView(ap3(M, x, y, f.zoff)));
      const n0 = toView(ap3(M, 0, 0, 0));
      const n1 = toView(ap3(M, 0, 0, 1));
      let nx = n1[0] - n0[0];
      let ny = n1[1] - n0[1];
      let nz = n1[2] - n0[2];
      const nl = Math.hypot(nx, ny, nz);
      nx /= nl;
      ny /= nl;
      nz /= nl;
      const c = V[0];
      // lado visível: câmera em (0,0,DIST)
      const facing = nx * (0 - c[0]) + ny * (0 - c[1]) + nz * (DIST - c[2]) > 0;
      const sg = facing ? 1 : -1;
      const lit = Math.max(0, (sg * (nx * L[0] + ny * L[1] + nz * L[2])) / ll);
      const col = facing ? front : back;
      const k = 0.52 + 0.6 * lit + 0.08 * Math.pow(lit, 12);
      const P2 = V.map(proj);
      let x0 = Infinity;
      let x1 = -Infinity;
      let y0 = Infinity;
      let y1 = -Infinity;
      for (const q2 of P2) {
        x0 = Math.min(x0, q2[0]);
        x1 = Math.max(x1, q2[0]);
        y0 = Math.min(y0, q2[1]);
        y1 = Math.max(y1, q2[1]);
      }
      const depth = V.reduce((s, v) => s + v[2], 0) / V.length;
      items.push({ i, V, P2, n: [nx, ny, nz], c, fill: shade(col, k), edge: shade(col, k * 0.72), bb: [x0, y0, x1, y1], depth, world: V });
    }

    // ---------- sombra na mesa (some quando levanta) ----------
    const shA = (1 - lift) * tEnter;
    if (shA > 0.01) {
      const ls = [0.22, -0.3, -1];
      ctx.fillStyle = rgba('#000000', 0.32 * shA);
      ctx.beginPath();
      for (let i = 0; i < facets.length; i++) {
        const f = facets[i];
        const pts = f.pts.map(([x, y]) => {
          const v = ap3(Tf[i], x, y, f.zoff);
          // G sem tradução nem câmera, para achar a altura em relação à mesa
          const x0 = (v[0] - pivot[0]) * enterS;
          const y0 = (v[1] - pivot[1]) * enterS;
          const z0 = (v[2] - pivot[2]) * enterS + 0.02;
          let wx = G[0] * x0 + G[1] * y0 + G[2] * z0 + trans[0];
          let wy = G[4] * x0 + G[5] * y0 + G[6] * z0 + trans[1];
          const wz = G[8] * x0 + G[9] * y0 + G[10] * z0 + trans[2];
          wx -= ls[0] * (wz / ls[2]);
          wy -= ls[1] * (wz / ls[2]);
          return proj([wx, wy * ct, -wy * st_]);
        });
        if (area(pts) < 0) pts.reverse();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let j = 1; j < pts.length; j++) ctx.lineTo(pts[j][0], pts[j][1]);
        ctx.closePath();
      }
      ctx.fill();
    }

    // ---------- ordem de pintura ----------
    const n = items.length;
    const TOL = S.eps * 0.3;
    const sideOf = (A, v) => {
      // >0: do lado da câmera em relação ao plano de A
      const d = A.n[0] * (v[0] - A.c[0]) + A.n[1] * (v[1] - A.c[1]) + A.n[2] * (v[2] - A.c[2]);
      const cs = A.n[0] * -A.c[0] + A.n[1] * -A.c[1] + A.n[2] * (DIST - A.c[2]);
      return cs >= 0 ? d : -d;
    };
    const behind = (A, B) => {
      // A pode ser pintado antes de B?
      let ok = true;
      for (const v of A.V) if (sideOf(B, v) > TOL) { ok = false; break; }
      if (ok) return true;
      for (const v of B.V) if (sideOf(A, v) < -TOL) return false;
      return true;
    };
    const indeg = new Int32Array(n);
    const adj = Array.from({ length: n }, () => []);
    for (let a = 0; a < n; a++)
      for (let b = a + 1; b < n; b++) {
        const A = items[a];
        const B = items[b];
        if (A.bb[2] < B.bb[0] || B.bb[2] < A.bb[0] || A.bb[3] < B.bb[1] || B.bb[3] < A.bb[1]) continue;
        const ab = behind(A, B);
        const ba = behind(B, A);
        if (ab && !ba) {
          adj[a].push(b);
          indeg[b]++;
        } else if (ba && !ab) {
          adj[b].push(a);
          indeg[a]++;
        }
      }
    const done = new Uint8Array(n);
    const order = [];
    for (let c = 0; c < n; c++) {
      let best = -1;
      for (let i = 0; i < n; i++) if (!done[i] && indeg[i] === 0 && (best < 0 || items[i].depth < items[best].depth)) best = i;
      if (best < 0) for (let i = 0; i < n; i++) if (!done[i] && (best < 0 || items[i].depth < items[best].depth)) best = i;
      done[best] = 1;
      order.push(best);
      for (const j of adj[best]) indeg[j]--;
    }

    // ---------- pinta ----------
    const vis = ease.outCubic(seg(t, 0, 0.6)) * (1 - seg(t, tOut0 + 1.0, tOut0 + 1.4));
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const seam = Math.max(0.9, m * 0.0012);
    const ew = m * 0.0013;
    for (const oi of order) {
      const it = items[oi];
      const f = facets[it.i];
      const P2 = it.P2;
      ctx.fillStyle = it.fill;
      ctx.strokeStyle = it.fill;
      ctx.lineWidth = seam;
      ctx.beginPath();
      ctx.moveTo(P2[0][0], P2[0][1]);
      for (let j = 1; j < P2.length; j++) ctx.lineTo(P2[j][0], P2[j][1]);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // arestas: borda do papel e vincos já dobrados
      ctx.strokeStyle = it.edge;
      ctx.lineWidth = ew;
      ctx.beginPath();
      for (let j = 0; j < P2.length; j++) {
        const tag = f.tags[j];
        if (tag >= 0 && Math.abs(ang[tag]) < 0.04) continue;
        const a = P2[j];
        const b = P2[(j + 1) % P2.length];
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
      }
      ctx.stroke();
    }

    // entrada/saída: cobre com o próprio fundo (alpha nas facetas mostraria as costuras)
    if (vis < 1) {
      ctx.globalAlpha = 1 - vis;
      ctx.drawImage(S.bgc, 0, 0, w, h);
      ctx.globalAlpha = 1;
    }

    // ---------- legendas ----------
    if (p.labels) {
      const fs = m * 0.024;
      const x = m * 0.075;
      const y = h - m * 0.075;
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'left';
      for (let i = 0; i < LABELS.length; i++) {
        const a = T(LABELS[i][0]) - 0.2;
        const b = i < LABELS.length - 1 ? T(LABELS[i + 1][0]) - 0.2 : T(8.3) + 4.4;
        const al = ease.outCubic(seg(t, a, a + 0.5)) * (1 - ease.inCubic(seg(t, b - 0.35, b)));
        if (al <= 0) continue;
        const dy = (1 - ease.outExpo(seg(t, a, a + 0.7))) * fs * 0.8;
        ctx.globalAlpha = al;
        ctx.font = `500 ${fs * 0.8}px "JetBrains Mono", monospace`;
        ctx.fillStyle = p.accent;
        const num = String(i + 1).padStart(2, '0');
        ctx.fillText(num, x, y + dy);
        const nw = ctx.measureText(num).width;
        ctx.fillStyle = rgba(p.front, 0.35);
        ctx.fillText(` / ${String(LABELS.length).padStart(2, '0')}`, x + nw, y + dy);
        ctx.font = `400 ${fs * 1.25}px "Instrument Serif", serif`;
        ctx.fillStyle = rgba(p.front, 0.9);
        ctx.fillText(LABELS[i][1], x, y + dy - fs * 1.35);
      }
      ctx.globalAlpha = 1;
    }
  },
};

// rolagem em torno do eixo do nariz (já em coordenadas de mundo do avião herói)
function mulRoll(M, a) {
  const noseW = [M[1], M[5], M[9]];
  return mul3(axisRot([0, 0, 0], noseW, a), M);
}
