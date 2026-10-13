import { TAU, clamp, lerp, seg, ease, rng, hexToRgb } from '../lib/anim.js';

// Objeto de voxels montado cubo a cubo: cada cubo cai do alto (aparecendo com alpha), quica de leve e
// assenta. Ordem de montagem: camada por camada (z), girando em volta do centro dentro de cada camada.
// Câmera ortográfica com azimute oscilando devagar (loop). Pintor por profundidade; face escondida por um
// vizinho já assentado não é desenhada (o miolo do objeto sai de graça). Desmonta de cima para baixo no fim.

// paleta: 0 = neutro, 1 = destaque, 2 = escuro, 3 = destaque claro
function heart() {
  const out = [];
  const inside = (gx, gz) => {
    const X = gx / 6.3;
    const Y = (gz - 7.2) / 6.3;
    const a = X * X + Y * Y - 1;
    return a * a * a - X * X * Y * Y * Y <= 0;
  };
  for (let gz = 0; gz <= 14; gz++) {
    for (let gx = -8; gx <= 8; gx++) {
      if (!inside(gx, gz)) continue;
      // espessura: distância (aprox.) até a borda
      let d = 0;
      while (d < 3 && inside(gx + d + 1, gz) && inside(gx - d - 1, gz) && inside(gx, gz + d + 1) && inside(gx, gz - d - 1)) d++;
      const k = d >= 3 ? 2 : d >= 1 ? 1 : 0;
      for (let y = -k; y <= k; y++) {
        out.push([gx, y, gz, 1]);
      }
    }
  }
  return { vox: out, az: 68, shadow: 0.55 };
}

function house() {
  const out = [];
  const W = 8;
  const D = 6;
  for (let z = 0; z < 4; z++)
    for (let x = 0; x < W; x++)
      for (let y = 0; y < D; y++) {
        let c = 0;
        if (y === D - 1 && x === 2 && z <= 1) c = 2; // porta
        if (y === D - 1 && (x === 5 || x === 6) && z === 1) c = 2; // janela da frente
        if (x === W - 1 && (y === 2 || y === 3) && z >= 1 && z <= 2) c = 2; // janela lateral
        if (z === 0 && c === 0) c = 4; // rodapé
        out.push([x, y, z, c]);
      }
  // telhado em degraus (duas águas ao longo de x), com beiral
  for (let r = 0; r < 4; r++)
    for (let x = -1; x <= W; x++)
      for (let y = r - 1; y <= D - r; y++) out.push([x, y, 4 + r, 1]);
  // oitão (parede triangular sob o telhado) já está coberto pelo telhado maciço; chaminé:
  for (let z = 6; z <= 8; z++) out.push([5, 1, z, 2]);
  return { vox: out, az: 40 };
}

function tree() {
  const out = [];
  for (let z = 0; z < 4; z++) out.push([0, 0, z, 2]);
  const R = 3.3;
  for (let z = 3; z <= 10; z++)
    for (let x = -4; x <= 4; x++)
      for (let y = -4; y <= 4; y++) {
        const d = Math.hypot(x, y, (z - 6.4) * 1.08);
        if (d <= R) out.push([x, y, z, 1]);
      }
  // grama: chapa baixa em volta
  for (let x = -2; x <= 2; x++) for (let y = -2; y <= 2; y++) if (Math.abs(x) + Math.abs(y) <= 3 && (x || y)) out.push([x, y, 0, 4]);
  return { vox: out, az: 45 };
}

function rocket() {
  const out = [];
  for (let z = 0; z <= 13; z++) {
    const r = z < 10 ? 1.9 : 1.9 * (1 - (z - 9.4) / 4.6);
    for (let x = -2; x <= 2; x++)
      for (let y = -2; y <= 2; y++) {
        if (Math.hypot(x, y) > r + 0.25) continue;
        let c = 0;
        if (z >= 10) c = 1;
        if (z === 6 && Math.abs(x) <= 0 && y === 2) c = 2;
        if (z === 6 && x === 2 && Math.abs(y) <= 0) c = 2;
        if (z === 2) c = 1;
        out.push([x, y, z, c]);
      }
  }
  // aletas
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ])
    for (let s = 3; s <= 4; s++) for (let z = 0; z <= 4 - s + 2; z++) out.push([dx * s, dy * s, z, 1]);
  return { vox: out, az: 45 };
}

