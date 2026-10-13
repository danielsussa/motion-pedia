import { TAU, rng, fract, rgba, smoothstep } from '../lib/anim.js';

// Caleidoscópio: o conteúdo de UMA fatia (formas que nascem no centro e escorrem para fora, girando)
// é desenhado em cada uma das N fatias, espelhando as ímpares. O par de fatias tem período 2·α, então
// girar o conjunto por 2·α ao longo do loop emenda perfeitamente.

const TYPES = ['circle', 'ring', 'tri', 'square', 'bar', 'dots'];

function shape(ctx, type, s) {
  ctx.beginPath();
  switch (type) {
    case 'circle':
      ctx.arc(0, 0, s, 0, TAU);
      ctx.fill();
      break;
    case 'ring':
      ctx.arc(0, 0, s, 0, TAU);
      ctx.lineWidth = s * 0.28;
      ctx.stroke();
      break;
    case 'tri':
      for (let k = 0; k < 3; k++) {
        const a = -Math.PI / 2 + (k * TAU) / 3;
        k ? ctx.lineTo(s * 1.2 * Math.cos(a), s * 1.2 * Math.sin(a)) : ctx.moveTo(s * 1.2 * Math.cos(a), s * 1.2 * Math.sin(a));
      }
      ctx.closePath();
      ctx.fill();
      break;
    case 'square':
      ctx.rect(-s * 0.8, -s * 0.8, s * 1.6, s * 1.6);
      ctx.lineWidth = s * 0.22;
      ctx.stroke();
      break;
    case 'bar':
      ctx.rect(-s * 1.8, -s * 0.16, s * 3.6, s * 0.32);
      ctx.fill();
      break;
    default:
      for (let k = 0; k < 3; k++) {
        ctx.moveTo(s * (k - 1) * 0.9 + s * 0.22, 0);
        ctx.arc(s * (k - 1) * 0.9, 0, s * 0.22, 0, TAU);
      }
      ctx.fill();
  }
}

export default {
  id: 'kaleidoscope',
  title: 'Kaleidoscope',
  description: 'Formas geométricas escorrendo do centro, espelhadas em N fatias que giram devagar como um caleidoscópio.',
  category: 'formas',
  tags: ['padrão', 'forma', 'loop', 'fundo'],
  duration: 10,

  params: {
    sectors: { type: 'range', label: 'Fatias', min: 4, max: 24, step: 2, default: 12 },
    count: { type: 'range', label: 'Formas', min: 6, max: 60, step: 1, default: 24 },
    size: { type: 'range', label: 'Tamanho', min: 0.3, max: 2, step: 0.05, default: 1 },
    c1: { type: 'color', label: 'Cor 1', default: '#ff4d6d' },
    c2: { type: 'color', label: 'Cor 2', default: '#ffc857' },
    c3: { type: 'color', label: 'Cor 3', default: '#3ddbd9' },
    ink: { type: 'color', label: 'Linha', default: '#f4f1ea' },
    bg: { type: 'color', label: 'Fundo', default: '#0b0a14' },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 3 },
  },

  setup({ p }) {
    const r = rng(p.seed);
    const items = [];
    for (let i = 0; i < p.count; i++) {
      items.push({
        type: TYPES[Math.floor(r() * TYPES.length)],
        color: Math.floor(r() * 4),
        f0: r(),
        a0: r() * 1.3 - 0.15, // pode atravessar a borda da fatia (o espelho costura)
        size: 0.025 + r() * r() * 0.07,
        speed: r() < 0.7 ? 1 : 2, // voltas radiais por loop (inteiro)
        spin: (r() < 0.5 ? -1 : 1) * (1 + Math.floor(r() * 2)),
        wob: 0.1 + r() * 0.25,
        wph: r(),
        rot0: r() * TAU,
      });
    }
    return { items };
  },

  render(ctx, t, { w, h, p, progress: u, state }) {
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, w, h);

    const m = Math.min(w, h);
    const cx = w / 2;
    const cy = h / 2;
    const Rmax = Math.hypot(w, h) / 2;
    const n = p.sectors;
    const alpha = TAU / n;
    const cols = [p.c1, p.c2, p.c3, p.ink];
    const eps = 0.004;

    // conteúdo da fatia: pré-calculado uma vez por frame
    const live = state.items.map((it) => {
      const f = fract(it.f0 + it.speed * u);
      const r = Rmax * 1.05 * f ** 1.35;
      const a = alpha * (it.a0 + it.wob * Math.sin(TAU * (u + it.wph)));
      const s = m * it.size * p.size * (0.3 + 1.15 * f);
      const vis = smoothstep(0, 0.08, f) * (1 - smoothstep(0.85, 1, f));
      return { it, x: r * Math.cos(a), y: r * Math.sin(a), s, vis, rot: it.rot0 + TAU * it.spin * u };
    });

    // brilho central
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, m * 0.5);
    g.addColorStop(0, rgba(p.c1, 0.22));
    g.addColorStop(1, rgba(p.c1, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(2 * alpha * u);
    ctx.lineJoin = 'round';
    for (let k = 0; k < n; k++) {
      ctx.save();
      ctx.rotate(k * alpha);
      if (k % 2) {
        ctx.rotate(alpha);
        ctx.scale(1, -1);
      }
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, Rmax * 1.1, -eps, alpha + eps);
      ctx.closePath();
      ctx.clip();
      ctx.globalCompositeOperation = 'screen';
      for (const L of live) {
        if (L.vis <= 0) continue;
        const c = cols[L.it.color];
        ctx.globalAlpha = 0.9 * L.vis;
        ctx.fillStyle = c;
        ctx.strokeStyle = c;
        ctx.save();
        ctx.translate(L.x, L.y);
        ctx.rotate(L.rot);
        shape(ctx, L.it.type, L.s);
        ctx.restore();
      }
      ctx.restore();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // vinheta: escurece as bordas para o olho ficar no centro
    const vg = ctx.createRadialGradient(cx, cy, m * 0.3, cx, cy, Rmax);
    vg.addColorStop(0, rgba(p.bg, 0));
    vg.addColorStop(1, rgba(p.bg, 0.85));
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);

    // linhas finas das costuras do espelho + anel central
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(2 * alpha * u);
    ctx.strokeStyle = rgba(p.ink, 0.08);
    ctx.lineWidth = Math.max(0.6, m * 0.001);
    ctx.beginPath();
    for (let k = 0; k < n; k++) {
      ctx.moveTo(0, 0);
      ctx.lineTo(Rmax * Math.cos(k * alpha), Rmax * Math.sin(k * alpha));
    }
    ctx.stroke();
    ctx.strokeStyle = rgba(p.ink, 0.5);
    ctx.lineWidth = m * 0.003;
    ctx.beginPath();
    ctx.arc(0, 0, m * 0.035, 0, TAU);
    ctx.stroke();
    ctx.restore();
  },
};
