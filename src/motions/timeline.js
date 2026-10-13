import { TAU, clamp, seg, ease, spring, stagger, rgba } from '../lib/anim.js';

// "data | título" (opcional: "| descrição") por linha. Também aceita " - " ou ":" entre data e título.
function parse(text) {
  const out = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const l = line.trim();
    if (!l || l.startsWith('#')) continue;
    let parts = l.split('|').map((s) => s.trim());
    if (parts.length === 1) {
      const m = l.match(/^(.{1,16}?)\s+[–—-]\s+(.+)$/) || l.match(/^([^:]{1,16}):\s*(.+)$/);
      parts = m ? [m[1].trim(), m[2].trim()] : ['', l];
    }
    const [date, title = '', desc = ''] = parts;
    if (!date && !title) continue;
    out.push({ date, title, desc });
  }
  return out;
}

// Quebra em linhas que cabem em maxW (ctx.font definido); corta em maxLines com reticências.
function wrap(ctx, text, maxW, maxLines = 3) {
  const words = String(text).split(/\s+/).filter(Boolean);
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
  if (lines.length > maxLines) {
    lines.length = maxLines;
    let s = lines[maxLines - 1];
    while (s.length > 1 && ctx.measureText(`${s}…`).width > maxW) s = s.slice(0, -1);
    lines[maxLines - 1] = `${s.trimEnd()}…`;
  }
  return lines.map((s) => {
    // palavra única mais larga que a caixa: corta
    if (ctx.measureText(s).width <= maxW) return s;
    while (s.length > 1 && ctx.measureText(`${s}…`).width > maxW) s = s.slice(0, -1);
    return `${s}…`;
  });
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

const INTER = (wt) => (s) => `${wt} ${s}px Inter, system-ui, sans-serif`;
const MONO = (s) => `500 ${s}px 'JetBrains Mono', ui-monospace, monospace`;

const DEFAULT = `2019 | Fundação em São Paulo | Três pessoas e uma garagem
2020 | Primeiro produto no ar | 1.000 clientes no primeiro mês
2021 | 100 mil usuários
2023 | Rodada Série A | R$ 40 milhões para crescer
2025 | Expansão para a América Latina | Escritórios em Bogotá e na Cidade do México`;

export default {
  id: 'timeline',
  title: 'Timeline',
  description: 'Linha do tempo que se desenha com marcos pulsando, datas e cards surgindo; vira vertical no 9:16.',
  category: 'dados',
  tags: ['dados', 'ui', 'tipografia'],
  duration: 9,
  poster: 6.4,

  params: {
    title: { type: 'text', label: 'Título', default: 'Nossa história' },
    data: { type: 'textarea', label: 'Marcos (data | título | descrição)', rows: 6, default: DEFAULT },
    orientation: { type: 'select', label: 'Orientação', options: ['auto', 'horizontal', 'vertical'], default: 'auto' },
    cards: { type: 'boolean', label: 'Cards com fundo', default: true },
    accent: { type: 'color', label: 'Destaque', default: '#ff5a36' },
    ink: { type: 'color', label: 'Texto', default: '#f2efe8' },
    panel: { type: 'color', label: 'Card', default: '#1a1c21' },
    bg: { type: 'color', label: 'Fundo', default: '#0e0f12' },
    transparent: { type: 'boolean', label: 'Fundo transparente', default: false },
  },

  setup({ p }) {
    return { items: parse(p.data) };
  },

  render(ctx, t, { w, h, p, duration, state }) {
    if (!p.transparent) {
      ctx.fillStyle = p.bg;
      ctx.fillRect(0, 0, w, h);
      const vg = ctx.createRadialGradient(w * 0.5, h * 0.45, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.8);
      vg.addColorStop(0, rgba('#000000', 0));
      vg.addColorStop(1, rgba('#000000', 0.32));
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, w, h);
    }
    const { items } = state;
    const n = items.length;
    const m = Math.min(w, h);
    const vertical = p.orientation === 'vertical' || (p.orientation === 'auto' && h > w * 0.9);
    const OUT = duration - 1.0;
    const outAll = ease.inCubic(seg(t, OUT, duration - 0.1));

    // ---------- título ----------
    const padX = vertical ? w * 0.08 : w * 0.06;
    let top = vertical ? h * 0.08 : h * 0.1;
    if (p.title) {
      const ts = m * (vertical ? 0.068 : 0.058);
      const tIn = ease.outExpo(seg(t, 0.1, 1.0));
      ctx.fillStyle = p.accent;
      ctx.fillRect(padX, top - ts * 0.95, m * 0.045 * ease.outExpo(seg(t, 0.05, 0.8)) * (1 - outAll), m * 0.006);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, top - ts * 0.85, w, ts * 1.3);
      ctx.clip();
      const fs = fitFont(ctx, p.title, w - padX * 2, ts, INTER(800));
      ctx.letterSpacing = `${-fs * 0.02}px`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = rgba(p.ink, 1 - outAll);
      ctx.fillText(p.title, padX, top + fs * 0.2 + (1 - tIn) * fs * 1.2);
      ctx.letterSpacing = '0px';
      ctx.restore();
      top += ts * 0.6;
    }

    if (!n) {
      ctx.font = INTER(500)(m * 0.03);
      ctx.fillStyle = rgba(p.ink, 0.5);
      ctx.textAlign = 'center';
      ctx.fillText('Sem marcos — use uma linha "data | título" por marco', w / 2, h / 2);
      return;
    }

    // ---------- tempos ----------
    const L0 = 0.7; // linha começa
    const L1 = Math.min(duration - 2.4, L0 + 1.0 + n * 0.75); // linha termina
    // linha avança marco a marco: anda rápido entre marcos e desacelera em cada um
    const lineK = (tt) => {
      if (n === 1) return ease.outExpo(seg(tt, L0, L1));
      const segs = n; // trecho até o 1º marco + (n-1) trechos
      const u = seg(tt, L0, L1) * segs;
      const i = Math.min(segs - 1, Math.floor(u));
      return (i + ease.outQuart(u - i)) / segs;
    };
    const outI = (i) => ease.inCubic(seg(t, OUT + stagger(i, n, 0.3), OUT + 0.5 + stagger(i, n, 0.3)));

    // geometria da linha
    let ax, ay, bx, by;
    if (vertical) {
      ax = padX + m * 0.04;
      ay = top + h * 0.06;
      bx = ax;
      by = h - h * 0.07;
    } else {
      ax = padX;
      ay = h * 0.58;
      bx = w - padX;
      by = ay;
    }
    // marcos: primeiro um pouco depois do início; último um pouco antes do fim
    const posOf = (u) => [ax + (bx - ax) * u, ay + (by - ay) * u];
    // horizontal: cards alternam acima/abaixo, então cada um pode ocupar ~2 espaçamentos;
    // a margem antes do 1º marco é meia largura de card (nada sai da tela).
    const L = Math.hypot(bx - ax, by - ay);
    const cardGapX = m * 0.02;
    let lead = 0.5 / n;
    let cardW = m * 0.6;
    if (!vertical && n > 1) {
      let sp = (L + cardGapX) / (n + 1);
      cardW = 2 * sp - cardGapX;
      if (cardW > m * 0.56) {
        cardW = m * 0.56;
        sp = (L - cardW) / (n - 1);
      }
      lead = cardW / 2 / L;
    }
    const cardGap = m * 0.035;
    // mede um card com escala de fonte fk
    const layoutCard = (it, fk) => {
      const ds = m * (vertical ? 0.03 : 0.027) * fk;
      const tsz = m * (vertical ? 0.042 : 0.04) * fk;
      const dsz = tsz * 0.66;
      const pad = m * 0.024 * fk;
      const cw = vertical ? w - padX - (ax + cardGap * 1.4) : cardW;
      const innerW = cw - pad * 2;
      ctx.font = INTER(700)(tsz);
      const tl = it.title ? wrap(ctx, it.title, innerW, vertical ? 2 : 3) : [];
      ctx.font = INTER(500)(dsz);
      const dl = it.desc ? wrap(ctx, it.desc, innerW, 2) : [];
      const ch = pad * 2 + ds * 1.25 + (tl.length ? tl.length * tsz * 1.18 + tsz * 0.2 : 0) + (dl.length ? dl.length * dsz * 1.35 + dsz * 0.3 : 0);
      return { cw, ds, tsz, dsz, pad, tl, dl, ch };
    };
    // vertical: fontes encolhem se os cards não couberem entre marcos
    let fk = 1;
    if (vertical && n > 1) {
      const sp = ((by - ay) * (1 - lead * 2)) / (n - 1);
      const maxH = Math.max(...items.map((it) => layoutCard(it, 1).ch));
      fk = clamp((sp * 0.9) / maxH, 0.5, 1);
    }
    // mapa marco → fração de linha para sincronizar
    const markU = (i) => (n === 1 ? 0.5 : lead + ((1 - lead * 2) * i) / (n - 1));
    // a linha percorre de 0 a 1; reescala para chegar a cada marco no fim de cada trecho
    const lineU = (() => {
      const kk = lineK(t) * n; // 0..n
      const i = Math.min(n - 1, Math.floor(kk));
      const f = kk - i;
      const from = i === 0 ? 0 : markU(i - 1);
      const to = markU(i);
      // depois do último marco, completa até o fim
      if (kk >= n) return markU(n - 1) + (1 - markU(n - 1)) * ease.outExpo(seg(t, L1, L1 + 0.8));
      return from + (to - from) * f;
    })();
    const hitT = (i) => L0 + ((L1 - L0) * (i + 1)) / n - 0.08; // instante em que a linha chega ao marco i

    // trilho e linha
    const lw = Math.max(2, m * 0.004);
    const trackIn = ease.outExpo(seg(t, 0.3, 1.3)) * (1 - outAll);
    ctx.lineCap = 'round';
    ctx.strokeStyle = rgba(p.ink, 0.1 * trackIn);
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(...posOf(trackIn));
    ctx.stroke();
    const uOut = ease.inOutCubic(seg(t, OUT, duration - 0.15)); // a linha recolhe do início para o fim
    if (lineU > uOut) {
      const g = ctx.createLinearGradient(ax, ay, bx, by);
      g.addColorStop(0, rgba(p.ink, 0.35));
      g.addColorStop(1, rgba(p.ink, 0.8));
      ctx.strokeStyle = g;
      ctx.beginPath();
      ctx.moveTo(...posOf(uOut));
      ctx.lineTo(...posOf(lineU));
      ctx.stroke();
      // cabeça luminosa
      if (t < L1 + 0.8 && t > L0) {
        const [hx, hy] = posOf(lineU);
        for (const [r, a] of [[m * 0.022, 0.12], [m * 0.012, 0.25]]) {
          ctx.fillStyle = rgba(p.accent, a);
          ctx.beginPath();
          ctx.arc(hx, hy, r, 0, TAU);
          ctx.fill();
        }
        ctx.fillStyle = p.accent;
        ctx.beginPath();
        ctx.arc(hx, hy, m * 0.006, 0, TAU);
        ctx.fill();
      }
    }

    // ---------- marcos e cards ----------
    // índice do marco mais recente (o "agora" da linha)
    let latest = -1;
    for (let i = 0; i < n; i++) if (t >= hitT(i)) latest = i;

    for (let i = 0; i < n; i++) {
      const it = items[i];
      const [mx, my] = posOf(markU(i));
      const a = hitT(i);
      const pop = spring(seg(t, a, a + 0.7), 0.3) * (1 - outI(i));
      if (pop <= 0.001 && t < a) continue;
      const isNow = i === latest;
      // marcador
      const R = m * 0.014;
      const ring = seg(t, a, a + 0.9);
      if (ring > 0 && ring < 1) {
        ctx.strokeStyle = rgba(p.accent, 0.5 * (1 - ring));
        ctx.lineWidth = Math.max(1, m * 0.002);
        ctx.beginPath();
        ctx.arc(mx, my, R * (1 + ring * 2.6), 0, TAU);
        ctx.stroke();
      }
      if (pop > 0.001) {
        ctx.fillStyle = p.transparent ? 'rgba(0,0,0,0.6)' : p.bg;
        ctx.beginPath();
        ctx.arc(mx, my, R * pop * 1.25, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = isNow ? p.accent : rgba(p.ink, 0.85);
        ctx.lineWidth = Math.max(2, m * 0.0035);
        ctx.beginPath();
        ctx.arc(mx, my, R * pop, 0, TAU);
        ctx.stroke();
        ctx.fillStyle = isNow ? p.accent : p.ink;
        ctx.beginPath();
        ctx.arc(mx, my, R * pop * 0.45, 0, TAU);
        ctx.fill();
      }

      // card
      const cIn = ease.outExpo(seg(t, a + 0.05, a + 0.9)) * (1 - outI(i));
      if (cIn <= 0.001) continue;
      let cx, cy, dir;
      const { cw, ds, tsz, dsz, pad, tl, dl, ch } = layoutCard(it, fk);
      if (vertical) {
        cx = mx + cardGap * 1.4;
        dir = 1;
      } else {
        cx = mx - cw / 2;
        dir = i % 2 === 0 ? -1 : 1; // alterna acima/abaixo
      }
      if (vertical) {
        // limita a altura disponível por marco
        cy = my - Math.min(ch * 0.5, m * 0.04);
      } else {
        cy = dir < 0 ? my - cardGap * 1.4 - ch : my + cardGap * 1.4;
      }
      const slide = (1 - cIn) * m * 0.04;

      ctx.save();
      ctx.globalAlpha = cIn;
      if (vertical) ctx.translate(-slide, 0);
      else ctx.translate(0, dir < 0 ? slide : -slide);
      // conector
      ctx.strokeStyle = rgba(isNow ? p.accent : p.ink, isNow ? 0.8 : 0.3);
      ctx.lineWidth = Math.max(1, m * 0.002);
      ctx.beginPath();
      if (vertical) {
        ctx.moveTo(mx + R * 1.6, my);
        ctx.lineTo(cx, my);
      } else {
        ctx.moveTo(mx, my + dir * R * 1.6);
        ctx.lineTo(mx, dir < 0 ? cy + ch : cy);
      }
      ctx.stroke();
      if (p.cards) {
        ctx.fillStyle = p.panel;
        ctx.beginPath();
        ctx.roundRect(cx, cy, cw, ch, m * 0.014);
        ctx.fill();
        ctx.strokeStyle = rgba(isNow ? p.accent : p.ink, isNow ? 0.55 : 0.08);
        ctx.lineWidth = Math.max(1, m * 0.0015);
        ctx.stroke();
      }
      const tx = cx + (p.cards ? pad : 0);
      let ty = cy + pad;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.font = MONO(ds);
      ctx.fillStyle = isNow ? p.accent : rgba(p.ink, 0.6);
      ctx.fillText(it.date, tx, ty);
      ty += ds * 1.25 + tsz * 0.2;
      ctx.font = INTER(700)(tsz);
      ctx.fillStyle = p.ink;
      ctx.letterSpacing = `${-tsz * 0.01}px`;
      tl.forEach((l, j) => ctx.fillText(l, tx, ty + j * tsz * 1.18));
      ctx.letterSpacing = '0px';
      ty += tl.length * tsz * 1.18 + dsz * 0.3;
      ctx.font = INTER(500)(dsz);
      ctx.fillStyle = rgba(p.ink, 0.55);
      dl.forEach((l, j) => ctx.fillText(l, tx, ty + j * dsz * 1.35));
      ctx.restore();
    }
  },
};
