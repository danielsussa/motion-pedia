import { clamp, lerp, seg, ease, rgba, mixHex, hexToRgb } from '../lib/anim.js';

// ---------- helpers locais ----------

// Número em texto livre ("1.234,5", "1234.5") → valor. Vírgula = decimal (pt-BR).
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

// CSV: 1ª linha = cabeçalho (1ª célula ignorada, demais = períodos); depois uma linha por item.
// Separador: ; ou tab quando houver (aí vírgula pode ser decimal), senão vírgula.
function parseCSV(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
  if (lines.length < 2) return null;
  const sep = /[;\t]/.test(lines[0]) ? /\s*[;\t]\s*/ : /\s*,\s*/;
  const head = lines[0].split(sep).slice(1).map((s) => s.trim());
  const periods = head.filter((s) => s !== '');
  const P = periods.length;
  if (P < 1) return null;
  let dec = 0;
  const items = [];
  for (const l of lines.slice(1)) {
    const cells = l.split(sep);
    const label = (cells[0] || '').trim();
    if (!label) continue;
    const vals = [];
    let any = false;
    for (let j = 0; j < P; j++) {
      const n = parseNum(cells[j + 1] ?? '');
      if (n) {
        any = true;
        dec = Math.max(dec, n.dec);
      }
      vals.push(n ? n.v : null);
    }
    if (!any) continue;
    // buracos: repete o último valor conhecido (ou o próximo, no começo)
    let last = vals.find((v) => v !== null);
    for (let j = 0; j < P; j++) {
      if (vals[j] === null) vals[j] = last;
      else last = vals[j];
    }
    items.push({ label, vals: vals.map((v) => Math.max(0, v)) });
  }
  if (!items.length) return null;
  return { periods, items, dec: Math.min(2, dec) };
}

