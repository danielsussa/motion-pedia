import { TAU, seg, ease, rng, rgba, clamp } from '../lib/anim.js';

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

const Z_NEAR = 0.004; // profundidade mínima (a estrela já saiu da tela antes disso)
const K = 0.12; // raio projetado de uma estrela no fundo (z = 1), relativo ao raio da tela
const V0 = 0.05; // deriva lenta antes do salto (profundidade por segundo)
const SHUTTER = 0.045; // quanto do caminho vira risco

// Distância percorrida (em profundidade) até t: acelera em potência até o meio e desacelera depois.
function travel(t, mid, dur, vmax) {
  if (t <= mid) {
    const u = t / mid;
    return V0 * t + (vmax * mid * u ** 5) / 5;
  }
  const T = dur - mid;
  const u = Math.min(1, (t - mid) / T);
  return V0 * mid + (vmax * mid) / 5 + T * ((vmax * (1 - (1 - u) ** 4)) / 4 + V0 * (u - (u * u) / 2));
}
function speed(t, mid, dur, vmax) {
  if (t <= mid) return V0 + vmax * (t / mid) ** 4;
  const u = Math.min(1, (t - mid) / (dur - mid));
  return vmax * (1 - u) ** 3 + V0 * (1 - u);
}

export default {
  id: 'hyperspace',
  title: 'Hyperspace',
  description: 'Jump to light speed: stars stretch into ever-longer streaks, a flash bursts from the center and fills the screen, and the arrival opens the next scene.',
  category: 'transicoes',
  tags: ['transition', 'particles', 'overlay', 'alpha'],
  duration: 1.6,
  poster: 0.42,

  params: {
    flash: { type: 'color', label: 'Flash', default: '#f3f6ff' },
    star: { type: 'color', label: 'Stars', default: '#ffffff' },
    accent: { type: 'color', label: 'Accent', default: '#6fa8ff' },
    space: { type: 'color', label: 'Space', default: '#04050b' },
    veil: { type: 'range', label: 'Darken scene', min: 0, max: 1, step: 0.01, default: 0.8 },
    stars: { type: 'range', label: 'Star count', min: 100, max: 1200, step: 10, default: 520 },
    warp: { type: 'range', label: 'Speed', min: 0.3, max: 1, step: 0.01, default: 0.7 },
    cx: { type: 'range', label: 'Center X', min: 0.2, max: 0.8, step: 0.01, default: 0.5 },
    cy: { type: 'range', label: 'Center Y', min: 0.2, max: 0.8, step: 0.01, default: 0.5 },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 3 },
    colorA: { type: 'color', label: 'Preview A', default: '#1a1c22' },
    colorB: { type: 'color', label: 'Preview B', default: '#e7e2d8' },
    transparent: { type: 'boolean', label: 'Shapes only (alpha)', default: false },
  },

  setup({ p }) {
    const r = rng(p.seed * 71 + 9);
    const list = [];
    for (let i = 0; i < Math.round(p.stars); i++) {
      const a = r() * TAU;
      list.push({
        ca: Math.cos(a),
        sa: Math.sin(a),
        rho: 0.04 + 0.96 * Math.sqrt(r()), // distância do eixo (densidade uniforme na área)
        z0: r(),
        acc: r() < 0.22,
        wd: 0.6 + 0.8 * r(),
      });
    }
    return { list };
  },

  render(ctx, t, env) {
    const { w, h, p, duration, state } = env;
    preview(ctx, t, env);
    const mid = duration / 2;
    const m = Math.min(w, h);
    const ox = w * p.cx;
    const oy = h * p.cy;
    const R = Math.max(Math.hypot(ox, oy), Math.hypot(w - ox, oy), Math.hypot(ox, h - oy), Math.hypot(w - ox, h - oy)) + 2;
    const vmax = 4 + 14 * p.warp;
    const inPhase = t < mid;

    // Global de entrada/saída: nada visível em t = 0 e em t = duration.
    const fadeIn = ease.outCubic(seg(t, 0, mid * 0.35));
    const fadeOut = 1 - ease.inOutCubic(seg(t, mid + duration * 0.12, duration * 0.98));
    const life = inPhase ? fadeIn : fadeOut;

    // --- Escuridão do espaço por cima da cena.
    const veil = p.veil * (inPhase ? ease.inOutCubic(seg(t, 0, mid * 0.8)) : 1 - ease.outCubic(seg(t, mid + duration * 0.04, mid + duration * 0.34)));
    if (veil > 0.001) {
      ctx.fillStyle = rgba(p.space, veil);
      ctx.fillRect(0, 0, w, h);
    }

    // --- Riscos: estrelas em perspectiva que avançam para a câmera.
    const D = travel(t, mid, duration, vmax);
    const L = Math.min(0.95, speed(t, mid, duration, vmax) * SHUTTER);
    const span = 1 - Z_NEAR;
    const bright = inPhase ? 1 : 1 - 0.35 * seg(t, mid, duration);
    const buckets = [[], [], [], [], [], [], [], []]; // 4 brilhos × (estrela, destaque)
    const base = m * 0.0022;
    if (life > 0.001) {
      for (const s of state.list) {
        const z = Z_NEAR + span * ((((s.z0 - D) % 1) + 1) % 1);
        const zt = Math.min(1, z + L);
        const r1 = (s.rho * R * K) / zt; // cauda (longe)
        if (r1 > R) continue;
        const r0 = Math.min((s.rho * R * K) / z, R * 1.5); // ponta (perto)
        const near = clamp((1 - z) ** 2.2);
        const b = Math.min(3, Math.floor(near * 4 * bright));
        const hw = base * s.wd * (0.35 + 2.6 * near);
        const len = Math.max(r0 - r1, hw * 1.2);
        buckets[b * 2 + (s.acc ? 1 : 0)].push(s.ca, s.sa, r0, r0 - len, hw);
      }
      const alphas = [0.22, 0.45, 0.72, 1];
      for (let k = 0; k < 8; k++) {
        const L5 = buckets[k];
        if (!L5.length) continue;
        ctx.fillStyle = rgba(k % 2 ? p.accent : p.star, alphas[k >> 1] * life);
        ctx.beginPath();
        for (let i = 0; i < L5.length; i += 5) {
          const ca = L5[i];
          const sa = L5[i + 1];
          const r0 = L5[i + 2];
          const r1 = L5[i + 3];
          const hw = L5[i + 4];
          // triângulo afinando para a cauda; ponta arredondada barata (losango curto)
          ctx.moveTo(ox + ca * r1, oy + sa * r1);
          ctx.lineTo(ox + ca * r0 - sa * hw, oy + sa * r0 + ca * hw);
          ctx.lineTo(ox + ca * (r0 + hw), oy + sa * (r0 + hw));
          ctx.lineTo(ox + ca * r0 + sa * hw, oy + sa * r0 - ca * hw);
          ctx.closePath();
        }
        ctx.fill();
      }
    }

    // --- Clarão: um núcleo sai do centro e engole a tela; na chegada abre um buraco a partir do centro.
    if (inPhase) {
      const u = seg(t, mid * 0.45, mid * 0.96);
      if (u <= 0) return;
      if (u >= 1) {
        ctx.fillStyle = p.flash;
        ctx.fillRect(0, 0, w, h);
        return;
      }
      const core = R * 1.05 * ease.inExpo(u); // raio totalmente opaco
      const halo = core + R * (0.25 + 0.6 * u);
      const glowA = 0.25 + 0.75 * u;
      const g = ctx.createRadialGradient(ox, oy, 0, ox, oy, halo);
      const c = Math.min(0.999, core / halo);
      g.addColorStop(0, rgba(p.flash, 1));
      g.addColorStop(c, rgba(p.flash, 1));
      g.addColorStop(c + (1 - c) * 0.35, rgba(p.flash, glowA * 0.45));
      g.addColorStop(1, rgba(p.flash, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    } else {
      const u = seg(t, mid + duration * 0.025, duration * 0.82);
      if (u <= 0) {
        ctx.fillStyle = p.flash;
        ctx.fillRect(0, 0, w, h);
        return;
      }
      if (u >= 1) return;
      const hole = R * 1.1 * ease.outCubic(u);
      const feather = R * (0.15 + 0.5 * u);
      const a = 1 - ease.inOutSine(u);
      const r1 = hole + feather;
      const g = ctx.createRadialGradient(ox, oy, 0, ox, oy, r1);
      const c = hole / r1;
      g.addColorStop(0, rgba(p.flash, 0));
      g.addColorStop(c, rgba(p.flash, 0));
      g.addColorStop(c + (1 - c) * 0.6, rgba(p.flash, a * 0.7));
      g.addColorStop(1, rgba(p.flash, a));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
  },
};
