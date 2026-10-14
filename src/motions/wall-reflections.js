import { TAU, rng } from '../lib/anim.js';
import { shader, GLSL_NOISE } from '../lib/gl.js';

// Reflexos de sol numa parede clara: manchas de luz com a forma de espelhos (quadriláteros de canto arredondado,
// um pouco tortos) andando devagar, cada uma com um tremor de cáustica por dentro e um halo morno em volta.
// Onde duas se cruzam a luz SOMA (fica mais clara), como espelhos mirando o mesmo ponto.
// As manchas são mais claras que a parede: texto escuro por cima segue legível.
// Loop: cada mancha anda num Lissajous com frequências inteiras de u_ang (t=0 e t=duração dão o mesmo quadro),
// e o tremor caminha num círculo no espaço do ruído.
const MAX = 12;
const f = (x) => (Number.isInteger(x) ? `${x}.0` : `${+x.toFixed(5)}`);

export default {
  id: 'wall-reflections',
  title: 'Wall Reflections',
  description: 'Sunlight bounced by mirrors onto a light wall: soft shimmering patches drift slowly and glow brighter where they overlap. Seamless loop.',
  category: 'fundos',
  tags: ['background', 'loop', 'shader', 'light'],
  duration: 12,
  poster: 4,

  params: {
    wall: { type: 'color', label: 'Wall', default: '#eadcc4' },
    light: { type: 'color', label: 'Light', default: '#fffaf0' },
    tint: { type: 'color', label: 'Warm edge', default: '#ffc77a' },
    count: { type: 'range', label: 'Patches', min: 1, max: MAX, step: 1, default: 7 },
    size: { type: 'range', label: 'Size', min: 0.3, max: 2, step: 0.05, default: 1.15 },
    soft: { type: 'range', label: 'Softness', min: 0.1, max: 1, step: 0.01, default: 0.38 },
    strength: { type: 'range', label: 'Brightness', min: 0, max: 2, step: 0.01, default: 1.3 },
    shimmer: { type: 'range', label: 'Shimmer', min: 0, max: 1, step: 0.01, default: 0.75 },
    drift: { type: 'range', label: 'Drift', min: 0, max: 1, step: 0.01, default: 0.5 },
    center: { type: 'range', label: 'Keep center clear', min: 0, max: 1, step: 0.01, default: 0.4 },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 3 },
    grain: { type: 'range', label: 'Grain', min: 0, max: 0.1, step: 0.005, default: 0.025 },
  },

  setup({ w, h, p }) {
    const r = rng(p.seed);
    const m = Math.min(w, h);
    const P = Array.from({ length: MAX }, (_, i) => {
      // posição base em volta do centro, espalhada por ângulo (a ordem pula de lado para lado: com poucas manchas
      // elas não se juntam num canto) e empurrada para fora pelo `center`
      const a = (i * 0.618 + r() * 0.12) * TAU, rad = 0.18 + r() * 0.32 + p.center * 0.12;
      return {
        c: [w / 2 + Math.cos(a) * rad * w * 1.1, h / 2 + Math.sin(a) * rad * h],
        s: [m * (0.09 + r() * 0.08), m * (0.12 + r() * 0.1)],      // meia largura, meia altura
        rot: (r() - 0.5) * 0.9, skew: (r() - 0.5) * 0.5,
        amp: [m * (0.08 + r() * 0.14), m * (0.08 + r() * 0.14)],
        fr: [1 + Math.floor(r() * 2), 1 + Math.floor(r() * 2)],      // frequências inteiras → loop sem emenda
        ph: [r() * TAU, r() * TAU, r() * TAU],
      };
    });
    const arr = (tipo, fn) => `${tipo}[${MAX}](${P.map(fn).join(',')})`;
    const FRAG = `
uniform float u_ang, u_n, u_size, u_soft, u_str, u_shim, u_drift, u_grain;
uniform vec3 u_wall, u_light, u_tint;
const vec2 SZ = vec2(${f(w)}, ${f(h)});
const vec2 PC[${MAX}] = ${arr('vec2', (q) => `vec2(${f(q.c[0])},${f(q.c[1])})`)};
const vec2 PS[${MAX}] = ${arr('vec2', (q) => `vec2(${f(q.s[0])},${f(q.s[1])})`)};
const vec2 PA[${MAX}] = ${arr('vec2', (q) => `vec2(${f(q.amp[0])},${f(q.amp[1])})`)};
const vec2 PF[${MAX}] = ${arr('vec2', (q) => `vec2(${f(q.fr[0])},${f(q.fr[1])})`)};
const vec3 PP[${MAX}] = ${arr('vec3', (q) => `vec3(${q.ph.map(f).join(',')})`)};
const vec2 PR[${MAX}] = ${arr('vec2', (q) => `vec2(${f(q.rot)},${f(q.skew)})`)};
${GLSL_NOISE}
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
// retângulo de canto arredondado: distância com sinal (< 0 dentro)
float sdBox(vec2 q, vec2 b, float rr) { vec2 d = abs(q) - b + rr; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - rr; }
void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 q = vec2(uv.x, 1.0 - uv.y) * SZ;
  // parede: degradê vertical leve (mais clara em cima, de onde vem a luz) e vinheta suave
  vec3 col = u_wall * mix(1.03, 0.97, uv.y < 0.0 ? 0.0 : 1.0 - uv.y);
  col *= 1.0 - 0.06 * smoothstep(0.45, 0.9, length((q - SZ * 0.5) / SZ.y));
  float luz = 0.0, borda = 0.0;
  vec2 rodando = vec2(cos(u_ang), sin(u_ang)) * 0.6;          // o tremor anda num círculo: loop sem emenda
  for (int i = 0; i < ${MAX}; i++) {
    if (float(i) >= u_n) break;
    vec2 c = PC[i] + u_drift * PA[i] * vec2(sin(u_ang * PF[i].x + PP[i].x), cos(u_ang * PF[i].y + PP[i].y));
    float a = PR[i].x + 0.12 * u_drift * sin(u_ang + PP[i].z);
    vec2 d = q - c;
    d = mat2(cos(a), -sin(a), sin(a), cos(a)) * d;
    d.x += d.y * PR[i].y;                                       // espelho visto de lado: o reflexo sai torto
    vec2 b = PS[i] * u_size;
    float sd = sdBox(d, b, min(b.x, b.y) * 0.18);
    float fall = max(b.x, b.y) * u_soft;
    float m = 1.0 - smoothstep(-fall * 0.5, fall, sd);           // a mancha, de borda macia
    float halo = exp(-max(sd, 0.0) / (fall * 2.2)) * 0.25;       // luz espalhada em volta
    float sh = snoise(vec3(d / max(b.x, b.y) * 1.6 + rodando + float(i) * 7.3, float(i))) * 0.5 + 0.5;
    m *= 1.0 - u_shim * 0.35 * sh;
    luz += m + halo * (1.0 - m);
    borda += m * smoothstep(-fall * 0.6, 0.0, sd);              // anel morno perto da borda da mancha
  }
  // a luz soma, mas satura com suavidade (duas manchas juntas ficam mais claras, nunca estouram)
  float L = 1.0 - exp(-luz * u_str * 0.9);
  col = mix(col, u_light, L);
  col = mix(col, col * u_tint * 1.05, clamp(borda, 0.0, 1.0) * 0.35);
  col += (hash12(gl_FragCoord.xy) - 0.5) * u_grain;
  outColor = vec4(col, 1.0);
}`;
    return { FRAG };
  },

  render(ctx, t, env) {
    const { p, progress, state } = env;
    shader(ctx, state.FRAG, {
      u_ang: TAU * progress, u_n: p.count, u_size: p.size, u_soft: p.soft, u_str: p.strength,
      u_shim: p.shimmer, u_drift: p.drift, u_grain: p.grain, u_wall: p.wall, u_light: p.light, u_tint: p.tint,
    }, env);
  },
};
