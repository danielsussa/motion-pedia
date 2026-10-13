import { TAU, seg, ease, clamp, hexToRgb } from '../lib/anim.js';

const FONTS = {
  sans: (s) => `900 ${s}px Inter, system-ui, sans-serif`,
  serif: (s) => `400 ${s}px 'Instrument Serif', serif`,
  'serif itálico': (s) => `italic 400 ${s}px 'Instrument Serif', serif`,
};

// Mistura RGB já convertida (evita reparsear hex a cada camada).
const mixRgb = (A, B, k) =>
  `rgb(${Math.round(A[0] + (B[0] - A[0]) * k)},${Math.round(A[1] + (B[1] - A[1]) * k)},${Math.round(A[2] + (B[2] - A[2]) * k)})`;

export default {
  id: 'extrude-3d',
  title: 'Extrude 3D',
  description: '3D extruded text swinging in space, with gradient-shaded sides and a glint running across the face.',
  category: 'tipografia',
  tags: ['typography', '3d', 'loop'],
  duration: 6,
  poster: 1.1,

  params: {
    text: { type: 'text', label: 'Text', default: 'VOLUME' },
    font: { type: 'select', label: 'Font', options: ['sans', 'serif', 'serif itálico'], default: 'sans' },
    depth: { type: 'range', label: 'Depth', min: 0.05, max: 0.8, step: 0.01, default: 0.32 },
    swing: { type: 'range', label: 'Spin', min: 0, max: 1, step: 0.01, default: 0.55 },
    shine: { type: 'boolean', label: 'Face shine', default: true },
    front: { type: 'color', label: 'Face', default: '#f4f1ea' },
    side: { type: 'color', label: 'Side', default: '#ff5a36' },
    bg: { type: 'color', label: 'Background', default: '#0e0e12' },
    transparent: { type: 'boolean', label: 'Transparent background', default: false },
  },

  setup({ w, h, p, px }) {
    // Fundo estático (gradiente de tela cheia) pintado uma vez.
    let bg = null;
    if (!p.transparent) {
      bg = document.createElement('canvas');
      bg.width = Math.max(1, Math.round(w * px));
      bg.height = Math.max(1, Math.round(h * px));
      const g = bg.getContext('2d');
      g.scale(px, px);
      g.fillStyle = p.bg;
      g.fillRect(0, 0, w, h);
      const r = ctxRadial(g, w / 2, h * 0.46, Math.max(w, h) * 0.62);
      g.fillStyle = r;
      g.fillRect(0, 0, w, h);
    }
    // Sombra de contato: sprite pequeno de gradiente radial (mesma cor, só alpha).
    const sh = document.createElement('canvas');
    sh.width = sh.height = 128;
    const s = sh.getContext('2d');
    const rg = s.createRadialGradient(64, 64, 0, 64, 64, 64);
    rg.addColorStop(0, 'rgba(0,0,0,0.55)');
    rg.addColorStop(0.5, 'rgba(0,0,0,0.25)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    s.fillStyle = rg;
    s.fillRect(0, 0, 128, 128);
    return { bg, shadow: sh, front: hexToRgb(p.front), side: hexToRgb(p.side), back: hexToRgb(p.bg) };
  },

  render(ctx, t, { w, h, p, px, progress, state }) {
    const m = Math.min(w, h);
    if (state.bg) ctx.drawImage(state.bg, 0, 0, w, h);

    const text = p.text || '';
    if (!text.trim()) return;
    const fontFn = FONTS[p.font] ?? FONTS.sans;
    let fs = m * 0.34;
    ctx.font = fontFn(fs);
    const tw0 = ctx.measureText(text).width;
    const maxW = w * (h > w ? 0.84 : 0.72);
    if (tw0 > maxW) fs *= maxW / tw0;
    ctx.font = fontFn(fs);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const mt = ctx.measureText(text);
    const tw = mt.width;
    // Centro óptico vertical pelas caixas reais dos glifos.
    const yOff = (mt.actualBoundingBoxAscent - mt.actualBoundingBoxDescent) / 2;

    // Rotação em loop: frequências inteiras de progress; entrada com mola nos primeiros instantes do ciclo
    // não é usada (tem que emendar), então o movimento é um balanço contínuo em forma de oito.
    const P = TAU * progress;
    const ry = p.swing * (0.9 * Math.sin(P));
    const rx = p.swing * (0.2 * Math.sin(2 * P + 0.6) + 0.06);
    const rz = p.swing * 0.035 * Math.sin(P + 1.2);
    const cyy = Math.cos(ry), syy = Math.sin(ry), cxx = Math.cos(rx), sxx = Math.sin(rx);
    // Colunas da matriz de rotação (R = Rx·Ry): eixos X, Y e Z do texto na câmera.
    const X = [cyy, syy * sxx, -syy * cxx];
    const Y = [0, cxx, sxx];
    const Z = [syy, -cyy * sxx, cyy * cxx];
    const cr = Math.cos(rz), sr = Math.sin(rz);
    const rot2 = (v) => [v[0] * cr - v[1] * sr, v[0] * sr + v[1] * cr];
    const Xs = rot2(X), Ys = rot2(Y), Zs = rot2(Z);

    const cx = w / 2;
    const cy = h / 2 + fs * 0.02 * Math.sin(2 * P);
    const F = m * 1.9; // distância focal (perspectiva aproximada por camada)
    const D = fs * p.depth * (p.font === 'sans' ? 1 : 0.6);

    // Sombra no chão, acompanhando o balanço.
    const shY = cy + fs * 0.62 + D * 0.15;
    const shW = tw * (1.05 + 0.1 * Math.abs(Math.sin(ry)));
    ctx.globalAlpha = p.transparent ? 0.6 : 0.85;
    ctx.drawImage(state.shadow, cx - shW / 2 + Zs[0] * D * 0.3, shY - fs * 0.09, shW, fs * 0.18);
    ctx.globalAlpha = 1;

    // Posição de cada letra pela largura do prefixo (respeita o kerning); cada letra recebe a própria
    // perspectiva (escala pela profundidade do seu centro), o que dá a fuga que um affine único não dá.
    const chars = [...text];
    const xs = [];
    for (let i = 0; i < chars.length; i++) {
      const a = ctx.measureText(chars.slice(0, i).join('')).width;
      const b = ctx.measureText(chars[i]).width;
      xs.push(-tw / 2 + a + b / 2);
    }
    const B = ctx.getTransform();
    ctx.save();
    const proj = (x, z) => {
      const qx = X[0] * x + Z[0] * z;
      const qy = X[1] * x + Z[1] * z;
      const s = F / (F + X[2] * x + Z[2] * z);
      return [cx + (qx * cr - qy * sr) * s, cy + (qx * sr + qy * cr) * s, s];
    };
    // Eixo X da letra pela derivada da projeção: a letra encolhe do lado que se afasta (sem frestas nem
    // sobreposição entre vizinhas).
    const e = fs * 0.25;
    const place = (x, z) => {
      const a = proj(x - e, z);
      const b = proj(x + e, z);
      const c = proj(x, z);
      ctx.setTransform(B);
      ctx.translate(c[0], c[1]);
      ctx.transform((b[0] - a[0]) / (2 * e), (b[1] - a[1]) / (2 * e), Ys[0] * c[2], Ys[1] * c[2], 0, 0);
    };
    const pass = (z) => {
      for (let i = 0; i < chars.length; i++) {
        if (chars[i] === ' ') continue;
        place(xs[i], z);
        ctx.fillText(chars[i], 0, yOff);
      }
    };

    // Lateral: camadas de trás para frente. Luz vem da esquerda-alto: a lateral clareia quando gira para a luz.
    const N = clamp(Math.ceil(D * px * 0.42), 6, 64);
    const lit = 0.5 + 0.5 * Math.sin(ry + 0.4);
    const sideHi = [0, 1, 2].map((i) => state.side[i] + (255 - state.side[i]) * 0.18 * lit);
    const sideLo = [0, 1, 2].map((i) => state.side[i] * 0.28 + state.back[i] * 0.25);
    for (let i = N; i >= 1; i--) {
      const k = i / N;
      ctx.fillStyle = mixRgb(sideHi, sideLo, Math.pow(k, 0.8) * (0.85 - 0.25 * lit) + 0.08);
      pass(D * k);
    }
    // Aresta da face (bisel claro logo atrás da frente).
    ctx.fillStyle = mixRgb(state.side, [255, 255, 255], 0.45);
    pass(Math.min(D * 0.04, fs * 0.012));

    // Face frontal: degradê vertical sutil + sombreamento pela inclinação.
    const face = Math.abs(Z[2]);
    const g = ctx.createLinearGradient(0, yOff - fs * 0.75, 0, yOff);
    const top = state.front;
    const bot = top.map((v, i) => v * (0.82 + 0.12 * face) + state.side[i] * 0.06);
    g.addColorStop(0, mixRgb(top, top, 0));
    g.addColorStop(1, mixRgb(bot, bot, 0));
    ctx.fillStyle = g;
    pass(0);

    // Brilho: faixa diagonal que atravessa a face uma vez por ciclo.
    if (p.shine) {
      const k = ease.inOutSine(seg(progress, 0.08, 0.5));
      if (k > 0 && k < 1) {
        const bx = -tw * 0.75 + tw * 1.5 * k;
        const bw = fs * 0.55;
        const a = 0.75 * Math.sin(Math.PI * k);
        for (let i = 0; i < chars.length; i++) {
          const dx = bx - xs[i];
          if (chars[i] === ' ' || Math.abs(dx) > bw * 2 + fs) continue;
          place(xs[i], 0);
          const sg = ctx.createLinearGradient(dx - bw, -fs * 0.3, dx + bw, fs * 0.3);
          sg.addColorStop(0, 'rgba(255,255,255,0)');
          sg.addColorStop(0.5, `rgba(255,255,255,${a})`);
          sg.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = sg;
          ctx.fillText(chars[i], 0, yOff);
        }
      }
    }
    ctx.restore();
  },
};

function ctxRadial(g, x, y, r) {
  const rg = g.createRadialGradient(x, y, 0, x, y, r);
  rg.addColorStop(0, 'rgba(255,255,255,0.06)');
  rg.addColorStop(1, 'rgba(255,255,255,0)');
  return rg;
}
