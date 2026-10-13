import { TAU, rng, clamp, smoothstep, hexToRgb } from '../lib/anim.js';
import { createNoise } from '../lib/noise.js';

// Cordilheira em camadas com parallax enquanto o dia vira noite e volta.
// Cada camada tem um perfil periódico (ruído num círculo) e anda um número inteiro de períodos por loop.
// O sol percorre um arco completo por loop (nasce ~85%, meio-dia ~10%, põe ~35%, meia-noite ~60%).

const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const rgb = (hex) => {
  const c = hexToRgb(hex);
  return Array.isArray(c) ? c : [c.r, c.g, c.b];
};
const WHITE = [255, 255, 255];
const N = 720; // amostras por período do perfil

function glowSprite(S = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(255,255,255,0.55)');
  gr.addColorStop(0.25, 'rgba(255,255,255,0.18)');
  gr.addColorStop(0.6, 'rgba(255,255,255,0.05)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, S, S);
  return c;
}

// Lua crescente: disco menos outro disco deslocado (destination-out), pronta para drawImage com alpha.
function moonSprite(tint, S = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const r = S / 2;
  g.fillStyle = css(mix(WHITE, rgb(tint), 0.4));
  g.beginPath();
  g.arc(r, r, r * 0.98, 0, TAU);
  g.fill();
  g.globalCompositeOperation = 'destination-out';
  g.beginPath();
  g.arc(r + r * 0.42, r - r * 0.18, r * 0.92, 0, TAU);
  g.fill();
  return c;
}

export default {
  id: 'parallax-landscape',
  title: 'Parallax Landscape',
  description: 'Layered mountains gliding in parallax as day turns to night: sun, dusk, moon and stars.',
  category: 'fundos',
  tags: ['background', 'loop', 'gradient'],
  duration: 30,
  poster: 9.6,

  params: {
    day: { type: 'color', label: 'Day sky', default: '#7fa9d1' },
    dusk: { type: 'color', label: 'Dusk', default: '#f39a6b' },
    night: { type: 'color', label: 'Night sky', default: '#0a0f24' },
    land: { type: 'color', label: 'Mountains', default: '#1d2a3c' },
    sun: { type: 'color', label: 'Sun', default: '#fff0cf' },
    layers: { type: 'range', label: 'Layers', min: 3, max: 7, step: 1, default: 5 },
    rough: { type: 'range', label: 'Roughness', min: 0.3, max: 1.6, step: 0.01, default: 1 },
    speed: { type: 'range', label: 'Speed', min: 1, max: 3, step: 1, default: 1 },
    stars: { type: 'boolean', label: 'Stars', default: true },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 7 },
  },

  setup({ w, h, p }) {
    const nz = createNoise(p.seed);
    const rand = rng(p.seed * 13 + 1);
    const L = p.layers;
    const layers = [];
    for (let i = 0; i < L; i++) {
      const d = L === 1 ? 1 : i / (L - 1); // 0 = fundo, 1 = frente
      const prof = new Float32Array(N);
      const feat = 1.5 + d * 1.3; // raio do círculo no ruído = quantidade de morros por período
      let lo = Infinity;
      let hi = -Infinity;
      for (let k = 0; k < N; k++) {
        const a = (k / N) * TAU;
        const cx = Math.cos(a);
        const cy = Math.sin(a);
        let v = 0;
        let amp = 1;
        let f = feat;
        for (let o = 0; o < 4; o++) {
          let n = nz.noise3(cx * f + i * 17.3, cy * f - i * 9.1, i * 3.7 + o * 11);
          // fundo: cristas (ruído "ridged"); frente: colinas arredondadas
          if (d < 0.4) n = 1 - Math.abs(n) * 2 + 0.5;
          v += n * amp;
          amp *= d < 0.4 ? 0.4 : 0.34;
          f *= 2.05;
        }
        prof[k] = v;
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
      for (let k = 0; k < N; k++) prof[k] = (prof[k] - lo) / (hi - lo);
      layers.push({ d, prof });
    }

    // Estrelas: 4 grupos de cintilação, cada um um Path2D só.
    const horizon = h * 0.66;
    const groups = Array.from({ length: 4 }, () => new Path2D());
    const big = new Path2D();
    const count = Math.round((w * h) / 2600);
    const m = Math.min(w, h);
    for (let i = 0; i < count; i++) {
      const x = rand() * w;
      const y = Math.pow(rand(), 1.4) * horizon;
      const r = m * (0.0007 + Math.pow(rand(), 6) * 0.0022);
      const g = groups[i % 4];
      g.moveTo(x + r, y);
      g.arc(x, y, r, 0, TAU);
      if (r > m * 0.0019) {
        big.moveTo(x + r * 2.2, y);
        big.arc(x, y, r * 2.2, 0, TAU);
      }
    }
    return { layers, groups, big, glow: glowSprite(), moon: moonSprite(p.sun) };
  },

  render(ctx, t, { w, h, p, progress: u, state }) {
    const m = Math.min(w, h);
    const C = { day: rgb(p.day), dusk: rgb(p.dusk), night: rgb(p.night), land: rgb(p.land), sun: rgb(p.sun) };

    // ---- relógio do céu
    const th = TAU * (u - 0.85);
    const e = Math.sin(th); // elevação do sol (-1..1)
    const day = smoothstep(-0.2, 0.28, e);
    const gold = Math.exp(-(((e - 0.03) / 0.17) ** 2)); // perto do horizonte
    const nightK = 1 - day;

    const dayTop = C.day;
    const dayHor = mix(C.day, WHITE, 0.55);
    const nightTop = C.night;
    const nightHor = mix(C.night, C.day, 0.3);
    let top = mix(nightTop, dayTop, day);
    let hor = mix(nightHor, dayHor, day);
    top = mix(top, mix(mix(C.night, C.day, 0.5), C.dusk, 0.22), gold * 0.6);
    hor = mix(hor, C.dusk, gold * 0.85);

    const horizon = h * 0.66;
    const sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, css(top));
    sky.addColorStop(0.62, css(mix(top, hor, 0.45)));
    sky.addColorStop(1, css(hor));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    // ---- estrelas
    const starA = p.stars ? smoothstep(0.45, 0.95, nightK) : 0;
    if (starA > 0.01) {
      ctx.fillStyle = css(mix(WHITE, C.day, 0.15));
      for (let g = 0; g < 4; g++) {
        ctx.globalAlpha = starA * (0.55 + 0.45 * Math.sin(TAU * (5 + g * 2) * u + g * 1.7));
        ctx.fill(state.groups[g]);
      }
      ctx.globalAlpha = starA * 0.08;
      ctx.fill(state.big);
      // estrela cadente no meio da noite
      const s = clamp((u - 0.565) / 0.022);
      if (s > 0 && s < 1) {
        const x0 = w * 0.62;
        const y0 = horizon * 0.12;
        const dx = -w * 0.22;
        const dy = horizon * 0.2;
        const hx = x0 + dx * s;
        const hy = y0 + dy * s;
        const tl = 0.28;
        const gr = ctx.createLinearGradient(hx, hy, hx - dx * tl, hy - dy * tl);
        gr.addColorStop(0, 'rgba(255,255,255,0.9)');
        gr.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.globalAlpha = starA * Math.sin(Math.PI * s);
        ctx.strokeStyle = gr;
        ctx.lineWidth = m * 0.0022;
        ctx.lineCap = 'butt';
        ctx.beginPath();
        ctx.moveTo(hx, hy);
        ctx.lineTo(hx - dx * tl, hy - dy * tl);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // ---- sol e lua (atrás das montanhas)
    const arcW = w * 0.4;
    const yH = h * 0.43; // onde o sol cruza o horizonte (atrás da camada do fundo)
    const arcH = yH - m * 0.13;
    const bodyR = m * 0.045;
    const sx = w / 2 - Math.cos(th) * arcW;
    const sy = yH - e * arcH;
    const sunCol = mix(C.sun, C.dusk, gold * 0.6);
    if (e > -0.25) {
      ctx.globalCompositeOperation = 'lighter';
      const gR = bodyR * (9 + gold * 6);
      ctx.globalAlpha = 0.35 + 0.4 * gold;
      ctx.drawImage(state.glow, sx - gR, sy - gR, gR * 2, gR * 2);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = css(sunCol);
      ctx.beginPath();
      ctx.arc(sx, sy, bodyR * (1 + gold * 0.15), 0, TAU);
      ctx.fill();
    }
    const me = -e;
    if (me > -0.25) {
      const mx = w / 2 + Math.cos(th) * arcW;
      const my = yH - me * arcH;
      const mr = bodyR * 0.82;
      ctx.globalCompositeOperation = 'lighter';
      const gR = mr * 7;
      const moonA = smoothstep(0.25, 0.85, nightK);
      ctx.globalAlpha = 0.22 * moonA;
      ctx.drawImage(state.glow, mx - gR, my - gR, gR * 2, gR * 2);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = moonA;
      ctx.drawImage(state.moon, mx - mr, my - mr, mr * 2, mr * 2);
      ctx.globalAlpha = 1;
    }

    // ---- montanhas
    const P = Math.max(2 * w, 3 * m); // período do perfil em px
    const landNow = mix(mix(mix(C.land, C.night, 0.5), [0, 0, 0], 0.3), C.land, day);
    const kLaps = [1, 2, 3, 5, 8, 12, 17];
    const L = state.layers.length;
    const step = Math.max(4, w / 180);
    for (let i = 0; i < L; i++) {
      const { d, prof } = state.layers[i];
      const laps = kLaps[i] * p.speed;
      const off = u * laps * P;
      const base = h * (0.53 + 0.34 * d);
      const amp = m * (0.2 - 0.1 * d) * p.rough;
      const col = mix(mix(hor, top, 0.18), landNow, 0.22 + 0.78 * Math.pow(d, 0.9));
      // borda iluminada pelo crepúsculo nas camadas de trás
      const warm = mix(col, C.dusk, gold * 0.12 * (1 - d));
      ctx.fillStyle = css(warm);
      ctx.beginPath();
      ctx.moveTo(-2, h + 2);
      for (let x = -step; x <= w + step; x += step) {
        const f = (((x + off) / P) * N) % N;
        const k0 = Math.floor(f);
        const fr = f - k0;
        const v = prof[k0] + (prof[(k0 + 1) % N] - prof[k0]) * fr;
        ctx.lineTo(x, base - v * amp);
      }
      ctx.lineTo(w + 2, h + 2);
      ctx.closePath();
      ctx.fill();

      // névoa no pé de cada camada (exceto a da frente)
      if (i < L - 1) {
        const y0 = base - amp * 0.15;
        const y1 = base + m * 0.12;
        const hz = ctx.createLinearGradient(0, y0, 0, y1);
        const mist = mix(hor, top, 0.1);
        const a = 0.42 + 0.1 * day;
        hz.addColorStop(0, css(mist, 0));
        hz.addColorStop(1, css(mist, a));
        ctx.fillStyle = hz;
        ctx.fillRect(0, y0, w, h - y0);
      }
    }
  },
};
