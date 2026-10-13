import { TAU, clamp, lerp, seg, ease, rng, rgba } from '../lib/anim.js';

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

function niceStep(range, target = 5) {
  const raw = range / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= raw * 0.999);
}

// Série OHLC + volume: passeio aleatório determinístico (6 sub-passos por candle).
function makeSeries(n, start, vol, trend, seed) {
  const r = rng(seed * 7919 + 13);
  const gauss = () => (r() + r() + r() + r() - 2) * 1.73;
  const out = [];
  let price = Math.max(0.01, start);
  const sv = vol / 100 / Math.sqrt(6);
  for (let i = 0; i < n; i++) {
    const o = price * (1 + gauss() * sv * 0.15);
    let hi = Math.max(o, price);
    let lo = Math.min(o, price);
    price = o;
    for (let k = 0; k < 6; k++) {
      price *= 1 + gauss() * sv + trend / 100 / 6;
      hi = Math.max(hi, price);
      lo = Math.min(lo, price);
    }
    const c = price;
    hi *= 1 + Math.abs(gauss()) * sv * 0.6;
    lo *= 1 - Math.abs(gauss()) * sv * 0.6;
    const move = Math.abs(c - o) / o / (vol / 100);
    out.push({ o, h: hi, l: lo, c, v: (0.45 + r() * 0.7) * (0.6 + move * 1.4) });
  }
  return out;
}

