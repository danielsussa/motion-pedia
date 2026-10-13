import { clamp, seg, ease, spring, stagger, rgba, mixHex } from '../lib/anim.js';

// ---------- helpers locais ----------

// Número em texto livre ("1.234,5", "1234.5", "R$ 2,3 mi" → 2.3) → { v, dec }. Vírgula = decimal (pt-BR).
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
    else intPart = s; // 1,234,567
  } else if (ld >= 0) {
    const parts = s.split('.');
    // "1.500" ou "1.234.567" = milhar (pt-BR); "3.75" = decimal
    if (parts.length > 2 || parts[1].length === 3) intPart = s;
    else [intPart, frac] = parts;
  }
  intPart = intPart.replace(/[.,]/g, '') || '0';
  frac = frac.replace(/[.,]/g, '');
  const v = Number(`${intPart}.${frac || 0}`) * (neg ? -1 : 1);
  return Number.isFinite(v) ? { v, dec: frac.length } : null;
}

// Uma linha "Rótulo, valor" por item (também aceita ; tab | :). Linhas inválidas são ignoradas.
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
function fmt(v, dec, compact, minDec = dec) {
  const k = `${dec}|${minDec}|${compact}`;
  if (!fmtCache.has(k)) {
    fmtCache.set(
      k,
      new Intl.NumberFormat('pt-BR', compact
        ? { notation: 'compact', maximumFractionDigits: 1 }
        : { minimumFractionDigits: minDec, maximumFractionDigits: dec }),
    );
  }
  return fmtCache.get(k).format(v);
}

// Escala "bonita": passos 1/2/2,5/5 × 10^n.
function niceTicks(lo, hi, count = 5) {
  if (hi === lo) hi = lo + 1;
  const raw = (hi - lo) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
  const a = Math.floor(lo / step) * step;
  const b = Math.ceil(hi / step) * step;
  const ticks = [];
  for (let v = a; v <= b + step * 0.5; v += step) ticks.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return { lo: a, hi: b, step, ticks };
}

