import { clamp, lerp, seg, ease, spring, stagger, rgba, mixHex } from '../lib/anim.js';

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

// "Etapa, valor" por linha (também ; tab | :).
function parseData(text) {
  const out = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const l = line.trim();
    if (!l || l.startsWith('#')) continue;
    const m = l.match(/^(.*?)(?:,\s+|\s*[;\t|:]\s*)([^;\t|:]*\d[^;\t|:]*)$/) || l.match(/^(.*\S)\s+(\S*\d\S*)$/);
    if (!m) continue;
    const n = parseNum(m[2]);
    if (n && n.v >= 0) out.push({ label: m[1].trim() || '—', v: n.v, dec: Math.min(2, n.dec) });
  }
  return out;
}

const fmtCache = new Map();
function fmt(v, dec = 0) {
  if (!fmtCache.has(dec)) fmtCache.set(dec, new Intl.NumberFormat('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec }));
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

const DEFAULT_DATA = `Site visits, 48.200
Sign-ups, 12.650
Activation, 6.380
Free trial, 2.910
Subscription, 1.240`;

export default {
  id: 'funnel',
  title: 'Funnel',
  description: 'Conversion funnel: stages fill top to bottom, with counting values, percent of top and the drop-off between stages.',
  category: 'dados',
  tags: ['data', 'ui'],
  duration: 8,
  poster: 6.2,

  params: {
    title: { type: 'text', label: 'Title', default: 'Sales funnel' },
    subtitle: { type: 'text', label: 'Subtitle', default: 'Visitor journey · last 30 days' },
    data: { type: 'textarea', label: 'Data (Stage, value)', rows: 7, default: DEFAULT_DATA },
    scale: { type: 'select', label: 'Width', options: ['suave', 'proporcional'], default: 'suave' },
    between: { type: 'select', label: 'Between stages', options: ['conversão', 'queda', 'nada'], default: 'conversão' },
    accent: { type: 'color', label: 'Accent', default: '#ff5a36' },
    ink: { type: 'color', label: 'Text', default: '#f2efe8' },
    bg: { type: 'color', label: 'Background', default: '#0e0f12' },
    transparent: { type: 'boolean', label: 'Transparent background', default: false },
  },

  setup({ w, h, px, p }) {
    const items = parseData(p.data);
    const max = items.reduce((s, d) => Math.max(s, d.v), 0) || 1;
    const top = items.length ? items[0].v || max : max;
    for (const d of items) {
      const f = d.v / max;
      d.wf = p.scale === 'proporcional' ? f : 0.14 + 0.86 * Math.sqrt(f);
      d.ofTop = d.v / (top || 1);
    }
    return { items, bgc: p.transparent ? null : bgBuffer(w, h, px, p.bg) };
  },

  render(ctx, t, { w, h, p, duration, state }) {
    const { items, bgc } = state;
    if (bgc) ctx.drawImage(bgc, 0, 0, w, h);
    const n = items.length;
    const m = Math.min(w, h);
    const ar = w / h;
    const portrait = ar < 0.9;
    const wide = ar > 1.3;

    const OUT = duration - 0.9;
    const outAll = ease.inCubic(seg(t, OUT + 0.1, duration - 0.08));

    // ---------- cabeçalho ----------
    const padX = wide ? w * 0.07 : w * 0.08;
    const top = portrait ? h * 0.09 : h * 0.11;
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

    if (!n) {
      ctx.font = INTER(500)(subSize * 1.3);
      ctx.fillStyle = rgba(p.ink, 0.5);
      ctx.textAlign = 'center';
      ctx.fillText('No data — use one "Stage, value" line per stage', w / 2, h / 2);
      return;
    }

    // ---------- layout ----------
    // wide/quadrado: [rótulo | funil | valor]; retrato: rótulo e valor numa linha acima de cada barra
    const stacked = ar < 1.05;
    const areaTop = top + titleSize * 0.2 + subSize * 2 + m * (portrait ? 0.07 : 0.06);
    const footH = m * 0.085;
    const areaBot = h - h * (portrait ? 0.07 : 0.08) - footH;
    const rowH = (areaBot - areaTop) / n;
    const gapF = stacked ? 0.18 : 0.3; // fração da linha usada como vão entre barras
    const lsz = clamp(rowH * (stacked ? 0.2 : 0.2), m * 0.018, m * (portrait ? 0.036 : 0.03));
    const labelRowH = stacked ? lsz * 1.9 : 0;
    const barH = rowH * (1 - gapF) - labelRowH;
    const labW = stacked ? 0 : (w - padX * 2) * 0.24;
    const valW = stacked ? 0 : (w - padX * 2) * 0.2;
    const fx0 = padX + labW + (stacked ? 0 : m * 0.03);
    const fx1 = w - padX - valW - (stacked ? 0 : m * 0.03);
    const fcx = (fx0 + fx1) / 2;
    const fW = fx1 - fx0;
    const rad = Math.min(barH * 0.18, m * 0.012);

    // ---------- tempos ----------
    const D0 = 0.8;
    const spread = Math.min(3.0, 0.62 * (n - 1));
    const stageAt = (i) => D0 + stagger(i, n, spread);
    const outRow = (i) => ease.inCubic(seg(t, OUT + stagger(i, n, 0.25), OUT + 0.6 + stagger(i, n, 0.25)));

    const tone = (i) => 0.78 - (0.46 * i) / Math.max(1, n - 2);
    const col = (i) => (i === n - 1 && n > 1 ? p.accent : mixHex(p.bg, p.ink, tone(i)));

    const barY = (i) => areaTop + rowH * i + labelRowH;
    const grow = (i) => ease.outExpo(seg(t, stageAt(i), stageAt(i) + 1.0));

    // conectores (trapézios) entre barras: atrás de tudo
    for (let i = 0; i < n - 1; i++) {
      const a = items[i], b = items[i + 1];
      const k = ease.outCubic(seg(t, stageAt(i + 1) - 0.1, stageAt(i + 1) + 0.6));
      const ca = 1 - outRow(i + 1);
      if (k <= 0.005 || ca <= 0.005) continue;
      const y0 = barY(i) + barH;
      const y1 = barY(i + 1);
      const wa = fW * a.wf * grow(i);
      const wb = fW * b.wf * grow(i + 1);
      const yk = lerp(y0, y1, k);
      const wk = lerp(wa, wb, k);
      const g = ctx.createLinearGradient(0, y0, 0, y1);
      g.addColorStop(0, rgba(p.ink, 0.1));
      g.addColorStop(1, rgba(p.ink, 0.04));
      ctx.fillStyle = g;
      ctx.globalAlpha = ca;
      ctx.beginPath();
      ctx.moveTo(fcx - wa / 2, y0);
      ctx.lineTo(fcx + wa / 2, y0);
      ctx.lineTo(fcx + wk / 2, yk);
      ctx.lineTo(fcx - wk / 2, yk);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // barras + textos
    for (let i = 0; i < n; i++) {
      const d = items[i];
      const e = grow(i);
      const at = stageAt(i);
      const fadeIn = ease.outExpo(seg(t, at - 0.05, at + 0.7)) * (1 - outRow(i));
      if (fadeIn <= 0.005) continue;
      const y = barY(i);
      const bw = Math.max(rad * 2, fW * d.wf * e);
      const last = i === n - 1 && n > 1;

      // barra
      ctx.globalAlpha = clamp(fadeIn * 2);
      ctx.fillStyle = col(i);
      ctx.beginPath();
      ctx.roundRect(fcx - bw / 2, y, bw, barH, rad);
      ctx.fill();
      // brilho no topo da barra
      ctx.fillStyle = rgba('#ffffff', last ? 0.16 : 0.08);
      ctx.fillRect(fcx - bw / 2 + rad, y, Math.max(0, bw - rad * 2), Math.max(1, m * 0.002));
      ctx.globalAlpha = 1;

      // valor contando
      const cnt = ease.outExpo(seg(t, at, at + 1.3));
      const vTxt = fmt(d.v * cnt, d.dec);
      const sTxt = i === 0 ? 'of total' : `${pct(d.ofTop)} of top`;
      const slide = (1 - ease.outExpo(seg(t, at - 0.05, at + 0.7))) * m * 0.03;
      if (stacked) {
        const ly = y - lsz * 0.55;
        ctx.globalAlpha = fadeIn;
        ctx.textBaseline = 'alphabetic';
        ctx.font = MONO(600)(lsz);
        const vw = ctx.measureText(fmt(d.v, d.dec)).width;
        ctx.textAlign = 'right';
        ctx.fillStyle = last ? p.accent : p.ink;
        ctx.fillText(vTxt, fx1 - slide, ly);
        ctx.textAlign = 'left';
        ctx.font = INTER(last ? 700 : 600)(lsz);
        ctx.fillStyle = rgba(p.ink, last ? 1 : 0.85);
        ctx.fillText(ellipsize(ctx, d.label, fW - vw - lsz * 1.5), fx0 + slide, ly);
        // % do topo dentro da barra, quando cabe
        if (i > 0) {
          ctx.font = INTER(600)(lsz * 0.78);
          const tw = ctx.measureText(`${pct(d.ofTop)} of top`).width;
          if (tw < bw - lsz * 1.2 && barH > lsz * 1.2) {
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = last ? rgba('#ffffff', 0.92) : tone(i) > 0.45 ? rgba(p.bg, 0.8) : rgba(p.ink, 0.8);
            ctx.fillText(`${pct(d.ofTop)} of top`, fcx, y + barH / 2 + lsz * 0.04);
          }
        }
        ctx.globalAlpha = 1;
      } else {
        const cy = y + barH / 2;
        ctx.globalAlpha = fadeIn;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.font = INTER(last ? 700 : 600)(lsz);
        ctx.fillStyle = rgba(p.ink, last ? 1 : 0.85);
        ctx.fillText(ellipsize(ctx, d.label, labW), padX + slide, cy);
        ctx.textAlign = 'right';
        const vs = fitFont(ctx, fmt(d.v, d.dec), valW, lsz * 1.25, MONO(600));
        ctx.font = MONO(600)(vs);
        ctx.fillStyle = last ? p.accent : p.ink;
        ctx.fillText(vTxt, w - padX - slide, cy - lsz * 0.38);
        ctx.font = INTER(500)(lsz * 0.68);
        ctx.fillStyle = rgba(p.ink, 0.5);
        ctx.fillText(sTxt, w - padX - slide, cy + lsz * 0.72);
        ctx.globalAlpha = 1;
      }
    }

    // pílulas entre etapas (conversão etapa→etapa ou queda)
    if (p.between !== 'nada') {
      const cs = lsz * 0.72;
      ctx.font = INTER(700)(cs);
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      for (let i = 0; i < n - 1; i++) {
        const a = items[i], b = items[i + 1];
        const at = stageAt(i + 1) + 0.45;
        const k = spring(seg(t, at, at + 0.8), 0.25);
        const pa = 1 - outRow(i + 1);
        if (k <= 0.01 || pa <= 0.01) continue;
        const f = a.v ? b.v / a.v : 0;
        const txt = p.between === 'queda' ? `↓ ${pct(1 - f)}` : `${pct(f)} advance`;
        const y0 = barY(i) + barH;
        const y1 = barY(i + 1);
        const cy = (y0 + y1) / 2;
        if (y1 - y0 < cs * 1.3) continue;
        const tw = ctx.measureText(txt).width;
        const ph = Math.min(cs * 1.9, (y1 - y0) * 0.9);
        const pw = tw + cs * 1.6;
        ctx.save();
        ctx.translate(fcx, cy);
        ctx.scale(k, k);
        ctx.globalAlpha = pa;
        ctx.fillStyle = mixHex(p.bg, p.ink, 0.1);
        ctx.strokeStyle = rgba(p.accent, 0.55);
        ctx.lineWidth = Math.max(1, m * 0.0015);
        ctx.beginPath();
        ctx.roundRect(-pw / 2, -ph / 2, pw, ph, ph / 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = p.accent;
        ctx.fillText(txt, 0, cs * 0.04);
        ctx.restore();
      }
    }

    // rodapé: conversão total
    if (n > 1) {
      const at = stageAt(n - 1) + 0.9;
      const e = ease.outExpo(seg(t, at, at + 1.0)) * (1 - outAll);
      if (e > 0.01) {
        const conv = items[0].v ? items[n - 1].v / items[0].v : 0;
        const fy = h - h * (portrait ? 0.07 : 0.08) - footH * 0.1;
        const fs = m * (portrait ? 0.03 : 0.026);
        ctx.globalAlpha = e;
        ctx.strokeStyle = rgba(p.ink, 0.12);
        ctx.lineWidth = Math.max(1, m * 0.0012);
        ctx.beginPath();
        ctx.moveTo(padX, fy - footH * 0.62);
        ctx.lineTo(padX + (w - padX * 2) * e, fy - footH * 0.62);
        ctx.stroke();
        ctx.textBaseline = 'alphabetic';
        ctx.textAlign = 'left';
        ctx.font = INTER(500)(fs);
        ctx.fillStyle = rgba(p.ink, 0.6);
        const lab = 'Overall conversion';
        ctx.fillText(lab, padX, fy);
        ctx.textAlign = 'right';
        ctx.font = INTER(800)(fs * 1.5);
        ctx.fillStyle = p.accent;
        const cnt = ease.outExpo(seg(t, at, at + 1.4));
        ctx.fillText(pct(conv * cnt), w - padX, fy + fs * 0.12);
        ctx.font = INTER(500)(fs);
        const pw = ctx.measureText(' ').width;
        ctx.font = INTER(800)(fs * 1.5);
        const vw = ctx.measureText(pct(conv)).width;
        ctx.font = INTER(500)(fs);
        ctx.fillStyle = rgba(p.ink, 0.45);
        const mid = `${items[0].label} → ${items[n - 1].label}`;
        ctx.fillText(ellipsize(ctx, mid, w - padX * 2 - vw - ctx.measureText(lab).width - fs * 3), w - padX - vw - fs - pw, fy);
        ctx.globalAlpha = 1;
      }
    }
  },
};
