import { TAU, ease, seg, mixHex } from '../lib/anim.js';

// Hipotrocoides: um círculo de raio r rola por dentro de um círculo de raio R; a caneta fica a d do centro.
//   x = (R−r)·cos θ + d·cos((R−r)/r·θ),  y = (R−r)·sin θ − d·sin((R−r)/r·θ)
// Com R e r inteiros a curva fecha em θ = 2π·r/mdc(R, r). Cada camada é desenhada (com a engrenagem
// visível), fica um tempo inteira e depois se desfaz pelo começo. O loop começa e termina vazio.

const PRESETS = {
  // [R, r, d] em "dentes" de engrenagem, como no brinquedo
  clássico: [
    [96, 52, 34],
    [84, 32, 28],
    [96, 40, 30],
    [80, 34, 20],
    [72, 30, 26],
    [96, 36, 22],
  ],
  flor: [
    [60, 12, 10],
    [72, 12, 8],
    [80, 16, 13],
    [90, 18, 16],
    [84, 12, 10],
    [96, 16, 12],
  ],
  denso: [
    [80, 34, 26],
    [96, 52, 34],
    [100, 42, 36],
    [90, 38, 30],
    [64, 26, 22],
    [96, 56, 46],
  ],
};

const gcd = (a, b) => (b ? gcd(b, a % b) : a);

function curve(R, r, d) {
  const turns = r / gcd(R, r);
  const steps = Math.ceil(turns * 420);
  const pts = new Float32Array((steps + 1) * 2);
  let max = 0;
  for (let i = 0; i <= steps; i++) {
    const th = (i / steps) * TAU * turns;
    const k = ((R - r) / r) * th;
    const x = (R - r) * Math.cos(th) + d * Math.cos(k);
    const y = (R - r) * Math.sin(th) - d * Math.sin(k);
    pts[i * 2] = x;
    pts[i * 2 + 1] = y;
    max = Math.max(max, Math.hypot(x, y));
  }
  for (let i = 0; i < pts.length; i++) pts[i] /= max;
  return { pts, steps, turns, R: R / max, r: r / max, d: d / max };
}

export default {
  id: 'spirograph',
  title: 'Spirograph',
  description: 'Layers of hypotrochoids drawn by a rolling gear, stacked up in color and then undrawn.',
  category: 'formas',
  tags: ['shape', 'loop'],
  duration: 12,
  poster: 6.4,

  params: {
    preset: { type: 'select', label: 'Curves', options: Object.keys(PRESETS), default: 'clássico' },
    layers: { type: 'range', label: 'Layers', min: 1, max: 6, step: 1, default: 4 },
    colorA: { type: 'color', label: 'Color A', default: '#7cf5ff' },
    colorB: { type: 'color', label: 'Color B', default: '#ff4fa0' },
    bg: { type: 'color', label: 'Background', default: '#07080d' },
    width: { type: 'range', label: 'Thickness', min: 0.5, max: 6, step: 0.1, default: 1.8 },
    size: { type: 'range', label: 'Size', min: 0.2, max: 0.48, step: 0.01, default: 0.38 },
    guides: { type: 'boolean', label: 'Gear', default: true },
    glow: { type: 'boolean', label: 'Glow', default: true },
  },

  setup({ p }) {
    return { curves: PRESETS[p.preset].slice(0, p.layers).map(([R, r, d]) => curve(R, r, d)) };
  },

  render(ctx, t, { w, h, p, px, progress: u, state }) {
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, w, h);

    const m = Math.min(w, h);
    const cx = w / 2;
    const cy = h / 2;
    const n = state.curves.length;
    const lw = (p.width * m) / 1080;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(TAU * 0.08 * u); // deriva lenta (o loop começa e termina vazio, então emenda)
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    state.curves.forEach((c, k) => {
      const color = mixHex(p.colorA, p.colorB, n > 1 ? k / (n - 1) : 0);
      const scale = m * p.size * (1 - k * 0.055);
      // camadas desenhadas quase em sequência; desfeitas mais juntas
      const d0 = 0.02 + (n > 1 ? (k * 0.24) / (n - 1) : 0.1);
      const e0 = 0.64 + (n > 1 ? (k * 0.12) / (n - 1) : 0.05);
      const head = ease.inOutCubic(seg(u, d0, d0 + 0.28));
      const tail = ease.inOutCubic(seg(u, e0, e0 + 0.22));
      if (head <= tail) return;
      const rot = (k * TAU) / (n * 2);
      const cs = Math.cos(rot);
      const sn = Math.sin(rot);
      const P = (i) => {
        const x = c.pts[i * 2];
        const y = c.pts[i * 2 + 1];
        return [(x * cs - y * sn) * scale, (x * sn + y * cs) * scale];
      };
      const at = (f) => {
        const fi = f * c.steps;
        const i = Math.min(c.steps - 1, Math.floor(fi));
        const a = P(i);
        const b = P(i + 1);
        const fr = fi - i;
        return [a[0] + (b[0] - a[0]) * fr, a[1] + (b[1] - a[1]) * fr];
      };

      const i0 = Math.ceil(tail * c.steps);
      const i1 = Math.floor(head * c.steps);
      ctx.beginPath();
      const s = at(tail);
      ctx.moveTo(s[0], s[1]);
      for (let i = i0; i <= i1; i++) {
        const q = P(i);
        ctx.lineTo(q[0], q[1]);
      }
      const e = at(head);
      ctx.lineTo(e[0], e[1]);

      ctx.globalCompositeOperation = 'lighter';
      if (p.glow) {
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.16;
        ctx.lineWidth = lw * 4;
        ctx.stroke();
      }
      ctx.globalAlpha = 0.95;
      ctx.lineWidth = lw;
      ctx.strokeStyle = color;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';

      // Engrenagem: só enquanto a caneta desenha
      const drawing = head > 0 && head < 1;
      if (p.guides && drawing) {
        const vis = Math.min(1, Math.sin(Math.PI * head) * 3);
        const th = head * TAU * c.turns;
        const gR = (c.R - c.r) * scale;
        let gx = gR * Math.cos(th);
        let gy = gR * Math.sin(th);
        [gx, gy] = [gx * cs - gy * sn, gx * sn + gy * cs];
        ctx.globalAlpha = 0.5 * vis;
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(0.6, lw * 0.5);
        ctx.beginPath();
        ctx.arc(gx, gy, c.r * scale, 0, TAU);
        ctx.moveTo(gx, gy);
        ctx.lineTo(e[0], e[1]);
        ctx.stroke();
        ctx.globalAlpha = vis;
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = color;
        ctx.shadowBlur = lw * 6 * px;
        ctx.beginPath();
        ctx.arc(e[0], e[1], lw * 2.6, 0, TAU);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
      }
    });
    ctx.restore();
  },
};
