import { TAU, clamp, ease, lerp, rng, rgba, mixHex, fract, smoothstep } from '../lib/anim.js';
import { createNoise } from '../lib/noise.js';

// Dente-de-leão ao vento: cabeça esférica de sementes (cada uma = bico + paraquedas de filamentos em
// guarda-chuva 3D, projetado ortográfico) e rajadas que soltam parte delas. Cada semente voadora tem um
// ciclo de exatamente 1 loop: presa → solta numa rajada → voa (vento + sustentação + ruído em função do
// tempo desde a soltura) até sair da tela → volta a brotar no lugar, crescendo. Loop perfeito.
// Filamentos desenhados em lote (um stroke por camada de profundidade).

const GUSTS = 3; // rajadas por loop

export default {
  id: 'dandelion',
  title: 'Dandelion',
  description: 'Dente-de-leão soprado pelo vento: sementes com paraquedas se soltam em rajadas e flutuam para fora da tela.',
  category: 'particulas',
  tags: ['partículas', 'loop', 'alpha', '3d', 'simulação'],
  duration: 12,
  poster: 0.42,

  params: {
    bg: { type: 'color', label: 'Fundo', default: '#132024' },
    accent: { type: 'color', label: 'Luz', default: '#ffc874' },
    fluff: { type: 'color', label: 'Sementes', default: '#f6f1e7' },
    stem: { type: 'color', label: 'Caule', default: '#748a64' },
    count: { type: 'range', label: 'Sementes na cabeça', min: 60, max: 260, step: 1, default: 150 },
    blow: { type: 'range', label: 'Quantas voam', min: 0.1, max: 0.8, step: 0.01, default: 0.42 },
    wind: { type: 'range', label: 'Vento', min: 0.4, max: 1.8, step: 0.01, default: 1 },
    size: { type: 'range', label: 'Tamanho', min: 0.6, max: 1.5, step: 0.01, default: 1 },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 5 },
    transparent: { type: 'boolean', label: 'Fundo transparente', default: false },
  },

  setup({ w, h, px, p }) {
    const rand = rng(p.seed * 17 + 3);
    const n = p.count;
    const seeds = [];
    const ga = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < n; i++) {
      // esfera de Fibonacci (y para baixo na tela, z para o espectador)
      const y = 1 - (2 * (i + 0.5)) / n;
      const rr = Math.sqrt(1 - y * y);
      const th = ga * i;
      const d = [Math.cos(th) * rr, -y, Math.sin(th) * rr];
      // sementes do lado do vento (direita) e de cima soltam mais
      const pBlow = clamp(p.blow * (0.55 + 0.9 * Math.max(0, d[0] + 0.25) - 0.25 * d[1]), 0, 0.95);
      const fly = rand() < pBlow;
      const gust = Math.floor(rand() * GUSTS);
      seeds.push({
        d,
        fly,
        // fração do loop em que solta: perto do pico da rajada
        at: (gust + 0.08 + rand() * 0.22) / GUSTS,
        jitter: 0.9 + rand() * 0.2,
        len: 0.92 + rand() * 0.16,
        rot: rand() * TAU,
        spin: (rand() - 0.5) * 1.2,
        vx: 0.75 + rand() * 0.55,
        vy: 0.5 + rand() * 0.7,
        nx: rand() * 100,
        scale: 0.85 + rand() * 0.35,
      });
    }
    // filamentos do paraquedas: direções no cone (frame local), iguais para todas
    const ring = (k) => Array.from({ length: k }, (_, i) => [Math.cos((TAU * i) / k), Math.sin((TAU * i) / k)]);
    const fil = ring(9); // na cabeça (muitas, pequenas)
    const filFly = ring(15); // voando: paraquedas mais cheio
    const bgCanvas = p.transparent ? null : paintBg(w, h, Math.min(1, px || 1), p);
    const glow = glowSprite(p.fluff);
    return { seeds, fil, filFly, bg: bgCanvas, glow, noise: createNoise(p.seed) };
  },

  render(ctx, t, { w, h, p, duration, progress: u, state }) {
    if (!p.transparent) ctx.drawImage(state.bg, 0, 0, w, h);
    const m = Math.min(w, h);
    const portrait = h > w * 1.1;
    const R = m * 0.155 * p.size; // raio até a ponta dos bicos
    const R0 = R * 0.16; // receptáculo
    const Lf = R * 0.34; // filamento
    const Lb = R * 0.62; // bico das voadoras

    // rajada: soma de bumps periódicos (3 por loop)
    let gust = 0;
    for (let g = 0; g < GUSTS; g++) {
      const x = fract(u - g / GUSTS - 0.06);
      gust += Math.exp(-(((x - 0.12) / 0.09) ** 2)) + Math.exp(-(((x - 1.12) / 0.09) ** 2));
    }
    const sway = Math.sin(TAU * 2 * u) * 0.25 + Math.sin(TAU * 5 * u + 1) * 0.08;

    // caule: base fora da tela embaixo, curva com o vento
    const baseX = portrait ? w * 0.42 : w * 0.3;
    const headX0 = baseX + m * 0.02;
    const headY0 = portrait ? h * 0.56 : h * 0.44;
    const bend = m * (0.012 * sway + 0.035 * gust) * p.wind;
    const hx = headX0 + bend;
    const hy = headY0 + Math.abs(bend) * 0.15;
    const tilt = (bend / m) * 3; // inclinação da cabeça (rad)

    // brilho atrás da cabeça
    const gs = R * 3.4;
    ctx.globalAlpha = 0.5;
    ctx.drawImage(state.glow, hx - gs, hy - gs, gs * 2, gs * 2);
    ctx.globalAlpha = 1;

    ctx.strokeStyle = p.stem;
    ctx.lineCap = 'round';
    ctx.lineWidth = m * 0.009 * p.size;
    ctx.beginPath();
    ctx.moveTo(baseX - m * 0.03, h + m * 0.02);
    ctx.quadraticCurveTo(baseX - m * 0.02, lerp(h, hy, 0.45), hx, hy + R0 * 0.6);
    ctx.stroke();

    const ct = Math.cos(tilt), st = Math.sin(tilt);
    const batches = [new Path2D(), new Path2D(), new Path2D()]; // trás, frente, voando
    const beaks = [new Path2D(), new Path2D(), new Path2D()];
    const bodies = new Path2D();
    const N = state.noise;

    // desenha um paraquedas: ponta T, eixo a (3D unitário), escala s, giro φ
    const chute = (P, B, tx, ty, a, s, phi, beak, lb, fil, curved) => {
      // base ortonormal (u, v) perpendicular a a
      const ux0 = Math.abs(a[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
      let ux = a[1] * ux0[2] - a[2] * ux0[1];
      let uy = a[2] * ux0[0] - a[0] * ux0[2];
      let uz = a[0] * ux0[1] - a[1] * ux0[0];
      const ul = Math.hypot(ux, uy, uz);
      ux /= ul; uy /= ul; uz /= ul;
      const vx = a[1] * uz - a[2] * uy;
      const vy = a[2] * ux - a[0] * uz;
      const cosA = curved ? 0.3 : 0.42, sinA = curved ? 0.95 : 0.91; // abertura do guarda-chuva
      const L = Lf * s;
      const cp = Math.cos(phi), sp = Math.sin(phi);
      for (const [c0, s0] of fil) {
        const c = c0 * cp - s0 * sp, sn = s0 * cp + c0 * sp;
        const ex = cosA * a[0] + sinA * (c * ux + sn * vx);
        const ey = cosA * a[1] + sinA * (c * uy + sn * vy);
        // filamento levemente curvo (pende para trás no eixo)
        P.moveTo(tx, ty);
        if (curved) P.quadraticCurveTo(tx + ex * L * 0.55 + a[0] * L * 0.16, ty + ey * L * 0.55 + a[1] * L * 0.16, tx + ex * L, ty + ey * L);
        else P.lineTo(tx + ex * L, ty + ey * L);
      }
      if (beak) {
        B.moveTo(tx, ty);
        B.lineTo(tx - a[0] * lb, ty - a[1] * lb);
      }
    };

    for (const sd of state.seeds) {
      // direção girada pela inclinação da cabeça (no plano da tela)
      const d = [sd.d[0] * ct - sd.d[1] * st, sd.d[0] * st + sd.d[1] * ct, sd.d[2]];
      let grow = 1;
      let tau = -1;
      if (sd.fly) {
        const x = fract(u - sd.at); // 0 = momento da soltura
        tau = x * duration;
        // volta a brotar no fim do ciclo
        const gx = smoothstep(0.82, 0.99, x);
        if (x > 0.8) {
          tau = -1;
          grow = gx;
        }
      }
      if (tau < 0) {
        if (grow <= 0.01) continue;
        const s = sd.scale * 0.8 * grow;
        const Rl = R0 + (R - R0) * sd.len * lerp(0.4, 1, grow);
        const tx = hx + d[0] * Rl, ty = hy + d[1] * Rl;
        const layer = d[2] < 0 ? 0 : 1;
        chute(batches[layer], beaks[layer], tx, ty, d, s, sd.rot, true, Rl - R0, state.fil, false);
        continue;
      }
      // voando
      const k = ease.inCubic(clamp(tau / 1.2)); // arranque suave
      const T = tau;
      const vX = (portrait ? h : w) * 0.11 * sd.vx * p.wind * (portrait ? 0.55 : 1);
      const vY = (portrait ? h : w) * 0.035 * sd.vy * (portrait ? 1.2 : 1);
      const drift = Math.min(T, 1.2) * k * 0.5 + Math.max(0, T - 1.2);
      const amp = m * 0.07 * smoothstep(0, 2, T);
      const tx0 = hx + d[0] * R * sd.len, ty0 = hy + d[1] * R * sd.len;
      const tx = tx0 + vX * drift + amp * N.noise2(T * 0.22, sd.nx);
      const ty = ty0 - vY * drift + amp * 0.8 * N.noise2(sd.nx, T * 0.25 + 7) - m * 0.03 * Math.sin(T * 1.3 + sd.nx) * smoothstep(0, 2, T);
      if (tx > w + Lf * 2 || ty < -Lf * 2 || tx < -Lf * 3) continue;
      // eixo vai do radial para "para cima", balançando
      const e = ease.outCubic(clamp(tau / 1.4));
      const wob = 0.28 * Math.sin(T * 1.7 + sd.nx) + 0.15 * N.noise2(T * 0.4, sd.nx + 3);
      const up = [Math.sin(wob), -Math.cos(wob), 0.25 * Math.sin(T * 0.9 + sd.nx)];
      let a = [lerp(d[0], up[0], e), lerp(d[1], up[1], e), lerp(d[2], up[2], e)];
      const al = Math.hypot(a[0], a[1], a[2]) || 1;
      a = [a[0] / al, a[1] / al, a[2] / al];
      const s = sd.scale * lerp(0.8, 1, e);
      chute(batches[2], beaks[2], tx, ty, a, s, sd.rot + sd.spin * T, true, Lb * s, state.filFly, true);
      // semente (aquênio) na ponta do bico
      const bx = tx - a[0] * Lb * s, by = ty - a[1] * Lb * s;
      const sl = R * 0.12 * s;
      bodies.moveTo(bx + a[0] * sl * 0.5, by + a[1] * sl * 0.5);
      bodies.lineTo(bx - a[0] * sl, by - a[1] * sl);
    }

    const lw = m * 0.0011 * p.size;
    // trás
    ctx.lineCap = 'butt';
    ctx.strokeStyle = rgba(p.fluff, 0.32);
    ctx.lineWidth = lw;
    ctx.stroke(batches[0]);
    ctx.strokeStyle = rgba(p.fluff, 0.22);
    ctx.lineWidth = lw * 1.1;
    ctx.stroke(beaks[0]);
    // receptáculo
    ctx.fillStyle = mixHex(p.stem, '#000000', 0.25);
    ctx.beginPath();
    ctx.arc(hx, hy, R0, 0, TAU);
    ctx.fill();
    // frente
    ctx.strokeStyle = rgba(p.fluff, 0.5);
    ctx.lineWidth = lw * 1.2;
    ctx.stroke(beaks[1]);
    ctx.strokeStyle = rgba(p.fluff, 0.82);
    ctx.lineWidth = lw;
    ctx.stroke(batches[1]);
    // voando
    ctx.strokeStyle = rgba(p.fluff, 0.7);
    ctx.lineWidth = lw * 1.1;
    ctx.stroke(beaks[2]);
    ctx.strokeStyle = rgba(p.fluff, 0.9);
    ctx.lineWidth = lw;
    ctx.stroke(batches[2]);
    ctx.strokeStyle = mixHex(p.stem, '#3a2a1a', 0.6);
    ctx.lineCap = 'round';
    ctx.lineWidth = lw * 3.2;
    ctx.stroke(bodies);
  },
};

function glowSprite(color) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, rgba(color, 0.35));
  gr.addColorStop(0.35, rgba(color, 0.12));
  gr.addColorStop(1, rgba(color, 0));
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  return c;
}

