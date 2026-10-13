import { seg, ease, hexToRgb } from '../lib/anim.js';

// Para onde a face A sai. Matriz (a, b, c, d) que leva o referencial (giro em torno do eixo vertical,
// A saindo para a esquerda) para a tela; a translação depende de w/h.
const DIRS = {
  esquerda: [1, 0, 0, 1],
  direita: [-1, 0, 0, 1],
  cima: [0, 1, 1, 0],
  baixo: [0, -1, 1, 0],
};

// Giro de 0 a 1 (face A → C → B): cada metade suaviza a ponta externa e cruza o meio ainda em movimento.
function turn(t, mid, duration) {
  if (t < mid) {
    const u = seg(t, 0, mid);
    return 0.5 * (0.6 * ease.inOutCubic(u) + 0.4 * ease.inCubic(u));
  }
  const u = seg(t, mid, duration);
  return 0.5 + 0.5 * (0.6 * ease.inOutCubic(u) + 0.4 * ease.outCubic(u));
}

// Letra da prévia num canvas próprio, já com a transformação inversa (aparece em pé depois do giro).
function letterTex(ch, color, S, inv, m) {
  const c = document.createElement('canvas');
  c.width = c.height = Math.max(2, Math.ceil(S));
  const g = c.getContext('2d');
  g.translate(c.width / 2, c.height / 2);
  g.transform(...inv, 0, 0);
  g.scale(S / m, S / m);
  g.font = `800 ${m * 0.32}px Inter, system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = color;
  g.fillText(ch, 0, m * 0.02);
  return c;
}

export default {
  id: 'cube-turn',
  title: 'Cube Turn',
  description: 'The screen turns like the face of a 3D cube: the scene exits over the edge, a solid face covers the cut and the next one rolls in from the other side.',
  category: 'transicoes',
  tags: ['transition', '3d', 'shape', 'alpha'],
  duration: 1.4,
  poster: 0.42,

  params: {
    direction: { type: 'select', label: 'Face A exits to', options: Object.keys(DIRS), default: 'esquerda' },
    face: { type: 'color', label: 'Middle face', default: '#ff4d2e' },
    backdrop: { type: 'color', label: 'Background', default: '#0e0e11' },
    depth: { type: 'range', label: 'Perspective', min: 0, max: 1, step: 0.01, default: 0.55 },
    shade: { type: 'range', label: 'Shading', min: 0, max: 1, step: 0.01, default: 0.7 },
    edge: { type: 'range', label: 'Edge shine', min: 0, max: 1, step: 0.01, default: 0.5 },
    colorA: { type: 'color', label: 'Preview A', default: '#1a1c22' },
    colorB: { type: 'color', label: 'Preview B', default: '#e7e2d8' },
    transparent: { type: 'boolean', label: 'Shapes only (alpha)', default: false },
  },

  setup({ w, h, p, px }) {
    if (p.transparent) return {};
    const [a, b, c, d] = DIRS[p.direction] ?? DIRS.esquerda;
    const det = a * d - b * c;
    const inv = [d / det, -b / det, -c / det, a / det];
    const m = Math.min(w, h);
    const S = m * 0.5; // lado do quadrado da letra (lógico)
    return {
      S,
      texA: letterTex('A', 'rgba(255,255,255,0.14)', S * px, inv, m),
      texB: letterTex('B', 'rgba(0,0,0,0.14)', S * px, inv, m),
    };
  },

  render(ctx, t, env) {
    const { w, h, p, duration, state } = env;
    const mid = duration / 2;
    const m = Math.min(w, h);
    const [ma, mb, mc, md] = DIRS[p.direction] ?? DIRS.esquerda;
    const vert = ma === 0;
    const W = vert ? h : w;
    const H = vert ? w : h;
    const a = W / 2; // meia aresta (o cubo tem profundidade W)
    const f = W * (3.2 - 2.3 * p.depth); // distância focal: face da frente em repouso preenche a tela
    const Zc = f + a;
    const theta = turn(t, mid, duration) * Math.PI; // 0 → π
    const face = hexToRgb(p.face);

    ctx.save();
    ctx.transform(ma, mb, mc, md, ma < 0 ? w : 0, mb < 0 ? h : 0);

    // Faces: 0 = A, 1 = face do meio, 2 = B. α = ângulo da face em relação à câmera.
    const faces = [];
    for (let k = 0; k < 3; k++) {
      const al = theta - (k * Math.PI) / 2;
      const cx = -a * Math.sin(al);
      const cz = Zc - a * Math.cos(al);
      // normal (−sin α, −cos α) apontando para a câmera?
      if (-Math.sin(al) * cx - Math.cos(al) * cz >= -1e-6) continue;
      const tx = Math.cos(al);
      const tz = -Math.sin(al);
      const L = [cx - a * tx, cz - a * tz];
      const R = [cx + a * tx, cz + a * tz];
      faces.push({ k, al, L, R });
    }
    const proj = ([x, z]) => [W / 2 + (f * x) / z, f / z];
    const poly = (F) => {
      const [xl, sl] = proj(F.L);
      const [xr, sr] = proj(F.R);
      return [[xl, H / 2 - (H / 2) * sl], [xr, H / 2 - (H / 2) * sr], [xr, H / 2 + (H / 2) * sr], [xl, H / 2 + (H / 2) * sl]];
    };
    const path = (P) => {
      P.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
    };
    for (const F of faces) F.P = poly(F);
    const A_B = faces.filter((F) => F.k !== 1);

    // Fundo atrás do cubo; no modo alpha, com furos onde as cenas A/B aparecem.
    ctx.fillStyle = p.backdrop;
    ctx.beginPath();
    // retângulo exato da tela: com a face A de frente o furo coincide com ele e nada sobra
    ctx.rect(0, 0, W, H);
    if (p.transparent) for (const F of A_B) path(F.P);
    ctx.fill('evenodd');

    for (const F of faces) {
      const { k, al, P } = F;
      if (k === 1) {
        // face sólida: leve degradê vertical (luz de cima)
        const [r, g, b] = face;
        const gr = ctx.createLinearGradient(0, Math.min(P[0][1], P[1][1]), 0, Math.max(P[2][1], P[3][1]));
        gr.addColorStop(0, `rgb(${Math.min(255, r * 1.06 + 6)},${Math.min(255, g * 1.06 + 6)},${Math.min(255, b * 1.06 + 6)})`);
        gr.addColorStop(1, `rgb(${Math.round(r * 0.9)},${Math.round(g * 0.9)},${Math.round(b * 0.9)})`);
        ctx.fillStyle = gr;
        ctx.beginPath();
        path(P);
        ctx.fill();
      } else if (!p.transparent) {
        ctx.fillStyle = k === 0 ? p.colorA : p.colorB;
        ctx.beginPath();
        path(P);
        ctx.fill();
        // letra em fatias verticais (cada fatia escala pela própria profundidade)
        const tex = k === 0 ? state.texA : state.texB;
        if (tex) {
          const S = state.S;
          const u0 = 0.5 - S / (2 * W);
          const N = 28;
          for (let j = 0; j < N; j++) {
            const ua = u0 + ((S / W) * j) / N;
            const ub = u0 + ((S / W) * (j + 1)) / N;
            const um = (ua + ub) / 2;
            const pt = (u) => [F.L[0] + (F.R[0] - F.L[0]) * u, F.L[1] + (F.R[1] - F.L[1]) * u];
            const [xa] = proj(pt(ua));
            const [xb, sm] = proj(pt(ub));
            const s = proj(pt(um))[1] || sm;
            const dw = xb - xa;
            if (Math.abs(dw) < 0.05) continue;
            const sx = (tex.width * j) / N;
            ctx.drawImage(tex, sx, 0, tex.width / N, tex.height, xa, H / 2 - (S / 2) * s, dw, S * s);
          }
        }
      }
      // Sombreado: escurece ao virar de lado, mais na borda que se afasta.
      if (p.shade > 0) {
        const away = 1 - Math.cos(al);
        const dl = (F.L[1] - f) / (a * 2);
        const dr = (F.R[1] - f) / (a * 2);
        const base = 0.55 * away;
        const al0 = Math.min(0.95, p.shade * (base + 0.35 * Math.max(0, dl) * away * 2));
        const al1 = Math.min(0.95, p.shade * (base + 0.35 * Math.max(0, dr) * away * 2));
        if (al0 > 0.003 || al1 > 0.003) {
          const gr = ctx.createLinearGradient(P[0][0], 0, P[1][0], 0);
          gr.addColorStop(0, `rgba(0,0,0,${al0})`);
          gr.addColorStop(1, `rgba(0,0,0,${al1})`);
          ctx.fillStyle = gr;
          ctx.beginPath();
          path(P);
          ctx.fill();
        }
      }
    }

    // Quina entre duas faces visíveis: fio de luz vertical.
    if (p.edge > 0 && faces.length > 1) {
      const F = faces[0];
      const [x, s] = proj(F.R);
      const vis = Math.min(1, Math.sin(Math.abs(theta % (Math.PI / 2)) * 2) * 3);
      if (vis > 0.01) {
        const lw = Math.max(1, m * 0.003);
        const g = ctx.createLinearGradient(0, H / 2 - (H / 2) * s, 0, H / 2 + (H / 2) * s);
        g.addColorStop(0, `rgba(255,255,255,${0.5 * p.edge * vis})`);
        g.addColorStop(1, `rgba(255,255,255,${0.12 * p.edge * vis})`);
        ctx.fillStyle = g;
        ctx.fillRect(x - lw / 2, H / 2 - (H / 2) * s, lw, H * s);
      }
    }
    ctx.restore();
  },
};
