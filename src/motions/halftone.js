import { clamp } from '../lib/anim.js';
import { asset } from '../lib/assets.js';
import { imageGrid } from '../lib/image.js';
import { shader } from '../lib/gl.js';

// Retícula: uma grade girada de pontos cujo tamanho vem da "tinta" da foto no centro de cada célula.
// No setup a foto é lida numa grade fina (imageGrid, meia célula) e vira uma textura pequena; o shader
// acha, para cada pixel, os 2×2 centros de célula mais próximos e desenha os pontos com antialias.
// (Em Canvas 2D eram ~14 mil arc() por quadro: 80 ms no software, 375 ms em CMYK. No shader é um passe só.)
// CMYK: quatro retículas (C 15°, M 75°, Y 0°, K 45°, somadas ao ângulo) multiplicadas sobre o papel.
// Entrada: os pontos crescem do centro para fora (mola); uma onda radial pulsa duas vezes; no fim os
// pontos encolhem de fora para dentro. t=0 e t=duration são o papel vazio, então o loop fecha.

const FRAG = `
uniform sampler2D u_grid;
uniform vec2 u_wh;
uniform vec2 u_gext;
uniform float u_cell;
uniform float u_ang;
uniform float u_t;
uniform float u_dur;
uniform float u_pulse;
uniform float u_contrast;
uniform float u_shape;
uniform float u_light;
uniform float u_cmyk;
uniform vec3 u_ink;
uniform vec3 u_paper;

const float TAU = 6.2831853;
float seg(float t, float a, float b) { return clamp((t - a) / (b - a), 0.0, 1.0); }
float spring(float x, float b) {
  if (x <= 0.0) return 0.0;
  if (x >= 1.0) return 1.0;
  return 1.0 - exp(-7.0 * x) * cos(x * 3.14159265 * (1.0 + b * 6.0));
}
float con(float v) { return clamp(0.5 + (v - 0.5) * u_contrast, 0.0, 1.0); }
vec3 photo(vec2 p) {
  p = clamp(p, vec2(0.0), u_wh);
  return texture(u_grid, vec2(p.x / u_gext.x, 1.0 - p.y / u_gext.y)).rgb;
}
float inkOf(vec3 c, int ch) {
  if (ch < 0) {
    float l = con(dot(c, vec3(0.2126, 0.7152, 0.0722)));
    return u_light > 0.5 ? l : 1.0 - l;
  }
  vec3 cmy = 1.0 - vec3(con(c.r), con(c.g), con(c.b));
  float k = min(cmy.x, min(cmy.y, cmy.z)); // o cinza comum vai todo para o preto (GCR)
  if (ch == 3) return k * 0.92;
  float v = ch == 0 ? cmy.x : (ch == 1 ? cmy.y : cmy.z);
  return clamp((v - k) / (1.0 - k + 1e-4), 0.0, 1.0) * 0.85;
}
// fator de animação (entrada × pulso × saída) pela distância normalizada ao centro. É calculado uma vez
// por pixel (não por ponto): a frente da onda anda ~1% de R por célula, diferença invisível.
float animAt(float d) {
  float a = 0.25 + d * 1.5;
  float grow = spring(seg(u_t, a, a + 0.9), 0.35);
  float b = u_dur - 1.3 + (1.0 - d) * 0.7;
  float s = seg(u_t, b, b + 0.55);
  float shrink = 1.0 - s * s * s;
  float wave = 1.0 + u_pulse * sin(TAU * 2.0 * u_t / u_dur - d * 9.0) * min(1.0, grow) * shrink;
  return grow * shrink * wave;
}
float cover(vec2 pos, float ang, int ch, float aa, float anim) {
  vec2 ctr = 0.5 * u_wh;
  float cs = cos(ang), sn = sin(ang);
  mat2 rot = mat2(cs, sn, -sn, cs);       // grade → tela
  vec2 g = transpose(rot) * (pos - ctr) / u_cell;
  vec2 base = floor(g);
  float cov = 0.0;
  for (int j = 0; j < 2; j++) {
    for (int i = 0; i < 2; i++) {
      vec2 c = base + vec2(float(i), float(j));
      if (u_shape > 1.5) { c.x = g.x; if (i == 1) continue; } // linha: espessura contínua ao longo da linha
      vec2 cp = ctr + rot * c * u_cell;
      float ink = inkOf(photo(cp), ch);
      if (ink < 0.02) continue; // sem isso o antialias deixa um pontinho em cada célula vazia
      float r = sqrt(ink) * anim;
      if (r < 0.03) continue;
      vec2 d = g - c;
      float sd;
      if (u_shape < 0.5) sd = length(d) - r * 0.59;
      else if (u_shape < 1.5) sd = max(abs(d.x), abs(d.y)) - r * 0.46;
      else sd = abs(d.y) - r * 0.5;
      cov = max(cov, smoothstep(aa, -aa, sd));
    }
  }
  return cov;
}
void main() {
  vec2 pos = vec2(gl_FragCoord.x / u_res.x, 1.0 - gl_FragCoord.y / u_res.y) * u_wh;
  float aa = 0.6 * (u_wh.x / u_res.x) / u_cell; // ~1 px real em unidades de célula
  float anim = animAt(length(pos - 0.5 * u_wh) / length(0.5 * u_wh));
  vec3 col;
  if (anim < 0.005) { outColor = vec4(u_paper, 1.0); return; }
  if (u_cmyk < 0.5) {
    col = mix(u_paper, u_ink, cover(pos, u_ang, -1, aa, anim));
  } else {
    col = u_paper;
    col *= mix(vec3(1.0), vec3(0.0, 0.64, 0.88), cover(pos, u_ang + 0.2618, 0, aa, anim));
    col *= mix(vec3(1.0), vec3(0.90, 0.0, 0.49), cover(pos, u_ang + 1.3090, 1, aa, anim));
    col *= mix(vec3(1.0), vec3(1.0, 0.83, 0.0), cover(pos, u_ang, 2, aa, anim));
    col *= mix(vec3(1.0), vec3(0.10, 0.10, 0.11), cover(pos, u_ang + 0.7854, 3, aa, anim));
  }
  outColor = vec4(col, 1.0);
}`;

