import { TAU, mixHex } from '../lib/anim.js';

export default {
  id: 'orbit-rings',
  title: 'Orbit Rings',
  description: 'Concentric arcs spinning at different speeds and breathing in size. Seamless loop.',
  category: 'formas',
  tags: ['shape', 'loop', 'loader'],
  duration: 6,

  params: {
    rings: { type: 'range', label: 'Rings', min: 3, max: 18, step: 1, default: 9 },
    thickness: { type: 'range', label: 'Thickness', min: 2, max: 40, step: 1, default: 12 },
    gap: { type: 'range', label: 'Gap', min: 4, max: 60, step: 1, default: 22 },
    colorA: { type: 'color', label: 'Inner color', default: '#ffd166' },
    colorB: { type: 'color', label: 'Outer color', default: '#ef476f' },
    bg: { type: 'color', label: 'Background', default: '#101014' },
    track: { type: 'boolean', label: 'Track', default: true },
    glow: { type: 'boolean', label: 'Glow', default: true },
  },

  render(ctx, t, { w, h, p, px, progress: u }) {
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2;
    const m = Math.min(w, h);
    const r0 = m * 0.06;
    const step = p.gap + p.thickness;
    const k = Math.min(1, (m * 0.44 - r0) / ((p.rings - 1) * step));
    const lw = p.thickness * k;
    ctx.lineCap = 'round';
    ctx.lineWidth = lw;

    for (let i = 0; i < p.rings; i++) {
      const r = r0 + i * step * k;
      const color = mixHex(p.colorA, p.colorB, p.rings > 1 ? i / (p.rings - 1) : 0);

      if (p.track) {
        ctx.globalAlpha = 0.07;
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // Velocidades inteiras por loop para emendar sem corte.
      const speed = (i % 2 ? -1 : 1) * (1 + (i % 3));
      const rot = TAU * speed * u + i * 0.5;
      const len = TAU * (0.1 + 0.55 * (0.5 + 0.5 * Math.sin(TAU * u + i * 0.55)));
      ctx.strokeStyle = color;
      ctx.shadowColor = p.glow ? color : 'transparent';
      ctx.shadowBlur = p.glow ? lw * 1.6 * px : 0; // shadowBlur ignora o transform, então escala manual
      ctx.beginPath();
      ctx.arc(cx, cy, r, rot, rot + len);
      ctx.stroke();
    }
  },
};
