import { TAU, ease, seg, hexToRgb } from '../lib/anim.js';
import { asset } from '../lib/assets.js';
import { coverRect } from '../lib/image.js';
import { shader } from '../lib/gl.js';

// Color pop: a foto em preto e branco, só os pixels com matiz perto da cor escolhida ficam coloridos.
// A máscara é por distância de matiz (com tolerância e borda suave), exigindo saturação e brilho mínimos
// (cinzas e pretos não têm matiz confiável). Varredura: uma faixa diagonal passa acendendo a cor (na
// própria faixa a foto inteira aparece colorida por um instante), a cor respira, e outra faixa passa
// apagando. Pulso: a janela de matiz abre e fecha em seno. Nos dois modos t=0 e t=duration são P&B.
const FRAG = `
uniform sampler2D u_img;
uniform vec4 u_rect;
uniform float u_hue;      // matiz alvo 0..1
uniform float u_tol;      // meia-largura da janela (fração de volta)
uniform float u_soft;
uniform float u_satMin;
uniform float u_on;       // frente que acende (coordenada da varredura)
uniform float u_off;      // frente que apaga
uniform float u_band;     // força da faixa colorida na frente
uniform float u_vivid;
uniform float u_contrast;
uniform vec3 u_tone;
uniform float u_grain;
uniform float u_frame;
float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x);
}
void main() {
  vec2 s = vec2(gl_FragCoord.x / u_res.x, 1.0 - gl_FragCoord.y / u_res.y);
  vec2 uv = (s - u_rect.xy) / u_rect.zw;
  vec3 c = texture(u_img, vec2(uv.x, 1.0 - uv.y)).rgb;
  vec3 hsv = rgb2hsv(c);
  float dh = abs(fract(hsv.x - u_hue + 0.5) - 0.5);
  float m = 1.0 - smoothstep(u_tol, u_tol + u_soft, dh);
  // croma (sat × brilho) mínimo: cabelo escuro tem matiz avermelhado de JPEG que vira mancha
  m *= smoothstep(u_satMin, u_satMin + 0.15, hsv.y) * smoothstep(0.1, 0.2, hsv.y * hsv.z);

  // varredura diagonal: coordenada 0..1 da esquerda-baixo para a direita-cima
  float u = s.x * 0.82 + (1.0 - s.y) * 0.18;
  float lit = (1.0 - smoothstep(u_on - 0.025, u_on + 0.025, u)) * smoothstep(u_off - 0.025, u_off + 0.025, u);
  float band = (exp(-pow((u - u_on + 0.03) / 0.05, 2.0)) + exp(-pow((u - u_off + 0.03) / 0.05, 2.0))) * u_band;

  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float k = 0.5 / u_contrast;
  float lm = smoothstep(0.5 - k, 0.5 + k, l);
  lm = mix(l, lm, 0.75);
  vec3 mono = lm * u_tone;
  vec3 vivid = clamp(mix(vec3(l), c, u_vivid), 0.0, 1.0);
  float amt = clamp(max(m * lit, band * 0.85), 0.0, 1.0);
  vec3 col = mix(mono, vivid, amt);
  // vinheta e grão (o grão muda 24 vezes por segundo)
  vec2 q = s - 0.5;
  col *= 1.0 - 0.35 * smoothstep(0.3, 0.9, length(q * vec2(1.0, 0.85)) * 1.25);
  float g = hash(floor(gl_FragCoord.xy) + u_frame * 17.31) + hash(floor(gl_FragCoord.xy) * 1.7 + u_frame * 3.7) - 1.0;
  col += g * u_grain;
  outColor = vec4(col, 1.0);
}`;

function hueOf(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d === 0) return 0;
  let h;
  if (mx === r) h = ((g - b) / d) % 6;
  else if (mx === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return ((h / 6) % 1 + 1) % 1;
}

export default {
  id: 'color-pop',
  title: 'Color Pop',
  description: 'Foto em preto e branco com só uma cor mantida; uma faixa varre a imagem acendendo e depois apagando a cor escolhida.',
  category: 'imagem',
  tags: ['loop', 'shader', 'fundo'],
  duration: 8,
  poster: 4,

  params: {
    image: { type: 'image', label: 'Foto', default: '/samples/portrait.jpg' },
    keep: { type: 'color', label: 'Cor mantida', default: '#a3122e' },
    tolerance: { type: 'range', label: 'Tolerância (graus)', min: 2, max: 90, step: 1, default: 20 },
    softness: { type: 'range', label: 'Borda (graus)', min: 1, max: 40, step: 1, default: 10 },
    satMin: { type: 'range', label: 'Saturação mínima', min: 0, max: 0.9, step: 0.01, default: 0.38 },
    anim: { type: 'select', label: 'Animação', options: ['varredura', 'pulso'], default: 'varredura' },
    vivid: { type: 'range', label: 'Vivacidade', min: 0.5, max: 2, step: 0.05, default: 1.25 },
    contrast: { type: 'range', label: 'Contraste do P&B', min: 0.6, max: 2.5, step: 0.05, default: 1.3 },
    tone: { type: 'color', label: 'Tom do P&B', default: '#f2f0ec' },
    grain: { type: 'range', label: 'Grão', min: 0, max: 0.15, step: 0.005, default: 0.04 },
    focusY: { type: 'range', label: 'Foco vertical', min: 0, max: 1, step: 0.01, default: 0.34 },
  },

  render(ctx, t, env) {
    const { w, h, p, duration, progress } = env;
    const img = asset(p.image);
    if (!img) {
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(0, 0, w, h);
      return;
    }
    const tt = ((t % duration) + duration) % duration;
    let on, off, band, tol;
    if (p.anim === 'pulso') {
      // janela de matiz abre e fecha (0 em t=0 e t=duration), com um respiro no meio
      const open = Math.sin(Math.PI * progress) ** 2;
      tol = (p.tolerance / 360) * open * (1 + 0.15 * Math.sin(TAU * 3 * progress));
      on = 2;
      off = -1;
      band = 0;
    } else {
      // acende 0,9–2,5 s, segura (respirando), apaga 5,9–7,5 s
      on = -0.2 + 1.4 * ease.inOutCubic(seg(tt, 0.9, 2.5));
      off = -0.2 + 1.4 * ease.inOutCubic(seg(tt, 5.9, 7.5));
      const hold = seg(tt, 2.5, 3.2) * (1 - seg(tt, 5.2, 5.9));
      tol = (p.tolerance / 360) * (1 + 0.18 * hold * Math.sin(TAU * (tt - 2.5) / 2.7));
      band = 1;
    }
    const z = 1.03 + 0.04 * (0.5 - 0.5 * Math.cos(TAU * progress));
    const r = coverRect(img, w, h, { zoom: z, fx: 0.5, fy: p.focusY });
    shader(ctx, FRAG, {
      u_img: img,
      u_rect: [r.x / w, r.y / h, r.w / w, r.h / h],
      u_hue: hueOf(p.keep),
      u_tol: Math.max(0, tol),
      u_soft: Math.max(0.002, p.softness / 360),
      u_satMin: p.satMin,
      u_on: on,
      u_off: off,
      u_band: band,
      u_vivid: p.vivid,
      u_contrast: p.contrast,
      u_tone: p.tone,
      u_grain: p.grain,
      u_frame: Math.floor(tt * 24) % 997,
    }, env);
  },
};