const fmtCache = new Map();
function fmt(v, dec = 0) {
  if (!fmtCache.has(dec)) fmtCache.set(dec, new Intl.NumberFormat('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec }));
  return fmtCache.get(dec).format(v);
}

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

// mistura (a→b por k) e depois (→c por j), devolvendo rgb()
function mix3(a, b, k, c, j) {
  const A = hexToRgb(a), B = hexToRgb(b), C = hexToRgb(c);
  return `rgb(${A.map((v, i) => Math.round(lerp(lerp(v, B[i], k), C[i], j))).join(',')})`;
}

const INTER = (wt) => (s) => `${wt} ${s}px Inter, system-ui, sans-serif`;
const MONO = (s) => `500 ${s}px 'JetBrains Mono', ui-monospace, monospace`;

const DEFAULT_DATA = `Linguagem, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025
JavaScript, 62, 66, 69, 70, 68, 66, 65, 63, 62, 61
Python, 30, 36, 42, 48, 54, 58, 62, 66, 70, 74
Java, 58, 55, 52, 49, 45, 41, 38, 35, 33, 31
TypeScript, 4, 9, 15, 22, 28, 34, 40, 45, 49, 52
C#, 34, 33, 32, 31, 30, 29, 28, 28, 27, 27
Go, 4, 6, 8, 10, 12, 13, 14, 15, 16, 18
Rust, 1, 2, 3, 4, 6, 8, 11, 14, 17, 21
PHP, 30, 28, 26, 24, 22, 20, 18, 17, 16, 15
Kotlin, 1, 3, 6, 8, 9, 10, 10, 11, 11, 12
C++, 24, 23, 22, 22, 21, 21, 21, 20, 20, 20
Swift, 8, 9, 9, 9, 8, 8, 8, 7, 7, 7`;

const SUB = 24; // amostras por período para a classificação suavizada

export default {
  id: 'bar-race',
  title: 'Bar Chart Race',
  description: 'Ranking que evolui no tempo: barras trocam de posição suavemente enquanto valores e período contam.',
  category: 'dados',
  tags: ['dados', 'ui', 'broadcast'],
  duration: 12,
  poster: 7,

  params: {
    title: { type: 'text', label: 'Título', default: 'Linguagens mais usadas' },
    subtitle: { type: 'text', label: 'Subtítulo', default: '% dos desenvolvedores · dados ilustrativos' },
    data: { type: 'textarea', label: 'Dados (CSV: cabeçalho com períodos)', rows: 8, default: DEFAULT_DATA },
    top: { type: 'range', label: 'Barras visíveis', min: 3, max: 15, step: 1, default: 8 },
    suffix: { type: 'text', label: 'Sufixo do valor', default: '%' },
    colors: { type: 'select', label: 'Cores', options: ['líder em destaque', 'todas em destaque', 'neutras'], default: 'líder em destaque' },
    accent: { type: 'color', label: 'Destaque', default: '#ff5a36' },
    ink: { type: 'color', label: 'Texto', default: '#f2efe8' },
    bg: { type: 'color', label: 'Fundo', default: '#0e0f12' },
  },

  setup({ p }) {
    const d = parseCSV(p.data);
    if (!d) return { empty: true };
    const { items, periods } = d;
    const n = items.length;
    const P = periods.length;
    // a janela de suavização tem meia largura `half`; amostras extras antes/depois (valores parados)
    // garantem que no começo e no fim a classificação assente num inteiro.
    const half = Math.max(1, Math.round(SUB * 0.45));
    const PAD = half * 2;
    const S = (P - 1) * SUB + 1 + PAD * 2;
    const valAt = (it, f) => {
      f = clamp(f, 0, P - 1);
      const i = Math.min(P - 1, Math.floor(f));
      const k = f - i;
      return i >= P - 1 ? it.vals[P - 1] : lerp(it.vals[i], it.vals[i + 1], k);
    };
    // classificação instantânea em cada amostra (empate: ordem do CSV)
    const raw = items.map(() => new Float32Array(S));
    const maxS = new Float32Array(S);
    const idx = items.map((_, i) => i);
    for (let s = 0; s < S; s++) {
      const f = (s - PAD) / SUB;
      const v = items.map((it) => valAt(it, f));
      idx.sort((a, b) => v[b] - v[a] || a - b);
      idx.forEach((it, r) => (raw[it][s] = r));
      maxS[s] = Math.max(...v);
    }
    // suaviza a posição com janela cosseno (~0,45 período): trocas viram deslizes
    const kern = [];
    let ks = 0;
    for (let j = -half; j <= half; j++) {
      const k = 0.5 + 0.5 * Math.cos((Math.PI * j) / (half + 1));
      kern.push(k);
      ks += k;
    }
    const smooth = (arr) => {
      const out = new Float32Array(S);
      for (let s = 0; s < S; s++) {
        let acc = 0;
        for (let j = -half; j <= half; j++) acc += arr[clamp(s + j, 0, S - 1)] * kern[j + half];
        out[s] = acc / ks;
      }
      return out;
    };
    const rank = raw.map(smooth);
    const maxSm = smooth(maxS);
    return { ...d, n, P, S, PAD, rank, maxSm, valAt };
  },

  render(ctx, t, { w, h, p, duration, state }) {
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, w, h);
    const vg = ctx.createRadialGradient(w * 0.5, h * 0.4, 0, w * 0.5, h * 0.45, Math.max(w, h) * 0.8);
    vg.addColorStop(0, rgba('#000000', 0));
    vg.addColorStop(1, rgba('#000000', 0.3));
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);

    const m = Math.min(w, h);
    const portrait = h > w * 1.1;
    const OUT = duration - 0.9;
    const outAll = ease.inCubic(seg(t, OUT, duration - 0.05));

    // ---------- cabeçalho ----------
    const padX = portrait ? w * 0.07 : w * 0.06;
    const top = portrait ? h * 0.1 : h * 0.11;
    const titleSize = m * (portrait ? 0.066 : 0.056);
    const subSize = titleSize * 0.42;
    const titleIn = ease.outExpo(seg(t, 0.1, 1.0));
    const subIn = ease.outExpo(seg(t, 0.25, 1.15));
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = p.accent;
    ctx.fillRect(padX, top - titleSize * 0.95, m * 0.045 * ease.outExpo(seg(t, 0.05, 0.8)) * (1 - outAll), m * 0.006);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, top - titleSize * 0.85, w, titleSize * 1.15 + subSize * 2.2);
    ctx.clip();
    ctx.globalAlpha = (1 - outAll) * clamp(titleIn * 3);
    const tSize = fitFont(ctx, p.title, w - padX * 2, titleSize, INTER(800));
    ctx.letterSpacing = `${-tSize * 0.02}px`;
    ctx.fillStyle = p.ink;
    ctx.fillText(p.title, padX, top + tSize * 0.2 + (1 - titleIn) * tSize * 1.2);
    ctx.letterSpacing = '0px';
    ctx.font = INTER(500)(subSize);
    ctx.fillStyle = rgba(p.ink, 0.55 * subIn);
    ctx.fillText(ellipsize(ctx, p.subtitle, w - padX * 2), padX, top + tSize * 0.2 + subSize * 1.9 + (1 - subIn) * subSize * 2);
    ctx.restore();
    ctx.globalAlpha = 1;

    if (state.empty) {
      ctx.font = INTER(500)(subSize * 1.2);
      ctx.fillStyle = rgba(p.ink, 0.5);
      ctx.textAlign = 'center';
      ctx.fillText('Sem dados — CSV com cabeçalho de períodos e uma linha por item', w / 2, h / 2);
      return;
    }

    const { items, periods, dec, n, P, S, PAD, rank, maxSm, valAt } = state;
    const N = Math.min(n, Math.round(p.top));

    // ---------- tempo → período ----------
    const R0 = 1.4;
    const R1 = duration - 2.0;
    const padF = PAD / SUB;
    const fx = ease.inOutSine(seg(t, R0, R1)) * (P - 1 + padF * 2) - padF; // inclui as folgas
    const f = clamp(fx, 0, P - 1);
    // posição contínua dentro das amostras
    const sf = (fx + padF) * SUB;
    const s0 = Math.min(S - 1, Math.floor(sf));
    const s1 = Math.min(S - 1, s0 + 1);
    const sk = sf - s0;
    const maxNow = lerp(maxSm[s0], maxSm[s1], sk) || 1;

    // ---------- layout ----------
    const chartTop = top + titleSize * 0.2 + subSize * 2 + m * (portrait ? 0.045 : 0.05);
    const timeH = m * 0.06;
    const chartBot = h - h * (portrait ? 0.07 : 0.08) - timeH;
    const rowH = (chartBot - chartTop) / N;
    const labOnTop = portrait;
    const barH = Math.min(labOnTop ? rowH * 0.42 : rowH * 0.68, m * 0.075);
    const labSize = clamp(rowH * (labOnTop ? 0.3 : 0.36), m * 0.016, m * 0.04);
    const valSize = labSize * 0.92;
    const rankW = m * 0.045;
    ctx.font = INTER(600)(labSize);
    const labW = labOnTop ? 0 : Math.min(w * 0.2, Math.max(...items.map((d) => ctx.measureText(d.label).width)) + m * 0.03);
    const x0 = padX + rankW + labW;
    ctx.font = MONO(valSize);
    const valW = ctx.measureText(`${fmt(maxSm[S - 1] * 1.2, dec)}${p.suffix}`).width + m * 0.03;
    const x1 = w - padX - valW;

    const chartIn = ease.outExpo(seg(t, 0.5, 1.6));

    // período gigante ao fundo
    const pIdx = clamp(Math.round(f), 0, P - 1);
    const pIn = ease.outExpo(seg(t, 0.6, 1.5)) * (1 - outAll);
    {
      const ys = m * (portrait ? 0.2 : 0.17);
      const fs = fitFont(ctx, periods[pIdx], w * 0.5, ys, INTER(800));
      ctx.letterSpacing = `${-fs * 0.04}px`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = rgba(p.ink, 0.13 * pIn);
      ctx.fillText(periods[pIdx], w - padX, chartBot - rowH * 0.15);
      ctx.letterSpacing = '0px';
    }

    // números de posição fixos
    ctx.font = MONO(Math.min(labSize * 0.8, rowH * 0.3));
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (let r = 0; r < N; r++) {
      const e = ease.outExpo(seg(t, 0.5 + r * 0.05, 1.3 + r * 0.05)) * (1 - outAll);
      ctx.fillStyle = rgba(p.ink, 0.28 * e);
      const cy = chartTop + rowH * (r + 0.5) + (labOnTop ? rowH * 0.14 : 0);
      ctx.fillText(String(r + 1).padStart(2, '0'), padX, cy);
    }

    // barras
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, chartTop - rowH * 0.1, w, chartBot - chartTop + rowH * 0.1);
    ctx.clip();
    const order = items.map((_, i) => i);
    const rk = items.map((_, i) => lerp(rank[i][s0], rank[i][s1], sk));
    order.sort((a, b) => rk[b] - rk[a]); // desenha de baixo para cima (líder por cima)
    for (const i of order) {
      const r = rk[i];
      if (r > N + 0.5) continue;
      const it = items[i];
      const v = valAt(it, f);
      const vis = clamp(N + 0.3 - r) * chartIn * (1 - outAll);
      if (vis <= 0.001) continue;
      const cy = chartTop + rowH * (r + 0.5) + (labOnTop ? rowH * 0.14 : 0);
      const grow = ease.outExpo(seg(t, 0.6 + Math.min(r, N) * 0.06, 1.8 + Math.min(r, N) * 0.06)) * (1 - ease.inCubic(seg(t, OUT, duration - 0.1)));
      const bw = Math.max(0, ((x1 - x0) * v) / maxNow) * grow;
      let colr;
      if (p.colors === 'todas em destaque') colr = p.accent;
      else if (p.colors === 'neutras') colr = mixHex(p.bg, p.ink, 0.55);
      else colr = mix3(p.bg, p.ink, 0.3, p.accent, 1 - clamp(r)); // líder em destaque, cor desliza na troca
      ctx.globalAlpha = vis;
      ctx.fillStyle = colr;
      const rr = Math.min(barH * 0.18, m * 0.008);
      if (bw > 0.5) {
        ctx.beginPath();
        ctx.roundRect(x0, cy - barH / 2, bw, barH, [0, rr, rr, 0]);
        ctx.fill();
      }
      // rótulo
      ctx.font = INTER(r < 0.5 ? 700 : 600)(labSize);
      ctx.fillStyle = rgba(p.ink, r < 0.5 ? 1 : 0.78);
      if (labOnTop) {
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(ellipsize(ctx, it.label, x1 - x0), x0, cy - barH / 2 - labSize * 0.4);
      } else {
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(ellipsize(ctx, it.label, labW - m * 0.02), x0 - m * 0.016, cy);
      }
      // valor contando
      ctx.font = MONO(valSize);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = r < 0.5 && p.colors !== 'neutras' ? p.accent : rgba(p.ink, 0.88);
      ctx.fillText(`${fmt(v * grow, dec)}${p.suffix}`, x0 + bw + m * 0.014, cy);
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    // ---------- trilho do tempo ----------
    const ty = chartBot + timeH * 0.75;
    const tIn = ease.outExpo(seg(t, 0.7, 1.7)) * (1 - outAll);
    const tx0 = x0;
    const tx1 = w - padX;
    ctx.globalAlpha = tIn;
    ctx.strokeStyle = rgba(p.ink, 0.14);
    ctx.lineWidth = Math.max(1, m * 0.002);
    ctx.beginPath();
    ctx.moveTo(tx0, ty);
    ctx.lineTo(tx0 + (tx1 - tx0) * tIn, ty);
    ctx.stroke();
    const prog = P > 1 ? f / (P - 1) : 1;
    ctx.strokeStyle = p.accent;
    ctx.lineWidth = Math.max(2, m * 0.004);
    ctx.beginPath();
    ctx.moveTo(tx0, ty);
    ctx.lineTo(tx0 + (tx1 - tx0) * prog, ty);
    ctx.stroke();
    const tick = m * 0.012;
    ctx.font = MONO(m * 0.016);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const every = Math.max(1, Math.ceil((P * m * 0.016 * 4.5) / (tx1 - tx0)));
    for (let j = 0; j < P; j++) {
      const x = tx0 + (P > 1 ? (j / (P - 1)) * (tx1 - tx0) : 0);
      const passed = f >= j - 0.001;
      ctx.fillStyle = passed ? p.accent : rgba(p.ink, 0.3);
      ctx.beginPath();
      ctx.arc(x, ty, tick * (j === pIdx ? 0.55 : 0.32), 0, Math.PI * 2);
      ctx.fill();
      if (j % every === 0 || j === P - 1) {
        ctx.fillStyle = rgba(p.ink, j === pIdx ? 0.9 : 0.4);
        ctx.fillText(periods[j], x, ty + tick * 1.1);
      }
    }
    // cabeça
    ctx.fillStyle = p.accent;
    ctx.beginPath();
    ctx.arc(tx0 + (tx1 - tx0) * prog, ty, tick * 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  },
};
