import { TAU, clamp, lerp, seg, ease, hexToRgb } from '../lib/anim.js';

// Triângulo de Penrose de verdade, em 3D: três barras de cubos ao longo de +x, +y e +z. A soma dos três
// lados é (n−1)·(1,1,1) — exatamente a direção de visão isométrica —, então de um único ponto de vista
// (azimute 45°, elevação 35,26°) a ponta da terceira barra cai em cima do começo da primeira e o caminho
// aberto parece um triângulo fechado. A câmera orbita: mostra o truque e volta a travar no ponto de ilusão.
//
// Pintura: cubos unitários por profundidade (pintor), só faces externas viradas para a câmera. Perto do ponto
// de ilusão a metade final da terceira barra é ordenada pela posição "virtual" (deslocada de −(n−1)·(1,1,1)),
// o que a põe atrás do começo da primeira barra — a troca só acontece quando as duas pontas não se sobrepõem
// na tela, por isso não se vê o salto.

const MAGIC_AZ = Math.PI / 4;
const MAGIC_EL = Math.asin(1 / Math.sqrt(3));

const css = (c) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
const mixc = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

// cantos de cada face (cubo de lado 1 centrado na origem), por eixo e sinal
const FACES = [];
for (let axis = 0; axis < 3; axis++) {
  for (const s of [1, -1]) {
    const u = (axis + 1) % 3;
    const v = (axis + 2) % 3;
    const corners = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ].map(([a, b]) => {
      const c = [0, 0, 0];
      c[axis] = s * 0.5;
      c[u] = a * 0.5;
      c[v] = b * 0.5;
      return c;
    });
    const nrm = [0, 0, 0];
    nrm[axis] = s;
    FACES.push({ axis, s, corners, nrm });
  }
}

