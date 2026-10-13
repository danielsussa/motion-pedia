import { TAU, mixHex } from '../lib/anim.js';

export default {
  id: 'dot-wave',
  title: 'Dot Wave',
  description: 'A grid of dots pulsing with a wave — radial, diagonal or two-source interference.',
  category: 'fundos',
  tags: ['pattern', 'loop', 'background'],
  duration: 6,

  params: {
    mode: { type: 'select', label: 'Wave', options: ['radial', 'diagonal', 'interferência'], default: 'radial' },
    spacing: { type: 'range', label: 'Spacing', min: 16, max: 90, step: 1, default: 38 },
    radius: { type: 'range', label: 'Max radius', min: 0.1, max: 0.6, step: 0.01, default: 0.42 },
    freq: { type: 'range', label: 'Frequency', min: 0.002, max: 0.03, step: 0.0005, default: 0.011 },
    cycles: { type: 'range', label: 'Cycles/loop', min: 1, max: 4, step: 1, default: 2 },
    colorA: { type: 'color', label: 'Low color', default: '#1d2a66' },
    colorB: { type: 'color', label: 'High color', default: '#7cf5ff' },
    bg: { type: 'color', label: 'Background', default: '#05060a' },
  },

  render(ctx, t, { w, h, p, progress: u }) {
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, w, h);

    const s = p.spacing;
    const cols = Math.ceil(w / s) + 1;
    const rows = Math.ceil(h / s) + 1;
    const ox = (w - (cols - 1) * s) / 2;
    const oy = (h - (rows - 1) * s) / 2;
    const phase = TAU * p.cycles * u;
    const cx = w / 2;
    const cy = h / 2;

    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const x = ox + i * s;
        const y = oy + j * s;
        let v;
        if (p.mode === 'diagonal') {
          v = 0.5 + 0.5 * Math.sin((x + y) * 0.7071 * p.freq - phase);
        } else if (p.mode === 'interferência') {
          const d1 = Math.hypot(x - w * 0.3, y - cy);
          const d2 = Math.hypot(x - w * 0.7, y - cy);
          v = 0.5 + 0.25 * (Math.sin(d1 * p.freq - phase) + Math.sin(d2 * p.freq - phase));
        } else {
          v = 0.5 + 0.5 * Math.sin(Math.hypot(x - cx, y - cy) * p.freq - phase);
        }
        const r = s * p.radius * (0.12 + 0.88 * v ** 1.5);
        ctx.fillStyle = mixHex(p.colorA, p.colorB, v);
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fill();
      }
    }
  },
};
