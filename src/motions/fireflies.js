import { TAU, rng, hexToRgb } from '../lib/anim.js';
import { createNoise } from '../lib/noise.js';

// Vaga-lumes numa mata escura. A mata (troncos em 3 planos, copa, capim e névoa) é pintada uma vez
// no setup; por frame só os vaga-lumes: caminho por ruído em loop, piscada curta com pausa
// (seno elevado a uma potência alta, frequência inteira) e os mais próximos viram bokeh.

const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

function glowSprite(col, S = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const r = S / 2;
  const hot = mix(col, [255, 255, 240], 0.75);
  const gr = g.createRadialGradient(r, r, 0, r, r, r);
  gr.addColorStop(0, css(hot, 1));
  gr.addColorStop(0.05, css(hot, 0.95));
  gr.addColorStop(0.1, css(col, 0.6));
  gr.addColorStop(0.28, css(col, 0.2));
  gr.addColorStop(0.6, css(col, 0.05));
  gr.addColorStop(1, css(col, 0));
  g.fillStyle = gr;
  g.fillRect(0, 0, S, S);
  return c;
}

function bokehSprite(col, S = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const r = S / 2;
  const gr = g.createRadialGradient(r, r, 0, r, r, r);
  gr.addColorStop(0, css(col, 0.45));
  gr.addColorStop(0.7, css(col, 0.55));
  gr.addColorStop(0.86, css(col, 0.7));
  gr.addColorStop(0.95, css(col, 0.2));
  gr.addColorStop(1, css(col, 0));
  g.fillStyle = gr;
  g.fillRect(0, 0, S, S);
  return c;
}

function paintForest({ w, h, px, p, rand }) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * px));
  c.height = Math.max(1, Math.round(h * px));
  const g = c.getContext('2d');
  g.scale(px, px);
  const m = Math.min(w, h);
  const bg = hexToRgb(p.bg);
  const glow = hexToRgb(p.color);
  const fog = mix(bg, [150, 190, 200], 0.18);

  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, css(mix(bg, [0, 0, 0], 0.35)));
  sky.addColorStop(0.55, css(mix(bg, fog, 0.5)));
  sky.addColorStop(1, css(mix(bg, [0, 0, 0], 0.3)));
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);

  // luar difuso atrás da mata (mesma cor, só alpha)
  const lr = Math.max(w, h) * 0.55;
  const moon = g.createRadialGradient(w * 0.62, h * 0.3, 0, w * 0.62, h * 0.3, lr);
  moon.addColorStop(0, css(fog, 0.35));
  moon.addColorStop(1, css(fog, 0));
  g.fillStyle = moon;
  g.fillRect(0, 0, w, h);

  const ground = h * 0.88;
  // troncos em 3 planos: fundo (claro, fino, enevoado) → frente (escuro, grosso)
  const planes = [
    { n: Math.round(w / m * 9), wid: 0.012, col: mix(bg, fog, 0.75) },
    { n: Math.round(w / m * 6), wid: 0.022, col: mix(bg, fog, 0.35) },
    { n: Math.round(w / m * 3), wid: 0.05, col: mix(bg, [0, 0, 0], 0.55) },
  ];
  planes.forEach((pl, k) => {
    g.fillStyle = css(pl.col);
    for (let i = 0; i < pl.n; i++) {
      const x = ((i + 0.2 + rand() * 0.6) / pl.n) * w;
      const tw = m * pl.wid * (0.7 + rand() * 0.6);
      const lean = (rand() - 0.5) * tw * 1.5;
      const yb = ground + (k - 1) * m * 0.03;
      g.beginPath();
      g.moveTo(x - tw * 0.5 + lean, -10);
      g.lineTo(x + tw * 0.5 + lean, -10);
      g.lineTo(x + tw * 0.62, yb);
      g.quadraticCurveTo(x, yb + tw * 0.4, x - tw * 0.62, yb);
      g.closePath();
      g.fill();
      // galhos
      const nb = Math.floor(rand() * 3);
      g.strokeStyle = css(pl.col);
      g.lineCap = 'round';
      for (let j = 0; j < nb; j++) {
        const by = h * (0.08 + rand() * 0.4);
        const dir = rand() < 0.5 ? -1 : 1;
        const len = m * (0.05 + rand() * 0.08) * (1 + k * 0.5);
        g.lineWidth = tw * 0.2;
        g.beginPath();
        g.moveTo(x + lean * (1 - by / yb), by);
        g.quadraticCurveTo(x + dir * len * 0.6, by - len * 0.15, x + dir * len, by - len * 0.5);
        g.stroke();
      }
    }
    // névoa entre os planos
    if (k < 2) {
      const f = g.createLinearGradient(0, h * 0.35, 0, ground);
      f.addColorStop(0, css(fog, 0));
      f.addColorStop(1, css(fog, 0.22));
      g.fillStyle = f;
      g.fillRect(0, h * 0.35, w, ground - h * 0.35 + m * 0.05);
    }
  });

  // chão e capim: uma camada enevoada atrás e uma escura e alta na frente
  const blade = (x, yb, bh, bw) => {
    const bend = (rand() - 0.5) * bh * 0.7;
    g.moveTo(x - bw, yb);
    g.quadraticCurveTo(x + bend * 0.3, yb - bh * 0.6, x + bend, yb - bh);
    g.quadraticCurveTo(x + bend * 0.3 + bw * 0.6, yb - bh * 0.55, x + bw, yb);
    g.closePath();
  };
  [
    { col: mix(bg, [0, 0, 0], 0.4), yb: ground, hgt: 0.07, n: 220 },
    { col: mix(bg, [0, 0, 0], 0.72), yb: h + 2, hgt: 0.2, n: 260 },
  ].forEach((L, k) => {
    g.fillStyle = css(L.col);
    g.beginPath();
    g.rect(0, k ? h - m * 0.05 : ground, w, h);
    const n = Math.round((w / m) * L.n);
    for (let i = 0; i < n; i++) {
      blade(rand() * w, L.yb, m * L.hgt * (0.25 + Math.pow(rand(), 1.5) * 0.75), m * (0.003 + rand() * 0.004) * (1 + k));
    }
    g.fill();
  });

  // brilho quente muito leve no chão (onde há vaga-lumes)
  const gg = g.createLinearGradient(0, h * 0.5, 0, h);
  gg.addColorStop(0, css(glow, 0));
  gg.addColorStop(1, css(glow, 0.05));
  g.fillStyle = gg;
  g.fillRect(0, h * 0.5, w, h * 0.5);
  return c;
}

