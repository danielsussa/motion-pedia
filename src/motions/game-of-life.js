import { clamp, rng, ease, seg } from '../lib/anim.js';
import { shader } from '../lib/gl.js';

// Jogo da Vida de Conway num toro, "assado" no setup: uma geração por passo, guardando o "calor" de cada
// célula (1 = viva; morta decai por `trail` a cada geração) em Uint8. O render interpola duas gerações,
// sobe a grade como textura pequena e o shader desenha as células (quadrado arredondado), o rastro e o glow.
// Loop: começa vazio, a sopa inicial surge numa onda a partir do centro, roda, e no fim as células se apagam.

const INTRO = 0.9; // s de revelação (a simulação fica parada na geração 0)
const OUTRO = 1.1; // s finais: tudo se apaga

const FRAG = `
uniform sampler2D u_field;
uniform vec2 u_grid;
uniform float u_reveal;
uniform float u_fade;
uniform float u_glow;
uniform float u_gap;
uniform vec3 u_bg;
uniform vec3 u_c;
uniform vec3 u_hot;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float H(vec2 cell) { return texture(u_field, (cell + 0.5) / u_grid).r; }
void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 g = uv * u_grid;
  vec2 cell = floor(g);
  vec2 f = fract(g) - 0.5;
  float h = H(cell);
  // revelação radial com jitter por célula; apagar no fim com limiar aleatório por célula
  float rnd = hash(cell + 7.31);
  vec2 q = (cell + 0.5) / u_grid - 0.5;
  q.x *= u_grid.x / u_grid.y;
  float d = length(q) / (0.5 * length(vec2(u_grid.x / u_grid.y, 1.0)));
  float rev = clamp((u_reveal * 1.25 - d - rnd * 0.25) * 8.0, 0.0, 1.0);
  float fade = clamp((1.0 - u_fade) * 1.6 - rnd * 0.6, 0.0, 1.0);
  float vis = rev * fade;
  h *= vis;

  // glow: campo filtrado (linear) ao redor, 4 amostras na diagonal a ~1,3 célula
  vec2 e = 1.3 / u_grid;
  float gl = texture(u_field, uv + vec2(e.x, e.y)).r + texture(u_field, uv + vec2(-e.x, e.y)).r +
    texture(u_field, uv + vec2(e.x, -e.y)).r + texture(u_field, uv + vec2(-e.x, -e.y)).r;
  gl = gl * 0.15 + texture(u_field, uv).r * 0.4;
  gl *= vis;

  vec3 col = u_bg;
  // grade sutil
  vec2 fe = abs(f);
  float px = 1.0 / (u_res.y / u_grid.y);
  float line = smoothstep(0.5 - px * 1.2, 0.5, max(fe.x, fe.y));
  col = mix(col, col + 0.035, line);
  col += u_c * gl * gl * u_glow * 0.55;

  // célula: quadrado arredondado; vivas maiores, rastro encolhe um pouco
  float alive = smoothstep(0.8, 0.99, h);
  float s = (0.5 - u_gap) * mix(0.82, 1.0, alive);
  float rad = s * 0.35;
  vec2 dq = abs(f) - (s - rad);
  float sd = length(max(dq, 0.0)) + min(max(dq.x, dq.y), 0.0) - rad;
  float m = smoothstep(px, -px, sd);
  vec3 trail = mix(col, u_c, pow(h, 1.4));
  vec3 cc = mix(trail, u_hot, alive);
  col = mix(col, cc, m);

  vec2 vq = uv - 0.5;
  vq.x *= u_res.x / u_res.y;
  col *= 1.0 - 0.35 * smoothstep(0.35, 1.25, length(vq));
  col += (hash(gl_FragCoord.xy) - 0.5) * 0.02;
  outColor = vec4(col, 1.0);
}`;

const cache = new Map();

