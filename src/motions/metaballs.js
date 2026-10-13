import { TAU, rng } from '../lib/anim.js';
import { shader } from '../lib/gl.js';

// Metaballs: campo Σ r²/d² com limiar; normal vem do gradiente analítico do campo (brilho especular
// de líquido). As bolhas seguem curvas de Lissajous com frequências inteiras → loop perfeito.
const MAX = 14;
const FRAG = `
uniform float u_n;
uniform vec3 u_b[${MAX}];
uniform vec3 u_bg;
uniform vec3 u_ca;
uniform vec3 u_cb;
uniform float u_glow;
uniform float u_gloss;
uniform float u_outline;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  float m = min(u_res.x, u_res.y);
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / m;
  uv.y = -uv.y;
  float f = 0.0;
  vec2 g = vec2(0.0);
  float hue = 0.0;
  for (int i = 0; i < ${MAX}; i++) {
    if (float(i) >= u_n) break;
    vec2 d = uv - u_b[i].xy;
    float r2 = u_b[i].z * u_b[i].z;
    float d2 = dot(d, d) + 1e-5;
    float k = r2 / d2;
    f += k;
    g += -2.0 * k / d2 * d;
    hue += k * float(i) / max(u_n - 1.0, 1.0);
  }
  hue /= f;
  float aa = fwidth(f);
  float inside = smoothstep(1.0 - aa, 1.0 + aa, f);

  // fundo com vinheta + halo das bolhas
  vec3 bg = u_bg * (1.0 - 0.35 * smoothstep(0.3, 1.2, length(uv)));
  vec3 base = mix(u_ca, u_cb, clamp(hue * 0.7 + 0.5 * uv.y + 0.3, 0.0, 1.0));
  vec3 col = bg + base * u_glow * pow(clamp(f, 0.0, 1.0), 3.0) * 0.55;

  // superfície: normal pelo gradiente do campo (comprimida na borda = bolha arredondada)
  // altura h = sqrt(1 - 1/f): 0 na borda, ~1 no miolo (sem "covinhas" no centro de cada bolha)
  float hgt = sqrt(max(1.0 - 1.0 / f, 1e-3));
  vec2 gh = g / (f * f) * 0.5 / hgt;
  vec3 n = normalize(vec3(-gh * 0.045, 1.0));
  vec3 L = normalize(vec3(-0.5, -0.7, 0.9));
  float diff = clamp(dot(n, L), 0.0, 1.0);
  float spec = pow(clamp(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0, 1.0), 40.0);
  float rim = pow(1.0 - n.z, 1.5);
  vec3 surf = base * (0.35 + 0.75 * diff) + u_cb * rim * 0.6 + vec3(spec) * u_gloss;
  if (u_outline > 0.5) {
    // modo contorno: só as linhas de nível do campo
    // níveis em escala log (espaçamento uniforme na tela); o nível f=1 é a borda das bolhas
    float L = log2(f) * 3.0;
    float lv = abs(fract(L + 0.5) - 0.5) / max(fwidth(L), 1e-4);
    float line = (1.0 - clamp(lv, 0.0, 1.0)) * smoothstep(-9.0, -5.0, L) * (1.0 - smoothstep(4.0, 7.0, L));
    line *= mix(0.45, 1.0, step(abs(L), 0.5));
    col = bg + base * line + base * inside * 0.12;
  } else {
    col = mix(col, surf, inside);
  }
  col += (hash(gl_FragCoord.xy) - 0.5) * 0.02;
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'metaballs',
  title: 'Metaballs',
  description: 'Bolhas líquidas e brilhantes que se fundem e se separam em loop.',
  category: 'fundos',
  tags: ['fundo', 'loop', 'forma', 'shader'],
  duration: 10,

  params: {
    style: { type: 'select', label: 'Estilo', options: ['líquido', 'contorno'], default: 'líquido' },
    bg: { type: 'color', label: 'Fundo', default: '#07070d' },
    ca: { type: 'color', label: 'Cor A', default: '#ff4d6d' },
    cb: { type: 'color', label: 'Cor B', default: '#7b5cff' },
    count: { type: 'range', label: 'Bolhas', min: 3, max: MAX, step: 1, default: 9 },
    size: { type: 'range', label: 'Tamanho', min: 0.04, max: 0.2, step: 0.005, default: 0.085 },
    spread: { type: 'range', label: 'Espalhamento', min: 0.1, max: 1, step: 0.01, default: 0.85 },
    glow: { type: 'range', label: 'Halo', min: 0, max: 1, step: 0.01, default: 0.5 },
    gloss: { type: 'range', label: 'Brilho', min: 0, max: 1, step: 0.01, default: 0.7 },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 5 },
  },

  setup({ w, h, p }) {
    const rand = rng(p.seed);
    const m = Math.min(w, h);
    const hw = (0.5 * w) / m;
    const hh = (0.5 * h) / m;
    const balls = Array.from({ length: p.count }, () => ({
      fx: 1 + Math.floor(rand() * 2),
      fy: 1 + Math.floor(rand() * 3),
      px: rand() * TAU,
      py: rand() * TAU,
      ax: (0.35 + rand() * 0.65) * hw * p.spread,
      ay: (0.35 + rand() * 0.65) * hh * p.spread,
      r: p.size * (0.6 + rand() * 0.8),
      dir: rand() < 0.5 ? -1 : 1,
    }));
    return { balls };
  },

  render(ctx, t, env) {
    const { p, progress: u, state } = env;
    const a = TAU * u;
    const uniforms = {
      u_n: state.balls.length,
      u_bg: p.bg,
      u_ca: p.ca,
      u_cb: p.cb,
      u_glow: p.glow,
      u_gloss: p.gloss,
      u_outline: p.style === 'contorno',
    };
    state.balls.forEach((b, i) => {
      // raio "respira" levemente (2 ciclos por loop)
      const r = b.r * (1 + 0.12 * Math.sin(2 * a + b.px));
      uniforms[`u_b[${i}]`] = [Math.sin(b.dir * b.fx * a + b.px) * b.ax, Math.cos(b.fy * a + b.py) * b.ay, r];
    });
    shader(ctx, FRAG, uniforms, env);
  },
};
