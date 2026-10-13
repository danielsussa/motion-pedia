import { TAU, rng, rgba, fract, smoothstep } from '../lib/anim.js';

// Estrelas vivem num cilindro de raio ~1 em volta da câmera; z vai de 1 (fundo) a 0 (passou pela câmera).
// Cada estrela percorre o túnel um número inteiro de vezes por loop → emenda perfeita.
const BUCKETS = 10;

export default {
  id: 'starfield',
  title: 'Starfield Warp',
  description: 'Stars stretched at warp speed, streaming from the center toward the camera. Seamless loop.',
  category: 'fundos',
  tags: ['background', 'loop', 'particles', '3d'],
  duration: 6,

  params: {
    color: { type: 'color', label: 'Stars', default: '#eaf2ff' },
    accent: { type: 'color', label: 'Accent', default: '#7aa8ff' },
    bg: { type: 'color', label: 'Background', default: '#05060d' },
    count: { type: 'range', label: 'Count', min: 100, max: 1500, step: 10, default: 700 },
    speed: { type: 'range', label: 'Speed', min: 1, max: 6, step: 1, default: 2 },
    trail: { type: 'range', label: 'Trail', min: 0, max: 1, step: 0.01, default: 0.55 },
    glow: { type: 'range', label: 'Center glow', min: 0, max: 1, step: 0.01, default: 0.5 },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 3 },
  },

  setup({ p }) {
    const rand = rng(p.seed);
    const stars = Array.from({ length: p.count }, () => {
      const a = rand() * TAU;
      const r = 0.15 + Math.sqrt(rand()) * 0.85; // raio no cilindro (evita o centro exato)
      return {
        x: Math.cos(a) * r,
        y: Math.sin(a) * r,
        z0: rand(),
        tint: rand() < 0.22, // parte das estrelas na cor de destaque
      };
    });
    return { stars };
  },

  render(ctx, t, { w, h, p, progress: u, state }) {
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2;
    const m = Math.min(w, h);
    const R = Math.hypot(w, h) * 0.5;
    const K = m * 0.1; // raio na tela = K·r/z
    const zMin = 0.025;
    const zMax = 1;

    // Brilho central (núcleo do warp).
    if (p.glow > 0) {
      const gR = m * 0.55;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, gR);
      g.addColorStop(0, rgba(p.accent, 0.35 * p.glow));
      g.addColorStop(0.35, rgba(p.accent, 0.1 * p.glow));
      g.addColorStop(1, rgba(p.accent, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    // Agrupa por profundidade (alpha/espessura) e cor → poucos stroke().
    const paths = [[], []].map(() => Array.from({ length: BUCKETS }, () => new Path2D()));
    const tf = 0.04 + p.trail * 0.9; // rastro proporcional à distância do centro (cara de dobra)

    for (const s of state.stars) {
      const z = zMin + fract(s.z0 - p.speed * u) * (zMax - zMin);
      const k1 = K / z;
      const k0 = K / Math.min(zMax * 1.2, z * (1 + tf));
      const x1 = cx + s.x * k1;
      const y1 = cy + s.y * k1;
      const fade = smoothstep(1, 0.7, z); // nasce suave no fundo
      const near = Math.min(1, 0.06 / z); // mais perto = mais forte
      const b = Math.min(BUCKETS - 1, Math.floor(fade * (0.15 + 0.85 * near) * BUCKETS));
      const path = paths[s.tint ? 1 : 0][b];
      path.moveTo(cx + s.x * k0, cy + s.y * k0);
      path.lineTo(x1, y1 + 0.01);
    }

    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (let c = 0; c < 2; c++) {
      ctx.strokeStyle = c ? p.accent : p.color;
      for (let b = 0; b < BUCKETS; b++) {
        const k = (b + 0.5) / BUCKETS;
        ctx.globalAlpha = 0.15 + 0.85 * k;
        ctx.lineWidth = m * (0.0011 + 0.0048 * k * k);
        ctx.stroke(paths[c][b]);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // Vinheta leve para dar profundidade.
    const v = ctx.createRadialGradient(cx, cy, m * 0.3, cx, cy, R);
    v.addColorStop(0, rgba(p.bg, 0));
    v.addColorStop(1, rgba(p.bg, 0.6));
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);
  },
};
