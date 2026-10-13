import { clamp, seg, ease, spring, stagger, rgba, hexToRgb } from '../lib/anim.js';

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
  if (!fmtCache.has(dec)) fmtCache.set(dec, new Intl.NumberFormat('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }));
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

// "Rótulo, valor" por linha (também ; tab | :). Valores ≤ 0 são ignorados.
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

// Treemap squarified (Bruls et al.): itens em ordem decrescente, área já em px².
function squarify(items, x, y, w, h) {
  const out = [];
  const worst = (sum, mn, mx, s) => Math.max((s * s * mx) / (sum * sum), (sum * sum) / (s * s * mn));
  let i = 0;
  while (i < items.length) {
    const s = Math.min(w, h);
    let j = i + 1;
    let sum = items[i].a;
    let mn = sum;
    let mx = sum;
    let best = worst(sum, mn, mx, s);
    while (j < items.length) {
      const a = items[j].a;
      const r = worst(sum + a, Math.min(mn, a), Math.max(mx, a), s);
      if (r > best) break;
      sum += a;
      mn = Math.min(mn, a);
      mx = Math.max(mx, a);
      best = r;
      j++;
    }
    const thick = sum / s;
    let o = 0;
    for (let k = i; k < j; k++) {
      const len = items[k].a / thick;
      if (w >= h) out.push({ it: items[k], x, y: y + o, w: thick, h: len });
      else out.push({ it: items[k], x: x + o, y, w: len, h: thick });
      o += len;
    }
    if (w >= h) {
      x += thick;
      w -= thick;
    } else {
      y += thick;
      h -= thick;
    }
    i = j;
  }
  return out;
}

const DEFAULT_DATA = `Paid media, 3820
Content, 2140
Events, 1460
SEO, 940
Partnerships, 720
CRM, 510
Influencers, 380
Research, 210`;

export default {
  id: 'treemap',
  title: 'Treemap',
  description: 'A squarified treemap whose blocks spring in from largest to smallest, with labels, counting values and share.',
  category: 'dados',
  tags: ['data', 'ui'],
  duration: 7,
  poster: 4.0,

  params: {
    title: { type: 'text', label: 'Title', default: 'Marketing budget' },
    subtitle: { type: 'text', label: 'Subtitle', default: 'Spend by channel · 2025' },
    data: { type: 'textarea', label: 'Data (Label, value)', rows: 9, default: DEFAULT_DATA },
    prefix: { type: 'text', label: 'Value prefix', default: '$' },
    suffix: { type: 'text', label: 'Value suffix', default: 'K' },
    gap: { type: 'range', label: 'Block spacing', min: 0, max: 0.03, step: 0.001, default: 0.008 },
    accent: { type: 'color', label: 'Accent', default: '#7c6cff' },
    ink: { type: 'color', label: 'Text', default: '#f2efe8' },
    bg: { type: 'color', label: 'Background', default: '#0e0e13' },
  },

  setup({ w, h, px, p }) {
    const items = parseData(p.data).sort((a, b) => b.v - a.v);
    const total = items.reduce((s, d) => s + d.v, 0);
    const [r, g, b] = hexToRgb(p.accent);
    const accLight = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.62;
    return { items, total, accLight, bgc: bakeBg(w, h, px, p.bg, p.accent) };
  },

  render(ctx, t, { w, h, p, duration, state }) {
    const { items, total, accLight, bgc } = state;
    ctx.drawImage(bgc, 0, 0, w, h);
    const OUT = duration - 1.15;
    const outAll = ease.inCubic(seg(t, OUT + 0.4, duration - 0.08));
    const H = drawHeader(ctx, t, w, h, p, outAll);
    const { m, portrait, padX } = H;
    const n = items.length;

    if (!n) {
      ctx.font = INTER(500)(H.subSize * 1.3);
      ctx.fillStyle = rgba(p.ink, 0.5);
      ctx.textAlign = 'center';
      ctx.fillText('No data — use one "Label, value" line per block', w / 2, h / 2);
      return;
    }

    // ---------- layout ----------
    const X0 = padX;
    const Y0 = H.bot + m * (portrait ? 0.07 : 0.05);
    const W = w - padX * 2;
    const HH = h - (portrait ? h * 0.08 : h * 0.09) - Y0;
    const scale = (W * HH) / total;
    const rects = squarify(items.map((d) => ({ ...d, a: d.v * scale })), X0, Y0, W, HH);
    const gap = m * p.gap;
    const rad = Math.min(m * 0.01, gap * 1.5 + m * 0.002);
    const dec = items.reduce((d, it) => Math.max(d, it.dec), 0);
    const fmtV = (v) => `${p.prefix}${fmt(v, dec)}${p.suffix}`;

    // ---------- tempos ----------
    const T0 = 0.75;
    const spread = Math.min(1.8, 0.24 * n);
    const blockAt = (i) => T0 + stagger(i, n, spread);
    const outBlock = (i) => ease.inBack(seg(t, OUT + stagger(n - 1 - i, n, 0.45), OUT + 0.55 + stagger(n - 1 - i, n, 0.45)));
    const textOn = accLight ? p.bg : '#ffffff';

    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      const a = blockAt(i);
      const s = spring(seg(t, a, a + 1.0), 0.16) * (1 - outBlock(i));
      if (s <= 0.002) continue;
      const bw0 = Math.max(0, r.w - gap);
      const bh0 = Math.max(0, r.h - gap);
      const k = 0.35 + 0.65 * s;
      // a mola passa um pouco do tamanho final, mas só até o meio do vão
      const bw = Math.min(bw0 * k, bw0 + gap * 0.5);
      const bh = Math.min(bh0 * k, bh0 + gap * 0.5);
      const cx = r.x + r.w / 2;
      const cy = r.y + r.h / 2;
      const bx = cx - bw / 2;
      const by = cy - bh / 2;
      const isTop = i === 0;
      const alpha = clamp(s * 2.5);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = isTop ? p.accent : rgba(p.ink, 0.15 - (0.1 * (i - 1)) / Math.max(1, n - 2));
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, bh, Math.min(rad, bw / 2, bh / 2));
      ctx.fill();
      // filete claro no topo
      if (!isTop) {
        ctx.fillStyle = rgba(p.ink, 0.06);
        ctx.fillRect(bx + rad, by, Math.max(0, bw - rad * 2), Math.max(1, m * 0.0012));
      }
      ctx.globalAlpha = 1;

      // ---------- rótulos ----------
      const os = OUT + stagger(n - 1 - i, n, 0.45);
      const e = ease.outExpo(seg(t, a + 0.35, a + 1.15)) * (1 - seg(t, os - 0.1, os + 0.2)) * (1 - outAll);
      if (e <= 0.01) continue;
      const pad = clamp(Math.min(bw0, bh0) * 0.09, m * 0.012, m * 0.028);
      const fs = clamp(Math.sqrt(bw0 * bh0) * 0.07, m * 0.019, m * (portrait ? 0.036 : 0.032));
      const vs = Math.max(fs * 0.78, m * 0.016);
      const innerW = bw0 - pad * 2;
      if (innerW < fs * 3 || bh0 < fs * 1.3 + pad * 2) continue;
      const lx = r.x + gap / 2 + pad;
      const ly = r.y + gap / 2 + pad;
      const ink = isTop ? textOn : p.ink;
      ctx.save();
      ctx.beginPath();
      ctx.rect(bx, by, bw, bh);
      ctx.clip();
      ctx.globalAlpha = e;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      const dy = (1 - e) * fs * 0.6;
      ctx.font = INTER(650)(fs);
      ctx.fillStyle = isTop ? ink : rgba(ink, 0.92);
      ctx.fillText(ellipsize(ctx, r.it.label, innerW), lx, ly + fs * 0.85 + dy);
      const cnt = ease.outExpo(seg(t, a + 0.2, a + 1.6));
      if (bh0 >= fs * 1.1 + vs * 1.5 + pad * 2) {
        ctx.font = MONO(500)(vs);
        ctx.fillStyle = rgba(ink, isTop ? 0.78 : 0.5);
        ctx.fillText(ellipsize(ctx, fmtV(r.it.v * cnt), innerW), lx, ly + fs * 0.85 + vs * 1.45 + dy);
      }
      // participação grande no rodapé dos blocos que comportam
      const pct = (r.it.v / total) * 100;
      const pTxt = `${fmt(pct * cnt, pct < 10 ? 1 : 0)}%`;
      const ps = Math.min(bh0 * 0.3, bw0 * 0.22, fs * 2.6);
      const spaceBelow = bh0 - pad * 2 - (fs * 0.85 + vs * 1.45);
      if (ps > fs * 1.15 && spaceBelow > ps * 1.25) {
        ctx.font = INTER(800)(ps);
        ctx.letterSpacing = `${-ps * 0.03}px`;
        ctx.fillStyle = isTop ? ink : rgba(ink, 0.85);
        ctx.fillText(pTxt, lx, r.y + gap / 2 + bh0 - pad - ps * 0.05 + (1 - e) * ps * 0.4);
        ctx.letterSpacing = '0px';
      } else if (spaceBelow > vs * 1.4) {
        // percentual pequeno no canto inferior
        ctx.font = INTER(700)(vs);
        ctx.textAlign = 'right';
        ctx.fillStyle = rgba(ink, isTop ? 0.85 : 0.6);
        ctx.fillText(pTxt, lx + innerW, r.y + gap / 2 + bh0 - pad);
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  },
};
