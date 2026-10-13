import { TAU, rng, rgba } from '../lib/anim.js';

function noiseCanvas(size, rand) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = rand() * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

export default {
  id: 'gradient-orbs',
  title: 'Gradient Orbs',
  description: 'Gradient orbs floating in a seamless loop, with film grain. Great as a background.',
  category: 'fundos',
  tags: ['background', 'loop', 'gradient'],
  duration: 10,

  params: {
    c1: { type: 'color', label: 'Color 1', default: '#ff3d7f' },
    c2: { type: 'color', label: 'Color 2', default: '#4d5bff' },
    c3: { type: 'color', label: 'Color 3', default: '#00d1b2' },
    bg: { type: 'color', label: 'Background', default: '#0a0614' },
    count: { type: 'range', label: 'Orbs', min: 2, max: 10, step: 1, default: 6 },
    size: { type: 'range', label: 'Size', min: 0.3, max: 1.3, step: 0.01, default: 0.75 },
    grain: { type: 'range', label: 'Grain', min: 0, max: 0.5, step: 0.01, default: 0.12 },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 7 },
  },

  setup({ p }) {
    const rand = rng(p.seed);
    const orbs = Array.from({ length: p.count }, (_, i) => ({
      fx: 1 + Math.floor(rand() * 2), // frequências inteiras = loop sem emenda
      fy: 1 + Math.floor(rand() * 2),
      px: rand() * TAU,
      py: rand() * TAU,
      ax: 0.2 + rand() * 0.2,
      ay: 0.18 + rand() * 0.2,
      r: 0.3 + rand() * 0.25,
      color: ['c1', 'c2', 'c3'][i % 3],
    }));
    return { orbs, noise: noiseCanvas(256, rand), patterns: new WeakMap() };
  },

  render(ctx, t, { w, h, p, progress: u, state }) {
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, w, h);

    ctx.globalCompositeOperation = 'screen';
    for (const o of state.orbs) {
      const x = w / 2 + Math.sin(TAU * o.fx * u + o.px) * o.ax * w;
      const y = h / 2 + Math.cos(TAU * o.fy * u + o.py) * o.ay * h;
      const R = o.r * Math.max(w, h) * p.size;
      const g = ctx.createRadialGradient(x, y, 0, x, y, R);
      g.addColorStop(0, rgba(p[o.color], 0.85));
      g.addColorStop(0.5, rgba(p[o.color], 0.3));
      g.addColorStop(1, rgba(p[o.color], 0));
      ctx.fillStyle = g;
      ctx.fillRect(x - R, y - R, R * 2, R * 2);
    }

    if (p.grain > 0) {
      let pat = state.patterns.get(ctx);
      if (!pat) state.patterns.set(ctx, (pat = ctx.createPattern(state.noise, 'repeat')));
      const frame = Math.floor(t * 24);
      ctx.globalCompositeOperation = 'overlay';
      ctx.globalAlpha = p.grain;
      ctx.translate(-((frame * 73) % 256), -((frame * 151) % 256));
      ctx.fillStyle = pat;
      ctx.fillRect(0, 0, w + 256, h + 256);
    }
  },
};
