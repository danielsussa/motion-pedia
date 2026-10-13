import { TAU, rng, rgba, mixHex, fract } from '../lib/anim.js';

// Chuva ou neve em loop perfeito. Cada partícula percorre `laps` passagens inteiras por loop; a fase da
// passagem é fract(u·laps + r) e a posição horizontal muda a cada passagem por hash(i, passagem mod laps),
// então t = 0 e t = duração coincidem. Profundidade d ∈ [0,1] (0 = longe): tamanho, velocidade, alpha e,
// na chuva, a altura do chão (gotas de longe batem mais alto, como num plano em perspectiva).
// Desenho agrupado por camada de profundidade — um stroke/fill por camada.

const hash = (a, b) => {
  let x = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263);
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
};

const LAYERS = 4;
const SPLASH = 0.32; // s de respingo depois de tocar o chão

function flakeSprite(color) {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0, rgba(color, 0.9));
  grad.addColorStop(0.35, rgba(color, 0.55));
  grad.addColorStop(1, rgba(color, 0));
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  return c;
}

export default {
  id: 'weather',
  title: 'Weather',
  description: 'Rain splashing on the ground or wind-blown snow, in depth layers with a seamless loop.',
  category: 'particulas',
  tags: ['particles', 'loop', 'background', 'overlay', 'alpha'],
  duration: 8,

  params: {
    mode: { type: 'select', label: 'Weather', options: ['chuva', 'neve'], default: 'chuva' },
    color: { type: 'color', label: 'Color', default: '#cfe0f2' },
    bg: { type: 'color', label: 'Background', default: '#0c1118' },
    transparent: { type: 'boolean', label: 'Transparent background', default: false },
    amount: { type: 'range', label: 'Intensity', min: 0.2, max: 2.5, step: 0.01, default: 1 },
    wind: { type: 'range', label: 'Wind', min: -1, max: 1, step: 0.01, default: 0.25 },
    size: { type: 'range', label: 'Size', min: 0.5, max: 2, step: 0.01, default: 1 },
    ground: { type: 'boolean', label: 'Ground (splashes)', default: true },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 7 },
  },

  setup({ w, h, px, p, duration }) {
    const rand = rng(p.seed);
    const snow = p.mode === 'neve';
    const n = Math.round((snow ? 520 : 420) * p.amount);
    const parts = [];
    for (let i = 0; i < n; i++) {
      const d = Math.pow(rand(), 1.35); // mais partículas longe
      let laps, extra;
      if (snow) {
        laps = d < 0.35 ? 1 : d < 0.75 ? 2 : 3;
        extra = rand() * 0.7; // trajetória mais longa = mais lenta (a partícula espera fora da tela)
      } else {
        const fall = 0.95 - 0.45 * d; // s para cruzar a tela
        laps = Math.max(1, Math.round(duration / (fall + SPLASH) + (rand() - 0.5) * 2));
        extra = 0;
      }
      parts.push({
        d,
        layer: Math.min(LAYERS - 1, Math.floor(d * LAYERS)),
        laps,
        extra,
        r: rand(),
        sw: 1 + Math.floor(rand() * 3),
        swP: rand() * TAU,
        swA: 0.4 + rand() * 0.6,
        seed: i * 7 + 1,
      });
    }
    // longe → perto (perto por cima)
    parts.sort((a, b) => a.d - b.d);
    const bg = p.transparent ? null : paintBg(w, h, Math.min(1, px || 1), p, snow, !snow && p.ground);
    return { parts, bg, sprite: snow ? flakeSprite(p.color) : null };
  },

  render(ctx, t, { w, h, p, duration, state }) {
    const S = Math.min(w, h);
    const u = t / duration;
    const snow = p.mode === 'neve';
    const groundOn = !snow && p.ground;
    const horizon = h * 0.72;

    if (!p.transparent) ctx.drawImage(state.bg, 0, 0, w, h);

    if (snow) drawSnow(ctx, u, w, h, S, p, state);
    else drawRain(ctx, t, u, w, h, S, p, state, groundOn, horizon, duration);
  },
};

