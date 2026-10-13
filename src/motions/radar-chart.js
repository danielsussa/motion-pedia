import { TAU, clamp, seg, ease, spring, stagger, rgba } from '../lib/anim.js';

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

// "Eixo, valorA, valorB" por linha. Separadores: ", " (vírgula + espaço), ; tab |
function parseData(text) {
  const out = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const l = line.trim();
    if (!l || l.startsWith('#')) continue;
    const parts = l.split(/\s*[;\t|]\s*|,\s+/);
    if (parts.length < 2) continue;
    const a = parseNum(parts[1]);
    if (!a) continue;
    const b = parseNum(parts[2]);
    out.push({ label: parts[0].trim() || '—', a: Math.max(0, a.v), b: b ? Math.max(0, b.v) : null, dec: Math.min(2, Math.max(a.dec, b ? b.dec : 0)) });
  }
  return out;
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

const DEFAULT_DATA = `Velocidade, 86, 64
Confiabilidade, 92, 78
Design, 74, 83
Preço, 58, 76
Suporte, 88, 60
Integrações, 71, 52`;

export default {
  id: 'radar-chart',
  title: 'Radar Chart',
  description: 'Gráfico de radar em que a grade se abre e duas séries se desenham vértice a vértice com mola, comparando notas por eixo.',
  category: 'dados',
  tags: ['dados', 'ui'],
  duration: 8,
  poster: 4.6,

  params: {
    title: { type: 'text', label: 'Título', default: 'Comparativo de produto' },
    subtitle: { type: 'text', label: 'Subtítulo', default: 'Notas de 0 a 100 · pesquisa com 1.200 usuários' },
    data: { type: 'textarea', label: 'Dados (Eixo, série A, série B)', rows: 8, default: DEFAULT_DATA },
    nameA: { type: 'text', label: 'Nome da série A', default: 'Nosso produto' },
    nameB: { type: 'text', label: 'Nome da série B', default: 'Concorrente' },
    max: { type: 'range', label: 'Escala máxima (0 = auto)', min: 0, max: 1000, step: 1, default: 100 },
    grid: { type: 'select', label: 'Grade', options: ['polígono', 'círculo'], default: 'polígono' },
    accent: { type: 'color', label: 'Destaque', default: '#ff5a36' },
    ink: { type: 'color', label: 'Texto', default: '#f2efe8' },
    bg: { type: 'color', label: 'Fundo', default: '#0e0f12' },
  },

  setup({ w, h, px, p }) {
    const rows = parseData(p.data);
    const hasB = rows.some((r) => r.b != null);
    const vmax = rows.reduce((mx, r) => Math.max(mx, r.a, r.b ?? 0), 0) || 1;
    let max = p.max > 0 ? p.max : vmax;
    if (!(p.max > 0)) {
      const mag = 10 ** Math.floor(Math.log10(max));
      max = Math.ceil(max / (mag / 2)) * (mag / 2);
    }
    const dec = rows.reduce((d, r) => Math.max(d, r.dec), 0);
    return { rows, hasB, max, dec, bgc: bakeBg(w, h, px, p.bg, p.accent) };
  },

  render(ctx, t, { w, h, p, duration, state }) {
    const { rows, hasB, max, dec, bgc } = state;
    ctx.drawImage(bgc, 0, 0, w, h);
    const OUT = duration - 1.25;
    const outAll = ease.inCubic(seg(t, OUT + 0.45, duration - 0.08));
    const H = drawHeader(ctx, t, w, h, p, outAll);
    const { m, portrait, wide, padX } = H;
    const n = rows.length;

    if (n < 3) {
      ctx.font = INTER(500)(H.subSize * 1.3);
      ctx.fillStyle = rgba(p.ink, 0.5);
      ctx.textAlign = 'center';
      ctx.fillText('Use ao menos 3 linhas "Eixo, valor A, valor B"', w / 2, h / 2);
      return;
    }

    // ---------- legenda ----------
    const lgS = m * (portrait ? 0.026 : 0.022);
    const lgY = H.bot + m * 0.04;
    {
      const e = ease.outExpo(seg(t, 0.5, 1.4)) * (1 - outAll);
      ctx.globalAlpha = e;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.font = INTER(600)(lgS);
      let x = padX + (1 - e) * m * 0.02;
      const items = [[p.nameA, true]];
      if (hasB) items.push([p.nameB, false]);
      for (const [name, isA] of items) {
        if (isA) {
          ctx.fillStyle = p.accent;
          ctx.beginPath();
          ctx.roundRect(x, lgY - lgS * 0.4, lgS * 0.8, lgS * 0.8, lgS * 0.2);
          ctx.fill();
        } else {
          ctx.strokeStyle = rgba(p.ink, 0.7);
          ctx.lineWidth = Math.max(1, lgS * 0.12);
          ctx.setLineDash([lgS * 0.18, lgS * 0.14]);
          ctx.beginPath();
          ctx.roundRect(x + lgS * 0.06, lgY - lgS * 0.34, lgS * 0.68, lgS * 0.68, lgS * 0.16);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.fillStyle = rgba(p.ink, isA ? 0.9 : 0.6);
        ctx.fillText(name, x + lgS * 1.3, lgY);
        x += lgS * 1.3 + ctx.measureText(name).width + lgS * 1.8;
      }
      ctx.globalAlpha = 1;
    }

    // ---------- layout ----------
    const ls = m * (portrait ? 0.03 : 0.025);
    ctx.font = INTER(600)(ls);
    const lw = Math.min(m * 0.32, Math.max(...rows.map((r) => ctx.measureText(r.label).width)));
    const areaTop = lgY + lgS + m * 0.04;
    const areaBot = h - h * (portrait ? 0.08 : 0.07);
    // telas estreitas (1:1, 4:5, 9:16): rótulos centrados sobre o prolongamento do raio, o radar ganha largura
    const stack = h >= w * 0.9;
    const bhL = ls + ls * 0.82 * 1.35;
    const maxC = Math.max(...rows.map((_, i) => Math.abs(Math.cos(-Math.PI / 2 + (TAU * i) / n))), 0.2);
    const R = Math.max(
      m * 0.05,
      stack
        ? Math.min((areaBot - areaTop) / 2 - bhL - m * 0.04, ((w - padX * 2) / 2 - (lw * (1 + maxC)) / 2 - m * 0.055 * maxC) / maxC)
        : Math.min((areaBot - areaTop) / 2 - ls * 2.6, (w - padX * 2) / 2 - lw - m * 0.05, wide ? h * 0.5 : Infinity),
    );
    const cx = w / 2;
    const cy = (areaTop + areaBot) / 2 + ls * 0.2;
    const ang = (i) => -Math.PI / 2 + (TAU * i) / n;
    const circle = p.grid === 'círculo';
    const LEVELS = 4;

    const poly = (radii) => {
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const a = ang(i);
        const x = cx + Math.cos(a) * radii(i);
        const y = cy + Math.sin(a) * radii(i);
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.closePath();
    };

    // ---------- grade ----------
    const lw1 = Math.max(1, m * 0.0012);
    const outGrid = ease.inCubic(seg(t, OUT + 0.25, OUT + 1.0));
    for (let k = LEVELS; k >= 1; k--) {
      const e = ease.outExpo(seg(t, 0.35 + (k - 1) * 0.09, 1.5 + (k - 1) * 0.09)) * (1 - outGrid);
      if (e <= 0.001) continue;
      const r = (R * k * e) / LEVELS;
      if (circle) {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, TAU);
      } else poly(() => r);
      if (k === LEVELS) {
        ctx.fillStyle = rgba(p.ink, 0.025 * e);
        ctx.fill();
      }
      ctx.strokeStyle = rgba(p.ink, (k === LEVELS ? 0.2 : 0.09) * e);
      ctx.lineWidth = lw1;
      ctx.stroke();
    }
    // raios
    ctx.strokeStyle = rgba(p.ink, 0.1);
    ctx.lineWidth = lw1;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const e = ease.outExpo(seg(t, 0.5 + stagger(i, n, 0.5), 1.5 + stagger(i, n, 0.5))) * (1 - outGrid);
      if (e <= 0.001) continue;
      const a = ang(i);
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * R * e, cy + Math.sin(a) * R * e);
    }
    ctx.stroke();
    // valores da escala no raio de cima (levemente à direita)
    {
      const ts = m * 0.0145;
      ctx.font = MONO(500)(ts);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      for (let k = 1; k <= LEVELS; k++) {
        const e = ease.outExpo(seg(t, 0.9 + k * 0.08, 1.8 + k * 0.08)) * (1 - outGrid);
        if (e <= 0.01) continue;
        ctx.fillStyle = rgba(p.ink, 0.32 * e);
        ctx.fillText(fmt((max * k) / LEVELS, 0), cx + m * 0.008, cy - (R * k) / LEVELS + ts * 0.75);
      }
    }

    // ---------- séries ----------
    const spread = Math.min(1.1, 0.16 * n);
    const T_B = 1.4;
    const T_A = hasB ? 2.25 : 1.6;
    const vert = (i, t0) => spring(seg(t, t0 + stagger(i, n, spread), t0 + stagger(i, n, spread) + 1.1), 0.22);
    const outS = (i, base) => ease.inCubic(seg(t, base + stagger(n - 1 - i, n, 0.35), base + 0.6 + stagger(n - 1 - i, n, 0.35)));
    const rB = (i) => (R * Math.min(rows[i].b ?? 0, max * 1.15) * vert(i, T_B) * (1 - outS(i, OUT + 0.1))) / max;
    const rA = (i) => (R * Math.min(rows[i].a, max * 1.15) * vert(i, T_A) * (1 - outS(i, OUT))) / max;
    const anyOn = (t0, base) => t > t0 && t < base + 1.0;

    if (hasB && anyOn(T_B, OUT + 0.1)) {
      poly(rB);
      ctx.fillStyle = rgba(p.ink, 0.07);
      ctx.fill();
      ctx.strokeStyle = rgba(p.ink, 0.62);
      ctx.lineWidth = m * 0.0032;
      ctx.lineJoin = 'round';
      ctx.setLineDash([m * 0.009, m * 0.007]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = rgba(p.ink, 0.75);
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        if (rows[i].b == null || vert(i, T_B) <= 0) continue;
        const a = ang(i);
        const r = rB(i);
        ctx.moveTo(cx + Math.cos(a) * r + m * 0.0055, cy + Math.sin(a) * r);
        ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, m * 0.0055, 0, TAU);
      }
      ctx.fill();
    }

    if (anyOn(T_A, OUT)) {
      poly(rA);
      ctx.fillStyle = rgba(p.accent, 0.22);
      ctx.fill();
      ctx.lineJoin = 'round';
      // brilho barato: traços largos com alpha baixo
      ctx.strokeStyle = rgba(p.accent, 0.08);
      ctx.lineWidth = m * 0.022;
      ctx.stroke();
      ctx.strokeStyle = rgba(p.accent, 0.16);
      ctx.lineWidth = m * 0.011;
      ctx.stroke();
      ctx.strokeStyle = p.accent;
      ctx.lineWidth = m * 0.0048;
      ctx.stroke();
      const dr = m * 0.0085;
      ctx.lineWidth = m * 0.004;
      for (let i = 0; i < n; i++) {
        const v = vert(i, T_A);
        if (v <= 0) continue;
        const a = ang(i);
        const r = rA(i);
        const s = clamp(v * 1.4) * (1 - outS(i, OUT));
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, dr * s, 0, TAU);
        ctx.fillStyle = p.bg;
        ctx.fill();
        ctx.strokeStyle = p.accent;
        ctx.stroke();
      }
    }

    // ---------- rótulos dos eixos ----------
    const vs = ls * 0.82;
    for (let i = 0; i < n; i++) {
      const row = rows[i];
      const e = ease.outExpo(seg(t, 0.8 + stagger(i, n, 0.6), 1.8 + stagger(i, n, 0.6))) * (1 - outAll);
      if (e <= 0.01) continue;
      const a = ang(i);
      const c = Math.cos(a);
      const s = Math.sin(a);
      const rr = R + m * 0.035 + (1 - e) * m * 0.02;
      ctx.font = INTER(600)(ls);
      const ownW = Math.min(lw + m * 0.01, ctx.measureText(row.label).width);
      const x = cx + c * rr + (stack ? c * ownW * 0.5 : 0);
      const y = cy + s * rr;
      const align = stack || Math.abs(c) < 0.22 ? 'center' : c > 0 ? 'left' : 'right';
      const bh = ls + vs * 1.35;
      const topY = stack
        ? y + s * bh * 0.5 - bh / 2
        : s < -0.35 ? y - bh : s > 0.35 ? y : y - bh / 2;
      ctx.textAlign = align;
      ctx.textBaseline = 'alphabetic';
      ctx.globalAlpha = e;
      ctx.font = INTER(600)(ls);
      ctx.fillStyle = rgba(p.ink, 0.88);
      ctx.fillText(ellipsize(ctx, row.label, lw + m * 0.01), x, topY + ls * 0.82);
      // valores: A (destaque) · B (neutro), aparecem quando cada série chega
      const eA = ease.outCubic(seg(t, T_A + stagger(i, n, spread) + 0.3, T_A + stagger(i, n, spread) + 0.9)) * (1 - outS(i, OUT));
      const eB = hasB && row.b != null ? ease.outCubic(seg(t, T_B + stagger(i, n, spread) + 0.3, T_B + stagger(i, n, spread) + 0.9)) * (1 - outS(i, OUT + 0.1)) : 0;
      const tA = fmt(row.a, dec);
      const tB = eB > 0 ? fmt(row.b, dec) : '';
      ctx.font = MONO(700)(vs);
      const wA = ctx.measureText(tA).width;
      ctx.font = MONO(500)(vs);
      const sep = tB ? `  ${tB}` : '';
      const wB = ctx.measureText(sep).width;
      const tot = wA + wB;
      const x0 = align === 'left' ? x : align === 'right' ? x - tot : x - tot / 2;
      const vy = topY + ls + vs * 1.15;
      ctx.textAlign = 'left';
      if (eA > 0.01) {
        ctx.globalAlpha = e * eA;
        ctx.font = MONO(700)(vs);
        ctx.fillStyle = p.accent;
        ctx.fillText(tA, x0, vy);
      }
      if (eB > 0.01) {
        ctx.globalAlpha = e * eB;
        ctx.font = MONO(500)(vs);
        ctx.fillStyle = rgba(p.ink, 0.45);
        ctx.fillText(sep, x0 + wA, vy);
      }
      ctx.globalAlpha = 1;
    }
  },
};
