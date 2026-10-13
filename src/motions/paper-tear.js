import { seg, ease, rng, rgba, smoothstep } from '../lib/anim.js';
import { createNoise } from '../lib/noise.js';

// Fundo de prévia das transições: cena "A" antes do meio, "B" depois.
function preview(ctx, t, { w, h, p, duration }) {
  if (p.transparent) return;
  const isA = t < duration / 2;
  ctx.fillStyle = isA ? p.colorA : p.colorB;
  ctx.fillRect(0, 0, w, h);
  const m = Math.min(w, h);
  ctx.font = `800 ${m * 0.32}px Inter, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = isA ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.14)';
  ctx.fillText(isA ? 'A' : 'B', w / 2, h / 2 + m * 0.02);
}

// Uma borda rasgada ao longo de y: deslocamento base (irregular em várias escalas), contorno da
// fibra branca (mais áspero, com fiapos) e largura da faixa de fibra até a superfície colorida.
function tornEdge(noise, r, { ys, m, rough, off }) {
  const n = ys.length;
  const e = new Float32Array(n);
  const white = new Float32Array(n);
  const fw = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const v = ys[i] / m;
    e[i] =
      m * 0.05 * rough * noise.noise2(v * 1.1, off) +
      m * 0.016 * rough * noise.noise2(v * 4.5, off + 3) +
      m * 0.007 * (0.4 + rough) * noise.noise2(v * 14, off + 7) +
      m * 0.0035 * (r() - 0.5);
    // fiapos: de vez em quando uma fibra escapa bem além da borda
    const whisker = r() < 0.07 ? m * (0.004 + 0.012 * r() ** 2) : 0;
    white[i] = m * 0.0025 * r() + whisker;
    fw[i] = m * (0.006 + 0.007 * (noise.noise2(v * 3, off + 11) + 1) + 0.003 * r());
  }
  return { e, white, fw };
}

export default {
  id: 'paper-tear',
  title: 'Paper Tear',
  description: 'Uma folha de papel com borda rasgada entra cobrindo a cena e depois se rasga ao meio, as metades voando para os lados com fibra branca e sombra.',
  category: 'transicoes',
  tags: ['transição', 'forma', 'alpha'],
  duration: 1.6,
  poster: 0.58,

  params: {
    paper: { type: 'color', label: 'Papel', default: '#ff4d2e' },
    fiber: { type: 'color', label: 'Fibra', default: '#fbf7f0' },
    grain: { type: 'range', label: 'Textura', min: 0, max: 1, step: 0.01, default: 0.5 },
    rough: { type: 'range', label: 'Irregularidade', min: 0, max: 1, step: 0.01, default: 0.55 },
    shadow: { type: 'range', label: 'Sombra', min: 0, max: 1, step: 0.01, default: 0.5 },
    direction: { type: 'select', label: 'Rasgo', options: ['vertical', 'horizontal'], default: 'vertical' },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 4 },
    colorA: { type: 'color', label: 'Prévia A', default: '#1a1c22' },
    colorB: { type: 'color', label: 'Prévia B', default: '#e7e2d8' },
    transparent: { type: 'boolean', label: 'Só as formas (alpha)', default: false },
  },

  setup({ w, h, p }) {
    const vertical = p.direction !== 'horizontal';
    const W = vertical ? w : h;
    const H = vertical ? h : w;
    const m = Math.min(w, h);
    const noise = createNoise(p.seed);
    const r = rng(p.seed * 101 + 9);
    const step = m * 0.008;
    const n = Math.ceil((H * 2) / step) + 1;
    const ys = new Float32Array(n);
    for (let i = 0; i < n; i++) ys[i] = -H * 0.5 + i * step;
    const lead = tornEdge(noise, r, { ys, m, rough: p.rough, off: 1.7 });
    const tearL = tornEdge(noise, r, { ys, m, rough: p.rough, off: 21.3 });
    // a outra metade compartilha a linha do rasgo, mas tem fibra própria
    const tearR = tornEdge(noise, r, { ys, m, rough: p.rough, off: 21.3 });
    tearR.e = tearL.e;

    // Textura de papel (ladrilho sem emenda): fibras curtas e pintinhas com alpha baixo.
    let pattern = null;
    if (p.grain > 0) {
      const T = 360;
      const tile = document.createElement('canvas');
      tile.width = tile.height = T;
      const g = tile.getContext('2d');
      const tr = rng(p.seed * 7 + 3);
      const draw = (col, a, count, len, lw) => {
        g.strokeStyle = rgba(col, a * p.grain);
        g.lineWidth = lw;
        g.beginPath();
        for (let i = 0; i < count; i++) {
          const x = tr() * T;
          const y = tr() * T;
          const ang = tr() * Math.PI;
          const l = len * (0.3 + tr());
          const dx = Math.cos(ang) * l;
          const dy = Math.sin(ang) * l;
          for (const ox of [-T, 0, T])
            for (const oy of [-T, 0, T]) {
              g.moveTo(x + ox, y + oy);
              g.quadraticCurveTo(x + ox + dx * 0.5 + dy * 0.2, y + oy + dy * 0.5 - dx * 0.2, x + ox + dx, y + oy + dy);
            }
        }
        g.stroke();
      };
      draw('#ffffff', 0.16, 140, 14, 1);
      draw('#000000', 0.1, 120, 10, 1);
      draw('#000000', 0.08, 500, 1.2, 1.4);
      draw('#ffffff', 0.12, 400, 1.2, 1.4);
      pattern = g.createPattern(tile, 'repeat');
    }
    return { W, H, vertical, ys, lead, tearL, tearR, pattern };
  },

  render(ctx, t, env) {
    const { w, h, p, duration, state } = env;
    preview(ctx, t, env);
    const { W, H, vertical, ys, lead, tearL, tearR, pattern } = state;
    const m = Math.min(w, h);
    const mid = duration / 2;
    const n = ys.length;
    const sh = p.shadow;

    ctx.save();
    if (!vertical) {
      // referencial local: rasgo sempre "vertical"
      ctx.translate(w, 0);
      ctx.rotate(Math.PI / 2);
    }

    // Peça de papel: do lado `side` (-1: tudo à esquerda da borda; +1: à direita) da borda em x0 + e.
    // fws = quanto da fibra branca aparece (0..1).
    // far: até onde a peça vai além da borda rasgada (o suficiente para nunca mostrar o outro lado)
    const piece = (edge, side, x0, fws, texOff, pass, ov = 0, far = W * 0.95) => {
      const outline = (fn) => {
        ctx.beginPath();
        ctx.moveTo(x0 + side * far, ys[0]);
        for (let i = 0; i < n; i++) ctx.lineTo(x0 + fn(i), ys[i]);
        ctx.lineTo(x0 + side * far, ys[n - 1]);
        ctx.closePath();
      };
      const { e, white, fw } = edge;
      if (pass === 'shadow') {
        // sombra projetada sobre a cena: a peça repetida e deslocada para fora com alpha baixo
        if (sh <= 0) return;
        ctx.fillStyle = `rgba(0,0,0,${0.055 * sh})`;
        for (let k = 1; k <= 6; k++) {
          ctx.save();
          ctx.translate(-side * m * 0.003 * k * (0.4 + sh), m * 0.002 * k * sh);
          outline((i) => e[i] - side * white[i] * fws);
          ctx.fill();
          ctx.restore();
        }
        return;
      }
      // fibra branca (com fiapos) e superfície colorida recuada
      if (fws > 0) {
        ctx.fillStyle = p.fiber;
        outline((i) => e[i] - side * (white[i] * fws + ov));
        ctx.fill();
      }
      ctx.fillStyle = p.paper;
      outline((i) => e[i] + side * (fw[i] * fws - ov));
      ctx.fill();
      if (pattern) {
        pattern.setTransform(new DOMMatrix().translateSelf(texOff, 0));
        ctx.fillStyle = pattern;
        ctx.fill();
      }
    };

    if (t < mid) {
      // Fase 1: a folha entra da direita com a borda rasgada na frente, girando de leve.
      const amp = m * 0.11;
      const e1 = ease.inOutCubic(seg(t, 0, mid * 0.86));
      const x0 = W + amp + m * 0.08 - (W + amp * 2 + m * 0.12) * e1;
      const rot = 0.05 * (1 - e1) ** 2;
      ctx.save();
      ctx.translate(x0, H / 2);
      ctx.rotate(-rot);
      ctx.translate(-x0, -H / 2);
      piece(lead, 1, x0, 1, x0 + amp + m * 0.04, 'shadow', 0, W * 1.25 + m * 0.2);
      piece(lead, 1, x0, 1, x0 + amp + m * 0.04, 'body', 0, W * 1.25 + m * 0.2);
      ctx.restore();
    } else {
      // Fase 2: puxão rápido, o rasgo abre em V a partir do topo e as metades voam para os lados.
      const u = seg(t, mid, duration);
      const tug = ease.outCubic(seg(u, 0, 0.16));
      const fly = ease.inOutCubic(seg(u, 0.1, 1));
      const ang = 0.05 * tug + 0.2 * fly;
      const amp = m * 0.11;
      const dx = m * 0.006 * tug + (W * 0.5 + amp + m * 0.14) * fly;
      const dy = H * 0.06 * fly;
      const fws = smoothstep(0, 0.12, u);
      const ov = m * 0.004 * (1 - smoothstep(0, 0.06, u)); // metades sobrepostas no início: sem fresta
      const x0 = W / 2;
      // As metades giram em torno do pé do rasgo (abre em V a partir do topo) e saem para os lados.
      for (const pass of ['shadow', 'body'])
        for (const side of [-1, 1]) {
          ctx.save();
          ctx.translate(x0 + side * dx, H + dy);
          ctx.rotate(side * ang);
          ctx.translate(-x0, -H);
          piece(side < 0 ? tearL : tearR, side, x0, fws, 0, pass, ov);
          ctx.restore();
        }
    }
    ctx.restore();
  },
};
