import { TAU, clamp, lerp, seg, ease, springWin, rgba, mixHex } from '../lib/anim.js';

// Ícones Material (caixa 24×24) como Path2D.
const ICON = {
  bell: 'M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z',
  bellOutline:
    'M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z',
  thumb:
    'M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z',
  thumbOutline:
    'M9 21h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.58 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2zM9 9l4.34-4.34L12 10h9v2l-3 7H9V9zM1 9h4v12H1z',
};
let paths = null;
const icon = (k) => {
  if (!paths) paths = Object.fromEntries(Object.entries(ICON).map(([n, d]) => [n, new Path2D(d)]));
  return paths[k];
};
const CURSOR = 'M6 3 L6 25 L12 19.5 L16 29 L20 27.3 L16.2 18 L24 18 Z';
let cursorPath = null;

function pill(ctx, x, y, w, h, r = h / 2) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

// Pulso 0..1..0 em torno do instante do clique.
const press = (t, tc) => Math.sin(Math.PI * seg(t, tc - 0.07, tc + 0.13));

export default {
  id: 'subscribe',
  title: 'Subscribe CTA',
  description: 'Card de canal com cursor que clica em "Inscrever-se", ativa o sino e dá like, com ripple e micro-animações.',
  category: 'dados',
  tags: ['ui', 'overlay', 'alpha', 'broadcast'],
  duration: 6,
  poster: 4.4,

  params: {
    channel: { type: 'text', label: 'Canal', default: 'motion·pedia' },
    subs: { type: 'text', label: 'Inscritos', default: '128 mil inscritos' },
    label: { type: 'text', label: 'Botão', default: 'Inscrever-se' },
    doneLabel: { type: 'text', label: 'Botão (depois)', default: 'Inscrito' },
    accent: { type: 'color', label: 'Destaque', default: '#ff2e3a' },
    bg: { type: 'color', label: 'Fundo', default: '#1b1e24' },
    position: { type: 'select', label: 'Posição', options: ['centro', 'baixo'], default: 'centro' },
    transparent: { type: 'boolean', label: 'Fundo transparente', default: false },
    scale: { type: 'range', label: 'Escala', min: 0.5, max: 1.6, step: 0.01, default: 1 },
  },

  render(ctx, t, { w, h, p, px }) {
    if (!p.transparent) {
      const g = ctx.createRadialGradient(w * 0.5, h * 0.4, 0, w * 0.5, h * 0.5, Math.hypot(w, h) * 0.6);
      g.addColorStop(0, mixHex(p.bg, '#ffffff', 0.06));
      g.addColorStop(1, mixHex(p.bg, '#000000', 0.45));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    const INK = '#0f0f12';
    const GRAY = '#f0f0f2';
    const MUTED = '#6b6d75';
    const F = 'Inter, system-ui, sans-serif';

    // ---- layout em unidades locais (1 u ≈ 1px numa tela 1080 de lado menor) ----
    const pad = 26, CH = 124, AV = 76, BH = 62, BD = 62, gap = 14;
    ctx.font = `700 30px ${F}`;
    const nameW = ctx.measureText(p.channel).width;
    ctx.font = `500 21px ${F}`;
    const subsW = ctx.measureText(p.subs).width;
    const textW = Math.max(nameW, subsW);
    ctx.font = `700 24px ${F}`;
    const labW = ctx.measureText(p.label).width;
    const doneW = ctx.measureText(p.doneLabel).width;
    const b0 = labW + 64;
    const b1 = doneW + 64 + 34;

    // Estados
    const T_SUB = 1.85, T_BELL = 2.85, T_LIKE = 3.75;
    const subOn = springWin(t, T_SUB, T_SUB + 0.7, 0.18);
    const btnW = lerp(b0, b1, subOn);
    const bMax = Math.max(b0, b1);
    const W = pad + AV + 20 + textW + 40 + bMax + gap + BD + gap + BD + pad;

    const m = Math.min(w, h);
    let s = (m / 1080) * p.scale * 1.55;
    s = Math.min(s, (w * 0.92) / W);
    const cx = w / 2;
    const cy = p.position === 'baixo' ? h - Math.max(m * 0.16, (CH / 2) * s + m * 0.08) : h / 2;

    // Entrada / saída do card
    const cardIn = springWin(t, 0.1, 1.0, 0.12);
    const fadeIn = ease.outCubic(seg(t, 0.1, 0.45));
    const out = ease.inBack(seg(t, 5.15, 5.7));
    const fadeOut = 1 - seg(t, 5.3, 5.7);
    const cardA = fadeIn * fadeOut;
    if (cardA <= 0.001) return;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(s, s);
    const left = -W / 2;

    // posições dos elementos
    const avX = left + pad + AV / 2;
    const txX = left + pad + AV + 20;
    const btnX = txX + textW + 40; // borda esquerda do botão
    const bellX = btnX + bMax + gap + BD / 2;
    const likeX = bellX + BD + gap;
    const btnC = btnX + btnW / 2;

    // ---- card ----
    ctx.save();
    const cs = lerp(0.82, 1, cardIn) * (1 - 0.12 * out);
    ctx.scale(cs, cs);
    ctx.globalAlpha = cardA;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 50 * s * px;
    ctx.shadowOffsetY = 16 * s * px;
    ctx.fillStyle = '#ffffff';
    pill(ctx, left, -CH / 2, W, CH, 34);
    ctx.fill();
    ctx.restore();

    const pop = (a) => springWin(t, a, a + 0.8, 0.25);
    const fade = (a) => ease.outCubic(seg(t, a, a + 0.3));

    // avatar
    {
      const k = pop(0.3);
      ctx.save();
      ctx.translate(avX, 0);
      ctx.scale(k, k);
      const g = ctx.createLinearGradient(-AV / 2, -AV / 2, AV / 2, AV / 2);
      g.addColorStop(0, p.accent);
      g.addColorStop(1, mixHex(p.accent, '#000000', 0.35));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, AV / 2, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = `800 34px ${F}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText((p.channel.trim()[0] || '•').toUpperCase(), 0, 2);
      ctx.restore();
    }

    // nome + inscritos
    {
      const a = fade(0.42);
      ctx.save();
      ctx.globalAlpha *= a;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = INK;
      ctx.font = `700 30px ${F}`;
      ctx.fillText(p.channel, txX + (1 - a) * 20, -4);
      ctx.fillStyle = MUTED;
      ctx.font = `500 21px ${F}`;
      ctx.fillText(p.subs, txX + (1 - fade(0.5)) * 20, 28);
      ctx.restore();
    }

    // botão inscrever-se
    {
      const k = pop(0.5) * (1 - 0.07 * press(t, T_SUB));
      const fill = mixHex(p.accent, GRAY, clamp(subOn));
      ctx.save();
      ctx.translate(btnC, 0);
      ctx.scale(k, k);
      ctx.fillStyle = fill;
      pill(ctx, -btnW / 2, -BH / 2, btnW, BH);
      ctx.fill();
      // ripple de tinta
      const rk = seg(t, T_SUB, T_SUB + 0.6);
      if (rk > 0 && rk < 1) {
        ctx.save();
        pill(ctx, -btnW / 2, -BH / 2, btnW, BH);
        ctx.clip();
        ctx.fillStyle = `rgba(255,255,255,${0.45 * (1 - rk)})`;
        ctx.beginPath();
        ctx.arc(0, 0, ease.outCubic(rk) * btnW * 0.7, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
      ctx.font = `700 24px ${F}`;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      const sw = ease.inOutCubic(seg(t, T_SUB, T_SUB + 0.35));
      if (sw < 1) {
        ctx.globalAlpha *= 1 - sw;
        ctx.fillStyle = '#ffffff';
        ctx.fillText(p.label, 0, 1 - sw * 18);
        ctx.globalAlpha /= 1 - sw || 1;
      }
      if (sw > 0) {
        const a0 = ctx.globalAlpha;
        ctx.globalAlpha = a0 * sw;
        ctx.fillStyle = INK;
        const tx = 17;
        ctx.fillText(p.doneLabel, tx, 1 + (1 - sw) * 18);
        // check desenhado
        const ck = ease.outCubic(seg(t, T_SUB + 0.15, T_SUB + 0.55));
        const x0 = tx - doneW / 2 - 34;
        ctx.strokeStyle = INK;
        ctx.lineWidth = 3.6;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        const P = [[x0, 1], [x0 + 7, 8], [x0 + 21, -7]];
        const L1 = Math.hypot(7, 7), L2 = Math.hypot(14, 15), tot = L1 + L2;
        const d = ck * tot;
        ctx.moveTo(...P[0]);
        if (d <= L1) ctx.lineTo(lerp(P[0][0], P[1][0], d / L1), lerp(P[0][1], P[1][1], d / L1));
        else {
          ctx.lineTo(...P[1]);
          const q = (d - L1) / L2;
          ctx.lineTo(lerp(P[1][0], P[2][0], q), lerp(P[1][1], P[2][1], q));
        }
        if (ck > 0) ctx.stroke();
        ctx.globalAlpha = a0;
      }
      ctx.restore();
    }

    // sino
    {
      const k = pop(0.58) * (1 - 0.1 * press(t, T_BELL));
      const on = t >= T_BELL;
      ctx.save();
      ctx.translate(bellX, 0);
      ctx.scale(k, k);
      ctx.fillStyle = on ? mixHex(GRAY, p.accent, 0.12 * (1 - seg(t, T_BELL, T_BELL + 1.2)) ) : GRAY;
      ctx.beginPath();
      ctx.arc(0, 0, BD / 2, 0, TAU);
      ctx.fill();
      const rk = seg(t, T_BELL, T_BELL + 1.1);
      const ang = rk > 0 && rk < 1 ? 0.55 * Math.sin(rk * TAU * 4) * (1 - rk) ** 1.5 : 0;
      // ondas laterais
      if (rk > 0 && rk < 1) {
        ctx.save();
        ctx.strokeStyle = rgba(p.accent, Math.sin(Math.PI * rk));
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        for (const sd of [-1, 1])
          for (let j = 0; j < 2; j++) {
            const r = 20 + j * 7 + rk * 6;
            ctx.beginPath();
            ctx.arc(0, -2, r, sd > 0 ? -0.5 : Math.PI - 0.5, sd > 0 ? 0.5 : Math.PI + 0.5);
            ctx.stroke();
          }
        ctx.restore();
      }
      ctx.translate(0, -11);
      ctx.rotate(ang);
      ctx.translate(0, 11);
      const is = 30 / 24;
      ctx.scale(is, is);
      ctx.translate(-12, -12);
      ctx.fillStyle = on ? INK : INK;
      ctx.fill(icon(on ? 'bell' : 'bellOutline'));
      ctx.restore();
    }

    // like
    {
      const k = pop(0.66) * (1 - 0.12 * press(t, T_LIKE)) * (1 + 0.18 * Math.sin(Math.PI * seg(t, T_LIKE, T_LIKE + 0.35)));
      const on = t >= T_LIKE;
      ctx.save();
      ctx.translate(likeX, 0);
      ctx.fillStyle = GRAY;
      ctx.save();
      ctx.scale(pop(0.66), pop(0.66));
      ctx.beginPath();
      ctx.arc(0, 0, BD / 2, 0, TAU);
      ctx.fill();
      ctx.restore();
      // estouro de faíscas
      const bk = seg(t, T_LIKE, T_LIKE + 0.55);
      if (bk > 0 && bk < 1) {
        ctx.save();
        ctx.strokeStyle = p.accent;
        ctx.lineWidth = 3.5;
        ctx.lineCap = 'round';
        const e = ease.outCubic(bk);
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * TAU + 0.2;
          const r0 = 36 + e * 16;
          const r1 = r0 + 12 * (1 - bk);
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
          ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
          ctx.stroke();
        }
        ctx.restore();
      }
      ctx.scale(k, k);
      ctx.rotate(-0.35 * Math.sin(Math.PI * seg(t, T_LIKE, T_LIKE + 0.45)));
      const is = 28 / 24;
      ctx.scale(is, is);
      ctx.translate(-12, -12.5);
      ctx.fillStyle = on ? p.accent : INK;
      ctx.fill(icon(on ? 'thumb' : 'thumbOutline'));
      ctx.restore();
    }
    ctx.restore(); // card
    ctx.restore(); // espaço local

    // ---- cursor ----
    const sx = (w - cx) / s + 60, sy = (h - cy) / s + 60; // canto inferior direito, fora da tela
    const start = { x: Math.min(sx, likeX + 380), y: Math.min(sy, 330) };
    const tgt = (x, y) => ({ x, y });
    const P0 = start;
    const P1 = tgt(btnC + 10, 10);
    const P2 = tgt(bellX + 4, 8);
    const P3 = tgt(likeX + 4, 8);
    const legs = [
      [0.75, 1.7, P0, P1, -60],
      [2.15, 2.75, P1, P2, -26],
      [3.1, 3.65, P2, P3, -26],
      [4.25, 5.0, P3, P0, 40],
    ];
    let pos = P0;
    for (const [a, b, A, B, arc] of legs) {
      if (t >= a) {
        const k = ease.inOutCubic(seg(t, a, b));
        pos = { x: lerp(A.x, B.x, k), y: lerp(A.y, B.y, k) + Math.sin(Math.PI * k) * arc };
      }
    }
    const cVis = seg(t, 0.7, 0.9) * (1 - seg(t, 4.8, 5.0));
    if (cVis > 0) {
      // anel de clique
      for (const tc of [T_SUB, T_BELL, T_LIKE]) {
        const rk = seg(t, tc, tc + 0.5);
        if (rk <= 0 || rk >= 1) continue;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(s, s);
        ctx.strokeStyle = rgba(p.accent, 0.75 * (1 - rk));
        ctx.lineWidth = 5 * (1 - rk) + 1;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 10 + ease.outCubic(rk) * 46, 0, TAU);
        ctx.stroke();
        ctx.restore();
      }
      if (!cursorPath) cursorPath = new Path2D(CURSOR);
      const pr = Math.max(press(t, T_SUB), press(t, T_BELL), press(t, T_LIKE));
      ctx.save();
      ctx.translate(cx + pos.x * s, cy + pos.y * s);
      const k = s * 1.9 * (1 - 0.18 * pr);
      ctx.scale(k, k);
      ctx.globalAlpha = cVis;
      ctx.translate(-6, -3);
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = 10 * k * px;
      ctx.shadowOffsetY = 3 * k * px;
      ctx.fillStyle = '#111114';
      ctx.fill(cursorPath);
      ctx.shadowColor = 'transparent';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.stroke(cursorPath);
      ctx.restore();
    }
  },
};
