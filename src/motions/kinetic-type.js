import { seg, ease } from '../lib/anim.js';

export default {
  id: 'kinetic-type',
  title: 'Kinetic Type',
  description: 'Letras sobem em cascata por uma máscara, com uma barra de destaque que entra e sai.',
  category: 'tipografia',
  tags: ['tipografia', 'intro'],
  duration: 4,

  params: {
    text: { type: 'text', label: 'Texto', default: 'MOTION PEDIA' },
    size: { type: 'range', label: 'Tamanho', min: 60, max: 320, step: 1, default: 190 },
    stagger: { type: 'range', label: 'Stagger (s)', min: 0, max: 0.15, step: 0.005, default: 0.045 },
    weight: { type: 'select', label: 'Peso', options: ['500', '700', '800', '900'], default: '800' },
    color: { type: 'color', label: 'Texto', default: '#f4f1ea' },
    accent: { type: 'color', label: 'Destaque', default: '#ff4d2e' },
    bg: { type: 'color', label: 'Fundo', default: '#0d0d10' },
  },

  render(ctx, t, { w, h, p }) {
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, w, h);

    const chars = [...p.text];
    if (!chars.length) return;

    // Mede e encolhe a fonte se o texto não couber (ex.: formato vertical).
    let size = p.size;
    const font = (s) => `${p.weight} ${s}px Inter, system-ui, sans-serif`;
    ctx.font = font(size);
    const measure = () => {
      const track = -0.02 * size;
      const widths = chars.map((c) => ctx.measureText(c).width);
      return { widths, track, total: widths.reduce((a, b) => a + b, 0) + track * (chars.length - 1) };
    };
    let m = measure();
    if (m.total > w * 0.88) {
      size *= (w * 0.88) / m.total;
      ctx.font = font(size);
      m = measure();
    }

    const x0 = (w - m.total) / 2;
    const base = h / 2 + size * 0.36;
    const stg = Math.min(p.stagger, 1.2 / chars.length);
    const travel = size * 1.15;

    // Barra de destaque: cresce da esquerda, sai pela direita.
    const barIn = ease.inOutCubic(seg(t, 0.6, 1.4));
    const barOut = ease.inOutCubic(seg(t, 2.8, 3.5));
    ctx.fillStyle = p.accent;
    ctx.fillRect(x0 + m.total * barOut, base + size * 0.16, m.total * (barIn - barOut), size * 0.07);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, base - size * 0.95, w, size * 1.1);
    ctx.clip();
    ctx.fillStyle = p.color;
    ctx.textBaseline = 'alphabetic';
    let x = x0;
    chars.forEach((c, i) => {
      const inE = ease.outExpo(seg(t, 0.2 + i * stg, 1.1 + i * stg));
      const outE = ease.inCubic(seg(t, 2.9 + i * stg * 0.6, 3.5 + i * stg * 0.6));
      ctx.fillText(c, x, base + (1 - inE) * travel - outE * travel);
      x += m.widths[i] + m.track;
    });
    ctx.restore();
  },
};
