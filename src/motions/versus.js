import { clamp, lerp, seg, ease, spring, stagger, rgba, hexToRgb } from '../lib/anim.js';

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

const SERIF_IT = (s) => `italic 400 ${s}px 'Instrument Serif', Georgia, serif`;

// valor com prefixo/sufixo preservados ("58%", "R$ 12", "4,2 km")
function parseVal(raw) {
  const s = String(raw || '').trim();
  const m = s.match(/^([^\d-]*?)(-?[\d.,]*\d)(.*)$/);
  if (!m) return null;
  const n = parseNum(m[2]);
  if (!n) return null;
  return { v: n.v, dec: Math.min(2, n.dec), pre: m[1], suf: m[3].trim() ? (m[3].startsWith(' ') ? ' ' : '') + m[3].trim() : '' };
}

// "Rótulo; valor A; valor B[; menor]" por linha (separador ; | ou tab; sem eles, vírgula seguida de espaço).
function parseData(text) {
  const out = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const l = line.trim();
    if (!l || l.startsWith('#')) continue;
    const cells = (/[;\t|]/.test(l) ? l.split(/\s*[;\t|]\s*/) : l.split(/,\s+/)).map((c) => c.trim());
    if (cells.length < 3) continue;
    const a = parseVal(cells[1]);
    const b = parseVal(cells[2]);
    if (!a || !b) continue;
    const lower = /menor|lower|↓/i.test(cells[3] || '');
    out.push({ label: cells[0] || '—', a, b, lower });
  }
  return out;
}

const DEFAULT_DATA = `Posse de bola; 58%; 42%
Finalizações; 16; 9
Chutes no gol; 7; 3
Passes certos; 512; 388
Escanteios; 4; 6
Desarmes; 14; 19
Faltas cometidas; 11; 15; menor`;

