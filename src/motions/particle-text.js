import { seg, ease, rng, rgba, TAU, clamp } from '../lib/anim.js';
import { sampleText } from '../lib/text-points.js';

export default {
  id: 'particle-text',
  title: 'Particle Text',
  description: 'Thousands of particles spiral in to form the text, hold it shimmering, then burst outward.',
  category: 'particulas',
  tags: ['particles', 'typography', 'intro'],
  duration: 6,
  poster: 3,

  params: {
    text: { type: 'text', label: 'Text', default: 'IGNITE' },
    density: { type: 'range', label: 'Density', min: 0.4, max: 2, step: 0.05, default: 1 },
    swirl: { type: 'range', label: 'Swirl', min: 0, max: 2, step: 0.05, default: 1 },
    blast: { type: 'range', label: 'Blast strength', min: 0.2, max: 2, step: 0.05, default: 1 },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 4 },
    color: { type: 'color', label: 'Particles', default: '#f4f1ea' },
    accent: { type: 'color', label: 'Accent', default: '#ff6a2e' },
    bg: { type: 'color', label: 'Background', default: '#0a0a0d' },
    transparent: { type: 'boolean', label: 'Transparent background', default: false },
  },

  setup({ w, h, p }) {
    const m = Math.min(w, h);
    const step = Math.max(2, Math.round(m / (230 * Math.sqrt(p.density))));
    const size0 = m * 0.34;
    const fontOf = (s) => `900 ${s}px Inter, system-ui, sans-serif`;
    const text = (p.text || ' ').toUpperCase();
    // Mesmo encolhimento que o sampleText aplica (para o brilho de fundo bater com as partículas).
    const c = document.createElement('canvas').getContext('2d');
    c.font = fontOf(size0);
    const mw = c.measureText(text).width;
    const fsize = mw > w * 0.86 ? (size0 * w * 0.86) / mw : size0;
    const pts = sampleText(text, { font: fontOf(fsize), w, h, step, maxWidth: w * 0.86 });
    const r = rng(p.seed * 131 + 7);
    const R = Math.hypot(w, h) * 0.6;
    let maxD = 1;
    for (const q of pts) maxD = Math.max(maxD, Math.hypot(q.x - w / 2, q.y - h / 2));
    const parts = pts.map((q) => {
      const a = r() * TAU;
      const rad = R * (0.55 + r() * 0.7);
      const dx = q.x - w / 2;
      const dy = q.y - h / 2;
      const d = Math.hypot(dx, dy) || 1;
      const ba = Math.atan2(dy, dx) + (r() - 0.5) * 0.9;
      const sp = m * (0.25 + r() * 0.75) * (0.6 + 0.6 * (d / maxD));
      return {
        tx: q.x,
        ty: q.y,
        sx: w / 2 + Math.cos(a) * rad,
        sy: h / 2 + Math.sin(a) * rad,
        // Entrada varre da esquerda para a direita, com dispersão.
        delay: 0.15 + (q.x / w) * 0.9 + r() * 0.25,
        dur: 1.0 + r() * 0.45,
        spin: (r() < 0.5 ? -1 : 1) * (0.4 + r() * 0.8),
        vx: Math.cos(ba) * sp,
        vy: Math.sin(ba) * sp - m * 0.05,
        bdelay: (d / maxD) * 0.22 + r() * 0.08,
        ph: r() * TAU,
        tw: 2 + Math.floor(r() * 4),
        s: 0.45 + r() * 0.5,
        hot: r() < 0.14,
      };
    });
    return { parts, step, font: fontOf(fsize) };
  },

  render(ctx, t, { w, h, p, px, state }) {
    const m = Math.min(w, h);
    if (!p.transparent) {
      ctx.fillStyle = p.bg;
      ctx.fillRect(0, 0, w, h);
    }
    const { parts, step } = state;
    const BLAST = 3.9;

    // Brilho do texto durante o "hold" (um único desenho borrado).
    const hold = ease.inOutSine(seg(t, 2.0, 2.8)) * (1 - ease.outCubic(seg(t, BLAST - 0.05, BLAST + 0.35)));
    if (hold > 0.001) {
      ctx.save();
      ctx.font = state.font;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.filter = `blur(${m * 0.03 * px}px)`;
      ctx.globalAlpha = 0.35 * hold;
      ctx.fillStyle = p.accent;
      ctx.fillText((p.text || ' ').toUpperCase(), w / 2, h / 2);
      ctx.restore();
    }
    // Flash da explosão.
    const flash = seg(t, BLAST, BLAST + 0.06) * (1 - seg(t, BLAST + 0.06, BLAST + 0.5));
    if (flash > 0 && !p.transparent) {
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, m * 0.9);
      g.addColorStop(0, rgba(p.accent, 0.35 * flash));
      g.addColorStop(1, rgba(p.accent, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    const sw = p.swirl;
    const bl = p.blast;
    const base = step * 0.9;
    for (const pass of [0, 1]) {
      ctx.fillStyle = pass ? p.accent : p.color;
      ctx.beginPath();
      for (const q of parts) {
        if (q.hot !== !!pass) continue;
        const k = seg(t, q.delay, q.delay + q.dur);
        if (k <= 0) continue;
        const e = ease.outQuart(k);
        // Espiral: o ângulo em volta do alvo diminui até zero conforme chega.
        const ang = q.spin * sw * (1 - e) * 2.4;
        const ox = (q.sx - q.tx) * (1 - e);
        const oy = (q.sy - q.ty) * (1 - e);
        const ca = Math.cos(ang);
        const sa = Math.sin(ang);
        let x = q.tx + ox * ca - oy * sa;
        let y = q.ty + ox * sa + oy * ca;
        let a = clamp(k * 4);
        let s = base * q.s * (0.6 + 0.4 * e);
        // Cintilar no hold.
        if (k >= 1) {
          const tw = 0.5 + 0.5 * Math.sin(t * q.tw * 3 + q.ph);
          s *= 0.85 + 0.3 * tw;
          x += Math.sin(t * 2 + q.ph) * step * 0.12;
          y += Math.cos(t * 1.7 + q.ph) * step * 0.12;
        }
        // Explosão: arrasto exponencial + gravidade leve, encolhe e some.
        const bt = t - BLAST - q.bdelay;
        if (bt > 0) {
          const dr = 1 - Math.exp(-2.6 * bt);
          x += q.vx * bl * dr * 1.4;
          y += q.vy * bl * dr * 1.4 + m * 0.05 * bt * bt;
          const fade = clamp(1 - bt / 1.6);
          a *= fade;
          s *= 0.4 + 0.6 * fade;
        }
        if (a <= 0.02 || s <= 0.1) continue;
        // Partículas apagadas pela metade viram quadrados menores (sem trocar globalAlpha por item).
        const ss = s * (0.35 + 0.65 * a);
        ctx.rect(x - ss / 2, y - ss / 2, ss, ss);
      }
      ctx.fill();
    }
  },
};
