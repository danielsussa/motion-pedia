import { TAU, clamp, lerp, seg, ease, spring, rgba, hexToRgb } from '../lib/anim.js';
import { UF, BR_W, BR_H, decodeRing } from './_brasil-uf.js';

// Mapa coroplético do Brasil por estado. O contorno vem de _brasil-uf.js (27 UFs simplificadas).
// Os estados acendem em stagger (por região ou por valor) numa escala de 1 cor de destaque, os maiores
// ganham rótulo no mapa e um ranking top 5 entra ao lado (embaixo nos formatos verticais).

const REGION_ORDER = ['N', 'NE', 'CO', 'SE', 'S'];

// Censo 2022 (IBGE), milhões de habitantes, arredondado.
const DEFAULT = `SP: 44,4
MG: 20,5
RJ: 16,1
BA: 14,1
PR: 11,4
RS: 10,9
PE: 9,1
CE: 8,8
PA: 8,1
SC: 7,6
GO: 7,1
MA: 6,8
PB: 4,0
AM: 3,9
ES: 3,8
MT: 3,7
RN: 3,3
PI: 3,3
AL: 3,1
DF: 2,8
MS: 2,8
SE: 2,2
RO: 1,6
TO: 1,5
AC: 0,8
AP: 0,7
RR: 0,6`;

// "SP: 46,6" (também "SP 46,6", "SP = 46.6", separados por linha, ";" ou ","+espaço).
function parse(text) {
  const vals = {};
  let dec = 0;
  const re = /\b([A-Za-z]{2})\b\s*[:=|\-–]?\s*(-?\d[\d.,]*)/g;
  let m;
  while ((m = re.exec(String(text || '')))) {
    const uf = m[1].toUpperCase();
    if (!UF[uf]) continue;
    let s = m[2].replace(/[.,]$/, '');
    let d = 0;
    if (s.includes(',')) {
      d = s.length - s.lastIndexOf(',') - 1;
      s = s.replace(/\./g, '').replace(',', '.');
    } else if (/\.\d{1,2}$/.test(s)) d = s.length - s.lastIndexOf('.') - 1;
    else s = s.replace(/\./g, '');
    const v = Number(s);
    if (!Number.isFinite(v)) continue;
    vals[uf] = v;
    dec = Math.max(dec, d);
  }
  return { vals, dec: Math.min(dec, 2) };
}

// ---------- geometria (cache de módulo) ----------
let GEO = null;
function geo() {
  if (GEO) return GEO;
  GEO = {};
  for (const [uf, d] of Object.entries(UF)) {
    const rings = d.rings.map(decodeRing);
    const path = new Path2D();
    let best = null, bestA = -1;
    for (const r of rings) {
      path.moveTo(r[0], r[1]);
      for (let i = 2; i < r.length; i += 2) path.lineTo(r[i], r[i + 1]);
      path.closePath();
      let a = 0;
      for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) a += (r[j] + r[i]) * (r[j + 1] - r[i + 1]);
      if (Math.abs(a) > bestA) (bestA = Math.abs(a)), (best = r);
    }
    GEO[uf] = { path, label: labelPoint(best), area: bestA / 2, ...d };
  }
  return GEO;
}

