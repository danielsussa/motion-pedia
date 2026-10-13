import { TAU, clamp, lerp, seg, ease, springWin, rgba, mixHex } from '../lib/anim.js';

const F = 'Inter, system-ui, sans-serif';

// "nome: texto" por linha → [{ who, text, me }]
function parse(src, meName) {
  const me = meName.trim().toLowerCase();
  const out = [];
  for (const raw of String(src).split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const i = line.indexOf(':');
    let who = i > 0 && i < 24 ? line.slice(0, i).trim() : out.length ? out[out.length - 1].who : 'ana';
    const text = i > 0 && i < 24 ? line.slice(i + 1).trim() : line;
    if (!text) continue;
    out.push({ who, text, me: who.toLowerCase() === me });
  }
  return out;
}

// Quebra texto em linhas que caibam em maxW (ctx.font já definido).
function wrap(ctx, text, maxW) {
  const words = text.split(/\s+/);
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
  return lines;
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export default {
  id: 'chat',
  title: 'Chat Bubbles',
  description: 'A messenger conversation that builds itself: "typing…" indicators, bubbles that pop in and your own messages typed into the text field.',
  category: 'dados',
  tags: ['ui', 'data', 'typography'],
  duration: 12,
  poster: 7.5,

  params: {
    script: {
      type: 'textarea',
      label: 'Conversation (name: message)',
      rows: 6,
      default:
        'ana: hey! saw the new video?\nme: just did, it looks amazing 🔥\nana: took 3 days to animate it all\nme: worth every frame\nana: wanna make the next one together?\nme: let\'s go!',
    },
    me: { type: 'text', label: 'Me (your name)', default: 'me' },
    accent: { type: 'color', label: 'My bubbles', default: '#2f6bff' },
    panel: { type: 'color', label: 'Panel', default: '#f3f3f6' },
    bg: { type: 'color', label: 'Background', default: '#14161b' },
    speed: { type: 'range', label: 'Rhythm', min: 0.6, max: 1.6, step: 0.05, default: 1 },
    transparent: { type: 'boolean', label: 'Transparent background', default: false },
  },

  setup({ p, duration }) {
    const msgs = parse(p.script, p.me);
    // Agenda: para cada mensagem, uma fase de "preparo" (digitando… ou digitação no campo) e a aparição.
    let t = 0;
    const plan = msgs.map((m, i) => {
      const prep = m.me ? clamp(0.35 + m.text.length * 0.035, 0.6, 1.8) : clamp(0.6 + m.text.length * 0.018, 0.8, 1.6);
      const gapBefore = i === 0 ? 0 : msgs[i - 1].me === m.me ? 0.25 : 0.45;
      t += gapBefore;
      const a = t;
      t += prep;
      const show = t;
      t += 0.35;
      return { ...m, prepStart: a, show };
    });
    // Encaixa a sequência entre 0.9 s e (duração − 1.7 s), respeitando o ritmo.
    const avail = duration - 2.6;
    const k = Math.min(1 / p.speed, avail / Math.max(t, 0.01));
    for (const m of plan) {
      m.prepStart = 0.9 + m.prepStart * k;
      m.show = 0.9 + m.show * k;
    }
    const others = [...new Set(msgs.filter((m) => !m.me).map((m) => m.who))];
    return { plan, others, group: others.length > 1 };
  },

  render(ctx, t, { w, h, p, duration, state, px }) {
    if (!p.transparent) {
      const g = ctx.createLinearGradient(0, 0, w * 0.4, h);
      g.addColorStop(0, mixHex(p.bg, '#ffffff', 0.07));
      g.addColorStop(1, mixHex(p.bg, '#000000', 0.4));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    const { plan, others, group } = state;

    // Painel estilo celular
    const PW = Math.min(w * 0.9, h * 0.56);
    const PH = Math.min(h * 0.9, PW * 1.75);
    const u = PW / 600; // unidade: painel de referência com 600 de largura
    const px0 = (w - PW) / 2;
    const py0 = (h - PH) / 2;
    const R = 46 * u;

    // Entra subindo com mola e sai descendo (sem alpha: painel e camadas internas ficariam com opacidades diferentes).
    const inK = springWin(t, 0.0, 1.1, 0.1);
    const outK = ease.inCubic(seg(t, duration - 0.75, duration - 0.05));
    const alpha = 1;
    const off = (1 - inK) * (h - py0 + 80 * u) + outK * (h - py0 + 120 * u);
    if (off >= h - py0 + 60 * u) return;

    ctx.save();
    ctx.translate(w / 2, h / 2 + off);
    const sc = lerp(0.9, 1, clamp(inK)) * (1 - 0.06 * outK);
    ctx.rotate((1 - clamp(inK)) * 0.06 - outK * 0.05);
    ctx.scale(sc, sc);
    ctx.translate(-w / 2, -h / 2);

    // sombra + painel
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 70 * u * px;
    ctx.shadowOffsetY = 24 * u * px;
    ctx.fillStyle = p.panel;
    ctx.beginPath();
    ctx.roundRect(px0, py0, PW, PH, R);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(px0, py0, PW, PH, R);
    ctx.clip();

    const INK = '#111216';
    const MUTED = '#8a8c94';
    const bubbleOther = '#ffffff';

    // ---- estado instantâneo ----
    let typingWho = null; // alguém digitando (dots)
    let typingK = 0;
    let draft = ''; // texto no meu campo
    let draftK = 0;
    for (const m of plan) {
      if (t >= m.prepStart && t < m.show + 0.05) {
        if (m.me) {
          const k = seg(t, m.prepStart, m.show - 0.15);
          draft = m.text.slice(0, Math.round(m.text.length * k));
          draftK = 1;
        } else {
          typingWho = m.who;
          typingK = Math.min(seg(t, m.prepStart, m.prepStart + 0.2), 1 - seg(t, m.show - 0.05, m.show + 0.05));
        }
      }
    }

    // ---- header ----
    const HH = 128 * u;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(px0, py0, PW, HH);
    ctx.fillStyle = 'rgba(0,0,0,0.07)';
    ctx.fillRect(px0, py0 + HH - 1.5 * u, PW, 1.5 * u);
    const title = group ? others.map(cap).join(', ') : cap(others[0] || 'Chat');
    const avR = 30 * u;
    const avX = px0 + 44 * u + avR;
    const hy = py0 + HH / 2 + 4 * u;
    // seta voltar
    ctx.strokeStyle = p.accent;
    ctx.lineWidth = 4 * u;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(px0 + 34 * u, hy - 12 * u);
    ctx.lineTo(px0 + 22 * u, hy);
    ctx.lineTo(px0 + 34 * u, hy + 12 * u);
    ctx.stroke();
    const avatar = (x, y, r, name) => {
      const hue = [...name].reduce((a, c) => a + c.charCodeAt(0) * 37, 0) % 360;
      const g = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
      g.addColorStop(0, `hsl(${hue} 70% 62%)`);
      g.addColorStop(1, `hsl(${(hue + 40) % 360} 65% 48%)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = `700 ${r * 0.95}px ${F}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(cap(name).charAt(0), x, y + r * 0.05);
    };
    avatar(avX, hy, avR, others[0] || '?');
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = INK;
    ctx.font = `700 ${30 * u}px ${F}`;
    let tt = title;
    while (ctx.measureText(tt).width > PW * 0.62 && tt.length > 4) tt = tt.slice(0, -2);
    if (tt !== title) tt += '…';
    ctx.fillText(tt, avX + avR + 18 * u, hy - 4 * u);
    // status: online ↔ digitando…
    ctx.font = `500 ${21 * u}px ${F}`;
    const sy = hy + 24 * u;
    const sx = avX + avR + 18 * u;
    if (typingK > 0.01) {
      ctx.globalAlpha = alpha * clamp(typingK * 2 - 1);
      ctx.fillStyle = p.accent;
      const n = Math.floor(t * 3) % 4;
      ctx.fillText(`${group ? cap(typingWho) + ' is ' : ''}typing${'.'.repeat(n)}`, sx, sy);
    }
    if (typingK < 0.99) {
      ctx.globalAlpha = alpha * clamp(1 - typingK * 2);
      ctx.fillStyle = MUTED;
      ctx.fillText(group ? `${others.length + 1} participants` : 'online', sx, sy);
    }
    ctx.globalAlpha = alpha;

    // ---- campo de texto ----
    const IH = 112 * u;
    const iy = py0 + PH - IH;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(px0, iy, PW, IH);
    ctx.fillStyle = 'rgba(0,0,0,0.07)';
    ctx.fillRect(px0, iy, PW, 1.5 * u);
    const fx = px0 + 28 * u, fh = 62 * u, fy = iy + 22 * u, fw = PW - 56 * u - 78 * u;
    ctx.fillStyle = '#f1f1f4';
    ctx.beginPath();
    ctx.roundRect(fx, fy, fw, fh, fh / 2);
    ctx.fill();
    ctx.font = `500 ${24 * u}px ${F}`;
    ctx.textBaseline = 'middle';
    ctx.save();
    ctx.beginPath();
    ctx.rect(fx + 18 * u, fy, fw - 36 * u, fh);
    ctx.clip();
    if (draft) {
      ctx.fillStyle = INK;
      const tw = ctx.measureText(draft).width;
      const off = Math.max(0, tw - (fw - 52 * u));
      ctx.fillText(draft, fx + 24 * u - off, fy + fh / 2 + 1 * u);
      if (Math.floor(t * 2.5) % 2 === 0 || draftK) {
        ctx.fillStyle = p.accent;
        ctx.fillRect(fx + 26 * u + tw - off, fy + fh * 0.27, 2.5 * u, fh * 0.46);
      }
    } else {
      ctx.fillStyle = '#a3a5ad';
      ctx.fillText('Message', fx + 24 * u, fy + fh / 2 + 1 * u);
    }
    ctx.restore();
    // botão enviar
    const bx = fx + fw + 16 * u + 31 * u, by = fy + fh / 2;
    let sendPulse = 0;
    for (const m of plan) if (m.me) sendPulse = Math.max(sendPulse, Math.sin(Math.PI * seg(t, m.show - 0.12, m.show + 0.12)));
    const sendOn = draft ? 1 : 0.35;
    ctx.save();
    ctx.translate(bx, by);
    ctx.scale(1 - 0.15 * sendPulse, 1 - 0.15 * sendPulse);
    ctx.fillStyle = draft ? p.accent : mixHex(p.accent, '#ffffff', 0.55);
    ctx.globalAlpha = alpha * (0.6 + 0.4 * sendOn);
    ctx.beginPath();
    ctx.arc(0, 0, 31 * u, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 4.5 * u;
    ctx.beginPath();
    ctx.moveTo(0, 12 * u);
    ctx.lineTo(0, -11 * u);
    ctx.moveTo(-10 * u, -2 * u);
    ctx.lineTo(0, -12 * u);
    ctx.lineTo(10 * u, -2 * u);
    ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = alpha;

    // ---- mensagens (empilhadas de baixo para cima) ----
    const fs = 26 * u;
    const lh = fs * 1.34;
    const padX = 22 * u, padY = 15 * u;
    const maxW = PW * 0.66;
    const side = 26 * u;
    ctx.font = `500 ${fs}px ${F}`;
    const items = [];
    for (let i = 0; i < plan.length; i++) {
      const m = plan[i];
      const k = seg(t, m.show, m.show + 0.45);
      if (t < m.show) continue;
      const lines = wrap(ctx, m.text, maxW - padX * 2);
      const bw = Math.max(...lines.map((l) => ctx.measureText(l).width)) + padX * 2;
      const showName = group && !m.me && (i === 0 || plan[i - 1].who !== m.who);
      const bh = lines.length * lh + padY * 2;
      const sameNext = plan[i + 1] && plan[i + 1].who === m.who && t >= plan[i + 1].show;
      items.push({ m, lines, bw, bh, k, showName, tail: !sameNext, gap: (plan[i + 1]?.who === m.who ? 8 : 18) * u });
    }
    // indicador de digitando (balão com três pontos)
    const dotsH = 56 * u;
    if (typingK > 0) items.push({ dots: true, k: typingK, bw: 96 * u, bh: dotsH, gap: 18 * u });

    const area = { top: py0 + HH, bottom: iy - 22 * u };
    ctx.save();
    ctx.beginPath();
    ctx.rect(px0, area.top, PW, area.bottom - area.top);
    ctx.clip();
    let y = area.bottom;
    for (let j = items.length - 1; j >= 0; j--) {
      const it = items[j];
      const grow = it.dots ? ease.outCubic(it.k) : ease.outExpo(clamp(it.k * 1.4));
      const fullH = it.bh + (it.showName ? 30 * u : 0);
      const hh = fullH * grow;
      const gp = j === items.length - 1 ? 0 : it.gap;
      y -= gp * grow;
      const top = y - fullH; // posição final do topo
      y -= hh;
      if (y + hh < area.top - 50 * u) break;
      const me = it.m?.me;
      const x = me ? px0 + PW - side - it.bw : px0 + side;
      const pop = it.dots ? ease.outBack(clamp(it.k)) : springWin(it.k * 0.45, 0, 0.45, 0.22);
      const ox = me ? x + it.bw : x; // origem da escala no canto do rabinho
      const oy = top + fullH;
      ctx.save();
      ctx.translate(ox, oy + (fullH - hh) * 0);
      ctx.translate(0, -(fullH - hh) * 0);
      ctx.scale(pop, pop);
      ctx.translate(-ox, -oy);
      ctx.globalAlpha = alpha * clamp(it.k * 3);
      const by0 = top + (it.showName ? 30 * u : 0) + (fullH - hh) * 0;
      // posição: ancorada ao fundo do slot atual
      const dy = y + hh - (top + fullH);
      ctx.translate(0, dy);
      if (it.showName) {
        ctx.fillStyle = MUTED;
        ctx.font = `600 ${19 * u}px ${F}`;
        ctx.textBaseline = 'alphabetic';
        ctx.textAlign = 'left';
        ctx.fillText(cap(it.m.who), x + 14 * u, top + 22 * u);
      }
      const r = 28 * u;
      ctx.fillStyle = me ? p.accent : bubbleOther;
      if (!me) {
        ctx.shadowColor = 'rgba(0,0,0,0.06)';
        ctx.shadowBlur = 8 * u * px;
        ctx.shadowOffsetY = 2 * u * px;
      }
      ctx.beginPath();
      const tail = it.dots || it.tail;
      const radii = me ? [r, r, tail ? 6 * u : r, r] : [r, r, r, tail ? 6 * u : r];
      ctx.roundRect(x, by0, it.bw, it.bh, radii);
      ctx.fill();
      ctx.shadowColor = 'transparent';
      if (it.dots) {
        for (let d = 0; d < 3; d++) {
          const ph = (t * 1.6 - d * 0.18) % 1;
          const b = Math.max(0, Math.sin(ph * TAU));
          ctx.fillStyle = rgba('#8a8c94', 0.45 + 0.5 * b);
          ctx.beginPath();
          ctx.arc(x + it.bw / 2 + (d - 1) * 22 * u, by0 + it.bh / 2 - b * 6 * u, 7 * u, 0, TAU);
          ctx.fill();
        }
      } else {
        ctx.fillStyle = me ? '#ffffff' : INK;
        ctx.font = `500 ${fs}px ${F}`;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        it.lines.forEach((l, li) => ctx.fillText(l, x + padX, by0 + padY + lh * (li + 0.5) + 1 * u));
      }
      ctx.restore();
    }
    ctx.restore();

    ctx.restore(); // clip painel
    ctx.restore();
  },
};
