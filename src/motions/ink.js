import { rng, ease, seg } from '../lib/anim.js';
import { shader, GLSL_NOISE } from '../lib/gl.js';

// "Fluido falso" em uma passada de shader (o gl.js não faz ping-pong de framebuffers):
// cada gota cresce com easing, gira (redemoinho) e é distorcida por um campo de turbulência
// compartilhado (domain warp); dentro dela, ruído "ridged" desenha os filamentos da tinta.
// Começa no papel/água limpos, as gotas caem em sequência e no fim tudo se dilui → loop limpo.
const MAX = 6;
const FRAG = `
uniform float u_n;
uniform vec4 u_d[${MAX}];      // centro xy, idade (s), raio
uniform float u_k[${MAX}];     // 0 = tinta 1, 1 = tinta 2
uniform float u_fade;
uniform float u_swirl;
uniform float u_turb;
uniform float u_smoke;
uniform float u_seed;
uniform vec3 u_bg;
uniform vec3 u_i1;
uniform vec3 u_i2;
${GLSL_NOISE}
float fbm(vec3 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++) { v += a * snoise(p); p = p * 2.03 + 1.7; a *= 0.5; }
  return v;
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  float m = min(u_res.x, u_res.y);
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / m;
  uv.y = -uv.y;
  float tt = u_time * 0.12;
  // turbulência compartilhada
  vec2 w = vec2(fbm(vec3(uv * 1.8, tt + u_seed)), fbm(vec3(uv * 1.8 + 5.2, tt + u_seed + 3.1)));

  vec3 col = u_bg;
  if (u_smoke < 0.5) col *= 1.0 - 0.18 * smoothstep(0.35, 1.3, length(uv)); // papel com vinheta leve
  else col *= 1.0 - 0.45 * smoothstep(0.3, 1.2, length(uv));

  for (int i = 0; i < ${MAX}; i++) {
    if (float(i) >= u_n) break;
    vec4 d = u_d[i];
    float age = d.z;
    if (age <= 0.0) continue;
    float g = 1.0 - exp(-age * 0.9);           // crescimento 0..1 (rápido no impacto, depois lento)
    float R = d.w * (0.12 + 0.88 * g);
    vec2 rel = uv - d.xy;
    float r = length(rel);
    // redemoinho: gira mais perto do centro, e cada vez mais com o tempo
    float ang = u_swirl * g * 2.2 * exp(-r / max(R, 1e-3) * 1.4) * (mod(float(i), 2.0) < 1.0 ? 1.0 : -1.0);
    float c = cos(ang), s = sin(ang);
    rel = mat2(c, s, -s, c) * rel;
    vec2 q = rel + w * u_turb * R * (0.25 + 0.9 * g);
    float si = float(i) * 13.7 + u_seed;
    // escala do detalhe acompanha o crescimento, mas sem ficar miúda no impacto
    float S = d.w * (0.45 + 0.55 * g);
    float n = fbm(vec3(q / S * 1.3 + si, age * 0.2 + si));
    float dn = length(q) / R + 0.55 * n;
    float body = smoothstep(1.0, 0.2, dn);
    float halo = smoothstep(1.3, 0.5, dn);
    // nuvens de concentração + filamentos (ruído "ridged") mais finos na borda
    float cloud = smoothstep(-0.35, 0.45, fbm(vec3(q / S * 2.2 - si, age * 0.25 + 4.0)));
    float rid = pow(1.0 - abs(snoise(vec3(q / S * 2.2 + si * 1.3, age * 0.3))), 6.0);
    float rid2 = pow(1.0 - abs(snoise(vec3(q / S * 4.5 - si, age * 0.4 + 7.0))), 9.0);
    float dens = body * (0.18 + 0.5 * cloud + 0.3 * rid + 0.15 * rid2) + (halo - body) * (rid * 0.55 + rid2 * 0.25);
    dens *= mix(1.0, 0.6, g);                  // dilui conforme espalha
    dens *= smoothstep(0.0, 0.25, age);        // impacto suave
    dens = clamp(dens * (1.0 - u_fade), 0.0, 1.0);
    vec3 ink = mix(u_i1, u_i2, u_k[i]);
    if (u_smoke < 0.5) col *= mix(vec3(1.0), ink, dens);   // tinta absorve luz (multiplica)
    else col = mix(col, ink, dens * 0.85);                 // fumaça clara sobre o escuro
  }
  col += (hash(gl_FragCoord.xy) - 0.5) * 0.025;
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'ink',
  title: 'Ink & Smoke',
  description: 'Gotas de tinta caindo na água e se abrindo em filamentos e redemoinhos — ou fumaça clara no escuro.',
  category: 'particulas',
  tags: ['fundo', 'simulação', 'shader', 'transição'],
  duration: 10,
  poster: 6,

  params: {
    mode: { type: 'select', label: 'Estilo', options: ['tinta', 'fumaça'], default: 'tinta' },
    bg: { type: 'color', label: 'Fundo', default: '#f1ece2' },
    i1: { type: 'color', label: 'Tinta 1', default: '#14204d' },
    i2: { type: 'color', label: 'Tinta 2', default: '#d9402b' },
    drops: { type: 'range', label: 'Gotas', min: 1, max: MAX, step: 1, default: 4 },
    size: { type: 'range', label: 'Tamanho', min: 0.15, max: 0.8, step: 0.01, default: 0.42 },
    swirl: { type: 'range', label: 'Redemoinho', min: 0, max: 3, step: 0.05, default: 1.2 },
    turb: { type: 'range', label: 'Turbulência', min: 0, max: 2, step: 0.05, default: 0.9 },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 8 },
  },

  setup({ w, h, p, duration }) {
    const rand = rng(p.seed);
    const m = Math.min(w, h);
    const hw = (0.5 * w) / m;
    const hh = (0.5 * h) / m;
    const n = p.drops;
    const drops = Array.from({ length: n }, (_, i) => {
      // primeira gota perto do centro; as demais ao redor
      const a = rand() * Math.PI * 2;
      const rr = i === 0 ? rand() * 0.08 : 0.18 + rand() * 0.22;
      return {
        x: Math.max(-hw * 0.75, Math.min(hw * 0.75, Math.cos(a) * rr * 1.6 * hw)),
        y: Math.max(-hh * 0.6, Math.min(hh * 0.6, Math.sin(a) * rr * 1.2 * hh)),
        t0: 0.25 + (i / Math.max(1, n)) * duration * 0.42 + rand() * 0.25,
        r: p.size * (i === 0 ? 1 : 0.6 + rand() * 0.4),
        k: i % 2 === 1 && rand() < 0.8 ? 1 : 0,
      };
    });
    // centraliza o conjunto (a composição não "pende" para um canto)
    const cx = drops.reduce((a, d) => a + d.x * d.r, 0) / drops.reduce((a, d) => a + d.r, 0);
    const cy = drops.reduce((a, d) => a + d.y * d.r, 0) / drops.reduce((a, d) => a + d.r, 0);
    for (const d of drops) {
      d.x -= cx;
      d.y -= cy;
    }
    return { drops };
  },

  render(ctx, t, env) {
    const { p, duration, state } = env;
    const mode = p.mode === 'fumaça';
    const u = {
      u_n: state.drops.length,
      u_fade: ease.inOutCubic(seg(t, duration - 2.2, duration - 0.15)),
      u_swirl: p.swirl,
      u_turb: p.turb,
      u_smoke: mode,
      u_seed: p.seed * 3.17,
      u_bg: mode && p.bg === '#f1ece2' ? '#07080b' : p.bg,
      u_i1: mode && p.i1 === '#14204d' ? '#dfe6f2' : p.i1,
      u_i2: mode && p.i2 === '#d9402b' ? '#ff7a4a' : p.i2,
    };
    state.drops.forEach((d, i) => {
      u[`u_d[${i}]`] = [d.x, d.y, t - d.t0, d.r];
      u[`u_k[${i}]`] = d.k;
    });
    shader(ctx, FRAG, u, env);
  },
};
