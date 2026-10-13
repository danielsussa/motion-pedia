import { TAU, rng, smoothstep, hexToRgb } from '../lib/anim.js';

// Galáxia espiral. Tudo que é caro (milhares de estrelas, nuvens dos braços, faixas de poeira)
// é pintado uma vez no setup numa textura quadrada; por frame ela só gira (voltas inteiras por loop)
// e é achatada pela inclinação. Núcleo, céu de fundo e estrelas cintilantes ficam fora da textura.

const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

function softSprite(col, S = 64, hard = 0) {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, css(col, 1));
  gr.addColorStop(0.15 + hard * 0.2, css(col, 0.55 + hard * 0.3));
  gr.addColorStop(0.5, css(col, 0.12));
  gr.addColorStop(1, css(col, 0));
  g.fillStyle = gr;
  g.fillRect(0, 0, S, S);
  return c;
}

function gauss(rand) {
  const u = Math.max(1e-6, rand());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * rand());
}

function buildGalaxy(S, p, rand) {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const R = S / 2;
  g.translate(R, R);
  const core = hexToRgb(p.core);
  const arm = hexToRgb(p.arms);
  const acc = hexToRgb(p.accent);
  const nA = p.armCount;
  const armAngle = (a, r) => (a * TAU) / nA + p.twist * 2.3 * Math.log(1 + 6 * r);
  g.globalCompositeOperation = 'lighter';

  // disco difuso: mesma cor variando só o alpha (dois gradientes somados)
  const gd = g.createRadialGradient(0, 0, 0, 0, 0, R);
  gd.addColorStop(0, css(arm, 0.22));
  gd.addColorStop(0.35, css(arm, 0.08));
  gd.addColorStop(1, css(arm, 0));
  g.fillStyle = gd;
  g.fillRect(-R, -R, S, S);
  const gc = g.createRadialGradient(0, 0, 0, 0, 0, R * 0.45);
  gc.addColorStop(0, css(core, 0.5));
  gc.addColorStop(0.3, css(core, 0.25));
  gc.addColorStop(1, css(core, 0));
  g.fillStyle = gc;
  g.fillRect(-R, -R, S, S);

  // nuvens dos braços
  const sArm = softSprite(arm);
  const sCore = softSprite(core);
  const sAcc = softSprite(acc, 32, 0.5);
  for (let i = 0; i < 1100; i++) {
    const a = i % nA;
    const r = 0.06 + 0.9 * Math.pow(rand(), 0.85);
    const th = armAngle(a, r) + gauss(rand) * (0.22 + 0.25 * (1 - r));
    const rr = r * R * (1 + gauss(rand) * 0.04);
    const x = Math.cos(th) * rr;
    const y = Math.sin(th) * rr;
    const sz = R * (0.05 + 0.1 * rand()) * (1.1 - 0.6 * r);
    g.globalAlpha = (0.05 + 0.07 * rand()) * (1 - 0.6 * r) * (0.3 + 0.7 * smoothstep(0.04, 0.3, r));
    g.drawImage(r < 0.22 ? sCore : sArm, x - sz, y - sz, sz * 2, sz * 2);
  }

  // faixas de poeira: na borda de dentro de cada braço, apagando a luz
  g.globalCompositeOperation = 'destination-out';
  const sDust = softSprite([0, 0, 0], 64);
  for (let i = 0; i < 900; i++) {
    const a = i % nA;
    const r = 0.16 + 0.74 * rand();
    const th = armAngle(a, r) - 0.32 + gauss(rand) * 0.07;
    const rr = r * R;
    const sz = R * (0.015 + 0.03 * rand()) * (1.1 - 0.4 * r);
    g.globalAlpha = (0.1 + 0.16 * rand()) * smoothstep(0.14, 0.35, r);
    g.drawImage(sDust, Math.cos(th) * rr - sz, Math.sin(th) * rr - sz, sz * 2, sz * 2);
  }

  // estrelas
  g.globalCompositeOperation = 'lighter';
  const n = Math.round(16000 * p.density);
  const unit = Math.max(1, S / 1400);
  const fade = Math.min(1, 0.25 + S / 1400); // textura pequena (miniatura): cada pixel cobre mais área
  const BUCK = 6;
  const paths = Array.from({ length: BUCK }, () => [new Path2D(), new Path2D()]);
  for (let i = 0; i < n; i++) {
    const kind = rand();
    let r;
    let th;
    if (kind < 0.16) {
      // bojo
      r = Math.abs(gauss(rand)) * 0.09;
      th = rand() * TAU;
    } else if (kind < 0.42) {
      // disco
      r = Math.pow(rand(), 0.7) * 0.98;
      th = rand() * TAU;
    } else {
      r = 0.04 + 0.94 * Math.pow(rand(), 0.9);
      th = armAngle(i % nA, r) + gauss(rand) * (0.12 + 0.2 * (1 - r));
    }
    const x = Math.cos(th) * r * R;
    const y = Math.sin(th) * r * R;
    const b = Math.min(BUCK - 1, Math.floor(smoothstep(0.05, 0.55, r) * BUCK));
    const big = rand() < 0.06;
    const s = unit * (big ? 1.6 : 0.9 + rand() * 0.4);
    paths[b][big ? 1 : 0].rect(x - s / 2, y - s / 2, s, s);
  }
  for (let b = 0; b < BUCK; b++) {
    const col = mix(mix(core, [255, 255, 255], 0.35), mix(arm, [255, 255, 255], 0.45), b / (BUCK - 1));
    g.fillStyle = css(col);
    g.globalAlpha = 0.55 * fade;
    g.fill(paths[b][0]);
    g.globalAlpha = 0.95 * fade;
    g.fill(paths[b][1]);
  }

  // regiões de formação estelar (destaque, com parcimônia) e estrelas jovens brilhantes
  for (let i = 0; i < 55; i++) {
    const a = i % nA;
    const r = 0.25 + 0.65 * rand();
    const th0 = armAngle(a, r) + gauss(rand) * 0.08;
    const k = 2 + Math.floor(rand() * 4);
    for (let j = 0; j < k; j++) {
      const rr = (r + gauss(rand) * 0.012) * R;
      const th = th0 + gauss(rand) * 0.025;
      const sz = R * (0.006 + 0.012 * rand());
      g.globalAlpha = 0.22 + 0.3 * rand();
      g.drawImage(sAcc, Math.cos(th) * rr - sz, Math.sin(th) * rr - sz, sz * 2, sz * 2);
    }
  }
  const sStar = softSprite(mix(arm, [255, 255, 255], 0.7), 32, 1);
  for (let i = 0; i < 160; i++) {
    const r = 0.15 + 0.8 * rand();
    const th = armAngle(i % nA, r) + gauss(rand) * 0.1;
    const sz = R * (0.004 + 0.006 * rand());
    g.globalAlpha = 0.6 + 0.4 * rand();
    g.drawImage(sStar, Math.cos(th) * r * R - sz, Math.sin(th) * r * R - sz, sz * 2, sz * 2);
  }
  g.globalAlpha = 1;
  return c;
}

