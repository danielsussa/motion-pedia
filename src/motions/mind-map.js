import { TAU, clamp, seg, ease, spring, stagger, rgba } from '../lib/anim.js';

// Mapa mental que cresce do centro: o tema principal surge, os ramos desenham curvas até os
// tópicos e cada tópico solta suas folhas em sequência. Depois um pulso percorre os ramos.
// Em telas largas os ramos vão para os lados; no vertical, para cima e para baixo.

const F = (wt, s) => `${wt} ${s}px Inter, system-ui, sans-serif`;
let MC = null;
const measure = () => (MC ||= document.createElement('canvas').getContext('2d'));

// "Tópico: folha, folha, folha" por linha.
function parse(text) {
  const out = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const l = line.trim();
    if (!l || l.startsWith('#')) continue;
    const i = l.indexOf(':');
    const name = (i >= 0 ? l.slice(0, i) : l).trim() || '—';
    const kids = i >= 0 ? l.slice(i + 1).split(/[,;]/).map((s) => s.trim()).filter(Boolean).slice(0, 4) : [];
    out.push({ name, kids });
    if (out.length === 6) break;
  }
  return out;
}

// Cúbica amostrada (pontos em unidades do mapa) + comprimentos acumulados.
function curve(x0, y0, x1, y1, vertical, elbow = false) {
  let c1, c2;
  if (elbow) {
    // do pé do tópico até o ponto da folha: desce/sobe e depois vira para o lado
    c1 = [x0, y0 + (y1 - y0) * 0.75];
    c2 = [x0 + (x1 - x0) * 0.15, y1];
  } else if (vertical) {
    const d = (y1 - y0) * 0.55;
    c1 = [x0, y0 + d];
    c2 = [x1, y1 - d];
  } else {
    const d = (x1 - x0) * 0.55;
    c1 = [x0 + d, y0];
    c2 = [x1 - d, y1];
  }
  const N = 32;
  const pts = [];
  const len = [0];
  for (let i = 0; i <= N; i++) {
    const s = i / N;
    const a = (1 - s) ** 3;
    const b = 3 * (1 - s) ** 2 * s;
    const c = 3 * (1 - s) * s * s;
    const d = s ** 3;
    pts.push([a * x0 + b * c1[0] + c * c2[0] + d * x1, a * y0 + b * c1[1] + c * c2[1] + d * y1]);
    if (i) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  }
  return { pts, len, total: len[N] };
}

// Ponto da curva na fração k do comprimento.
function at(cv, k) {
  const L = clamp(k) * cv.total;
  let i = 1;
  while (i < cv.len.length - 1 && cv.len[i] < L) i++;
  const a = cv.len[i - 1];
  const f = (L - a) / Math.max(1e-6, cv.len[i] - a);
  const [x0, y0] = cv.pts[i - 1];
  const [x1, y1] = cv.pts[i];
  return [x0 + (x1 - x0) * f, y0 + (y1 - y0) * f, i];
}

function strokePart(ctx, cv, k) {
  if (k <= 0) return;
  const [ex, ey, i] = at(cv, k);
  ctx.beginPath();
  ctx.moveTo(cv.pts[0][0], cv.pts[0][1]);
  for (let j = 1; j < i; j++) ctx.lineTo(cv.pts[j][0], cv.pts[j][1]);
  ctx.lineTo(ex, ey);
  ctx.stroke();
}

const DEFAULT = `Produto: Roadmap, Protótipo, Testes
Marketing: Campanha, Redes sociais, Imprensa
Vendas: Parceiros, Preços
Pessoas: Contratação, Treinamento
Dados: Métricas, Pesquisa, Painel
Suporte: Central de ajuda, Comunidade`;

// unidades do mapa
const CF = 46; // fonte do centro
const BF = 30; // fonte dos tópicos
const LF = 25; // fonte das folhas
const LG = 46; // passo vertical das folhas