// Ponto mais "interno" do anel (busca em grade + refinamento): onde o rótulo cabe melhor.
function labelPoint(r) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < r.length; i += 2) {
    x0 = Math.min(x0, r[i]); x1 = Math.max(x1, r[i]);
    y0 = Math.min(y0, r[i + 1]); y1 = Math.max(y1, r[i + 1]);
  }
  const inside = (x, y) => {
    let c = false;
    for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
      const yi = r[i + 1], yj = r[j + 1];
      if (yi > y !== yj > y && x < ((r[j] - r[i]) * (y - yi)) / (yj - yi) + r[i]) c = !c;
    }
    return c;
  };
  const dist = (x, y) => {
    let md = Infinity;
    for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
      const ax = r[j], ay = r[j + 1], dx = r[i] - ax, dy = r[i + 1] - ay;
      const L = dx * dx + dy * dy || 1;
      const k = clamp(((x - ax) * dx + (y - ay) * dy) / L);
      md = Math.min(md, Math.hypot(x - ax - k * dx, y - ay - k * dy));
    }
    return md;
  };
  let bx = (x0 + x1) / 2, by = (y0 + y1) / 2, bd = -1;
  let cell = Math.max(x1 - x0, y1 - y0) / 20;
  const scan = (cx0, cy0, cx1, cy1, step) => {
    for (let y = cy0; y <= cy1; y += step)
      for (let x = cx0; x <= cx1; x += step) {
        if (!inside(x, y)) continue;
        // leve preferência pelo centro da caixa (rótulos menos tortos)
        const d = dist(x, y) - 0.04 * Math.hypot(x - (x0 + x1) / 2, y - (y0 + y1) / 2);
        if (d > bd) (bd = d), (bx = x), (by = y);
      }
  };
  scan(x0, y0, x1, y1, cell);
  for (let k = 0; k < 2; k++) {
    const c = cell;
    cell /= 5;
    scan(bx - c, by - c, bx + c, by + c, cell);
  }
  return [bx, by];
}

