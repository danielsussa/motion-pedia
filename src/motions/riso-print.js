import { TAU, rng } from '../lib/anim.js';
import { asset } from '../lib/assets.js';
import { coverRect } from '../lib/image.js';
import { shader } from '../lib/gl.js';

// Risografia: a foto é separada em 2 ou 3 tintas (mínimos quadrados em densidade óptica: -log(cor/papel)
// = Σ aᵢ·(-log tintaᵢ)), cada tinta vira uma retícula de grão (limiar aleatório por célula, como o
// "grain touch" da riso) com manchas de tinta irregular, e as camadas multiplicam sobre o papel.
// O registro de cada camada escorrega um pouco (deriva em cosseno com volta inteira + tremida por passe)
// e o grão é sorteado de novo a cada passe ("boil" de animação impressa). O passe é floor(progress·N),
// com N inteiro, então t=0 e t=duration são o mesmo quadro.
const FRAG = `
uniform sampler2D u_img;
uniform vec4 u_rect;
uniform vec2 u_wh;
uniform vec3 u_paper;
uniform vec3 u_ink1;
uniform vec3 u_ink2;
uniform vec3 u_ink3;
uniform float u_three;
uniform vec2 u_off1;
uniform vec2 u_off2;
uniform vec2 u_off3;
uniform float u_cell;
uniform float u_cellPx;
uniform float u_fine;
uniform float u_grain;
uniform float u_step;
uniform float u_contrast;
uniform float u_density;
uniform float u_mottle;

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
vec3 photo(vec2 pos) {
  vec2 s = pos / u_wh;
  vec2 uv = (s - u_rect.xy) / u_rect.zw;
  vec3 c = texture(u_img, vec2(uv.x, 1.0 - uv.y)).rgb;
  return clamp((c - 0.5) * u_contrast + 0.5, 0.0, 1.0);
}
vec3 dens(vec3 c) { return -log(max(c, vec3(0.06))); }
// quantidade de cada tinta (0..1) para reproduzir a cor c sobre o papel
vec3 separate(vec3 c) {
  vec3 d = max(dens(c) - dens(u_paper), 0.0);
  vec3 k1 = dens(u_ink1), k2 = dens(u_ink2), k3 = dens(u_ink3);
  if (u_three < 0.5) {
    float a11 = dot(k1, k1) + 0.02, a12 = dot(k1, k2), a22 = dot(k2, k2) + 0.02;
    float b1 = dot(k1, d), b2 = dot(k2, d);
    float det = a11 * a22 - a12 * a12;
    vec2 a = vec2(a22 * b1 - a12 * b2, a11 * b2 - a12 * b1) / det;
    return vec3(clamp(a, 0.0, 1.0), 0.0);
  }
  mat3 K = mat3(k1, k2, k3);
  mat3 M = transpose(K) * K + mat3(0.02);
  return clamp(inverse(M) * (transpose(K) * d), 0.0, 1.0);
}
// cobertura da camada li: retícula de pontos girada (função de ponto em cosseno, cobre 0..100%) com a
// borda roída por grão fino, mais falhas de tinta e manchas de carga irregular, como no tambor da riso
float screenCov(vec2 pos, float a, float li, float ang, float m) {
  a = clamp((a - 0.06) / 0.94 * u_density * (1.0 - u_mottle * (m - 0.4)), 0.0, 1.0);
  float c = cos(ang), s = sin(ang);
  vec2 g = mat2(c, -s, s, c) * pos / u_cell;
  float spot = 0.5 - 0.25 * (cos(6.2831853 * g.x) + cos(6.2831853 * g.y));
  vec2 q = floor(pos / u_fine);
  float n = hash(q + vec2(li * 31.7, li * 17.3) + u_step * vec2(13.1, 7.7));
  spot += u_grain * (n - 0.5);
  float fw = fwidth(spot) * 0.8 + 1e-3;
  float cov = 1.0 - smoothstep(a - fw, a + fw, spot);
  // falhas pontuais dentro do sólido
  cov *= step(0.035 * u_grain, hash(q * 1.31 + li * 5.7 + u_step * 3.3));
  // quando a retícula fica menor que ~2 px real (miniaturas), vira tom contínuo
  return mix(cov, a, clamp((2.4 - u_cellPx) / 1.2, 0.0, 1.0));
}
void main() {
  vec2 pos = vec2(gl_FragCoord.x / u_res.x, 1.0 - gl_FragCoord.y / u_res.y) * u_wh;
  vec3 col = u_paper;
  // fibras do papel
  float fib = vnoise(pos / u_fine * vec2(0.12, 0.02)) * 0.5 + hash(floor(pos / u_fine)) * 0.5;
  col *= 1.0 - 0.035 * fib;
  // manchas de carga: dois ruídos por pixel, combinados de jeito diferente em cada camada
  float mA = vnoise(pos / (u_cell * 9.0));
  float mB = vnoise(pos / (u_cell * 2.5) + u_step * 0.37);
  float a1 = separate(photo(pos - u_off1)).x;
  float a2 = separate(photo(pos - u_off2)).y;
  col *= mix(vec3(1.0), u_ink1, screenCov(pos - u_off1, a1, 1.0, 0.2618, 0.65 * mA + 0.35 * mB));
  col *= mix(vec3(1.0), u_ink2, screenCov(pos - u_off2, a2, 2.0, 1.3090, 0.65 * (1.0 - mA) + 0.35 * mB));
  if (u_three > 0.5) {
    float a3 = separate(photo(pos - u_off3)).z;
    col *= mix(vec3(1.0), u_ink3, screenCov(pos - u_off3, a3, 3.0, 0.7854, 0.5 * mA + 0.5 * (1.0 - mB)));
  }
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'riso-print',
  title: 'Riso Print',
  description: 'The photo as a risograph print: two or three inks in grainy halftone, with drifting misregistration and textured paper.',
  category: 'imagem',
  tags: ['loop', 'pattern', 'shader', 'background'],
  duration: 6,
  poster: 1.5,

  params: {
    image: { type: 'image', label: 'Photo', default: '/samples/portrait.jpg' },
    inks: { type: 'select', label: 'Inks', options: ['2 cores', '3 cores'], default: '2 cores' },
    ink1: { type: 'color', label: 'Ink 1', default: '#ff4f9a' },
    ink2: { type: 'color', label: 'Ink 2', default: '#1f5fbf' },
    ink3: { type: 'color', label: 'Ink 3', default: '#ffd400' },
    paper: { type: 'color', label: 'Paper', default: '#f3eee2' },
    misreg: { type: 'range', label: 'Misregistration', min: 0, max: 3, step: 0.05, default: 1 },
    lines: { type: 'range', label: 'Dots (short side)', min: 40, max: 260, step: 1, default: 130 },
    grain: { type: 'range', label: 'Grain', min: 0, max: 1, step: 0.01, default: 0.25 },
    boil: { type: 'range', label: 'Passes per second', min: 0, max: 12, step: 1, default: 6 },
    contrast: { type: 'range', label: 'Contrast', min: 0.6, max: 2.2, step: 0.05, default: 1.2 },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 7 },
    focusY: { type: 'range', label: 'Vertical focus', min: 0, max: 1, step: 0.01, default: 0.34 },
  },

  setup({ p }) {
    // direção base do desalinho e tremidas por passe de cada camada
    const r = rng(p.seed);
    const layers = [0, 1, 2].map(() => {
      const a = r() * TAU;
      return { dx: Math.cos(a), dy: Math.sin(a), ph: r() * TAU, jit: Array.from({ length: 64 }, () => [r() * 2 - 1, r() * 2 - 1]) };
    });
    return { layers };
  },

  render(ctx, t, env) {
    const { w, h, p, px, duration, progress, state } = env;
    const img = asset(p.image);
    if (!img) {
      ctx.fillStyle = p.paper;
      ctx.fillRect(0, 0, w, h);
      return;
    }
    const m = Math.min(w, h);
    const steps = Math.max(1, Math.round(duration * p.boil));
    const step = p.boil > 0 ? Math.floor(((progress % 1) + 1) % 1 * steps) % steps : 0;
    const amp = m * 0.006 * p.misreg;
    const off = state.layers.map((L, i) => {
      const drift = Math.cos(TAU * progress + L.ph);
      const j = p.boil > 0 ? L.jit[step % 64] : [0, 0];
      return [
        amp * (L.dx * (0.6 + 0.4 * drift) + 0.25 * j[0]) * (i === 0 ? 0.6 : 1),
        amp * (L.dy * (0.6 + 0.4 * drift) + 0.25 * j[1]) * (i === 0 ? 0.6 : 1),
      ];
    });
    const z = 1.04 + 0.03 * (0.5 - 0.5 * Math.cos(TAU * progress));
    const rc = coverRect(img, w, h, { zoom: z, fx: 0.5, fy: p.focusY });
    const cell = m / p.lines;
    const fine = m / 900;
    shader(ctx, FRAG, {
      u_img: img,
      u_rect: [rc.x / w, rc.y / h, rc.w / w, rc.h / h],
      u_wh: [w, h],
      u_paper: p.paper,
      u_ink1: p.ink1,
      u_ink2: p.ink2,
      u_ink3: p.ink3,
      u_three: p.inks === '3 cores',
      u_off1: off[0],
      u_off2: off[1],
      u_off3: off[2],
      u_cell: cell,
      u_cellPx: cell * px,
      u_fine: fine,
      u_grain: p.grain,
      u_step: step,
      u_contrast: p.contrast,
      u_density: 0.95,
      u_mottle: 0.35,
    }, env);
  },
};
