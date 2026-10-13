import { TAU } from '../lib/anim.js';
import { shader } from '../lib/gl.js';

// Plasma de demoscene: soma de senos (planos, radial e um "redemoinho") cujas fases andam com
// frequências inteiras de progress → loop perfeito. O valor vira índice numa paleta cíclica de 3 cores
// (A → B → C → A) que também gira um número inteiro de voltas por loop. `bands` posteriza a paleta
// (visual de 8 bits) e `pixel` reduz a resolução como numa tela antiga.
const FRAG = `
uniform float u_ang;
uniform float u_scale;
uniform float u_cycles;
uniform float u_bands;
uniform float u_pixel;
uniform float u_scan;
uniform vec3 u_a;
uniform vec3 u_b;
uniform vec3 u_c;
const float TAU = 6.28318530718;
vec3 pal(float x) {
  x = fract(x) * 3.0;
  // transição suave (smoothstep) entre as três cores, cíclica
  float f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  if (x < 1.0) return mix(u_a, u_b, f);
  if (x < 2.0) return mix(u_b, u_c, f);
  return mix(u_c, u_a, f);
}
void main() {
  float m = min(u_res.x, u_res.y);
  vec2 fc = gl_FragCoord.xy;
  if (u_pixel > 0.5) {
    float cell = max(1.0, m / u_pixel);
    fc = (floor(fc / cell) + 0.5) * cell;
  }
  vec2 uv = (fc - 0.5 * u_res) / m * u_scale;
  float a = u_ang;
  float v = 0.0;
  v += sin(uv.x * 3.1 + a);
  v += sin((uv.y * 2.7 - a * 2.0) + 0.6);
  v += sin((uv.x * 1.9 + uv.y * 2.3) + a + 1.7);
  vec2 c = uv + 0.9 * vec2(sin(a * 1.0 + 0.4), cos(a * 2.0 + 1.1));
  v += sin(length(c) * 4.2 - a * 2.0);
  vec2 d = uv - 0.8 * vec2(cos(a + 2.0), sin(a + 0.3));
  v += sin(length(d) * 5.3 + a + 2.4);
  v = v / 5.0;                                  // ~[-1, 1]
  float x = 1.2 * v + u_cycles * a / TAU;       // ~1,2 voltas da paleta no campo; gira u_cycles voltas por loop
  if (u_bands > 1.5) x = floor(x * u_bands) / u_bands;
  vec3 col = pal(x);
  // brilho leve nas cristas, para dar volume
  col *= 0.82 + 0.28 * smoothstep(-0.2, 0.9, v);
  // scanlines (na resolução real)
  col *= 1.0 - u_scan * 0.35 * step(0.5, fract(gl_FragCoord.y / max(2.0, m / 360.0) * 0.5));
  vec2 q = (gl_FragCoord.xy - 0.5 * u_res) / m;
  col *= 1.0 - 0.35 * smoothstep(0.45, 1.3, length(q));
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'plasma',
  title: 'Plasma',
  description: 'Plasma retrô de demoscene: ondas de seno fundidas, com uma paleta cíclica de três cores girando em loop.',
  category: 'fundos',
  tags: ['fundo', 'loop', 'gradiente', 'shader'],
  duration: 10,

  params: {
    colorA: { type: 'color', label: 'Cor A', default: '#120c2e' },
    colorB: { type: 'color', label: 'Cor B', default: '#ff4f7b' },
    colorC: { type: 'color', label: 'Cor C', default: '#ffc46b' },
    scale: { type: 'range', label: 'Escala', min: 0.4, max: 4, step: 0.05, default: 2.2 },
    cycles: { type: 'range', label: 'Voltas da paleta', min: 0, max: 4, step: 1, default: 1 },
    bands: { type: 'range', label: 'Faixas (0 = suave)', min: 0, max: 24, step: 1, default: 0 },
    pixel: { type: 'range', label: 'Pixels (0 = liso)', min: 0, max: 240, step: 4, default: 0 },
    scanlines: { type: 'range', label: 'Scanlines', min: 0, max: 1, step: 0.01, default: 0.25 },
  },

  render(ctx, t, env) {
    const { p, progress } = env;
    shader(ctx, FRAG, {
      u_ang: TAU * progress,
      u_scale: p.scale,
      u_cycles: p.cycles,
      u_bands: p.bands,
      u_pixel: p.pixel,
      u_scan: p.scanlines,
      u_a: p.colorA,
      u_b: p.colorB,
      u_c: p.colorC,
    }, env);
  },
};
