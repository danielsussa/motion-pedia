import { TAU, rng, mixHex, smoothstep, clamp, fract } from '../lib/anim.js';

// Confete em fórmula fechada: cada papel tem lançamento, arrasto linear (exponencial) e velocidade terminal.
//   x(τ) = x0 + vx·E(τ) + balanço,   y(τ) = y0 + vy·E(τ) + vt·(τ − E(τ)),   E(τ) = (1 − e^{−kτ}) / k
// Nada é acumulado: render(t) é puro. Desenho agrupado por cor e face (frente/verso) — um fill() por lote.

const SHAPES = ['rect', 'rect', 'rect', 'rect', 'dot', 'dot', 'strip'];

export default {
  id: 'confetti',
  title: 'Confetti Burst',
  description: 'A confetti burst with drag, gravity and paper spinning in 3D; also as side cannons or a looping shower.',
  category: 'particulas',
  tags: ['particles', 'intro', 'alpha'],
  duration: 5,
  poster: 0.9,

  params: {
    mode: { type: 'select', label: 'Mode', options: ['explosão', 'canhões', 'chuva'], default: 'explosão' },
    c1: { type: 'color', label: 'Color 1', default: '#ff5233' },
    c2: { type: 'color', label: 'Color 2', default: '#ffc93c' },
    c3: { type: 'color', label: 'Color 3', default: '#3b7bff' },
    c4: { type: 'color', label: 'Color 4', default: '#f4f1ea' },
    bg: { type: 'color', label: 'Background', default: '#111116' },
    transparent: { type: 'boolean', label: 'Transparent background', default: false },
    count: { type: 'range', label: 'Count', min: 60, max: 700, step: 10, default: 320 },
    size: { type: 'range', label: 'Size', min: 0.4, max: 2, step: 0.01, default: 1 },
    power: { type: 'range', label: 'Strength', min: 0.4, max: 1.8, step: 0.01, default: 1 },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 3 },
  },

  setup({ p }) {
    const rand = rng(p.seed);
    const R = (a, b) => a + (b - a) * rand();
    const parts = [];
    for (let i = 0; i < p.count; i++) {
      const o = {
        color: i % 4,
        shape: SHAPES[Math.floor(rand() * SHAPES.length)],
        a: R(0.6, 1.25), // dimensões relativas
        b: R(0.4, 0.7),
        k: R(2.2, 3.8), // arrasto
        depth: R(0.6, 1.3),
        vt: R(0.12, 0.26), // velocidade terminal (S/s)
        rot0: rand() * TAU,
        rotV: R(-6, 6),
        flip0: rand() * TAU,
        flipV: R(5, 14) * (rand() < 0.5 ? -1 : 1),
        swayA: R(0.008, 0.03),
        swayF: R(2.5, 5.5),
        swayP: rand() * TAU,
        // sorteios brutos — o modo decide como usar
        r1: rand(), r2: rand(), r3: rand(), r4: rand(),
      };
      parts.push(o);
    }
    return { parts };
  },

  render(ctx, t, { w, h, p, duration, state }) {
    if (!p.transparent) {
      const g = ctx.createRadialGradient(w / 2, h * 0.45, 0, w / 2, h * 0.45, Math.hypot(w, h) * 0.6);
      g.addColorStop(0, mixHex(p.bg, '#ffffff', 0.06));
      g.addColorStop(1, p.bg);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    const S = Math.min(w, h);
    const unit = S * 0.0125 * p.size;
    const cols = [p.c1, p.c2, p.c3, p.c4];
    // lote [cor][face]: face 0 = frente, 1 = verso (mais escuro)
    const tones = cols.map((c) => [c, mixHex(c, '#000000', 0.32)]);
    const paths = cols.map(() => [new Path2D(), new Path2D()]);
    const strips = cols.map(() => [new Path2D(), new Path2D()]);
    const fadeOut = 1 - smoothstep(duration - 0.7, duration - 0.05, t);
    const rain = p.mode === 'chuva';

    for (const o of state.parts) {
      let x, y, tau, alpha = 1, grow = 1;
      if (rain) {
        // loop perfeito: cada papel cai 1 ou 2 vezes por ciclo, em linha reta + balanço
        const laps = o.r4 < 0.6 ? 1 : 2;
        const m = S * 0.08;
        const ph = fract((t / duration) * laps + o.r1);
        y = -m + ph * (h + 2 * m);
        x = o.r2 * w + Math.sin(TAU * laps * (t / duration) * 2 + o.swayP) * o.swayA * S * 2.2;
        tau = t + o.r3 * 10;
      } else {
        let x0, y0, vx, vy, t0;
        const pw = p.power;
        if (p.mode === 'canhões') {
          const left = o.r4 < 0.5;
          t0 = 0.12 + o.r3 * o.r3 * 0.45 + (left ? 0 : 0.04);
          x0 = left ? -S * 0.02 : w + S * 0.02;
          y0 = h + S * 0.02;
          const ang = (-Math.PI / 2) + (left ? 1 : -1) * (0.22 + o.r1 * 0.5); // inclinado para dentro
          const sp = S * (1.6 + o.r2 * 2.2) * pw * (h / S) ** 0.45;
          vx = Math.cos(ang) * sp;
          vy = Math.sin(ang) * sp;
        } else {
          t0 = 0.12 + o.r3 * 0.06;
          x0 = w / 2;
          y0 = h * 0.56;
          const ang = o.r1 * TAU;
          const sp = S * (0.5 + Math.sqrt(o.r2) * 1.9) * pw;
          vx = Math.cos(ang) * sp * 1.15;
          vy = Math.sin(ang) * sp - S * 0.9 * pw * (0.5 + o.r2 * 0.5); // viés para cima
        }
        tau = t - t0;
        if (tau <= 0) continue;
        const k = o.k;
        const E = (1 - Math.exp(-k * tau)) / k;
        const vt = o.vt * S;
        const swayIn = smoothstep(0.3, 1.4, tau);
        x = x0 + vx * E + Math.sin(o.swayF * tau + o.swayP) * o.swayA * S * swayIn;
        y = y0 + vy * E + vt * (tau - E);
        alpha = fadeOut;
        // nasce pequeno (sai "de dentro" do canhão/estouro)
        grow = smoothstep(0, 0.08, tau);
      }
      if (alpha <= 0.01) continue;
      if (x < -S * 0.1 || x > w + S * 0.1 || y < -S * 0.3 || y > h + S * 0.1) continue;

      const g = grow;
      const rot = o.rot0 + o.rotV * tau;
      const flip = Math.cos(o.flip0 + o.flipV * tau);
      const face = flip >= 0 ? 0 : 1;
      const cr = Math.cos(rot), sr = Math.sin(rot);
      const A = unit * o.depth * o.a * g * alpha; // o fade encolhe (lotes não têm alpha individual)
      const B = unit * o.depth * o.b * g * alpha * Math.max(0.08, Math.abs(flip));

      if (o.shape === 'rect') {
        const P = paths[o.color][face];
        const ax = cr * A, ay = sr * A, bx = -sr * B, by = cr * B;
        P.moveTo(x + ax + bx, y + ay + by);
        P.lineTo(x - ax + bx, y - ay + by);
        P.lineTo(x - ax - bx, y - ay - by);
        P.lineTo(x + ax - bx, y + ay - by);
        P.closePath();
      } else if (o.shape === 'dot') {
        const P = paths[o.color][face];
        const rx = A * 0.62, ry = Math.max(0.5, A * 0.62 * Math.max(0.1, Math.abs(flip)));
        P.moveTo(x + cr * rx, y + sr * rx);
        P.ellipse(x, y, rx, ry, rot, 0, TAU);
      } else {
        // tira longa ondulada (serpentina curta): curva de 3 pontos
        const P = strips[o.color][face];
        const L = A * 2.6;
        const bend = Math.sin(o.flip0 + o.flipV * 0.5 * tau) * L * 0.55;
        P.moveTo(x - cr * L - sr * bend * 0.3, y - sr * L + cr * bend * 0.3);
        P.quadraticCurveTo(x + sr * bend, y - cr * bend, x + cr * L - sr * bend * 0.3, y + sr * L + cr * bend * 0.3);
      }
    }

    ctx.lineCap = 'round';
    ctx.lineWidth = unit * 0.55;
    for (let c = 0; c < 4; c++) {
      for (let f = 0; f < 2; f++) {
        ctx.fillStyle = tones[c][f];
        ctx.fill(paths[c][f]);
        ctx.strokeStyle = tones[c][f];
        ctx.stroke(strips[c][f]);
      }
    }
  },
};