function simulate(GW, GH, density, trail, seed, gens) {
  const n = GW * GH;
  let A = new Uint8Array(n);
  let B = new Uint8Array(n);
  const heat = new Float32Array(n);
  const r = rng(seed);
  // sopa com densidade variando em manchas grandes (fica menos uniforme que ruído branco)
  const blobs = [];
  // ilhas numa grade com jitter (cobre a tela por igual, sem aglomerar)
  const bc = Math.max(2, Math.round(Math.sqrt(12 * GW / GH)));
  const br = Math.max(2, Math.round(12 / bc));
  for (let j = 0; j < br; j++)
    for (let i = 0; i < bc; i++)
      if (r() < 0.8) blobs.push([((i + 0.2 + 0.6 * r()) / bc) * GW, ((j + 0.2 + 0.6 * r()) / br) * GH, (0.25 + r() * 0.3) * Math.min(GW / bc, GH / br)]);
  for (let y = 0; y < GH; y++) {
    for (let x = 0; x < GW; x++) {
      let k = 0;
      for (const [bx, by, br] of blobs) {
        let dx = Math.abs(x - bx); dx = Math.min(dx, GW - dx);
        let dy = Math.abs(y - by); dy = Math.min(dy, GH - dy);
        k += Math.exp(-(dx * dx + dy * dy) / (br * br));
      }
      // fora das manchas fica quase vazio: a vida se espalha a partir de ilhas
      A[y * GW + x] = r() < density * Math.min(1.5, Math.max(0, k * 2 - 0.35)) ? 1 : 0;
    }
  }
  const frames = [];
  const snap = () => {
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      heat[i] = A[i] ? 1 : heat[i] * trail;
      out[i] = heat[i] * 255;
    }
    frames.push(out);
  };
  snap();
  for (let gi = 1; gi < gens; gi++) {
    for (let y = 0; y < GH; y++) {
      const ym = ((y - 1 + GH) % GH) * GW;
      const y0 = y * GW;
      const yp = ((y + 1) % GH) * GW;
      for (let x = 0; x < GW; x++) {
        const xm = x === 0 ? GW - 1 : x - 1;
        const xp = x === GW - 1 ? 0 : x + 1;
        const c = A[ym + xm] + A[ym + x] + A[ym + xp] + A[y0 + xm] + A[y0 + xp] + A[yp + xm] + A[yp + x] + A[yp + xp];
        B[y0 + x] = c === 3 || (c === 2 && A[y0 + x]) ? 1 : 0;
      }
    }
    const tmp = A; A = B; B = tmp;
    snap();
  }
  return frames;
}

export default {
  id: 'game-of-life',
  title: 'Game of Life',
  description: 'Conway\'s Game of Life full screen: cells are born and die, leaving a glowing trail that fades.',
  category: 'particulas',
  tags: ['simulation', 'pattern', 'background', 'loop', 'shader'],
  duration: 10,
  poster: 5,

  params: {
    bg: { type: 'color', label: 'Background', default: '#0b0c10' },
    color: { type: 'color', label: 'Trail', default: '#ff6a3d' },
    hot: { type: 'color', label: 'Live cell', default: '#ffe9d6' },
    cells: { type: 'range', label: 'Cells (long side)', min: 60, max: 240, step: 10, default: 150 },
    speed: { type: 'range', label: 'Generations/s', min: 4, max: 30, step: 1, default: 12 },
    trail: { type: 'range', label: 'Trail length', min: 0, max: 0.95, step: 0.01, default: 0.82 },
    density: { type: 'range', label: 'Density', min: 0.08, max: 0.5, step: 0.01, default: 0.3 },
    glow: { type: 'range', label: 'Glow', min: 0, max: 2, step: 0.05, default: 1 },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 3 },
  },

  setup({ w, h, p, duration }) {
    const cell = Math.max(w, h) / p.cells;
    const GW = Math.max(8, Math.round(w / cell));
    const GH = Math.max(8, Math.round(h / cell));
    const gens = Math.ceil((duration - INTRO) * p.speed) + 2;
    const key = [GW, GH, p.density, p.trail, p.seed, gens].join('|');
    let frames = cache.get(key);
    if (!frames) {
      frames = simulate(GW, GH, p.density, p.trail, p.seed, gens);
      if (cache.size > 8) cache.delete(cache.keys().next().value);
      cache.set(key, frames);
    }
    const canvas = document.createElement('canvas');
    canvas.width = GW;
    canvas.height = GH;
    const gctx = canvas.getContext('2d', { willReadFrequently: true });
    return { GW, GH, frames, canvas, gctx, img: gctx.createImageData(GW, GH) };
  },

  render(ctx, t, env) {
    const { p, duration, state } = env;
    const { GW, GH, frames, canvas, gctx, img } = state;
    const fi = Math.max(0, t - INTRO) * p.speed;
    const i0 = Math.min(frames.length - 1, Math.floor(fi));
    const a = frames[i0];
    const b = frames[Math.min(frames.length - 1, i0 + 1)];
    // a geração nova entra rápido e assenta (passo com easing, não rampa linear)
    const k = ease.outCubic(clamp((fi - i0) * 1.6));
    const d = img.data;
    for (let i = 0, j = 0; i < a.length; i++, j += 4) {
      const v = a[i] + (b[i] - a[i]) * k;
      d[j] = d[j + 1] = d[j + 2] = v;
      d[j + 3] = 255;
    }
    gctx.putImageData(img, 0, 0);
    shader(ctx, FRAG, {
      u_field: canvas,
      u_grid: [GW, GH],
      u_reveal: ease.outCubic(seg(t, 0, INTRO)),
      u_fade: ease.inOutSine(seg(t, duration - OUTRO, duration - 0.05)),
      u_glow: p.glow,
      u_gap: 0.07,
      u_bg: p.bg,
      u_c: p.color,
      u_hot: p.hot,
    }, env);
  },
};
