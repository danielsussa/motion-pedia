import { TAU, clamp, seg, ease, spring, rgba } from '../lib/anim.js';

// ---------- helpers locais ----------

// Número em texto livre ("1.234,5", "1234.5", "R$ 2,3") → { v, dec }. Vírgula = decimal (pt-BR).
function parseNum(raw) {
  let s = String(raw).replace(/[^\d.,-]/g, '');
  if (!/\d/.test(s)) return null;
  const neg = s.startsWith('-');
  s = s.replace(/-/g, '');
  const lc = s.lastIndexOf(',');
  const ld = s.lastIndexOf('.');
  let intPart = s;
  let frac = '';
  if (lc >= 0 && ld >= 0) {
    const d = Math.max(lc, ld);
    intPart = s.slice(0, d);
    frac = s.slice(d + 1);
  } else if (lc >= 0) {
    const parts = s.split(',');
    if (parts.length === 2) [intPart, frac] = parts;
  } else if (ld >= 0) {
    const parts = s.split('.');
    if (parts.length === 2 && parts[1].length !== 3) [intPart, frac] = parts;
  }
  intPart = intPart.replace(/[.,]/g, '') || '0';
  frac = frac.replace(/[.,]/g, '');
  const v = Number(`${intPart}.${frac || 0}`) * (neg ? -1 : 1);
  return Number.isFinite(v) ? { v, dec: frac.length } : null;
}

// Uma linha "Rótulo, valor" por ponto (também aceita ; tab | :). Linhas inválidas são ignoradas.
function parseData(text) {
  const out = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const l = line.trim();
    if (!l || l.startsWith('#')) continue;
    const m = l.match(/^(.*?)(?:,\s+|\s*[;\t|:]\s*)([^;\t|:]*\d[^;\t|:]*)$/) || l.match(/^(.*\S)\s+(\S*\d\S*)$/);
    if (!m) continue;
    const n = parseNum(m[2]);
    if (n) out.push({ label: m[1].trim(), v: n.v, dec: n.dec });
  }
  return out;
}

const fmtCache = new Map();
function fmt(v, dec, compact) {
  const k = `${dec}|${compact}`;
  if (!fmtCache.has(k)) {
    fmtCache.set(
      k,
      new Intl.NumberFormat('pt-BR', compact
        ? { notation: 'compact', maximumFractionDigits: 1 }
        : { minimumFractionDigits: dec, maximumFractionDigits: dec }),
    );
  }
  return fmtCache.get(k).format(v);
}

function niceTicks(lo, hi, count = 5) {
  if (hi === lo) {
    hi += Math.abs(hi) * 0.1 || 1;
    lo -= Math.abs(lo) * 0.1 || 1;
  }
  const raw = (hi - lo) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
  const a = Math.floor(lo / step) * step;
  const b = Math.ceil(hi / step) * step;
  const ticks = [];
  for (let v = a; v <= b + step * 0.5; v += step) ticks.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  const dec = step >= 1 ? 0 : Math.min(3, Math.ceil(-Math.log10(step) - 1e-9));
  return { lo: a, hi: b, step, ticks, dec };
}

// Tangentes monotônicas (Fritsch–Carlson): curva suave que não passa do valor dos pontos.
function monotoneTangents(xs, ys) {
  const n = xs.length;
  const d = [];
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  const m = new Array(n);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const k = 3 / Math.sqrt(s);
      m[i] = k * a * d[i];
      m[i + 1] = k * b * d[i];
    }
  }
  return m;
}

const INTER = (wt) => (s) => `${wt} ${s}px Inter, system-ui, sans-serif`;
const MONO = (s) => `500 ${s}px 'JetBrains Mono', ui-monospace, monospace`;

function ellipsize(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxW) s = s.slice(0, -1);
  return `${s.trimEnd()}…`;
}

const DEFAULT_DATA = `Jan, 1.820
Feb, 2.140
Mar, 1.960
Apr, 2.710
May, 3.050
Jun, 2.880
Jul, 3.640
Aug, 4.210
Sep, 4.020
Oct, 4.980`;

const T_DRAW0 = 1.0;
const T_DRAW1 = 5.0;
const T_OUT = 6.6;

