import { clamp, seg, ease, spring, rgba } from '../lib/anim.js';

// Avaliações: a nota conta até o valor, as estrelas enchem uma a uma (a última parcial), as barras
// de distribuição crescem e os cards de review entram em sequência; depois a pilha rola um card.

const F = (wt, s) => `${wt} ${s}px Inter, system-ui, sans-serif`;
let MC = null;
const measure = () => (MC ||= document.createElement('canvas').getContext('2d'));
const fmt = new Intl.NumberFormat('pt-BR');
const fmt1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const REVIEWS = `Marina Costa | 5 | Entrega rápida e acabamento impecável. Já é a terceira vez que compro e nunca me decepcionou.
Rafael Lima | 5 | O suporte respondeu em minutos e resolveu tudo. Recomendo de olhos fechados.
Júlia Prado | 4 | Muito bom! Só achei que a caixa poderia ser um pouco mais resistente.
Bruno Alves | 5 | Superou as expectativas. A qualidade é bem melhor do que nas fotos.`;

function parseReviews(text) {
  const out = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const l = line.trim();
    if (!l || l.startsWith('#')) continue;
    const [name = '—', stars = '5', body = ''] = l.split('|').map((s) => s.trim());
    const s = clamp(Number(String(stars).replace(',', '.')) || 0, 0, 5);
    out.push({ name, stars: s, body });
    if (out.length === 6) break;
  }
  return out;
}

function starPath(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.48 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
}

// estrela com preenchimento parcial (0..1) da esquerda para a direita
function star(ctx, x, y, r, fill, on, off) {
  starPath(ctx, x, y, r);
  ctx.fillStyle = off;
  ctx.fill();
  if (fill <= 0) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x - r * 1.1, y - r * 1.1, r * 2.2 * fill, r * 2.2);
  ctx.clip();
  starPath(ctx, x, y, r);
  ctx.fillStyle = on;
  ctx.fill();
  ctx.restore();
}

function wrap(ctx, text, maxW, max = 3) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const wd of words) {
    const test = cur ? `${cur} ${wd}` : wd;
    if (ctx.measureText(test).width <= maxW || !cur) cur = test;
    else {
      lines.push(cur);
      cur = wd;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > max) {
    let last = lines.slice(max - 1).join(' ');
    while (last.length > 1 && ctx.measureText(`${last}…`).width > maxW) last = last.slice(0, -1);
    return [...lines.slice(0, max - 1), `${last.trimEnd()}…`];
  }
  return lines;
}

const initials = (name) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0].toUpperCase())
    .join('');

const T_CARDS = 2.0;
const T_ROLL = 5.6;

