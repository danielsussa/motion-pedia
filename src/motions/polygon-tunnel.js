import { TAU, fract, mixHex, rgba } from '../lib/anim.js';

// Túnel de polígonos: anéis em profundidade z que se aproximam da câmera. O ângulo de cada anel
// depende só da sua profundidade atual (giro em espiral) e de uma rotação global múltipla de
// 2π/lados por loop — assim o conjunto em u=1 é idêntico ao de u=0.
export default {
  id: 'polygon-tunnel',
  title: 'Polygon Tunnel',
  description: 'An endless tunnel of polygons spiraling toward the camera along smooth curves. Seamless loop.',
  category: 'fundos',
  tags: ['background', 'loop', 'shape', '3d'],
  duration: 8,

  params: {
    sides: { type: 'range', label: 'Sides', min: 3, max: 10, step: 1, default: 6 },
    style: { type: 'select', label: 'Style', options: ['linhas', 'sólido'], default: 'linhas' },
    colorA: { type: 'color', label: 'Near color', default: '#ff4d6d' },
    colorB: { type: 'color', label: 'Far color', default: '#5b6cff' },
    bg: { type: 'color', label: 'Background', default: '#07060c' },
    rings: { type: 'range', label: 'Rings', min: 8, max: 40, step: 1, default: 24 },
    speed: { type: 'range', label: 'Speed', min: 1, max: 6, step: 1, default: 2 },
    twist: { type: 'range', label: 'Twist', min: 0, max: 2, step: 0.01, default: 0.8 },
    bend: { type: 'range', label: 'Curve', min: 0, max: 1, step: 0.01, default: 0.4 },
  },

  render(ctx, t, { w, h, p, progress: u }) {
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2;
    const m = Math.min(w, h);
    // raio do anel em z=1. No modo sólido ele precisa cobrir a tela inteira mesmo com triângulos (apótema = R·cos(π/lados)).
    const R0 = Math.hypot(w, h) * 0.5 * 1.08;
    const n = p.rings;
    const sides = p.sides;
    const solid = p.style === 'sólido';
    const R = solid ? R0 / Math.cos(Math.PI / sides) : R0;
    const rot = (TAU / sides) * Math.round(p.speed / 2 + 1) * u; // gira 1+ lados por loop
    // no modo sólido as faixas alternam de cor: o avanço por loop precisa ser par para emendar
    const adv = solid && p.speed % 2 ? p.speed + 1 : p.speed;
    const f = fract(u * adv);
    const cycle = Math.floor(u * adv);

    // Lista de anéis de perto para longe; cada um no seu z (0..1 normalizado)
    const items = [];
    for (let i = 0; i < n + 1; i++) {
      const s = (i - f) / n; // 0 = câmera, 1 = fundo
      if (s < -1 / n) continue;
      const z = 1 + Math.max(0, s) * 9; // profundidade
      const k = R / z; // raio na tela
      // curva do túnel: o centro dos anéis distantes se desloca (loop por frequências inteiras)
      const far = Math.max(0, s) ** 1.6;
      const ox = Math.sin(TAU * u) * m * 0.22 * p.bend * far;
      const oy = Math.sin(TAU * 2 * u + 0.6) * m * 0.12 * p.bend * far;
      const ang = rot + p.twist * Math.max(0, s) * 3 - Math.PI / 2;
      items.push({ s, k, x: cx + ox, y: cy + oy, ang });
    }

    const poly = (it, scale = 1) => {
      const path = new Path2D();
      for (let j = 0; j <= sides; j++) {
        const a = it.ang + (j / sides) * TAU;
        const x = it.x + Math.cos(a) * it.k * scale;
        const y = it.y + Math.sin(a) * it.k * scale;
        j ? path.lineTo(x, y) : path.moveTo(x, y);
      }
      path.closePath();
      return path;
    };

    // névoa: anéis distantes somem no fundo; fade-in suave no fundo, sem pop
    const fog = (s) => Math.min(1, (1 - s) * 3.5) * Math.min(1, Math.max(0, s + 1 / n) * n * 0.6 + 0.4);

    if (solid) {
      // de perto (maior) para longe (menor): cada polígono cobre o anterior por dentro → faixas
      items.forEach((it, i) => {
        const idx = Math.round(it.s * n + f) + cycle; // identidade do anel no mundo → paridade estável
        const base = mixHex(p.colorA, p.colorB, Math.min(1, Math.max(0, it.s)));
        const dim = (1 - Math.min(1, Math.max(0, it.s))) ** 0.8;
        ctx.fillStyle = mixHex(p.bg, base.startsWith('rgb') ? toHex(base) : base, (((idx % 2) + 2) % 2 ? 0.55 : 0.85) * dim);
        ctx.fill(poly(it));
      });
      // centro escuro do túnel
      const last = items[items.length - 1];
      const g = ctx.createRadialGradient(last.x, last.y, 0, last.x, last.y, last.k * 1.6);
      g.addColorStop(0, rgba(p.bg, 1));
      g.addColorStop(1, rgba(p.bg, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    } else {
      // linhas longitudinais ligando vértices de anéis vizinhos (dá volume)
      ctx.lineJoin = 'round';
      const spokes = new Path2D();
      for (let i = 0; i < items.length - 1; i++) {
        const a = items[i];
        const b = items[i + 1];
        for (let j = 0; j < sides; j++) {
          const aa = a.ang + (j / sides) * TAU;
          const ab = b.ang + (j / sides) * TAU;
          spokes.moveTo(a.x + Math.cos(aa) * a.k, a.y + Math.sin(aa) * a.k);
          spokes.lineTo(b.x + Math.cos(ab) * b.k, b.y + Math.sin(ab) * b.k);
        }
      }
      ctx.strokeStyle = rgba(p.colorB, 0.18);
      ctx.lineWidth = m * 0.0015;
      ctx.stroke(spokes);

      ctx.globalCompositeOperation = 'lighter';
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        const s = Math.min(1, Math.max(0, it.s));
        const color = mixHex(p.colorA, p.colorB, Math.pow(s, 0.6));
        const path = poly(it);
        const lw = Math.max(m * 0.0015, it.k * 0.012);
        const a = fog(it.s);
        ctx.strokeStyle = color;
        // brilho barato: traço largo e fraco por baixo (shadowBlur em anéis grandes custa caro)
        ctx.globalAlpha = a * 0.05;
        ctx.lineWidth = lw * 6;
        ctx.stroke(path);
        ctx.globalAlpha = a * 0.12;
        ctx.lineWidth = lw * 2.6;
        ctx.stroke(path);
        ctx.globalAlpha = a;
        ctx.lineWidth = lw;
        ctx.stroke(path);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    // vinheta
    const v = ctx.createRadialGradient(cx, cy, m * 0.25, cx, cy, Math.hypot(w, h) * 0.55);
    v.addColorStop(0, rgba(p.bg, 0));
    v.addColorStop(1, rgba(p.bg, 0.5));
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);
  },
};

// mixHex devolve "rgb(r,g,b)"; mixHex aceita só hex, então convertemos de volta.
function toHex(rgb) {
  const [r, g, b] = rgb.match(/\d+/g).map(Number);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}
