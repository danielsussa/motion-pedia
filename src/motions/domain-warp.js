import { TAU } from '../lib/anim.js';
import { shader, GLSL_NOISE } from '../lib/gl.js';

// Domain warping (Inigo Quilez): f(p + k·fbm(p + k·fbm(p))). O tempo anda num círculo dentro do
// espaço do ruído (cada camada com fase própria), então t=0 e t=duration são o mesmo quadro.
const FRAG = `
uniform float u_ang;
uniform float u_scale;
uniform float u_warp;
uniform float u_seed;
uniform float u_mode;
uniform float u_grain;
uniform vec3 u_bg;
uniform vec3 u_c1;
uniform vec3 u_c2;
uniform vec3 u_c3;
${GLSL_NOISE}
float fbm(vec2 p, float ph, float r) {
  vec3 o = r * vec3(cos(u_ang + ph), 0.6 * sin(u_ang + ph), sin(u_ang + ph));
  vec3 q = vec3(p, u_seed) + o;
  float v = 0.0, a = 0.5;
  mat2 m = mat2(1.5, 1.1, -1.1, 1.5);
  for (int i = 0; i < 4; i++) {
    v += a * snoise(q);
    q.xy = m * q.xy; q.z *= 1.6;
    a *= 0.45;
  }
  return v;
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / min(u_res.x, u_res.y);
  vec2 p = uv * u_scale;
  vec2 q = vec2(fbm(p, 0.0, 0.35), fbm(p + vec2(5.2, 1.3), 1.7, 0.35));
  vec2 r = vec2(fbm(p + u_warp * q + vec2(1.7, 9.2), 3.1, 0.45), fbm(p + u_warp * q + vec2(8.3, 2.8), 4.6, 0.45));
  float f = fbm(p + u_warp * r, 2.2, 0.25);
  vec3 col;
  if (u_mode < 0.5) {
    // fluido: camadas de cor guiadas pelos vetores intermediários
    col = mix(u_bg, u_c1, smoothstep(-0.45, 0.35, f));
    col = mix(col, u_c2, smoothstep(0.22, 0.6, length(q)) * smoothstep(-0.15, 0.35, r.y) * 0.95);
    col = mix(col, u_c3, pow(smoothstep(0.1, 0.55, f + 0.35 * r.x), 2.0) * 0.8);
    col *= 0.45 + 0.65 * smoothstep(-0.55, 0.25, f);
  } else {
    // mármore: veios finos nos níveis do campo distorcido
    float v = abs(sin((f * 3.0 + r.x * 1.5) * 3.14159));
    float vein = pow(1.0 - v, 10.0);
    float soft = pow(1.0 - v, 2.5);
    col = mix(u_bg, u_c1, smoothstep(-0.6, 0.6, f));
    col = mix(col, u_c2, soft * 0.35 * smoothstep(0.0, 0.8, length(q)));
    col = mix(col, u_c3, vein);
  }
  // vinheta suave + grão/dither (tira o banding do gradiente)
  col *= 1.0 - 0.35 * smoothstep(0.4, 1.3, length(uv));
  col += (hash(gl_FragCoord.xy + fract(u_ang) * 917.0) - 0.5) * u_grain;
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'domain-warp',
  title: 'Domain Warp',
  description: 'Noise warped onto itself, looping: organic flowing ink or veined marble.',
  category: 'fundos',
  tags: ['background', 'loop', 'gradient', 'shader'],
  duration: 12,

  params: {
    mode: { type: 'select', label: 'Style', options: ['fluido', 'mármore'], default: 'fluido' },
    bg: { type: 'color', label: 'Background', default: '#06060c' },
    c1: { type: 'color', label: 'Base color', default: '#23307a' },
    c2: { type: 'color', label: 'Accent', default: '#ff6a3d' },
    c3: { type: 'color', label: 'Glow', default: '#f4ead9' },
    scale: { type: 'range', label: 'Scale', min: 0.5, max: 4, step: 0.05, default: 0.9 },
    warp: { type: 'range', label: 'Distortion', min: 0, max: 5, step: 0.05, default: 1.8 },
    grain: { type: 'range', label: 'Grain', min: 0, max: 0.2, step: 0.005, default: 0.05 },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 3 },
  },

  render(ctx, t, env) {
    const { p, progress } = env;
    shader(ctx, FRAG, {
      u_time: t,
      u_ang: TAU * progress,
      u_scale: p.scale,
      u_warp: p.warp,
      u_seed: p.seed * 7.31,
      u_mode: p.mode === 'mármore' ? 1 : 0,
      u_grain: p.grain,
      u_bg: p.bg,
      u_c1: p.c1,
      u_c2: p.c2,
      u_c3: p.c3,
    }, env);
  },
};
