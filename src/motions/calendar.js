import { TAU, clamp, lerp, seg, ease, spring, rgba } from '../lib/anim.js';

// Calendário mensal: a grade entra com stagger diagonal, os dias marcados ganham ponto, "hoje" ganha
// um anel; um cursor pega o card do evento ao lado e arrasta até o dia — o card vira o círculo de
// destaque — e os dias até lá acendem em sequência enquanto o contador conta.

const INTER = (wt, s) => `${wt} ${s}px Inter, system-ui, sans-serif`;
const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const WEEK = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const T_CARD = 1.4; // card do evento aparece
const T_CUR0 = 1.9; // cursor entra
const T_PRESS = 2.65; // clique
const T_DRAG0 = 2.85;
const T_DRAG1 = 3.95; // solta
const T_MORPH = 4.4; // card virou círculo
const T_COUNT0 = 4.3;
const T_COUNT1 = 5.9;

function ellipsize(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxW) s = s.slice(0, -1);
  return `${s.trimEnd()}…`;
}

// Seta do mouse com ponta em (0,0), altura s.
function cursorPath(ctx, s) {
  const k = s / 24;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, 19 * k);
  ctx.lineTo(4.6 * k, 14.8 * k);
  ctx.lineTo(8.2 * k, 22.6 * k);
  ctx.lineTo(11.4 * k, 21.2 * k);
  ctx.lineTo(7.9 * k, 13.6 * k);
  ctx.lineTo(13.8 * k, 13.6 * k);
  ctx.closePath();
}

