import { TAU, rgba, hexToRgb } from '../lib/anim.js';
import { createNoise } from '../lib/noise.js';

// Blob orgânico: o raio de cada ângulo é R·(1 + amp·ruído), com o ruído amostrado num círculo do
// plano (cos θ, sin θ) — o contorno fecha sem emenda — e `loop2` no tempo para o loop perfeito.
// Pintura: halo (mesma cor variando só o alpha), corpo com gradiente linear que gira devagar,
// sombra interna embaixo e highlight especular em cima, ambos recortados pelo contorno.

const N = 160; // pontos do contorno

function contour(noise, cx, cy, R, amp, detail, u, speed, wob) {
  const pts = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const n1 = noise.loop2(c * detail, s * detail, u, speed);
    const n2 = noise.loop2(c * detail * 1.8 + 9, s * detail * 1.8 - 4, u, speed * 1.3);
    const r = R * (1 + amp * (0.88 * n1 + 0.12 * n2) + wob);
    pts[i * 2] = cx + c * r;
    pts[i * 2 + 1] = cy + s * r;
  }
  return pts;
}

// Curva suave passando pelos pontos médios (quadráticas), fechada.
function path(ctx, pts) {
  ctx.beginPath();
  const mx = (i) => (pts[(i % N) * 2] + pts[((i + 1) % N) * 2]) / 2;
  const my = (i) => (pts[(i % N) * 2 + 1] + pts[((i + 1) % N) * 2 + 1]) / 2;
  ctx.moveTo(mx(N - 1), my(N - 1));
  for (let i = 0; i < N; i++) ctx.quadraticCurveTo(pts[i * 2], pts[i * 2 + 1], mx(i), my(i));
  ctx.closePath();
}

export default {
  id: 'blob',
  title: 'Blob',
  description: 'An organic noise-edged blob that breathes and ripples, with gradient, inner shadow and highlight — a looping background shape.',
  category: 'formas',
  tags: ['shape', 'background', 'gradient', 'loop', 'alpha'],
  duration: 8,
  poster: 2.4,

  params: {
    colorA: { type: 'color', label: 'Color A', default: '#ff6b4a' },
    colorB: { type: 'color', label: 'Color B', default: '#7a2cff' },
    bg: { type: 'color', label: 'Background', default: '#0e0d12' },
    size: { type: 'range', label: 'Size', min: 0.15, max: 0.6, step: 0.01, default: 0.33 },
    wobble: { type: 'range', label: 'Wobble', min: 0, max: 0.4, step: 0.01, default: 0.2 },
    detail: { type: 'range', label: 'Detail', min: 0.4, max: 3, step: 0.05, default: 0.7 },
    speed: { type: 'range', label: 'Speed', min: 0.5, max: 4, step: 0.1, default: 1.6 },
    highlight: { type: 'range', label: 'Highlight', min: 0, max: 1, step: 0.01, default: 0.55 },
    glow: { type: 'range', label: 'Halo', min: 0, max: 1, step: 0.01, default: 0.5 },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 3 },
    transparent: { type: 'boolean', label: 'Transparent background', default: false },
  },

  setup({ p }) {
    return { noise: createNoise(p.seed) };
  },

  render(ctx, t, { w, h, p, progress: u, state }) {
    const m = Math.min(w, h);
    if (!p.transparent) {
      ctx.fillStyle = p.bg;
      ctx.fillRect(0, 0, w, h);
    } else ctx.clearRect(0, 0, w, h);

    // respiração e deriva (frequências inteiras do loop)
    const breathe = 0.035 * Math.sin(TAU * 2 * u);
    const cx = w / 2 + m * 0.025 * Math.sin(TAU * u);
    const cy = h / 2 + m * 0.02 * Math.sin(TAU * 2 * u + 1.2);
    const R = m * p.size;
    const pts = contour(state.noise, cx, cy, R, p.wobble, p.detail, u, p.speed, breathe);

    // halo atrás: mesma cor, só o alpha varia
    if (p.glow > 0) {
      const halo = ctx.createRadialGradient(cx, cy, R * 0.6, cx, cy, R * 2.1);
      halo.addColorStop(0, rgba(p.colorB, 0.35 * p.glow));
      halo.addColorStop(1, rgba(p.colorB, 0));
      ctx.fillStyle = halo;
      ctx.fillRect(cx - R * 2.2, cy - R * 2.2, R * 4.4, R * 4.4);
    }

    // corpo: gradiente linear que gira uma volta por loop
    const ang = TAU * u + 0.6;
    const gx = Math.cos(ang) * R * 1.2;
    const gy = Math.sin(ang) * R * 1.2;
    const body = ctx.createLinearGradient(cx - gx, cy - gy, cx + gx, cy + gy);
    body.addColorStop(0, p.colorA);
    body.addColorStop(1, p.colorB);
    path(ctx, pts);
    ctx.fillStyle = body;
    ctx.fill();

    ctx.save();
    ctx.clip();
    // sombra interna embaixo à direita (preto variando só o alpha)
    const sh = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.5, cx - R * 0.2, cy - R * 0.25, R * 1.5);
    sh.addColorStop(0, 'rgba(0,0,0,0)');
    sh.addColorStop(1, 'rgba(0,0,0,0.38)');
    ctx.fillStyle = sh;
    ctx.fillRect(cx - R * 2, cy - R * 2, R * 4, R * 4);
    if (p.highlight > 0) {
      // brilho largo e suave + ponto especular
      const hx = cx - R * 0.38 + R * 0.05 * Math.sin(TAU * u);
      const hy = cy - R * 0.42 + R * 0.04 * Math.cos(TAU * u);
      const hl = ctx.createRadialGradient(hx, hy, 0, hx, hy, R * 0.85);
      hl.addColorStop(0, `rgba(255,255,255,${0.45 * p.highlight})`);
      hl.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = hl;
      ctx.fillRect(cx - R * 2, cy - R * 2, R * 4, R * 4);
      ctx.translate(hx - R * 0.05, hy - R * 0.02);
      ctx.rotate(-0.6);
      ctx.scale(1, 0.55);
      const sp = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.2);
      sp.addColorStop(0, `rgba(255,255,255,${0.5 * p.highlight})`);
      sp.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = sp;
      ctx.fillRect(-R * 0.25, -R * 0.25, R * 0.5, R * 0.5);
    }
    ctx.restore();

    // aresta: traço fino claro, sutil
    path(ctx, pts);
    const [r, g, b] = hexToRgb(p.colorA);
    ctx.strokeStyle = `rgba(${Math.min(255, r + 60)},${Math.min(255, g + 60)},${Math.min(255, b + 60)},0.25)`;
    ctx.lineWidth = Math.max(1, m * 0.0015);
    ctx.stroke();
  },
};