export default {
  id: 'versus',
  title: 'Versus',
  description: 'Comparação A × B: barras opostas crescem do centro, o vencedor de cada linha acende e o placar de linhas vencidas fecha o quadro.',
  category: 'dados',
  tags: ['dados', 'ui', 'broadcast'],
  duration: 8,
  poster: 5.6,

  params: {
    title: { type: 'text', label: 'Título', default: 'Estatísticas da partida' },
    nameA: { type: 'text', label: 'Lado A', default: 'Brasil' },
    nameB: { type: 'text', label: 'Lado B', default: 'Argentina' },
    data: { type: 'textarea', label: 'Dados (Rótulo; A; B[; menor])', rows: 8, default: DEFAULT_DATA },
    tally: { type: 'boolean', label: 'Placar de linhas vencidas', default: true },
    accent: { type: 'color', label: 'Destaque', default: '#ff5a36' },
    ink: { type: 'color', label: 'Texto', default: '#f2efe8' },
    bg: { type: 'color', label: 'Fundo', default: '#0e0f12' },
    transparent: { type: 'boolean', label: 'Fundo transparente', default: false },
  },

  setup({ w, h, px, p }) {
    const rows = parseData(p.data);
    let winsA = 0, winsB = 0;
    for (const r of rows) {
      const mx = Math.max(Math.abs(r.a.v), Math.abs(r.b.v)) || 1;
      r.fa = Math.abs(r.a.v) / mx;
      r.fb = Math.abs(r.b.v) / mx;
      r.win = r.a.v === r.b.v ? 0 : (r.a.v > r.b.v) !== r.lower ? -1 : 1; // -1 = A, 1 = B
      if (r.win < 0) winsA++;
      else if (r.win > 0) winsB++;
    }
    return { rows, winsA, winsB, bgc: p.transparent ? null : bgBuffer(w, h, px, p.bg) };
  },

  render(ctx, t, { w, h, p, duration, state }) {
    const { rows, winsA, winsB, bgc } = state;
    if (bgc) ctx.drawImage(bgc, 0, 0, w, h);
    const n = rows.length;
    const m = Math.min(w, h);
    const ar = w / h;
    const portrait = ar < 0.9;
    const wide = ar > 1.3;
    const gapMode = ar > 1.25; // rótulo no vão central; senão rótulo acima das barras

    const OUT = duration - 0.9;
    const outAll = ease.inCubic(seg(t, OUT, duration - 0.08));
    const vis = 1 - outAll;

    const padX = wide ? w * 0.07 : w * 0.08;
    const innerW = w - padX * 2;
    const cx = w / 2;

    // ---------- cabeçalho: título, nomes e × ----------
    const top = portrait ? h * 0.085 : h * 0.09;
    const eyeS = m * (portrait ? 0.024 : 0.021);
    const eyeIn = ease.outExpo(seg(t, 0.05, 0.9));
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'center';
    ctx.font = INTER(600)(eyeS);
    ctx.letterSpacing = `${eyeS * 0.18}px`;
    const eye = ellipsize(ctx, (p.title || '').toUpperCase(), innerW);
    ctx.fillStyle = rgba(p.ink, 0.5 * eyeIn * vis);
    // letterSpacing com center desloca meio espaçamento
    ctx.fillText(eye, cx + eyeS * 0.09, top + (1 - eyeIn) * eyeS);
    ctx.letterSpacing = '0px';

    const nameS0 = m * (portrait ? 0.075 : 0.068);
    const xW = nameS0 * (p.tally ? 2.3 : 1.0); // largura reservada ao × (e placar)
    const nameY = top + eyeS * 1.2 + nameS0 * 1.25;
    const nameMax = innerW / 2 - xW;
    const nIn = (d) => ease.outExpo(seg(t, 0.2 + d, 1.2 + d));
    const sA = fitFont(ctx, p.nameA, nameMax, nameS0, INTER(800));
    const sB = fitFont(ctx, p.nameB, nameMax, nameS0, INTER(800));
    const nS = Math.min(sA, sB);
    ctx.font = INTER(800)(nS);
    ctx.letterSpacing = `${-nS * 0.025}px`;
    const kA = nIn(0), kB = nIn(0.08);
    ctx.textAlign = 'left';
    ctx.fillStyle = rgba(p.ink, kA * vis);
    ctx.fillText(p.nameA, padX - (1 - kA) * m * 0.08, nameY);
    ctx.textAlign = 'right';
    ctx.fillStyle = rgba(p.ink, kB * vis);
    ctx.fillText(p.nameB, w - padX + (1 - kB) * m * 0.08, nameY);
    ctx.letterSpacing = '0px';

    // marcas A/B: traço sob cada nome
    const lineY = nameY + nS * 0.38;
    const mk = ease.outExpo(seg(t, 0.5, 1.4)) * vis;
    ctx.fillStyle = rgba(p.ink, 0.14);
    ctx.fillRect(padX, lineY, innerW * mk, Math.max(1, m * 0.0015));

    // × no centro, e o placar de linhas vencidas ao redor no fim
    const xk = spring(seg(t, 0.45, 1.25), 0.3) * vis;
    const T_TALLY = 1.0 + Math.min(2.6, 0.42 * Math.max(0, n - 1)) + 1.6;
    const tk = p.tally && n ? ease.outExpo(seg(t, T_TALLY, T_TALLY + 0.9)) * vis : 0;
    if (xk > 0.01) {
      ctx.save();
      ctx.translate(cx, nameY - nS * 0.34);
      ctx.scale(xk, xk);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = SERIF_IT(nS * 1.15);
      ctx.fillStyle = p.accent;
      ctx.fillText('×', 0, nS * 0.04);
      ctx.restore();
    }
    if (tk > 0.01) {
      const ts = nS * 0.9;
      ctx.font = INTER(800)(ts);
      ctx.textBaseline = 'alphabetic';
      const off = nS * 0.62;
      const ya = nameY + (1 - tk) * ts * 0.4;
      ctx.globalAlpha = tk;
      ctx.textAlign = 'right';
      ctx.fillStyle = winsA > winsB ? p.accent : rgba(p.ink, 0.55);
      ctx.fillText(fmt(winsA), cx - off, ya);
      ctx.textAlign = 'left';
      ctx.fillStyle = winsB > winsA ? p.accent : rgba(p.ink, 0.55);
      ctx.fillText(fmt(winsB), cx + off, ya);
      ctx.globalAlpha = 1;
    }

    if (!n) {
      ctx.font = INTER(500)(m * 0.028);
      ctx.fillStyle = rgba(p.ink, 0.5);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Sem dados — use "Rótulo; valor A; valor B" por linha', w / 2, h / 2);
      return;
    }

    // ---------- linhas ----------
    const areaTop = lineY + m * (portrait ? 0.07 : 0.055);
    const areaBot = h - h * (portrait ? 0.08 : 0.08);
    const rowH = Math.min((areaBot - areaTop) / n, m * (portrait ? 0.2 : 0.16));
    const y0 = areaTop + ((areaBot - areaTop) - rowH * n) / 2;
    const lsz = clamp(rowH * (gapMode ? 0.26 : 0.24), m * 0.018, m * (portrait ? 0.036 : 0.03));
    const vsz = lsz * 1.12;
    const barH = gapMode ? Math.min(rowH * 0.34, lsz * 1.25) : Math.min(rowH * 0.2, lsz * 0.8);
    // largura reservada para os valores (o maior texto)
    ctx.font = MONO(600)(vsz);
    let valW = 0;
    for (const r of rows) {
      valW = Math.max(valW, ctx.measureText(`${r.a.pre}${fmt(r.a.v, r.a.dec)}${r.a.suf}`).width);
      valW = Math.max(valW, ctx.measureText(`${r.b.pre}${fmt(r.b.v, r.b.dec)}${r.b.suf}`).width);
    }
    const labW = gapMode ? innerW * 0.22 : 0;
    const halfGap = gapMode ? labW / 2 : m * 0.006;
    const barMax = gapMode ? innerW / 2 - halfGap - valW - m * 0.03 : innerW / 2 - halfGap;
    const rad = barH / 2;

    const D0 = 1.0;
    const spread = Math.min(2.6, 0.42 * Math.max(0, n - 1));
    const BG = hexToRgb(p.bg), INK = hexToRgb(p.ink), ACC = hexToRgb(p.accent);
    const neutralA = mixA(BG, INK, 0.5);
    const loser = mixA(BG, INK, 0.26);
    const valN = mixA(BG, INK, 0.78);
    const valL = mixA(BG, INK, 0.5);

    for (let i = 0; i < n; i++) {
      const r = rows[i];
      const at = D0 + stagger(i, n, spread);
      const fin = ease.outExpo(seg(t, at - 0.05, at + 0.7));
      const a = fin * vis;
      if (a <= 0.005) continue;
      const gr = ease.outExpo(seg(t, at + 0.1, at + 1.2));
      const dec = ease.inOutCubic(seg(t, at + 0.9, at + 1.4)); // vencedor acende
      const ry = y0 + rowH * i;
      const by = gapMode ? ry + rowH / 2 : ry + rowH * 0.62;
      const ly = gapMode ? by : ry + rowH * 0.3;

      ctx.globalAlpha = a;
      // trilho
      ctx.fillStyle = rgba(p.ink, 0.06);
      ctx.beginPath();
      ctx.roundRect(cx - halfGap - barMax, by - barH / 2, barMax, barH, rad);
      ctx.roundRect(cx + halfGap, by - barH / 2, barMax, barH, rad);
      ctx.fill();
      // barras
      const colOf = (side) => css(r.win === 0 ? neutralA : r.win === side ? mixA(neutralA, ACC, dec) : mixA(neutralA, loser, dec));
      const valOf = (side) => css(r.win === 0 ? valN : r.win === side ? mixA(valN, ACC, dec) : mixA(valN, valL, dec));
      const la = Math.max(barH * 0.0, barMax * r.fa * gr);
      const lb = Math.max(barH * 0.0, barMax * r.fb * gr);
      if (la > 0.5) {
        ctx.fillStyle = colOf(-1);
        ctx.beginPath();
        ctx.roundRect(cx - halfGap - la, by - barH / 2, la, barH, Math.min(rad, la / 2));
        ctx.fill();
      }
      if (lb > 0.5) {
        ctx.fillStyle = colOf(1);
        ctx.beginPath();
        ctx.roundRect(cx + halfGap, by - barH / 2, lb, barH, Math.min(rad, lb / 2));
        ctx.fill();
      }

      // rótulo
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = INTER(600)(lsz);
      ctx.fillStyle = rgba(p.ink, 0.78);
      const lab = ellipsize(ctx, r.label, gapMode ? labW - m * 0.02 : innerW - valW * 2 - m * 0.06);
      ctx.fillText(lab, cx, ly + (1 - fin) * lsz * 0.6);

      // valores
      const cnt = ease.outExpo(seg(t, at + 0.1, at + 1.3));
      const txt = (v) => `${v.pre}${fmt(v.v * cnt, v.dec)}${v.suf}`;
      const vy = ly + (gapMode ? 0 : 0);
      ctx.font = MONO(600)(vsz);
      ctx.textAlign = 'left';
      ctx.fillStyle = valOf(-1);
      ctx.fillText(txt(r.a), padX, vy);
      ctx.textAlign = 'right';
      ctx.fillStyle = valOf(1);
      ctx.fillText(txt(r.b), w - padX, vy);
      ctx.globalAlpha = 1;
    }
  },
};
