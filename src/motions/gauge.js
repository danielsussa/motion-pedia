import { TAU, clamp, lerp, seg, ease, spring, stagger, rgba } from '../lib/anim.js';

// ---------- helpers locais ----------

// Número em texto livre ("1.234,5", "82", "7,5") → { v, dec }. Vírgula = decimal (pt-BR).
function parseNum(raw) {
  let s = String(raw ?? '').replace(/[^\d.,-]/g, '');
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
  if (!fmtCache.has(dec)) fmtCache.set(dec, new Intl.NumberFormat('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec }));
  return fmtCache.get(dec).format(v);
}

function ellipsize(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxW) s = s.slice(0, -1);
  return `${s.trimEnd()}…`;
}

const INTER = (wt) => (s) => `${wt} ${s}px Inter, system-ui, sans-serif`;
const MONO = (wt) => (s) => `${wt} ${s}px 'JetBrains Mono', ui-monospace, monospace`;

// Fundo estático (cor + halo do destaque + vinheta) pintado uma vez no setup.
function bakeBg(w, h, px, bg, accent) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * px));
  c.height = Math.max(1, Math.round(h * px));
  const g = c.getContext('2d');
  g.scale(px, px);
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  const halo = g.createRadialGradient(w * 0.5, h * 0.55, 0, w * 0.5, h * 0.55, Math.max(w, h) * 0.6);
  halo.addColorStop(0, rgba(accent, 0.07));
  halo.addColorStop(1, rgba(accent, 0));
  g.fillStyle = halo;
  g.fillRect(0, 0, w, h);
  const vig = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.75);
  vig.addColorStop(0.4, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.32)');
  g.fillStyle = vig;
  g.fillRect(0, 0, w, h);
  return c;
}

// Título + subtítulo com traço de destaque. Devolve a métrica do layout.
function drawHeader(ctx, t, w, h, p, outAll) {
  const m = Math.min(w, h);
  const portrait = h > w * 1.1;
  const wide = w > h * 1.25;
  const padX = wide ? w * 0.07 : w * 0.08;
  const top = portrait ? h * 0.1 : h * 0.11;
  const titleSize = m * (portrait ? 0.064 : 0.054);
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
  ctx.globalAlpha = 1 - outAll;
  let tSize = titleSize;
  ctx.font = INTER(800)(tSize);
  const tw = ctx.measureText(p.title).width;
  if (tw > w - padX * 2) {
    tSize *= (w - padX * 2) / tw;
    ctx.font = INTER(800)(tSize);
  }
  ctx.letterSpacing = `${-tSize * 0.02}px`;
  ctx.fillStyle = p.ink;
  ctx.fillText(p.title, padX, top + tSize * 0.2 + (1 - titleIn) * tSize * 1.2);
  ctx.letterSpacing = '0px';
  ctx.font = INTER(500)(subSize);
  ctx.fillStyle = rgba(p.ink, 0.55 * subIn);
  ctx.fillText(ellipsize(ctx, p.subtitle, w - padX * 2), padX, top + tSize * 0.2 + subSize * 1.9 + (1 - subIn) * subSize * 2);
  ctx.restore();
  ctx.globalAlpha = 1;
  return { m, portrait, wide, padX, top, titleSize, subSize, bot: top + titleSize * 0.2 + subSize * 2.4 };
}

// "Nome da zona, limite superior" por linha.
function parseZones(text, min, max) {
  const out = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const l = line.trim();
    if (!l || l.startsWith('#')) continue;
    const m = l.match(/^(.*?)(?:,\s+|\s*[;\t|:]\s*)([^;\t|:]*\d[^;\t|:]*)$/) || l.match(/^(.*\S)\s+(\S*\d\S*)$/);
    if (!m) continue;
    const n = parseNum(m[2]);
    if (n) out.push({ label: m[1].trim(), to: clamp(n.v, min, max) });
  }
  out.sort((a, b) => a.to - b.to);
  let from = min;
  const zones = [];
  for (const z of out) {
    if (z.to <= from) continue;
    zones.push({ label: z.label, from, to: z.to });
    from = z.to;
  }
  if (from < max) zones.push({ label: '', from, to: max });
  return zones;
}

function niceStep(range, target = 10) {
  const raw = range / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= raw * 0.999);
}

const A0 = (150 * Math.PI) / 180;
const SWEEP = (240 * Math.PI) / 180;

