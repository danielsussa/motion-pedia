import { seg, ease } from '../lib/anim.js';

// Fundo de prévia das transições: cena "A" antes do meio, "B" depois.
function preview(ctx, t, { w, h, p, duration }) {
  if (p.transparent) return;
  const isA = t < duration / 2;
  ctx.fillStyle = isA ? p.colorA : p.colorB;
  ctx.fillRect(0, 0, w, h);
  const m = Math.min(w, h);
  ctx.font = `800 ${m * 0.32}px Inter, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = isA ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.14)';
  ctx.fillText(isA ? 'A' : 'B', w / 2, h / 2 + m * 0.02);
}

export default {
  id: 'stripe-wipe',
  title: 'Stripe Wipe',
  description: 'Faixas diagonais atravessam a tela em cascata, cobrem tudo no meio e saem descobrindo a próxima cena.',
  category: 'transicoes',
  tags: ['transição', 'forma', 'alpha'],
  duration: 1.4,
  poster: 0.55,

  params: {
    color1: { type: 'color', label: 'Cor 1', default: '#ff4d2e' },
    color2: { type: 'color', label: 'Cor 2', default: '#111114' },
    color3: { type: 'color', label: 'Cor 3', default: '#f4f1ea' },
    count: { type: 'range', label: 'Faixas', min: 3, max: 16, step: 1, default: 6 },
    angle: { type: 'range', label: 'Ângulo', min: -60, max: 60, step: 1, default: 24 },
    order: { type: 'select', label: 'Ordem', options: ['sequência', 'centro', 'alternada'], default: 'sequência' },
    flow: { type: 'select', label: 'Direção', options: ['mesma', 'alternada'], default: 'mesma' },
    stagger: { type: 'range', label: 'Cascata', min: 0, max: 1, step: 0.01, default: 0.5 },
    colorA: { type: 'color', label: 'Prévia A', default: '#1a1c22' },
    colorB: { type: 'color', label: 'Prévia B', default: '#e7e2d8' },
    transparent: { type: 'boolean', label: 'Só as formas (alpha)', default: false },
  },

  render(ctx, t, env) {
    const { w, h, p, duration } = env;
    preview(ctx, t, env);

    const n = Math.round(p.count);
    const mid = duration / 2;
    const ang = (p.angle * Math.PI) / 180;
    // No referencial girado, faixas horizontais de comprimento L cobrem a diagonal da tela.
    const L = Math.abs(w * Math.cos(ang)) + Math.abs(h * Math.sin(ang));
    const H = Math.abs(w * Math.sin(ang)) + Math.abs(h * Math.cos(ang));
    const band = H / n;
    const pad = Math.min(w, h) * 0.002 + 1; // sobreposição: sem frestas de anti-alias
    const cols = [p.color1, p.color2, p.color3];

    // Cada faixa usa ~60% da metade; o resto é espalhado pela cascata.
    const life = mid * (0.94 - 0.42 * p.stagger);
    const spread = mid * 0.94 - life;

    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(ang);
    for (let i = 0; i < n; i++) {
      let k;
      if (p.order === 'centro') k = Math.abs(i - (n - 1) / 2) / ((n - 1) / 2 || 1);
      else if (p.order === 'alternada') k = (i % 2 ? 0.5 : 0) + (i / (n - 1 || 1)) * 0.5;
      else k = i / (n - 1 || 1);
      const d = k * spread;
      const a = ease.inOutExpo(seg(t, d, d + life));
      const b = ease.inOutExpo(seg(t, mid + d, mid + d + life));
      if (a <= 0 || b >= 1) continue;
      const dir = p.flow === 'alternada' && i % 2 ? -1 : 1;
      // Entra crescendo a partir de uma borda, sai pela outra (mesmo sentido do movimento).
      const x0 = -L / 2 - pad;
      const len = L + pad * 2;
      let s = x0 + len * b;
      let e = x0 + len * a;
      if (dir < 0) [s, e] = [-e, -s];
      const y = -H / 2 + i * band;
      ctx.fillStyle = cols[i % 3];
      ctx.fillRect(s, y - pad, e - s, band + pad * 2);
    }
    ctx.restore();
  },
};