export default {
  id: 'candlestick',
  title: 'Candlestick',
  description: 'A stock candlestick chart: candles enter one by one as the scale adjusts, with moving average, volume and a live price tag.',
  category: 'dados',
  tags: ['data', 'ui', 'broadcast'],
  duration: 9,
  poster: 6.2,

  params: {
    title: { type: 'text', label: 'Ticker', default: 'MPDA3' },
    subtitle: { type: 'text', label: 'Subtitle', default: 'Motion Pedia · intraday, 5 min' },
    count: { type: 'range', label: 'Candles', min: 16, max: 90, step: 1, default: 44 },
    start: { type: 'range', label: 'Starting price', min: 1, max: 500, step: 0.01, default: 32.4 },
    volatility: { type: 'range', label: 'Volatility (%)', min: 0.2, max: 4, step: 0.1, default: 1.1 },
    trend: { type: 'range', label: 'Trend (%/candle)', min: -0.6, max: 0.6, step: 0.01, default: 0.12 },
    seed: { type: 'range', label: 'Seed', min: 1, max: 999, step: 1, default: 7 },
    prefix: { type: 'text', label: 'Price prefix', default: 'R$ ' },
    ma: { type: 'boolean', label: 'Moving average (9)', default: true },
    up: { type: 'color', label: 'Up', default: '#2fd38c' },
    down: { type: 'color', label: 'Down', default: '#ff5d5d' },
    ink: { type: 'color', label: 'Text', default: '#eef0f2' },
    bg: { type: 'color', label: 'Background', default: '#0b0e12' },
  },

  setup({ w, h, px, p }) {
    const n = Math.round(p.count);
    const s = makeSeries(n, p.start, p.volatility, p.trend, Math.round(p.seed));
    // extremos acumulados para a escala que se ajusta enquanto os candles entram
    const minL = [];
    const maxH = [];
    s.forEach((c, i) => {
      minL.push(Math.min(c.l, i ? minL[i - 1] : Infinity));
      maxH.push(Math.max(c.h, i ? maxH[i - 1] : -Infinity));
    });
    const ma = s.map((_, i) => {
      const a = Math.max(0, i - 8);
      let sum = 0;
      for (let j = a; j <= i; j++) sum += s[j].c;
      return sum / (i - a + 1);
    });
    const vmax = Math.max(...s.map((c) => c.v));
    const range = maxH[n - 1] - minL[n - 1];
    const step = niceStep(range * 1.2, 5);
    const dec = s[0].o < 10 ? 3 : 2;
    return { s, n, minL, maxH, ma, vmax, range, step, dec, bgc: bakeBg(w, h, px, p.bg, p.up) };
  },

  render(ctx, t, { w, h, p, duration, state }) {
    const { s, n, minL, maxH, ma, vmax, range, step, dec, bgc } = state;
    ctx.drawImage(bgc, 0, 0, w, h);
    const OUT = duration - 1.1;
    const outAll = ease.inCubic(seg(t, OUT, duration - 0.08));
    const fade = 1 - outAll;
    const H = drawHeader(ctx, t, w, h, { ...p, accent: p.up }, outAll);
    const { m, portrait, padX } = H;

    // ---------- tempo de entrada dos candles ----------
    const T0 = 0.9;
    const T1 = Math.min(6.0, duration - 2.6);
    const FORM = 3; // cada candle se forma ao longo de 3 "slots"
    const rv = (n - 1 + FORM) * seg(t, T0, T1);
    const kOf = (i) => clamp((rv - i) / FORM);
    const live = ease.inOutSine(seg(t, T1 - 0.3, T1 + 0.5));
    // candle corrente (o último que começou a se formar) e o preço que ele mostra
    const last = clamp(Math.floor(rv), 0, n - 1);
    const wob = (s[n - 1].c * p.volatility) / 100;
    const liveC = (c) => c + live * wob * 0.35 * (0.6 * Math.sin(t * 3.1) + 0.4 * Math.sin(t * 5.3 + 1.1));
    const cur = (i) => {
      const c = s[i];
      const k = ease.outCubic(kOf(i));
      const close = i === n - 1 ? liveC(lerp(c.o, c.c, k)) : lerp(c.o, c.c, k);
      return {
        o: c.o,
        c: close,
        h: Math.max(lerp(c.o, c.h, k), close, c.o),
        l: Math.min(lerp(c.o, c.l, k), close, c.o),
      };
    };
    const price = cur(last).c;

    // ---------- escala Y (segue os candles visíveis) ----------
    const fi = Math.floor(rv);
    const fr = rv - fi;
    const at = (arr, i) => arr[clamp(i, 0, n - 1)];
    let lo = lerp(at(minL, fi), at(minL, fi + 1), fr);
    let hi = lerp(at(maxH, fi), at(maxH, fi + 1), fr);
    lo = Math.min(lo, price);
    hi = Math.max(hi, price);
    const minR = range * 0.4;
    if (hi - lo < minR) {
      const mid = (hi + lo) / 2;
      lo = mid - minR / 2;
      hi = mid + minR / 2;
    }
    const padY = (hi - lo) * 0.1;
    lo -= padY;
    hi += padY;

    // ---------- layout ----------
    const ts = m * (portrait ? 0.02 : 0.017);
    ctx.font = MONO(500)(ts);
    const axisW = ctx.measureText(fmt(hi, dec)).width + m * 0.05;
    const x0 = padX;
    const x1 = w - padX - axisW;
    const top = H.bot + m * (portrait ? 0.1 : 0.075);
    const bot = h - h * (portrait ? 0.08 : 0.08);
    const volH = (bot - top) * 0.17;
    const pBot = bot - volH - m * 0.03;
    const yOf = (v) => pBot - ((v - lo) / (hi - lo)) * (pBot - top);
    const slot = (x1 - x0) / n;
    const bodyW = Math.max(1, slot * 0.62);
    const wickW = Math.max(1, Math.min(slot * 0.12, m * 0.0025));
    const xOf = (i) => x0 + slot * (i + 0.5);
    const gridIn = ease.outExpo(seg(t, 0.3, 1.4)) * fade;

    // ---------- preço e variação (canto direito do cabeçalho) ----------
    {
      const e = ease.outExpo(seg(t, T0, T0 + 1.0)) * fade;
      const chg = (price / s[0].o - 1) * 100;
      const upC = chg >= 0 ? p.up : p.down;
      const ps = H.titleSize * 0.82;
      const xr = w - padX;
      const yb = H.top + H.titleSize * 0.2;
      ctx.globalAlpha = e;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'alphabetic';
      ctx.font = MONO(700)(ps);
      ctx.fillStyle = p.ink;
      ctx.fillText(`${p.prefix}${fmt(price, dec)}`, xr, yb + (1 - e) * ps * 0.4);
      const cs = H.subSize * 0.95;
      ctx.font = MONO(700)(cs);
      const txt = `${chg >= 0 ? '▲ +' : '▼ '}${fmt(chg, 2)}%`;
      const tw = ctx.measureText(txt).width;
      const ph = cs * 1.8;
      const py = yb + cs * 0.9;
      ctx.fillStyle = rgba(upC, 0.16);
      ctx.beginPath();
      ctx.roundRect(xr - tw - cs * 1.2, py, tw + cs * 1.2, ph, ph / 2);
      ctx.fill();
      ctx.fillStyle = upC;
      ctx.textBaseline = 'middle';
      ctx.fillText(txt, xr - cs * 0.6, py + ph / 2 + cs * 0.05);
      ctx.globalAlpha = 1;
    }

    // ---------- grade ----------
    ctx.lineWidth = Math.max(1, m * 0.0011);
    ctx.font = MONO(500)(ts);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) {
      const y = yOf(v);
      if (y < top - 1 || y > pBot + 1) continue;
      const edge = clamp(Math.min(y - top, pBot - y) / (m * 0.03));
      ctx.strokeStyle = rgba(p.ink, 0.07 * gridIn * edge);
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
      ctx.stroke();
      ctx.fillStyle = rgba(p.ink, 0.4 * gridIn * edge);
      ctx.fillText(fmt(v, step < 0.1 ? 2 : step < 1 ? 1 : 0), x1 + m * 0.018, y);
    }
    ctx.strokeStyle = rgba(p.ink, 0.16 * gridIn);
    ctx.beginPath();
    ctx.moveTo(x0, pBot + m * 0.015);
    ctx.lineTo(x0 + (x1 - x0) * gridIn, pBot + m * 0.015);
    ctx.stroke();
    ctx.font = INTER(700)(ts * 0.8);
    ctx.letterSpacing = `${ts * 0.12}px`;
    ctx.fillStyle = rgba(p.ink, 0.3 * gridIn);
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('VOL', x1 + m * 0.018, bot);
    ctx.letterSpacing = '0px';

    // ---------- candles e volume (um fill por cor) ----------
    for (const isUp of [true, false]) {
      ctx.beginPath();
      const vol = new Path2D();
      for (let i = 0; i <= Math.min(last, n - 1); i++) {
        const k = kOf(i);
        if (k <= 0) continue;
        const c = cur(i);
        if (c.c >= c.o !== isUp) continue;
        const x = xOf(i);
        const a = clamp(k * 5);
        const yO = yOf(c.o);
        const yC = yOf(c.c);
        const bw = bodyW * (0.4 + 0.6 * a);
        ctx.rect(x - wickW / 2, yOf(c.h), wickW, yOf(c.l) - yOf(c.h));
        ctx.rect(x - bw / 2, Math.min(yO, yC), bw, Math.max(Math.abs(yC - yO), m * 0.0015));
        const vh = (s[i].v / vmax) * volH * ease.outCubic(k);
        vol.rect(x - bodyW / 2, bot - vh, bodyW, vh);
      }
      ctx.fillStyle = rgba(isUp ? p.up : p.down, fade);
      ctx.fill();
      ctx.fillStyle = rgba(isUp ? p.up : p.down, 0.32 * fade);
      ctx.fill(vol);
    }

    // ---------- média móvel ----------
    if (p.ma && rv > 1) {
      ctx.beginPath();
      const end = Math.min(rv - FORM * 0.5, n - 1);
      for (let i = 0; i <= Math.floor(end); i++) {
        const y = yOf(ma[i]);
        if (i) ctx.lineTo(xOf(i), y);
        else ctx.moveTo(xOf(i), y);
      }
      const fe = Math.floor(end);
      if (fe < n - 1 && end > 0) ctx.lineTo(lerp(xOf(fe), xOf(fe + 1), end - fe), yOf(lerp(ma[fe], ma[fe + 1], end - fe)));
      ctx.strokeStyle = rgba(p.ink, 0.5 * fade);
      ctx.lineWidth = Math.max(1, m * 0.0022);
      ctx.lineJoin = 'round';
      ctx.stroke();
      if (end > 2) {
        const e = ease.outExpo(seg(t, T0 + 1, T0 + 2)) * fade;
        ctx.font = MONO(500)(ts * 0.85);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = rgba(p.ink, 0.45 * e);
        ctx.fillText('MA 9', x0, top - ts * 0.9);
      }
    }

    // ---------- linha do preço atual + etiqueta ----------
    const pIn = ease.outExpo(seg(t, T0 + 0.2, T0 + 1.0)) * fade;
    if (pIn > 0.01) {
      const lc = cur(last);
      const col = lc.c >= lc.o ? p.up : p.down;
      const y = yOf(price);
      ctx.setLineDash([m * 0.006, m * 0.006]);
      ctx.strokeStyle = rgba(col, 0.7 * pIn);
      ctx.lineWidth = Math.max(1, m * 0.0016);
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
      ctx.stroke();
      ctx.setLineDash([]);
      // ponto pulsando no candle corrente
      const xl = xOf(last);
      const pulse = (t * 1.2) % 1;
      ctx.fillStyle = rgba(col, 0.35 * (1 - pulse) * pIn);
      ctx.beginPath();
      ctx.arc(xl, y, m * (0.006 + 0.016 * pulse), 0, TAU);
      ctx.fill();
      ctx.fillStyle = rgba(col, pIn);
      ctx.beginPath();
      ctx.arc(xl, y, m * 0.0055, 0, TAU);
      ctx.fill();
      // etiqueta no eixo
      ctx.font = MONO(700)(ts);
      const txt = fmt(price, dec);
      const tw = ctx.measureText(txt).width;
      const th = ts * 1.9;
      const tx = x1 + m * 0.006;
      ctx.globalAlpha = pIn;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(tx, y);
      ctx.lineTo(tx + th * 0.35, y - th / 2);
      ctx.lineTo(tx + th * 0.35 + tw + ts * 1.1, y - th / 2);
      ctx.lineTo(tx + th * 0.35 + tw + ts * 1.1, y + th / 2);
      ctx.lineTo(tx + th * 0.35, y + th / 2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = p.bg;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(txt, tx + th * 0.35 + ts * 0.55, y + ts * 0.05);
      ctx.globalAlpha = 1;
    }
  },
};
