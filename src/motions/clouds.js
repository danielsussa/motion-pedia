import { TAU } from '../lib/anim.js';
import { shader, GLSL_NOISE } from '../lib/gl.js';

// Céu com um "deck" de nuvens em perspectiva: cada pixel acima do horizonte vira um ponto num plano
// de nuvens (x/dy, 1/dy). As nuvens vêm do fundo em direção à câmera e passam por cima. Loop sem crossfade:
// o ruído é periódico na profundidade (cilindro dentro do simplex 3D, período = "vento") e o plano anda
// exatamente um período por loop. A luz vem de uma segunda amostra (2 oitavas) deslocada na direção do sol.
const FRAG = `
uniform float u_prog;
uniform float u_ang;
uniform float u_cover;
uniform float u_soft;
uniform float u_scale;
uniform float u_wind;
uniform float u_seed;
uniform float u_mode;
uniform float u_grain;
uniform vec3 u_top;
uniform vec3 u_hor;
uniform vec3 u_lit;
uniform vec3 u_shade;
uniform vec3 u_sun;
uniform vec2 u_sunPos;
${GLSL_NOISE}
// fbm periódico em p.y (período u_wind): o eixo y do plano vira um cilindro dentro do ruído 3D.
// Cada oitava dobra a escala do vetor inteiro (o ângulo não muda), então a periodicidade se mantém.
float dens(vec2 p, int oct) {
  float th = 6.28318530718 * (p.y + u_wind * u_prog) / u_wind;
  float R = u_wind / 6.28318530718;
  vec3 q = vec3(p.x, R * cos(th), R * sin(th)) + vec3(u_seed, 0.0, 0.0);
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) {
    if (i >= oct) break;
    v += a * snoise(q);
    q = q * 2.0 + vec3(1.7, 0.0, 0.0);
    a *= 0.5;
  }
  return v;
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  float m = min(u_res.x, u_res.y);
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / m;
  float hh = 0.5 * u_res.y / m;
  float hy = -hh - 0.06;                         // horizonte logo abaixo da borda inferior
  float dy = (uv.y - hy) / (2.0 * hh);           // altura acima do horizonte, normalizada pela altura da tela
  float sy = clamp((uv.y + hh) / (2.0 * hh), 0.0, 1.0);  // 0 embaixo, 1 em cima

  // céu: gradiente + halo do sol/lua
  vec3 sky = mix(u_hor, u_top, pow(sy, 0.7));
  float sd = length(uv - u_sunPos);
  sky += u_sun * (0.35 * exp(-sd * 2.2) + 0.25 * exp(-sd * 9.0));
  float disk = smoothstep(0.05, 0.036, sd);
  float star = 0.0;
  if (u_mode > 1.5) {
    // noite: estrelas (piscam com frequência inteira); entram depois das nuvens, atrás delas
    vec2 g = floor(gl_FragCoord.xy / (m * 0.006));
    float h = hash(g + 7.0);
    float tw = 0.6 + 0.4 * sin(u_ang * (1.0 + floor(h * 3.0)) + h * 40.0);
    vec2 c = fract(gl_FragCoord.xy / (m * 0.006)) - 0.5;
    star = step(0.992, h) * tw * smoothstep(0.1, 0.6, sy) * smoothstep(0.35, 0.0, length(c)) * 0.9;
  }
  sky = mix(sky, mix(u_sun, vec3(1.0), 0.55), disk);

  // plano de nuvens em perspectiva
  float z = 1.0 / max(dy, 0.02);
  vec2 cp = vec2(uv.x * z, z) * 0.55 * u_scale;
  float d = dens(cp, 5);
  float cov = mix(0.35, -0.45, u_cover);
  float alpha = smoothstep(cov, cov + u_soft, d);
  // luz: quanto mais denso na direção do sol, mais sombra (amostra barata, 2 oitavas)
  vec2 toSun = normalize(vec2(u_sunPos.x - uv.x, 0.6)) * 0.22;
  float dl = dens(cp + toSun, 2);
  float light = clamp(0.55 + 1.6 * (d - dl), 0.0, 1.0);
  float thick = smoothstep(cov, cov + 0.9, d);
  vec3 cloud = mix(u_shade, u_lit, light * (1.0 - 0.45 * thick));
  // borda prateada voltada ao sol
  float rim = (1.0 - smoothstep(cov, cov + u_soft * 1.5, d)) * exp(-sd * 1.2);
  cloud += u_sun * rim * 0.55;
  // névoa: nuvens distantes se dissolvem no horizonte
  float fog = exp(-z * 0.11);
  alpha *= smoothstep(0.03, 0.35, fog) * 0.97;
  cloud = mix(u_hor, cloud, 0.35 + 0.65 * fog);

  vec3 col = mix(sky, cloud, alpha) + star * pow(1.0 - alpha, 4.0);
  col *= 1.0 - 0.18 * smoothstep(0.5, 1.4, length(uv));
  col += (hash(gl_FragCoord.xy) - 0.5) * u_grain;
  outColor = vec4(col, 1.0);
}`;

const MODES = {
  dia: { top: '#2a63b8', hor: '#b9d3ea', lit: '#ffffff', shade: '#8796ad', sun: '#fff4dc', sun2: [0.55, 0.32] },
  'pôr do sol': { top: '#1f2552', hor: '#ff9a62', lit: '#ffd2a8', shade: '#55324f', sun: '#ffb070', sun2: [0.1, -0.32] },
  noite: { top: '#03050d', hor: '#16203d', lit: '#8d9bbd', shade: '#0d1222', sun: '#cfd8ff', sun2: [-0.5, 0.3] },
};

export default {
  id: 'clouds',
  title: 'Clouds',
  description: 'A sky of billowing clouds drifting by in perspective, looping, in day, sunset and night modes.',
  category: 'fundos',
  tags: ['background', 'loop', 'shader'],
  duration: 30,

  params: {
    mode: { type: 'select', label: 'Sky', options: ['dia', 'pôr do sol', 'noite'], default: 'pôr do sol' },
    cover: { type: 'range', label: 'Coverage', min: 0, max: 1, step: 0.01, default: 0.5 },
    soft: { type: 'range', label: 'Softness', min: 0.05, max: 0.8, step: 0.01, default: 0.24 },
    scale: { type: 'range', label: 'Scale', min: 0.3, max: 3, step: 0.05, default: 1.6 },
    wind: { type: 'range', label: 'Wind', min: 1, max: 6, step: 0.1, default: 2.5 },
    grain: { type: 'range', label: 'Grain', min: 0, max: 0.12, step: 0.005, default: 0.02 },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 2 },
  },

  render(ctx, t, env) {
    const { p, progress } = env;
    const m = MODES[p.mode] || MODES.dia;
    shader(ctx, FRAG, {
      u_time: t,
      u_prog: progress,
      u_ang: TAU * progress,
      u_cover: p.cover,
      u_soft: p.soft,
      u_scale: p.scale,
      u_wind: p.wind,
      u_seed: p.seed * 3.17,
      u_mode: p.mode === 'noite' ? 2 : p.mode === 'pôr do sol' ? 1 : 0,
      u_grain: p.grain,
      u_top: m.top,
      u_hor: m.hor,
      u_lit: m.lit,
      u_shade: m.shade,
      u_sun: m.sun,
      u_sunPos: m.sun2,
    }, env);
  },
};
