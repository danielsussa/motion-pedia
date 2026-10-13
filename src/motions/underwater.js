import { TAU } from '../lib/anim.js';
import { shader, GLSL_NOISE } from '../lib/gl.js';

// Debaixo d'água, olhando um pouco para cima. Três planos num shader só:
// • superfície vista de baixo em perspectiva (plano y = const projetado), com a rede de cáusticas
//   ("água tileável" de caustics.js, 4 iterações, frequências inteiras de u_ang) e a janela de Snell no sol;
// • raios de luz em leque a partir de um sol acima do quadro: ruído simplex no ÂNGULO, com o tempo
//   num círculo (cos/sin de u_ang) → loop perfeito;
// • fundo de areia em perspectiva (opcional) com as mesmas cáusticas.
// Bolhas sobem em colunas que andam N células por loop (hash com id.y módulo N); plâncton orbita em volta
// do centro da célula (sem deriva líquida), aceso dentro dos raios.
const FRAG = `
uniform float u_ang;
uniform float u_prog;
uniform float u_int;
uniform float u_rays;
uniform float u_bub;
uniform float u_plk;
uniform float u_floor;
uniform float u_sunx;
uniform vec3 u_deep;
uniform vec3 u_water;
uniform vec3 u_light;
uniform vec3 u_sand;
const float TAU = 6.28318530718;
${GLSL_NOISE}

float caustic(vec2 uv) {
  vec2 p = uv * TAU - 250.0;
  vec2 i = p;
  float c = 1.0;
  const float inten = 0.005;
  float ks[4] = float[4](-2.0, -1.0, 1.0, 2.0);
  float ph[4] = float[4](0.0, 1.9, 4.1, 2.7);
  for (int n = 0; n < 4; n++) {
    float t = ks[n] * u_ang + ph[n];
    i = p + vec2(cos(t - i.x) + sin(t + i.y), sin(t - i.y) + cos(t + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + t) / inten), p.y / (cos(i.y + t) / inten)));
  }
  c /= 4.0;
  c = 1.17 - pow(c, 1.4);
  return pow(abs(c), 9.0);
}
vec3 hash3(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yxz + 33.33);
  return fract((q.xxy + q.yzz) * q.zyx);
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

float aa;
// bolhas: devolve brilho (aro claro, miolo quase transparente, reflexo)
float bubbles(vec2 uv, float cw, float ch, float ls, float amt) {
  float cx = floor(uv.x / cw);
  vec3 hc = hash3(vec2(cx + 5.0, ls));
  float N = 5.0 + 2.0 * floor(hc.x * 3.0);          // 5, 7 ou 9 células por loop
  vec2 g = vec2(uv.x, uv.y - u_prog * N * ch + hc.y * ch);
  float cy = floor(g.y / ch);
  float id = mod(cy, N);
  vec3 h = hash3(vec2(cx * 1.3 + id * 17.0, ls * 2.1));
  if (h.z > amt) return 0.0;
  vec2 l = vec2(g.x / cw - cx, g.y / ch - cy);
  float k = 1.0 + floor(h.y * 3.0);
  vec2 c = vec2(0.5 + 0.22 * sin(k * u_ang * 2.0 + TAU * h.x), 0.5 + 0.1 * cos(k * u_ang + TAU * h.y));
  float r = cw * (0.07 + 0.16 * h.x * h.x);
  vec2 p = (l - c) * vec2(cw, ch);
  // achata/estica levemente (bolha oscilando)
  float sq = 1.0 + 0.08 * sin(k * u_ang * 6.0 + TAU * h.z);
  p *= vec2(sq, 1.0 / sq);
  float d = length(p);
  float body = smoothstep(r, r - aa, d);
  float rim = smoothstep(r * 0.55, r, d) * body;
  float spec = smoothstep(r * 0.32, r * 0.05, length(p - vec2(-0.35, 0.4) * r));
  return body * 0.12 + rim * 0.65 + spec * 0.9;
}
float plankton(vec2 p, float scale) {
  vec2 x = p * scale;
  vec2 n = floor(x), f = fract(x);
  float acc = 0.0;
  // a órbita (raio 0.36) + o ponto (≤0.075) cabem na célula: basta a própria célula
  {
    vec2 g = vec2(0.0);
    vec2 id = n;
    vec3 h = hash3(id + 41.0);
    if (h.z > 0.5) return 0.0;
    float k = 1.0 + step(0.22, h.z);
    vec2 c = g + 0.5 + 0.36 * vec2(sin(k * u_ang + TAU * h.x), cos(u_ang + TAU * h.y) * (2.0 - k) + sin(u_ang * 2.0 + TAU * h.x) * (k - 1.0));
    float d = length(c - f);
    float r = 0.03 + 0.045 * h.y * h.y;
    float tw = 0.55 + 0.45 * sin(k * u_ang * 3.0 + TAU * h.x);
    acc += smoothstep(r, r * 0.2, d) * tw;
  }
  return acc;
}

void main() {
  float m = min(u_res.x, u_res.y);
  aa = 1.5 / m;
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / m;
  float hh = 0.5 * u_res.y / m, hw = 0.5 * u_res.x / m;
  vec2 sun = vec2(u_sunx * hw, hh + 0.55);

  // ---- água: gradiente de profundidade
  float up = (uv.y + hh) / (2.0 * hh);                 // 0 embaixo, 1 em cima
  vec3 col = mix(u_deep, u_water, smoothstep(0.0, 1.0, up));
  col += u_water * 0.35 * exp(-length((uv - sun) * vec2(0.8, 1.0)) * 1.4);

  // ---- superfície vista de baixo
  float ys = hh * 0.3;
  if (uv.y > ys) {
    float d = uv.y - ys;
    float z = 0.42 / (d + 0.02);
    vec2 sp = vec2(uv.x * z * 0.5, z * 0.9 + 2.0);
    float c = caustic(sp * 0.55);
    float fade = smoothstep(0.0, 0.3, d);
    // janela de Snell: céu claro em volta do sol
    float win = exp(-length((uv - vec2(sun.x, hh + 0.05)) * vec2(0.55, 1.4)) * 2.2);
    vec3 surf = mix(u_water * 1.3, u_light, 0.25 + 0.55 * win);
    float rip = 0.55 + 0.45 * snoise(vec3(sp * vec2(1.4, 0.8), 0.6 * cos(u_ang))) * 0.5 + 0.2 * sin(u_ang);
    col = mix(col, surf * (0.75 + 0.25 * rip), fade * 0.55 * (0.5 + 0.5 * win));
    col += u_light * c * fade * (0.35 + 0.9 * win) * u_int * 0.8;
  }

  // ---- raios de luz
  vec2 v = uv - sun;
  float a = atan(v.x, -v.y);
  float L = length(v);
  float R = 0.9;
  float n1 = snoise(vec3(a * 9.0, R * cos(u_ang), R * sin(u_ang)));
  float n2 = snoise(vec3(a * 23.0 + 7.0, 1.6 * cos(u_ang * 2.0 + 1.0), 1.6 * sin(u_ang * 2.0 + 1.0)));
  float rays = smoothstep(0.05, 0.9, 0.5 + 0.55 * n1) * (0.6 + 0.4 * (0.5 + 0.5 * n2));
  float below = (hh - uv.y);
  float rfade = smoothstep(0.0, 0.25, below + 0.1) * exp(-below * 1.1) * smoothstep(1.9, 0.0, abs(a) * 2.2);
  float beam = rays * rfade * u_rays;
  col += u_light * beam * 0.32 * u_int;

  // ---- fundo de areia em perspectiva
  float yb = -hh + 0.24;
  float sandMask = 0.0;
  if (u_floor > 0.5 && uv.y < yb + 0.02) {
    float d = max(yb - uv.y, 0.0);
    float z = 0.3 / (d + 0.015);
    vec2 fp = vec2(uv.x * z * 0.8, z * 0.7);
    float c = caustic(fp * 0.7 + 9.0);
    float dunes = 0.5 + 0.5 * sin(fp.x * 3.0 + sin(fp.y * 1.3) * 1.5 + fp.y * 0.7);
    float near = smoothstep(0.0, 0.2, d);
    vec3 sand = mix(u_sand, u_sand * 0.75, dunes * 0.5);
    sand = sand * (0.7 + 0.3 * up) + u_light * c * 1.3 * u_int * (0.5 + 0.5 * dunes);
    // névoa de distância: perto do horizonte tudo vira água
    vec3 fl = mix(col, sand, near * 0.9);
    sandMask = smoothstep(yb + 0.02, yb - 0.01, uv.y);
    col = mix(col, fl, sandMask);
  }

  // ---- plâncton (aceso nos raios) e bolhas
  float pk = plankton(uv, 13.0) + 0.7 * plankton(uv + 3.7, 23.0);
  col += u_light * pk * u_plk * (0.12 + 0.9 * beam) * (1.0 - 0.6 * sandMask);
  float b = bubbles(uv, 0.07, 0.11, 1.0, 0.09 * u_bub) + 0.6 * bubbles(uv + 0.031, 0.045, 0.07, 2.0, 0.1 * u_bub);
  col += mix(u_light, vec3(1.0), 0.5) * b * (0.35 + 0.65 * up) * 0.75;

  col *= 1.0 - 0.4 * smoothstep(0.45, 1.3, length(uv * vec2(0.9, 1.0)));
  col += (hash(gl_FragCoord.xy) - 0.5) * 0.02;
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'underwater',
  title: 'Underwater',
  description: 'Fundo do mar visto de dentro, com raios de luz da superfície, cáusticas na areia, bolhas subindo e plâncton.',
  category: 'fundos',
  tags: ['fundo', 'loop', 'shader', 'partículas'],
  duration: 20,

  params: {
    deep: { type: 'color', label: 'Água funda', default: '#021624' },
    water: { type: 'color', label: 'Água', default: '#0b5a72' },
    light: { type: 'color', label: 'Luz', default: '#c8fff4' },
    sand: { type: 'color', label: 'Areia', default: '#3f6f72' },
    intensity: { type: 'range', label: 'Intensidade', min: 0, max: 2, step: 0.01, default: 1 },
    rays: { type: 'range', label: 'Raios de luz', min: 0, max: 2, step: 0.01, default: 1 },
    bubbles: { type: 'range', label: 'Bolhas', min: 0, max: 2, step: 0.01, default: 1 },
    plankton: { type: 'range', label: 'Plâncton', min: 0, max: 2, step: 0.01, default: 1 },
    sun: { type: 'range', label: 'Posição do sol', min: -1, max: 1, step: 0.01, default: -0.25 },
    floor: { type: 'boolean', label: 'Fundo de areia', default: true },
  },

  render(ctx, t, env) {
    const { p, progress } = env;
    shader(ctx, FRAG, {
      u_ang: TAU * progress,
      u_prog: progress,
      u_int: p.intensity,
      u_rays: p.rays,
      u_bub: p.bubbles,
      u_plk: p.plankton,
      u_floor: p.floor,
      u_sunx: p.sun,
      u_deep: p.deep,
      u_water: p.water,
      u_light: p.light,
      u_sand: p.sand,
    }, env);
  },
};
