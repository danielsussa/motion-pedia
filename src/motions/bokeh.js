import { TAU, rng, rgba, fract, mixHex } from '../lib/anim.js';

// Sprite de bokeh pré-renderizado: disco com borda levemente mais clara (como lente real) e
// queda suave. `soft` 0..1 controla o quanto a borda é desfocada. Desenhado uma vez no setup.
function sprite(color, soft, S = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const r = S / 2;
  const edge = 0.62 + 0.3 * (1 - soft); // onde começa a queda da borda
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, rgba(color, 0.6));
  grad.addColorStop(edge * 0.85, rgba(color, 0.7));
  grad.addColorStop(edge, rgba(color, 0.95)); // aro
  grad.addColorStop(Math.min(0.999, edge + (1 - edge) * 0.5), rgba(color, 0.25));
  grad.addColorStop(1, rgba(color, 0));
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  return c;
}

export default {
  id: 'bokeh',
  title: 'Bokeh',
  description: 'Círculos de luz desfocados subindo devagar em camadas de profundidade, com brilho cintilante.',
  category: 'fundos',
  tags: ['fundo', 'loop', 'partículas'],
  duration: 12,

  params: {
    c1: { type: 'color', label: 'Cor 1', default: '#ffa53d' },
    c2: { type: 'color', label: 'Cor 2', default: '#ff4f7b' },
    c3: { type: 'color', label: 'Cor 3', default: '#ffe2b0' },
    bg: { type: 'color', label: 'Fundo', default: '#0b0710' },
    count: { type: 'range', label: 'Quantidade', min: 10, max: 140, step: 1, default: 50 },
    size: { type: 'range', label: 'Tamanho', min: 0.3, max: 2, step: 0.01, default: 1 },
    drift: { type: 'range', label: 'Deriva', min: 0, max: 3, step: 1, default: 1 },
    intensity: { type: 'range', label: 'Intensidade', min: 0.2, max: 1.5, step: 0.01, default: 1.1 },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 11 },
  },

  setup({ p }) {
    const rand = rng(p.seed);
    const colors = [p.c1, p.c2, p.c3];
    // 3 níveis de desfoque × 3 cores
    const sprites = colors.map((c) => [0.15, 0.55, 1].map((s) => sprite(c, s)));
    const dots = Array.from({ length: p.count }, () => {
      const depth = rand(); // 0 = fundo (pequeno, nítido, fraco) · 1 = frente (grande, desfocado)
      return {
        depth,
        x: rand(),
        y: rand(),
        color: Math.floor(rand() * 3),
        size: 0.012 + Math.pow(depth, 2.4) * 0.19 + rand() * 0.012,
        swayA: 0.01 + rand() * 0.025,
        swayF: 1 + Math.floor(rand() * 2),
        ph: rand() * TAU,
        twF: 1 + Math.floor(rand() * 3),
        twP: rand() * TAU,
        alpha: 0.35 + rand() * 0.65,
      };
    });
    dots.sort((a, b) => a.depth - b.depth);
    return { sprites, dots };
  },

  render(ctx, t, { w, h, p, progress: u, state }) {
    const m = Math.min(w, h);
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, p.bg);
    bg.addColorStop(1, mixHex(p.bg, p.c2, 0.12));
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Brilho ambiente que dá "ambiente noturno"
    const amb = ctx.createRadialGradient(w * 0.5, h * 0.75, 0, w * 0.5, h * 0.75, Math.max(w, h) * 0.7);
    amb.addColorStop(0, rgba(p.c1, 0.14));
    amb.addColorStop(1, rgba(p.c1, 0));
    ctx.fillStyle = amb;
    ctx.fillRect(0, 0, w, h);

    ctx.globalCompositeOperation = 'lighter';
    for (const d of state.dots) {
      const r = d.size * m * p.size;
      // sobe um número inteiro de telas por loop (frente sobe mais rápido → paralaxe)
      const laps = p.drift === 0 ? 0 : p.drift * (d.depth > 0.5 ? 2 : 1);
      const span = h + r * 2;
      const y = fract(d.y - laps * u) * span - r;
      const x = d.x * (w + r) - r / 2 + Math.sin(TAU * d.swayF * u + d.ph) * d.swayA * w;
      const tw = 0.75 + 0.25 * Math.sin(TAU * d.twF * u + d.twP);
      const a = d.alpha * tw * p.intensity * (1 - 0.62 * d.depth);
      const blur = d.depth < 0.33 ? 0 : d.depth < 0.7 ? 1 : 2;
      ctx.globalAlpha = Math.min(1, a);
      ctx.drawImage(state.sprites[d.color][blur], x - r, y - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // vinheta
    const v = ctx.createRadialGradient(w / 2, h / 2, m * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.6);
    v.addColorStop(0, rgba(p.bg, 0));
    v.addColorStop(1, rgba(p.bg, 0.55));
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);
  },
};