export default {
  id: 'mind-map',
  title: 'Mind Map',
  description: 'Mapa mental crescendo do centro: ramos curvos desenham até os tópicos, que soltam suas folhas em sequência.',
  category: 'dados',
  tags: ['dados', 'ui', 'forma'],
  duration: 8,
  poster: 4.6,

  params: {
    center: { type: 'text', label: 'Tema central', default: 'Lançamento 2027' },
    branches: { type: 'textarea', label: 'Tópicos (tópico: folha, folha)', rows: 6, default: DEFAULT },
    accent: { type: 'color', label: 'Destaque', default: '#ff5b2e' },
    ink: { type: 'color', label: 'Tinta', default: '#1b1c20' },
    node: { type: 'color', label: 'Cartões', default: '#ffffff' },
    bg: { type: 'color', label: 'Fundo', default: '#f1eee8' },
    grid: { type: 'boolean', label: 'Grade de pontos', default: true },
    pulse: { type: 'boolean', label: 'Pulso nos ramos', default: true },
    transparent: { type: 'boolean', label: 'Fundo transparente', default: false },
  },

  setup({ w, h, p, px }) {
    const mc = measure();
    const items = parse(p.branches);
    const n = items.length;
    const vertical = h > w * 0.92;

    mc.font = F(800, CF);
    mc.letterSpacing = '0px';
    const center = { text: p.center || ' ', w: mc.measureText(p.center || ' ').width + 68, h: 96 };
    mc.font = F(650, BF);
    for (const b of items) b.w = mc.measureText(b.name).width + 52;
    mc.font = F(500, LF);
    for (const b of items) b.kidW = b.kids.map((k) => mc.measureText(k).width);

    const nh = 64; // altura do tópico
    const curves = [];
    const nRight = Math.ceil(n / 2);
    let minX = -center.w / 2;
    let maxX = center.w / 2;
    let minY = -center.h / 2;
    let maxY = center.h / 2;
    const grow = (x0, y0, x1, y1) => {
      minX = Math.min(minX, x0);
      maxX = Math.max(maxX, x1);
      minY = Math.min(minY, y0);
      maxY = Math.max(maxY, y1);
    };

    // ordem de crescimento: lado A de cima para baixo, depois lado B
    items.forEach((b, i) => (b.side = i < nRight ? 1 : -1));
    for (const side of [1, -1]) {
      const group = items.filter((b) => b.side === side);
      if (!group.length) continue;
      if (!vertical) {
        // blocos empilhados na vertical
        const blockH = group.map((b) => Math.max(nh, b.kids.length * LG) + 34);
        const total = blockH.reduce((a, c) => a + c, 0);
        let y = -total / 2;
        group.forEach((b, gi) => {
          const by = y + blockH[gi] / 2;
          y += blockH[gi];
          const inner = side * (center.w / 2 + 150);
          b.x = inner + (side * b.w) / 2;
          b.y = by;
          b.line = curve(side * (center.w / 2 - 14), 0, inner, by, false);
          const outer = inner + side * b.w;
          b.leaves = b.kids.map((text, j) => {
            const ly = by + (j - (b.kids.length - 1) / 2) * LG;
            const dx = outer + side * 76;
            const lv = { text, x: dx, y: ly, align: side > 0 ? 'left' : 'right', line: curve(outer, by, dx, ly, false) };
            const tx = dx + side * (16 + b.kidW[j]);
            grow(Math.min(dx, tx), ly - LG / 2, Math.max(dx, tx), ly + LG / 2);
            return lv;
          });
          grow(Math.min(inner, outer), by - nh / 2, Math.max(inner, outer), by + nh / 2);
        });
      } else {
        // colunas lado a lado; folhas penduradas para fora (para cima no lado de cima)
        const cols = group.map((b) => {
          const right = Math.max(b.w / 2, 30 + Math.max(0, ...b.kidW.map((k) => k + 16)));
          return { b, left: b.w / 2, right };
        });
        const gap = 44;
        const totalW = cols.reduce((a, c) => a + c.left + c.right, 0) + gap * (cols.length - 1);
        let x = -totalW / 2;
        const dir = -side; // lado 1 = em cima
        const ny = dir * (center.h / 2 + (h > w * 1.5 ? 230 : 130));
        cols.forEach(({ b, left, right }) => {
          const cx = x + left;
          x += left + right + gap;
          b.x = cx;
          b.y = ny + (dir * nh) / 2;
          const nodeNear = ny; // borda do tópico voltada ao centro
          const nodeFar = ny + dir * nh;
          b.line = curve(0, (dir * center.h) / 2 - dir * 10, cx, nodeNear, true);
          b.leaves = b.kids.map((text, j) => {
            const ly = nodeFar + dir * (44 + j * LG);
            const dx = cx + 30;
            grow(dx, ly - LG / 2, dx + 16 + b.kidW[j], ly + LG / 2);
            return { text, x: dx, y: ly, align: 'left', line: curve(cx, nodeFar, dx, ly, true, true) };
          });
          grow(cx - b.w / 2, Math.min(nodeNear, nodeFar), cx + b.w / 2, Math.max(nodeNear, nodeFar));
        });
      }
    }

    // pinta a grade de pontos uma vez (fundo estático)
    let paper = null;
    if (!p.transparent) {
      paper = document.createElement('canvas');
      paper.width = Math.max(1, Math.round(w * px));
      paper.height = Math.max(1, Math.round(h * px));
      const g = paper.getContext('2d');
      g.scale(px, px);
      g.fillStyle = p.bg;
      g.fillRect(0, 0, w, h);
      if (p.grid) {
        const m = Math.min(w, h);
        const step = m / 26;
        const r = Math.max(0.6 / px, m * 0.0016);
        g.fillStyle = rgba(p.ink, 0.13);
        g.beginPath();
        const ox = (w / 2) % step;
        const oy = (h / 2) % step;
        for (let yy = oy; yy < h; yy += step) {
          for (let xx = ox; xx < w; xx += step) {
            g.moveTo(xx + r, yy);
            g.arc(xx, yy, r, 0, TAU);
          }
        }
        g.fill();
      }
      const vg = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.hypot(w, h) * 0.6);
      vg.addColorStop(0, rgba(p.ink, 0));
      vg.addColorStop(1, rgba(p.ink, 0.07));
      g.fillStyle = vg;
      g.fillRect(0, 0, w, h);
    }

    // tempos
    const T0 = 0.75;
    items.forEach((b, i) => {
      b.t = T0 + stagger(i, n, Math.min(1.5, 0.28 * (n - 1)));
    });

    const bw = Math.max(maxX, -minX) * 2 + 40;
    const bh = Math.max(maxY, -minY) * 2 + 40;
    const m = Math.min(w, h);
    const k = Math.min((m / 1080) * 1.08, (w * 0.92) / bw, (h * 0.86) / bh);
    return { items, center, paper, k, nh };
  },

  render(ctx, t, { w, h, p, duration, state }) {
    const { items, center, paper, k, nh } = state;
    if (!p.transparent && paper) ctx.drawImage(paper, 0, 0, w, h);

    const out = ease.inCubic(seg(t, duration - 0.9, duration - 0.15));
    const op = 1 - out;
    if (op <= 0.001) return;
    const zoom = 1.05 - 0.05 * ease.outCubic(seg(t, 0, duration * 0.8)) - 0.03 * out;

    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(k * zoom, k * zoom);
    ctx.globalAlpha = op;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.textBaseline = 'middle';

    const pulseT = 4.3;
    const pulseOn = p.pulse;

    // ---- linhas (por baixo de tudo) ----
    for (const b of items) {
      const draw = ease.inOutCubic(seg(t, b.t, b.t + 0.6));
      ctx.strokeStyle = rgba(p.ink, 0.3);
      ctx.lineWidth = 3.2;
      strokePart(ctx, b.line, draw);
      ctx.lineWidth = 2;
      ctx.strokeStyle = rgba(p.ink, 0.22);
      b.leaves.forEach((lv, j) => {
        const lt = b.t + 0.75 + j * 0.13;
        strokePart(ctx, lv.line, ease.inOutCubic(seg(t, lt, lt + 0.42)));
      });
    }

    // ---- pulso: um ponto de destaque corre do centro até as folhas ----
    if (pulseOn) {
      ctx.fillStyle = p.accent;
      items.forEach((b, i) => {
        const s0 = pulseT + i * 0.07;
        const kb = seg(t, s0, s0 + 0.45);
        if (kb > 0 && kb < 1) {
          const [x, y] = at(b.line, ease.inOutSine(kb));
          ctx.globalAlpha = op * 0.22;
          ctx.beginPath();
          ctx.arc(x, y, 13, 0, TAU);
          ctx.fill();
          ctx.globalAlpha = op;
          ctx.beginPath();
          ctx.arc(x, y, 6, 0, TAU);
          ctx.fill();
        }
        b.leaves.forEach((lv, j) => {
          const s1 = s0 + 0.5 + j * 0.05;
          const kl = seg(t, s1, s1 + 0.35);
          if (kl <= 0 || kl >= 1) return;
          const [x, y] = at(lv.line, ease.inOutSine(kl));
          ctx.globalAlpha = op;
          ctx.beginPath();
          ctx.arc(x, y, 4.5, 0, TAU);
          ctx.fill();
        });
      });
      ctx.globalAlpha = op;
    }

    // ---- folhas ----
    ctx.font = F(500, LF);
    for (const b of items) {
      b.leaves.forEach((lv, j) => {
        const lt = b.t + 0.75 + j * 0.13;
        const dot = spring(seg(t, lt + 0.3, lt + 0.8), 0.4);
        const txt = ease.outExpo(seg(t, lt + 0.32, lt + 1.0));
        if (dot <= 0.001 && txt <= 0.001) return;
        // flash quando o pulso chega
        const s1 = pulseT + items.indexOf(b) * 0.07 + 0.85 + j * 0.05;
        const hit = pulseOn ? Math.sin(Math.PI * seg(t, s1, s1 + 0.6)) : 0;
        const side = lv.align === 'left' ? 1 : -1;
        ctx.fillStyle = hit > 0 ? p.accent : p.ink;
        ctx.globalAlpha = op * (hit > 0 ? 1 : 0.55);
        ctx.beginPath();
        ctx.arc(lv.x, lv.y, Math.max(0, 6 * dot * (1 + 0.35 * hit)), 0, TAU);
        ctx.fill();
        ctx.globalAlpha = op * txt * 0.82;
        ctx.fillStyle = p.ink;
        ctx.textAlign = lv.align;
        ctx.fillText(lv.text, lv.x + side * (18 + (1 - txt) * -14), lv.y + 1);
      });
    }
    ctx.globalAlpha = op;

    // ---- tópicos ----
    for (const b of items) {
      const pop = spring(seg(t, b.t + 0.4, b.t + 1.05), 0.32);
      if (pop <= 0.001) continue;
      const s0 = pulseT + items.indexOf(b) * 0.07 + 0.42;
      const hit = pulseOn ? Math.sin(Math.PI * seg(t, s0, s0 + 0.5)) : 0;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.scale(pop, pop);
      ctx.globalAlpha = op * clamp(pop * 2);
      // sombra barata
      ctx.fillStyle = rgba(p.ink, 0.07);
      ctx.beginPath();
      ctx.roundRect(-b.w / 2, -nh / 2 + 5, b.w, nh, nh / 2);
      ctx.fill();
      ctx.fillStyle = p.node;
      ctx.beginPath();
      ctx.roundRect(-b.w / 2, -nh / 2, b.w, nh, nh / 2);
      ctx.fill();
      ctx.strokeStyle = hit > 0 ? rgba(p.accent, 0.35 + 0.65 * hit) : rgba(p.ink, 0.13);
      ctx.lineWidth = 2 + 1.5 * hit;
      ctx.stroke();
      ctx.font = F(650, BF);
      ctx.textAlign = 'center';
      ctx.fillStyle = p.ink;
      ctx.fillText(b.name, 0, 1);
      ctx.restore();
    }

    // ---- centro ----
    const cp = spring(seg(t, 0.12, 0.85), 0.3);
    if (cp > 0.001) {
      const breathe = 1 + 0.025 * Math.sin(Math.PI * seg(t, pulseT - 0.15, pulseT + 0.35));
      ctx.save();
      ctx.scale(cp * breathe, cp * breathe);
      ctx.globalAlpha = op * clamp(cp * 2);
      // halo
      const ring = seg(t, 0.3, 1.3);
      if (ring > 0 && ring < 1) {
        ctx.strokeStyle = rgba(p.accent, 0.35 * (1 - ring));
        ctx.lineWidth = 3;
        const g = 8 + 50 * ease.outCubic(ring);
        ctx.beginPath();
        ctx.roundRect(-center.w / 2 - g, -center.h / 2 - g, center.w + g * 2, center.h + g * 2, center.h / 2 + g);
        ctx.stroke();
      }
      ctx.fillStyle = rgba(p.accent, 0.18);
      ctx.beginPath();
      ctx.roundRect(-center.w / 2, -center.h / 2 + 8, center.w, center.h, center.h / 2);
      ctx.fill();
      ctx.fillStyle = p.accent;
      ctx.beginPath();
      ctx.roundRect(-center.w / 2, -center.h / 2, center.w, center.h, center.h / 2);
      ctx.fill();
      ctx.font = F(800, CF);
      ctx.letterSpacing = `${-CF * 0.02}px`;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffffff';
      const tw = ctx.measureText(center.text).width;
      ctx.fillText(center.text, -tw / 2, 2);
      ctx.letterSpacing = '0px';
      ctx.restore();
    }
    ctx.restore();
  },
};
