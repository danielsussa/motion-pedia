import { TAU, clamp, seg, ease, spring, stagger, rgba } from '../lib/anim.js';

// Resultado de enquete: card com a pergunta, opções que enchem contando a porcentagem e,
// por fim, a vencedora ganhando a cor de destaque e um check. Fundo transparente opcional.

const INTER = (wt, s) => `${wt} ${s}px Inter, system-ui, sans-serif`;

// "Opção | votos" por linha (também aceita ; ou tab).
function parse(text) {
  const out = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const l = line.trim();
    if (!l || l.startsWith('#')) continue;
    const parts = l.split(/\s*[|;\t]\s*/);
    const v = Number(String(parts[1] ?? '').replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));
    out.push({ label: parts[0] || '—', votes: Number.isFinite(v) && v > 0 ? v : 0 });
    if (out.length === 6) break;
  }
  return out;
}

function ellipsize(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxW) s = s.slice(0, -1);
  return `${s.trimEnd()}…`;
}

// Quebra em até `max` linhas (a última com reticências).
function wrap(ctx, text, maxW, max = 2) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (let i = 0; i < words.length; i++) {
    const test = cur ? `${cur} ${words[i]}` : words[i];
    if (ctx.measureText(test).width <= maxW || !cur) cur = test;
    else {
      lines.push(cur);
      cur = words[i];
      if (lines.length === max - 1) {
        cur = words.slice(i).join(' ');
        break;
      }
    }
  }
  if (cur) lines.push(lines.length === max - 1 ? ellipsize(ctx, cur, maxW) : cur);
  return lines;
}

const fmt = new Intl.NumberFormat('pt-BR');

const DEFAULT = `Modo escuro | 412
Atalhos de teclado | 268
Exportar em PDF | 187
Integração com Slack | 133`;

const T_WIN = 2.9; // revela a vencedora