const MODELS = { 'coração': heart, casa: house, 'árvore': tree, foguete: rocket };

const shadeCss = (c, k) => `rgb(${Math.round(c[0] * k)},${Math.round(c[1] * k)},${Math.round(c[2] * k)})`;
const DIRS = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

export default {
  id: 'voxel-build',
  title: 'Voxel Build',
  description: 'A voxel object (heart, house, tree, rocket) built cube by cube: each one drops, bounces and settles, layer by layer.',
  category: 'formas',
  tags: ['3d', 'shape', 'intro', 'loop'],
  duration: 10,
  poster: 7,

  params: {
    model: { type: 'select', label: 'Object', options: Object.keys(MODELS), default: 'coração' },
    accent: { type: 'color', label: 'Accent', default: '#ff5a4e' },
    neutral: { type: 'color', label: 'Neutral', default: '#ece6dc' },
    dark: { type: 'color', label: 'Dark', default: '#2c2f3a' },
    bg: { type: 'color', label: 'Background', default: '#14151b' },
    drop: { type: 'range', label: 'Drop height', min: 1, max: 12, step: 0.5, default: 5 },
    speed: { type: 'range', label: 'Pace', min: 0.5, max: 1, step: 0.01, default: 0.75 },
    size: { type: 'range', label: 'Size', min: 0.4, max: 1.4, step: 0.01, default: 1 },
    grid: { type: 'boolean', label: 'Floor grid', default: true },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 3 },
  },

  setup({ w, h, p, px, duration }) {
    const { vox, az, shadow = 1.15 } = MODELS[p.model]();
    const r = rng(p.seed);
    // centro da base
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z1 = 0;
    for (const [x, y, z] of vox) {
      x0 = Math.min(x0, x); x1 = Math.max(x1, x);
      y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      z1 = Math.max(z1, z);
    }
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const cubes = vox.map(([x, y, z, c]) => ({
      x, y, z, c,
      key: (Math.atan2(y - cy, x - cx) / TAU + 1) % 1,
      j: r(),
      tone: 0.95 + r() * 0.07,
    }));
    // ordem: camada, depois ângulo em volta do centro (com um pouco de ruído)
    cubes.sort((a, b) => a.z - b.z || a.key + a.j * 0.08 - (b.key + b.j * 0.08));
    const N = cubes.length;
    const k = duration / 10;
    const each = 0.55 * k;
    const buildA = 0.25 * k;
    const buildB = lerp(7.2, 4.6, (p.speed - 0.5) / 0.5) * k;
    const leaveA = 8.1 * k;
    const leaveB = 9.6 * k;
    const leaveEach = 0.45 * k;
    const index = new Map();
    cubes.forEach((cb, i) => {
      const f = N > 1 ? i / (N - 1) : 0;
      cb.t0 = buildA + f * Math.max(0, Math.min(buildB, leaveA - 0.3 * k) - buildA - each);
      cb.t1 = cb.t0 + each; // assentado
      // desmonta de cima para baixo (ordem inversa)
      cb.l0 = leaveA + (1 - f) * (leaveB - leaveA - leaveEach);
      cb.l1 = cb.l0 + leaveEach;
      index.set(`${cb.x},${cb.y},${cb.z}`, cb);
    });
    // vizinho em +x, +y, +z (o que pode esconder cada face visível)
    for (const cb of cubes) cb.nb = DIRS.map(([dx, dy, dz]) => index.get(`${cb.x + dx},${cb.y + dy},${cb.z + dz}`) || null);

    const pal = [p.neutral, p.accent, p.dark, null, null].map((hx) => (hx ? hexToRgb(hx) : null));
    const A = pal[1];
    pal[3] = A.map((v) => Math.min(255, v + (255 - v) * 0.45));
    pal[4] = pal[0].map((v) => v * 0.82);
    // cores por material × face (x, y, z) × variação de tom (3 níveis)
    const faceK = [0.6, 0.82, 1];
    const colors = pal.map((c) => [0.95, 1, 1.05].map((tn) => faceK.map((fk) => shadeCss(c, Math.min(1.08, fk * tn)))));

    // fundo + vinheta num buffer
    const bgc = document.createElement('canvas');
    bgc.width = Math.max(1, Math.round(w * px));
    bgc.height = Math.max(1, Math.round(h * px));
    const g = bgc.getContext('2d');
    g.scale(px, px);
    g.fillStyle = p.bg;
    g.fillRect(0, 0, w, h);
    const m = Math.min(w, h);
    const glow = g.createRadialGradient(w / 2, h * 0.45, 0, w / 2, h * 0.45, m * 0.8);
    glow.addColorStop(0, `rgba(${A[0]},${A[1]},${A[2]},0.07)`);
    glow.addColorStop(1, `rgba(${A[0]},${A[1]},${A[2]},0)`);
    g.fillStyle = glow;
    g.fillRect(0, 0, w, h);
    const v = g.createRadialGradient(w / 2, h / 2, m * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.6);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.42)');
    g.fillStyle = v;
    g.fillRect(0, 0, w, h);

    return { cubes, colors, bgc, az, foot: [x0, x1, y0, y1], shadow };
  },

  render(ctx, t, { w, h, p, px, progress: u, state }) {
    const { cubes, colors, bgc, foot } = state;
    ctx.drawImage(bgc, 0, 0, w, h);
    const m = Math.min(w, h);

    const az = ((state.az + 9 * Math.sin(TAU * u)) * Math.PI) / 180;
    const el = (31 * Math.PI) / 180;
    const ce = Math.cos(el);
    const d = [ce * Math.cos(az), ce * Math.sin(az), Math.sin(el)];
    const R = [-Math.sin(az), Math.cos(az), 0];
    const U = [-Math.sin(el) * Math.cos(az), -Math.sin(el) * Math.sin(az), ce];
    // enquadramento: caixa da projeção (em unidades de cubo) dos cubos no lugar, nesta câmera
    let bx0 = Infinity, bx1 = -Infinity, by0 = Infinity, by1 = -Infinity;
    for (const cb of cubes) {
      const sx = cb.x * R[0] + cb.y * R[1];
      const sy = -(cb.x * U[0] + cb.y * U[1] + cb.z * U[2]);
      if (sx < bx0) bx0 = sx;
      if (sx > bx1) bx1 = sx;
      if (sy < by0) by0 = sy;
      if (sy > by1) by1 = sy;
    }
    const bw = bx1 - bx0 + 1.6;
    const bh = by1 - by0 + 1.6;
    const S = Math.min((w * 0.7) / bw, (h * 0.66) / bh) * p.size;
    const ox = w / 2 - ((bx0 + bx1) / 2) * S;
    const oy = h / 2 - ((by0 + by1) / 2) * S + h * 0.02;
    const P = (x, y, z) => {
      const X = x;
      const Y = y;
      const Z = z;
      return [ox + (X * R[0] + Y * R[1]) * S, oy - (X * U[0] + Y * U[1] + Z * U[2]) * S];
    };

    // estado de cada cubo em t: altura extra, alpha, assentado?
    const H = p.drop;
    const live = [];
    for (const cb of cubes) {
      cb.on = false;
      if (t < cb.t0 || t >= cb.l1) continue;
      let dz = 0;
      let a = 1;
      const s = seg(t, cb.t0, cb.t1);
      if (s < 1) {
        // queda acelerada até 72%, depois um quique pequeno
        if (s < 0.72) {
          const q = s / 0.72;
          dz = H * (1 - q * q);
        } else {
          const q = (s - 0.72) / 0.28;
          dz = 0.16 * Math.sin(Math.PI * q) * (1 - q * 0.3);
        }
        a = ease.outCubic(clamp(s / 0.3));
      }
      const l = seg(t, cb.l0, cb.l1);
      if (l > 0) {
        dz += H * 0.6 * ease.inCubic(l);
        a *= 1 - ease.inCubic(l);
      }
      cb.on = s >= 1 && l === 0;
      cb.dz = dz;
      cb.a = a;
      cb.depth = (cb.x * d[0] + cb.y * d[1] + (cb.z + dz) * d[2]);
      live.push(cb);
    }

    // chão: grade sutil + sombra sob o objeto
    const [x0, x1, y0, y1] = foot;
    const pad = 2;
    const gA = clamp(seg(t, 0, 0.5 * (state.cubes[0].t1 || 1)) * (1 - seg(u, 0.93, 1)));
    if (p.grid && gA > 0) {
      ctx.strokeStyle = `rgba(255,255,255,${0.06 * gA})`;
      ctx.lineWidth = Math.max(0.6, m * 0.0009);
      ctx.beginPath();
      for (let x = x0 - pad; x <= x1 + 1 + pad; x++) {
        const a = P(x - 0.5, y0 - 0.5 - pad, -0.5);
        const b = P(x - 0.5, y1 + 0.5 + pad, -0.5);
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
      }
      for (let y = y0 - pad; y <= y1 + 1 + pad; y++) {
        const a = P(x0 - 0.5 - pad, y - 0.5, -0.5);
        const b = P(x1 + 0.5 + pad, y - 0.5, -0.5);
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
      }
      ctx.stroke();
    }
    // sombra macia: elipse sob a pegada do objeto (só alpha)
    if (live.length) {
      const k = Math.min(1, (live.length / cubes.length) * 1.5);
      const c0 = P((x0 + x1) / 2, (y0 + y1) / 2, -0.5);
      const ex = P(x1 + 0.5, (y0 + y1) / 2, -0.5);
      const ey = P((x0 + x1) / 2, y1 + 0.5, -0.5);
      const rr = Math.max(Math.hypot(ex[0] - c0[0], ex[1] - c0[1]), Math.hypot(ey[0] - c0[0], ey[1] - c0[1])) * state.shadow;
      ctx.save();
      ctx.translate(c0[0], c0[1]);
      ctx.scale(1, 0.38);
      const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, rr);
      gr.addColorStop(0, `rgba(0,0,0,${0.5 * k})`);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr;
      ctx.fillRect(-rr, -rr, rr * 2, rr * 2);
      ctx.restore();
    }

    live.sort((a, b) => a.depth - b.depth);
    // cantos do cubo (meia aresta) pré-projetados como deslocamentos
    const off = (dx, dy, dz) => [(dx * R[0] + dy * R[1]) * S, -(dx * U[0] + dy * U[1] + dz * U[2]) * S];
    const C = {};
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) C[`${sx}${sy}${sz}`] = off(sx * 0.5, sy * 0.5, sz * 0.5);
    const faces = [
      ['1-1-1', '11-1', '111', '1-11'], // +x
      ['-11-1', '11-1', '111', '-111'], // +y
      ['-1-11', '1-11', '111', '-111'], // +z
    ];
    const seam = 1.4 / px;
    ctx.lineJoin = 'round';
    ctx.lineWidth = seam;
    for (const cb of live) {
      const c = P(cb.x, cb.y, cb.z + cb.dz);
      const tn = cb.j < 0.33 ? 0 : cb.j < 0.66 ? 1 : 2;
      const cols = colors[cb.c][tn];
      ctx.globalAlpha = cb.a;
      for (let f = 0; f < 3; f++) {
        const nb = cb.nb[f];
        if (cb.on && nb && nb.on) continue; // face colada num vizinho assentado
        const q = faces[f];
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
          const o = C[q[i]];
          if (i) ctx.lineTo(c[0] + o[0], c[1] + o[1]);
          else ctx.moveTo(c[0] + o[0], c[1] + o[1]);
        }
        ctx.closePath();
        ctx.fillStyle = cols[f];
        ctx.fill();
        if (cb.a > 0.98) {
          ctx.strokeStyle = cols[f];
          ctx.stroke();
        }
      }
      // aresta clara no topo (leitura de voxel)
      if (!(cb.on && cb.nb[2] && cb.nb[2].on)) {
        const a = C['-1-11'];
        const b = C['1-11'];
        const f2 = C['-111'];
        ctx.strokeStyle = 'rgba(255,255,255,0.22)';
        ctx.beginPath();
        ctx.moveTo(c[0] + f2[0], c[1] + f2[1]);
        ctx.lineTo(c[0] + a[0], c[1] + a[1]);
        ctx.lineTo(c[0] + b[0], c[1] + b[1]);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  },
};
