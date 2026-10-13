import { TAU } from '../lib/anim.js';
import { shader } from '../lib/gl.js';

// Cáusticas de piscina: iteração de "água tileável" (variação do shader de Dave Hoskins / joltz0r).
// O tempo de cada iteração é u_ang·k com k inteiro → t=0 e t=duration são o mesmo quadro.
// Três amostras com escala levemente diferente (R, G, B) dão a dispersão cromática nas linhas de luz.
const FRAG = `
uniform float u_ang;
uniform float u_scale;
uniform float u_int;
uniform float u_disp;
uniform float u_tiles;
uniform float u_grain;
uniform vec3 u_deep;
uniform vec3 u_shallow;
uniform vec3 u_light;
const float TAU = 6.28318530718;
float caustic(vec2 uv) {
  vec2 p = uv * TAU - 250.0;
  vec2 i = p;
  float c = 1.0;
  const float inten = 0.005;
  // frequências inteiras (voltas por loop) + fases fixas
  float ks[5] = float[5](-3.0, -1.0, -1.0, 1.0, 2.0);
  float ph[5] = float[5](0.0, 1.9, 4.1, 2.7, 5.3);
  for (int n = 0; n < 5; n++) {
    float t = ks[n] * u_ang + ph[n];
    i = p + vec2(cos(t - i.x) + sin(t + i.y), sin(t - i.y) + cos(t + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + t) / inten), p.y / (cos(i.y + t) / inten)));
  }
  c /= 5.0;
  c = 1.17 - pow(c, 1.4);
  return pow(abs(c), 11.0);
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  float m = min(u_res.x, u_res.y);
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / m;
  // perspectiva leve: o fundo "afunda" para cima da tela (padrão menor lá em cima)
  float persp = 1.0 + 0.22 * uv.y;
  vec2 q = vec2(uv.x * persp, uv.y) * u_scale + vec2(3.7, 1.3);
  // a função é periódica em q (período 1): uma distorção larga e de frequência irracional esconde a repetição
  q += 0.45 * vec2(sin(q.y * 0.83 + 1.3 + 0.4 * sin(u_ang)), sin(q.x * 0.61 + 0.7 + 0.4 * cos(u_ang)));
  q = mat2(0.96, -0.28, 0.28, 0.96) * q;
  // refração: o padrão também desloca levemente as juntas dos azulejos
  vec2 wob = 0.012 * vec2(sin(q.y * 5.0 + u_ang), cos(q.x * 4.0 - u_ang));
  float d = u_disp * 0.012;
  vec3 c = vec3(caustic(q * (1.0 - d)), caustic(q), caustic(q * (1.0 + d)));
  // luz geral da superfície (manchas largas mais claras)
  float broad = 0.5 + 0.5 * sin(uv.x * 2.1 + sin(u_ang) * 0.6) * sin(uv.y * 1.7 - cos(u_ang) * 0.5);

  float depth = clamp(0.5 - uv.y * 0.55, 0.0, 1.0);        // em cima = mais fundo
  vec3 col = mix(u_shallow, u_deep, depth);
  col *= 0.8 + 0.35 * broad;
  // azulejos: grade fina, distorcida pela refração
  vec2 tg = (vec2(uv.x * persp, uv.y) + wob) * 7.0;
  vec2 tl = abs(fract(tg) - 0.5);
  float grout = smoothstep(0.47, 0.495, max(tl.x, tl.y));
  col *= 1.0 - 0.18 * grout * u_tiles;
  // cáusticas: mais fortes no raso, mais suaves no fundo
  float k = u_int * mix(1.0, 0.55, depth) * (0.75 + 0.5 * broad);
  col += u_light * c * k;
  col += u_light * c * c * 0.15 * k;
  col *= 1.0 - 0.35 * smoothstep(0.4, 1.3, length(uv));
  col += (hash(gl_FragCoord.xy) - 0.5) * u_grain;
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'caustics',
  title: 'Caustics',
  description: 'Fundo de piscina iluminado, com as cáusticas da água correndo pelos azulejos em loop.',
  category: 'fundos',
  tags: ['fundo', 'loop', 'padrão', 'shader'],
  duration: 16,

  params: {
    deep: { type: 'color', label: 'Água funda', default: '#03303d' },
    shallow: { type: 'color', label: 'Água rasa', default: '#0a6270' },
    light: { type: 'color', label: 'Luz', default: '#d8fff6' },
    scale: { type: 'range', label: 'Escala', min: 0.3, max: 3, step: 0.05, default: 1.7 },
    intensity: { type: 'range', label: 'Intensidade', min: 0, max: 2, step: 0.01, default: 1.1 },
    dispersion: { type: 'range', label: 'Dispersão', min: 0, max: 1, step: 0.01, default: 0.25 },
    tiles: { type: 'boolean', label: 'Azulejos', default: true },
    grain: { type: 'range', label: 'Granulado', min: 0, max: 0.12, step: 0.005, default: 0.02 },
  },

  render(ctx, t, env) {
    const { p, progress } = env;
    shader(ctx, FRAG, {
      u_time: t,
      u_ang: TAU * progress,
      u_scale: p.scale,
      u_int: p.intensity,
      u_disp: p.dispersion,
      u_tiles: p.tiles,
      u_grain: p.grain,
      u_deep: p.deep,
      u_shallow: p.shallow,
      u_light: p.light,
    }, env);
  },
};
