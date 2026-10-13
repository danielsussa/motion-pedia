import { TAU } from '../lib/anim.js';
import { shader, GLSL_NOISE } from '../lib/gl.js';

// Metal líquido: um campo de altura (simplex com domain warp leve, tempo andando num círculo dentro do
// ruído → loop perfeito) vira normal por diferenças finitas. A normal reflete um ambiente FALSO
// (céu claro, horizonte nítido, chão escuro e duas softboxes) — é o horizonte duro refletido que dá a
// cara de cromo. A iridescência é uma película fina: a cor oscila entre dois tons conforme a espessura
// (altura) e o ângulo de visão (fresnel).
const FRAG = `
uniform float u_ang;
uniform float u_scale;
uniform float u_warp;
uniform float u_bump;
uniform float u_irid;
uniform float u_seed;
uniform float u_grain;
uniform vec3 u_dark;
uniform vec3 u_light;
uniform vec3 u_ta;
uniform vec3 u_tb;
${GLSL_NOISE}
float height(vec2 p) {
  vec3 o1 = 0.55 * vec3(cos(u_ang), sin(u_ang), 0.0);
  vec3 o2 = 0.45 * vec3(0.0, cos(u_ang + 1.7), sin(u_ang + 1.7));
  vec2 w = vec2(snoise(vec3(p * 0.6, u_seed) + o1), snoise(vec3(p * 0.6 + 7.3, u_seed) + o1.yzx));
  vec2 q = p + u_warp * w;
  return snoise(vec3(q, u_seed + 3.0) + o2) + 0.32 * snoise(vec3(q * 2.1 + 4.1, u_seed - 2.0) - o1);
}
vec3 envMap(vec3 r) {
  // elevação do raio refletido (inclinado: o horizonte atravessa a tela na diagonal)
  float e = r.y + 0.25 * r.x;
  vec3 sky = mix(u_light, u_light * 0.72, smoothstep(0.0, 0.9, e));
  vec3 ground = mix(mix(u_dark, u_light, 0.3), u_dark, pow(smoothstep(-0.02, -0.75, e), 0.6));
  // reflexo fraco de um "piso" claro, para os vales não virarem buracos pretos
  ground += u_light * 0.12 * smoothstep(0.35, 0.0, abs(r.x + 0.1)) * smoothstep(-0.9, -0.5, e) * smoothstep(-0.1, -0.35, e);
  vec3 c = mix(ground, sky, smoothstep(-0.03, 0.03, e));
  // linha clara logo abaixo do horizonte (o "chão" distante) e duas softboxes
  c += u_light * 0.35 * exp(-pow((e + 0.06) * 30.0, 2.0));
  c += u_light * 0.9 * smoothstep(0.12, 0.08, abs(r.x - 0.55)) * smoothstep(0.1, 0.3, e) * smoothstep(0.9, 0.6, e);
  c += u_light * 0.5 * smoothstep(0.06, 0.03, abs(r.x + 0.45)) * smoothstep(0.25, 0.45, e);
  return c;
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  float m = min(u_res.x, u_res.y);
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / m;
  vec2 p = uv * u_scale;
  float e = 0.012 * u_scale;
  float h = height(p);
  float hx = height(p + vec2(e, 0.0));
  float hy = height(p + vec2(0.0, e));
  vec3 n = normalize(vec3(-(hx - h) / e * u_bump, -(hy - h) / e * u_bump, 1.0));
  vec3 v = normalize(vec3(uv * 0.35, -1.0));        // câmera levemente em perspectiva
  vec3 r = reflect(v, n);
  r = vec3(r.x, -r.z * 0.12 + r.y, r.z);            // inclina o mundo: plano visto meio de cima
  vec3 col = envMap(normalize(r));
  // película fina: tom A ↔ B pela espessura e pelo ângulo
  float fres = pow(1.0 - clamp(n.z, 0.0, 1.0), 1.5);
  float film = 0.5 + 0.5 * cos(6.2831853 * (0.6 * h + 1.6 * fres + u_ang / 6.2831853));   // +1 volta de cor por loop
  vec3 tint = mix(u_ta, u_tb, film);
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col, tint * (0.25 + 1.1 * lum), u_irid * (0.35 + 0.65 * fres));
  // oclusão nos vales
  col *= 0.75 + 0.25 * smoothstep(-0.9, 0.5, h);
  col *= 1.0 - 0.3 * smoothstep(0.45, 1.3, length(uv));
  col += (hash(gl_FragCoord.xy) - 0.5) * u_grain;
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'liquid-chrome',
  title: 'Liquid Chrome',
  description: 'A liquid metal surface rippling in a loop, with chrome reflections and an iridescent film.',
  category: 'fundos',
  tags: ['background', 'loop', 'gradient', '3d', 'shader'],
  duration: 12,

  params: {
    dark: { type: 'color', label: 'Shadow', default: '#07080c' },
    light: { type: 'color', label: 'Sheen', default: '#e9edf2' },
    ta: { type: 'color', label: 'Iridescence A', default: '#7f6bff' },
    tb: { type: 'color', label: 'Iridescence B', default: '#5fe3d6' },
    irid: { type: 'range', label: 'Iridescence', min: 0, max: 1, step: 0.01, default: 0.55 },
    scale: { type: 'range', label: 'Scale', min: 0.4, max: 4, step: 0.05, default: 1.3 },
    warp: { type: 'range', label: 'Distortion', min: 0, max: 2, step: 0.01, default: 0.8 },
    bump: { type: 'range', label: 'Relief', min: 0.05, max: 1, step: 0.01, default: 0.35 },
    grain: { type: 'range', label: 'Grain', min: 0, max: 0.12, step: 0.005, default: 0.02 },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 11 },
  },

  render(ctx, t, env) {
    const { p, progress } = env;
    shader(ctx, FRAG, {
      u_time: t,
      u_ang: TAU * progress,
      u_scale: p.scale,
      u_warp: p.warp,
      u_bump: p.bump,
      u_irid: p.irid,
      u_seed: p.seed * 2.37,
      u_grain: p.grain,
      u_dark: p.dark,
      u_light: p.light,
      u_ta: p.ta,
      u_tb: p.tb,
    }, env);
  },
};