export default {
  id: 'fireflies',
  title: 'Fireflies',
  description: 'Vaga-lumes piscando e flutuando numa mata escura, com os mais próximos desfocados em bokeh.',
  category: 'particulas',
  tags: ['partículas', 'loop', 'fundo', 'alpha'],
  duration: 12,

  params: {
    color: { type: 'color', label: 'Luz', default: '#d6f56a' },
    bg: { type: 'color', label: 'Mata', default: '#0b1d1b' },
    count: { type: 'range', label: 'Quantidade', min: 10, max: 160, step: 1, default: 70 },
    size: { type: 'range', label: 'Tamanho', min: 0.4, max: 2, step: 0.01, default: 1 },
    blink: { type: 'range', label: 'Piscadas', min: 1, max: 4, step: 1, default: 2 },
    wander: { type: 'range', label: 'Voo', min: 0, max: 2, step: 0.01, default: 1 },
    bokeh: { type: 'boolean', label: 'Bokeh na frente', default: true },
    transparent: { type: 'boolean', label: 'Fundo transparente', default: false },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 12 },
  },

  setup({ w, h, p, px }) {
    const rand = rng(p.seed);
    const col = hexToRgb(p.color);
    const flies = Array.from({ length: p.count }, (_, i) => {
      const z = Math.pow(rand(), 1.6); // mais vaga-lumes ao fundo
      return {
        z,
        x: rand(),
        y: 0.3 + 0.55 * rand() + z * 0.08,
        f: 1 + Math.floor(rand() * 3), // piscadas por loop (× blink)
        ph: rand(),
        dbl: rand() < 0.3, // piscada dupla
        sp: 0.5 + rand() * 0.8,
        k: i * 3.17,
        base: 0.14 + rand() * 0.2,
      };
    });
    flies.sort((a, b) => a.z - b.z);
    return {
      flies,
      nz: createNoise(p.seed + 5),
      glow: glowSprite(col),
      bokeh: bokehSprite(col),
      forest: p.transparent ? null : paintForest({ w, h, px, p, rand: rng(p.seed + 99) }),
    };
  },

  render(ctx, t, { w, h, p, progress: u, state }) {
    const m = Math.min(w, h);
    if (state.forest) ctx.drawImage(state.forest, 0, 0, w, h);

    const { nz } = state;
    ctx.globalCompositeOperation = 'lighter';
    for (const f of state.flies) {
      const amp = m * (0.05 + 0.12 * f.z) * p.wander;
      const x = f.x * w + nz.loop2(f.k, 0.5, u, f.sp * 2) * amp * 1.6;
      const y = f.y * h + nz.loop2(f.k, 7.5, u, f.sp * 2) * amp;
      // piscada: pulso curto, com pausa longa; às vezes duas seguidas
      const s = (f.f * p.blink * u + f.ph) % 1;
      const pulse = (c) => Math.exp(-(((s - c) / 0.06) ** 2));
      let fl = pulse(0.5);
      if (f.dbl) fl = Math.max(fl, 0.75 * pulse(0.68));
      const a = f.base + (1 - f.base) * fl;
      if (f.z > 0.72 && p.bokeh) {
        // perto da câmera: disco desfocado grande e fraco
        const r = m * (0.022 + 0.035 * (f.z - 0.72) / 0.28) * p.size;
        ctx.globalAlpha = Math.min(1, a * 0.7);
        ctx.drawImage(state.bokeh, x - r, y - r, r * 2, r * 2);
      } else {
        const r = m * (0.035 + 0.075 * f.z) * p.size * (0.8 + 0.4 * fl);
        ctx.globalAlpha = Math.min(1, a * (0.7 + 0.3 * f.z));
        ctx.drawImage(state.glow, x - r, y - r, r * 2, r * 2);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  },
};