const lum = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
};

export default {
  id: 'halftone',
  title: 'Halftone',
  description: 'A foto vira uma retícula de pontos que crescem do centro, pulsam numa onda e encolhem de volta.',
  category: 'imagem',
  tags: ['padrão', 'intro', 'loop', 'shader'],
  duration: 7,
  poster: 3.4,

  params: {
    image: { type: 'image', label: 'Foto', default: '/samples/portrait.jpg' },
    shape: { type: 'select', label: 'Forma', options: ['círculo', 'quadrado', 'linha'], default: 'círculo' },
    mode: { type: 'select', label: 'Cor', options: ['uma tinta', 'CMYK'], default: 'uma tinta' },
    ink: { type: 'color', label: 'Tinta', default: '#17161c' },
    paper: { type: 'color', label: 'Papel', default: '#f1ebdf' },
    cell: { type: 'range', label: 'Pontos (no lado menor)', min: 30, max: 200, step: 1, default: 90 },
    angle: { type: 'range', label: 'Ângulo', min: 0, max: 90, step: 1, default: 45 },
    contrast: { type: 'range', label: 'Contraste', min: 0.5, max: 2.5, step: 0.05, default: 1.15 },
    pulse: { type: 'range', label: 'Pulso', min: 0, max: 0.6, step: 0.01, default: 0.22 },
    focusY: { type: 'range', label: 'Foco vertical', min: 0, max: 1, step: 0.01, default: 0.3 },
  },

  setup({ w, h, p }) {
    const img = asset(p.image);
    if (!img) return { tex: null };
    const cell = Math.min(w, h) / p.cell;
    const fc = cell / 2;
    const g = imageGrid(img, { w, h, cell: fc, fx: 0.5, fy: p.focusY });
    const tex = document.createElement('canvas');
    tex.width = g.cols;
    tex.height = g.rows;
    const tg = tex.getContext('2d');
    const id = tg.createImageData(g.cols, g.rows);
    for (let i = 0, n = g.cols * g.rows; i < n; i++) {
      id.data[i * 4] = g.rgb[i * 3];
      id.data[i * 4 + 1] = g.rgb[i * 3 + 1];
      id.data[i * 4 + 2] = g.rgb[i * 3 + 2];
      id.data[i * 4 + 3] = 255;
    }
    tg.putImageData(id, 0, 0);
    return { tex, cell, gext: [g.cols * fc, g.rows * fc] };
  },

  render(ctx, t, env) {
    const { w, h, p, duration, state } = env;
    if (!state.tex) {
      ctx.fillStyle = p.paper;
      ctx.fillRect(0, 0, w, h);
      return;
    }
    shader(ctx, FRAG, {
      u_grid: state.tex,
      u_wh: [w, h],
      u_gext: state.gext,
      u_cell: state.cell,
      u_ang: (p.angle * Math.PI) / 180,
      u_t: clamp(t, 0, duration),
      u_dur: duration,
      u_pulse: p.pulse,
      u_contrast: p.contrast,
      u_shape: ['círculo', 'quadrado', 'linha'].indexOf(p.shape),
      u_light: lum(p.ink) > lum(p.paper),
      u_cmyk: p.mode === 'CMYK',
      u_ink: p.ink,
      u_paper: p.paper,
    }, env);
  },
};