const fmtCache = new Map();
const fmt = (v, dec) => {
  if (!fmtCache.has(dec)) fmtCache.set(dec, new Intl.NumberFormat('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec }));
  return fmtCache.get(dec).format(v);
};

const mix = (A, B, k) => `rgb(${Math.round(lerp(A[0], B[0], k))},${Math.round(lerp(A[1], B[1], k))},${Math.round(lerp(A[2], B[2], k))})`;
const mixA = (A, B, k) => A.map((v, i) => lerp(v, B[i], k));
const INTER = (wt, s) => `${wt} ${s}px Inter, system-ui, sans-serif`;
const MONO = (wt, s) => `${wt} ${s}px "JetBrains Mono", ui-monospace, monospace`;

function fitText(ctx, text, maxW, size, font) {
  ctx.font = font(size);
  const tw = ctx.measureText(text).width;
  if (tw > maxW) {
    size *= maxW / tw;
    ctx.font = font(size);
  }
  return size;
}

export default {
  id: 'mapa-brasil',
  title: 'Brazil Map',
  description: 'Brazil by state: states light up on a color scale, the largest get labels and a top-5 ranking slides in alongside.',
  category: 'dados',
  tags: ['data', 'ui', 'broadcast'],
  duration: 8,
  poster: 5.6,

  params: {
    title: { type: 'text', label: 'Title', default: 'Population by state' },
    subtitle: { type: 'text', label: 'Subtitle', default: '2022 Census · millions of people' },
    data: { type: 'textarea', label: 'Data by state ("SP: 44,4")', rows: 8, default: DEFAULT },
    scale: { type: 'select', label: 'Color scale', options: ['linear', 'raiz', 'log'], default: 'raiz' },
    order: { type: 'select', label: 'Entry order', options: ['região', 'valor'], default: 'região' },
    labels: { type: 'range', label: 'Map labels', min: 0, max: 10, step: 1, default: 5 },
    accent: { type: 'color', label: 'Accent', default: '#ffb020' },
    ink: { type: 'color', label: 'Text', default: '#eef0f3' },
    bg: { type: 'color', label: 'Background', default: '#0c1016' },
  },

  setup({ w, h, p, px }) {
    const G = geo();
    const { vals, dec } = parse(p.data);
    const list = Object.keys(vals);
    const vmin = Math.min(...list.map((k) => vals[k]));
    const vmax = Math.max(...list.map((k) => vals[k]));
    const f = p.scale === 'log' ? (v) => Math.log(Math.max(v, 1e-6)) : p.scale === 'raiz' ? (v) => Math.sqrt(Math.max(v, 0)) : (v) => v;
    const norm = (v) => (list.length < 2 || f(vmax) === f(vmin) ? 1 : clamp((f(v) - f(vmin)) / (f(vmax) - f(vmin))));
    const ranked = list.slice().sort((a, b) => vals[b] - vals[a]);

    // ordem de entrada
    const ufs = Object.keys(G);
    let order;
    if (p.order === 'valor') order = [...ranked, ...ufs.filter((u) => !(u in vals))];
    else
      order = ufs.slice().sort((a, b) => {
        const ra = REGION_ORDER.indexOf(G[a].region), rb = REGION_ORDER.indexOf(G[b].region);
        return ra - rb || G[a].label[0] - G[b].label[0];
      });
    // DF por cima de GO: desenha por último
    const drawOrder = ufs.filter((u) => u !== 'DF').concat('DF');

    const startAt = {};
    const n = order.length;
    order.forEach((u, i) => (startAt[u] = 0.6 + (i / Math.max(n - 1, 1)) * 2.1));

    // ---------- layout ----------
    const ar = w / h;
    const m = Math.min(w, h);
    // largo: painel lateral com título; quadrado: título em cima, mapa + ranking lado a lado;
    // vertical: título, mapa e ranking empilhados
    const mode = ar > 1.4 ? 'wide' : ar >= 0.95 ? 'square' : 'tall';
    const L = { mode, side: mode === 'wide' };
    if (mode === 'wide') {
      const pad = m * 0.07;
      const panelW = w * 0.34;
      L.panel = { x: w - pad - panelW, y: pad, w: panelW, h: h - pad * 2 };
      L.map = { x: pad * 0.6, y: pad * 0.7, w: w - panelW - pad * 2.4, h: h - pad * 1.4 };
      L.ts = Math.min(m * 0.056, panelW * 0.11);
    } else if (mode === 'square') {
      const pad = m * 0.07;
      L.ts = m * 0.058;
      const headH = L.ts * 2.9;
      L.head = { x: pad, y: pad * 0.9, w: w - pad * 2, h: headH };
      const y0 = L.head.y + headH + m * 0.02;
      const inner = w - pad * 2;
      L.map = { x: pad * 0.4, y: y0, w: inner * 0.56, h: h - y0 - pad * 0.5 };
      L.panel = { x: pad + inner * 0.58, y: y0, w: inner * 0.42, h: h - y0 - pad };
    } else {
      const pad = w * 0.075;
      L.ts = m * 0.068;
      const headH = L.ts * 3.15;
      const rankH = h * (ar < 0.7 ? 0.3 : 0.29);
      L.head = { x: pad, y: pad * (ar < 0.7 ? 1.6 : 0.8), w: w - pad * 2, h: headH };
      L.panel = { x: pad, y: h - pad * (ar < 0.7 ? 1.3 : 0.6) - rankH, w: w - pad * 2, h: rankH };
      const my0 = L.head.y + headH;
      L.map = { x: pad * 0.5, y: my0, w: w - pad, h: L.panel.y - my0 - m * 0.03 };
    }
    const s = Math.min(L.map.w / BR_W, L.map.h / BR_H);
    L.scale = s;
    L.mx = L.map.x + (L.map.w - BR_W * s) / 2;
    L.my = L.map.y + (L.map.h - BR_H * s) / 2;

    // ---------- fundo pré-renderizado ----------
    const cw = Math.max(1, Math.round(w * px)), ch = Math.max(1, Math.round(h * px));
    const bgc = document.createElement('canvas');
    bgc.width = cw;
    bgc.height = ch;
    const b = bgc.getContext('2d');
    b.scale(px, px);
    b.fillStyle = p.bg;
    b.fillRect(0, 0, w, h);
    const cx = L.mx + BR_W * s * 0.55, cy = L.my + BR_H * s * 0.45;
    const gr = b.createRadialGradient(cx, cy, 0, cx, cy, BR_W * s * 0.75);
    gr.addColorStop(0, rgba(p.accent, 0.07));
    gr.addColorStop(1, rgba(p.accent, 0));
    b.fillStyle = gr;
    b.fillRect(0, 0, w, h);
    const vg = b.createRadialGradient(w / 2, h / 2, m * 0.3, w / 2, h / 2, Math.max(w, h) * 0.8);
    vg.addColorStop(0, rgba('#000000', 0));
    vg.addColorStop(1, rgba('#000000', 0.3));
    b.fillStyle = vg;
    b.fillRect(0, 0, w, h);

    const BG = hexToRgb(p.bg), INK = hexToRgb(p.ink), ACC = hexToRgb(p.accent);
    const NEUT = mixA(BG, INK, 0.075);
    const LOW = mixA(NEUT, ACC, 0.1);
    const target = {};
    for (const u of ufs) target[u] = u in vals ? mixA(LOW, ACC, 0.08 + 0.92 * norm(vals[u])) : NEUT;

    return { G, vals, dec, ranked, startAt, drawOrder, L, bgc, NEUT, ACC, LOW, target, vmin, vmax, norm };
  },

  render(ctx, t, { w, h, p, duration, state, px }) {
    const { G, vals, dec, ranked, startAt, drawOrder, L, NEUT, ACC, LOW, target, vmin, vmax } = state;
    ctx.drawImage(state.bgc, 0, 0, w, h);
    const m = Math.min(w, h);
    const s = L.scale;
    const OUT = duration - 0.75;
    const out = ease.inCubic(seg(t, OUT, duration - 0.08));
    ctx.save();
    ctx.globalAlpha = 1 - out;

    // ---------- mapa ----------
    const mIn = ease.outExpo(seg(t, 0.05, 1.3));
    const ms = 0.94 + 0.06 * mIn;
    const mcx = L.mx + (BR_W * s) / 2, mcy = L.my + (BR_H * s) / 2;
    ctx.save();
    ctx.globalAlpha *= clamp(seg(t, 0.05, 0.7));
    ctx.translate(mcx, mcy + (1 - mIn) * m * 0.03);
    ctx.scale(ms * s, ms * s);
    ctx.translate(-BR_W / 2, -BR_H / 2);
    const lw = Math.max(0.6, m * 0.0016) / (s * ms);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = p.bg;
    ctx.lineWidth = lw;
    const lifted = [];
    for (const u of drawOrder) {
      const g = G[u];
      const a = startAt[u];
      const k = ease.outCubic(seg(t, a, a + 0.8));
      const bump = Math.sin(Math.PI * clamp(seg(t, a, a + 0.7)));
      ctx.fillStyle = mix(NEUT, target[u], k);
      ctx.fill(g.path);
      ctx.stroke(g.path);
      if (bump > 0.01 && u in vals) lifted.push([u, bump]);
    }
    // estados acendendo: sobem um pouco com um brilho do destaque
    for (const [u, bump] of lifted) {
      const g = G[u];
      const [lx, ly] = g.label;
      const k = ease.outCubic(seg(t, startAt[u], startAt[u] + 0.8));
      ctx.save();
      ctx.translate(lx, ly);
      ctx.scale(1 + 0.05 * bump, 1 + 0.05 * bump);
      ctx.translate(-lx, -ly - bump * 4);
      ctx.fillStyle = mix(mixA(NEUT, target[u], k), ACC, 0.45 * bump);
      ctx.fill(g.path);
      ctx.strokeStyle = rgba(p.ink, 0.6 * bump);
      ctx.lineWidth = lw * 1.4;
      ctx.stroke(g.path);
      ctx.restore();
    }
    ctx.restore();

    // rótulos dos maiores
    const nLab = Math.min(Math.round(p.labels), ranked.length);
    const ls = m * 0.021;
    // posições fixas (independem de t): o rótulo que colidir com um anterior desce/sobe e ganha um fio
    const placed = [];
    const labs = [];
    for (let i = 0; i < nLab; i++) {
      const u = ranked[i];
      const [gx, gy] = G[u].label;
      const x = mcx + (gx - BR_W / 2) * s * ms;
      const y0 = mcy + (gy - BR_H / 2) * s * ms + (1 - mIn) * m * 0.03;
      const vt = fmt(vals[u], dec);
      ctx.font = INTER(800, ls);
      const w1 = ctx.measureText(u).width;
      ctx.font = INTER(500, ls * 0.82);
      const w2 = ctx.measureText(vt).width;
      const pw = w1 + w2 + ls * 1.25, ph = ls * 1.65;
      let y = y0;
      for (const dy of [0, 1.15, -1.15, 2.3, -2.3, 3.45]) {
        const yy = y0 + dy * ph;
        if (!placed.some((b) => Math.abs(b.x - x) < (b.w + pw) / 2 + ls * 0.2 && Math.abs(b.y - yy) < (b.h + ph) / 2 + ls * 0.1)) {
          y = yy;
          break;
        }
      }
      placed.push({ x, y, w: pw, h: ph });
      labs.push({ u, x, y, y0, vt, w1, pw, ph, i });
    }
    for (const { u, x, y, y0, vt, w1, pw, ph, i } of labs) {
      const a = Math.max(startAt[u] + 0.45, 3.0 + i * 0.12);
      const k = spring(seg(t, a, a + 0.8), 0.2);
      if (k <= 0.001) continue;
      if (Math.abs(y - y0) > 1) {
        ctx.strokeStyle = rgba(p.bg, 0.86);
        ctx.lineWidth = Math.max(1, ls * 0.12);
        ctx.beginPath();
        ctx.moveTo(x, y0);
        ctx.lineTo(x, y0 + (y - y0) * Math.min(k, 1));
        ctx.stroke();
        ctx.fillStyle = p.bg;
        ctx.beginPath();
        ctx.arc(x, y0, ls * 0.22 * Math.min(k, 1), 0, TAU);
        ctx.fill();
      }
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(k, k);
      ctx.fillStyle = rgba(p.bg, 0.86);
      ctx.beginPath();
      ctx.roundRect(-pw / 2, -ph / 2, pw, ph, ph / 2);
      ctx.fill();
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillStyle = p.ink;
      ctx.font = INTER(800, ls);
      ctx.fillText(u, -pw / 2 + ls * 0.5, ls * 0.04);
      ctx.fillStyle = p.accent;
      ctx.font = INTER(500, ls * 0.82);
      ctx.fillText(vt, -pw / 2 + ls * 0.75 + w1, ls * 0.04);
      ctx.restore();
    }

    // ---------- painel ----------
    const P = L.panel;
    const head = L.side ? { x: P.x, y: P.y, w: P.w } : L.head;
    const ts = L.ts;
    const tIn = ease.outExpo(seg(t, 0.15, 1.2));
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    let y = head.y + ts;
    if (p.title) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(head.x - m * 0.02, y - ts * 1.1, head.w + m * 0.04, ts * 1.45);
      ctx.clip();
      const fs = fitText(ctx, p.title, head.w, ts, (z) => INTER(800, z));
      ctx.letterSpacing = `${-fs * 0.025}px`;
      ctx.fillStyle = p.ink;
      ctx.fillText(p.title, head.x, y + (1 - tIn) * fs * 1.3);
      ctx.letterSpacing = '0px';
      ctx.restore();
    }
    const ss = ts * 0.4;
    if (p.subtitle) {
      y += ss * 2.1;
      ctx.globalAlpha = (1 - out) * clamp(seg(t, 0.45, 1.1));
      fitText(ctx, p.subtitle, head.w, ss, (z) => INTER(500, z));
      ctx.fillStyle = rgba(p.ink, 0.55);
      ctx.fillText(p.subtitle, head.x, y);
      ctx.globalAlpha = 1 - out;
    }
    // legenda: rampa de cor
    if (ranked.length) {
      const lgY = y + ss * 1.6;
      const lgW = Math.min(head.w, L.side ? head.w : m * 0.5);
      const lgH = Math.max(3, m * 0.009);
      const k = ease.outExpo(seg(t, 0.6, 1.8));
      const gr = ctx.createLinearGradient(head.x, 0, head.x + lgW, 0);
      for (let i = 0; i <= 6; i++) gr.addColorStop(i / 6, mix(LOW, ACC, 0.08 + 0.92 * (i / 6)));
      ctx.fillStyle = gr;
      if (k > 0.002) {
        ctx.beginPath();
        ctx.roundRect(head.x, lgY, Math.max(lgH, lgW * k), lgH, lgH / 2);
        ctx.fill();
      }
      ctx.globalAlpha = (1 - out) * clamp(seg(t, 1.0, 1.6));
      ctx.font = MONO(500, ss * 0.8);
      ctx.fillStyle = rgba(p.ink, 0.5);
      ctx.textBaseline = 'top';
      ctx.fillText(fmt(vmin, dec), head.x, lgY + lgH + ss * 0.6);
      ctx.textAlign = 'right';
      ctx.fillText(fmt(vmax, dec), head.x + lgW, lgY + lgH + ss * 0.6);
      ctx.textAlign = 'left';
      ctx.globalAlpha = 1 - out;
      if (L.side) y = lgY + lgH + ss * 3.4;
    }

    // ranking top 5
    const top = ranked.slice(0, 5);
    if (top.length) {
      const r0 = L.side ? y : P.y;
      const avail = L.side ? P.y + P.h - r0 : P.h;
      const rh = Math.min(avail / 5, m * (L.mode === 'tall' ? 0.12 : L.mode === 'square' ? 0.11 : 0.1));
      const ns0 = rh * (L.mode === 'tall' ? 0.33 : L.mode === 'square' ? 0.27 : 0.3);
      // mesmo corpo para todos os nomes: o que couber no mais largo
      let ns = ns0;
      ctx.font = INTER(700, ns0);
      const vwMax = Math.max(...top.map((u) => ctx.measureText(fmt(vals[u], dec)).width));
      ctx.font = INTER(600, ns0);
      for (const u of top) {
        const room = P.w - ns0 * 2.1 - vwMax - ns0 * 1.0;
        ns = Math.min(ns, (ns0 * room) / Math.max(1, ctx.measureText(G[u].name).width));
      }
      const startR = L.mode === 'tall' ? r0 : r0 + (avail - rh * top.length) * (L.side ? 0.15 : 0.4);
      // título do ranking
      for (let i = 0; i < top.length; i++) {
        const u = top[i];
        const a = 2.7 + i * 0.14;
        const k = ease.outExpo(seg(t, a, a + 1.1));
        const op = clamp(seg(t, a, a + 0.35));
        if (op <= 0) continue;
        const ry = startR + i * rh + (1 - k) * rh * 0.5;
        ctx.globalAlpha = (1 - out) * op;
        // linha separadora
        ctx.fillStyle = rgba(p.ink, 0.09);
        ctx.fillRect(P.x, ry + rh - 1, P.w * k, Math.max(1, m * 0.001));
        const midY = ry + rh * 0.42;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.font = MONO(600, ns0 * 0.8);
        ctx.fillStyle = i === 0 ? p.accent : rgba(p.ink, 0.42);
        ctx.fillText(String(i + 1).padStart(2, '0'), P.x, midY);
        const nx = P.x + ns0 * 2.1;
        // valor contando
        const cnt = ease.outExpo(seg(t, a + 0.1, a + 1.6));
        const vt = fmt(vals[u] * cnt, dec);
        ctx.font = INTER(700, ns0);
        ctx.textAlign = 'right';
        ctx.fillStyle = p.ink;
        ctx.fillText(vt, P.x + P.w, midY);
        ctx.textAlign = 'left';
        ctx.font = INTER(600, ns);
        ctx.fillStyle = rgba(p.ink, 0.92);
        ctx.fillText(G[u].name, nx, midY);
        // barra
        const bw = (P.x + P.w - nx) * (vals[u] / (vmax || 1)) * ease.outExpo(seg(t, a + 0.2, a + 1.5));
        const bh = Math.max(2, rh * 0.07);
        ctx.fillStyle = rgba(p.ink, 0.07);
        ctx.fillRect(nx, ry + rh * 0.74, P.x + P.w - nx, bh);
        ctx.fillStyle = mix(LOW, ACC, 0.08 + 0.92 * state.norm(vals[u]));
        ctx.fillRect(nx, ry + rh * 0.74, bw, bh);
      }
      ctx.globalAlpha = 1 - out;
    }

    // pulso no 1º colocado
    if (ranked.length) {
      const u = ranked[0];
      const pt = t - 3.6;
      if (pt > 0) {
        const ph = (pt % 1.6) / 1.6;
        const [gx, gy] = G[u].label;
        const x = mcx + (gx - BR_W / 2) * s * ms;
        const yy = mcy + (gy - BR_H / 2) * s * ms;
        ctx.strokeStyle = rgba(p.accent, 0.5 * (1 - ph));
        ctx.lineWidth = Math.max(1, m * 0.002);
        ctx.beginPath();
        ctx.arc(x, yy, m * (0.03 + 0.05 * ease.outCubic(ph)), 0, TAU);
        ctx.stroke();
      }
    }
    ctx.restore();
  },
};