// Encolhe a fonte até o texto caber em maxW.
function fitText(ctx, text, maxW, size, font) {
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

function roundRect(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

const INTER = (wt) => (s) => `${wt} ${s}px Inter, system-ui, sans-serif`;
const MONO = (s) => `500 ${s}px 'JetBrains Mono', ui-monospace, monospace`;

const DEFAULT_DATA = `Brasil, 1.240
México, 865
Argentina, 512
Colômbia, 438
Chile, 297
Peru, 214`;

export default {
  id: 'bar-chart',
  title: 'Bar Chart',
  description: 'Barras crescem com mola em sequência enquanto os valores contam, sobre um grid sutil com escala.',
  category: 'dados',
  tags: ['dados', 'ui'],
  duration: 7,
  poster: 3.5,

  params: {
    title: { type: 'text', label: 'Título', default: 'Usuários ativos por país' },
    subtitle: { type: 'text', label: 'Subtítulo', default: 'Em milhares · 2025' },
    data: { type: 'textarea', label: 'Dados (Rótulo, valor)', rows: 7, default: DEFAULT_DATA },
    prefix: { type: 'text', label: 'Prefixo do valor', default: '' },
    suffix: { type: 'text', label: 'Sufixo do valor', default: '' },
    orientation: { type: 'select', label: 'Orientação', options: ['auto', 'vertical', 'horizontal'], default: 'auto' },
    highlight: { type: 'select', label: 'Destaque', options: ['maior', 'todas', 'nenhuma'], default: 'maior' },
    compact: { type: 'boolean', label: 'Números compactos (1,2 mi)', default: false },
    accent: { type: 'color', label: 'Destaque', default: '#ff5a36' },
    ink: { type: 'color', label: 'Texto', default: '#f2efe8' },
    bg: { type: 'color', label: 'Fundo', default: '#0e0f12' },
  },

  setup({ p }) {
    const items = parseData(p.data);
    const dec = Math.min(2, items.reduce((m, d) => Math.max(m, d.dec), 0));
    const vals = items.map((d) => d.v);
    const lo = Math.min(0, ...vals);
    const hi = Math.max(0, ...vals);
    const scale = niceTicks(lo, hi, 5);
    let maxI = 0;
    items.forEach((d, i) => (d.v > items[maxI].v ? (maxI = i) : 0));
    return { items, dec, scale, maxI };
  },

  render(ctx, t, { w, h, p, px, state }) {
    // Fundo com vinheta leve.
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, w, h);
    const g = ctx.createRadialGradient(w * 0.5, h * 0.35, 0, w * 0.5, h * 0.4, Math.max(w, h) * 0.75);
    g.addColorStop(0, 'rgba(255,255,255,0.045)');
    g.addColorStop(1, 'rgba(0,0,0,0.25)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    const { items, dec, scale, maxI } = state;
    const n = items.length;
    const m = Math.min(w, h);
    const portrait = h > w * 1.1;
    const horizontal = p.orientation === 'horizontal' || (p.orientation === 'auto' && (portrait || n > 9));

    const OUT0 = 5.7; // início da saída
    const out = (i) => ease.inCubic(seg(t, OUT0 + stagger(i, n, 0.35), OUT0 + 0.55 + stagger(i, n, 0.35)));
    const outAll = ease.inCubic(seg(t, OUT0 + 0.3, OUT0 + 0.95));

    // Margens e cabeçalho.
    const padX = portrait ? w * 0.08 : w * 0.07;
    const top = portrait ? h * 0.12 : h * 0.1;
    const titleSize = m * (portrait ? 0.062 : 0.055);
    const subSize = titleSize * 0.42;
    const titleIn = ease.outExpo(seg(t, 0.1, 1.0));
    const subIn = ease.outExpo(seg(t, 0.25, 1.15));

    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    // Tag de destaque acima do título.
    const tagW = m * 0.045;
    ctx.fillStyle = p.accent;
    ctx.fillRect(padX, top - titleSize * 0.95, tagW * ease.outExpo(seg(t, 0.05, 0.8)) * (1 - outAll), m * 0.006);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, top - titleSize * 0.85, w, titleSize * 1.15 + subSize * 2.2);
    ctx.clip();
    const tSize = fitText(ctx, p.title, w - padX * 2, titleSize, INTER(800));
    ctx.letterSpacing = `${-tSize * 0.02}px`;
    ctx.fillStyle = p.ink;
    ctx.globalAlpha = 1 - outAll;
    ctx.fillText(p.title, padX, top + tSize * 0.2 + (1 - titleIn) * tSize * 1.2 - outAll * tSize * 0.3);
    ctx.letterSpacing = '0px';
    ctx.font = INTER(500)(subSize);
    ctx.fillStyle = rgba(p.ink, 0.55 * subIn);
    ctx.fillText(ellipsize(ctx, p.subtitle, w - padX * 2), padX, top + tSize * 0.2 + subSize * 1.9 + (1 - subIn) * subSize * 2);
    ctx.restore();
    ctx.globalAlpha = 1;

    if (!n) {
      ctx.font = INTER(500)(subSize * 1.3);
      ctx.fillStyle = rgba(p.ink, 0.5);
      ctx.textAlign = 'center';
      ctx.fillText('Sem dados — use uma linha "Rótulo, valor" por barra', w / 2, h / 2);
      return;
    }

    const chartTop = top + titleSize * 0.2 + subSize * 2 + m * 0.06;
    const chartBottom = h - (portrait ? h * 0.09 : h * 0.1);
    const valSize = m * clamp(0.034 * Math.sqrt(6 / Math.max(n, 1)), 0.016, 0.04);
    const labSize = valSize * 0.82;
    const tickSize = m * 0.017;
    const fmtV = (v, d) => `${p.prefix}${fmt(v, Math.min(2, d.dec), p.compact)}${p.suffix}`;
    const fmtTick = (v) => fmt(v, scale.step % 1 ? Math.min(2, String(scale.step).split('.')[1]?.length || 0) : 0, p.compact);

    const gridIn = ease.outExpo(seg(t, 0.35, 1.4));
    const barCol = (i) => {
      if (p.highlight === 'todas') return p.accent;
      if (p.highlight === 'maior' && i === maxI) return p.accent;
      return mixHex(p.bg, p.ink, p.highlight === 'nenhuma' ? 0.85 : 0.32);
    };
    const growT = (i) => {
      const a = 0.75 + stagger(i, n, Math.min(1.4, 0.16 * n));
      return { a, b: a + 1.3 };
    };

    if (!horizontal) {
      // ---------- barras verticais ----------
      ctx.font = MONO(tickSize);
      const axisW = Math.max(...scale.ticks.map((v) => ctx.measureText(fmtTick(v)).width)) + m * 0.025;
      const x0 = padX + axisW;
      const x1 = w - padX;
      const yLab = chartBottom;
      const plotBot = chartBottom - labSize * 2.2;
      const plotTop = chartTop + valSize * 1.8;
      const yOf = (v) => plotBot - ((v - scale.lo) / (scale.hi - scale.lo)) * (plotBot - plotTop);
      const y0 = yOf(0);

      // Grid + escala.
      ctx.lineWidth = Math.max(1, m * 0.0012);
      scale.ticks.forEach((v, k) => {
        const e = ease.outExpo(seg(t, 0.35 + k * 0.06, 1.4 + k * 0.06)) * (1 - outAll);
        const y = yOf(v);
        ctx.strokeStyle = rgba(p.ink, v === 0 ? 0.28 : 0.08);
        ctx.setLineDash(v === 0 ? [] : [m * 0.004, m * 0.006]);
        ctx.beginPath();
        ctx.moveTo(x0, y);
        ctx.lineTo(x0 + (x1 - x0) * e, y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = MONO(tickSize);
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = rgba(p.ink, 0.4 * e);
        ctx.fillText(fmtTick(v), x0 - m * 0.018, y);
      });

      const slot = (x1 - x0) / n;
      const bw = slot * clamp(0.62 - n * 0.008, 0.45, 0.62);
      items.forEach((d, i) => {
        const { a, b } = growT(i);
        const grow = spring(seg(t, a, b), 0.18) * (1 - out(i));
        const cnt = ease.outExpo(seg(t, a, b - 0.2));
        const cx = x0 + slot * (i + 0.5);
        const yv = yOf(d.v);
        const top2 = y0 + (yv - y0) * grow;
        const hgt = top2 - y0;
        const col = barCol(i);
        const r = Math.min(bw * 0.12, m * 0.012);
        if (Math.abs(hgt) > 0.5) {
          ctx.fillStyle = col;
          ctx.beginPath();
          if (hgt < 0) ctx.roundRect(cx - bw / 2, top2, bw, -hgt, [r, r, 0, 0]);
          else ctx.roundRect(cx - bw / 2, y0, bw, hgt, [0, 0, r, r]);
          ctx.fill();
          // Brilho sutil no topo da barra.
          const gg = ctx.createLinearGradient(0, top2, 0, y0);
          gg.addColorStop(0, 'rgba(255,255,255,0.1)');
          gg.addColorStop(0.35, 'rgba(255,255,255,0)');
          ctx.fillStyle = gg;
          ctx.fill();
        }
        // Valor contando, acompanha o topo da barra.
        const vIn = ease.outCubic(seg(t, a + 0.05, a + 0.5)) * (1 - out(i));
        if (vIn > 0.001) {
          const vs = fitText(ctx, fmtV(d.v, d), slot * 0.96, valSize, MONO);
          ctx.textAlign = 'center';
          ctx.textBaseline = d.v >= 0 ? 'bottom' : 'top';
          ctx.fillStyle = i === maxI && p.highlight === 'maior' ? p.accent : rgba(p.ink, 0.92);
          ctx.globalAlpha = vIn;
          ctx.fillText(fmtV(d.v * cnt, d), cx, top2 + (d.v >= 0 ? -vs * 0.45 : vs * 0.45));
          ctx.globalAlpha = 1;
        }
        // Rótulo.
        const lIn = ease.outExpo(seg(t, a - 0.15, a + 0.6)) * (1 - out(i));
        ctx.font = INTER(600)(labSize);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = rgba(p.ink, 0.62 * lIn);
        ctx.fillText(ellipsize(ctx, d.label, slot * 0.94), cx, yLab + (1 - lIn) * labSize * 0.8);
      });
    } else {
      // ---------- barras horizontais ----------
      const rowH = (chartBottom - chartTop) / n;
      const bh = rowH * clamp(0.36 + 0.02 * n, 0.4, 0.6);
      const labOnTop = portrait || n > 9; // rótulo acima da barra quando falta largura
      ctx.font = INTER(600)(labSize);
      const labW = labOnTop ? 0 : Math.min(w * 0.22, Math.max(...items.map((d) => ctx.measureText(d.label).width)) + m * 0.03);
      const x0 = padX + labW;
      ctx.font = MONO(valSize);
      const valW = Math.max(...items.map((d) => ctx.measureText(fmtV(d.v, d)).width)) + m * 0.03;
      const x1 = w - padX - valW;
      const xOf = (v) => x0 + ((v - scale.lo) / (scale.hi - scale.lo)) * (x1 - x0);
      const xz = xOf(0);
      const lsz = labOnTop ? Math.min(labSize, rowH * 0.3) : labSize;
      const bh2 = labOnTop ? Math.min(bh, rowH - lsz * 1.6) : bh;

      ctx.lineWidth = Math.max(1, m * 0.0012);
      scale.ticks.forEach((v, k) => {
        const e = ease.outExpo(seg(t, 0.35 + k * 0.06, 1.4 + k * 0.06)) * (1 - outAll);
        const x = xOf(v);
        ctx.strokeStyle = rgba(p.ink, v === 0 ? 0.28 : 0.08);
        ctx.setLineDash(v === 0 ? [] : [m * 0.004, m * 0.006]);
        ctx.beginPath();
        ctx.moveTo(x, chartTop - m * 0.01);
        ctx.lineTo(x, chartTop - m * 0.01 + (chartBottom - chartTop + m * 0.01) * e);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = MONO(tickSize);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = rgba(p.ink, 0.4 * e);
        ctx.fillText(fmtTick(v), x, chartBottom + m * 0.012);
      });

      items.forEach((d, i) => {
        const { a, b } = growT(i);
        const grow = spring(seg(t, a, b), 0.18) * (1 - out(i));
        const cnt = ease.outExpo(seg(t, a, b - 0.2));
        const cy = chartTop + rowH * (i + 0.5) + (labOnTop ? lsz * 0.55 : 0);
        const xe = xz + (xOf(d.v) - xz) * grow;
        const wd = xe - xz;
        const r = Math.min(bh2 * 0.22, m * 0.012);
        if (Math.abs(wd) > 0.5) {
          ctx.fillStyle = barCol(i);
          ctx.beginPath();
          if (wd > 0) ctx.roundRect(xz, cy - bh2 / 2, wd, bh2, [0, r, r, 0]);
          else ctx.roundRect(xe, cy - bh2 / 2, -wd, bh2, [r, 0, 0, r]);
          ctx.fill();
        }
        const lIn = ease.outExpo(seg(t, a - 0.15, a + 0.6)) * (1 - out(i));
        ctx.font = INTER(600)(lsz);
        ctx.fillStyle = rgba(p.ink, 0.7 * lIn);
        if (labOnTop) {
          ctx.textAlign = 'left';
          ctx.textBaseline = 'alphabetic';
          ctx.fillText(ellipsize(ctx, d.label, x1 - xz), xz + (1 - lIn) * -lsz, cy - bh2 / 2 - lsz * 0.45);
        } else {
          ctx.textAlign = 'right';
          ctx.textBaseline = 'middle';
          ctx.fillText(ellipsize(ctx, d.label, labW - m * 0.03), x0 - m * 0.025 + (1 - lIn) * -lsz, cy);
        }
        const vIn = ease.outCubic(seg(t, a + 0.05, a + 0.5)) * (1 - out(i));
        if (vIn > 0.001) {
          ctx.font = MONO(Math.min(valSize, bh2 * 0.9));
          ctx.textBaseline = 'middle';
          ctx.textAlign = d.v >= 0 ? 'left' : 'right';
          ctx.fillStyle = i === maxI && p.highlight === 'maior' ? p.accent : rgba(p.ink, 0.92);
          ctx.globalAlpha = vIn;
          ctx.fillText(fmtV(d.v * cnt, d), xe + (d.v >= 0 ? 1 : -1) * m * 0.015, cy);
          ctx.globalAlpha = 1;
        }
      });
    }
  },
};