export default {
  id: 'poll',
  title: 'Poll',
  description: 'Resultado de enquete: as opções enchem contando a porcentagem e a vencedora ganha cor e um check.',
  category: 'dados',
  tags: ['dados', 'ui', 'alpha'],
  duration: 6.5,
  poster: 4,

  params: {
    question: { type: 'text', label: 'Pergunta', default: 'Qual recurso você quer primeiro?' },
    options: { type: 'textarea', label: 'Opções (texto | votos)', rows: 5, default: DEFAULT },
    footer: { type: 'text', label: 'Rodapé', default: 'Enquete encerrada' },
    accent: { type: 'color', label: 'Destaque', default: '#4f7cff' },
    panel: { type: 'color', label: 'Card', default: '#16181d' },
    ink: { type: 'color', label: 'Texto', default: '#f2efe8' },
    bg: { type: 'color', label: 'Fundo', default: '#0b0c0f' },
    showVotes: { type: 'boolean', label: 'Mostrar votos', default: true },
    transparent: { type: 'boolean', label: 'Fundo transparente', default: false },
  },

  setup({ p }) {
    const items = parse(p.options);
    const total = items.reduce((a, b) => a + b.votes, 0);
    const best = Math.max(0, ...items.map((i) => i.votes));
    for (const it of items) {
      it.pct = total ? (it.votes / total) * 100 : 0;
      it.win = best > 0 && it.votes === best;
    }
    return { items, total };
  },

  render(ctx, t, { w, h, p, px, duration, state }) {
    if (!p.transparent) {
      ctx.fillStyle = p.bg;
      ctx.fillRect(0, 0, w, h);
      const vg = ctx.createRadialGradient(w / 2, h * 0.45, 0, w / 2, h / 2, Math.max(w, h) * 0.75);
      vg.addColorStop(0, rgba('#000000', 0));
      vg.addColorStop(1, rgba('#000000', 0.35));
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, w, h);
    }
    const { items, total } = state;
    const n = Math.max(items.length, 1);
    const m = Math.min(w, h);
    const portrait = h > w * 1.2;

    // ---------- layout ----------
    const cw = Math.min(w * (portrait ? 0.88 : 0.84), m * (portrait ? 1 : 1.02));
    const u = cw / 1000; // unidade do card
    const pad = 56 * u;
    const innerW = cw - pad * 2;
    const qs = 46 * u;
    ctx.font = INTER(800, qs);
    const qLines = wrap(ctx, p.question || '', innerW, 2);
    const qH = qLines.length ? qLines.length * qs * 1.15 + 36 * u : 0;
    const rh = 78 * u;
    const gap = 16 * u;
    const listH = n * rh + (n - 1) * gap;
    const footH = 74 * u;
    let ch = pad + qH + listH + footH + pad * 0.55;
    // em 16:9 com muitas opções o card pode passar da altura: encolhe tudo
    const k = Math.min(1, (h * 0.9) / ch);
    const cx = w / 2;
    const cy = h / 2;

    const outK = ease.inCubic(seg(t, duration - 0.85, duration - 0.15));
    const inK = spring(seg(t, 0.05, 1.0), 0.18);
    const op = clamp(seg(t, 0.05, 0.4)) * (1 - outK);
    if (op <= 0.001) return;

    ctx.save();
    ctx.translate(cx, cy + (1 - inK) * m * 0.08 + outK * m * 0.06);
    ctx.scale(k * (0.96 + 0.04 * inK), k * (0.96 + 0.04 * inK));
    ctx.translate(-cw / 2, -ch / 2);
    ctx.globalAlpha = op;

    // card
    // sombra barata em camadas (shadowBlur num card grande é caro)
    ctx.save();
    for (let i = 3; i >= 1; i--) {
      ctx.fillStyle = 'rgba(0,0,0,0.09)';
      ctx.beginPath();
      ctx.roundRect(-i * 12 * u, -i * 6 * u + 22 * u, cw + i * 24 * u, ch + i * 20 * u, 30 * u + i * 12 * u);
      ctx.fill();
    }
    ctx.fillStyle = p.panel;
    ctx.beginPath();
    ctx.roundRect(0, 0, cw, ch, 30 * u);
    ctx.fill();
    ctx.restore();
    const hl = ctx.createLinearGradient(0, 0, 0, ch);
    hl.addColorStop(0, rgba('#ffffff', 0.08));
    hl.addColorStop(1, rgba('#ffffff', 0.02));
    ctx.strokeStyle = hl;
    ctx.lineWidth = Math.max(1, 2 * u);
    ctx.stroke();

    // pergunta
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const qIn = ease.outExpo(seg(t, 0.3, 1.1));
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, pad - qs * 0.4, cw, qH + qs * 0.2);
    ctx.clip();
    ctx.font = INTER(800, qs);
    ctx.letterSpacing = `${-qs * 0.02}px`;
    ctx.fillStyle = p.ink;
    qLines.forEach((line, i) => ctx.fillText(line, pad, pad + qs * 0.9 + i * qs * 1.15 + (1 - qIn) * qs * 2.4));
    ctx.letterSpacing = '0px';
    ctx.restore();

    // opções
    const ls = 30 * u;
    const winK = ease.inOutCubic(seg(t, T_WIN, T_WIN + 0.45));
    const y0 = pad + qH;
    if (!items.length) {
      ctx.font = INTER(500, ls * 0.9);
      ctx.fillStyle = rgba(p.ink, 0.5);
      ctx.fillText('Sem opções — use "texto | votos" por linha', pad, y0 + rh * 0.6);
    }
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const y = y0 + i * (rh + gap);
      const a = 0.45 + stagger(i, n, 0.4);
      const rowIn = ease.outExpo(seg(t, a, a + 0.8));
      if (rowIn <= 0.001) continue;
      const f0 = 1.15 + stagger(i, n, 0.3);
      const fill = ease.outExpo(seg(t, f0, f0 + 1.7));
      const pctNow = it.pct * fill;
      const dim = it.win ? 1 : 1 - 0.35 * winK;

      ctx.save();
      ctx.globalAlpha = op * clamp(rowIn * 1.4);
      ctx.translate((1 - rowIn) * 40 * u, 0);
      // trilho
      ctx.fillStyle = rgba(p.ink, 0.055);
      ctx.beginPath();
      ctx.roundRect(pad, y, innerW, rh, 16 * u);
      ctx.fill();
      // barra
      const bw = Math.max(0, (innerW * pctNow) / 100);
      if (bw > 0.5) {
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(pad, y, innerW, rh, 16 * u);
        ctx.clip();
        ctx.fillStyle = rgba(p.ink, 0.16 * dim);
        ctx.beginPath();
        ctx.roundRect(pad, y, bw, rh, 16 * u);
        ctx.fill();
        if (it.win && winK > 0) {
          ctx.fillStyle = rgba(p.accent, winK);
          ctx.fill();
        }
        ctx.restore();
      }
      // rótulo
      const lx = pad + 26 * u;
      ctx.textBaseline = 'middle';
      ctx.font = INTER(it.win ? 700 : 600, ls);
      ctx.fillStyle = rgba(p.ink, it.win ? 1 : 0.92 * dim + 0.08);
      const pctTxt = `${Math.round(pctNow)}%`;
      ctx.font = INTER(800, ls);
      const pw = ctx.measureText('100%').width;
      const votesTxt = p.showVotes ? fmt.format(Math.round(it.votes * fill)) : '';
      ctx.font = INTER(500, ls * 0.72);
      const vw = votesTxt ? ctx.measureText(`${fmt.format(it.votes)}`).width + 18 * u : 0;
      const checkR = ls * 0.62;
      const labelMax = innerW - 52 * u - pw - vw - (it.win ? checkR * 2 + 18 * u : 0);
      ctx.font = INTER(it.win ? 700 : 600, ls);
      const lab = ellipsize(ctx, it.label, labelMax);
      ctx.fillText(lab, lx, y + rh / 2 + ls * 0.04);
      // check da vencedora
      if (it.win) {
        const cs = spring(seg(t, T_WIN + 0.1, T_WIN + 0.75), 0.4);
        if (cs > 0.001) {
          const ccx = lx + ctx.measureText(lab).width + 16 * u + checkR;
          const ccy = y + rh / 2;
          ctx.save();
          ctx.translate(ccx, ccy);
          ctx.scale(cs, cs);
          ctx.fillStyle = p.ink;
          ctx.beginPath();
          ctx.arc(0, 0, checkR, 0, TAU);
          ctx.fill();
          const draw = ease.outCubic(seg(t, T_WIN + 0.3, T_WIN + 0.75));
          ctx.strokeStyle = p.accent;
          ctx.lineWidth = checkR * 0.3;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          const P = [[-0.42, 0.02], [-0.12, 0.32], [0.45, -0.3]].map(([x, yy]) => [x * checkR, yy * checkR]);
          const l1 = Math.hypot(P[1][0] - P[0][0], P[1][1] - P[0][1]);
          const l2 = Math.hypot(P[2][0] - P[1][0], P[2][1] - P[1][1]);
          const d = draw * (l1 + l2);
          ctx.beginPath();
          ctx.moveTo(...P[0]);
          if (d <= l1) ctx.lineTo(P[0][0] + ((P[1][0] - P[0][0]) * d) / l1, P[0][1] + ((P[1][1] - P[0][1]) * d) / l1);
          else {
            ctx.lineTo(...P[1]);
            const e = (d - l1) / l2;
            ctx.lineTo(P[1][0] + (P[2][0] - P[1][0]) * e, P[1][1] + (P[2][1] - P[1][1]) * e);
          }
          ctx.stroke();
          ctx.restore();
        }
      }
      // porcentagem e votos à direita
      ctx.textAlign = 'right';
      ctx.font = INTER(800, ls);
      ctx.fillStyle = rgba(p.ink, it.win ? 1 : 0.92 * dim + 0.08);
      const rx = pad + innerW - 26 * u;
      ctx.fillText(pctTxt, rx, y + rh / 2 + ls * 0.04);
      if (votesTxt) {
        ctx.font = INTER(500, ls * 0.72);
        ctx.fillStyle = rgba(p.ink, it.win ? 0.75 * (1 - winK) + 0.85 * winK : 0.45 * dim);
        ctx.fillText(votesTxt, rx - pw - 14 * u, y + rh / 2 + ls * 0.06);
      }
      ctx.textAlign = 'left';
      ctx.restore();
    }

    // rodapé
    const fIn = ease.outCubic(seg(t, 1.6, 2.4));
    if (fIn > 0.001) {
      const fy = y0 + listH + footH * 0.62;
      ctx.globalAlpha = op * fIn;
      ctx.textBaseline = 'middle';
      ctx.font = INTER(500, 26 * u);
      ctx.fillStyle = rgba(p.ink, 0.5);
      const totalNow = Math.round(total * ease.outExpo(seg(t, 1.15, 2.9)));
      const parts = [`${fmt.format(totalNow)} votos`];
      if (p.footer) parts.push(p.footer);
      ctx.fillText(parts.join('  ·  '), pad, fy);
      // ponto "ao vivo" que vira encerrado na revelação
      const dotR = 7 * u;
      ctx.textAlign = 'right';
      const tag = winK > 0.5 ? 'RESULTADO' : 'AO VIVO';
      ctx.font = INTER(700, 21 * u);
      ctx.letterSpacing = `${21 * u * 0.12}px`;
      const tw = ctx.measureText(tag).width;
      ctx.fillStyle = rgba(p.ink, 0.6);
      ctx.fillText(tag, pad + innerW, fy);
      ctx.letterSpacing = '0px';
      const blink = winK > 0 ? 1 : 0.55 + 0.45 * Math.cos(TAU * t * 1.2);
      ctx.fillStyle = winK > 0.5 ? p.accent : rgba('#ff5a5f', blink);
      ctx.beginPath();
      ctx.arc(pad + innerW - tw - 22 * u, fy, dotR, 0, TAU);
      ctx.fill();
      ctx.textAlign = 'left';
    }
    ctx.restore();
  },
};
