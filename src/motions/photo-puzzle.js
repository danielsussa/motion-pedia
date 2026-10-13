import { seg, ease, clamp, lerp, rng, spring } from '../lib/anim.js';
import { asset } from '../lib/assets.js';
import { coverRect } from '../lib/image.js';

// Quebra-cabeça: a foto (em cover, tela cheia) é cortada numa grade de peças com encaixes de verdade
// (cada aresta interna é uma sequência de béziers com o "nó" para um lado sorteado, com variação de
// posição e tamanho; a peça vizinha percorre a mesma aresta ao contrário). No setup cada peça vira um
// sprite em px reais (foto recortada + chanfro claro/escuro + contorno) e uma sombra borrada separada.
// No render as peças voam de fora da tela girando, em ordem diagonal com jitter, pousam com mola e a
// sombra encolhe; no fim as emendas somem (a foto inteira por cima, em fade) e a câmera dá um push-in.
const SANS = 'Inter, system-ui, sans-serif';

// nó padrão no espaço da aresta: u ao longo (0..1), v perpendicular (negativo = para fora)
const TAB = [
  [0, 0],
  [0.2, 0], [0.4, 0.04], [0.38, -0.05],
  [0.34, -0.15], [0.41, -0.24], [0.5, -0.24],
  [0.59, -0.24], [0.66, -0.15], [0.62, -0.05],
  [0.6, 0.04], [0.8, 0], [1, 0],
];

function edgePoints(ax, ay, bx, by, sign, R) {
  if (!sign) return [[ax, ay], [ax, ay], [bx, by], [bx, by]].map((q) => q); // reta (uma cúbica degenerada)
  const dx = bx - ax, dy = by - ay;
  const nx = -dy, ny = dx; // normal (comprimento = aresta)
  const shift = (R() - 0.5) * 0.08;
  const size = 0.9 + R() * 0.2;
  return TAB.map(([u, v], i) => {
    let uu = u;
    if (i > 0 && i < TAB.length - 1) uu = 0.5 + (u - 0.5) * size + shift;
    const vv = v * size * sign;
    return [ax + dx * uu + nx * vv, ay + dy * uu + ny * vv];
  });
}

function tracePath(path, pts, first) {
  if (first) path.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i + 2 < pts.length; i += 3) {
    path.bezierCurveTo(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], pts[i + 2][0], pts[i + 2][1]);
  }
}

