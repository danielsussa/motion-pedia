import { TAU, rng, rgba, mixHex, smoothstep } from '../lib/anim.js';
import { createNoise } from '../lib/noise.js';

// Light leaks: manchas de luz quente entrando pelas bordas do quadro, respirando com ruído em loop
// (noise.loop2) e deslizando com frequências inteiras. Mescla aditiva ('lighter'), que também funciona
// sobre canvas transparente — exporte com --alpha e use "Screen/Add" no editor.

function preview(ctx, w, h, bg) {
  // cena neutra de prévia (crepúsculo azulado com morros), só para ver o overlay agindo
  const S = Math.min(w, h);
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, mixHex(bg, '#0e1622', 0.5));
  sky.addColorStop(0.6, mixHex(bg, '#5a6a7a', 0.45));
  sky.addColorStop(1, mixHex(bg, '#141a22', 0.6));
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  const hills = [[0.68, '#2a3340', 0.05, 2.2], [0.78, '#1b222c', 0.05, 3.1], [0.9, '#10151b', 0.03, 1.3]];
  for (const [y0, col, amp, f] of hills) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let i = 0; i <= 48; i++) {
      const x = (i / 48) * w;
      ctx.lineTo(x, h * y0 + Math.sin((i / 48) * TAU * f + y0 * 9) * S * amp);
    }
    ctx.lineTo(w, h);
    ctx.fill();
  }
}

export default {
  id: 'light-leaks',
  title: 'Light Leaks',
  description: 'Vazamentos de luz quentes entrando pelas bordas e respirando em loop, para sobrepor a vídeo.',
  category: 'transicoes',
  tags: ['overlay', 'alpha', 'loop'],
  duration: 6,

  params: {
    c1: { type: 'color', label: 'Núcleo', default: '#ffe2a8' },
    c2: { type: 'color', label: 'Laranja', default: '#ff7a2e' },
    c3: { type: 'color', label: 'Borda', default: '#ff2f5b' },
    transparent: { type: 'boolean', label: 'Fundo transparente', default: true },
    intensity: { type: 'range', label: 'Intensidade', min: 0.1, max: 1.5, step: 0.01, default: 0.85 },
    count: { type: 'range', label: 'Manchas', min: 1, max: 8, step: 1, default: 4 },
    size: { type: 'range', label: 'Tamanho', min: 0.4, max: 1.6, step: 0.01, default: 1 },
    streak: { type: 'boolean', label: 'Faixa de luz', default: true },
    bg: { type: 'color', label: 'Prévia', default: '#3a4250' },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 6 },
  },

  setup({ p }) {
    const rand = rng(p.seed);
    const R = (a, b) => a + (b - a) * rand();
    const leaks = Array.from({ length: p.count }, (_, i) => ({
      // ângulo na borda: espalha os vazamentos ao redor do quadro, preferindo laterais e cantos
      th: (i / p.count) * TAU + R(-0.5, 0.5),
      sw: R(0.15, 0.4), // quanto desliza ao longo da borda
      f: 1 + Math.floor(rand() * 2),
      ph: rand() * TAU,
      r: R(0.75, 1.2),
      asp: R(0.45, 0.8), // alongamento
      rot: R(-0.6, 0.6),
      hue: rand(), // mistura entre c2 e c3
      nx: R(0, 50),
    }));
    return { leaks, noise: createNoise(p.seed) };
  },

  render(ctx, t, { w, h, p, progress: u, state }) {
    if (!p.transparent) preview(ctx, w, h, p.bg);
    const S = Math.min(w, h);
    const { noise } = state;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    for (const L of state.leaks) {
      const th = L.th + Math.sin(TAU * L.f * u + L.ph) * L.sw;
      const ex = Math.cos(th), ey = Math.sin(th);
      // centro um pouco fora do quadro: só a franja entra
      const cx = w / 2 + ex * (w / 2 - S * 0.02);
      const cy = h / 2 + ey * (h / 2 - S * 0.02);
      const n = noise.loop2(L.nx, 0.5, u, 1.6);
      const a = smoothstep(-0.45, 0.55, n) * p.intensity;
      if (a < 0.01) continue;
      const R = S * L.r * p.size * (0.85 + 0.25 * n);
      const core = mixHex(p.c2, p.c3, L.hue);
      ctx.save();
      ctx.translate(cx, cy);
      // alongado na direção da borda (tangente)
      ctx.rotate(th + Math.PI / 2 + L.rot);
      ctx.scale(1, L.asp);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
      g.addColorStop(0, rgba(p.c1, 0.8 * a));
      g.addColorStop(0.22, rgba(p.c2, 0.55 * a));
      g.addColorStop(0.5, toRgba(core, 0.25 * a));
      g.addColorStop(0.75, rgba(p.c3, 0.07 * a));
      g.addColorStop(1, rgba(p.c3, 0));
      ctx.fillStyle = g;
      ctx.fillRect(-R, -R, R * 2, R * 2);
      ctx.restore();
    }

    // faixa diagonal (vazamento de obturador) que atravessa uma vez por loop
    if (p.streak) {
      const k = (u * 1.0 + 0.15) % 1; // posição 0..1
      const vis = Math.sin(Math.PI * k) ** 2;
      const x = -w * 0.3 + k * w * 1.6;
      const ang = -0.35;
      const len = Math.hypot(w, h) * 1.2;
      const wid = S * 0.7 * p.size;
      ctx.save();
      ctx.translate(x, h / 2);
      ctx.rotate(ang);
      const g = ctx.createLinearGradient(-wid, 0, wid, 0);
      const a = 0.3 * vis * p.intensity;
      g.addColorStop(0, rgba(p.c3, 0));
      g.addColorStop(0.3, rgba(p.c3, a * 0.3));
      g.addColorStop(0.46, rgba(p.c2, a * 0.75));
      g.addColorStop(0.5, toRgba(mixHex(p.c1, p.c2, 0.45), a));
      g.addColorStop(0.54, rgba(p.c2, a * 0.75));
      g.addColorStop(0.7, rgba(p.c3, a * 0.3));
      g.addColorStop(1, rgba(p.c3, 0));
      ctx.fillStyle = g;
      ctx.fillRect(-wid, -len / 2, wid * 2, len);
      ctx.restore();
    }
    ctx.restore();
  },
};

// mixHex devolve 'rgb(r,g,b)'; converte para rgba com alpha.
function toRgba(rgb, a) {
  return rgb.replace('rgb(', 'rgba(').replace(')', `,${a})`);
}