export default {
  id: 'line-chart',
  title: 'Line Chart',
  description: 'The chart line draws itself with a glowing head and the value following along, over a gradient area.',
  category: 'dados',
  tags: ['data', 'ui'],
  duration: 8,
  poster: 5.6,

  params: {
    title: { type: 'text', label: 'Title', default: 'Monthly revenue' },
    subtitle: { type: 'text', label: 'Subtitle', default: 'In thousands of BRL · 2025' },
    data: { type: 'textarea', label: 'Data (Label, value)', rows: 8, default: DEFAULT_DATA },
    prefix: { type: 'text', label: 'Value prefix', default: 'R$ ' },
    suffix: { type: 'text', label: 'Value suffix', default: '' },
    area: { type: 'boolean', label: 'Filled area', default: true },
    compact: { type: 'boolean', label: 'Compact numbers', default: false },
    accent: { type: 'color', label: 'Accent', default: '#5b8cff' },
    ink: { type: 'color', label: 'Text', default: '#f2efe8' },
    bg: { type: 'color', label: 'Background', default: '#0d0f14' },
  },

  setup({ p }) {
    const items = parseData(p.data);
    const dec = Math.min(2, items.reduce((m, d) => Math.max(m, d.dec), 0));
    const vals = items.map((d) => d.v);
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    // Eixo começa em 0 quando os dados são positivos e não muito distantes de 0; senão, ajusta ao intervalo.
    const from0 = lo >= 0 && lo < hi * 0.5;
    const scale = items.length ? niceTicks(from0 ? 0 : lo - (hi - lo) * 0.08, hi, 5) : null;
    return { items, dec, scale };
  },

  render(ctx, t, { w, h, p, px, state }) {
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, w, h);
    const bgG = ctx.createRadialGradient(w * 0.7, h * 0.35, 0, w * 0.6, h * 0.45, Math.max(w, h) * 0.8);
    bgG.addColorStop(0, rgba(p.accent, 0.06));
    bgG.addColorStop(1, rgba(p.accent, 0));
    ctx.fillStyle = bgG;
    ctx.fillRect(0, 0, w, h);
    const vig = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.75);
    vig.addColorStop(0.4, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.3)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);

    const { items, dec, scale } = state;
    const n = items.length;
    const m = Math.min(w, h);
    const portrait = h > w * 1.1;
    const outAll = ease.inCubic(seg(t, T_OUT + 0.2, T_OUT + 0.9));

    // ---------- cabeçalho ----------
    const padX = portrait ? w * 0.08 : w * 0.07;
    const top = portrait ? h * 0.12 : h * 0.1;
    const titleSize = m * (portrait ? 0.062 : 0.055);
    const subSize = titleSize * 0.42;
    const titleIn = ease.outExpo(seg(t, 0.1, 1.0));
    const subIn = ease.outExpo(seg(t, 0.25, 1.15));
    ctx.fillStyle = p.accent;
    ctx.fillRect(padX, top - titleSize * 0.95, m * 0.045 * ease.outExpo(seg(t, 0.05, 0.8)) * (1 - outAll), m * 0.006);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, top - titleSize * 0.85, w, titleSize * 1.15 + subSize * 2.2);
    ctx.clip();
    let tSize = titleSize;
    ctx.font = INTER(800)(tSize);
    if (ctx.measureText(p.title).width > w - padX * 2) {
      tSize *= (w - padX * 2) / ctx.measureText(p.title).width;
      ctx.font = INTER(800)(tSize);
    }
    ctx.letterSpacing = `${-tSize * 0.02}px`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = p.ink;
    ctx.globalAlpha = 1 - outAll;
    ctx.fillText(p.title, padX, top + tSize * 0.2 + (1 - titleIn) * tSize * 1.2 - outAll * tSize * 0.3);
    ctx.letterSpacing = '0px';
    ctx.font = INTER(500)(subSize);
    ctx.fillStyle = rgba(p.ink, 0.55 * subIn);
    ctx.fillText(ellipsize(ctx, p.subtitle, w - padX * 2), padX, top + tSize * 0.2 + subSize * 1.9 + (1 - subIn) * subSize * 2);
    ctx.restore();
    ctx.globalAlpha = 1;

    if (n < 2) {
      ctx.font = INTER(500)(subSize * 1.3);
      ctx.fillStyle = rgba(p.ink, 0.5);
      ctx.textAlign = 'center';
      ctx.fillText('Use at least 2 "Label, value" lines', w / 2, h / 2);
      return;
    }

    const fmtV = (v) => `${p.prefix}${fmt(v, dec, p.compact)}${p.suffix}`;
    const tickSize = m * 0.017;
    const labSize = m * 0.02;
    const tagSize = m * (portrait ? 0.03 : 0.028);

    // ---------- área do gráfico ----------
    ctx.font = MONO(tickSize);
    const axisW = Math.max(...scale.ticks.map((v) => ctx.measureText(fmt(v, scale.dec, p.compact)).width)) + m * 0.025;
    const x0 = padX + axisW;
    const x1 = w - padX;
    const plotTop = top + titleSize * 0.2 + subSize * 2 + m * 0.11 + tagSize;
    const plotBot = h - (portrait ? h * 0.1 : h * 0.12);
    const yOf = (v) => plotBot - ((v - scale.lo) / (scale.hi - scale.lo)) * (plotBot - plotTop);
    const vOf = (y) => scale.lo + ((plotBot - y) / (plotBot - plotTop)) * (scale.hi - scale.lo);
    const inset = (x1 - x0) * 0.02;
    const xs = items.map((_, i) => x0 + inset + ((x1 - x0 - inset * 2) * i) / (n - 1));
    const ys = items.map((d) => yOf(d.v));

    // Grid horizontal tracejado + escala.
    ctx.lineWidth = Math.max(1, m * 0.0012);
    scale.ticks.forEach((v, k) => {
      const e = ease.outExpo(seg(t, 0.35 + k * 0.06, 1.4 + k * 0.06)) * (1 - outAll);
      const y = yOf(v);
      ctx.strokeStyle = rgba(p.ink, k === 0 ? 0.25 : 0.08);
      ctx.setLineDash(k === 0 ? [] : [m * 0.004, m * 0.006]);
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x0 + (x1 - x0) * e, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = MONO(tickSize);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = rgba(p.ink, 0.4 * e);
      ctx.fillText(fmt(v, scale.dec, p.compact), x0 - m * 0.018, y);
    });

    // Curva amostrada (polilinha) com comprimento acumulado.
    const tan = monotoneTangents(xs, ys);
    const pts = [];
    const SUB = 24;
    for (let i = 0; i < n - 1; i++) {
      const dx = xs[i + 1] - xs[i];
      for (let k = 0; k < SUB; k++) {
        const u = k / SUB;
        const h00 = 2 * u ** 3 - 3 * u ** 2 + 1;
        const h10 = u ** 3 - 2 * u ** 2 + u;
        const h01 = -2 * u ** 3 + 3 * u ** 2;
        const h11 = u ** 3 - u ** 2;
        pts.push([xs[i] + dx * u, h00 * ys[i] + h10 * dx * tan[i] + h01 * ys[i + 1] + h11 * dx * tan[i + 1]]);
      }
    }
    pts.push([xs[n - 1], ys[n - 1]]);
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const total = cum[cum.length - 1];
    const at = (L) => {
      L = clamp(L, 0, total);
      let lo = 0;
      let hi = cum.length - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (cum[mid] < L) lo = mid;
        else hi = mid;
      }
      const k = (L - cum[lo]) / (cum[hi] - cum[lo] || 1);
      return { i: lo, x: pts[lo][0] + (pts[hi][0] - pts[lo][0]) * k, y: pts[lo][1] + (pts[hi][1] - pts[lo][1]) * k };
    };
    const subPath = (La, Lb) => {
      const a = at(La);
      const b = at(Lb);
      const out = [[a.x, a.y]];
      for (let i = a.i + 1; i <= b.i; i++) out.push(pts[i]);
      out.push([b.x, b.y]);
      return out;
    };

    const drawK = ease.inOutSine(seg(t, T_DRAW0, T_DRAW1));
    const eraseK = ease.inOutCubic(seg(t, T_OUT, T_OUT + 0.9));
    const La = total * eraseK;
    const Lb = total * drawK;
    const head = at(Lb);
    const eraseX = eraseK >= 1 ? Infinity : at(La).x;

    if (Lb - La > total * 0.004) {
      const path = subPath(La, Lb);
      // Área em degradê sob a linha.
      if (p.area) {
        const ag = ctx.createLinearGradient(0, plotTop, 0, plotBot);
        ag.addColorStop(0, rgba(p.accent, 0.34 * (1 - eraseK)));
        ag.addColorStop(1, rgba(p.accent, 0));
        ctx.fillStyle = ag;
        ctx.beginPath();
        ctx.moveTo(path[0][0], plotBot);
        for (const q of path) ctx.lineTo(q[0], q[1]);
        ctx.lineTo(path[path.length - 1][0], plotBot);
        ctx.closePath();
        ctx.fill();
        // Linha vertical da cabeça até o eixo.
        if (drawK > 0 && drawK < 1) {
          ctx.strokeStyle = rgba(p.accent, 0.35 * (1 - outAll));
          ctx.setLineDash([m * 0.004, m * 0.005]);
          ctx.beginPath();
          ctx.moveTo(head.x, head.y);
          ctx.lineTo(head.x, plotBot);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
      // Linha com brilho.
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      path.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])));
      ctx.save();
      ctx.shadowColor = rgba(p.accent, 0.8);
      ctx.shadowBlur = m * 0.02 * px;
      ctx.strokeStyle = p.accent;
      ctx.lineWidth = m * 0.0055;
      ctx.stroke();
      ctx.restore();
    }

    // Pontos dos dados: aparecem quando a cabeça passa.
    const dotR = m * 0.0075;
    items.forEach((d, i) => {
      const passX = clamp((head.x - xs[i]) / (m * 0.04) + 1);
      const pop = spring(clamp(passX), 0.35);
      const gone = eraseK > 0 ? clamp((eraseX - xs[i]) / (m * 0.03) + 0.5) : 0;
      const r = dotR * pop * (1 - gone);
      if (r > 0.2 && (drawK > 0)) {
        ctx.fillStyle = p.bg;
        ctx.beginPath();
        ctx.arc(xs[i], ys[i], r * 1.0, 0, TAU);
        ctx.fill();
        ctx.lineWidth = m * 0.0035;
        ctx.strokeStyle = p.accent;
        ctx.stroke();
      }
      // Rótulo do eixo x (afina quando há muitos pontos).
      ctx.font = INTER(600)(labSize);
      const every = Math.max(1, Math.ceil((ctx.measureText('Mmmm').width * 1.6) / ((x1 - x0) / (n - 1))));
      if (i % every === 0 || i === n - 1) {
        const le = ease.outExpo(seg(t, T_DRAW0 - 0.2 + (i / (n - 1)) * (T_DRAW1 - T_DRAW0) * 0.85, T_DRAW0 + 0.6 + (i / (n - 1)) * (T_DRAW1 - T_DRAW0) * 0.85)) * (1 - outAll);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = rgba(p.ink, (passX >= 1 ? 0.75 : 0.4) * le);
        ctx.fillText(ellipsize(ctx, d.label, ((x1 - x0) / (n - 1)) * every * 0.9), xs[i], plotBot + m * 0.022 + (1 - le) * labSize * 0.6);
      }
    });

    // Cabeça luminosa + etiqueta de valor.
    const headOn = clamp(seg(t, T_DRAW0 - 0.1, T_DRAW0 + 0.3)) * (1 - ease.inCubic(seg(t, T_OUT - 0.1, T_OUT + 0.3)));
    if (headOn > 0.001) {
      const pulse = 0.5 + 0.5 * Math.sin(t * TAU * 1.5);
      const hg = ctx.createRadialGradient(head.x, head.y, 0, head.x, head.y, m * 0.05);
      hg.addColorStop(0, rgba(p.accent, 0.55 * headOn));
      hg.addColorStop(1, rgba(p.accent, 0));
      ctx.fillStyle = hg;
      ctx.beginPath();
      ctx.arc(head.x, head.y, m * 0.05, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = rgba(p.accent, 0.5 * headOn * (1 - pulse));
      ctx.lineWidth = m * 0.002;
      ctx.beginPath();
      ctx.arc(head.x, head.y, m * (0.012 + 0.014 * pulse), 0, TAU);
      ctx.stroke();
      ctx.fillStyle = rgba('#ffffff', headOn);
      ctx.beginPath();
      ctx.arc(head.x, head.y, m * 0.008, 0, TAU);
      ctx.fill();

      // Etiqueta: valor da curva sob a cabeça (no fim, exatamente o último valor).
      const val = drawK >= 1 ? items[n - 1].v : vOf(head.y);
      const txt = fmtV(val);
      ctx.font = MONO(tagSize);
      const tw = ctx.measureText(fmtV(Math.max(...items.map((d) => Math.abs(d.v))) * (val < 0 ? -1 : 1))).width;
      const padT = tagSize * 0.55;
      const bw = tw + padT * 2;
      const bh = tagSize * 1.75;
      const gap = m * 0.03;
      // Acima da cabeça; perto do topo desliza para o lado (esquerda, ou direita perto da borda).
      const room = head.y - gap - bh - (plotTop - tagSize * 1.5);
      const sk = ease.inOutCubic(clamp(1 - room / bh));
      const side = sk < 0.5 ? 0 : head.x - gap - bw > x0 ? -1 : 1;
      const sideDir = head.x - gap - bw > x0 ? -1 : 1;
      const axA = clamp(head.x - bw / 2, x0, x1 - bw);
      const axS = sideDir < 0 ? head.x - gap - bw : head.x + gap;
      const bx = axA + (axS - axA) * sk;
      const by = head.y - gap - bh + (gap + bh / 2) * sk;
      const tagIn = spring(seg(t, T_DRAW0, T_DRAW0 + 0.8), 0.3) * headOn;
      ctx.save();
      ctx.globalAlpha = clamp(tagIn);
      ctx.translate(head.x, head.y);
      ctx.scale(0.6 + 0.4 * tagIn, 0.6 + 0.4 * tagIn);
      ctx.translate(-head.x, -head.y);
      ctx.fillStyle = p.accent;
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, bh, bh * 0.28);
      ctx.fill();
      // Ponteiro.
      const q = tagSize * 0.35;
      ctx.beginPath();
      if (side === 0) {
        const px0 = clamp(head.x, bx + bh * 0.4, bx + bw - bh * 0.4);
        ctx.moveTo(px0 - q, by + bh - 1);
        ctx.lineTo(px0, by + bh + q);
        ctx.lineTo(px0 + q, by + bh - 1);
      } else {
        const ex = side < 0 ? bx + bw - 1 : bx + 1;
        if (Math.abs(head.y - (by + bh / 2)) > bh * 0.3) ctx.beginPath();
        ctx.moveTo(ex, head.y - q);
        ctx.lineTo(ex - side * q, head.y);
        ctx.lineTo(ex, head.y + q);
      }
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(txt, bx + bw / 2, by + bh * 0.53);
      ctx.restore();
    }

    // Variação total (primeiro → último), entra quando a linha termina.
    const first = items[0].v;
    const last = items[n - 1].v;
    if (first !== 0) {
      const ch = (last - first) / Math.abs(first);
      const be = ease.outExpo(seg(t, T_DRAW1 - 0.1, T_DRAW1 + 0.8)) * (1 - outAll);
      if (be > 0.001) {
        const bs = m * 0.024;
        const txt = `${ch >= 0 ? '▲' : '▼'} ${ch >= 0 ? '+' : ''}${fmt(ch * 100, 1, false)}%`;
        ctx.font = MONO(bs);
        const bw = ctx.measureText(txt).width + bs * 1.2;
        const bh = bs * 1.9;
        const bx = portrait ? padX : w - padX - bw;
        const by = portrait ? top + titleSize * 0.2 + subSize * 2 + m * 0.04 : top - titleSize * 0.7;
        ctx.globalAlpha = be;
        ctx.strokeStyle = rgba(p.accent, 0.6);
        ctx.fillStyle = rgba(p.accent, 0.14);
        ctx.lineWidth = Math.max(1, m * 0.0015);
        ctx.beginPath();
        ctx.roundRect(bx, by + (1 - be) * bs, bw, bh, bh / 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = p.ink;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(txt, bx + bw / 2, by + bh * 0.53 + (1 - be) * bs);
        ctx.globalAlpha = 1;
      }
    }
  },
};
