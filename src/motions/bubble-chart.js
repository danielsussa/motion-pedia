import { TAU, clamp, lerp, seg, ease, spring, stagger, rgba, hexToRgb } from '../lib/anim.js';

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

// mistura de cores já em [r,g,b] (mixHex devolve 'rgb()', não dá para encadear)
const mixA = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
const css = (c) => `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;

// "Rótulo; ano; x; y; tamanho" por linha (separador ; | ou tab — vírgula fica para o decimal).
// Linhas que não começam com rótulo + ano numérico (cabeçalho, comentário com #) são ignoradas.
function parseData(text) {
  const map = new Map();
  const years = new Set();
  for (const line of String(text || '').split(/\r?\n/)) {
    const l = line.trim();
    if (!l || l.startsWith('#')) continue;
    const c = l.split(/\s*[;\t|]\s*/);
    if (c.length < 5) continue;
    const yr = parseNum(c[1]);
    const x = parseNum(c[2]);
    const y = parseNum(c[3]);
    const s = parseNum(c[4]);
    if (!yr || !x || !y || !s) continue;
    const label = c[0].trim() || '—';
    if (!map.has(label)) map.set(label, []);
    map.get(label).push({ yr: yr.v, x: x.v, y: y.v, s: Math.max(0, s.v) });
    years.add(yr.v);
  }
  const items = [...map.entries()].map(([label, keys]) => ({ label, keys: keys.sort((a, b) => a.yr - b.yr) }));
  return { items, years: [...years].sort((a, b) => a - b) };
}

// valor de um campo no ano `yr`: Catmull-Rom entre as chaves do item (segura antes/depois)
function sampleKey(keys, yr, f) {
  const n = keys.length;
  if (yr <= keys[0].yr) return f(keys[0]);
  if (yr >= keys[n - 1].yr) return f(keys[n - 1]);
  let j = 0;
  while (j < n - 2 && yr > keys[j + 1].yr) j++;
  const a = keys[j], b = keys[j + 1];
  const u = (yr - a.yr) / (b.yr - a.yr || 1);
  const p1 = f(a), p2 = f(b);
  const p0 = j > 0 ? f(keys[j - 1]) : p1 - (p2 - p1);
  const p3 = j + 2 < n ? f(keys[j + 2]) : p2 + (p2 - p1);
  const u2 = u * u, u3 = u2 * u;
  return 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3);
}

// marcas "redondas" de um eixo linear
function niceTicks(lo, hi, count) {
  const span = hi - lo || 1;
  const raw = span / count;
  const p10 = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * p10).find((s) => span / s <= count + 0.5) || 10 * p10;
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toPrecision(12));
  return { ticks: out, dec: Math.max(0, -Math.floor(Math.log10(step) + 1e-9)) };
}
// marcas 1-2-5 de um eixo log
function logTicks(lo, hi) {
  const out = [];
  for (let e = Math.floor(Math.log10(lo)) - 1; e <= Math.ceil(Math.log10(hi)); e++) {
    for (const k of [1, 2, 5]) {
      const v = k * 10 ** e;
      if (v >= lo * 0.999 && v <= hi * 1.001) out.push(v);
    }
  }
  return out;
}

const sineIO = (x) => 0.5 - 0.5 * Math.cos(Math.PI * x);

const DEFAULT_DATA = `# country; year; GDP per capita (k US$); life expectancy; population (M)
Brazil; 1990; 11,0; 66,3; 150
Brazil; 2000; 12,0; 70,1; 175
Brazil; 2010; 15,5; 73,6; 196
Brazil; 2023; 15,8; 75,8; 216
China; 1990; 1,4; 69,1; 1135
China; 2000; 3,5; 71,4; 1263
China; 2010; 9,0; 75,6; 1338
China; 2023; 19,5; 78,6; 1410
India; 1990; 1,9; 58,6; 870
India; 2000; 2,6; 62,7; 1057
India; 2010; 4,4; 66,7; 1234
India; 2023; 7,9; 71,0; 1430
USA; 1990; 41; 75,4; 250
USA; 2000; 52; 76,8; 282
USA; 2010; 56; 78,6; 309
USA; 2023; 65; 77,5; 335
Japan; 1990; 35; 79,0; 124
Japan; 2000; 37,5; 81,2; 127
Japan; 2010; 39; 82,9; 128
Japan; 2023; 42; 84,7; 124
Germany; 1990; 41; 75,3; 79
Germany; 2000; 46; 77,9; 82
Germany; 2010; 50; 79,9; 81
Germany; 2023; 56; 81,0; 84
Mexico; 1990; 15; 70,8; 84
Mexico; 2000; 18; 74,4; 98
Mexico; 2010; 18,5; 74,1; 112
Mexico; 2023; 20,5; 75,0; 128
Indonesia; 1990; 4,8; 63,3; 182
Indonesia; 2000; 5,5; 66,3; 214
Indonesia; 2010; 8,0; 69,0; 244
Indonesia; 2023; 13; 71,0; 277
Nigeria; 1990; 3,6; 45,9; 95
Nigeria; 2000; 3,3; 46,3; 122
Nigeria; 2010; 5,1; 50,9; 160
Nigeria; 2023; 5,0; 53,6; 224
Ethiopia; 1990; 0,7; 47,0; 48
Ethiopia; 2000; 0,7; 51,5; 67
Ethiopia; 2010; 1,3; 61,7; 89
Ethiopia; 2023; 2,4; 66,5; 127
South Africa; 1990; 12; 63,4; 39
South Africa; 2000; 11,5; 56,8; 46
South Africa; 2010; 12,5; 56,6; 52
South Africa; 2023; 13,5; 61,5; 61`;

export default {
  id: 'bubble-chart',
  title: 'Bubble Chart',
  description: 'A Gapminder-style bubble chart: years tick by and bubbles (size = population) travel across the chart, with a trail on the highlight.',
  category: 'dados',
  tags: ['data', 'ui'],
  duration: 12,
  poster: 7.5,

  params: {
    title: { type: 'text', label: 'Title', default: 'Income and life expectancy' },
    subtitle: { type: 'text', label: 'Subtitle', default: 'Bubble size = population · approximate data' },
    data: { type: 'textarea', label: 'Data (label; year; x; y; size)', rows: 10, default: DEFAULT_DATA },
    xLabel: { type: 'text', label: 'X axis', default: 'GDP per capita (k US$ PPP)' },
    yLabel: { type: 'text', label: 'Y axis', default: 'Life expectancy (years)' },
    xLog: { type: 'boolean', label: 'Log scale on X', default: true },
    highlight: { type: 'text', label: 'Highlight (label)', default: 'Brazil' },
    accent: { type: 'color', label: 'Accent', default: '#ff5a36' },
    ink: { type: 'color', label: 'Text', default: '#f2efe8' },
    bg: { type: 'color', label: 'Background', default: '#0e0f12' },
  },

  setup({ w, h, px, p }) {
    const { items, years } = parseData(p.data);
    const log = p.xLog && items.every((d) => d.keys.every((k) => k.x > 0));
    const fx = (v) => (log ? Math.log10(v) : v);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, sMax = 0;
    for (const d of items) {
      for (const k of d.keys) {
        x0 = Math.min(x0, fx(k.x));
        x1 = Math.max(x1, fx(k.x));
        y0 = Math.min(y0, k.y);
        y1 = Math.max(y1, k.y);
        sMax = Math.max(sMax, k.s);
      }
    }
    const hl = String(p.highlight || '').trim().toLowerCase();
    items.forEach((d) => (d.hi = !!hl && d.label.toLowerCase() === hl));
    // folga para as bolhas não saírem do gráfico
    const px_ = (x1 - x0 || 1) * 0.1;
    const py_ = (y1 - y0 || 1) * 0.14;
    const dom = { x0: x0 - px_, x1: x1 + px_, y0: y0 - py_, y1: y1 + py_ };
    let xt, xdec = 0;
    if (log) xt = logTicks(10 ** dom.x0, 10 ** dom.x1);
    else ({ ticks: xt, dec: xdec } = niceTicks(dom.x0, dom.x1, 6));
    const { ticks: yt, dec: ydec } = niceTicks(dom.y0, dom.y1, 5);
    if (log) xdec = xt.length && xt[0] < 1 ? 1 : 0;
    return { items, years, log, dom, xt, yt, xdec, ydec, sMax: sMax || 1, bgc: bgBuffer(w, h, px, p.bg) };
  },

  render(ctx, t, { w, h, p, duration, state }) {
    const { items, years, log, dom, xt, yt, xdec, ydec, sMax, bgc } = state;
    ctx.drawImage(bgc, 0, 0, w, h);
    const m = Math.min(w, h);
    const ar = w / h;
    const portrait = ar < 0.9;
    const wide = ar > 1.3;

    const OUT = duration - 0.9;
    const outAll = ease.inCubic(seg(t, OUT, duration - 0.08));
    const vis = 1 - outAll;

    // ---------- cabeçalho ----------
    const padX = wide ? w * 0.07 : w * 0.08;
    const top = portrait ? h * 0.09 : h * 0.11;
    const titleSize = m * (portrait ? 0.062 : 0.052);
    const subSize = titleSize * 0.42;
    const titleIn = ease.outExpo(seg(t, 0.1, 1.0));
    const subIn = ease.outExpo(seg(t, 0.25, 1.15));
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = p.accent;
    ctx.fillRect(padX, top - titleSize * 0.95, m * 0.045 * ease.outExpo(seg(t, 0.05, 0.8)) * vis, m * 0.006);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, top - titleSize * 0.85, w, titleSize * 1.15 + subSize * 2.2);
    ctx.clip();
    ctx.globalAlpha = vis * clamp(titleIn * 3);
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

    if (!items.length || !years.length) {
      ctx.font = INTER(500)(subSize * 1.3);
      ctx.fillStyle = rgba(p.ink, 0.5);
      ctx.textAlign = 'center';
      ctx.fillText('No data — use "Label; year; x; y; size" per line', w / 2, h / 2);
      return;
    }

    // ---------- área do gráfico ----------
    const tick = m * (portrait ? 0.02 : 0.017);
    ctx.font = MONO(500)(tick);
    let yTickW = 0;
    for (const v of yt) yTickW = Math.max(yTickW, ctx.measureText(fmt(v, ydec)).width);
    const axS = m * (portrait ? 0.022 : 0.019);
    const pTop = top + titleSize * 0.2 + subSize * 2 + m * (portrait ? 0.09 : 0.075);
    const pBot = h - h * (portrait ? 0.07 : 0.08) - tick * 1.6 - axS * 2.2;
    const pL = padX + yTickW + tick * 0.9;
    const pR = w - padX;
    const pW = pR - pL, pH = pBot - pTop;
    const X = (v) => pL + ((v - dom.x0) / (dom.x1 - dom.x0)) * pW;
    const Y = (v) => pBot - ((v - dom.y0) / (dom.y1 - dom.y0)) * pH;
    const fx = (v) => (log ? Math.log10(Math.max(1e-9, v)) : v);
    const rMax = Math.min(pW, pH) * 0.1;
    const rMin = m * 0.006;
    const R = (s) => Math.max(rMin, rMax * Math.sqrt(Math.max(0, s) / sMax));

    // ---------- tempo → ano ----------
    const PLAY0 = 2.7, PLAY1 = duration - 2.3;
    const Y0 = years[0], Y1 = years[years.length - 1];
    const yr = Y0 + (Y1 - Y0) * sineIO(seg(t, PLAY0, PLAY1));

    // grade e eixos
    const gIn = ease.outExpo(seg(t, 0.35, 1.5)) * vis;
    ctx.lineWidth = Math.max(1, m * 0.001);
    ctx.strokeStyle = rgba(p.ink, 0.07 * gIn);
    ctx.beginPath();
    for (const v of yt) {
      const yy = Math.round(Y(v)) + 0.5;
      ctx.moveTo(pL, yy);
      ctx.lineTo(pL + pW * gIn, yy);
    }
    for (const v of xt) {
      const xx = Math.round(X(fx(v))) + 0.5;
      ctx.moveTo(xx, pBot);
      ctx.lineTo(xx, pBot - pH * gIn);
    }
    ctx.stroke();
    ctx.strokeStyle = rgba(p.ink, 0.22 * gIn);
    ctx.beginPath();
    ctx.moveTo(pL, Math.round(pBot) + 0.5);
    ctx.lineTo(pL + pW * gIn, Math.round(pBot) + 0.5);
    ctx.stroke();

    ctx.font = MONO(500)(tick);
    ctx.fillStyle = rgba(p.ink, 0.45 * gIn);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const v of yt) ctx.fillText(fmt(v, ydec), pL - tick * 0.9, Y(v));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    let lastX = -Infinity;
    for (const v of xt) {
      const xx = X(fx(v));
      const s = fmt(v, log ? (v < 1 ? 1 : 0) : xdec);
      const tw = ctx.measureText(s).width;
      if (xx - tw / 2 < lastX + tick) continue;
      ctx.fillText(s, xx, pBot + tick * 0.7);
      lastX = xx + tw / 2;
    }
    // títulos dos eixos
    ctx.font = INTER(600)(axS);
    ctx.fillStyle = rgba(p.ink, 0.62 * gIn);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'right';
    ctx.fillText(ellipsize(ctx, `${p.xLabel}${log ? ' · log' : ''}  →`, pW), pR, pBot + tick * 1.7 + axS * 1.5);
    ctx.textAlign = 'left';
    ctx.fillText(ellipsize(ctx, `↑  ${p.yLabel}`, pW), pL - yTickW - tick * 0.9, pTop - axS * 1.1);

    // ano gigante ao fundo
    const yrTxt = String(Math.round(yr));
    const yIn = ease.outExpo(seg(t, 0.9, 2.0)) * vis;
    if (yIn > 0.01) {
      const ys = fitFont(ctx, '0000', pW * 0.5, pH * 0.42, INTER(800));
      ctx.font = INTER(800)(ys);
      ctx.letterSpacing = `${-ys * 0.04}px`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = rgba(p.ink, 0.07 * yIn);
      ctx.fillText(yrTxt, pR - m * 0.01, pBot - m * 0.025);
      ctx.letterSpacing = '0px';
    }

    // ---------- bolhas ----------
    const n = items.length;
    const order = items
      .map((d, i) => {
        const s = sampleKey(d.keys, yr, (k) => k.s);
        return { d, i, x: X(sampleKey(d.keys, yr, (k) => fx(k.x))), y: Y(sampleKey(d.keys, yr, (k) => k.y)), r: R(s) };
      })
      .sort((a, b) => (a.d.hi - b.d.hi) || b.r - a.r);
    // entrada: das maiores para as menores
    const bySize = [...order].sort((a, b) => b.r - a.r).map((o) => o.i);
    const popAt = (i) => 1.25 + stagger(bySize.indexOf(i), n, Math.min(1.0, 0.09 * n));

    const hiItem = items.find((d) => d.hi);
    // rastro do destaque (por cima das outras bolhas, por baixo da bolha destacada)
    const drawTrail = (hiR, hx, hy) => {
      const tk = ease.outCubic(seg(t, PLAY0 - 0.2, PLAY0 + 0.4)) * vis;
      if (tk > 0.01 && yr > Y0) {
        ctx.strokeStyle = rgba(p.accent, 0.55 * tk);
        ctx.lineWidth = Math.max(1, m * 0.0022);
        ctx.lineCap = 'butt';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        const STEPS = 90;
        for (let k = 0; k <= STEPS; k++) {
          const yy = Y0 + ((yr - Y0) * k) / STEPS;
          const px1 = X(sampleKey(hiItem.keys, yy, (q) => fx(q.x)));
          const py1 = Y(sampleKey(hiItem.keys, yy, (q) => q.y));
          if (k) ctx.lineTo(px1, py1);
          else ctx.moveTo(px1, py1);
        }
        ctx.stroke();
        // marcos dos anos já percorridos
        ctx.fillStyle = p.bg;
        ctx.strokeStyle = rgba(p.accent, 0.8 * tk);
        ctx.font = MONO(500)(tick * 0.85);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        for (const k of hiItem.keys) {
          if (k.yr > yr + 1e-6) break;
          const kx = X(fx(k.x)), ky = Y(k.y);
          // some suavemente enquanto a bolha ainda está em cima do marco
          const fm = clamp((Math.hypot(kx - hx, ky - hy) - hiR) / (m * 0.04));
          if (fm <= 0.01) continue;
          ctx.globalAlpha = fm;
          ctx.beginPath();
          ctx.arc(kx, ky, m * 0.005, 0, TAU);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = rgba(p.accent, 0.75 * tk);
          ctx.fillText(String(k.yr), kx, ky - m * 0.011);
          ctx.fillStyle = p.bg;
          ctx.globalAlpha = 1;
        }
      }
    };

    const BG = hexToRgb(p.bg), INK = hexToRgb(p.ink);
    const neutral = css(mixA(BG, INK, 0.5));
    for (const o of order) {
      const k = spring(seg(t, popAt(o.i), popAt(o.i) + 0.9), 0.28);
      if (k <= 0.01) continue;
      const r = o.r * k;
      if (o.d.hi) drawTrail(r, o.x, o.y);
      ctx.globalAlpha = vis;
      ctx.beginPath();
      ctx.arc(o.x, o.y, r, 0, TAU);
      if (o.d.hi) {
        ctx.fillStyle = rgba(p.accent, 0.92);
        ctx.fill();
        ctx.strokeStyle = rgba('#ffffff', 0.35);
      } else {
        ctx.fillStyle = neutral;
        ctx.globalAlpha = vis * 0.5;
        ctx.fill();
        ctx.globalAlpha = vis;
        ctx.strokeStyle = rgba(p.ink, 0.35);
      }
      ctx.lineWidth = Math.max(1, m * 0.0012);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // rótulos: dentro da bolha quando cabe, senão ao lado. Contorno da cor do fundo para ler sobre as bolhas;
    // rótulos que encostam no do destaque esmaecem (contínuo, sem pulos)
    const lsz = m * (portrait ? 0.019 : 0.016);
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    const place = (o) => {
      const hi = o.d.hi;
      const fs = hi ? lsz * 1.3 : lsz;
      ctx.font = INTER(hi ? 800 : 600)(fs);
      const tw = ctx.measureText(o.d.label).width;
      if (!hi && tw < o.r * 1.7 && lsz < o.r * 0.9) return { inside: true, x: o.x - tw / 2, y: o.y, tw, fs };
      const right = o.x + o.r + tw + lsz < pR;
      return { inside: false, x: right ? o.x + o.r + lsz * 0.45 : o.x - o.r - lsz * 0.45 - tw, y: o.y, tw, fs };
    };
    const hiO = order.find((o) => o.d.hi);
    const hiL = hiO ? place(hiO) : null;
    const overlap = (L) => {
      if (!hiL) return 0;
      const ax0 = Math.max(L.x, hiL.x), ax1 = Math.min(L.x + L.tw, hiL.x + hiL.tw);
      const ay0 = Math.max(L.y - L.fs * 0.6, hiL.y - hiL.fs * 0.6), ay1 = Math.min(L.y + L.fs * 0.6, hiL.y + hiL.fs * 0.6);
      const bx = clamp(1 - Math.abs(L.x + L.tw / 2 - hiO.x) / (L.tw / 2 + hiO.r)) * clamp(1 - Math.abs(L.y - hiO.y) / (L.fs * 0.6 + hiO.r));
      const ov = Math.max(0, ax1 - ax0) * Math.max(0, ay1 - ay0) / (L.tw * L.fs * 1.2);
      return Math.max(ov, bx);
    };
    for (const o of order) {
      const k = ease.outExpo(seg(t, popAt(o.i) + 0.3, popAt(o.i) + 1.0)) * vis;
      if (k <= 0.01) continue;
      const hi = o.d.hi;
      const L = hi ? hiL : place(o);
      const fade = hi ? 1 : 1 - clamp(overlap(L) * 4) * 0.85;
      ctx.font = INTER(hi ? 800 : 600)(L.fs);
      ctx.textAlign = 'left';
      ctx.globalAlpha = k * fade;
      if (!L.inside) {
        ctx.strokeStyle = rgba(p.bg, 0.6);
        ctx.lineWidth = L.fs * 0.24;
        ctx.strokeText(o.d.label, L.x, L.y);
      }
      ctx.fillStyle = L.inside ? rgba(p.ink, 0.85) : hi ? p.ink : rgba(p.ink, 0.62);
      ctx.fillText(o.d.label, L.x, L.y);
    }
    ctx.globalAlpha = 1;
  },
};
