import { TAU, seg, ease, rng, rgba } from '../lib/anim.js';

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

const SMAX = 0.42; // maior ponta (fração do raio) que a explosão enfia para dentro

// Buraco em forma de explosão: contorno com pontas para dentro (sub-path, sem beginPath).
function burst(ctx, spikes, ox, oy, r, amp, rot) {
  const n = spikes.length;
  for (let j = 0; j < n; j++) {
    const { a, s } = spikes[j];
    const ang = a + rot;
    const rr = j % 2 ? r * (1 - s * amp) : r;
    const x = ox + Math.cos(ang) * rr;
    const y = oy + Math.sin(ang) * rr;
    if (j) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.closePath();
}

export default {
  id: 'zoom-punch',
  title: 'Zoom Punch',
  description: 'Speed lines converge on the center and a bursting flash fills the frame; at the cut it blows outward to reveal the next scene.',
  category: 'transicoes',
  tags: ['transition', 'shape', 'overlay', 'alpha'],
  duration: 1.2,
  poster: 0.5,

  params: {
    flash: { type: 'color', label: 'Flash', default: '#ffffff' },
    accent: { type: 'color', label: 'Accent', default: '#ff4d2e' },
    lines: { type: 'range', label: 'Speed lines', min: 0, max: 220, step: 1, default: 110 },
    spikes: { type: 'range', label: 'Spikes', min: 12, max: 120, step: 1, default: 54 },
    rim: { type: 'range', label: 'Accent rim', min: 0, max: 1, step: 0.01, default: 0.5 },
    cx: { type: 'range', label: 'Center X', min: 0, max: 1, step: 0.01, default: 0.5 },
    cy: { type: 'range', label: 'Center Y', min: 0, max: 1, step: 0.01, default: 0.5 },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 7 },
    colorA: { type: 'color', label: 'Preview A', default: '#1a1c22' },
    colorB: { type: 'color', label: 'Preview B', default: '#e7e2d8' },
    transparent: { type: 'boolean', label: 'Shapes only (alpha)', default: false },
  },

  setup({ p }) {
    const r = rng(p.seed * 31 + 5);
    const k = Math.round(p.spikes);
    const spikes = [];
    for (let j = 0; j < k * 2; j++) {
      spikes.push({ a: ((j + (r() - 0.5) * 0.7) / (k * 2)) * TAU, s: j % 2 ? SMAX * (0.25 + 0.75 * r() ** 1.5) : 0 });
    }
    return { spikes };
  },

  render(ctx, t, env) {
    const { w, h, p, duration, state } = env;
    preview(ctx, t, env);
    const mid = duration / 2;
    const m = Math.min(w, h);
    const ox = w * p.cx;
    const oy = h * p.cy;
    const R = Math.max(Math.hypot(ox, oy), Math.hypot(w - ox, oy), Math.hypot(ox, h - oy), Math.hypot(w - ox, h - oy)) + 4;
    const rimK = 1 - 0.16 * p.rim; // raio do buraco do destaque (relativo ao do flash)
    // Raio em que até as pontas mais fundas ficam fora da tela.
    const open = R / ((1 - SMAX) * rimK) + 4;

    let r; // raio do buraco do flash
    let amp; // quanto as pontas entram
    let alpha = 1;
    let rot;
    const closing = t < mid;
    if (closing) {
      // Antecipação lenta e fechamento brusco (soco).
      const u = seg(t, mid * 0.06, mid * 0.94);
      r = open * (1 - u ** 2.1);
      amp = 0.35 + 0.65 * ease.inCubic(seg(t, 0, mid * 0.9));
      rot = -0.25 * (1 - u);
    } else {
      // Segura o branco por um instante e estoura para fora desacelerando.
      const u = seg(t, mid + duration * 0.035, duration);
      r = open * (1 - (1 - u) ** 2.6);
      amp = 1 - 0.4 * u;
      alpha = 1 - ease.inCubic(seg(t, mid + duration * 0.2, duration * 0.99));
      rot = 0.3 * ease.outCubic(u);
    }
    if (alpha <= 0.001) return;
    const { spikes } = state;

    // Linhas de velocidade: sorteio novo a cada 1/24 s (tremem como desenho animado).
    const nLines = Math.round(p.lines);
    const lineAmt = closing
      ? ease.outCubic(seg(t, mid * 0.05, mid * 0.6))
      : 1 - ease.inOutCubic(seg(t, mid, duration * 0.9));
    if (nLines && lineAmt > 0 && r > 0) {
      const tq = Math.floor(t * 24);
      const rr = rng(p.seed * 977 + tq * 13 + 1);
      const count = Math.round(nLines * lineAmt);
      const reach = closing ? Math.min(r, R) : R; // as linhas nascem no flash (ou nas bordas)
      const inner = closing ? 1 : 0.35 + 0.65 * ease.outCubic(seg(t, mid, duration * 0.8));
      const groups = [
        { c: rgba(p.flash, (closing ? 0.95 : 0.85) * alpha), list: [] },
        { c: rgba(p.accent, 0.95 * alpha), list: [] },
      ];
      for (let i = 0; i < count; i++) {
        const a = rr() * TAU;
        const len = 0.25 + 0.55 * rr();
        const wd = m * (0.002 + 0.012 * rr() ** 2) * (0.6 + 0.6 * lineAmt);
        const acc = rr() < 0.18 * p.rim / 0.5;
        const r1 = reach * 1.02 + m * 0.02;
        const r0 = Math.max(m * 0.04, closing ? reach * (1 - len) : R * (1 - len * 0.8) * inner);
        if (r0 >= r1) continue;
        groups[acc ? 1 : 0].list.push([a, wd, r0, r1]);
      }
      for (const g of groups) {
        if (!g.list.length) continue;
        ctx.fillStyle = g.c;
        ctx.beginPath();
        for (const [a, wd, r0, r1] of g.list) {
          const ca = Math.cos(a);
          const sa = Math.sin(a);
          const half = wd / 2;
          ctx.moveTo(ox + ca * r0, oy + sa * r0);
          ctx.lineTo(ox + ca * r1 - sa * half, oy + sa * r1 + ca * half);
          ctx.lineTo(ox + ca * r1 + sa * half, oy + sa * r1 - ca * half);
          ctx.closePath();
        }
        ctx.fill();
      }
    }

    // Borda de destaque (buraco menor) e flash por cima (buraco maior): anel com pontas.
    const layers = [];
    if (p.rim > 0) layers.push({ c: p.accent, r: r * rimK });
    layers.push({ c: p.flash, r });
    ctx.globalAlpha = alpha;
    for (const L of layers) {
      if (L.r * (1 - SMAX * amp) > R) continue; // buraco já maior que a tela
      ctx.fillStyle = L.c;
      ctx.beginPath();
      ctx.rect(-2, -2, w + 4, h + 4);
      if (L.r > 0.5) burst(ctx, spikes, ox, oy, L.r, amp, rot);
      ctx.fill('evenodd');
    }
    ctx.globalAlpha = 1;
  },
};