export default {
  id: 'rating',
  title: 'Rating',
  description: 'Avaliações: a nota conta, as estrelas enchem uma a uma, as barras de distribuição crescem e entram cards de review.',
  category: 'dados',
  tags: ['dados', 'ui'],
  duration: 9,
  poster: 4.4,

  params: {
    score: { type: 'range', label: 'Nota', min: 1, max: 5, step: 0.1, default: 4.8 },
    count: { type: 'range', label: 'Nº de avaliações', min: 1, max: 100000, step: 1, default: 2431 },
    label: { type: 'text', label: 'Selo', default: 'Excelente' },
    dist: { type: 'text', label: 'Distribuição % (5★ a 1★)', default: '82, 12, 4, 1, 1' },
    reviews: { type: 'textarea', label: 'Reviews (nome | estrelas | texto)', rows: 5, default: REVIEWS },
    accent: { type: 'color', label: 'Estrelas', default: '#ffaa17' },
    ink: { type: 'color', label: 'Texto', default: '#17181c' },
    card: { type: 'color', label: 'Cards', default: '#ffffff' },
    bg: { type: 'color', label: 'Fundo', default: '#f2efe9' },
    transparent: { type: 'boolean', label: 'Fundo transparente', default: false },
  },

  setup({ w, h, p }) {
    const m = Math.min(w, h);
    const wide = w > h * 1.2;
    const u = m / 1080;
    const reviews = parseReviews(p.reviews);
    const dist = String(p.dist || '')
      .split(/[,;\s]+/)
      .map(Number)
      .filter((v) => Number.isFinite(v))
      .slice(0, 5);
    while (dist.length < 5) dist.push(0);
    const dmax = Math.max(1, ...dist);

    // ---- resumo ----
    // largo: coluna à esquerda (nota em cima, barras embaixo); alto/quadrado: nota | barras lado a lado
    let sum;
    if (wide) {
      const sw = Math.min(w * 0.37, 660 * u);
      const su = sw / 560;
      const sh = 520 * su;
      sum = { x: w * 0.07, y: (h - sh) / 2, w: sw, h: sh, su, side: false };
    } else {
      const sw = w * 0.86;
      const su = Math.min(sw / 920, (h * 0.3) / 280);
      const sh = 280 * su;
      sum = { x: (w - 920 * su) / 2, y: h * (h > w * 1.4 ? 0.1 : 0.07), w: 920 * su, h: sh, su, side: true };
    }

    // ---- cards ----
    const area = wide
      ? { x: w * 0.5, y: h * 0.08, w: w * 0.43, h: h * 0.84 }
      : { x: w * 0.07, y: sum.y + sum.h + 50 * u, w: w * 0.86, h: h - (sum.y + sum.h + 50 * u) - h * 0.06 };
    const cu = Math.min(area.w / 760, (1.25 * m) / 1080);
    const pad = 34 * cu;
    const fs = 25 * cu;
    const lh = fs * 1.42;
    const mc = measure();
    mc.font = F(500, fs);
    const cards = reviews.map((r) => {
      const lines = wrap(mc, `“${r.body}”`, area.w - pad * 2, 3);
      const ch = pad + 58 * cu + 18 * cu + lines.length * lh + pad - 6 * cu;
      return { ...r, lines, h: ch, ini: initials(r.name) };
    });
    const gap = 22 * cu;
    // quantos cabem (pela pior combinação)
    let fit = 0;
    const maxH = Math.max(0, ...cards.map((c) => c.h));
    while (fit < cards.length && (fit + 1) * maxH + fit * gap <= area.h) fit++;
    fit = Math.max(1, Math.min(fit, 3));
    const stackH = (k0) => cards.slice(k0, k0 + fit).reduce((a, c) => a + c.h, 0) + (fit - 1) * gap;
    if (!wide) {
      // centraliza o bloco (resumo + pilha) na vertical
      const need = Math.max(stackH(0), cards.length > fit ? stackH(1) : 0);
      const spare = area.h - need;
      if (spare > 0) {
        const dy = spare / 2;
        sum.y += dy;
        area.y += dy;
        area.h = need;
      }
    }

    return { wide, u, sum, dist, dmax, area, cu, pad, fs, lh, cards, gap, fit, stackH };
  },

  render(ctx, t, { w, h, p, duration, state: S }) {
    if (!p.transparent) {
      ctx.fillStyle = p.bg;
      ctx.fillRect(0, 0, w, h);
    }
    const { sum, cu, pad, fs, lh, gap, fit, area } = S;
    const ink = p.ink;
    const off = rgba(ink, 0.1);
    const exitK = (d) => ease.inCubic(seg(t, duration - 0.85 + d, duration - 0.25 + d));

    // ================= resumo =================
    {
      const su = sum.su;
      const inK = ease.outExpo(seg(t, 0.05, 0.9));
      const out = exitK(0.12);
      ctx.save();
      ctx.globalAlpha = clamp(inK * 1.5) * (1 - out);
      ctx.translate(sum.x, sum.y + (1 - inK) * 40 * su - out * 30 * su);
      const cnt = ease.outExpo(seg(t, 0.25, 2.1));
      // nota
      const ns = 168 * su;
      ctx.font = F(800, ns);
      ctx.letterSpacing = `${-ns * 0.045}px`;
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'left';
      ctx.fillStyle = ink;
      const shown = fmt1.format(Math.floor(p.score * cnt * 10 + 1e-6) / 10);
      ctx.fillText(shown, -6 * su, ns * 0.82);
      const nw = ctx.measureText(fmt1.format(p.score)).width;
      ctx.letterSpacing = '0px';
      ctx.font = F(600, 34 * su);
      ctx.fillStyle = rgba(ink, 0.35);
      ctx.fillText('/ 5', nw + 6 * su, ns * 0.82);
      // selo
      const lk = spring(seg(t, 2.0, 2.6), 0.45);
      if (p.label && lk > 0.001) {
        ctx.font = F(750, 20 * su);
        ctx.letterSpacing = `${20 * su * 0.06}px`;
        const lw = ctx.measureText(p.label).width + 30 * su;
        ctx.save();
        ctx.translate(nw + 6 * su + lw / 2, ns * 0.82 - 92 * su);
        ctx.scale(lk, lk);
        ctx.fillStyle = rgba(p.accent, 0.18);
        ctx.beginPath();
        ctx.roundRect(-lw / 2, -19 * su, lw, 38 * su, 19 * su);
        ctx.fill();
        ctx.fillStyle = ink;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.label, 20 * su * 0.03, su);
        ctx.restore();
        ctx.letterSpacing = '0px';
      }
      // estrelas
      const sr = 27 * su;
      const sy = ns * 0.82 + 50 * su;
      for (let i = 0; i < 5; i++) {
        const a = 0.45 + i * 0.2;
        const f = clamp(p.score - i) * ease.outCubic(seg(t, a, a + 0.32));
        const pop = f > 0 ? spring(seg(t, a, a + 0.55), 0.5) : 1;
        const s = 0.75 + 0.25 * pop;
        ctx.save();
        ctx.translate(sr + i * sr * 2.3, sy);
        ctx.scale(s, s);
        star(ctx, 0, 0, sr, f, p.accent, off);
        ctx.restore();
      }
      ctx.font = F(500, 23 * su);
      ctx.fillStyle = rgba(ink, 0.55);
      ctx.textBaseline = 'middle';
      ctx.fillText(`${fmt.format(Math.round(p.count * cnt))} avaliações`, 0, sy + 56 * su);

      // barras de distribuição
      const bx = sum.side ? 480 * su : 0;
      const by = sum.side ? 22 * su : sy + 120 * su;
      const bw = sum.side ? 440 * su : 560 * su;
      const rh = 46 * su;
      for (let j = 0; j < 5; j++) {
        const y = by + j * rh + rh / 2;
        const b0 = 0.8 + j * 0.1;
        const k = ease.outExpo(seg(t, b0, b0 + 1.3));
        const v = S.dist[j];
        ctx.font = F(650, 21 * su);
        ctx.fillStyle = rgba(ink, 0.75);
        ctx.textAlign = 'left';
        ctx.fillText(String(5 - j), bx, y + su);
        star(ctx, bx + 30 * su, y, 10 * su, 1, rgba(ink, 0.35), off);
        const tx = bx + 54 * su;
        const tw = bw - 54 * su - 70 * su;
        const th = 12 * su;
        ctx.fillStyle = off;
        ctx.beginPath();
        ctx.roundRect(tx, y - th / 2, tw, th, th / 2);
        ctx.fill();
        const fw = (tw * v * k) / Math.max(100, S.dmax);
        if (fw > 0.5) {
          ctx.fillStyle = j === 0 ? p.accent : rgba(p.accent, 0.55);
          ctx.beginPath();
          ctx.roundRect(tx, y - th / 2, Math.max(th, fw), th, th / 2);
          ctx.fill();
        }
        ctx.textAlign = 'right';
        ctx.fillStyle = rgba(ink, 0.55);
        ctx.font = F(600, 20 * su);
        ctx.fillText(`${Math.round(v * k)}%`, bx + bw, y + su);
      }
      ctx.restore();
    }

    // ================= cards =================
    const cards = S.cards;
    if (!cards.length) return;
    const canRoll = cards.length > fit;
    const roll = canRoll ? ease.inOutCubic(seg(t, T_ROLL, T_ROLL + 0.8)) : 0;
    const shift = roll * (cards[0].h + gap);
    const H0 = S.stackH(0);
    const H1 = canRoll ? S.stackH(1) : H0;
    const stackH = H0 + (H1 - H0) * roll;
    const top = area.y + (area.h - stackH) / 2;
    let y = top - shift; // a pilha se recentraliza enquanto rola
    const last = Math.min(cards.length, fit + (canRoll ? 1 : 0));
    for (let k = 0; k < last; k++) {
      const c = cards[k];
      const cy = y;
      y += c.h + gap;
      const enterT = k < fit ? T_CARDS + k * 0.32 : T_ROLL + 0.15;
      const inK = ease.outExpo(seg(t, enterT, enterT + 0.9));
      const out = exitK(k * 0.05);
      let alpha = clamp(inK * 1.6) * (1 - out);
      if (k === 0 && canRoll) alpha *= 1 - ease.outCubic(seg(t, T_ROLL - 0.35, T_ROLL + 0.02)); // some antes de a pilha subir
      if (alpha <= 0.001) continue;
      ctx.save();
      ctx.globalAlpha = alpha;
      const dx = S.wide ? (1 - inK) * 120 * cu : 0;
      const dy = S.wide ? 0 : (1 - inK) * 80 * cu;
      ctx.translate(area.x + dx, cy + dy + out * 40 * cu);
      const cw = area.w;
      // sombra em camadas
      for (let i = 2; i >= 1; i--) {
        ctx.fillStyle = rgba(ink, 0.04);
        ctx.beginPath();
        ctx.roundRect(-i * 3 * cu, i * 5 * cu, cw + i * 6 * cu, c.h + i * 3 * cu, 22 * cu + i * 4 * cu);
        ctx.fill();
      }
      ctx.fillStyle = p.card;
      ctx.beginPath();
      ctx.roundRect(0, 0, cw, c.h, 22 * cu);
      ctx.fill();
      // avatar
      const ar = 29 * cu;
      const ax = pad + ar;
      const ay = pad + ar;
      ctx.fillStyle = rgba(ink, 0.07);
      ctx.beginPath();
      ctx.arc(ax, ay, ar, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = F(700, 21 * cu);
      ctx.fillStyle = rgba(ink, 0.7);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(c.ini, ax, ay + cu);
      // nome + selo verificado
      ctx.textAlign = 'left';
      ctx.font = F(700, 25 * cu);
      ctx.fillStyle = ink;
      ctx.fillText(c.name, ax + ar + 18 * cu, ay - 12 * cu);
      ctx.font = F(500, 19 * cu);
      ctx.fillStyle = rgba(ink, 0.45);
      ctx.fillText('Compra verificada', ax + ar + 18 * cu, ay + 18 * cu);
      // estrelas pequenas à direita
      const r = 13 * cu;
      for (let i = 0; i < 5; i++) {
        const a = enterT + 0.3 + i * 0.07;
        const f = clamp(c.stars - i) * ease.outCubic(seg(t, a, a + 0.25));
        const pop = f > 0 ? 0.7 + 0.3 * spring(seg(t, a, a + 0.45), 0.5) : 1;
        ctx.save();
        ctx.translate(cw - pad - r - (4 - i) * r * 2.25, ay - 10 * cu);
        ctx.scale(pop, pop);
        star(ctx, 0, 0, r, f, p.accent, off);
        ctx.restore();
      }
      // texto
      ctx.font = F(500, fs);
      ctx.fillStyle = rgba(ink, 0.82);
      ctx.textBaseline = 'alphabetic';
      const ty = pad + 58 * cu + 18 * cu;
      c.lines.forEach((ln, i) => {
        const lk = ease.outExpo(seg(t, enterT + 0.2 + i * 0.06, enterT + 0.9 + i * 0.06));
        ctx.globalAlpha = alpha * lk;
        ctx.fillText(ln, pad, ty + i * lh + fs * 0.95 + (1 - lk) * 10 * cu);
      });
      ctx.restore();
    }
  },
};