const DEFAULT_ZONES = `Crítico, 30
Atenção, 55
Bom, 80
Excelente, 100`;

export default {
  id: 'gauge',
  title: 'Gauge',
  description: 'Medidor de 240° que se desenha com zonas e escala; o ponteiro testa o fundo de escala e assenta no valor com mola.',
  category: 'dados',
  tags: ['dados', 'ui'],
  duration: 8,
  poster: 4.6,

  params: {
    title: { type: 'text', label: 'Título', default: 'Satisfação do cliente' },
    subtitle: { type: 'text', label: 'Subtítulo', default: 'NPS consolidado · 3º trimestre' },
    value: { type: 'range', label: 'Valor', min: -1000, max: 1000, step: 0.1, default: 74 },
    min: { type: 'range', label: 'Mínimo', min: -1000, max: 1000, step: 1, default: 0 },
    max: { type: 'range', label: 'Máximo', min: -1000, max: 1000, step: 1, default: 100 },
    unit: { type: 'text', label: 'Unidade', default: 'pts' },
    zones: { type: 'textarea', label: 'Zonas (Nome, até)', rows: 5, default: DEFAULT_ZONES },
    live: { type: 'boolean', label: 'Ponteiro vivo (oscila)', default: true },
    accent: { type: 'color', label: 'Destaque', default: '#ffb547' },
    ink: { type: 'color', label: 'Texto', default: '#f2efe8' },
    bg: { type: 'color', label: 'Fundo', default: '#0f0e0c' },
  },

  setup({ w, h, px, p }) {
    let min = Number(p.min);
    let max = Number(p.max);
    if (!(max > min)) max = min + 100;
    const zones = parseZones(p.zones, min, max);
    const step = niceStep(max - min);
    const dec = Math.min(2, (String(p.value).split('.')[1] || '').length);
    return { min, max, zones, step, dec, bgc: bakeBg(w, h, px, p.bg, p.accent) };
  },

  render(ctx, t, { w, h, p, duration, state }) {
    const { min, max, zones, step, dec, bgc } = state;
    ctx.drawImage(bgc, 0, 0, w, h);
    const OUT = duration - 1.2;
    const outAll = ease.inCubic(seg(t, OUT + 0.35, duration - 0.08));
    const fade = 1 - outAll;
    const H = drawHeader(ctx, t, w, h, p, outAll);
    const { m, portrait, padX } = H;
    const range = max - min;
    const value = clamp(Number(p.value), min, max);

    // ---------- layout ----------
    const areaTop = H.bot + m * (portrait ? 0.08 : 0.05);
    const areaBot = h - h * (portrait ? 0.1 : 0.07);
    const R = Math.min((areaBot - areaTop) / 1.95, (w - padX * 2) / 2.45);
    const cx = w / 2;
    const cy = areaTop + R * 1.12 + Math.max(0, (areaBot - areaTop - R * 1.95) / 2);
    const thick = R * 0.085;
    const rBand = R - thick / 2;
    const angOf = (v) => A0 + ((v - min) / range) * SWEEP;

    // ---------- ponteiro: teste de fundo de escala → mola até o valor → vivo ----------
    const T_UP = 1.5;
    const T_SET = 2.35;
    let v = lerp(min, max, ease.inOutCubic(seg(t, T_UP, T_SET)));
    if (t > T_SET) v = lerp(max, value, spring(seg(t, T_SET, T_SET + 1.7), 0.32));
    if (p.live) {
      const k = ease.inOutSine(seg(t, T_SET + 1.2, T_SET + 2.2)) * (1 - seg(t, OUT - 0.2, OUT));
      v += k * range * 0.008 * (0.6 * Math.sin(t * 5.1) + 0.4 * Math.sin(t * 8.3 + 1.3));
    }
    v = lerp(v, min, ease.inOutCubic(seg(t, OUT, OUT + 0.8)));
    const vc = clamp(v, min, max);
    const zIdx = zones.findIndex((z) => vc <= z.to);

    // ---------- faixa de zonas ----------
    const sweepK = ease.outExpo(seg(t, 0.35, 1.7));
    const aEnd = A0 + SWEEP * sweepK;
    const gapA = Math.min(0.025, (m * 0.006) / R);
    ctx.lineCap = 'butt';
    ctx.lineWidth = thick;
    zones.forEach((z, i) => {
      const a0 = angOf(z.from) + (i ? gapA / 2 : 0);
      const a1 = Math.min(angOf(z.to) - (i < zones.length - 1 ? gapA / 2 : 0), aEnd);
      if (a1 <= a0) return;
      const on = i === zIdx && t > T_SET;
      ctx.strokeStyle = rgba(p.ink, (0.08 + (0.1 * i) / Math.max(1, zones.length - 1) + (on ? 0.08 : 0)) * fade);
      ctx.beginPath();
      ctx.arc(cx, cy, rBand, a0, a1);
      ctx.stroke();
    });
    // preenchimento até o ponteiro, respeitando os vãos entre zonas
    if (t > T_UP - 0.1) {
      const aV = Math.min(angOf(vc), aEnd);
      ctx.strokeStyle = rgba(p.accent, fade);
      ctx.lineWidth = thick;
      ctx.beginPath();
      zones.forEach((z, i) => {
        const a0 = angOf(z.from) + (i ? gapA / 2 : 0);
        const a1 = Math.min(angOf(z.to) - (i < zones.length - 1 ? gapA / 2 : 0), aV);
        if (a1 <= a0 + 0.001) return;
        ctx.moveTo(cx + Math.cos(a0) * rBand, cy + Math.sin(a0) * rBand);
        ctx.arc(cx, cy, rBand, a0, a1);
      });
      ctx.stroke();
    }

    // ---------- escala ----------
    const rT = R - thick - R * 0.035;
    const nMajor = Math.round(range / step);
    const minor = step / 5;
    const nMinor = Math.round(range / minor);
    ctx.lineWidth = Math.max(1, m * 0.0016);
    ctx.strokeStyle = rgba(p.ink, 0.28 * fade);
    ctx.beginPath();
    for (let i = 0; i <= nMinor; i++) {
      if (i % 5 === 0) continue;
      const e = seg(t, 0.6 + stagger(i, nMinor, 1.0), 0.9 + stagger(i, nMinor, 1.0));
      if (e <= 0) continue;
      const a = angOf(min + i * minor);
      const L = R * 0.03 * e;
      ctx.moveTo(cx + Math.cos(a) * rT, cy + Math.sin(a) * rT);
      ctx.lineTo(cx + Math.cos(a) * (rT - L), cy + Math.sin(a) * (rT - L));
    }
    ctx.stroke();
    ctx.lineWidth = Math.max(1, m * 0.003);
    ctx.strokeStyle = rgba(p.ink, 0.7 * fade);
    ctx.beginPath();
    for (let i = 0; i <= nMajor; i++) {
      const e = ease.outCubic(seg(t, 0.6 + stagger(i, nMajor, 1.0), 1.0 + stagger(i, nMajor, 1.0)));
      if (e <= 0) continue;
      const a = angOf(Math.min(max, min + i * step));
      const L = R * 0.065 * e;
      ctx.moveTo(cx + Math.cos(a) * rT, cy + Math.sin(a) * rT);
      ctx.lineTo(cx + Math.cos(a) * (rT - L), cy + Math.sin(a) * (rT - L));
    }
    ctx.stroke();
    const ts = Math.max(m * 0.015, R * 0.05);
    ctx.font = MONO(500)(ts);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const stepDec = step >= 1 ? 0 : Math.ceil(-Math.log10(step) - 1e-9);
    const labEvery = nMajor > 12 ? 2 : 1;
    for (let i = 0; i <= nMajor; i += labEvery) {
      const e = ease.outCubic(seg(t, 0.8 + stagger(i, nMajor, 1.0), 1.3 + stagger(i, nMajor, 1.0)));
      if (e <= 0.01) continue;
      const val = Math.min(max, min + i * step);
      const a = angOf(val);
      const rl = rT - R * 0.065 - ts * 1.25;
      ctx.fillStyle = rgba(p.ink, 0.5 * e * fade);
      ctx.fillText(fmt(val, stepDec), cx + Math.cos(a) * rl, cy + Math.sin(a) * rl);
    }

    // nomes das zonas por fora do arco
    const zs = Math.max(m * 0.0145, R * 0.045);
    ctx.font = INTER(700)(zs);
    ctx.letterSpacing = `${zs * 0.12}px`;
    zones.forEach((z, i) => {
      if (!z.label) return;
      const e = ease.outExpo(seg(t, 1.2 + i * 0.1, 2.0 + i * 0.1)) * fade;
      if (e <= 0.01) return;
      const a = angOf((z.from + z.to) / 2);
      const rl = R + zs * 1.3 + (1 - e) * zs;
      const on = i === zIdx && t > T_SET;
      const c = Math.cos(a);
      ctx.textAlign = Math.abs(c) < 0.3 ? 'center' : c > 0 ? 'left' : 'right';
      ctx.fillStyle = on ? rgba(p.accent, e) : rgba(p.ink, 0.42 * e);
      ctx.fillText(z.label.toUpperCase(), cx + c * rl, cy + Math.sin(a) * rl);
    });
    ctx.letterSpacing = '0px';

    // ---------- ponteiro ----------
    const nIn = ease.outBack(seg(t, 1.0, 1.6)) * (1 - ease.inCubic(seg(t, OUT + 0.6, OUT + 1.0)));
    if (nIn > 0.001) {
      const a = angOf(vc);
      const len = (rT - R * 0.02) * nIn;
      const tail = R * 0.14 * nIn;
      const bw = R * 0.026 * nIn;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const needle = (ox, oy) => {
        ctx.beginPath();
        ctx.moveTo(cx + ox + ca * len, cy + oy + sa * len);
        ctx.lineTo(cx + ox - sa * bw, cy + oy + ca * bw);
        ctx.lineTo(cx + ox - ca * tail - sa * bw * 0.6, cy + oy - sa * tail + ca * bw * 0.6);
        ctx.lineTo(cx + ox - ca * tail + sa * bw * 0.6, cy + oy - sa * tail - ca * bw * 0.6);
        ctx.lineTo(cx + ox + sa * bw, cy + oy - ca * bw);
        ctx.closePath();
      };
      ctx.fillStyle = rgba('#000000', 0.35 * fade);
      needle(R * 0.012, R * 0.02);
      ctx.fill();
      ctx.fillStyle = rgba(p.ink, fade);
      needle(0, 0);
      ctx.fill();
      ctx.fillStyle = p.bg;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.055 * nIn, 0, TAU);
      ctx.fill();
      ctx.lineWidth = R * 0.018 * nIn;
      ctx.strokeStyle = rgba(p.accent, fade);
      ctx.stroke();
    }

    // ---------- leitura ----------
    const rIn = ease.outExpo(seg(t, 1.3, 2.3)) * fade;
    if (rIn > 0.01) {
      const big = R * 0.3;
      const y = cy + R * 0.5;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.globalAlpha = rIn;
      const num = fmt(vc, dec);
      ctx.font = INTER(800)(big);
      ctx.letterSpacing = `${-big * 0.03}px`;
      const nw = ctx.measureText(num).width;
      ctx.font = INTER(600)(big * 0.3);
      ctx.letterSpacing = '0px';
      const uw = p.unit ? ctx.measureText(p.unit).width + big * 0.1 : 0;
      const x0 = cx - (nw + uw) / 2;
      ctx.textAlign = 'left';
      ctx.font = INTER(800)(big);
      ctx.letterSpacing = `${-big * 0.03}px`;
      ctx.fillStyle = p.ink;
      ctx.fillText(num, x0, y + (1 - rIn) * big * 0.3);
      ctx.letterSpacing = '0px';
      if (p.unit) {
        ctx.font = INTER(600)(big * 0.3);
        ctx.fillStyle = rgba(p.ink, 0.5);
        ctx.fillText(p.unit, x0 + nw + big * 0.1, y + (1 - rIn) * big * 0.3);
      }
      // zona atual
      const z = zones[zIdx];
      const zIn = ease.outExpo(seg(t, T_SET + 0.6, T_SET + 1.5)) * fade;
      if (z && z.label && zIn > 0.01) {
        const ps = big * 0.22;
        ctx.font = INTER(700)(ps);
        ctx.letterSpacing = `${ps * 0.1}px`;
        const label = z.label.toUpperCase();
        const lw = ctx.measureText(label).width;
        const ph = ps * 2;
        const py = y + big * 0.32 + (1 - zIn) * ps;
        ctx.globalAlpha = zIn;
        ctx.fillStyle = rgba(p.accent, 0.16);
        ctx.beginPath();
        ctx.roundRect(cx - lw / 2 - ps, py, lw + ps * 2, ph, ph / 2);
        ctx.fill();
        ctx.fillStyle = p.accent;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, cx + ps * 0.05, py + ph / 2 + ps * 0.04);
        ctx.letterSpacing = '0px';
      }
      ctx.globalAlpha = 1;
    }
  },
};