// fundo estático: pintado uma vez no setup (gradientes de tela cheia custam caro por frame no render por software)
function paintBg(w, h, px, p, snow, groundOn) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * px));
  c.height = Math.max(1, Math.round(h * px));
  const ctx = c.getContext('2d');
  ctx.scale(px, px);
  const S = Math.min(w, h);
  const horizon = h * 0.72;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, mixHex(p.bg, '#000000', 0.25));
  g.addColorStop(0.7, p.bg);
  g.addColorStop(1, mixHex(p.bg, p.color, 0.1));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // névoa no horizonte (mesma cor, só alpha)
  const fog = ctx.createLinearGradient(0, horizon - S * 0.35, 0, horizon + S * 0.08);
  fog.addColorStop(0, rgba(p.color, 0));
  fog.addColorStop(0.75, rgba(p.color, snow ? 0.07 : 0.06));
  fog.addColorStop(1, rgba(p.color, 0));
  ctx.fillStyle = fog;
  ctx.fillRect(0, 0, w, h);
  if (groundOn) {
    // chão molhado: faixa um pouco mais clara e um brilho especular difuso
    const gr = ctx.createLinearGradient(0, horizon - S * 0.02, 0, h);
    gr.addColorStop(0, rgba(p.color, 0));
    gr.addColorStop(0.08, rgba(p.color, 0.05));
    gr.addColorStop(1, rgba(p.color, 0.025));
    ctx.fillStyle = gr;
    ctx.fillRect(0, horizon - S * 0.02, w, h - horizon + S * 0.02);
    const sh = ctx.createRadialGradient(w / 2, horizon + (h - horizon) * 0.35, 0, w / 2, horizon + (h - horizon) * 0.35, w * 0.45);
    sh.addColorStop(0, rgba(p.color, 0.06));
    sh.addColorStop(1, rgba(p.color, 0));
    ctx.save();
    ctx.translate(0, horizon + (h - horizon) * 0.35);
    ctx.scale(1, 0.18);
    ctx.translate(0, -(horizon + (h - horizon) * 0.35));
    ctx.fillStyle = sh;
    ctx.fillRect(0, 0, w, h * 6);
    ctx.restore();
  }
  return c;
}