export default {
  id: 'impossible-shapes',
  title: 'Impossible Shapes',
  description: 'Triângulo de Penrose em 3D: a câmera gira, revela que as barras não se fecham e trava de novo no ponto de ilusão.',
  category: 'formas',
  tags: ['3d', 'forma', 'loop'],
  duration: 10,
  poster: 0.6,

  params: {
    length: { type: 'range', label: 'Comprimento', min: 4, max: 10, step: 1, default: 6 },
    light: { type: 'color', label: 'Face clara', default: '#f1ede6' },
    accent: { type: 'color', label: 'Destaque', default: '#ff6a3d' },
    bg: { type: 'color', label: 'Fundo', default: '#101116' },
    swing: { type: 'range', label: 'Giro', min: 0.15, max: 1, step: 0.05, default: 1 },
    hold: { type: 'range', label: 'Pausa na ilusão', min: 0.1, max: 0.6, step: 0.01, default: 0.32 },
    size: { type: 'range', label: 'Tamanho', min: 0.4, max: 1.4, step: 0.01, default: 1 },
    roll: { type: 'range', label: 'Rotação', min: -180, max: 180, step: 1, default: -30 },
    outline: { type: 'boolean', label: 'Contorno', default: true },
  },

  setup({ w, h, p, px }) {
    const n = p.length;
    const cubes = [];
    for (let i = 0; i < n; i++) cubes.push({ pos: [i, 0, 0], beam: 0 });
    for (let j = 1; j < n; j++) cubes.push({ pos: [n - 1, j, 0], beam: 1 });
    for (let k = 1; k < n - 1; k++) cubes.push({ pos: [n - 1, n - 1, k], beam: 2, virt: k > (n - 1) / 2 });
    const occ = new Set(cubes.map((c) => c.pos.join(',')));
    for (const c of cubes) {
      c.faces = FACES.filter((f) => {
        const q = c.pos.slice();
        q[f.axis] += f.s;
        return !occ.has(q.join(','));
      });
    }
    // centro: o do triângulo "fechado" (média dos três cantos virtuais)
    const ctr = [(2 * (n - 1)) / 3, (n - 1) / 3, 0];
    const real = [0, 1, 2].map((a) => cubes.reduce((acc, c) => acc + c.pos[a], 0) / cubes.length);
    // vizinhança "impossível": a terceira barra deslocada de −(n−1)·(1,1,1) encosta no começo da primeira
    const occI = new Set(occ);
    for (const c of cubes) if (c.beam === 2) occI.add(c.pos.map((v) => v - (n - 1)).join(','));

    // fundo + vinheta num buffer
    const bgc = document.createElement('canvas');
    bgc.width = Math.max(1, Math.round(w * px));
    bgc.height = Math.max(1, Math.round(h * px));
    const g = bgc.getContext('2d');
    g.scale(px, px);
    g.fillStyle = p.bg;
    g.fillRect(0, 0, w, h);
    const m = Math.min(w, h);
    const [ar, ag, ab] = hexToRgb(p.accent);
    const glow = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, m * 0.75);
    glow.addColorStop(0, `rgba(${ar},${ag},${ab},0.07)`);
    glow.addColorStop(1, `rgba(${ar},${ag},${ab},0)`);
    g.fillStyle = glow;
    g.fillRect(0, 0, w, h);
    const v = g.createRadialGradient(w / 2, h / 2, m * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.6);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.4)');
    g.fillStyle = v;
    g.fillRect(0, 0, w, h);

    const L = hexToRgb(p.light);
    const A = hexToRgb(p.accent);
    const B = hexToRgb(p.bg);
    // tom por eixo da face: z (topo/base) claro, x destaque, y destaque escurecido
    const tone = [css(A), css(mixc(A, B, 0.55)), css(L)];
    const edge = css(mixc(B, [0, 0, 0], 0.4));
    return { n, cubes, ctr, real, bgc, tone, edge, occ, occI };
  },

  render(ctx, t, { w, h, p, px, progress: u, state }) {
    const { n, cubes, ctr, real, bgc, tone, edge } = state;
    ctx.drawImage(bgc, 0, 0, w, h);
    const m = Math.min(w, h);

    // órbita: parado no ponto de ilusão, gira uma volta inteira (com sobe-e-desce) e volta a travar
    const h0 = p.hold / 2;
    const k = ease.inOutCubic(seg(u, h0, 1 - h0));
    // giro completo (swing = 1) ou vai-e-volta parcial; a elevação sobe no meio para mostrar o vão
    const bump = Math.sin(Math.PI * k);
    const azz = p.swing >= 0.999 ? MAGIC_AZ + TAU * k : MAGIC_AZ + Math.PI * p.swing * bump;
    const el = MAGIC_EL + 0.42 * Math.min(1, p.swing * 1.5) * bump * bump;

    const ce = Math.cos(el);
    const d = [ce * Math.cos(azz), ce * Math.sin(azz), Math.sin(el)];
    const r = [-Math.sin(azz), Math.cos(azz), 0];
    const up = [-Math.sin(el) * Math.cos(azz), -Math.sin(el) * Math.sin(azz), ce];

    // ângulo até a direção mágica → separação das pontas em tela (unidades de cubo)
    const dm = 1 / Math.sqrt(3);
    const cosA = clamp(d[0] * dm + d[1] * dm + d[2] * dm, -1, 1);
    const sep = (n - 1) * Math.sqrt(3) * Math.sqrt(Math.max(0, 1 - cosA * cosA));
    const illusion = cosA > 0 && sep < 2.1;
    const shift = (n - 1) * (d[0] + d[1] + d[2]);

    const S = (m * p.size * 0.5) / (n * 0.95);
    const cx = w / 2;
    const cy = h / 2;
    // pivô: centro do triângulo "fechado" na ilusão, centro real dos cubos no meio do giro
    const pv = [0, 1, 2].map((a) => lerp(ctr[a], real[a], bump));
    // rolagem de 30° para o triângulo ficar de pé (os eixos isométricos ficam a 90°/210°/330°)
    const cr = Math.cos(p.roll * Math.PI / 180);
    const sr = Math.sin(p.roll * Math.PI / 180);
    const proj = (x, y, z) => {
      const X = x - pv[0];
      const Y = y - pv[1];
      const Z = z - pv[2];
      const sx = (X * r[0] + Y * r[1] + Z * r[2]) * S;
      const sy = -(X * up[0] + Y * up[1] + Z * up[2]) * S;
      return [cx + sx * cr - sy * sr, cy + sx * sr + sy * cr];
    };

    const order = cubes.map((c) => {
      const [x, y, z] = c.pos;
      let depth = x * d[0] + y * d[1] + z * d[2];
      if (illusion && c.virt) depth -= shift;
      return { c, depth };
    });
    order.sort((a, b) => a.depth - b.depth);

    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const seam = 1.6 / px;
    const olw = Math.max(0.8, m * 0.0016);
    const { occ, occI } = state;
    const shiftN = n - 1;
    const internal = (set, nb, f) => {
      if (!set.has(nb.join(','))) return false;
      const fr = nb.slice();
      fr[f.axis] += f.s;
      return !set.has(fr.join(','));
    };
    for (const { c } of order) {
      const [x, y, z] = c.pos;
      const vis = [];
      for (const f of c.faces) {
        const dot = f.nrm[0] * d[0] + f.nrm[1] * d[1] + f.nrm[2] * d[2];
        if (dot <= 1e-4) continue;
        vis.push(f);
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
          const q = f.corners[i];
          const P = proj(x + q[0], y + q[1], z + q[2]);
          if (i) ctx.lineTo(P[0], P[1]);
          else ctx.moveTo(P[0], P[1]);
        }
        ctx.closePath();
        ctx.fillStyle = tone[f.axis];
        ctx.fill();
        // mesma cor por cima para fechar a fresta de antialias entre cubos vizinhos
        ctx.strokeStyle = tone[f.axis];
        ctx.lineWidth = seam;
        ctx.stroke();
      }
      if (!p.outline || !vis.length) continue;
      // contorno: arestas que não continuam numa face coplanar do cubo vizinho
      ctx.beginPath();
      for (const f of vis) {
        for (let i = 0; i < 4; i++) {
          const a = f.corners[i];
          const b = f.corners[(i + 1) % 4];
          const nb = [x, y, z];
          for (let q = 0; q < 3; q++) if (q !== f.axis) nb[q] += Math.round(a[q] + b[q]);
          // vizinho tem a mesma face: aresta interna (na ilusão vale também a vizinhança impossível)
          if (internal(illusion ? occI : occ, nb, f)) continue;
          if (illusion && c.beam === 2 && internal(occI, nb.map((v) => v - shiftN), f)) continue;
          const P = proj(x + a[0], y + a[1], z + a[2]);
          const Q = proj(x + b[0], y + b[1], z + b[2]);
          ctx.moveTo(P[0], P[1]);
          ctx.lineTo(Q[0], Q[1]);
        }
      }
      ctx.strokeStyle = edge;
      ctx.lineWidth = olw;
      ctx.stroke();
    }
  },
};
