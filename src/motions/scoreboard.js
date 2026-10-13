import { clamp, seg, ease, spring, rgba } from '../lib/anim.js';

// Placar de transmissão esportiva ("score bug"): entra em wipe, o relógio corre, sai um gol —
// o número do time vira, a célula pisca na cor do time e uma tarja "GOL" desce com o autor.
// Com fundo transparente vira overlay pronto para jogar sobre o vídeo.

const INTER = (wt, s) => `${wt} ${s}px Inter, system-ui, sans-serif`;
const MONO = (wt, s) => `${wt} ${s}px 'JetBrains Mono', ui-monospace, monospace`;

const T_GOAL = 2.5; // o placar vira
const T_BAN = 2.75; // tarja do gol desce
const T_BAN_OUT = 5.1;

function parseClock(s) {
  const m = String(s || '').match(/(\d+)\s*[:']\s*(\d+)/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
}
const two = (n) => String(n).padStart(2, '0');

export default {
  id: 'scoreboard',
  title: 'Scoreboard',
  description: 'A broadcast sports scoreboard: the clock runs, a goal goes in, the score flips and a scorer banner drops down.',
  category: 'dados',
  tags: ['broadcast', 'ui', 'overlay', 'alpha'],
  duration: 7,
  poster: 3.6,

  params: {
    teamA: { type: 'text', label: 'Home team', default: 'FLA' },
    teamB: { type: 'text', label: 'Away team', default: 'PAL' },
    colorA: { type: 'color', label: 'Home color', default: '#d7263d' },
    colorB: { type: 'color', label: 'Away color', default: '#1b9e5a' },
    scoreA: { type: 'range', label: 'Home goals', min: 0, max: 9, step: 1, default: 1 },
    scoreB: { type: 'range', label: 'Away goals', min: 0, max: 9, step: 1, default: 1 },
    goal: { type: 'select', label: 'Goal by', options: ['casa', 'visitante', 'ninguém'], default: 'casa' },
    scorer: { type: 'text', label: 'Goal scorer', default: 'Pedro' },
    clock: { type: 'text', label: 'Start clock', default: '67:48' },
    period: { type: 'text', label: 'Period', default: '2H' },
    league: { type: 'text', label: 'Competition', default: 'BRASILEIRÃO · MATCHDAY 32' },
    accent: { type: 'color', label: 'Accent', default: '#f4c430' },
    scale: { type: 'range', label: 'Scale', min: 0.5, max: 1.8, step: 0.01, default: 1 },
    transparent: { type: 'boolean', label: 'Transparent background', default: false },
  },

  // Fundo de prévia: gramado com faixas de corte, linhas do campo e vinheta, pintado uma vez.
  setup({ w, h, p, px }) {
    if (p.transparent) return {};
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * px));
    c.height = Math.max(1, Math.round(h * px));
    const g = c.getContext('2d');
    g.scale(px, px);
    g.fillStyle = '#183a24';
    g.fillRect(0, 0, w, h);
    const m = Math.min(w, h);
    // faixas em perspectiva leve (mais largas embaixo)
    const n = 14;
    g.fillStyle = '#1c4229';
    for (let i = 0; i < n; i += 2) {
      const a = (i / n) * w * 1.6 - w * 0.3;
      const b = ((i + 1) / n) * w * 1.6 - w * 0.3;
      g.beginPath();
      g.moveTo(w / 2 + (a - w / 2) * 0.62, 0);
      g.lineTo(w / 2 + (b - w / 2) * 0.62, 0);
      g.lineTo(b, h);
      g.lineTo(a, h);
      g.fill();
    }
    // linhas do campo: meio-campo e círculo central em perspectiva
    g.strokeStyle = 'rgba(255,255,255,0.42)';
    g.lineWidth = m * 0.005;
    g.beginPath();
    g.moveTo(w * 0.5 - w * 0.01, h * 0.08);
    g.lineTo(w * 0.5 + w * 0.01, h * 1.02);
    g.stroke();
    g.beginPath();
    g.ellipse(w * 0.505, h * 0.66, m * 0.32, m * 0.14, 0, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.moveTo(-w * 0.1, h * 0.2);
    g.lineTo(w * 1.1, h * 0.17);
    g.stroke();
    // luz de refletor em cima e vinheta (cor única, só alpha)
    const lg = g.createRadialGradient(w * 0.5, -h * 0.2, 0, w * 0.5, -h * 0.2, Math.max(w, h) * 0.9);
    lg.addColorStop(0, 'rgba(255,255,255,0.10)');
    lg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = lg;
    g.fillRect(0, 0, w, h);
    const vg = g.createRadialGradient(w / 2, h * 0.55, m * 0.2, w / 2, h * 0.55, Math.hypot(w, h) * 0.62);
    vg.addColorStop(0, 'rgba(0,0,0,0.15)');
    vg.addColorStop(1, 'rgba(0,0,0,0.7)');
    g.fillStyle = vg;
    g.fillRect(0, 0, w, h);
    return { bgc: c };
  },

  render(ctx, t, { w, h, p, px, duration, state }) {
    if (!p.transparent && state.bgc) ctx.drawImage(state.bgc, 0, 0, w, h);

    const m = Math.min(w, h);
    const portrait = h > w * 1.2;
    const H = m * 0.08 * p.scale * (portrait ? 1.1 : 1); // altura do placar
    const PANEL = '#111317';
    const PANEL2 = '#1c1f25';
    const INK = '#f5f3ee';

    const goalSide = p.goal === 'casa' ? 0 : p.goal === 'visitante' ? 1 : -1;
    const s0 = [Math.round(p.scoreA), Math.round(p.scoreB)];
    const s1 = s0.slice();
    if (goalSide >= 0) s1[goalSide] += 1;
    const roll = goalSide >= 0 ? ease.outExpo(seg(t, T_GOAL, T_GOAL + 0.7)) : 0;

    // ---------- medidas ----------
    const fsTeam = H * 0.4;
    const fsScore = H * 0.56;
    const fsClock = H * 0.36;
    ctx.font = INTER(800, fsTeam);
    ctx.letterSpacing = `${fsTeam * 0.06}px`;
    const abbrA = (p.teamA || '').toUpperCase().slice(0, 4);
    const abbrB = (p.teamB || '').toUpperCase().slice(0, 4);
    const tw = Math.max(ctx.measureText(abbrA).width, ctx.measureText(abbrB).width, H * 1.0);
    ctx.letterSpacing = '0px';
    const stripe = H * 0.11;
    const teamW = tw + H * 0.62 + stripe;
    const scoreW = H * 0.92;
    ctx.font = MONO(600, fsClock);
    const clockTxtW = ctx.measureText('00:00').width;
    ctx.font = INTER(800, fsClock);
    const perW = p.period ? ctx.measureText(p.period).width + H * 0.3 : 0;
    const clockW = clockTxtW + perW + H * 0.6;
    const gapC = H * 0.06;
    const mainW = teamW * 2 + scoreW * 2;
    const totalW = mainW + gapC + clockW;

    const x0 = portrait ? (w - totalW) / 2 : Math.max(w * 0.04, m * 0.05);
    const y0 = portrait ? h * 0.07 : Math.max(h * 0.06, m * 0.06);

    // ---------- tempo ----------
    const OUT = duration - 0.95;
    const inE = ease.outExpo(seg(t, 0.1, 1.0));
    const outE = ease.inCubic(seg(t, OUT, OUT + 0.6));
    const right = x0 + totalW * inE; // wipe de entrada
    const left = x0 + totalW * outE; // wipe de saída (recolhe para a direita)
    if (right - left <= 0.5) return;

    ctx.save();
    // sombra do bloco
    ctx.save();
    ctx.beginPath();
    ctx.rect(left, y0 - H, right - left, H * 3.2);
    ctx.clip();
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = H * 0.35 * px;
    ctx.shadowOffsetY = H * 0.08 * px;
    ctx.fillStyle = PANEL;
    ctx.beginPath();
    ctx.roundRect(x0, y0, mainW, H, H * 0.12);
    ctx.roundRect(x0 + mainW + gapC, y0, clockW, H, H * 0.12);
    ctx.fill();
    ctx.restore();

    // ---------- faixa da competição (aba em cima) ----------
    const tabIn = ease.outExpo(seg(t, 0.7, 1.4)) * (1 - ease.inCubic(seg(t, OUT - 0.2, OUT + 0.2)));
    if (p.league && tabIn > 0.001) {
      const fs = H * 0.22;
      ctx.font = INTER(700, fs);
      ctx.letterSpacing = `${fs * 0.14}px`;
      const lw = ctx.measureText(p.league.toUpperCase()).width + fs * 1.6;
      const th = fs * 1.9;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, y0 - th - H * 0.04, Math.max(lw, 1), th + H * 0.04);
      ctx.clip();
      ctx.translate(0, (1 - tabIn) * th * 1.1);
      ctx.fillStyle = p.accent;
      ctx.beginPath();
      ctx.roundRect(x0, y0 - th - H * 0.04, lw, th + H * 0.2, [H * 0.1, H * 0.1, 0, 0]);
      ctx.fill();
      ctx.fillStyle = '#111317';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.league.toUpperCase(), x0 + fs * 0.8, y0 - th / 2 - H * 0.03);
      ctx.restore();
      ctx.letterSpacing = '0px';
    }

    ctx.beginPath();
    ctx.rect(left, y0 - H * 0.02, right - left, H * 1.04);
    ctx.clip();

    // ---------- células ----------
    ctx.fillStyle = PANEL;
    ctx.beginPath();
    ctx.roundRect(x0, y0, mainW, H, H * 0.12);
    ctx.fill();
    ctx.fillStyle = PANEL2;
    ctx.beginPath();
    ctx.roundRect(x0 + mainW + gapC, y0, clockW, H, H * 0.12);
    ctx.fill();
    // células do placar (mais claras) e faixas de cor dos times nas pontas
    const sx = x0 + teamW;
    ctx.fillStyle = INK;
    ctx.fillRect(sx, y0, scoreW * 2, H);
    ctx.fillStyle = rgba('#000000', 0.12);
    ctx.fillRect(sx + scoreW - Math.max(1, H * 0.015), y0 + H * 0.2, Math.max(1, H * 0.03), H * 0.6);
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x0, y0, mainW, H, H * 0.12);
    ctx.clip();
    ctx.fillStyle = p.colorA;
    ctx.fillRect(x0, y0, stripe, H);
    ctx.fillStyle = p.colorB;
    ctx.fillRect(x0 + mainW - stripe, y0, stripe, H);
    ctx.restore();

    // flash na célula do gol
    if (goalSide >= 0) {
      const fl = seg(t, T_GOAL, T_GOAL + 1.6);
      if (fl > 0 && fl < 1) {
        const k = Math.max(0, Math.cos(fl * Math.PI * 3.5)) * (1 - fl);
        ctx.fillStyle = rgba(goalSide ? p.colorB : p.colorA, 0.95 * k + 0.0001);
        ctx.fillRect(sx + goalSide * scoreW, y0, scoreW, H);
      }
    }

    // textos (sobem com stagger)
    const lift = (i) => (1 - ease.outExpo(seg(t, 0.3 + i * 0.08, 1.1 + i * 0.08))) * H * 0.9;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.font = INTER(800, fsTeam);
    ctx.letterSpacing = `${fsTeam * 0.06}px`;
    ctx.fillStyle = INK;
    const cyT = y0 + H / 2 + fsTeam * 0.04;
    ctx.fillText(abbrA, x0 + stripe + (teamW - stripe) / 2 + fsTeam * 0.03, cyT + lift(0));
    ctx.fillText(abbrB, sx + scoreW * 2 + (teamW - stripe) / 2 + fsTeam * 0.03, cyT + lift(3));
    ctx.letterSpacing = '0px';

    // placar com o número virando
    ctx.font = INTER(800, fsScore);
    ctx.save();
    ctx.beginPath();
    ctx.rect(sx, y0, scoreW * 2, H);
    ctx.clip();
    for (let i = 0; i < 2; i++) {
      const cx = sx + scoreW * i + scoreW / 2;
      const cy = y0 + H / 2 + fsScore * 0.04 + lift(1 + i);
      const isGoal = i === goalSide;
      const flashOn = isGoal && t > T_GOAL && t < T_GOAL + 1.6 && Math.cos(seg(t, T_GOAL, T_GOAL + 1.6) * Math.PI * 3.5) > 0.35;
      ctx.fillStyle = flashOn ? '#ffffff' : '#111317';
      if (isGoal && roll > 0) {
        ctx.fillText(String(s0[i]), cx, cy - roll * H);
        ctx.fillText(String(s1[i]), cx, cy + (1 - roll) * H);
      } else ctx.fillText(String(s0[i]), cx, cy);
    }
    ctx.restore();

    // relógio
    const cx0 = x0 + mainW + gapC;
    const sec = parseClock(p.clock) + Math.floor(Math.max(0, t));
    const clockTxt = `${two(Math.floor(sec / 60))}:${two(sec % 60)}`;
    ctx.textAlign = 'left';
    const cyC = y0 + H / 2 + fsClock * 0.05 + lift(4);
    if (p.period) {
      ctx.font = INTER(800, fsClock);
      ctx.fillStyle = p.accent;
      ctx.fillText(p.period, cx0 + H * 0.3, cyC);
    }
    ctx.font = MONO(600, fsClock);
    ctx.fillStyle = INK;
    ctx.fillText(clockTxt, cx0 + H * 0.3 + perW, cyC);

    // brilho varrendo o placar no gol
    if (goalSide >= 0) {
      const sw = seg(t, T_GOAL + 0.05, T_GOAL + 0.75);
      if (sw > 0 && sw < 1) {
        const gx = x0 - H + (totalW + H * 2) * ease.inOutCubic(sw);
        const g = ctx.createLinearGradient(gx - H, 0, gx + H, 0);
        g.addColorStop(0, 'rgba(255,255,255,0)');
        g.addColorStop(0.5, 'rgba(255,255,255,0.28)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x0, y0, totalW, H);
      }
    }
    ctx.restore();

    // ---------- tarja do gol ----------
    if (goalSide < 0) return;
    const bIn = ease.outExpo(seg(t, T_BAN, T_BAN + 0.7));
    const bOut = ease.inCubic(seg(t, T_BAN_OUT, T_BAN_OUT + 0.45));
    const bh = H * 0.92;
    const vis = bIn * (1 - bOut);
    if (vis <= 0.001) return;
    const col = goalSide ? p.colorB : p.colorA;
    const by = y0 + H + H * 0.06;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0 - H, y0 + H, totalW + H * 2, bh + H * 0.6);
    ctx.clip();
    ctx.translate(0, -(1 - vis) * (bh + H * 0.1));
    const minute = Math.floor((parseClock(p.clock) + T_GOAL) / 60) + 1;
    const gs = bh * 0.5;
    ctx.font = INTER(900, gs);
    ctx.letterSpacing = `${gs * 0.08}px`;
    const golW = ctx.measureText('GOAL').width;
    ctx.letterSpacing = '0px';
    const name = `${p.scorer || ''}`.trim();
    const ns = bh * 0.42;
    ctx.font = INTER(700, ns);
    const nameW = ctx.measureText(name).width;
    ctx.font = MONO(600, ns * 0.86);
    const minTxt = `${minute}'`;
    const minW = ctx.measureText(minTxt).width;
    const bw = Math.min(totalW, golW + gs * 1.3 + (name ? nameW + ns * 1.4 : 0) + minW + ns * 1.3);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = H * 0.3 * px;
    ctx.shadowOffsetY = H * 0.06 * px;
    ctx.fillStyle = PANEL;
    ctx.beginPath();
    ctx.roundRect(x0, by, bw, bh, H * 0.1);
    ctx.fill();
    ctx.restore();
    // bloco colorido com "GOL" (entra com mola)
    const gk = spring(seg(t, T_BAN + 0.1, T_BAN + 0.8), 0.35);
    const gw = golW + gs * 1.3;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x0, by, bw, bh, H * 0.1);
    ctx.clip();
    ctx.fillStyle = col;
    ctx.fillRect(x0, by, gw, bh);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.font = INTER(900, gs);
    ctx.letterSpacing = `${gs * 0.08}px`;
    ctx.fillStyle = '#ffffff';
    ctx.save();
    ctx.translate(x0 + gw / 2 + gs * 0.04, by + bh / 2 + gs * 0.05);
    ctx.scale(0.6 + 0.4 * gk, 0.6 + 0.4 * gk);
    ctx.globalAlpha = clamp(gk * 2);
    ctx.fillText('GOAL', 0, 0);
    ctx.restore();
    ctx.letterSpacing = '0px';
    // autor e minuto
    const tE = ease.outExpo(seg(t, T_BAN + 0.3, T_BAN + 1.0));
    ctx.textAlign = 'left';
    ctx.globalAlpha = tE;
    const tx = x0 + gw + ns * 0.7 - (1 - tE) * ns;
    if (name) {
      ctx.font = INTER(700, ns);
      ctx.fillStyle = INK;
      ctx.fillText(name, tx, by + bh / 2 + ns * 0.05);
    }
    ctx.font = MONO(600, ns * 0.86);
    ctx.fillStyle = p.accent;
    ctx.fillText(minTxt, tx + (name ? nameW + ns * 0.7 : 0), by + bh / 2 + ns * 0.05);
    ctx.restore();
    ctx.restore();
  },
};
