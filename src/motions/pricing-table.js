import { TAU, clamp, seg, ease, spring, rgba } from '../lib/anim.js';

// Tabela de planos: os cards sobem em sequência, os preços contam, os recursos entram com check,
// o plano recomendado sobe com selo e borda de destaque, e o seletor Mensal/Anual troca os
// preços rolando os números. Em telas verticais os cards viram linhas.

const F = (wt, s) => `${wt} ${s}px Inter, system-ui, sans-serif`;
let MC = null;
const measure = () => (MC ||= document.createElement('canvas').getContext('2d'));
const fmt = new Intl.NumberFormat('pt-BR');

const DEFAULT = `Basic | 29 | To get started | 1 project; 5 GB of storage; HD export; Email support
Pro | 79 | For small teams | Unlimited projects; 100 GB of storage; 4K export; Priority support
Enterprise | 199 | For large operations | Everything in Pro; SSO and audit logs; Dedicated manager; 99.9% SLA`;

function parse(text) {
  const out = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const l = line.trim();
    if (!l || l.startsWith('#')) continue;
    const [name = '—', price = '0', desc = '', feats = ''] = l.split('|').map((s) => s.trim());
    const v = Number(String(price).replace(/[^\d,.]/g, '').replace(',', '.'));
    out.push({ name, price: Number.isFinite(v) ? v : 0, desc, feats: feats.split(';').map((s) => s.trim()).filter(Boolean).slice(0, 6) });
    if (out.length === 4) break;
  }
  return out;
}

function ellipsize(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxW) s = s.slice(0, -1);
  return `${s.trimEnd()}…`;
}

function check(ctx, x, y, r, color, k = 1) {
  ctx.strokeStyle = color;
  ctx.lineWidth = r * 0.28;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const P = [[-0.42, 0.02], [-0.12, 0.32], [0.45, -0.3]].map(([a, b]) => [x + a * r, y + b * r]);
  const l1 = Math.hypot(P[1][0] - P[0][0], P[1][1] - P[0][1]);
  const l2 = Math.hypot(P[2][0] - P[1][0], P[2][1] - P[1][1]);
  const d = k * (l1 + l2);
  ctx.beginPath();
  ctx.moveTo(...P[0]);
  if (d <= l1) ctx.lineTo(P[0][0] + ((P[1][0] - P[0][0]) * d) / l1, P[0][1] + ((P[1][1] - P[0][1]) * d) / l1);
  else {
    ctx.lineTo(...P[1]);
    const e = (d - l1) / l2;
    ctx.lineTo(P[1][0] + (P[2][0] - P[1][0]) * e, P[1][1] + (P[2][1] - P[1][1]) * e);
  }
  ctx.stroke();
}

const T_FEAT = 2.4; // recomendado sobe
const T_TOGGLE = 4.2; // mensal → anual
const T_CLICK = 5.6; // clique no botão do recomendado

