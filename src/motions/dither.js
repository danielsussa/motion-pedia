import { TAU } from '../lib/anim.js';
import { shader, GLSL_NOISE } from '../lib/gl.js';

// 1-bit com dithering ordenado (Bayer 8×8), no estilo Obra Dinn / Playdate. O shader calcula uma
// cena em tons de cinza no centro de cada "pixel grande" e compara com o limiar da matriz de Bayer:
// só duas cores na tela. Loop: luz e textura giram uma volta inteira; o ruído anda num círculo em z.
const FRAG = `
uniform float u_ang;
uniform float u_mode;
uniform float u_scale;
uniform float u_bright;
uniform float u_contrast;
uniform float u_seed;
uniform vec3 u_dark;
uniform vec3 u_light;
${GLSL_NOISE}
float bayer8(ivec2 p) {
  int x = p.x & 7;
  int y = p.y & 7;
  int e = x ^ y;
  int v = ((e & 1) << 5) | ((x & 1) << 4) | ((e & 2) << 2) | ((x & 2) << 1) | ((e & 4) >> 1) | ((x & 4) >> 2);
  return (float(v) + 0.5) / 64.0;
}
float fbm(vec3 q) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * snoise(q); q = q * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; }
  return v;
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
vec3 rotY(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z); }
vec3 rotX(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x, c * p.y - s * p.z, s * p.y + c * p.z); }
// cena em tons de cinza (0 = escuro, 1 = claro)
float scene(vec2 uv) {
  vec3 ring = vec3(cos(u_ang), sin(u_ang), u_seed);
  if (u_mode < 0.5) {
    // planeta com anel: faixas de ruído girando, luz lateral; fundo escuro com estrelas esparsas
    float r = 0.235;
    vec2 d = uv / r;
    float bg = 0.1 - 0.08 * length(uv) + 0.06 * fbm(vec3(uv * 1.5, u_seed) + 0.3 * ring);
    vec2 sc = floor(uv * 160.0);
    float st = hash(sc + u_seed);
    bg += step(0.992, st) * (0.5 + 0.5 * sin(u_ang * 2.0 + st * 80.0));
    // anel: elipse inclinada; a metade de trás fica escondida pelo planeta
    float ca = cos(-0.32), sa = sin(-0.32);
    vec2 e = vec2(ca * d.x - sa * d.y, sa * d.x + ca * d.y);
    float er = length(vec2(e.x, e.y / 0.26));
    float ringV = 0.0;
    float inRing = step(1.35, er) * step(er, 2.05);
    if (inRing > 0.0) {
      float gaps = 0.55 + 0.25 * sin(er * 38.0) + 0.2 * step(1.68, er) * step(er, 1.74) * -2.0;
      ringV = clamp(gaps, 0.0, 1.0) * (0.55 + 0.35 * smoothstep(1.0, -1.0, e.x));
    }
    float l2 = dot(d, d);
    bool front = e.y < 0.0;
    if (l2 > 1.0) return inRing > 0.0 ? ringV : bg;
    if (inRing > 0.0 && front) return ringV;
    vec3 n = vec3(d, sqrt(1.0 - l2));
    vec3 q = rotX(rotY(n, u_ang), 0.3);
    float bands = sin(q.y * 7.0 * u_scale + 1.4 * fbm(q * 1.6 * u_scale + vec3(u_seed)));
    float tex = 0.62 + 0.22 * bands + 0.12 * fbm(q * 4.0 * u_scale + vec3(u_seed));
    vec3 L = normalize(vec3(-0.75, 0.35, 0.55));
    float dif = clamp(dot(n, L) * 1.1 + 0.05, 0.0, 1.0);
    // sombra do anel no planeta (faixa logo abaixo da elipse)
    float sh = 1.0 - 0.6 * smoothstep(0.08, 0.0, abs(e.y + 0.18 * (1.0 - e.x * e.x) - 0.05));
    return tex * dif * sh + 0.04;
  }
  if (u_mode < 1.5) {
    // mar à noite: céu em degradê, lua com halo e o reflexo dela quebrado pelas ondas
    float hz = 0.06;
    vec2 moon = vec2(0.32 * min(1.0, u_res.x / u_res.y), 0.27);
    if (uv.y > hz) {
      float sky = 0.08 + 0.32 * exp(-(uv.y - hz) * 5.0);
      float dm = length(uv - moon);
      sky += 0.35 * exp(-dm * 6.0);
      sky += 0.08 * fbm(vec3(uv.x * 2.0 * u_scale, uv.y * 7.0 * u_scale, u_seed) + 0.25 * ring) * smoothstep(hz, 0.4, uv.y);
      return dm < 0.075 ? 1.0 : sky;
    }
    // plano do mar em perspectiva
    // profundidade "achatada" (expoente < 1): no 9:16 o mar vai muito para perto e as ondas da frente
    // ficariam enormes com a perspectiva exata
    float z = 0.12 / pow(max(hz - uv.y, 1e-3), 0.65);
    vec2 P = vec2(uv.x * z, z) * 42.0 * u_scale;
    float wv = 0.0;
    wv += sin(P.x * 0.9 + P.y * 1.6 - 2.0 * u_ang);
    wv += 0.7 * sin(P.x * -1.3 + P.y * 2.3 - 3.0 * u_ang + 1.3);
    wv += 0.5 * sin(P.x * 2.9 + P.y * 3.1 - 5.0 * u_ang + 4.1);
    wv += 0.4 * fbm(vec3(P * 0.8, u_seed) + 0.5 * ring);
    // reflexo: faixa vertical sob a lua, alargando perto do observador
    float near = hz - uv.y;
    float lane = exp(-pow((uv.x - moon.x) / (0.06 + 0.3 * near), 2.0));
    float crest = smoothstep(0.2, 1.6, wv);
    float glint = crest * lane;
    // perto do horizonte as ondas viram ruído: atenua a textura e deixa a névoa clara
    float fade = smoothstep(0.0, 0.08, near);
    float sea = 0.07 + fade * 0.26 * crest * (0.6 + 0.4 * lane) + 0.3 * exp(-near * 16.0);
    // primeiro plano escurece (o olhar vai para o horizonte)
    return (sea + 0.85 * glint) * mix(1.0, 0.55, smoothstep(0.25, 0.9, near));
  }
  // gradiente: ondas largas de luz atravessando a tela (dá para ver a rampa inteira do Bayer)
  float g = 0.5 + 0.5 * sin(uv.x * 2.4 * u_scale + 0.9 * sin(uv.y * 2.0 * u_scale + u_ang) - u_ang);
  g = mix(g, 0.5 + 0.5 * sin(length(uv - 0.25 * vec2(cos(u_ang), sin(2.0 * u_ang))) * 7.0 * u_scale - 2.0 * u_ang), 0.45);
  return g;
}
void main() {
  // o shader roda numa grade de 1 fragmento por pixel grande (bem mais barato) e é ampliado sem suavização
  vec2 cell = floor(gl_FragCoord.xy);
  vec2 uv = (cell + 0.5 - 0.5 * u_res) / min(u_res.x, u_res.y);
  float v = scene(uv);
  v = (v - 0.5) * u_contrast + 0.5 + u_bright;
  float on = step(bayer8(ivec2(cell)), clamp(v, 0.0, 1.0));
  outColor = vec4(mix(u_dark, u_light, on), 1.0);
}`;