function buildSky(w, h, px, p, rand) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * px));
  c.height = Math.max(1, Math.round(h * px));
  const g = c.getContext('2d');
  g.scale(px, px);
  g.fillStyle = p.bg;
  g.fillRect(0, 0, w, h);
  const m = Math.min(w, h);
  const arm = hexToRgb(p.arms);
  // brilho difuso muito leve atrás da galáxia
  const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
  gr.addColorStop(0, css(arm, 0.07));
  gr.addColorStop(1, css(arm, 0));
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
  const n = Math.round((w * h) / 1700);
  const paths = [new Path2D(), new Path2D(), new Path2D()];
  for (let i = 0; i < n; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const k = rand() < 0.08 ? 2 : rand() < 0.4 ? 1 : 0;
    const r = m * (0.0006 + k * 0.0004);
    paths[k].moveTo(x + r, y);
    paths[k].arc(x, y, r, 0, TAU);
  }
  g.fillStyle = css(mix(arm, [255, 255, 255], 0.7));
  [0.25, 0.45, 0.8].forEach((a, k) => {
    g.globalAlpha = a;
    g.fill(paths[k]);
  });
  return c;
}

export default {
  id: 'galaxy',
  title: 'Galaxy',
  description: 'Galáxia espiral inclinada girando devagar, com braços de poeira, núcleo brilhante e estrelas cintilando.',
  category: 'fundos',
  tags: ['fundo', 'loop', 'partículas', '3d'],
  duration: 30,

  params: {
    core: { type: 'color', label: 'Núcleo', default: '#ffd29c' },
    arms: { type: 'color', label: 'Braços', default: '#8fb2ff' },
    accent: { type: 'color', label: 'Nebulosas', default: '#ff5c9a' },
    bg: { type: 'color', label: 'Fundo', default: '#04050b' },
    armCount: { type: 'range', label: 'Braços', min: 2, max: 5, step: 1, default: 2 },
    twist: { type: 'range', label: 'Torção', min: 0.4, max: 2, step: 0.01, default: 1 },
    tilt: { type: 'range', label: 'Inclinação', min: 0, max: 0.8, step: 0.01, default: 0.5 },
    density: { type: 'range', label: 'Estrelas', min: 0.3, max: 2, step: 0.01, default: 1 },
    speed: { type: 'range', label: 'Voltas por loop', min: 1, max: 3, step: 1, default: 1 },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 5 },
  },

  setup({ w, h, p, px }) {
    const rand = rng(p.seed);
    const portrait = h > w * 1.05;
    // diâmetro: o eixo maior acompanha o lado maior da tela
    const D = Math.min(Math.max(w, h) * 0.78, Math.min(w, h) * (1.25 - 0.3 * (1 - p.tilt)));
    const S = Math.max(64, Math.min(2048, Math.round(D * px)));
    const tex = buildGalaxy(S, p, rand);
    const sky = buildSky(w, h, px, p, rand);
    const core = hexToRgb(p.core);
    const glow = softSprite(mix(core, [255, 255, 255], 0.3), 128);
    const twinkle = Array.from({ length: 36 }, () => ({
      x: rand(),
      y: rand(),
      s: 0.004 + Math.pow(rand(), 3) * 0.008,
      f: 1 + Math.floor(rand() * 4),
      ph: rand() * TAU,
    }));
    const spark = softSprite([255, 255, 255], 32, 1);
    return { tex, sky, D, glow, twinkle, spark, angle: portrait ? -1.25 : -0.32 };
  },

  render(ctx, t, { w, h, p, progress: u, state }) {
    const m = Math.min(w, h);
    ctx.drawImage(state.sky, 0, 0, w, h);

    // estrelas de fundo cintilando
    ctx.globalCompositeOperation = 'lighter';
    for (const s of state.twinkle) {
      const a = Math.pow(0.5 + 0.5 * Math.sin(TAU * s.f * u + s.ph), 3);
      if (a < 0.02) continue;
      const r = s.s * m * (0.6 + 0.4 * a);
      ctx.globalAlpha = a * 0.9;
      ctx.drawImage(state.spark, s.x * w - r, s.y * h - r, r * 2, r * 2);
    }

    const cx = w / 2;
    const cy = h / 2;
    const incl = 1 - p.tilt * 0.85;
    const R = state.D / 2;
    const spin = -TAU * p.speed * u;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(state.angle);
    ctx.scale(1, incl);
    ctx.save();
    ctx.rotate(spin);
    ctx.globalAlpha = 1;
    ctx.drawImage(state.tex, -R, -R, R * 2, R * 2);
    ctx.restore();

    // núcleo (bojo): simétrico, então não precisa girar; pulsa de leve
    const pulse = 1 + 0.04 * Math.sin(TAU * 2 * u);
    const gR = R * 0.32 * pulse;
    ctx.globalAlpha = 0.5;
    ctx.drawImage(state.glow, -gR, -gR / Math.max(0.35, incl) * 0.75, gR * 2, (gR * 2) / Math.max(0.35, incl) * 0.75);
    const g2 = R * 0.09 * pulse;
    ctx.globalAlpha = 0.65;
    ctx.drawImage(state.glow, -g2, -g2 / incl * 0.8, g2 * 2, (g2 * 2) / incl * 0.8);
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  },
};