export default {
  id: 'pricing-table',
  title: 'Pricing Table',
  description: 'Pricing plans: cards rise in sequence, the recommended one stands out with a badge and the toggle flips to annual prices.',
  category: 'dados',
  tags: ['data', 'ui'],
  duration: 8,
  poster: 3.6,

  params: {
    title: { type: 'text', label: 'Title', default: 'Choose your plan' },
    plans: { type: 'textarea', label: 'Plans (name | price | description | feature; feature)', rows: 5, default: DEFAULT },
    featured: { type: 'range', label: 'Recommended plan', min: 1, max: 4, step: 1, default: 2 },
    badge: { type: 'text', label: 'Badge', default: 'Most popular' },
    discount: { type: 'range', label: 'Annual discount (%)', min: 0, max: 50, step: 1, default: 20 },
    currency: { type: 'text', label: 'Currency', default: 'R$' },
    accent: { type: 'color', label: 'Accent', default: '#c6f26b' },
    card: { type: 'color', label: 'Card', default: '#16181d' },
    ink: { type: 'color', label: 'Text', default: '#f3f1ec' },
    bg: { type: 'color', label: 'Background', default: '#0b0c0f' },
    transparent: { type: 'boolean', label: 'Transparent background', default: false },
  },

  setup({ w, h, p, px }) {
    const plans = parse(p.plans);
    let bgc = null;
    if (!p.transparent) {
      bgc = document.createElement('canvas');
      bgc.width = Math.max(1, Math.round(w * px));
      bgc.height = Math.max(1, Math.round(h * px));
      const g = bgc.getContext('2d');
      g.scale(px, px);
      g.fillStyle = p.bg;
      g.fillRect(0, 0, w, h);
      const m = Math.min(w, h);
      const rg = g.createRadialGradient(w / 2, h * 0.55, 0, w / 2, h * 0.55, m * 0.7);
      rg.addColorStop(0, rgba(p.accent, 0.07));
      rg.addColorStop(1, rgba(p.accent, 0));
      g.fillStyle = rg;
      g.fillRect(0, 0, w, h);
    }
    // largura máxima do preço (para rolar os números sem pular)
    const mc = measure();
    mc.font = F(800, 100);
    for (const pl of plans) pl.pw = mc.measureText(fmt.format(Math.round(pl.price))).width / 100;
    return { plans, bgc };
  },

  render(ctx, t, { w, h, p, duration, state }) {
    const { plans, bgc } = state;
    if (!p.transparent && bgc) ctx.drawImage(bgc, 0, 0, w, h);
    const n = plans.length;
    if (!n) return;
    const m = Math.min(w, h);
    const rows = h > w * 1.4;
    const fi = clamp(Math.round(p.featured) - 1, 0, n - 1);
    const disc = p.discount / 100;
    const ink = p.ink;

    // ---------- layout ----------
    const u = m / 1080;
    const headH = (rows ? 230 : h > w * 0.9 ? 215 : 205) * u;
    const areaW = w * (rows ? 0.88 : 0.9);
    const areaTop = (rows ? h * 0.1 : h * 0.07) + headH + (rows ? 10 : 34) * u;
    const areaH = h - areaTop - h * (rows ? 0.1 : 0.08);
    const gap = 28 * u;
    const maxF = Math.max(...plans.map((q) => q.feats.length));
    let cw, ch, cu;
    if (!rows) {
      cw = Math.min((areaW - gap * (n - 1)) / n, 460 * u);
      // altura do conteúdo em unidades do card (cu)
      const units = 40 + 34 + 30 + 40 + 84 + 26 + 34 + maxF * 46 + 30 + 66 + 40;
      cu = Math.min(cw / 420, (areaH * 0.94) / units);
      ch = units * cu;
    } else {
      cw = areaW;
      const units = Math.max(40 + 34 + 30 + 30 + 84 + 26 + 66 + 40, 40 + maxF * 46 + 30);
      cu = Math.min(cw / 780, (areaH - gap * (n - 1)) / (n * units) / 1.02);
      ch = units * cu;
    }
    const totalW = rows ? cw : n * cw + (n - 1) * gap;
    const totalH = rows ? n * ch + (n - 1) * gap : ch;
    const x0 = (w - totalW) / 2;
    const y0 = areaTop + (areaH - totalH) / 2;

    const exitK = (d) => ease.inCubic(seg(t, duration - 0.8 + d, duration - 0.25 + d));

    // ---------- cabeçalho: título + seletor ----------
    const hIn = ease.outExpo(seg(t, 0.05, 0.9));
    const hOut = exitK(0.15);
    const tog = ease.inOutCubic(seg(t, T_TOGGLE, T_TOGGLE + 0.4));
    if (hIn > 0.001 && hOut < 0.999) {
      ctx.save();
      ctx.globalAlpha = clamp(hIn * 1.4) * (1 - hOut);
      const ty = y0 - headH + (1 - hIn) * 30 * u;
      const ts = (rows ? 66 : 58) * u;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.font = F(800, ts);
      ctx.letterSpacing = `${-ts * 0.03}px`;
      ctx.fillStyle = ink;
      const tw = ctx.measureText(p.title).width;
      ctx.textAlign = 'left';
      ctx.fillText(p.title, w / 2 - tw / 2, ty + ts);
      ctx.letterSpacing = '0px';
      // seletor Mensal | Anual
      const fs = 22 * u;
      ctx.font = F(650, fs);
      const labA = 'Monthly';
      const labB = 'Annual';
      const wa = ctx.measureText(labA).width + 48 * u;
      const wb = ctx.measureText(labB).width + 48 * u;
      const sh = 50 * u;
      const sx = w / 2 - (wa + wb) / 2;
      const sy = ty + ts + 30 * u;
      ctx.fillStyle = rgba(ink, 0.07);
      ctx.beginPath();
      ctx.roundRect(sx - 5 * u, sy - 5 * u, wa + wb + 10 * u, sh + 10 * u, (sh + 10 * u) / 2);
      ctx.fill();
      const kx = sx + wa * tog;
      const kw = wa + (wb - wa) * tog;
      ctx.fillStyle = ink;
      ctx.beginPath();
      ctx.roundRect(kx, sy, kw, sh, sh / 2);
      ctx.fill();
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.fillStyle = tog < 0.5 ? p.bg : rgba(ink, 0.6);
      ctx.fillText(labA, sx + wa / 2, sy + sh / 2 + u);
      ctx.fillStyle = tog >= 0.5 ? p.bg : rgba(ink, 0.6);
      ctx.fillText(labB, sx + wa + wb / 2, sy + sh / 2 + u);
      // etiqueta de desconto
      if (p.discount > 0) {
        const dk = spring(seg(t, T_TOGGLE + 0.2, T_TOGGLE + 0.8), 0.45);
        const dt = `-${p.discount}%`;
        ctx.font = F(800, 18 * u);
        const dw = ctx.measureText(dt).width + 24 * u;
        const dx = sx + wa + wb + 18 * u;
        ctx.globalAlpha = clamp(hIn * 1.4) * (1 - hOut) * (0.45 + 0.55 * clamp(dk));
        ctx.save();
        ctx.translate(dx + dw / 2, sy + sh / 2);
        const sc = 0.85 + 0.15 * dk;
        ctx.scale(sc, sc);
        ctx.fillStyle = dk > 0.01 ? p.accent : rgba(ink, 0.15);
        ctx.beginPath();
        ctx.roundRect(-dw / 2, -16 * u, dw, 32 * u, 16 * u);
        ctx.fill();
        ctx.fillStyle = dk > 0.01 ? p.bg : ink;
        ctx.fillText(dt, 0, u);
        ctx.restore();
      }
      ctx.restore();
    }

    // ---------- cards ----------
    const featK = ease.inOutCubic(seg(t, T_FEAT, T_FEAT + 0.6));
    const order = plans.map((_, i) => i).sort((a, b) => (a === fi) - (b === fi)); // recomendado por cima
    for (const i of order) {
      const pl = plans[i];
      const feat = i === fi;
      const a0 = 0.3 + i * 0.12;
      const inK = ease.outExpo(seg(t, a0, a0 + 1.0));
      const out = exitK(i * 0.06);
      if (inK <= 0.001 || out >= 0.999) continue;
      const bx = rows ? x0 : x0 + i * (cw + gap);
      const by = rows ? y0 + i * (ch + gap) : y0;
      const lift = feat ? featK : 0;
      const sc = 1 + (feat ? 0.045 * lift : 0);
      const dim = feat ? 1 : 1 - 0.3 * featK;

      ctx.save();
      ctx.globalAlpha = clamp(inK * 1.6) * (1 - out);
      ctx.translate(bx + cw / 2, by + ch / 2 + (1 - inK) * 120 * u + out * 80 * u - (rows ? 0 : lift * 24 * u));
      ctx.scale(sc, sc);
      ctx.translate(-cw / 2, -ch / 2);
      const R = 26 * cu;
      // sombra em camadas
      for (let k = 3; k >= 1; k--) {
        ctx.fillStyle = `rgba(0,0,0,${0.08 + 0.05 * lift})`;
        ctx.beginPath();
        ctx.roundRect(-k * 8 * cu, -k * 4 * cu + 18 * cu, cw + k * 16 * cu, ch + k * 14 * cu, R + k * 8 * cu);
        ctx.fill();
      }
      ctx.fillStyle = p.card;
      ctx.beginPath();
      ctx.roundRect(0, 0, cw, ch, R);
      ctx.fill();
      if (feat && lift > 0) {
        ctx.fillStyle = rgba(p.accent, 0.05 * lift);
        ctx.fill();
      }
      ctx.strokeStyle = feat && lift > 0 ? rgba(p.accent, 0.12 + 0.88 * lift) : rgba(ink, 0.09);
      ctx.lineWidth = (feat ? 1.5 + 1.5 * lift : 1.5) * cu;
      ctx.stroke();

      const pad = 40 * cu;
      const alphaBase = ctx.globalAlpha;
      ctx.globalAlpha = alphaBase * dim;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      const colW = rows ? 370 * cu : cw - pad * 2;
      // nome + descrição
      let y = pad;
      ctx.font = F(700, 30 * cu);
      ctx.fillStyle = ink;
      ctx.fillText(pl.name, pad, y + 28 * cu);
      y += 34 * cu;
      ctx.font = F(500, 21 * cu);
      ctx.fillStyle = rgba(ink, 0.55);
      ctx.fillText(ellipsize(ctx, pl.desc, colW), pad, y + 26 * cu);
      y += 30 * cu + (rows ? 30 : 40) * cu;

      // preço: conta na entrada, rola na troca mensal → anual
      const ps = 76 * cu;
      const cnt = ease.outExpo(seg(t, a0 + 0.35, a0 + 1.6));
      const monthly = Math.round(pl.price * cnt);
      const annual = Math.round(pl.price * (1 - disc));
      const roll = ease.inOutCubic(seg(t, T_TOGGLE + 0.15 + i * 0.07, T_TOGGLE + 0.75 + i * 0.07));
      ctx.font = F(600, 28 * cu);
      ctx.fillStyle = rgba(ink, 0.7);
      const cur = p.currency ? `${p.currency} ` : '';
      const cwid = ctx.measureText(cur).width;
      ctx.fillText(cur, pad, y + ps * 0.5);
      const nx = pad + cwid;
      ctx.save();
      ctx.beginPath();
      ctx.rect(nx - 4 * cu, y - ps * 0.12, pl.pw * ps + 30 * cu, ps * 1.02);
      ctx.clip();
      ctx.font = F(800, ps);
      ctx.letterSpacing = `${-ps * 0.03}px`;
      ctx.fillStyle = ink;
      const base = y + ps * 0.78;
      if (roll < 1) {
        ctx.globalAlpha = alphaBase * dim * (1 - roll);
        ctx.fillText(fmt.format(monthly), nx, base - roll * ps);
      }
      if (roll > 0) {
        ctx.globalAlpha = alphaBase * dim * roll;
        ctx.fillText(fmt.format(annual), nx, base + (1 - roll) * ps);
      }
      ctx.restore();
      ctx.globalAlpha = alphaBase * dim;
      ctx.font = F(800, ps);
      ctx.letterSpacing = `${-ps * 0.03}px`;
      const numW = ctx.measureText(fmt.format(roll > 0.5 ? annual : Math.round(pl.price))).width;
      ctx.letterSpacing = '0px';
      ctx.font = F(500, 22 * cu);
      ctx.fillStyle = rgba(ink, 0.5);
      ctx.fillText('/mo', nx + numW + 8 * cu, base);
      y += ps + 10 * cu;
      ctx.font = F(500, 18 * cu);
      ctx.fillStyle = rgba(ink, 0.4);
      ctx.globalAlpha = alphaBase * dim * (0.35 + 0.65 * clamp(cnt));
      const billed = roll > 0.5 ? `${cur}${fmt.format(annual * 12)} billed yearly` : 'billed monthly';
      ctx.fillText(billed, pad, y + 18 * cu);
      ctx.globalAlpha = alphaBase * dim;
      y += 26 * cu;

      // botão
      const btnH = 66 * cu;
      const btnY = rows ? ch - pad - btnH : ch - pad - btnH;
      const btnW = rows ? colW : cw - pad * 2;
      const press = Math.sin(Math.PI * seg(t, T_CLICK, T_CLICK + 0.25));
      ctx.save();
      ctx.translate(pad + btnW / 2, btnY + btnH / 2);
      const bs = feat ? 1 - 0.05 * press : 1;
      ctx.scale(bs, bs);
      ctx.beginPath();
      ctx.roundRect(-btnW / 2, -btnH / 2, btnW, btnH, 16 * cu);
      if (feat) {
        ctx.fillStyle = lift > 0.5 ? p.accent : ink;
        ctx.fill();
        // ripple do clique
        const rp = seg(t, T_CLICK + 0.05, T_CLICK + 0.75);
        if (rp > 0 && rp < 1) {
          ctx.save();
          ctx.clip();
          ctx.fillStyle = rgba('#ffffff', 0.35 * (1 - rp));
          ctx.beginPath();
          ctx.arc(0, 0, btnW * 0.7 * ease.outCubic(rp), 0, TAU);
          ctx.fill();
          ctx.restore();
        }
      } else {
        ctx.strokeStyle = rgba(ink, 0.22);
        ctx.lineWidth = 1.5 * cu;
        ctx.stroke();
      }
      ctx.font = F(700, 22 * cu);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = feat ? p.bg : ink;
      const done = feat && t > T_CLICK + 0.2;
      ctx.fillText(done ? 'Plan selected ✓' : feat ? 'Subscribe now' : 'Get started', 0, cu);
      ctx.restore();

      // recursos
      const fx = rows ? pad + colW + 50 * cu : pad;
      let fy = rows ? pad + 6 * cu : y + 30 * cu;
      if (!rows) {
        ctx.fillStyle = rgba(ink, 0.08);
        ctx.fillRect(pad, y + 6 * cu, cw - pad * 2, Math.max(1, 1.5 * cu));
      } else {
        ctx.fillStyle = rgba(ink, 0.08);
        ctx.fillRect(fx - 26 * cu, pad, Math.max(1, 1.5 * cu), ch - pad * 2);
      }
      const fw = rows ? cw - fx - pad : cw - pad * 2;
      pl.feats.forEach((ft, j) => {
        const f0 = a0 + 0.7 + j * 0.08;
        const fk = ease.outExpo(seg(t, f0, f0 + 0.7));
        if (fk <= 0.001) return;
        const cy = fy + 23 * cu;
        ctx.globalAlpha = alphaBase * dim * clamp(fk * 1.5);
        const r = 13 * cu;
        ctx.fillStyle = feat ? rgba(p.accent, 0.12 + 0.1 * lift) : rgba(ink, 0.08);
        ctx.beginPath();
        ctx.arc(fx + r, cy, r, 0, TAU);
        ctx.fill();
        check(ctx, fx + r, cy, r * 0.95, feat && lift > 0.3 ? p.accent : rgba(ink, 0.8), ease.outCubic(seg(t, f0 + 0.1, f0 + 0.5)));
        ctx.font = F(500, 21 * cu);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = rgba(ink, 0.85);
        ctx.fillText(ellipsize(ctx, ft, fw - r * 2 - 14 * cu), fx + r * 2 + 14 * cu + (1 - fk) * 16 * cu, cy + cu);
        fy += 46 * cu;
      });
      ctx.globalAlpha = alphaBase;

      // selo do recomendado
      if (feat) {
        const bk = spring(seg(t, T_FEAT + 0.25, T_FEAT + 0.9), 0.45);
        if (bk > 0.001 && p.badge) {
          ctx.font = F(800, 17 * cu);
          ctx.letterSpacing = `${17 * cu * 0.1}px`;
          const txt = p.badge.toUpperCase();
          const bw = ctx.measureText(txt).width + 36 * cu;
          const bh = 36 * cu;
          ctx.save();
          ctx.translate(cw / 2, 0);
          ctx.scale(bk, bk);
          ctx.fillStyle = p.accent;
          ctx.beginPath();
          ctx.roundRect(-bw / 2, -bh / 2, bw, bh, bh / 2);
          ctx.fill();
          ctx.fillStyle = p.bg;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(txt, (17 * cu * 0.1) / 2, cu);
          ctx.restore();
          ctx.letterSpacing = '0px';
        }
      }
      ctx.restore();
    }
  },
};