export default {
  id: 'dither',
  title: 'Dither',
  description: 'Cena em 1-bit com dithering Bayer, como Obra Dinn ou Playdate: planeta com anel, mar sob a lua ou ondas de luz.',
  category: 'fundos',
  tags: ['fundo', 'loop', 'shader', 'padrão'],
  duration: 12,

  params: {
    mode: { type: 'select', label: 'Cena', options: ['planeta', 'mar', 'ondas'], default: 'planeta' },
    dark: { type: 'color', label: 'Cor escura', default: '#1f1e1a' },
    light: { type: 'color', label: 'Cor clara', default: '#e6e1d3' },
    pixel: { type: 'range', label: 'Tamanho do pixel', min: 1, max: 16, step: 1, default: 4 },
    scale: { type: 'range', label: 'Escala', min: 0.4, max: 2.5, step: 0.05, default: 1 },
    bright: { type: 'range', label: 'Brilho', min: -0.4, max: 0.4, step: 0.01, default: 0 },
    contrast: { type: 'range', label: 'Contraste', min: 0.5, max: 2.5, step: 0.05, default: 1.2 },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 5 },
  },

  render(ctx, t, { w, h, p, px, progress }) {
    // pixel grande em px reais (inteiro, ≥ 1). A grade cobre a tela com sobra na borda; o shader desenha
    // W×H fragmentos e o drawImage amplia por `c` exato, sem filtro.
    const c = Math.max(1, Math.round(p.pixel * px));
    const W = Math.ceil((w * px) / c);
    const H = Math.ceil((h * px) / c);
    ctx.imageSmoothingEnabled = false;
    shader(ctx, FRAG, {
      u_ang: TAU * progress,
      u_mode: { planeta: 0, mar: 1, ondas: 2 }[p.mode] ?? 0,
      u_scale: p.scale,
      u_bright: p.bright,
      u_contrast: p.contrast,
      u_seed: p.seed * 3.71,
      u_dark: p.dark,
      u_light: p.light,
    }, { w: (W * c) / px, h: (H * c) / px, px: px / c });
    ctx.imageSmoothingEnabled = true;
  },
};
