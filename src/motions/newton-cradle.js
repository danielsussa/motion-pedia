import { TAU, clamp, ease, hexToRgb, rgba } from '../lib/anim.js';

// Pêndulo de Newton em vista frontal, com chão espelhado (reflexo que some com a distância) e
// sombras suaves. Ciclo de 2 s: o grupo da esquerda sai e volta (meio período), bate, o da direita
// sai e volta. Ângulo θ = A·sin(π·s) por meia oscilação — analítico, função pura de t.
// As bolas do meio só "tremem" um pouco após cada choque (transferência de momento).

const CYCLE = 2;

export default {
  id: 'newton-cradle',
  title: "Newton's Cradle",
  description: 'Newton\'s cradle with chrome balls, a floor reflection, shadows and a subtle pulse on every impact.',
  category: 'formas',
  tags: ['shape', 'loop', 'simulation', '3d'],
  duration: 4,
  poster: 0.42,

  params: {
    balls: { type: 'range', label: 'Balls', min: 3, max: 7, step: 1, default: 5 },
    lift: { type: 'range', label: 'Lifted balls', min: 1, max: 3, step: 1, default: 1 },
    amp: { type: 'range', label: 'Amplitude', min: 0.2, max: 0.9, step: 0.01, default: 0.62 },
    reflection: { type: 'range', label: 'Reflection', min: 0, max: 0.6, step: 0.01, default: 0.26 },
    pulse: { type: 'boolean', label: 'Impact pulse', default: true },
    ball: { type: 'color', label: 'Ball color', default: '#c9ccd2' },
    accent: { type: 'color', label: 'Accent', default: '#ff6a3d' },
    ink: { type: 'color', label: 'Frame', default: '#ece6da' },
    bg: { type: 'color', label: 'Background', default: '#0e0f13' },
  },

  render(ctx, t, { w, h, p }) {
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, w, h);
    const n = Math.round(p.balls);
    const c = clamp(Math.round(p.lift), 1, n - 1);
    const A = p.amp;
    // geometria: cabe em 1:1 com a amplitude máxima
    const m = Math.min(w * 0.9, h * 1.25);
    const R = Math.min(m * 0.046 * (5 / n) ** 0.35, m * 0.24 / n);
    const L = m * 0.3;
    const cx = w / 2;
    const swing = L * Math.sin(A);
    const halfW = n * R + swing + R * 0.6;
    const postX = halfW + R * 0.8;
    const frameH = L + R * 1.9;
    const topY = h / 2 - frameH * 0.68;
    const floorY = topY + frameH;
    const pivX = (i) => cx + (i - (n - 1) / 2) * R * 2.004;

    // ângulos
    const x = (t % CYCLE) / CYCLE;
    const angles = new Array(n).fill(0);
    if (x < 0.5) {
      const a = -A * Math.sin(Math.PI * (x / 0.5));
      for (let i = 0; i < c; i++) angles[i] = a;
    } else {
      const a = A * Math.sin(Math.PI * ((x - 0.5) / 0.5));
      for (let i = n - c; i < n; i++) angles[i] = a;
    }
    // tremor das bolas do meio após o choque
    const ageR = ((t % CYCLE) + CYCLE) % CYCLE; // choque à direita em x=0
    const ageL = (((t - CYCLE / 2) % CYCLE) + CYCLE) % CYCLE;
    const jig = (age) => 0.012 * Math.exp(-age * 9) * Math.sin(age * 38);
    for (let i = c; i < n - c; i++) angles[i] += jig(ageR) - jig(ageL);

    const pos = angles.map((a, i) => [pivX(i) + L * Math.sin(a), topY + L * Math.cos(a)]);
    const [br, bgc, bb] = hexToRgb(p.ball);
    const sh = (k) => `rgb(${Math.round(br * k)},${Math.round(bgc * k)},${Math.round(bb * k)})`;
    const hi = (k) => `rgb(${Math.round(br + (255 - br) * k)},${Math.round(bgc + (255 - bgc) * k)},${Math.round(bb + (255 - bb) * k)})`;

    const drawBall = (bx, by, flip) => {
      const g = ctx.createRadialGradient(bx - R * 0.38, by - R * 0.42 * flip, R * 0.04, bx, by, R);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.18, hi(0.55));
      g.addColorStop(0.55, sh(0.62));
      g.addColorStop(0.86, sh(0.3));
      g.addColorStop(1, sh(0.55));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(bx, by, R, 0, TAU);
      ctx.fill();
      // luz rebatida embaixo
      ctx.strokeStyle = rgba('#ffffff', 0.18);
      ctx.lineWidth = R * 0.08;
      ctx.beginPath();
      ctx.arc(bx, by, R * 0.9, Math.PI * (flip > 0 ? 0.25 : 1.25), Math.PI * (flip > 0 ? 0.75 : 1.75));
      ctx.stroke();
    };
    // pulso no ponto de contato (atrás das bolas: aparece como um halo em volta do choque)
    const ring = (age, i) => {
      const k = age / 0.5;
      if (k >= 1) return;
      const e = ease.outExpo(k);
      const qx = (pos[i][0] + pos[i + 1][0]) / 2;
      const qy = topY + L;
      ctx.strokeStyle = rgba(p.accent, 0.8 * (1 - k) ** 1.5);
      ctx.lineWidth = Math.max(1, R * 0.06 * (1 - k * 0.5));
      ctx.beginPath();
      ctx.arc(qx, qy, R * (0.4 + 1.4 * e), 0, TAU);
      ctx.stroke();
    };
    const strW = Math.max(1, m * 0.0016);
    const drawRig = (flip) => {
      // estrutura (barra + colunas), espelhada em torno do chão quando flip = -1
      const Y = (y) => (flip > 0 ? y : 2 * floorY - y);
      ctx.strokeStyle = rgba(p.ink, 0.82);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(2, m * 0.007);
      ctx.beginPath();
      ctx.moveTo(cx - postX, Y(floorY));
      ctx.lineTo(cx - postX, Y(topY));
      ctx.lineTo(cx + postX, Y(topY));
      ctx.lineTo(cx + postX, Y(floorY));
      ctx.stroke();
      // fios (dois por bola, em V, como no objeto real visto de leve)
      ctx.strokeStyle = rgba(p.ink, 0.5);
      ctx.lineWidth = strW;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const [bx, by] = pos[i];
        const ax = angles[i];
        const tx = bx - Math.sin(ax) * R * 0.98;
        const ty = by - Math.cos(ax) * R * 0.98;
        ctx.moveTo(pivX(i) - R * 0.22, Y(topY));
        ctx.lineTo(tx, Y(ty));
        ctx.lineTo(pivX(i) + R * 0.22, Y(topY));
      }
      ctx.stroke();
      // engates
      ctx.fillStyle = rgba(p.ink, 0.9);
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const [bx, by] = pos[i];
        const ax = angles[i];
        const tx = bx - Math.sin(ax) * R;
        const ty = Y(by - Math.cos(ax) * R);
        ctx.moveTo(tx + R * 0.14, ty);
        ctx.arc(tx, ty, R * 0.14, 0, TAU);
      }
      ctx.fill();
      if (flip > 0 && p.pulse) {
        ring(ageR, n - c - 1);
        ring(ageL, c - 1);
      }
      for (let i = 0; i < n; i++) drawBall(pos[i][0], Y(pos[i][1]), flip);
    };

    // reflexo (atenuado) e fade para o fundo (mesma cor, só alpha)
    if (p.reflection > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, floorY, w, h - floorY);
      ctx.clip();
      ctx.globalAlpha = p.reflection;
      drawRig(-1);
      ctx.globalAlpha = 1;
      const fadeH = frameH * 0.85;
      const g = ctx.createLinearGradient(0, floorY, 0, floorY + fadeH);
      g.addColorStop(0, rgba(p.bg, 0.15));
      g.addColorStop(1, rgba(p.bg, 1));
      ctx.fillStyle = g;
      ctx.fillRect(0, floorY, w, h - floorY + 1);
      ctx.restore();
    }
    // linha do chão
    const lg = ctx.createLinearGradient(cx - postX * 1.6, 0, cx + postX * 1.6, 0);
    lg.addColorStop(0, rgba(p.ink, 0));
    lg.addColorStop(0.5, rgba(p.ink, 0.22));
    lg.addColorStop(1, rgba(p.ink, 0));
    ctx.fillStyle = lg;
    ctx.fillRect(cx - postX * 1.6, floorY - 0.5, postX * 3.2, Math.max(1, m * 0.0012));
    // sombras no chão
    for (let i = 0; i < n; i++) {
      const [bx, by] = pos[i];
      const lift = (floorY - by - R) / (floorY - topY);
      const rr = R * (1.2 + lift * 1.6);
      ctx.save();
      ctx.translate(bx, floorY);
      ctx.scale(1, 0.18);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rr);
      g.addColorStop(0, `rgba(0,0,0,${0.55 * (1 - lift * 1.4)})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(-rr, -rr, rr * 2, rr * 2);
      ctx.restore();
    }

    drawRig(1);

  },
};
