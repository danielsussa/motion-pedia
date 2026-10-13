import { TAU, clamp, lerp, seg, ease, spring, rgba, hexToRgb } from '../lib/anim.js';

// ---------- helpers locais ----------

// Número em texto livre ("48.200", "1.234,5", "12,6") → { v, dec }. Vírgula = decimal (pt-BR).
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

const fmtCache = new Map();
function fmt(v, dec = 0) {
  if (!fmtCache.has(dec)) fmtCache.set(dec, new Intl.NumberFormat('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }));
  return fmtCache.get(dec).format(v);
}
const pct = (f) => `${fmt(f * 100, f < 0.1 ? 1 : 0)}%`;

function fitFont(ctx, text, maxW, size, font) {
  ctx.font = font(size);
  const tw = ctx.measureText(text).width;
  if (tw > maxW) {
    size *= maxW / tw;
    ctx.font = font(size);
  }
  return size;
}

function ellipsize(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxW) s = s.slice(0, -1);
  return `${s.trimEnd()}…`;
}

// fundo com vinheta pré-renderizado (gradiente de tela cheia custa caro por frame)
function bgBuffer(w, h, px, color) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * px));
  c.height = Math.max(1, Math.round(h * px));
  const g = c.getContext('2d');
  g.scale(px, px);
  g.fillStyle = color;
  g.fillRect(0, 0, w, h);
  const vg = g.createRadialGradient(w * 0.5, h * 0.4, 0, w * 0.5, h * 0.45, Math.max(w, h) * 0.8);
  vg.addColorStop(0, rgba('#000000', 0));
  vg.addColorStop(1, rgba('#000000', 0.32));
  g.fillStyle = vg;
  g.fillRect(0, 0, w, h);
  return c;
}

const INTER = (wt) => (s) => `${wt} ${s}px Inter, system-ui, sans-serif`;
const MONO = (wt) => (s) => `${wt} ${s}px 'JetBrains Mono', ui-monospace, monospace`;

