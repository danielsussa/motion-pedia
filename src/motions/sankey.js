import { clamp, seg, ease, stagger, rgba } from '../lib/anim.js';

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

// "Origem > Destino, valor" por linha (também -> e →).
function parseFlows(text) {
  const out = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const l = line.trim();
    if (!l || l.startsWith('#')) continue;
    const m = l.match(/^(.+?)\s*(?:->|→|>)\s*(.+?)(?:,\s+|\s*[;\t|:]\s*)([^;\t|:>]*\d[^;\t|:>]*)$/);
    if (!m) continue;
    const n = parseNum(m[3]);
    if (!n || n.v <= 0) continue;
    const s = m[1].trim();
    const d = m[2].trim();
    if (!s || !d || s === d) continue;
    out.push({ s, d, v: n.v, dec: Math.min(2, n.dec) });
  }
  return out;
}

// Cúbica de Bézier: ponto em u e a sub-curva [0, u] (de Casteljau).
function splitBez(p0, p1, p2, p3, u) {
  const l = (a, b) => a + (b - a) * u;
  const a = l(p0, p1);
  const b = l(p1, p2);
  const c = l(p2, p3);
  const d = l(a, b);
  const e = l(b, c);
  return [p0, a, d, l(d, e)];
}

const DEFAULT_DATA = `Produtos > Receita, 620
Serviços > Receita, 280
Licenças > Receita, 140
Receita > Custos, 430
Receita > Lucro bruto, 610
Lucro bruto > Operação, 260
Lucro bruto > Impostos, 110
Lucro bruto > Lucro líquido, 240`;

