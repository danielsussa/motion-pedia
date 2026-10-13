import { TAU, rng, rgba, hexToRgb, fract, clamp, smoothstep } from '../lib/anim.js';
import { createNoise } from '../lib/noise.js';

// Fumaça com sprites macios. No setup: 3 "puffs" com textura de ruído, já tingidos com a cor.
// Cada partícula i tem fase φ e vive L = duração/GEN segundos: idade = fract(t/L + φ). A cada ciclo
// (geração) ela sorteia outra trajetória, e como duração/L é inteiro, t = duração fecha o loop exato.
// O movimento é função da idade: sobe desacelerando, cresce, esmaece e é arrastada por um campo de ruído
// compartilhado (o mesmo para todas na mesma altura → a coluna balança junta) + um meandro individual.

const GEN = 2; // gerações por loop
const SPR = 128; // px do sprite

function makeSprite(noise, color, k) {
  const c = document.createElement('canvas');
  c.width = c.height = SPR;
  const g = c.getContext('2d');
  const img = g.createImageData(SPR, SPR);
  const [r, gg, b] = hexToRgb(color);
  const o = k * 17.3;
  for (let y = 0; y < SPR; y++) {
    for (let x = 0; x < SPR; x++) {
      const u = (x + 0.5) / SPR - 0.5, v = (y + 0.5) / SPR - 0.5;
      const d = Math.hypot(u, v) * 2;
      if (d >= 1) continue;
      // borda irregular: o raio efetivo varia com o ângulo e com o ruído
      const n = noise.fbm2(u * 2.4 + o, v * 2.4 - o, 3);
      const fall = 1 - smoothstep(0.15, 1, d + n * 0.35);
      // filamentos: ruído "ridged" dá veios mais densos dentro do puff
      const rid = 1 - Math.abs(noise.fbm2(u * 2.6 + o * 2, v * 2.6 - o, 2));
      const a = fall * fall * (0.3 + 0.4 * clamp(0.5 + n * 1.4) + 0.45 * rid ** 3);
      const i = (y * SPR + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = gg;
      img.data[i + 2] = b;
      img.data[i + 3] = Math.round(clamp(a) * 255);
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

export default {
  id: 'smoke',
  title: 'Smoke',
  description: 'Smoke rising in soft sprites, pushed around by noise, growing and dissipating in a loop.',
  category: 'particulas',
  tags: ['particles', 'background', 'overlay', 'alpha', 'loop'],
  duration: 10,
  poster: 6,

  params: {
    source: { type: 'select', label: 'Source', options: ['coluna', 'chão'], default: 'coluna' },
    color: { type: 'color', label: 'Smoke', default: '#d8dde6' },
    bg: { type: 'color', label: 'Background', default: '#0b0c10' },
    transparent: { type: 'boolean', label: 'Transparent background', default: false },
    count: { type: 'range', label: 'Particles', min: 30, max: 260, step: 5, default: 130 },
    density: { type: 'range', label: 'Density', min: 0.2, max: 2, step: 0.05, default: 1 },
    size: { type: 'range', label: 'Size', min: 0.3, max: 2, step: 0.05, default: 1 },
    turbulence: { type: 'range', label: 'Turbulence', min: 0, max: 2, step: 0.05, default: 1 },
    wind: { type: 'range', label: 'Wind', min: -1, max: 1, step: 0.05, default: 0.15 },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 7 },
  },

  setup({ w, h, p, px }) {
    const rand = rng(p.seed);
    const noise = createNoise(p.seed);
    const sprites = [0, 1, 2].map((k) => makeSprite(noise, p.color, k + p.seed));
    const N = p.count;
    const parts = [];
    for (let i = 0; i < N; i++) {
      const gens = [];
      for (let g = 0; g < GEN; g++) {
        gens.push({
          x: rand(), // posição na origem (0..1)
          sp: rand(), // sorteio do sprite
          rot: rand() * TAU,
          spin: (rand() - 0.5) * 1.6,
          scale: 0.7 + rand() * 0.6,
          rise: 0.85 + rand() * 0.3,
          nx: rand() * 100, // semente do meandro individual
          alpha: 0.65 + rand() * 0.35,
        });
      }
      parts.push({ phase: (i + rand() * 0.8) / N, gens });
    }
    // a fumaça é macia: desenha num buffer em resolução reduzida e amplia (corta o custo de preenchimento ~6×)
    const buf = document.createElement('canvas');
    const Q = 0.3 * px;
    buf.width = Math.max(1, Math.ceil(w * Q));
    buf.height = Math.max(1, Math.ceil(h * Q));
    return { noise, sprites, parts, order: new Int32Array(N), ages: new Float32Array(N), buf, bctx: buf.getContext('2d'), Q };
  },

  render(ctx, t, { w, h, p, duration, progress, state }) {
    const { noise, sprites, parts, order, ages } = state;
    const S = Math.min(w, h);
    const col = p.source === 'coluna';

    if (!p.transparent) {
      ctx.fillStyle = p.bg;
      ctx.fillRect(0, 0, w, h);
      // brilho difuso perto da origem (mesma cor, só alpha: sem desvio de matiz)
      const gy = col ? h * 0.95 : h * 1.05;
      const g = ctx.createRadialGradient(w / 2, gy, 0, w / 2, gy, Math.max(w, h) * 0.75);
      g.addColorStop(0, rgba(p.color, 0.07));
      g.addColorStop(1, rgba(p.color, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    const L = duration / GEN;
    const N = parts.length;
    for (let i = 0; i < N; i++) {
      order[i] = i;
      ages[i] = fract(t / L + parts[i].phase);
    }
    // mais velhas (maiores, mais apagadas) atrás
    const ord = Array.from(order).sort((a, b) => ages[b] - ages[a]);

    const y0 = col ? h + S * 0.04 : h + S * 0.12;
    const rise = col ? h * 0.95 + S * 0.25 : h * 0.55 + S * 0.2;
    const base = S * 0.16 * p.size * (col ? 1 : 1.25);
    const turb = p.turbulence;
    const { buf, bctx, Q } = state;
    bctx.setTransform(1, 0, 0, 1, 0, 0);
    bctx.clearRect(0, 0, buf.width, buf.height);

    for (const i of ord) {
      const P = parts[i];
      const u = t / L + P.phase;
      const a = ages[i];
      const G = P.gens[((Math.floor(u) % GEN) + GEN) % GEN];
      // subida: rápida no começo, desacelera
      const y = y0 - rise * G.rise * (1 - (1 - a) ** 1.7);
      const yn = (y0 - y) / S;
      // origem
      let x = col ? w / 2 + (G.x - 0.5) * S * 0.05 : w * (-0.1 + 1.2 * G.x);
      // campo compartilhado (loop pela progress) — a coluna inteira ondula
      const shared = noise.loop2(yn * 1.1, col ? 3.3 : G.x * 3, progress, 2);
      x += shared * S * 0.16 * turb * smoothstep(0, 0.5, a);
      // meandro individual, cresce com a idade
      x += noise.noise2(G.nx, a * 2.2) * S * 0.12 * turb * a;
      // vento: desvio que acelera com a altura
      x += p.wind * S * 0.55 * a * a;
      // abre em leque conforme sobe
      if (col) x += (G.x - 0.5) * S * 0.5 * a * a;

      const r = base * G.scale * (0.3 + 1.7 * a ** 0.8);
      const fadeIn = smoothstep(0, col ? 0.06 : 0.15, a);
      const fadeOut = (1 - a) ** 1.4;
      const alpha = clamp(0.2 * p.density * G.alpha * fadeIn * fadeOut, 0, 1);
      if (alpha < 0.003) continue;

      const ang = G.rot + G.spin * a;
      const c = Math.cos(ang) * r, s = Math.sin(ang) * r;
      const lc = (Q * c) / (SPR / 2), ls = (Q * s) / (SPR / 2);
      bctx.globalAlpha = alpha;
      bctx.setTransform(lc, ls, -ls, lc, Q * x, Q * y);
      bctx.drawImage(sprites[Math.floor(G.sp * 3)], -SPR / 2, -SPR / 2);
    }
    bctx.globalAlpha = 1;
    ctx.drawImage(buf, 0, 0, buf.width / Q, buf.height / Q);
  },
};
