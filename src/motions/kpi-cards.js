import { TAU, clamp, seg, ease, spring, stagger, rgba, rng } from '../lib/anim.js';
import { createNoise } from '../lib/noise.js';

// ---------- helpers locais ----------

// Número em texto livre → { v, dec, pre, suf }. Vírgula = decimal (pt-BR). Prefixo/sufixo = texto ao redor.
function parseVal(raw) {
  const str = String(raw).trim();
  const m = str.match(/^(.*?)(-?\d[\d.,]*)(.*)$/);
  if (!m) return null;
  let s = m[2];
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
  if (!Number.isFinite(v)) return null;
  return { v, dec: Math.min(3, frac.length), pre: m[1], suf: m[3] };
}

// "Rótulo | valor | variação" por linha (também aceita ; ou tab).
function parse(text) {
  const out = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const l = line.trim();
    if (!l || l.startsWith('#')) continue;
    const parts = l.split(/\s*[|;\t]\s*/);
    if (parts.length < 2) continue;
    const val = parseVal(parts[1]);
    if (!val) continue;
    const delta = parts[2] ? parseVal(parts[2]) : null;
    const signTxt = (parts[2] || '').trim();
    out.push({
      label: parts[0] || '—',
      val,
      delta,
      // variação: sinal explícito, ou ▲/▼ ou ↑/↓
      dir: !delta ? 0 : /^[-−▼↓]/.test(signTxt) || delta.v < 0 ? -1 : delta.v === 0 ? 0 : 1,
      // "!" no fim da variação inverte as cores (queda boa, ex.: churn)
      invert: /!\s*$/.test(signTxt),
    });
    if (out.length === 4) break;
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

const DEFAULT = `Revenue | R$ 1.284.500 | +12,4%
Active users | 48.920 | +8,1%
Churn | 2,3% | -0,6 p.p.!
Avg. ticket | R$ 186,40 | -3,2%`;

const SPARK = 28; // pontos da sparkline

export default {
  id: 'kpi-cards',
  title: 'KPI Cards',
  description: 'Metric cards with counting numbers, a green/red change arrow and a sparkline drawing itself.',
  category: 'dados',
  tags: ['data', 'ui', 'alpha'],
  duration: 6,
  poster: 3.4,

  params: {
    title: { type: 'text', label: 'Title', default: 'Quarterly results' },
    data: { type: 'textarea', label: 'Metrics (label | value | change; "!" flips color)', rows: 5, default: DEFAULT },
    up: { type: 'color', label: 'Up', default: '#2fd27a' },
    down: { type: 'color', label: 'Down', default: '#ff5a5f' },
    panel: { type: 'color', label: 'Card', default: '#17191e' },
    ink: { type: 'color', label: 'Text', default: '#f2efe8' },
    bg: { type: 'color', label: 'Background', default: '#0b0c0f' },
    transparent: { type: 'boolean', label: 'Transparent background', default: false },
    seed: { type: 'range', label: 'Seed (sparklines)', min: 1, max: 99, step: 1, default: 7 },
  },

  setup({ p }) {
    const items = parse(p.data);
    const noise = createNoise(p.seed);
    const r = rng(p.seed * 7 + 3);
    // sparkline: passeio suave que termina na direção da variação
    for (const [k, it] of items.entries()) {
      const pts = new Float32Array(SPARK);
      const trend = it.dir === 0 ? 0 : it.dir * (0.5 + r() * 0.4);
      for (let i = 0; i < SPARK; i++) {
        const x = i / (SPARK - 1);
        pts[i] = trend * x + 0.32 * noise.noise2(x * 2.6, k * 11.3) + 0.05 * noise.noise2(x * 8, k * 5.1 + 40);
      }
      let lo = Infinity, hi = -Infinity;
      for (const v of pts) (lo = Math.min(lo, v)), (hi = Math.max(hi, v));
      for (let i = 0; i < SPARK; i++) pts[i] = (pts[i] - lo) / (hi - lo || 1);
      it.spark = pts;
    }
    return { items };
  },

  render(ctx, t, { w, h, p, duration, state }) {
    if (!p.transparent) {
      ctx.fillStyle = p.bg;
      ctx.fillRect(0, 0, w, h);
      const vg = ctx.createRadialGradient(w * 0.5, h * 0.45, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.8);
      vg.addColorStop(0, rgba('#000000', 0));
      vg.addColorStop(1, rgba('#000000', 0.35));
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, w, h);
    }
    const { items } = state;
    const n = items.length;
    const m = Math.min(w, h);
    const ar = w / h;
    const OUT = duration - 0.9;
    const outAll = ease.inCubic(seg(t, OUT + 0.2, duration - 0.1));

    // ---------- grade ----------
    const cols = ar > 1.4 ? n : ar < 0.75 ? 1 : n <= 2 ? n : 2;
    const rows = Math.ceil(n / Math.max(cols, 1));
    const padX = w * (ar > 1.4 ? 0.05 : 0.08);
    const gapC = m * 0.03;
    const ts = m * (ar < 0.75 ? 0.06 : 0.05);
    const titleH = p.title ? ts * 1.9 : 0;
    const margin = h * (ar < 0.75 ? 0.08 : 0.1);
    const cw = (w - padX * 2 - gapC * (Math.max(cols, 1) - 1)) / Math.max(cols, 1);
    const maxCH = (h - margin * 2 - titleH - gapC * (rows - 1)) / Math.max(rows, 1);
    const ch = Math.min(maxCH, cw * (cols === 1 ? 0.5 : 1.08));
    const gridH = ch * rows + gapC * (rows - 1);
    const top0 = Math.max(margin, (h - titleH - gridH) / 2);
    const gy = top0 + titleH;

    // título
    if (p.title) {
      const tIn = ease.outExpo(seg(t, 0.05, 0.9));
      const base = top0 + ts * 0.95;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, base - ts * 1.1, w, ts * 1.5);
      ctx.clip();
      const fs = fitFont(ctx, p.title, w - padX * 2, ts, INTER(800));
      ctx.letterSpacing = `${-fs * 0.02}px`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = rgba(p.ink, 1 - outAll);
      ctx.fillText(p.title, padX, base + (1 - tIn) * fs * 1.3);
      ctx.letterSpacing = '0px';
      ctx.restore();
    }
    if (!n) {
      ctx.font = INTER(500)(m * 0.028);
      ctx.fillStyle = rgba(p.ink, 0.5);
      ctx.textAlign = 'center';
      ctx.fillText('No metrics — use "label | value | change" per line', w / 2, h / 2);
      return;
    }

    for (let i = 0; i < n; i++) {
      const it = items[i];
      const c = i % cols;
      const r = Math.floor(i / cols);
      const inRow = r === rows - 1 ? n - r * cols : cols; // última linha incompleta fica centralizada
      const x = padX + c * (cw + gapC) + ((cols - inRow) * (cw + gapC)) / 2;
      const y = gy + r * (ch + gapC);
      const a = 0.3 + stagger(i, n, 0.45);
      const inK = spring(seg(t, a, a + 1.0), 0.15);
      const op = clamp(seg(t, a, a + 0.35));
      const oI = ease.inCubic(seg(t, OUT + stagger(i, n, 0.25), OUT + 0.55 + stagger(i, n, 0.25)));
      if (op <= 0 || oI >= 1) continue;
      const good = it.dir === 0 ? 0 : it.invert ? -it.dir : it.dir;
      const tone = good > 0 ? p.up : good < 0 ? p.down : p.ink;
      const u = Math.min(cw, ch * 1.3) / 400; // unidade do card

      ctx.save();
      ctx.globalAlpha = op * (1 - oI);
      ctx.translate(0, (1 - inK) * m * 0.06 + oI * m * 0.04);

      // card
      ctx.fillStyle = p.transparent ? rgba(p.panel, 0.94) : p.panel;
      ctx.beginPath();
      ctx.roundRect(x, y, cw, ch, 22 * u);
      ctx.fill();
      const hl = ctx.createLinearGradient(0, y, 0, y + ch);
      hl.addColorStop(0, rgba('#ffffff', 0.07));
      hl.addColorStop(1, rgba('#ffffff', 0.02));
      ctx.strokeStyle = hl;
      ctx.lineWidth = Math.max(1, 1.5 * u);
      ctx.stroke();

      const pad = 28 * u;
      const innerW = cw - pad * 2;
      // rótulo
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.font = INTER(600)(Math.min(30 * u, ch * 0.08));
      ctx.fillStyle = rgba(p.ink, 0.58);
      ctx.fillText(ellipsize(ctx, it.label, innerW), x + pad, y + pad);

      // valor contando
      const cnt = ease.outExpo(seg(t, a + 0.15, a + 2.0));
      const v = it.val;
      const full = `${v.pre}${fmt(v.v, v.dec)}${v.suf}`;
      const vsz = fitFont(ctx, full, innerW, Math.min(76 * u, ch * 0.22), INTER(800));
      ctx.letterSpacing = `${-vsz * 0.025}px`;
      ctx.fillStyle = p.ink;
      const vy = y + pad + Math.min(30 * u, ch * 0.08) * 1.6;
      ctx.fillText(`${v.pre}${fmt(v.v * cnt, v.dec)}${v.suf}`, x + pad, vy);
      ctx.letterSpacing = '0px';

      // pílula de variação
      if (it.delta) {
        const pIn = spring(seg(t, a + 0.8, a + 1.5), 0.3);
        if (pIn > 0.001) {
          const ds = Math.min(24 * u, ch * 0.07);
          const dTxt = `${fmt(Math.abs(it.delta.v), it.delta.dec)}${it.delta.suf.replace(/!\s*$/, '')}`;
          ctx.font = INTER(700)(ds);
          const tw = ctx.measureText(dTxt).width;
          const ph = ds * 1.7;
          const pw = tw + ds * 2.6;
          const px0 = x + pad;
          const py0 = vy + vsz * 1.2;
          ctx.save();
          ctx.translate(px0, py0 + ph / 2);
          ctx.scale(pIn, pIn);
          ctx.fillStyle = rgba(tone, 0.15);
          ctx.beginPath();
          ctx.roundRect(0, -ph / 2, pw, ph, ph / 2);
          ctx.fill();
          // seta
          const ax = ds * 1.0;
          const as = ds * 0.42;
          ctx.fillStyle = tone;
          ctx.beginPath();
          if (it.dir === 0) {
            ctx.rect(ax - as, -as * 0.18, as * 2, as * 0.36);
          } else if (it.dir > 0) {
            ctx.moveTo(ax - as, as * 0.55);
            ctx.lineTo(ax + as, as * 0.55);
            ctx.lineTo(ax, -as * 0.8);
          } else {
            ctx.moveTo(ax - as, -as * 0.55);
            ctx.lineTo(ax + as, -as * 0.55);
            ctx.lineTo(ax, as * 0.8);
          }
          ctx.closePath();
          ctx.fill();
          ctx.textBaseline = 'middle';
          ctx.fillText(dTxt, ds * 1.9, ds * 0.05);
          ctx.restore();
        }
      }

      // sparkline
      const sTop = y + ch * 0.6;
      const sBot = y + ch - pad * 0.9;
      const sx0 = x + pad;
      const sx1 = x + cw - pad;
      const draw = ease.inOutCubic(seg(t, a + 0.5, a + 2.1));
      if (draw > 0.001 && sBot - sTop > 8 * u) {
        const pts = it.spark;
        const N = pts.length;
        const pt = (j) => [sx0 + ((sx1 - sx0) * j) / (N - 1), sBot - (sBot - sTop) * pts[j]];
        const end = draw * (N - 1);
        const j1 = Math.floor(end);
        const fr = end - j1;
        const path = [];
        for (let j = 0; j <= j1; j++) path.push(pt(j));
        if (j1 < N - 1) {
          const [ax2, ay2] = pt(j1);
          const [bx2, by2] = pt(j1 + 1);
          path.push([ax2 + (bx2 - ax2) * fr, ay2 + (by2 - ay2) * fr]);
        }
        // área
        const g = ctx.createLinearGradient(0, sTop, 0, sBot);
        g.addColorStop(0, rgba(tone, 0.22));
        g.addColorStop(1, rgba(tone, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(path[0][0], sBot);
        for (const [px, py] of path) ctx.lineTo(px, py);
        ctx.lineTo(path[path.length - 1][0], sBot);
        ctx.closePath();
        ctx.fill();
        // linha
        ctx.strokeStyle = tone;
        ctx.lineWidth = Math.max(1.5, 3 * u);
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.beginPath();
        path.forEach(([px, py], j) => (j ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
        ctx.stroke();
        // ponto final pulsando
        const [ex, ey] = path[path.length - 1];
        const pulse = draw >= 1 ? (t - (a + 2.1)) % 1.2 / 1.2 : 0;
        if (pulse > 0) {
          ctx.fillStyle = rgba(tone, 0.35 * (1 - pulse));
          ctx.beginPath();
          ctx.arc(ex, ey, 6 * u + pulse * 16 * u, 0, TAU);
          ctx.fill();
        }
        ctx.fillStyle = tone;
        ctx.beginPath();
        ctx.arc(ex, ey, 5.5 * u, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
  },
};
