import { clamp, rng, ease, seg } from '../lib/anim.js';
import { shader } from '../lib/gl.js';

// Reação-difusão de Gray-Scott, simulada na CPU numa grade pequena (Float64Array — mais rápido que Float32 no V8 —, toro) e "assada" no
// setup: guardamos o campo V a cada 1/FPS s em Uint8. O render interpola dois quadros, sobe a grade
// como textura (filtro linear) e o shader faz o limiar com fwidth → bordas nítidas em qualquer escala.
// Loop: cresce até ~GROW s; no fim o limiar sobe e o padrão erode até sobrar só as sementes de t=0.

const FPS = 15;
const GROW = 10.6; // segundos simulados (o resto da duração é a erosão)

// f (alimentação) e k (remoção) clássicos; `iters` = passos totais de simulação até GROW.
const PRESETS = {
// `seeds` multiplica o parâmetro Sementes (os pontos se dividem devagar: começam com mais).
  coral: { f: 0.0545, k: 0.062, iters: 3400, seeds: 1.8 },
  labirinto: { f: 0.029, k: 0.057, iters: 1500, seeds: 1 },
  pontos: { f: 0.0367, k: 0.0649, iters: 4200, seeds: 2.5 },
};

const FRAG = `
uniform sampler2D u_field;
uniform vec2 u_grid;
uniform float u_th;
uniform float u_relief;
uniform vec3 u_bg;
uniform vec3 u_c1;
uniform vec3 u_c2;
float V(vec2 uv) { return texture(u_field, uv).r; }
void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  float v = V(uv);
  vec2 e = 1.0 / u_grid;
  float gx = V(uv + vec2(e.x, 0.0)) - V(uv - vec2(e.x, 0.0));
  float gy = V(uv + vec2(0.0, e.y)) - V(uv - vec2(0.0, e.y));
  float aa = max(fwidth(v), 1e-4) * 0.75;
  float m = smoothstep(u_th - aa, u_th + aa, v);
  // miolo (V alto) puxa para a 2ª cor
  float core = smoothstep(u_th + 0.08, u_th + 0.45, v);
  vec3 col = mix(u_c1, u_c2, core);
  // relevo: luz vindo de cima-esquerda sobre o gradiente do campo
  float lit = clamp(0.5 + (gy - gx) * 2.2, 0.0, 1.0);
  col *= mix(1.0, 0.72 + 0.56 * lit, u_relief);
  // sombra suave no fundo, ao redor das formas
  vec3 bg = u_bg * (1.0 - 0.35 * u_relief * smoothstep(0.0, u_th, v));
  col = mix(bg, col, m);
  vec2 q = (gl_FragCoord.xy - 0.5 * u_res) / min(u_res.x, u_res.y);
  col *= 1.0 - 0.3 * smoothstep(0.45, 1.35, length(q));
  outColor = vec4(col, 1.0);
}`;

function simulate(GW, GH, { f, k, iters }, seeds, seed, nFrames) {
  const n = GW * GH;
  let U = new Float64Array(n).fill(1);
  let V = new Float64Array(n);
  let U2 = new Float64Array(n);
  let V2 = new Float64Array(n);
  const r = rng(seed);
  const m = Math.min(GW, GH);
  // sementes: pequenos discos com um pouco de ruído (formas menos "perfeitas")
  // espalhadas numa grade com jitter (cobre a tela por igual, sem aglomerar)
  const sc = Math.max(1, Math.round(Math.sqrt(seeds * GW / GH)));
  const sr = Math.max(1, Math.ceil(seeds / sc));
  const cells = [];
  for (let j = 0; j < sr; j++) for (let i = 0; i < sc; i++) cells.push([i, j]);
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  for (let s = 0; s < seeds; s++) {
    const [ci, cj] = cells[s % cells.length];
    const cx = Math.floor(((ci + 0.2 + 0.6 * r()) / sc) * GW);
    const cy = Math.floor(((cj + 0.2 + 0.6 * r()) / sr) * GH);
    const rad = 1.5 + r() * m * 0.018;
    const R = Math.ceil(rad);
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        if (dx * dx + dy * dy > rad * rad) continue;
        const i = ((cy + dy + GH) % GH) * GW + ((cx + dx + GW) % GW);
        U[i] = 0.5 + r() * 0.1;
        V[i] = 0.25 + r() * 0.1;
      }
    }
  }
  const L = new Int32Array(GW);
  const Rr = new Int32Array(GW);
  for (let x = 0; x < GW; x++) {
    L[x] = (x - 1 + GW) % GW;
    Rr[x] = (x + 1) % GW;
  }
  const frames = [];
  const snap = () => {
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) out[i] = V[i] >= 0.5 ? 255 : V[i] * 510;
    frames.push(out);
  };
  snap();
  let done = 0;
  for (let fi = 1; fi < nFrames; fi++) {
    // ritmo: começa mais devagar (as sementes "acordam") e acelera
    const target = Math.round(iters * ((fi / (nFrames - 1)) ** 1.15));
    const steps = Math.max(0, target - done);
    for (let s = 0; s < steps; s++) {
      for (let y = 0; y < GH; y++) {
        const y0 = y * GW;
        const ym = ((y - 1 + GH) % GH) * GW;
        const yp = ((y + 1) % GH) * GW;
        for (let x = 0; x < GW; x++) {
          const i = y0 + x;
          const xm = L[x];
          const xp = Rr[x];
          const u = U[i];
          const v = V[i];
          const lu = 0.2 * (U[y0 + xm] + U[y0 + xp] + U[ym + x] + U[yp + x]) +
            0.05 * (U[ym + xm] + U[ym + xp] + U[yp + xm] + U[yp + xp]) - u;
          const lv = 0.2 * (V[y0 + xm] + V[y0 + xp] + V[ym + x] + V[yp + x]) +
            0.05 * (V[ym + xm] + V[ym + xp] + V[yp + xm] + V[yp + xp]) - v;
          const uvv = u * v * v;
          U2[i] = u + (lu - uvv + f * (1 - u));
          V2[i] = v + (0.5 * lv + uvv - (f + k) * v);
        }
      }
      let tmp = U; U = U2; U2 = tmp;
      tmp = V; V = V2; V2 = tmp;
    }
    done += steps;
    snap();
  }
  return frames;
}