export default {
  id: 'sankey',
  title: 'Sankey',
  description: 'Diagrama de Sankey em que os fluxos escorrem coluna a coluna, se dividindo entre os nós, e o caminho até o destaque acende.',
  category: 'dados',
  tags: ['dados', 'ui'],
  duration: 8,
  poster: 5.4,

  params: {
    title: { type: 'text', label: 'Título', default: 'Da receita ao lucro' },
    subtitle: { type: 'text', label: 'Subtítulo', default: 'Demonstrativo anual · em milhões de reais' },
    data: { type: 'textarea', label: 'Fluxos (Origem > Destino, valor)', rows: 9, default: DEFAULT_DATA },
    highlight: { type: 'text', label: 'Nó em destaque', default: 'Lucro líquido' },
    prefix: { type: 'text', label: 'Prefixo do valor', default: 'R$ ' },
    suffix: { type: 'text', label: 'Sufixo do valor', default: ' mi' },
    accent: { type: 'color', label: 'Destaque', default: '#3ddc97' },
    ink: { type: 'color', label: 'Texto', default: '#f2efe8' },
    bg: { type: 'color', label: 'Fundo', default: '#0d1012' },
  },

  setup({ w, h, px, p }) {
    const flows = parseFlows(p.data);
    const map = new Map();
    const node = (name) => {
      if (!map.has(name)) map.set(name, { name, ins: [], outs: [], col: 0, order: map.size });
      return map.get(name);
    };
    const links = flows.map((f) => {
      const L = { s: node(f.s), d: node(f.d), v: f.v, dec: f.dec };
      L.s.outs.push(L);
      L.d.ins.push(L);
      return L;
    });
    const nodes = [...map.values()];
    // coluna = maior profundidade a partir das fontes (limita para não travar em ciclos)
    for (let it = 0; it < nodes.length; it++) {
      let changed = false;
      for (const L of links) {
        if (L.d.col < L.s.col + 1 && L.s.col + 1 < nodes.length) {
          L.d.col = L.s.col + 1;
          changed = true;
        }
      }
      if (!changed) break;
    }
    for (const n of nodes) {
      n.vin = n.ins.reduce((s, L) => s + L.v, 0);
      n.vout = n.outs.reduce((s, L) => s + L.v, 0);
      n.v = Math.max(n.vin, n.vout);
      n.dec = Math.max(0, ...n.ins.map((L) => L.dec), ...n.outs.map((L) => L.dec));
    }
    const C = nodes.length ? Math.max(...nodes.map((n) => n.col)) + 1 : 0;
    const cols = Array.from({ length: C }, (_, c) => nodes.filter((n) => n.col === c));
    // rastreio do destaque: que fração de cada nó acaba chegando no nó destacado
    const target = map.get(String(p.highlight || '').trim());
    for (const n of nodes) n.share = 0;
    if (target) {
      target.share = 1;
      for (let c = target.col - 1; c >= 0; c--) {
        for (const n of cols[c]) n.share = n.v ? n.outs.reduce((s, L) => s + L.v * L.d.share, 0) / n.v : 0;
      }
    }
    return { nodes, links, cols, C, target, bgc: bakeBg(w, h, px, p.bg, p.accent) };
  },

  render(ctx, t, { w, h, p, duration, state }) {
    const { links, cols, C, target, bgc } = state;
    ctx.drawImage(bgc, 0, 0, w, h);
    const OUT = duration - 1.2;
    const outAll = ease.inCubic(seg(t, OUT, duration - 0.1));
    const H = drawHeader(ctx, t, w, h, p, outAll);
    const { m, portrait, padX } = H;

    if (C < 2) {
      ctx.font = INTER(500)(H.subSize * 1.3);
      ctx.fillStyle = rgba(p.ink, 0.5);
      ctx.textAlign = 'center';
      ctx.fillText('Use linhas "Origem > Destino, valor"', w / 2, h / 2);
      return;
    }

    const fmtV = (v, dec) => `${p.prefix}${fmt(v, dec)}${p.suffix}`;
    const ls = m * (portrait ? 0.025 : 0.023);
    const vs = ls * 0.8;
    const labW = (n) => {
      ctx.font = INTER(700)(ls);
      const a = ctx.measureText(n.name).width;
      ctx.font = MONO(500)(vs);
      return Math.max(a, ctx.measureText(fmtV(n.v, n.dec)).width);
    };
    const maxLab = (w - padX * 2) * (portrait ? 0.3 : 0.2);
    const lw0 = Math.min(maxLab, Math.max(...cols[0].map(labW)));
    const lwN = Math.min(maxLab, Math.max(...cols[C - 1].map(labW)));
    const gapL = m * 0.022;
    const nodeW = m * 0.016;
    const x0 = padX + lw0 + gapL;
    const x1 = w - padX - lwN - gapL - nodeW;
    const plotTop = H.bot + m * (portrait ? 0.09 : 0.06);
    const plotBot = h - h * (portrait ? 0.1 : 0.08);
    const plotH = plotBot - plotTop;
    const gap = m * (portrait ? 0.045 : 0.035);
    let k = Infinity;
    for (const col of cols) {
      const sum = col.reduce((s, n) => s + n.v, 0);
      k = Math.min(k, (plotH - gap * (col.length - 1)) / sum);
    }

    // posições: coluna 0 na ordem do texto; as outras pelo baricentro das origens
    for (let c = 0; c < C; c++) {
      const col = cols[c];
      if (c > 0) {
        for (const n of col) {
          const wsum = n.ins.reduce((s, L) => s + L.v, 0);
          n.bary = wsum ? n.ins.reduce((s, L) => s + L.v * (L.s.y + L.s.hh / 2), 0) / wsum : n.order * 1e6;
        }
        col.sort((a, b) => (Math.abs(a.bary - b.bary) > 0.5 ? a.bary - b.bary : a.order - b.order));
      }
      const tot = col.reduce((s, n) => s + n.v * k, 0) + gap * (col.length - 1);
      let y = plotTop + (plotH - tot) / 2;
      for (const n of col) {
        n.x = x0 + ((x1 - x0) * c) / (C - 1);
        n.y = y;
        n.hh = n.v * k;
        y += n.hh + gap;
      }
    }
    for (const col of cols) {
      for (const n of col) {
        n.outs.sort((a, b) => a.d.y - b.d.y);
        n.ins.sort((a, b) => a.s.y - b.s.y);
        let y = n.y + (n.hh - n.vout * k) / 2;
        for (const L of n.outs) {
          L.sy = y;
          y += L.v * k;
        }
        y = n.y + (n.hh - n.vin * k) / 2;
        for (const L of n.ins) {
          L.ty = y;
          y += L.v * k;
        }
      }
    }

    // ---------- tempos ----------
    const T0 = 0.9;
    const dt = Math.min(0.85, 2.6 / (C - 1));
    const LD = dt * 1.3;
    const nodeIn = (c) => ease.outExpo(seg(t, T0 - 0.35 + c * dt + (c ? LD * 0.55 : 0), T0 + 0.5 + c * dt + (c ? LD * 0.55 : 0)));
    const T_HI = T0 + (C - 2) * dt + LD + 0.1;
    const hiK = target ? seg(t, T_HI, T_HI + 1.5) : 0;
    const fade = 1 - outAll;

    // ---------- fluxos ----------
    const band = (L, e, y0, y1) => {
      const sx = L.s.x + nodeW;
      const tx = L.d.x;
      const mx = (sx + tx) / 2;
      const X = splitBez(sx, mx, mx, tx, e);
      const yt = splitBez(L.sy + y0, L.sy + y0, L.ty + y0, L.ty + y0, e);
      const yb = splitBez(L.sy + y1, L.sy + y1, L.ty + y1, L.ty + y1, e);
      ctx.moveTo(X[0], yt[0]);
      ctx.bezierCurveTo(X[1], yt[1], X[2], yt[2], X[3], yt[3]);
      ctx.lineTo(X[3], yb[3]);
      ctx.bezierCurveTo(X[2], yb[2], X[1], yb[1], X[0], yb[0]);
      ctx.closePath();
      return [X[3], yt[3], yb[3]];
    };
    const prog = links.map((L) => {
      const st = T0 + L.s.col * dt + stagger(L.s.outs.indexOf(L), L.s.outs.length, dt * 0.25);
      return ease.inOutCubic(seg(t, st, st + LD));
    });
    // um fill() para todas as faixas neutras
    ctx.fillStyle = rgba(p.ink, (0.13 - 0.03 * hiK) * fade);
    ctx.beginPath();
    const fronts = [];
    links.forEach((L, i) => {
      if (prog[i] <= 0.001) return;
      const f = band(L, prog[i], 0, L.v * k);
      if (prog[i] < 1) fronts.push(f);
    });
    ctx.fill();
    // fio de luz na frente de cada faixa que ainda avança
    ctx.fillStyle = rgba(p.ink, 0.4 * fade);
    for (const [x, y0, y1] of fronts) ctx.fillRect(x - m * 0.0015, y0, m * 0.003, y1 - y0);
    // rastreio: a parte de cada faixa que chega ao destaque, centrada nela, acende
    if (hiK > 0.001) {
      ctx.fillStyle = rgba(p.accent, 0.5 * fade);
      ctx.beginPath();
      links.forEach((L, i) => {
        const sh = L.d.share;
        if (sh <= 0 || prog[i] <= 0.001) return;
        const bw = L.v * k;
        const aw = bw * sh;
        const u = ease.inOutCubic(seg(hiK * (1 + 0.6) - 0.6 * (L.s.col / Math.max(1, C - 2)), 0, 1));
        if (u <= 0.001) return;
        band(L, Math.min(prog[i], u), (bw - aw) / 2, (bw + aw) / 2);
      });
      ctx.fill();
    }

    // ---------- nós ----------
    for (let c = 0; c < C; c++) {
      const e = nodeIn(c) * fade;
      if (e <= 0.001) continue;
      for (const n of cols[c]) {
        const isT = n === target;
        const hh = n.hh * e;
        const y = n.y + (n.hh - hh) / 2;
        ctx.fillStyle = rgba(p.ink, 0.88);
        ctx.beginPath();
        ctx.roundRect(n.x, y, nodeW, hh, Math.min(nodeW * 0.3, hh / 2));
        ctx.fill();
        if (n.share > 0 && hiK > 0) {
          const ah = hh * n.share;
          ctx.fillStyle = rgba(p.accent, clamp(hiK * 2 - (C > 2 ? n.col / (C - 1) : 0)));
          ctx.beginPath();
          ctx.roundRect(n.x, y + (hh - ah) / 2, nodeW, ah, Math.min(nodeW * 0.3, ah / 2));
          ctx.fill();
        }
        // rótulo
        const side = c === 0 ? -1 : 1;
        const lx = c === 0 ? n.x - gapL : n.x + nodeW + gapL;
        const maxW = c === 0 ? lw0 : c === C - 1 ? lwN : (x1 - x0) / (C - 1) - gapL * 1.5;
        const ly = n.y + n.hh / 2;
        ctx.globalAlpha = e;
        ctx.textAlign = side < 0 ? 'right' : 'left';
        ctx.textBaseline = 'alphabetic';
        const off = (1 - e) * m * 0.02 * side;
        ctx.font = INTER(isT ? 700 : 600)(ls);
        const name = ellipsize(ctx, n.name, maxW);
        ctx.fillStyle = isT && hiK > 0 ? p.ink : rgba(p.ink, 0.9);
        ctx.fillText(name, lx + off, ly - vs * 0.25);
        ctx.font = MONO(isT ? 700 : 500)(vs);
        ctx.fillStyle = isT && hiK > 0 ? rgba(p.accent, 0.5 + 0.5 * hiK) : rgba(p.ink, 0.5);
        ctx.fillText(fmtV(n.v, n.dec), lx + off, ly + vs * 1.05);
        ctx.globalAlpha = 1;
      }
    }

    // percentual do destaque sobre o total da primeira coluna
    if (target && hiK > 0.01) {
      const total = cols[0].reduce((s, n) => s + n.v, 0);
      const pct = (target.v / total) * 100;
      const txt = `${fmt(pct, pct < 10 ? 1 : 0)}% do total`;
      ctx.font = INTER(700)(vs);
      const tw = ctx.measureText(txt).width;
      const c = target.col;
      const bx = c === 0 ? target.x - gapL - tw - vs * 1.2 : target.x + nodeW + gapL;
      const by = target.y + target.hh / 2 + vs * 1.75;
      const e = ease.outExpo(seg(t, T_HI + 1.1, T_HI + 2.0)) * fade;
      ctx.globalAlpha = e;
      ctx.fillStyle = rgba(p.accent, 0.16);
      ctx.beginPath();
      ctx.roundRect(bx, by, tw + vs * 1.2, vs * 1.7, vs * 0.85);
      ctx.fill();
      ctx.fillStyle = p.accent;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(txt, bx + vs * 0.6, by + vs * 0.88);
      ctx.globalAlpha = 1;
    }
  },
};