export default {
  id: 'photo-puzzle',
  title: 'Jigsaw Puzzle',
  description: 'The photo assembles piece by piece: real jigsaw pieces fly in spinning and snap into place with shadows.',
  category: 'imagem',
  tags: ['intro', 'shape', 'transition'],
  duration: 8,
  poster: 3.2,

  params: {
    image: { type: 'image', label: 'Photo', default: '/samples/landscape.jpg' },
    pieces: { type: 'range', label: 'Pieces (approx.)', min: 6, max: 60, step: 1, default: 24 },
    spin: { type: 'range', label: 'Spin in flight', min: 0, max: 1.5, step: 0.05, default: 0.7 },
    bg: { type: 'color', label: 'Background (table)', default: '#17181b' },
    bevel: { type: 'range', label: 'Bevel', min: 0, max: 1, step: 0.05, default: 0.6 },
    seamless: { type: 'boolean', label: 'Hide seams at the end', default: true },
    focusY: { type: 'range', label: 'Vertical focus', min: 0, max: 1, step: 0.01, default: 0.45 },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 7 },
  },

  setup({ w, h, p, px }) {
    const img = asset(p.image);
    const R = rng(p.seed * 131 + 3);
    const cols = Math.max(2, Math.round(Math.sqrt((p.pieces * w) / h)));
    const rows = Math.max(2, Math.round(p.pieces / cols));
    const cw = w / cols, ch = h / rows;
    const cell = Math.min(cw, ch);

    // arestas: H[r][c] = horizontal no topo da linha r (de x=c a c+1); V[r][c] = vertical à esquerda da coluna c
    const H = [], V = [];
    for (let r = 0; r <= rows; r++) {
      H.push([]);
      for (let c = 0; c < cols; c++) {
        const border = r === 0 || r === rows;
        H[r].push(edgePoints(c * cw, r * ch, (c + 1) * cw, r * ch, border ? 0 : R() < 0.5 ? 1 : -1, R));
      }
    }
    for (let r = 0; r < rows; r++) {
      V.push([]);
      for (let c = 0; c <= cols; c++) {
        const border = c === 0 || c === cols;
        V[r].push(edgePoints(c * cw, r * ch, c * cw, (r + 1) * ch, border ? 0 : R() < 0.5 ? 1 : -1, R));
      }
    }

    const pad = cell * 0.32;
    const pieces = [];
    const sc = Math.max(px, 0.25);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const path = new Path2D();
        tracePath(path, H[r][c], true);
        tracePath(path, V[r][c + 1], false);
        tracePath(path, [...H[r + 1][c]].reverse(), false);
        tracePath(path, [...V[r][c]].reverse(), false);
        path.closePath();
        const x0 = c * cw - pad, y0 = r * ch - pad;
        const bw = cw + pad * 2, bh = ch + pad * 2;
        const W = Math.ceil(bw * sc), Hh = Math.ceil(bh * sc);

        // sprite da peça
        const sp = document.createElement('canvas');
        sp.width = W; sp.height = Hh;
        const g = sp.getContext('2d');
        g.scale(sc, sc);
        g.translate(-x0, -y0);
        g.save();
        g.clip(path);
        if (img) {
          const cr = coverRect(img, w, h, { fx: 0.5, fy: p.focusY });
          g.drawImage(img, cr.x, cr.y, cr.w, cr.h);
        } else {
          g.fillStyle = '#3a3c42';
          g.fillRect(x0, y0, bw, bh);
        }
        if (p.bevel > 0) {
          const bwid = cell * 0.011;
          g.lineWidth = bwid * 2;
          g.save();
          g.translate(bwid * 0.7, bwid * 0.7);
          g.strokeStyle = `rgba(255,255,255,${0.3 * p.bevel})`;
          g.stroke(path);
          g.restore();
          g.save();
          g.translate(-bwid * 0.7, -bwid * 0.7);
          g.strokeStyle = `rgba(0,0,0,${0.32 * p.bevel})`;
          g.stroke(path);
          g.restore();
        }
        g.restore();
        g.lineWidth = Math.max(0.6 / sc, cell * 0.004);
        g.strokeStyle = 'rgba(0,0,0,0.35)';
        g.stroke(path);

        // sombra (silhueta borrada; o raio do blur está em px reais)
        const sh = document.createElement('canvas');
        const ss = sc * 0.25; // sombra em 1/4 da resolução: borrada, não precisa de detalhe
        sh.width = Math.ceil(bw * ss); sh.height = Math.ceil(bh * ss);
        const s2 = sh.getContext('2d');
        s2.filter = `blur(${cell * 0.05 * ss}px)`;
        s2.scale(ss, ss);
        s2.translate(-x0, -y0);
        s2.fillStyle = 'rgba(0,0,0,1)';
        s2.fill(path);

        // ordem de chegada: diagonal com jitter; origem fora da tela, para o lado mais próximo
        const cx = (c + 0.5) * cw, cy = (r + 0.5) * ch;
        const order = (c / cols) * 0.55 + (r / rows) * 0.45 + (R() - 0.5) * 0.35;
        const ang = Math.atan2(cy - h / 2, cx - w / 2) + (R() - 0.5) * 1.4;
        const dist = Math.hypot(w, h) * (0.55 + R() * 0.25);
        pieces.push({
          sp, sh, x0, y0, bw, bh, cx, cy, order,
          fx: w / 2 + Math.cos(ang) * dist,
          fy: h / 2 + Math.sin(ang) * dist,
          rot: (R() - 0.5) * 2 * Math.PI * 0.55,
          wob: (R() - 0.5) * 0.12,
        });
      }
    }
    // normaliza a ordem em 0..1 e desenha na ordem de chegada (as últimas por cima)
    const os = pieces.map((q) => q.order).sort((a, b) => a - b);
    for (const q of pieces) q.order = os.indexOf(q.order) / Math.max(1, pieces.length - 1);
    pieces.sort((a, b) => a.order - b.order);

    // fundo: vinheta pré-pintada (mesma cor, só alpha)
    const bgc = document.createElement('canvas');
    bgc.width = Math.ceil(w * sc); bgc.height = Math.ceil(h * sc);
    const bg = bgc.getContext('2d');
    bg.scale(sc, sc);
    bg.fillStyle = p.bg;
    bg.fillRect(0, 0, w, h);
    const vg = bg.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.hypot(w, h) * 0.6);
    vg.addColorStop(0, 'rgba(255,255,255,0.05)');
    vg.addColorStop(1, 'rgba(255,255,255,0)');
    bg.fillStyle = vg;
    bg.fillRect(0, 0, w, h);
    // contorno fantasma das peças
    bg.lineWidth = Math.max(1 / sc, cell * 0.004);
    bg.strokeStyle = 'rgba(255,255,255,0.07)';
    for (let r = 1; r < rows; r++) for (let c = 0; c < cols; c++) { const pp = new Path2D(); tracePath(pp, H[r][c], true); bg.stroke(pp); }
    for (let r = 0; r < rows; r++) for (let c = 1; c < cols; c++) { const pp = new Path2D(); tracePath(pp, V[r][c], true); bg.stroke(pp); }

    return { pieces, cell, bgc, ready: !!img };
  },

  render(ctx, t, { w, h, p, duration, state: s }) {
    const img = asset(p.image);
    const D = duration;
    const T0 = 0.3, T1 = D * 0.55; // janela das partidas
    const fly = 1.15;
    const doneAt = T1 + fly;
    const clean = p.seamless ? ease.inOutCubic(seg(t, doneAt + 0.2, doneAt + 1.0)) : 0;
    // push-in leve ao completar
    const push = 1 + 0.035 * ease.inOutSine(seg(t, doneAt - 0.4, D));

    ctx.drawImage(s.bgc, 0, 0, w, h);
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(push, push);
    ctx.translate(-w / 2, -h / 2);

    if (clean < 1) {
      for (const q of s.pieces) {
        const st = T0 + q.order * (T1 - T0);
        const k = seg(t, st, st + fly);
        if (k <= 0) continue;
        const e = ease.outQuart(k);
        const sp = spring(k, 0.15);
        const x = lerp(q.fx, q.cx, e);
        const y = lerp(q.fy, q.cy, e);
        const rot = q.rot * p.spin * (1 - sp) + q.wob * (1 - e) * Math.sin(k * 9);
        const lift = 1 - ease.outCubic(seg(k, 0.35, 1)); // 1 no ar → 0 encaixada
        const scl = 1 + 0.07 * lift;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rot);
        ctx.scale(scl, scl);
        const ox = q.x0 - q.cx, oy = q.y0 - q.cy;
        if (lift > 0.01) {
          const off = s.cell * 0.08 * lift;
          ctx.globalAlpha = 0.55 * lift;
          ctx.drawImage(q.sh, ox + off * 0.4, oy + off, q.bw, q.bh);
          ctx.globalAlpha = 1;
        }
        ctx.drawImage(q.sp, ox, oy, q.bw, q.bh);
        ctx.restore();
      }
    }
    if (clean > 0 && img) {
      ctx.globalAlpha = clean;
      const cr = coverRect(img, w, h, { fx: 0.5, fy: p.focusY });
      ctx.drawImage(img, cr.x, cr.y, cr.w, cr.h);
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    if (!img) {
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.font = `500 ${Math.min(w, h) * 0.022}px ${SANS}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('loading photo…', w / 2, h / 2);
    }
    // fecha no preto do fundo para o loop do player
    const out = seg(t, D - 0.45, D);
    if (out > 0) {
      ctx.globalAlpha = ease.inCubic(out);
      ctx.drawImage(s.bgc, 0, 0, w, h);
      ctx.globalAlpha = 1;
    }
  },
};