export default {
  id: 'calendar',
  title: 'Calendar',
  description: 'A monthly calendar: the grid builds in, an event is dragged onto its day and a countdown ticks toward it.',
  category: 'dados',
  tags: ['data', 'ui', 'alpha'],
  duration: 8,
  poster: 5.2,

  params: {
    month: { type: 'select', label: 'Month', options: MONTHS, default: 'Outubro' },
    year: { type: 'range', label: 'Year', min: 2020, max: 2035, step: 1, default: 2026 },
    today: { type: 'range', label: 'Today', min: 1, max: 31, step: 1, default: 12 },
    eventDay: { type: 'range', label: 'Event day', min: 1, max: 31, step: 1, default: 24 },
    eventTitle: { type: 'text', label: 'Event', default: 'Launch' },
    eventTime: { type: 'text', label: 'Time', default: '14:00' },
    marked: { type: 'text', label: 'Marked days', default: '3, 7, 15, 18, 29' },
    accent: { type: 'color', label: 'Accent', default: '#ff5a4e' },
    panel: { type: 'color', label: 'Panel', default: '#16181d' },
    ink: { type: 'color', label: 'Text', default: '#f2efe8' },
    bg: { type: 'color', label: 'Background', default: '#0b0c0f' },
    transparent: { type: 'boolean', label: 'Transparent background', default: false },
  },

  setup({ p }) {
    const mi = Math.max(0, MONTHS.indexOf(p.month));
    const year = Math.round(p.year);
    const first = new Date(year, mi, 1).getDay();
    const dim = new Date(year, mi + 1, 0).getDate();
    const prevDim = new Date(year, mi, 0).getDate();
    const rows = Math.ceil((first + dim) / 7);
    const today = clamp(Math.round(p.today), 1, dim);
    const ev = clamp(Math.round(p.eventDay), 1, dim);
    const marked = new Set(
      String(p.marked || '')
        .split(/[^\d]+/)
        .map(Number)
        .filter((d) => d >= 1 && d <= dim && d !== ev),
    );
    // células: dia do mês (ou de mês vizinho, apagado)
    const cells = [];
    for (let k = 0; k < rows * 7; k++) {
      const d = k - first + 1;
      if (d < 1) cells.push({ n: prevDim + d, out: true });
      else if (d > dim) cells.push({ n: d - dim, out: true });
      else cells.push({ n: d, out: false });
    }
    return { mi, year, first, dim, rows, today, ev, marked, cells };
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
    const { rows, cells, first, today, ev, marked } = state;
    const vertical = w / h < 0.95;

    // ---------- layout ----------
    const headU = 1.75; // altura do cabeçalho (em células)
    const weekU = 0.62;
    const padU = 0.32;
    const panelHU = headU + weekU + rows + padU * 2;
    const panelWU = 7 + padU * 2;
    const sideWU = !vertical && w / h < 1.3 ? 3.5 : 4.6;
    const sideHU = 2.9;
    const gapU = 0.55;
    const cs = vertical
      ? Math.min((w * 0.88) / panelWU, (h * 0.86) / (panelHU + gapU + sideHU))
      : Math.min((h * 0.84) / panelHU, (w * 0.9) / (panelWU + gapU + sideWU));
    const pw = panelWU * cs;
    const ph = panelHU * cs;
    let px0, py0, sx0, sy0; // painel e área lateral
    if (vertical) {
      const totH = ph + gapU * cs + sideHU * cs;
      px0 = (w - pw) / 2;
      py0 = (h - totH) / 2;
      sx0 = px0;
      sy0 = py0 + ph + gapU * cs;
    } else {
      const totW = pw + gapU * cs + sideWU * cs;
      px0 = (w - totW) / 2;
      py0 = (h - ph) / 2;
      sx0 = px0 + pw + gapU * cs;
      sy0 = py0 + headU * cs;
    }
    const gx = px0 + padU * cs;
    const gy = py0 + padU * cs + headU * cs + weekU * cs;
    const cellC = (k) => [gx + (k % 7) * cs + cs / 2, gy + Math.floor(k / 7) * cs + cs / 2];
    const dayK = (d) => d + first - 1;

    const OUT = duration - 1.0;
    const outE = ease.inCubic(seg(t, OUT, OUT + 0.75));
    const panelIn = spring(seg(t, 0.0, 0.95), 0.15);
    const panelOp = clamp(seg(t, 0, 0.35)) * (1 - outE);
    if (panelOp <= 0.001) return;

    ctx.save();
    ctx.globalAlpha = panelOp;
    ctx.translate(0, (1 - panelIn) * cs * 0.8 + outE * cs * 0.5);

    // ---------- painel ----------
    // sombra barata (shadowBlur num painel deste tamanho custa dezenas de ms)
    ctx.save();
    for (let i = 3; i >= 1; i--) {
      ctx.fillStyle = `rgba(0,0,0,${0.09})`;
      ctx.beginPath();
      ctx.roundRect(px0 - i * cs * 0.06, py0 - i * cs * 0.03 + cs * 0.12, pw + i * cs * 0.12, ph + i * cs * 0.1, cs * 0.3 + i * cs * 0.06);
      ctx.fill();
    }
    ctx.fillStyle = p.panel;
    ctx.beginPath();
    ctx.roundRect(px0, py0, pw, ph, cs * 0.3);
    ctx.fill();
    ctx.restore();
    const hl = ctx.createLinearGradient(0, py0, 0, py0 + ph);
    hl.addColorStop(0, rgba('#ffffff', 0.08));
    hl.addColorStop(1, rgba('#ffffff', 0.02));
    ctx.strokeStyle = hl;
    ctx.lineWidth = Math.max(1, cs * 0.015);
    ctx.stroke();

    // cabeçalho: mês e ano, setas
    const hIn = ease.outExpo(seg(t, 0.2, 1.0));
    const hy = py0 + padU * cs + headU * cs * 0.5;
    ctx.save();
    ctx.beginPath();
    ctx.rect(px0, py0 + padU * cs * 0.5, pw, headU * cs);
    ctx.clip();
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    const ms = cs * 0.46;
    ctx.font = INTER(800, ms);
    ctx.letterSpacing = `${-ms * 0.02}px`;
    ctx.fillStyle = p.ink;
    const mName = MONTHS[state.mi];
    const dy = (1 - hIn) * cs;
    ctx.fillText(mName, gx + cs * 0.15, hy + dy);
    const mW = ctx.measureText(mName).width;
    ctx.font = INTER(400, ms);
    ctx.fillStyle = rgba(p.ink, 0.4);
    ctx.fillText(String(state.year), gx + cs * 0.15 + mW + ms * 0.35, hy + dy);
    ctx.letterSpacing = '0px';
    // setas ‹ ›
    ctx.strokeStyle = rgba(p.ink, 0.45);
    ctx.lineWidth = Math.max(1, cs * 0.03);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const ar = cs * 0.1;
    for (const [ax, dir] of [[gx + 7 * cs - cs * 1.05, -1], [gx + 7 * cs - cs * 0.4, 1]]) {
      ctx.beginPath();
      ctx.moveTo(ax - dir * ar * 0.5, hy - ar + dy);
      ctx.lineTo(ax + dir * ar * 0.5, hy + dy);
      ctx.lineTo(ax - dir * ar * 0.5, hy + ar + dy);
      ctx.stroke();
    }
    ctx.restore();
    // linha divisória
    ctx.fillStyle = rgba(p.ink, 0.07);
    ctx.fillRect(gx, py0 + padU * cs + headU * cs - cs * 0.12, 7 * cs * ease.outExpo(seg(t, 0.3, 1.2)), Math.max(1, cs * 0.012));

    // dias da semana
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = INTER(600, cs * 0.2);
    ctx.letterSpacing = `${cs * 0.02}px`;
    for (let i = 0; i < 7; i++) {
      const a = ease.outCubic(seg(t, 0.35 + i * 0.04, 0.85 + i * 0.04));
      ctx.fillStyle = rgba(p.ink, 0.4 * a);
      ctx.fillText(WEEK[i], gx + i * cs + cs / 2, gy - weekU * cs * 0.45 + (1 - a) * cs * 0.2);
    }
    ctx.letterSpacing = '0px';

    // ---------- realce do trajeto hoje → evento (acende em sequência) ----------
    const lo = Math.min(today, ev);
    const hi = Math.max(today, ev);
    const span = hi - lo;
    const countK = ease.inOutCubic(seg(t, T_COUNT0, T_COUNT1));
    if (span > 0 && countK > 0) {
      ctx.fillStyle = rgba(p.accent, 0.13);
      for (let d = lo; d <= hi; d++) {
        const step = ev >= today ? d - today : today - d; // 0..span na ordem da contagem
        const on = clamp(countK * span - step + 1);
        if (on <= 0) continue;
        const [cx, cy] = cellC(dayK(d));
        // faixa contínua por linha: cada célula preenche inteira, com cantos arredondados nas pontas da linha
        const col = dayK(d) % 7;
        const left = d === lo || col === 0;
        const right = d === hi || col === 6;
        const bh = cs * 0.72;
        const r = bh / 2;
        const x0 = cx - cs / 2 + (left ? cs * 0.08 : 0);
        const x1 = cx + cs / 2 - (right ? cs * 0.08 : 0);
        ctx.globalAlpha = panelOp * ease.outCubic(on);
        ctx.beginPath();
        ctx.roundRect(x0, cy - bh / 2, x1 - x0 + (right ? 0 : 0.6), bh, [left ? r : 0, right ? r : 0, right ? r : 0, left ? r : 0]);
        ctx.fill();
      }
      ctx.globalAlpha = panelOp;
    }

    // ---------- números ----------
    const ns = cs * 0.3;
    ctx.font = INTER(500, ns);
    for (let k = 0; k < cells.length; k++) {
      const c = cells[k];
      const col = k % 7;
      const row = Math.floor(k / 7);
      const a0 = 0.35 + (col + row) * 0.055;
      const e = ease.outExpo(seg(t, a0, a0 + 0.7));
      if (e <= 0.001) continue;
      const [cx, cy] = cellC(k);
      const isEv = !c.out && c.n === ev;
      const morph = isEv ? ease.inOutCubic(seg(t, T_DRAG1 + 0.05, T_MORPH)) : 0;
      const isToday = !c.out && c.n === today;
      ctx.globalAlpha = panelOp * clamp(e * 1.3);
      ctx.fillStyle = c.out ? rgba(p.ink, 0.16) : isEv && morph > 0.5 ? '#ffffff' : isToday ? p.ink : rgba(p.ink, col === 0 ? 0.55 : 0.82);
      if (isToday) ctx.font = INTER(700, ns);
      ctx.fillText(String(c.n), cx, cy + (1 - e) * cs * 0.3 + ns * 0.04);
      if (isToday) ctx.font = INTER(500, ns);
      // dias marcados: ponto embaixo
      if (!c.out && marked.has(c.n)) {
        const dp = spring(seg(t, 1.2 + (col + row) * 0.03, 1.7 + (col + row) * 0.03), 0.4);
        if (dp > 0) {
          ctx.fillStyle = rgba(p.ink, 0.5);
          ctx.beginPath();
          ctx.arc(cx, cy + cs * 0.25, cs * 0.035 * dp, 0, TAU);
          ctx.fill();
        }
      }
    }
    ctx.globalAlpha = panelOp;

    // hoje: anel que se desenha
    {
      const [cx, cy] = cellC(dayK(today));
      const ring = ease.inOutCubic(seg(t, 1.2, 1.9));
      if (ring > 0) {
        ctx.strokeStyle = p.ink;
        ctx.lineWidth = Math.max(1, cs * 0.025);
        ctx.beginPath();
        ctx.arc(cx, cy, cs * 0.33, -Math.PI / 2, -Math.PI / 2 + TAU * ring);
        ctx.stroke();
        const lab = ease.outCubic(seg(t, 1.6, 2.1));
        ctx.font = INTER(700, cs * 0.12);
        ctx.letterSpacing = `${cs * 0.015}px`;
        ctx.fillStyle = rgba(p.ink, 0.6 * lab);
        ctx.fillText('TODAY', cx, cy - cs * 0.42 + (1 - lab) * cs * 0.06);
        ctx.letterSpacing = '0px';
      }
    }

    // ---------- card do evento: origem → arrasto → vira o círculo do dia ----------
    const cardW = Math.min(sideWU * cs * 0.92, vertical ? pw * 0.52 : 1e9);
    const cardH = cs * 0.95;
    const homeX = sx0 + (vertical ? 0 : 0);
    const homeY = vertical ? sy0 : sy0 + cs * 0.55;
    const [tx, ty] = cellC(dayK(ev));
    const R = cs * 0.36;
    const cardIn = spring(seg(t, T_CARD, T_CARD + 0.8), 0.25);
    const press = ease.outCubic(seg(t, T_PRESS, T_PRESS + 0.15)) * (1 - ease.inCubic(seg(t, T_DRAG1 - 0.1, T_DRAG1 + 0.1)));
    const drag = ease.inOutCubic(seg(t, T_DRAG0, T_DRAG1));
    const morph = ease.inOutCubic(seg(t, T_DRAG1 + 0.05, T_MORPH));
    // rótulo da área lateral
    if (!vertical) {
      const la = ease.outCubic(seg(t, T_CARD - 0.2, T_CARD + 0.5));
      ctx.textAlign = 'left';
      ctx.font = INTER(700, cs * 0.15);
      ctx.letterSpacing = `${cs * 0.025}px`;
      ctx.fillStyle = rgba(p.ink, 0.45 * la);
      ctx.fillText('DRAG TO SCHEDULE', homeX, homeY - cs * 0.3);
      ctx.letterSpacing = '0px';
    }
    // lugar vazio que fica quando o card sai
    if (drag > 0 && cardIn > 0) {
      ctx.setLineDash([cs * 0.06, cs * 0.05]);
      ctx.strokeStyle = rgba(p.ink, 0.18 * clamp(drag * 3) * (1 - ease.outCubic(seg(t, T_MORPH, T_MORPH + 0.8))));
      ctx.lineWidth = Math.max(1, cs * 0.015);
      ctx.beginPath();
      ctx.roundRect(homeX, homeY, cardW, cardH, cs * 0.16);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // posição do centro do card ao longo do arrasto (arco suave)
    const hx = homeX + cardW / 2;
    const hy2 = homeY + cardH / 2;
    const ctlX = lerp(hx, tx, 0.5);
    const ctlY = Math.min(hy2, ty) - cs * 1.2;
    const bx = (1 - drag) ** 2 * hx + 2 * drag * (1 - drag) * ctlX + drag * drag * tx;
    const by = (1 - drag) ** 2 * hy2 + 2 * drag * (1 - drag) * ctlY + drag * drag * ty;
    // tamanho: card inteiro → círculo
    const rw = lerp(cardW, R * 2, morph);
    const rh = lerp(cardH, R * 2, morph);
    const rr = lerp(cs * 0.16, R, morph);
    const lift = 1 + 0.05 * press;
    const tilt = Math.sin(drag * Math.PI) * 0.06 * (tx > hx ? 1 : -1);
    if (cardIn > 0.001) {
      ctx.save();
      ctx.translate(bx, by);
      ctx.rotate(tilt);
      ctx.scale(lift * (0.85 + 0.15 * cardIn), lift * (0.85 + 0.15 * cardIn));
      ctx.globalAlpha = panelOp * clamp(cardIn * 1.5);
      if (morph < 1) {
        ctx.save();
        ctx.shadowColor = `rgba(0,0,0,${0.3 + 0.25 * press})`;
        ctx.shadowBlur = cs * (0.25 + 0.35 * press) * px;
        ctx.shadowOffsetY = cs * (0.08 + 0.15 * press) * px;
        ctx.fillStyle = mixToHex(p.panel, p.ink, 0.07 * (1 - morph));
        ctx.beginPath();
        ctx.roundRect(-rw / 2, -rh / 2, rw, rh, rr);
        ctx.fill();
        ctx.restore();
      }
      // a cor de destaque sobe da faixa lateral até encher o círculo
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(-rw / 2, -rh / 2, rw, rh, rr);
      ctx.clip();
      ctx.fillStyle = p.accent;
      ctx.fillRect(-rw / 2, -rh / 2, lerp(cs * 0.07, rw, morph), rh);
      // texto do card
      const ta = 1 - clamp(morph * 2.5);
      if (ta > 0) {
        ctx.globalAlpha *= ta;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const fs = cs * 0.24;
        ctx.font = INTER(700, fs);
        ctx.fillStyle = p.ink;
        const tx0 = -rw / 2 + cs * 0.28;
        ctx.fillText(ellipsize(ctx, p.eventTitle || 'Evento', rw - cs * 0.5), tx0, -cs * 0.11);
        ctx.font = INTER(500, fs * 0.72);
        ctx.fillStyle = rgba(p.ink, 0.55);
        const sub = `${ev} de ${MONTHS[state.mi].toLowerCase()}${p.eventTime ? ` · ${p.eventTime}` : ''}`;
        ctx.fillText(ellipsize(ctx, sub, rw - cs * 0.5), tx0, cs * 0.17);
      }
      ctx.restore();
      ctx.restore();
    }
    // número do dia por cima do círculo + nome do evento embaixo
    if (morph > 0.5) {
      const k = clamp((morph - 0.5) * 2);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = INTER(700, ns);
      ctx.fillStyle = rgba('#ffffff', k);
      ctx.fillText(String(ev), tx, ty + ns * 0.04);
      const pop = spring(seg(t, T_MORPH - 0.1, T_MORPH + 0.5), 0.45);
      // onda ao assentar
      const wv = seg(t, T_MORPH - 0.1, T_MORPH + 0.8);
      if (wv > 0 && wv < 1) {
        ctx.strokeStyle = rgba(p.accent, 0.6 * (1 - wv));
        ctx.lineWidth = Math.max(1, cs * 0.02);
        ctx.beginPath();
        ctx.arc(tx, ty, R + cs * 0.3 * ease.outCubic(wv), 0, TAU);
        ctx.stroke();
      }
      ctx.font = INTER(700, cs * 0.12);
      ctx.fillStyle = rgba(p.accent, pop > 0 ? clamp(pop) : 0);
      const tt = ellipsize(ctx, (p.eventTitle || '').toUpperCase(), cs * 0.98);
      ctx.letterSpacing = `${cs * 0.01}px`;
      ctx.fillText(tt, tx, ty + R + cs * 0.065 + (1 - clamp(pop)) * cs * 0.05);
      ctx.letterSpacing = '0px';
    }

    // ---------- contador ----------
    const cIn = ease.outExpo(seg(t, T_COUNT0 - 0.2, T_COUNT0 + 0.6));
    if (cIn > 0.001) {
      const n = Math.round(span * countK);
      const ccx = vertical ? sx0 + cardW + (pw - cardW) / 2 + cs * 0.2 : homeX;
      const ccy = vertical ? sy0 : homeY + cardH + cs * 0.75;
      ctx.save();
      ctx.globalAlpha = panelOp * cIn;
      ctx.textAlign = vertical ? 'center' : 'left';
      ctx.textBaseline = 'alphabetic';
      const big = cs * 1.15;
      ctx.font = INTER(800, big);
      ctx.letterSpacing = `${-big * 0.04}px`;
      ctx.fillStyle = p.ink;
      const yNum = ccy + big * 0.86 + (1 - cIn) * cs * 0.3;
      ctx.fillText(String(n), ccx, yNum);
      ctx.letterSpacing = '0px';
      ctx.font = INTER(500, cs * 0.24);
      ctx.fillStyle = rgba(p.ink, 0.55);
      const word = span === 1 ? 'day' : 'days';
      const rel = ev >= today ? `${word} until ${p.eventTitle ? p.eventTitle.toLowerCase() : 'the event'}` : `${word} since ${p.eventTitle ? p.eventTitle.toLowerCase() : 'the event'}`;
      ctx.fillText(ellipsize(ctx, rel, vertical ? pw - cardW - cs * 0.2 : sideWU * cs), ccx, yNum + cs * 0.42);
      ctx.restore();
    }

    // ---------- cursor ----------
    const curIn = ease.inOutCubic(seg(t, T_CUR0, T_PRESS));
    const curOut = ease.inOutCubic(seg(t, T_MORPH - 0.1, T_MORPH + 0.7));
    if (curIn > 0 && curOut < 1) {
      const grabX = hx + cardW * 0.18;
      const grabY = hy2 + cardH * 0.1;
      const offX = (grabX - hx) * (1 - morph);
      const offY = (grabY - hy2) * (1 - morph);
      let cx, cy;
      const startX = w + cs;
      const startY = h * 0.85;
      if (t < T_PRESS) {
        const u = curIn;
        cx = lerp(startX, grabX, u) + Math.sin(u * Math.PI) * cs * 0.4;
        cy = lerp(startY, grabY, u) - Math.sin(u * Math.PI) * cs * 0.6;
      } else if (curOut <= 0) {
        cx = bx + offX;
        cy = by + offY;
      } else {
        cx = lerp(bx + offX, w * 0.95, curOut);
        cy = lerp(by + offY, h + cs, curOut);
      }
      const s = cs * 0.42 * (1 - 0.1 * press);
      // anel do clique
      const rp = seg(t, T_PRESS, T_PRESS + 0.5);
      if (rp > 0 && rp < 1) {
        ctx.strokeStyle = rgba(p.ink, 0.5 * (1 - rp));
        ctx.lineWidth = Math.max(1, cs * 0.02);
        ctx.beginPath();
        ctx.arc(cx, cy, cs * 0.08 + cs * 0.3 * ease.outCubic(rp), 0, TAU);
        ctx.stroke();
      }
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-0.05);
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#111114';
      ctx.lineWidth = Math.max(1, s * 0.07);
      ctx.lineJoin = 'round';
      cursorPath(ctx, s);
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = s * 0.25 * px;
      ctx.shadowOffsetY = s * 0.08 * px;
      ctx.fill();
      ctx.restore();
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  },
};

// mistura de duas cores hex → hex (para usar como fillStyle e de novo em rgba se precisar)
function mixToHex(a, b, k) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (sh) => Math.round(lerp((pa >> sh) & 255, (pb >> sh) & 255, k));
  return `#${[16, 8, 0].map((sh) => ch(sh).toString(16).padStart(2, '0')).join('')}`;
}
