import { TAU, clamp, hexToRgb, rgba, rng } from '../lib/anim.js';
import { rotate, project } from '../lib/space.js';

// Cubo mágico 3×3 girando camadas enquanto a câmera orbita. A sequência de giros é sorteada no setup;
// a segunda metade do loop desfaz a primeira (giros inversos em ordem reversa), então o cubo volta
// resolvido e o loop emenda. Cada cubinho é um cubo com seis faces: corpo escuro e adesivo colorido
// só nas faces que eram externas na posição de origem. Sombreamento por normal (luz fixa na vista),
// ordenação dos cubinhos por distância à câmera e descarte de faces de costas.

const PALETTES = {
  clássica: ['#f4f1ea', '#ffc93c', '#e8483f', '#ff8a3d', '#2f6fec', '#21b36b'],
  pastel: ['#fbf7f0', '#f6dd8a', '#f19a8e', '#f7bf8f', '#94b4f2', '#9fd8b4'],
};
// direções das faces: +x, -x, +y, -y, +z, -z (y para baixo na tela)
const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
// cor de cada direção na posição resolvida: índice na paleta
// -y (topo) branco, +y amarelo, -z (frente) vermelho, +z laranja, +x azul, -x verde
const DIR_COLOR = [4, 5, 1, 0, 3, 2];

const inOutBack = (x, c = 1.1) => {
  const c2 = c * 1.525;
  return x < 0.5
    ? ((2 * x) ** 2 * ((c2 + 1) * 2 * x - c2)) / 2
    : ((2 * x - 2) ** 2 * ((c2 + 1) * (x * 2 - 2) + c2) + 2) / 2;
};

// rotação em torno de um eixo (0=x,1=y,2=z) por ângulo a
function rotAxis(v, axis, a) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const [x, y, z] = v;
  if (axis === 0) return [x, y * c - z * s, y * s + z * c];
  if (axis === 1) return [x * c + z * s, y, -x * s + z * c];
  return [x * c - y * s, x * s + y * c, z];
}
const roundV = (v) => v.map((c) => Math.round(c));

function shade(rgb, k) {
  return `rgb(${Math.min(255, Math.round(rgb[0] * k))},${Math.min(255, Math.round(rgb[1] * k))},${Math.min(255, Math.round(rgb[2] * k))})`;
}

