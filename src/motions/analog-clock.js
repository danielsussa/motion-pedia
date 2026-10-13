import { TAU, clamp, ease, seg, spring, smoothstep, rgba, mixHex } from '../lib/anim.js';

// Relógio analógico. Hora do relógio em segundos: T(t) = T0 + tique(t) + (12h·voltas − D)·inOutCubic(fase rápida).
// O tique avança 1 s real por segundo (com mola), e a fase rápida soma o resto para fechar
// exatamente 12h·voltas: no fim do loop todos os ponteiros voltam à mesma posição.
// Em alta velocidade o ponteiro dos minutos deixa um rastro (gradiente cônico) e o dos segundos some.

function fmt(T) {
  const s = ((Math.floor(T) % 43200) + 43200) % 43200;
  const hh = Math.floor(s / 3600) || 12;
  const mm = Math.floor((s % 3600) / 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
const ROMAN = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];

export default {
  id: 'analog-clock',
  title: 'Analog Clock',
  description: 'Relógio analógico que tiqueteia, dispara os ponteiros com rastro para mostrar as horas passando e desacelera de volta.',
  category: 'formas',
  tags: ['forma', 'loop', 'ui', 'alpha'],
  duration: 10,
  poster: 5,

  params: {
    start: { type: 'text', label: 'Hora inicial (hh:mm)', default: '10:10' },
    turns: { type: 'range', label: 'Voltas de 12h', min: 1, max: 4, step: 1, default: 1 },
    numerals: { type: 'select', label: 'Números', options: ['arábicos', 'romanos', 'nenhum'], default: 'arábicos' },
    digital: { type: 'boolean', label: 'Leitura digital', default: true },
    trail: { type: 'range', label: 'Rastro', min: 0, max: 1, step: 0.01, default: 0.7 },
    accent: { type: 'color', label: 'Segundos', default: '#ff6a3d' },
    ink: { type: 'color', label: 'Ponteiros', default: '#ece6da' },
    bg: { type: 'color', label: 'Fundo', default: '#0e0f13' },
    transparent: { type: 'boolean', label: 'Fundo transparente', default: false },
  },

  render(ctx, t, { w, h, p, duration: D }) {
    if (!p.transparent) {
      ctx.fillStyle = p.bg;
      ctx.fillRect(0, 0, w, h);
    }
    const m = Math.min(w, h);
    const R = m * 0.4;
    const cx = w / 2;
    const cy = h / 2;
    const [sh, sm] = String(p.start).split(':').map((v) => parseInt(v, 10) || 0);
    const T0 = ((sh % 12) * 3600 + clamp(sm, 0, 59) * 60) % 43200;
    const a0 = Math.min(2, D * 0.2);
    const a1 = D - a0;
    const total = 43200 * Math.round(p.turns) - D;
    const fast = (tt) => total * ease.inOutCubic(seg(tt, a0, a1));
    const tick = Math.floor(t) + spring(clamp((t - Math.floor(t)) / 0.35), 0.25);
    const T = T0 + tick + fast(t);
    const speed = Math.abs(fast(t + 0.01) - fast(t - 0.01)) / 0.02; // s de relógio por s real
    const angH = ((T / 43200) % 1) * TAU;
    const angM = ((T / 3600) % 1) * TAU;
    const angS = ((T / 60) % 1) * TAU;

    // mostrador
    const faceCol = p.transparent ? rgba(p.bg, 0.92) : mixHex(p.bg, p.ink, 0.045);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.arc(cx + R * 0.02, cy + R * 0.04, R * 1.04, 0, TAU);
    ctx.fill();
    ctx.fillStyle = faceCol;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = rgba(p.ink, 0.16);
    ctx.lineWidth = R * 0.012;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.995, 0, TAU);
    ctx.stroke();

    // marcações: 48 menores + 12 maiores (dois lotes)
    ctx.lineCap = 'round';
    ctx.strokeStyle = rgba(p.ink, 0.28);
    ctx.lineWidth = R * 0.008;
    ctx.beginPath();
    for (let i = 0; i < 60; i++) {
      if (i % 5 === 0) continue;
      const a = (i / 60) * TAU;
      const sx = Math.sin(a);
      const cy2 = -Math.cos(a);
      ctx.moveTo(cx + sx * R * 0.9, cy + cy2 * R * 0.9);
      ctx.lineTo(cx + sx * R * 0.94, cy + cy2 * R * 0.94);
    }
    ctx.stroke();
    ctx.strokeStyle = rgba(p.ink, 0.85);
    ctx.lineWidth = R * 0.018;
    ctx.beginPath();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      const r0 = i % 3 === 0 ? 0.82 : 0.86;
      ctx.moveTo(cx + Math.sin(a) * R * r0, cy - Math.cos(a) * R * r0);
      ctx.lineTo(cx + Math.sin(a) * R * 0.94, cy - Math.cos(a) * R * 0.94);
    }
    ctx.stroke();

    if (p.numerals !== 'nenhum') {
      const roman = p.numerals === 'romanos';
      ctx.fillStyle = rgba(p.ink, 0.88);
      ctx.font = roman ? `400 ${R * 0.12}px "Instrument Serif"` : `300 ${R * 0.11}px Inter`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU;
        const rr = R * 0.7;
        ctx.fillText(roman ? ROMAN[i] : String(i || 12), cx + Math.sin(a) * rr, cy - Math.cos(a) * rr + R * 0.006);
      }
    }

    if (p.digital) {
      ctx.font = `500 ${R * 0.075}px "JetBrains Mono"`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = rgba(p.ink, 0.5);
      ctx.fillText(fmt(T), cx, cy + R * 0.38);
    }

    // rastro dos ponteiros (gradiente cônico de alpha, mesma cor)
    const sweepFor = (rate, len) => Math.min(TAU * 0.92, rate * 0.12 * p.trail) * smoothstep(0.02, 0.3, rate * 0.12) * (len > 0 ? 1 : 0);
    const trailWedge = (ang, sweep, rr, alpha) => {
      if (sweep < 0.01 || p.trail <= 0) return;
      const a1c = ang - Math.PI / 2;
      const a0c = a1c - sweep;
      const g = ctx.createConicGradient(a0c, cx, cy);
      const k = sweep / TAU;
      g.addColorStop(0, rgba(p.ink, 0));
      g.addColorStop(k, rgba(p.ink, alpha));
      g.addColorStop(Math.min(1, k + 0.0001), rgba(p.ink, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, rr, a0c, a1c);
      ctx.closePath();
      ctx.fill();
    };
    const rateM = (speed / 3600) * TAU; // rad/s
    const rateH = (speed / 43200) * TAU;
    trailWedge(angM, sweepFor(rateM, 1), R * 0.8, 0.22);
    trailWedge(angH, sweepFor(rateH * 4, 1) * 0.5, R * 0.52, 0.18);

    const hand = (ang, len, tail, width, color, shadow) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(ang);
      if (shadow) {
        ctx.fillStyle = 'rgba(0,0,0,0.32)';
        ctx.beginPath();
        ctx.roundRect(-width / 2 + R * 0.012, -len + R * 0.03, width, len + tail, width / 2);
        ctx.fill();
      }
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(-width / 2, -len, width, len + tail, width / 2);
      ctx.fill();
      ctx.restore();
    };
    hand(angH, R * 0.5, R * 0.1, R * 0.05, p.ink, true);
    hand(angM, R * 0.78, R * 0.12, R * 0.032, p.ink, true);
    ctx.fillStyle = p.ink;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.045, 0, TAU);
    ctx.fill();

    // segundos: some quando o tempo acelera
    const sAlpha = 1 - smoothstep(8, 60, speed);
    if (sAlpha > 0.01) {
      ctx.globalAlpha = sAlpha;
      hand(angS, R * 0.86, R * 0.2, R * 0.011, p.accent, false);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angS);
      ctx.fillStyle = p.accent;
      ctx.beginPath();
      ctx.arc(0, R * 0.17, R * 0.03, 0, TAU);
      ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = p.accent;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.022, 0, TAU);
    ctx.fill();
    ctx.fillStyle = faceCol;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.008, 0, TAU);
    ctx.fill();
  },
};