// fundo estático: degradê escuro + luz quente difusa no canto e alguns bokeh
function paintBg(w, h, px, p) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * px));
  c.height = Math.max(1, Math.round(h * px));
  const ctx = c.getContext('2d');
  ctx.scale(px, px);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, mixHex(p.bg, '#ffffff', 0.04));
  g.addColorStop(1, mixHex(p.bg, '#000000', 0.4));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const m = Math.min(w, h);
  const lx = w * 0.82, ly = h * 0.18;
  const R = Math.hypot(w, h) * 0.75;
  const lg = ctx.createRadialGradient(lx, ly, 0, lx, ly, R);
  lg.addColorStop(0, rgba(p.accent, 0.3));
  lg.addColorStop(0.3, rgba(p.accent, 0.1));
  lg.addColorStop(1, rgba(p.accent, 0));
  ctx.fillStyle = lg;
  ctx.fillRect(0, 0, w, h);
  const rand = rng(11);
  for (let i = 0; i < 14; i++) {
    const x = lx + (rand() - 0.5) * w * 0.7;
    const y = ly + (rand() - 0.3) * h * 0.6;
    const r = m * (0.02 + rand() * 0.05);
    ctx.fillStyle = rgba(p.accent, 0.025 + rand() * 0.035);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }
  return c;
}