function drawRain(ctx, t, u, w, h, S, p, state, groundOn, horizon, D) {
  const slant = p.wind * 0.45; // dx por dy
  const streaks = Array.from({ length: LAYERS }, () => new Path2D());
  const rings = Array.from({ length: LAYERS }, () => new Path2D());
  const drops = Array.from({ length: LAYERS }, () => new Path2D());
  const m = S * 0.12;
  for (const o of state.parts) {
    const ph = u * o.laps + o.r;
    const k = ((Math.floor(ph) % o.laps) + o.laps) % o.laps;
    const s = fract(ph);
    const T = D / o.laps; // segundos por passagem
    const fallT = groundOn ? Math.max(0.2, T - SPLASH) : T;
    const yg = groundOn ? horizon + (h - horizon) * Math.pow(o.d, 1.4) * 1.08 : h + m;
    const span = Math.abs(slant) * (yg + m);
    // ponto onde toca o chão, espalhado para que a faixa inclinada cubra a tela toda
    const xLand = hash(o.seed, k) * (w + span) - (slant < 0 ? span : 0);
    const e = s * T; // tempo desde o início da passagem
    const len = S * (0.025 + 0.085 * o.d) * p.size;
    const L = o.layer;
    if (e < fallT) {
      const f = e / fallT;
      const y = -m + (yg + m) * f;
      const x = xLand - (yg - y) * slant;
      const nrm = 1 / Math.hypot(slant, 1);
      streaks[L].moveTo(x, y);
      streaks[L].lineTo(x - slant * len * nrm, y - len * nrm);
    } else if (groundOn) {
      const a = (e - fallT) / SPLASH; // 0..1
      const q = 1 - (1 - a) * (1 - a);
      const rx = S * (0.006 + 0.022 * o.d) * p.size * (0.3 + 0.7 * q);
      const ry = rx * (0.18 + 0.12 * o.d);
      if (a < 0.85) {
        rings[L].moveTo(xLand + rx, yg);
        rings[L].ellipse(xLand, yg, rx, ry, 0, 0, TAU);
      }
      // gotículas em parábola
      const v = S * (0.25 + 0.35 * o.d) * p.size;
      const gg = S * 4.2 * p.size;
      const tt = a * SPLASH;
      const dy = v * tt - 0.5 * gg * tt * tt;
      if (dy > 0) {
        const r = S * (0.0008 + 0.0016 * o.d) * p.size;
        for (let j = 0; j < 3; j++) {
          const dir = (j - 1) * 0.9 + (hash(o.seed + j, k) - 0.5) * 0.6 + slant * 0.6;
          const x = xLand + dir * v * 0.45 * tt;
          const yy = yg - dy * (0.7 + 0.3 * (j === 1));
          drops[L].moveTo(x + r, yy);
          drops[L].arc(x, yy, r, 0, TAU);
        }
      }
    }
  }
  ctx.lineCap = 'round';
  ctx.strokeStyle = p.color;
  ctx.fillStyle = p.color;
  for (let L = 0; L < LAYERS; L++) {
    const d = (L + 0.5) / LAYERS;
    ctx.globalAlpha = 0.18 + 0.5 * d;
    ctx.lineWidth = S * (0.0011 + 0.0026 * d) * p.size;
    ctx.stroke(streaks[L]);
    ctx.globalAlpha = 0.12 + 0.4 * d;
    ctx.lineWidth = S * (0.0008 + 0.0014 * d) * p.size;
    ctx.stroke(rings[L]);
    ctx.globalAlpha = 0.3 + 0.5 * d;
    ctx.fill(drops[L]);
  }
  ctx.globalAlpha = 1;
}

function drawSnow(ctx, u, w, h, S, p, state) {
  const m = S * 0.06;
  const dots = Array.from({ length: LAYERS }, () => new Path2D());
  const near = [];
  const W = w + 2 * m;
  for (const o of state.parts) {
    const ph = u * o.laps + o.r;
    const k = ((Math.floor(ph) % o.laps) + o.laps) % o.laps;
    const s = fract(ph);
    const span = (h + 2 * m) * (1 + o.extra);
    const y = -m + span * s;
    if (y > h + m) continue;
    const sp = 0.35 + 0.65 * o.d; // perto anda mais (paralaxe)
    const drift = p.wind * S * 0.9 * sp * (span / (h + 2 * m)) * s;
    const sway = Math.sin(TAU * o.sw * (u * o.laps) + o.swP + k) * S * 0.035 * o.swA * sp;
    const x = ((((hash(o.seed, k) * W + drift + sway) % W) + W) % W) - m;
    const r = S * (0.0016 + 0.0062 * Math.pow(o.d, 1.6)) * p.size;
    if (o.d > 0.8) near.push(x, y, r * (1 + 1.6 * o.extra * (o.d - 0.8) * 5));
    else {
      const P = dots[o.layer];
      P.moveTo(x + r, y);
      P.arc(x, y, r, 0, TAU);
    }
  }
  ctx.fillStyle = p.color;
  for (let L = 0; L < LAYERS; L++) {
    ctx.globalAlpha = 0.3 + 0.6 * ((L + 0.5) / LAYERS);
    ctx.fill(dots[L]);
  }
  // flocos bem perto: desfocados (sprite), maiores
  ctx.globalAlpha = 0.85;
  for (let i = 0; i < near.length; i += 3) {
    const R = near[i + 2] * 2.6;
    ctx.drawImage(state.sprite, near[i] - R, near[i + 1] - R, R * 2, R * 2);
  }
  ctx.globalAlpha = 1;
}