export default {
  id: 'rubik',
  title: 'Rubik',
  description: 'Cubo mágico 3×3 girando as camadas enquanto a câmera orbita; embaralha e se desfaz de volta, em loop.',
  category: 'formas',
  tags: ['3d', 'forma', 'loop'],
  duration: 12,
  poster: 5.4,

  params: {
    palette: { type: 'select', label: 'Paleta', options: ['clássica', 'pastel', 'mono'], default: 'clássica' },
    accent: { type: 'color', label: 'Destaque (mono)', default: '#ff5a36' },
    body: { type: 'color', label: 'Corpo', default: '#141519' },
    bg: { type: 'color', label: 'Fundo', default: '#e8e6e1' },
    moves: { type: 'range', label: 'Giros', min: 2, max: 10, step: 1, default: 6 },
    size: { type: 'range', label: 'Tamanho', min: 0.5, max: 1.5, step: 0.01, default: 1 },
    gap: { type: 'range', label: 'Vão', min: 0, max: 0.2, step: 0.01, default: 0.06 },
    orbit: { type: 'range', label: 'Voltas da câmera', min: 0, max: 2, step: 1, default: 1 },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 7 },
  },

  setup({ p }) {
    const r = rng(p.seed);
    const seq = [];
    let lastAxis = -1;
    for (let i = 0; i < p.moves; i++) {
      let axis;
      do axis = Math.floor(r() * 3);
      while (axis === lastAxis);
      lastAxis = axis;
      const layer = [-1, 1, -1, 1, 0][Math.floor(r() * 5)];
      seq.push({ axis, layer, dir: r() < 0.5 ? 1 : -1, turns: r() < 0.2 ? 2 : 1 });
    }
    // volta: inversos em ordem reversa
    const all = [...seq, ...seq.slice().reverse().map((m) => ({ ...m, dir: -m.dir }))];
    let cols;
    if (p.palette === 'mono') {
      const a = hexToRgb(p.accent);
      const mix = (k) => a.map((c) => Math.round(c + (255 - c) * k));
      const toHex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
      cols = ['#f2efe8', '#5a5d66', toHex(a), toHex(mix(0.45)), '#c9c6bf', toHex(a.map((c) => Math.round(c * 0.6)))];
    } else cols = PALETTES[p.palette] ?? PALETTES.clássica;
    return { all, n: seq.length, cols: cols.map(hexToRgb), body: hexToRgb(p.body) };
  },

  render(ctx, t, { w, h, p, duration, progress: u, state }) {
    const { all, n, cols, body } = state;
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, w, h);
    const m = Math.min(w, h);
    const cx = w / 2;
    const cy = h / 2 - m * 0.02;

    // halo
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, m * 0.62);
    g.addColorStop(0, rgba('#ffffff', 0.07));
    g.addColorStop(1, rgba('#ffffff', 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // linha do tempo: [n giros][pausa][n giros de volta][pausa]; a pausa vale 1,5 slot
    const slots = 2 * n + 3;
    const slot = 1 / slots;
    const tl = clamp(u, 0, 1);
    let done = 0;
    let cur = null;
    let curK = 0;
    for (let i = 0; i < all.length; i++) {
      const start = (i < n ? i : i + 1.5) * slot;
      const len = slot * 0.9;
      if (tl >= start + len) done = i + 1;
      else if (tl > start) {
        cur = all[i];
        curK = inOutBack(clamp((tl - start) / len));
        break;
      } else break;
    }

    // estado dos cubinhos: posição atual (inteira) e base local (3 vetores)
    const cubies = [];
    for (let x = -1; x <= 1; x++)
      for (let y = -1; y <= 1; y++)
        for (let z = -1; z <= 1; z++) cubies.push({ o: [x, y, z], pos: [x, y, z], ax: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] });
    for (let i = 0; i < done; i++) {
      const mv = all[i];
      const a = (mv.dir * mv.turns * Math.PI) / 2;
      for (const c of cubies)
        if (c.pos[mv.axis] === mv.layer) {
          c.pos = roundV(rotAxis(c.pos, mv.axis, a));
          c.ax = c.ax.map((v) => roundV(rotAxis(v, mv.axis, a)));
        }
    }
    const curA = cur ? (cur.dir * cur.turns * Math.PI * curK) / 2 : 0;

    // câmera
    const turns = p.orbit;
    const view = { ry: -TAU * turns * u + 0.62, rx: 0.52 + 0.1 * Math.sin(TAU * u) };
    const toView = (v) => rotate(rotate(v, { ry: view.ry }), { rx: view.rx });
    const U = (m / 7.2) * p.size;
    const dist = 14;
    const cam = { cx, cy, fov: dist * U * 1.0, dist };
    const P = (v) => project(v, cam);

    // contato no chão (sombra)
    const floorY = cy + U * 2.75;
    const sh = ctx.createRadialGradient(cx, floorY, 0, cx, floorY, U * 3.2);
    sh.addColorStop(0, rgba('#000000', 0.32));
    sh.addColorStop(1, rgba('#000000', 0));
    ctx.save();
    ctx.translate(cx, floorY);
    ctx.scale(1, 0.18);
    ctx.translate(-cx, -floorY);
    ctx.fillStyle = sh;
    ctx.fillRect(cx - U * 3.3, floorY - U * 3.3, U * 6.6, U * 6.6);
    ctx.restore();

    const L = (() => {
      const l = [-0.45, -0.75, -0.5];
      const k = Math.hypot(...l);
      return l.map((c) => c / k);
    })();
    const spacing = 1 + p.gap;
    const half = 0.5;
    const camPos = [0, 0, -dist];

    const items = [];
    const slabAxis = cur ? cur.axis : 1;
    for (const c of cubies) {
      let pos = c.pos;
      let ax = c.ax;
      if (cur && pos[cur.axis] === cur.layer) {
        pos = rotAxis(pos, cur.axis, curA);
        ax = ax.map((v) => rotAxis(v, cur.axis, curA));
      }
      const center = toView(pos.map((v) => v * spacing));
      const axV = ax.map(toView);
      const d = Math.hypot(center[0] - camPos[0], center[1] - camPos[1], center[2] - camPos[2]);
      items.push({ c, center, axV, d, slab: c.pos[slabAxis] });
    }
    // Fatias perpendiculares ao eixo do giro são separadas por planos: pinta a fatia mais distante
    // da câmera primeiro e, dentro dela, por distância. Só a distância falha com a camada girando.
    const camW = rotate(rotate(camPos, { rx: -view.rx }), { ry: -view.ry });
    const slabDir = camW[slabAxis] > 0 ? 1 : -1;
    items.sort((a, b) => (a.slab - b.slab) * slabDir || b.d - a.d);

    ctx.lineJoin = 'round';
    for (const it of items) {
      const { c, center, axV } = it;
      for (let f = 0; f < 6; f++) {
        const dir = DIRS[f];
        const ai = dir[0] ? 0 : dir[1] ? 1 : 2;
        const sgn = dir[ai];
        const nrm = axV[ai].map((v) => v * sgn);
        const fc = [center[0] + nrm[0] * half, center[1] + nrm[1] * half, center[2] + nrm[2] * half];
        // descarte: face de costas para a câmera
        if (nrm[0] * (fc[0] - camPos[0]) + nrm[1] * (fc[1] - camPos[1]) + nrm[2] * (fc[2] - camPos[2]) >= 0) continue;
        const ua = axV[(ai + 1) % 3];
        const va = axV[(ai + 2) % 3];
        const corner = (s, k, sc) => P([
          fc[0] + (ua[0] * s + va[0] * k) * sc,
          fc[1] + (ua[1] * s + va[1] * k) * sc,
          fc[2] + (ua[2] * s + va[2] * k) * sc,
        ]);
        const lit = Math.max(0, nrm[0] * L[0] + nrm[1] * L[1] + nrm[2] * L[2]);
        const k = 0.6 + 0.5 * lit;
        // corpo
        const q = [corner(-1, -1, half), corner(1, -1, half), corner(1, 1, half), corner(-1, 1, half)];
        ctx.fillStyle = shade(body, 0.85 + 1.1 * lit);
        ctx.beginPath();
        ctx.moveTo(q[0].x, q[0].y);
        for (let j = 1; j < 4; j++) ctx.lineTo(q[j].x, q[j].y);
        ctx.closePath();
        ctx.fill();
        // adesivo, só nas faces externas da origem
        if (c.o[ai] !== sgn) continue;
        const col = cols[DIR_COLOR[f]];
        const s = half * 0.74;
        const r = [corner(-1, -1, s), corner(1, -1, s), corner(1, 1, s), corner(-1, 1, s)];
        const sp = 90 * lit ** 8; // brilho especular discreto
        ctx.fillStyle = `rgb(${Math.min(255, Math.round(col[0] * k + sp))},${Math.min(255, Math.round(col[1] * k + sp))},${Math.min(255, Math.round(col[2] * k + sp))})`;
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = 0.12 * r[0].s;
        ctx.beginPath();
        ctx.moveTo(r[0].x, r[0].y);
        for (let j = 1; j < 4; j++) ctx.lineTo(r[j].x, r[j].y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }
  },
};