// mistura de cores já em [r,g,b] (mixHex devolve 'rgb()', não dá para encadear)
const mixA = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
const css = (c) => `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;

const SERIF_IT = (s) => `italic 400 ${s}px 'Instrument Serif', Georgia, serif`;

// "Rótulo, valor" por linha (também ; tab | :).
function parseData(text) {
  const out = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const l = line.trim();
    if (!l || l.startsWith('#')) continue;
    const m = l.match(/^(.*?)(?:,\s+|\s*[;\t|:]\s*)([^;\t|:]*\d[^;\t|:]*)$/) || l.match(/^(.*\S)\s+(\S*\d\S*)$/);
    if (!m) continue;
    const n = parseNum(m[2]);
    if (n && n.v > 0) out.push({ label: m[1].trim() || '—', v: n.v });
  }
  return out;
}

// maiores restos: distribui N ícones entre as categorias. Se a soma < 100 e parecer percentual,
// o resto vira "vazio" (ícones apagados).
function allocate(items, N) {
  const sum = items.reduce((s, d) => s + d.v, 0);
  const total = sum <= 100 && sum > 0 && items.every((d) => d.v <= 100) ? Math.max(100, sum) : sum;
  const raw = items.map((d) => (d.v / total) * N);
  const cnt = raw.map(Math.floor);
  let left = Math.round((sum / total) * N) - cnt.reduce((s, c) => s + c, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i]).sort((a, b) => b[0] - a[0]);
  for (let k = 0; k < order.length && left > 0; k++, left--) cnt[order[k][1]]++;
  return { cnt, total };
}

// ícone de pessoa centrado em (x, y), altura s (cabeça + ombros). Só adiciona ao path.
function person(ctx, x, y, s) {
  const hr = s * 0.17;
  const hy = y - s * 0.5 + hr;
  ctx.moveTo(x + hr, hy);
  ctx.arc(x, hy, hr, 0, TAU);
  const bw = s * 0.27;
  const by = y - s * 0.5 + hr * 2 + s * 0.06;
  const bb = y + s * 0.5;
  const r = bw * 0.95;
  ctx.moveTo(x - bw, bb);
  ctx.lineTo(x - bw, by + r);
  ctx.arcTo(x - bw, by, x - bw + r, by, r);
  ctx.lineTo(x + bw - r, by);
  ctx.arcTo(x + bw, by, x + bw, by + r, r);
  ctx.lineTo(x + bw, bb);
  ctx.closePath();
}

function shape(ctx, kind, x, y, s) {
  if (kind === 'pessoa') person(ctx, x, y, s);
  else if (kind === 'círculo') {
    ctx.moveTo(x + s * 0.42, y);
    ctx.arc(x, y, s * 0.42, 0, TAU);
  } else ctx.roundRect(x - s * 0.42, y - s * 0.42, s * 0.84, s * 0.84, s * 0.12);
}

const DEFAULT_DATA = `Every week, 72
Now and then, 19
Never used it, 9`;

export default {
  id: 'waffle',
  title: 'Waffle',
  description: 'A pictogram waffle chart ("7 in 10…"): the icon grid lights up in a stagger, category by category, as the big number counts up.',
  category: 'dados',
  tags: ['data', 'ui'],
  duration: 8,
  poster: 5.2,

  params: {
    title: { type: 'text', label: 'Title', default: 'Pix in daily life' },
    statement: { type: 'text', label: 'Statement', default: 'of Brazilians use Pix every week' },
    data: { type: 'textarea', label: 'Data (Label, value)', rows: 6, default: DEFAULT_DATA },
    grid: { type: 'select', label: 'Icons', options: ['10', '20', '50', '100'], default: '100' },
    icon: { type: 'select', label: 'Icon', options: ['pessoa', 'círculo', 'quadrado'], default: 'pessoa' },
    headline: { type: 'select', label: 'Number', options: ['em cada N', 'percentual'], default: 'percentual' },
    accent: { type: 'color', label: 'Accent', default: '#ff5a36' },
    ink: { type: 'color', label: 'Text', default: '#f2efe8' },
    bg: { type: 'color', label: 'Background', default: '#0e0f12' },
    transparent: { type: 'boolean', label: 'Transparent background', default: false },
  },

  setup({ w, h, px, p }) {
    const items = parseData(p.data).slice(0, 6);
    const N = Number(p.grid) || 100;
    const { cnt, total } = allocate(items, N);
    // categoria de cada ícone, na ordem de preenchimento (-1 = vazio)
    const cat = new Int8Array(N).fill(-1);
    let k = 0;
    cnt.forEach((c, i) => {
      for (let j = 0; j < c && k < N; j++) cat[k++] = i;
    });
    items.forEach((d, i) => {
      d.n = cnt[i];
      d.share = d.v / total;
    });
    return { items, N, cat, filled: k, bgc: p.transparent ? null : bgBuffer(w, h, px, p.bg) };
  },

  render(ctx, t, { w, h, p, duration, state }) {
    const { items, N, cat, filled, bgc } = state;
    if (bgc) ctx.drawImage(bgc, 0, 0, w, h);
    const n = items.length;
    const m = Math.min(w, h);
    const ar = w / h;
    const portrait = ar < 0.9;
    const wide = ar > 1.3;

    const OUT = duration - 0.9;
    const outAll = ease.inCubic(seg(t, OUT, duration - 0.08));
    const vis = 1 - outAll;

    const padX = wide ? w * 0.07 : w * 0.08;
    const padY = h * (portrait ? 0.08 : 0.1);

    // ---------- métricas do texto (antes da grade: no empilhado a grade ocupa o que sobra) ----------
    const side = ar > 1.15;
    const tx = padX;
    const ty = padY;
    const tw = side ? (w - padX * 2) * 0.42 : w - padX * 2;
    const titleS = m * (portrait ? 0.03 : 0.026);
    const em = p.headline === 'em cada N';
    const den = N >= 20 && em ? 10 : N;
    const first = items[0];
    const num = first ? (em ? Math.round(first.share * den) : first.share * 100) : 0;
    const numFull = em ? fmt(num) : fmt(num, 0);
    const tailTxt = em ? ` in ${fmt(den)}` : '%';
    const bigS0 = m * (side ? 0.2 : portrait ? 0.2 : 0.15);
    const tailFont = (s) => (em ? SERIF_IT(s * 0.42) : INTER(800)(s * 0.55));
    ctx.font = INTER(800)(bigS0);
    ctx.letterSpacing = `${-bigS0 * 0.04}px`;
    const nw0 = ctx.measureText(numFull).width;
    ctx.letterSpacing = '0px';
    ctx.font = tailFont(bigS0);
    const mw = nw0 + ctx.measureText(tailTxt).width + bigS0 * 0.04;
    const bigS = mw > tw ? (bigS0 * tw) / mw : bigS0;
    const by = ty + m * 0.006 + titleS * 1.9 + bigS * 1.05;
    const stS = m * (portrait ? 0.042 : 0.034);
    ctx.font = INTER(600)(stS);
    ctx.letterSpacing = `${-stS * 0.01}px`;
    const lines = wrap(ctx, p.statement, tw, 3);
    ctx.letterSpacing = '0px';
    const legY = by + stS * (1.75 + (lines.length - 1) * 1.25) + m * (side ? 0.06 : 0.035);
    const ls = m * (portrait ? 0.026 : 0.022);
    const lRowH = ls * 1.9;
    // legenda: em coluna (lado a lado com a grade) ou em fluxo, quebrando linha quando não cabe
    const vtOf = (d) => `${fmt(d.share * 100, d.share < 0.1 && (d.share * 100) % 1 ? 1 : 0)}%`;
    ctx.font = MONO(600)(ls * 0.92);
    const colVW = ctx.measureText('100%').width;
    const legPos = [];
    let lx = 0, lrow = 0;
    for (const [i, d] of items.entries()) {
      ctx.font = MONO(600)(ls * 0.92);
      const vw = side ? colVW : ctx.measureText(vtOf(d)).width;
      ctx.font = INTER(i === 0 ? 700 : 500)(ls);
      const iw = Math.min(tw, ls * 1.4 + vw + ls * 0.6 + ctx.measureText(d.label).width);
      if (side || (lx > 0 && lx + iw > tw)) {
        if (lx > 0 || side) lrow += i > 0 ? 1 : 0;
        lx = 0;
      }
      legPos.push({ x: lx, row: lrow, vw, iw });
      lx += iw + ls * 1.6;
    }
    const legH = lRowH * (lrow + 1);

    let gx, gy, gw, gh;
    if (side) {
      gx = padX + tw + w * 0.06;
      gw = w - padX - gx;
      gy = padY;
      gh = h - padY * 2;
    } else {
      gx = padX;
      gw = w - padX * 2;
      gy = legY + legH + m * 0.04;
      gh = h - padY - gy;
    }

    // grade: escolhe colunas para os ícones ficarem o maior possível
    const iconAR = p.icon === 'pessoa' ? 0.62 : 1; // largura/altura da célula
    let best = { cols: 10, rows: Math.ceil(N / 10), s: 0 };
    for (let cols = 1; cols <= N; cols++) {
      const rows = Math.ceil(N / cols);
      if (rows * cols - N >= cols) continue;
      if (N % cols && N > 10) continue;
      const s = Math.min(gw / (cols * iconAR), gh / rows);
      if (s > best.s) best = { cols, rows, s };
    }
    const { cols, rows } = best;
    const cellH = best.s;
    const cellW = cellH * iconAR;
    const gridW = cellW * cols;
    const gridH = cellH * rows;
    const ox = side ? gx + (gw - gridW) / 2 : gx + (gw - gridW) / 2;
    const oy = side ? gy + (gh - gridH) / 2 : gy + (gh - gridH) / 2;
    const isz = cellH * (p.icon === 'pessoa' ? 0.84 : 0.86);

    // ---------- tempos ----------
    const GRID_IN = 0.6;
    const FILL0 = 1.3;
    const FILL_SPAN = Math.min(3.4, 1.4 + N * 0.022);
    // cada ícone acende num instante: categorias em sequência, com pausa curta entre elas
    const pause = n > 1 ? 0.25 : 0;
    const iconT = (k) => {
      const c = cat[k];
      if (c < 0) return Infinity;
      return FILL0 + (k / Math.max(1, filled)) * (FILL_SPAN - pause * (n - 1)) + pause * c;
    };
    const catStart = (c) => {
      let k = 0;
      for (let i = 0; i < c; i++) k += items[i].n;
      return iconT(Math.min(k, N - 1));
    };

    const BG = hexToRgb(p.bg), INK = hexToRgb(p.ink);
    const tone = (c) => (c === 0 ? p.accent : css(mixA(BG, INK, n > 2 ? 0.7 - (0.38 * (c - 1)) / (n - 2) : 0.6)));
    const dim = rgba(p.ink, 0.07);

    // ícones: um path por cor (apagados + uma por categoria), com o "pop" de escala
    const pops = new Float32Array(N);
    ctx.globalAlpha = vis;
    ctx.fillStyle = dim;
    ctx.beginPath();
    for (let k = 0; k < N; k++) {
      const r = Math.floor(k / cols), c = k % cols;
      const d = (r + c) / (rows + cols);
      const gIn = ease.outCubic(seg(t, GRID_IN + d * 0.6, GRID_IN + d * 0.6 + 0.5));
      const lit = seg(t, iconT(k), iconT(k) + 0.55);
      pops[k] = lit;
      if (gIn <= 0.01 || lit >= 0.35) continue;
      shape(ctx, p.icon, ox + cellW * (c + 0.5), oy + cellH * (r + 0.5), isz * (0.6 + 0.4 * gIn));
    }
    ctx.fill();
    for (let ci = n - 1; ci >= 0; ci--) {
      ctx.fillStyle = tone(ci);
      ctx.beginPath();
      for (let k = 0; k < N; k++) {
        if (cat[k] !== ci || pops[k] <= 0) continue;
        const r = Math.floor(k / cols), c = k % cols;
        const sc = spring(pops[k], 0.35);
        shape(ctx, p.icon, ox + cellW * (c + 0.5), oy + cellH * (r + 0.5), isz * (0.35 + 0.65 * sc));
      }
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // ---------- texto ----------
    const tIn = ease.outExpo(seg(t, 0.1, 1.0));
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.globalAlpha = vis;
    ctx.fillStyle = p.accent;
    ctx.fillRect(tx, ty, m * 0.045 * ease.outExpo(seg(t, 0.05, 0.8)), m * 0.006);
    ctx.font = INTER(700)(titleS);
    ctx.fillStyle = rgba(p.ink, 0.75 * tIn);
    ctx.fillText(ellipsize(ctx, p.title, tw), tx + (1 - tIn) * m * 0.02, ty + m * 0.006 + titleS * 1.9);

    if (!n) {
      ctx.font = INTER(500)(titleS);
      ctx.fillStyle = rgba(p.ink, 0.5);
      ctx.fillText('No data — use "Label, value" per line', tx, ty + titleS * 5);
      ctx.globalAlpha = 1;
      return;
    }

    // número grande: conta junto com a 1ª categoria
    const c0 = catStart(0);
    const c1 = n > 1 ? catStart(1) - pause : FILL0 + FILL_SPAN;
    let lit0 = 0;
    for (let k = 0; k < N; k++) if (cat[k] === 0 && t >= iconT(k) + 0.08) lit0++;
    const cntK = first.n ? lit0 / first.n : ease.outCubic(seg(t, c0, c1));
    const bigIn = ease.outExpo(seg(t, c0 - 0.3, c0 + 0.6));
    const numTxt = em ? fmt(Math.round(num * cntK)) : fmt(num * cntK, 0);
    ctx.save();
    ctx.beginPath();
    ctx.rect(tx - m * 0.02, by - bigS * 1.0, tw + m * 0.04, bigS * 1.3);
    ctx.clip();
    const yOff = (1 - bigIn) * bigS * 0.9;
    ctx.font = INTER(800)(bigS);
    ctx.letterSpacing = `${-bigS * 0.04}px`;
    ctx.fillStyle = p.accent;
    ctx.fillText(numTxt, tx, by + yOff);
    ctx.font = INTER(800)(bigS);
    const nw = ctx.measureText(numTxt).width;
    ctx.letterSpacing = '0px';
    ctx.font = tailFont(bigS);
    ctx.fillStyle = em ? p.ink : p.accent;
    ctx.fillText(tailTxt, tx + nw + bigS * 0.02, by + yOff);
    ctx.restore();

    // frase
    const stIn = ease.outExpo(seg(t, c0 + 0.2, c0 + 1.1));
    ctx.font = INTER(600)(stS);
    ctx.letterSpacing = `${-stS * 0.01}px`;
    ctx.fillStyle = rgba(p.ink, stIn);
    lines.forEach((ln, i) => ctx.fillText(ln, tx + (1 - stIn) * m * 0.02, by + stS * (1.75 + i * 1.25)));
    ctx.letterSpacing = '0px';

    // legenda: aparece quando a categoria começa a acender
    {
      for (let i = 0; i < n; i++) {
        const d = items[i];
        const e = ease.outExpo(seg(t, catStart(i) - 0.1, catStart(i) + 0.7));
        if (e <= 0.01) continue;
        const L = legPos[i];
        const x = tx + L.x + (1 - e) * m * 0.02;
        const y = legY + lRowH * (L.row + 0.5);
        ctx.globalAlpha = e * vis;
        ctx.fillStyle = tone(i);
        ctx.beginPath();
        ctx.roundRect(x, y - ls * 0.4, ls * 0.8, ls * 0.8, ls * 0.2);
        ctx.fill();
        ctx.textBaseline = 'middle';
        ctx.font = MONO(600)(ls * 0.92);
        ctx.fillStyle = i === 0 ? p.accent : rgba(p.ink, 0.6);
        ctx.textAlign = 'right';
        ctx.fillText(vtOf(d), x + ls * 1.4 + L.vw, y);
        ctx.textAlign = 'left';
        ctx.font = INTER(i === 0 ? 700 : 500)(ls);
        ctx.fillStyle = rgba(p.ink, i === 0 ? 0.95 : 0.75);
        ctx.fillText(ellipsize(ctx, d.label, L.iw - L.vw - ls * 2.0 + 2), x + ls * 2.0 + L.vw, y);
      }
      ctx.textBaseline = 'alphabetic';
    }
    ctx.globalAlpha = 1;
  },
};

// quebra em até `max` linhas
function wrap(ctx, text, maxW, max) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const out = [];
  let cur = '';
  for (const wd of words) {
    const tryS = cur ? `${cur} ${wd}` : wd;
    if (ctx.measureText(tryS).width <= maxW || !cur) cur = tryS;
    else {
      out.push(cur);
      cur = wd;
    }
  }
  if (cur) out.push(cur);
  if (out.length > max) {
    const keep = out.slice(0, max);
    keep[max - 1] = ellipsize(ctx, `${keep[max - 1]} ${out.slice(max).join(' ')}`, maxW);
    return keep;
  }
  return out;
}
