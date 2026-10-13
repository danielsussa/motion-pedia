import { TAU, clamp, ease, mixHex, rgba } from '../lib/anim.js';

// Grade de letras e um "ímã" invisível passeando numa curva de Lissajous (frequências inteiras → loop).
// Cada letra é empurrada para longe dele com queda suave, gira para fora e esquenta de cor. A letra
// sente o cursor com um atraso proporcional à distância (a perturbação se espalha como onda), sem
// estado: é só o cursor avaliado num tempo anterior. Letras agrupadas por faixa de cor (um fillStyle
// por faixa), uma única fonte.
const BUCKETS = 7;

export default {
  id: 'magnetic-type',
  title: 'Magnetic Type',
  description: 'A grid of letters parts and closes as an invisible cursor passes, repelling the characters.',
  category: 'tipografia',
  tags: ['typography', 'loop', 'pattern', 'simulation'],
  duration: 10,
  poster: 1.6,

  params: {
    text: { type: 'text', label: 'Grid text', default: 'MAGNETIC TYPE ' },
    cell: { type: 'range', label: 'Cell size', min: 0.03, max: 0.12, step: 0.002, default: 0.056 },
    radius: { type: 'range', label: 'Magnet radius', min: 0.1, max: 0.6, step: 0.01, default: 0.26 },
    force: { type: 'range', label: 'Force', min: 0, max: 2, step: 0.05, default: 1 },
    lag: { type: 'range', label: 'Wave lag', min: 0, max: 1, step: 0.05, default: 0.4 },
    font: { type: 'select', label: 'Font', options: ['mono', 'grotesca', 'serifada'], default: 'mono' },
    cursor: { type: 'boolean', label: 'Show magnet', default: false },
    color: { type: 'color', label: 'Letters', default: '#e9e5dc' },
    accent: { type: 'color', label: 'Accent', default: '#ff4d2e' },
    bg: { type: 'color', label: 'Background', default: '#0d0d10' },
  },

  setup({ w, h, p }) {
    const m = Math.min(w, h);
    const cell = m * p.cell;
    const cols = Math.max(1, Math.floor(w / cell));
    const rows = Math.max(1, Math.floor(h / (cell * 1.15)));
    const cw = w / cols;
    const ch = h / rows;
    const chars = [...(p.text || ' ')];
    const items = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const k = (r * 3 + c) % chars.length; // cada linha desliza 3 caracteres: a frase corre em diagonal
        const glyph = chars[k];
        if (glyph === ' ') continue;
        items.push({ x: (c + 0.5) * cw, y: (r + 0.5) * ch, g: glyph });
      }
    }
    // cores das faixas (texto → destaque)
    const colors = Array.from({ length: BUCKETS }, (_, i) => mixHex(p.color, p.accent, ease.inCubic(i / (BUCKETS - 1))));
    return { items, cell: Math.min(cw, ch), colors, buckets: Array.from({ length: BUCKETS }, () => []) };
  },

  render(ctx, t, { w, h, p, progress, state }) {
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, w, h);
    const { items, cell, colors, buckets } = state;
    const m = Math.min(w, h);
    const R = m * p.radius;

    // Caminho do ímã: Lissajous 1:2 + um pouco de 3 para não parecer mecânico; tudo em voltas inteiras.
    const cur = (ph) => {
      const a = TAU * ph;
      return [
        w / 2 + w * 0.34 * Math.sin(a) + w * 0.04 * Math.sin(3 * a + 1.1),
        h / 2 + h * 0.3 * Math.sin(2 * a + 0.6) + h * 0.05 * Math.cos(3 * a),
      ];
    };
    // "pulso" do ímã: mais forte nos cruzamentos, quase relaxa duas vezes por loop (respiro)
    const pulse = (ph) => 0.55 + 0.45 * ease.inOutSine(0.5 + 0.5 * Math.cos(TAU * 2 * ph));

    const face = p.font === 'grotesca' ? '700 {}px Inter, system-ui, sans-serif'
      : p.font === 'serifada' ? 'italic {}px "Instrument Serif", serif'
      : '600 {}px "JetBrains Mono", monospace';
    const fs = cell * (p.font === 'serifada' ? 1.1 : p.font === 'grotesca' ? 0.78 : 0.9);
    ctx.font = face.replace('{}', fs);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const b of buckets) b.length = 0;
    const lagT = 0.035 * p.lag; // atraso (fração do loop) por "raio" de distância
    const dots = [];
    for (const it of items) {
      const [x0, y0] = cur(progress);
      const d0 = Math.hypot(it.x - x0, it.y - y0) / R;
      const ph = progress - lagT * d0;
      const [cx, cy] = cur(ph);
      let dx = it.x - cx;
      let dy = it.y - cy;
      const r = Math.hypot(dx, dy) || 1e-3;
      const f = Math.exp(-((r / R) ** 2) * 1.6) * pulse(ph) * p.force;
      dx /= r;
      dy /= r;
      // empurrão: forte perto, mas sem ultrapassar o próprio raio (as letras empilham na borda do vazio)
      const push = R * 0.55 * f * (1 - 0.35 * clamp(f));
      const x = it.x + dx * push;
      const y = it.y + dy * push;
      const rot = f * 0.7 * dx; // inclina para fora
      const sc = 1 - 0.35 * clamp(f) + 0.25 * clamp(f) ** 3;
      const bi = Math.min(BUCKETS - 1, Math.floor(clamp(f * 1.15) * BUCKETS));
      buckets[bi].push(x, y, rot, sc, it.g);
      if (f > 0.08) dots.push(it.x, it.y, f);
    }

    // pontinhos na posição de repouso das letras deslocadas (a "marca" do campo)
    if (dots.length) {
      ctx.fillStyle = rgba(p.color, 0.22);
      ctx.beginPath();
      const dr = Math.max(0.6, cell * 0.035);
      for (let i = 0; i < dots.length; i += 3) {
        const rr = dr * clamp(dots[i + 2] * 2);
        ctx.moveTo(dots[i] + rr, dots[i + 1]);
        ctx.arc(dots[i], dots[i + 1], rr, 0, TAU);
      }
      ctx.fill();
    }

    const B = ctx.getTransform();
    for (let bi = 0; bi < BUCKETS; bi++) {
      const b = buckets[bi];
      if (!b.length) continue;
      ctx.fillStyle = colors[bi];
      for (let i = 0; i < b.length; i += 5) {
        const rot = b[i + 2];
        const sc = b[i + 3];
        if (Math.abs(rot) < 0.01 && Math.abs(sc - 1) < 0.01) {
          ctx.setTransform(B);
          ctx.fillText(b[i + 4], b[i], b[i + 1]);
          continue;
        }
        const c = Math.cos(rot) * sc;
        const s = Math.sin(rot) * sc;
        ctx.setTransform(B.a * c + B.c * s, B.b * c + B.d * s, B.c * c - B.a * s, B.d * c - B.b * s,
          B.a * b[i] + B.c * b[i + 1] + B.e, B.b * b[i] + B.d * b[i + 1] + B.f);
        ctx.fillText(b[i + 4], 0, 0);
      }
    }
    ctx.setTransform(B);

    if (p.cursor) {
      const [cx, cy] = cur(progress);
      ctx.strokeStyle = rgba(p.accent, 0.8);
      ctx.lineWidth = Math.max(1, m * 0.002);
      ctx.beginPath();
      ctx.arc(cx, cy, m * 0.012, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = rgba(p.accent, 0.25);
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.45 * pulse(progress), 0, TAU);
      ctx.stroke();
    }
  },
};
