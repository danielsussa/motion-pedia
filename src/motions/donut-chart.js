import { TAU, clamp, seg, ease, spring, stagger, rgba, mixHex } from '../lib/anim.js';

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

// "Rótulo, valor" por linha (também ; tab | :). Valores ≤ 0 são ignorados (não cabem numa rosca).
function parseData(text) {
  const out = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const l = line.trim();
    if (!l || l.startsWith('#')) continue;
    const m = l.match(/^(.*?)(?:,\s+|\s*[;\t|:]\s*)([^;\t|:]*\d[^;\t|:]*)$/) || l.match(/^(.*\S)\s+(\S*\d\S*)$/);
    if (!m) continue;
    const n = parseNum(m[2]);
    if (n && n.v > 0) out.push({ label: m[1].trim() || '—', v: n.v, dec: Math.min(2, n.dec) });
  }
  return out;
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

const INTER = (wt) => (s) => `${wt} ${s}px Inter, system-ui, sans-serif`;
const MONO = (s) => `500 ${s}px 'JetBrains Mono', ui-monospace, monospace`;

const DEFAULT_DATA = `Orgânico, 48,2
Pago, 27,1
Indicação, 16,4
Social, 12,6
E-mail, 9,8`;

export default {
  id: 'donut-chart',
  title: 'Donut Chart',
  description: 'Rosca que se desenha fatia a fatia com percentuais no anel, legenda e a fatia de destaque saltando para fora.',
  category: 'dados',
  tags: ['dados', 'ui'],
  duration: 7,
  poster: 4.2,

  params: {
    title: { type: 'text', label: 'Título', default: 'Origem do tráfego' },
    subtitle: { type: 'text', label: 'Subtítulo', default: 'Participação nas visitas · 2025' },
    data: { type: 'textarea', label: 'Dados (Rótulo, valor)', rows: 7, default: DEFAULT_DATA },
    center: { type: 'text', label: 'Rótulo do centro', default: 'Visitas (mil)' },
    show: { type: 'select', label: 'No anel', options: ['percentual', 'valor', 'nada'], default: 'percentual' },
    highlight: { type: 'select', label: 'Destaque', options: ['maior', 'menor', 'primeira', 'última', 'nenhuma'], default: 'maior' },
    thickness: { type: 'range', label: 'Espessura', min: 0.15, max: 0.6, step: 0.01, default: 0.36 },
    accent: { type: 'color', label: 'Destaque', default: '#ff5a36' },
    ink: { type: 'color', label: 'Texto', default: '#f2efe8' },
    bg: { type: 'color', label: 'Fundo', default: '#0e0f12' },
  },

  setup({ p }) {
    const items = parseData(p.data);
    const total = items.reduce((s, d) => s + d.v, 0);
    const dec = items.reduce((m, d) => Math.max(m, d.dec), 0);
    let hi = -1;
    if (items.length) {
      if (p.highlight === 'maior') hi = items.reduce((b, d, i) => (d.v > items[b].v ? i : b), 0);
      else if (p.highlight === 'menor') hi = items.reduce((b, d, i) => (d.v < items[b].v ? i : b), 0);
      else if (p.highlight === 'primeira') hi = 0;
      else if (p.highlight === 'última') hi = items.length - 1;
    }
    let a = -Math.PI / 2;
    for (const d of items) {
      d.frac = d.v / total;
      d.a0 = a;
      a += d.frac * TAU;
      d.a1 = a;
    }
    return { items, total, dec, hi };
  },

  render(ctx, t, { w, h, p, duration, state }) {
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, w, h);
    const vg = ctx.createRadialGradient(w * 0.5, h * 0.4, 0, w * 0.5, h * 0.45, Math.max(w, h) * 0.8);
    vg.addColorStop(0, rgba('#000000', 0));
    vg.addColorStop(1, rgba('#000000', 0.32));
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);

    const { items, total, dec, hi } = state;
    const n = items.length;
    const m = Math.min(w, h);
    const portrait = h > w * 1.1;
    const wide = w > h * 1.25;

    const OUT = duration - 1.15;
    const outAll = ease.inCubic(seg(t, OUT + 0.35, duration - 0.1));

    // ---------- cabeçalho ----------
    const padX = wide ? w * 0.07 : w * 0.08;
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

    if (!n) {
      ctx.font = INTER(500)(subSize * 1.3);
      ctx.fillStyle = rgba(p.ink, 0.5);
      ctx.textAlign = 'center';
      ctx.fillText('Sem dados — use uma linha "Rótulo, valor" por fatia', w / 2, h / 2);
      return;
    }

    // ---------- layout ----------
    const areaTop = top + titleSize * 0.2 + subSize * 2 + m * 0.05;
    const areaBot = h - h * (portrait ? 0.07 : 0.08);
    const legCols = wide ? 1 : n > 4 && !portrait ? 2 : 1;
    const legRows = Math.ceil(n / legCols);
    let cx, cy, R, legX, legY, legW, rowH;
    if (wide) {
      R = Math.min((areaBot - areaTop) * 0.46, w * 0.2);
      cx = padX + R * 1.12;
      cy = (areaTop + areaBot) / 2;
      legX = cx + R * 1.12 + w * 0.07;
      legW = w - padX - legX;
      rowH = Math.min(m * 0.1, (areaBot - areaTop) / Math.max(n, 1));
      legY = cy - (rowH * n) / 2;
    } else {
      rowH = Math.min(m * (portrait ? 0.085 : 0.075), ((areaBot - areaTop) * 0.4) / legRows);
      const legH = rowH * legRows;
      const donutH = areaBot - areaTop - legH - m * 0.05;
      R = Math.min(donutH * 0.47, w * 0.36);
      cx = w / 2;
      cy = areaTop + donutH / 2;
      legX = padX;
      legW = w - padX * 2;
      legY = areaBot - legH;
    }
    const thick = R * clamp(p.thickness, 0.1, 0.8);
    const r0 = R - thick;

    // ---------- tempos ----------
    const D0 = 0.7;
    const spread = Math.min(2.2, 0.38 * n);
    const T_HI = D0 + spread + 0.9; // destaque salta depois do desenho
    const sliceWin = (i) => {
      const a = D0 + stagger(i, n, spread);
      return [a, a + 0.75];
    };
    const outSlice = (i) => ease.inCubic(seg(t, OUT + stagger(n - 1 - i, n, 0.35), OUT + 0.55 + stagger(n - 1 - i, n, 0.35)));
    const pop = hi >= 0 ? spring(seg(t, T_HI, T_HI + 1.1), 0.2) * (1 - ease.inCubic(seg(t, OUT, OUT + 0.5))) : 0;

    // tons do neutro: do mais claro ao mais escuro, pulando o destaque
    const tone = (i) => {
      const j = hi >= 0 && i > hi ? i - 1 : i;
      const k = Math.max(1, n - (hi >= 0 ? 2 : 1));
      return 0.72 - (0.5 * j) / k;
    };
    const col = (i) => (i === hi ? p.accent : mixHex(p.bg, p.ink, tone(i)));

    // trilho sutil
    const trackIn = ease.outExpo(seg(t, 0.3, 1.2)) * (1 - outAll);
    ctx.strokeStyle = rgba(p.ink, 0.06 * trackIn);
    ctx.lineWidth = thick;
    ctx.beginPath();
    ctx.arc(cx, cy, r0 + thick / 2, 0, TAU);
    ctx.stroke();

    const gap = Math.min(0.012 * Math.PI, (m * 0.006) / R); // folga angular entre fatias
    const sweepOf = (i) => {
      const [a, b] = sliceWin(i);
      return ease.outCubic(seg(t, a, b)) * (1 - outSlice(i));
    };

    for (let i = 0; i < n; i++) {
      const d = items[i];
      const k = sweepOf(i);
      if (k <= 0.001) continue;
      const isHi = i === hi;
      const mid = (d.a0 + d.a1) / 2;
      const off = isHi ? R * 0.075 * pop : 0;
      const ox = cx + Math.cos(mid) * off;
      const oy = cy + Math.sin(mid) * off;
      const g = d.frac < 0.999 ? gap : 0;
      const a0 = d.a0 + g / 2;
      const a1 = a0 + Math.max(0, (d.a1 - d.a0 - g) * k);
      const ro = R + (isHi ? R * 0.035 * pop : 0);
      const ri = r0 - (isHi ? R * 0.015 * pop : 0);
      ctx.fillStyle = col(i);
      ctx.beginPath();
      ctx.arc(ox, oy, ro, a0, a1);
      ctx.arc(ox, oy, ri, a1, a0, true);
      ctx.closePath();
      ctx.fill();
      // brilho interno sutil
      if (isHi && pop > 0.01) {
        ctx.strokeStyle = rgba('#ffffff', 0.25 * clamp(pop));
        ctx.lineWidth = Math.max(1, m * 0.002);
        ctx.beginPath();
        ctx.arc(ox, oy, ro - m * 0.002, a0, a1);
        ctx.stroke();
      }
    }

    // rótulos no anel
    if (p.show !== 'nada') {
      const ls = clamp(thick * 0.3, m * 0.016, m * 0.03);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let i = 0; i < n; i++) {
        const d = items[i];
        const [a] = sliceWin(i);
        const e = ease.outCubic(seg(t, a + 0.35, a + 0.8)) * (1 - outSlice(i));
        if (e <= 0.01) continue;
        const txt = p.show === 'valor' ? fmt(d.v, d.dec) : `${fmt(d.frac * 100, d.frac < 0.1 ? 1 : 0)}%`;
        ctx.font = INTER(700)(ls);
        const arcLen = (d.a1 - d.a0) * (r0 + thick / 2);
        if (ctx.measureText(txt).width > arcLen * 0.8 || ls * 1.4 > thick) continue;
        const isHi = i === hi;
        const mid = (d.a0 + d.a1) / 2;
        const off = isHi ? R * 0.075 * pop : 0;
        const rr = r0 + thick / 2 + off + (isHi ? R * 0.01 * pop : 0);
        ctx.fillStyle = isHi ? rgba('#ffffff', e) : tone(i) > 0.42 ? rgba(p.bg, 0.85 * e) : rgba(p.ink, 0.85 * e);
        ctx.fillText(txt, cx + Math.cos(mid) * rr, cy + Math.sin(mid) * rr);
      }
    }

    // centro: total contando
    const cIn = ease.outExpo(seg(t, D0 + 0.1, D0 + 1.2)) * (1 - outAll);
    if (cIn > 0.01) {
      const cnt = ease.outExpo(seg(t, D0, D0 + spread + 0.8));
      const big = fitFont(ctx, fmt(total, dec), r0 * 1.45, r0 * 0.42, INTER(800));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.globalAlpha = cIn;
      ctx.letterSpacing = `${-big * 0.03}px`;
      ctx.fillStyle = p.ink;
      ctx.fillText(fmt(total * cnt, dec), cx, cy + big * 0.3 + (1 - cIn) * big * 0.3);
      ctx.letterSpacing = '0px';
      if (p.center) {
        fitFont(ctx, p.center, r0 * 1.4, Math.max(big * 0.3, m * 0.022), INTER(600));
        ctx.fillStyle = rgba(p.ink, 0.5);
        ctx.fillText(p.center, cx, cy + big * 0.3 + Math.max(big * 0.3, m * 0.022) * 1.8);
      }
      ctx.globalAlpha = 1;
    }

    // ---------- legenda ----------
    const lsz = Math.min(rowH * 0.38, m * 0.032);
    const colW = legW / legCols;
    for (let i = 0; i < n; i++) {
      const d = items[i];
      const [a] = sliceWin(i);
      const e = ease.outExpo(seg(t, a - 0.1, a + 0.7)) * (1 - outSlice(i));
      if (e <= 0.01) continue;
      const isHi = i === hi;
      const cI = legCols === 1 ? 0 : i % legCols;
      const rI = legCols === 1 ? i : Math.floor(i / legCols);
      const x = legX + cI * colW + (1 - e) * m * 0.03;
      const y = legY + rowH * (rI + 0.5);
      ctx.globalAlpha = e;
      // linha de destaque atrás do item destacado
      if (isHi && pop > 0.01) {
        ctx.fillStyle = rgba(p.accent, 0.12 * clamp(pop));
        ctx.beginPath();
        ctx.roundRect(x - lsz * 0.6, y - rowH * 0.4, (colW - (legCols > 1 ? m * 0.03 : 0)) * clamp(pop) + lsz * 0.6, rowH * 0.8, rowH * 0.2);
        ctx.fill();
      }
      ctx.fillStyle = col(i);
      ctx.beginPath();
      ctx.roundRect(x, y - lsz * 0.42, lsz * 0.84, lsz * 0.84, lsz * 0.2);
      ctx.fill();
      const vTxt = p.show === 'valor' ? `${fmt(d.frac * 100, 1)}%` : fmt(d.v, d.dec);
      ctx.font = MONO(lsz * 0.9);
      const vW = ctx.measureText(vTxt).width;
      const right = x + colW - (legCols > 1 ? m * 0.04 : 0);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = isHi ? p.accent : rgba(p.ink, 0.6);
      ctx.fillText(vTxt, right, y);
      ctx.textAlign = 'left';
      ctx.font = INTER(isHi ? 700 : 600)(lsz);
      ctx.fillStyle = isHi ? p.ink : rgba(p.ink, 0.82);
      ctx.fillText(ellipsize(ctx, d.label, right - vW - (x + lsz * 1.5) - m * 0.02), x + lsz * 1.5, y);
      ctx.globalAlpha = 1;
    }
  },
};