export default {
  id: 'reaction-diffusion',
  title: 'Reaction Diffusion',
  description: 'Padrões de coral, labirinto ou pele de animal crescendo a partir de sementes (Gray-Scott).',
  category: 'fundos',
  tags: ['fundo', 'simulação', 'padrão', 'shader'],
  duration: 12,
  poster: 9.5,

  params: {
    preset: { type: 'select', label: 'Padrão', options: ['coral', 'labirinto', 'pontos'], default: 'coral' },
    bg: { type: 'color', label: 'Fundo', default: '#0f0e12' },
    c1: { type: 'color', label: 'Cor', default: '#ff6b4a' },
    c2: { type: 'color', label: 'Miolo', default: '#ffd9b8' },
    scale: { type: 'range', label: 'Escala', min: 0.6, max: 1.6, step: 0.05, default: 1 },
    seeds: { type: 'range', label: 'Sementes', min: 1, max: 30, step: 1, default: 9 },
    threshold: { type: 'range', label: 'Espessura', min: 0.2, max: 0.6, step: 0.01, default: 0.4 },
    relief: { type: 'range', label: 'Relevo', min: 0, max: 1, step: 0.05, default: 0.6 },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 7 },
  },

  setup({ w, h, p, px }) {
    // ~110 células no lado menor (escala maior → grade menor → manchas maiores)
    // miniaturas (px pequeno) usam grade mais grossa: o setup fica ~2,5× mais barato
    const cell = Math.min(w, h) / ((px < 0.5 ? 70 : 110) / p.scale);
    const GW = Math.max(8, Math.round(w / cell));
    const GH = Math.max(8, Math.round(h / cell));
    const nFrames = Math.ceil(GROW * FPS) + 1;
    const pre = PRESETS[p.preset] ?? PRESETS.coral;
    const frames = simulate(GW, GH, pre, Math.round(p.seeds * pre.seeds), p.seed, nFrames);
    const canvas = document.createElement('canvas');
    canvas.width = GW;
    canvas.height = GH;
    const gctx = canvas.getContext('2d', { willReadFrequently: true });
    return { GW, GH, frames, canvas, gctx, img: gctx.createImageData(GW, GH) };
  },

  render(ctx, t, env) {
    const { p, duration, state } = env;
    const { GW, GH, frames, canvas, gctx, img } = state;
    const fi = clamp(t, 0, GROW) * FPS;
    const a = frames[Math.min(frames.length - 1, Math.floor(fi))];
    const b = frames[Math.min(frames.length - 1, Math.floor(fi) + 1)];
    const k = fi - Math.floor(fi);
    const d = img.data;
    for (let i = 0, j = 0; i < a.length; i++, j += 4) {
      const v = a[i] + (b[i] - a[i]) * k;
      d[j] = d[j + 1] = d[j + 2] = v;
      d[j + 3] = 255;
    }
    gctx.putImageData(img, 0, 0);
    // fim do loop: o limiar sobe e as formas afinam até sumir; começo: as sementes surgem
    const out = ease.inCubic(seg(t, GROW, duration));
    const inn = 1 - ease.outCubic(seg(t, 0, 0.6));
    const th = p.threshold + (1 - p.threshold) * Math.max(out, inn * 0.9);
    shader(ctx, FRAG, {
      u_field: canvas,
      u_grid: [GW, GH],
      u_th: th,
      u_relief: p.relief,
      u_bg: p.bg,
      u_c1: p.c1,
      u_c2: p.c2,
    }, env);
  },
};
