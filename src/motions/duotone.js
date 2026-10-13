import { TAU, seg, ease } from '../lib/anim.js';
import { asset } from '../lib/assets.js';
import { coverRect } from '../lib/image.js';
import { shader } from '../lib/gl.js';

// Duotone no estilo Spotify: a luminância da foto vira um gradiente entre duas cores (sombra → luz).
// Três pares em ciclo; a troca é uma varredura diagonal que também segue o brilho (as luzes mudam
// antes das sombras). Zoom leve em cosseno e grão por quadro (24 por segundo, inteiro na duração),
// então t=0 e t=duration são o mesmo quadro.
const FRAG = `
uniform sampler2D u_img;
uniform vec4 u_rect;     // retângulo cover normalizado (x, y, w, h), origem em cima à esquerda
uniform vec3 u_a0;
uniform vec3 u_a1;
uniform vec3 u_b0;
uniform vec3 u_b1;
uniform float u_edge;    // frente da troca de par: -0.25 (nada) → 1.25 (tudo)
uniform float u_contrast;
uniform float u_grain;
uniform float u_frame;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec2 s = vec2(gl_FragCoord.x / u_res.x, 1.0 - gl_FragCoord.y / u_res.y);
  vec2 uv = (s - u_rect.xy) / u_rect.zw;
  vec3 c = texture(u_img, vec2(uv.x, 1.0 - uv.y)).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  // contraste em S em torno do meio-tom
  float k = 0.5 / u_contrast;
  l = smoothstep(0.5 - k, 0.5 + k, l);
  float f = 0.6 * (s.x * 0.65 + (1.0 - s.y) * 0.35) + 0.4 * (1.0 - l);
  float m = smoothstep(f - 0.12, f + 0.12, u_edge);
  vec3 a = mix(u_a0, u_a1, l);
  vec3 b = mix(u_b0, u_b1, l);
  vec3 col = mix(a, b, m);
  // vinheta na própria cor da sombra (escurece sem puxar o matiz)
  vec2 q = s - 0.5;
  col = mix(col, mix(u_a0, u_b0, m) * 0.7, 0.55 * smoothstep(0.35, 0.95, length(q * vec2(1.0, 0.8)) * 1.2));
  float g = hash(floor(gl_FragCoord.xy) + u_frame * 17.31) + hash(floor(gl_FragCoord.xy) * 1.7 + u_frame * 3.7) - 1.0;
  col += g * u_grain;
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'duotone',
  title: 'Duotone',
  description: 'The photo in two colors, Spotify style, with color pairs cycling in a sweep, plus grain and a slow zoom.',
  category: 'imagem',
  tags: ['loop', 'gradient', 'shader', 'background'],
  duration: 9,
  poster: 1.2,

  params: {
    image: { type: 'image', label: 'Photo', default: '/samples/portrait.jpg' },
    shadow1: { type: 'color', label: 'Pair 1 · shadow', default: '#1b1464' },
    light1: { type: 'color', label: 'Pair 1 · light', default: '#ff6aa6' },
    shadow2: { type: 'color', label: 'Pair 2 · shadow', default: '#0a2a52' },
    light2: { type: 'color', label: 'Pair 2 · light', default: '#2ee59d' },
    shadow3: { type: 'color', label: 'Pair 3 · shadow', default: '#5c0d24' },
    light3: { type: 'color', label: 'Pair 3 · light', default: '#ffcb57' },
    contrast: { type: 'range', label: 'Contrast', min: 0.6, max: 2.5, step: 0.05, default: 1.25 },
    zoom: { type: 'range', label: 'Zoom', min: 0, max: 0.2, step: 0.01, default: 0.06 },
    grain: { type: 'range', label: 'Grain', min: 0, max: 0.2, step: 0.005, default: 0.06 },
    focusY: { type: 'range', label: 'Vertical focus', min: 0, max: 1, step: 0.01, default: 0.3 },
  },

  render(ctx, t, env) {
    const { w, h, p, duration, progress } = env;
    const img = asset(p.image);
    if (!img) {
      ctx.fillStyle = p.shadow1;
      ctx.fillRect(0, 0, w, h);
      return;
    }
    const pairs = [[p.shadow1, p.light1], [p.shadow2, p.light2], [p.shadow3, p.light3]];
    const span = duration / pairs.length;
    const tt = ((t % duration) + duration) % duration;
    const i = Math.min(pairs.length - 1, Math.floor(tt / span));
    const local = tt - i * span;
    const sweep = ease.inOutCubic(seg(local, span - 1.1, span));
    const a = pairs[i], b = pairs[(i + 1) % pairs.length];
    // zoom em cosseno: 1 → 1+zoom → 1 na duração
    const z = 1 + p.zoom * (0.5 - 0.5 * Math.cos(TAU * progress));
    const r = coverRect(img, w, h, { zoom: 1.02 * z, fx: 0.5, fy: p.focusY });
    shader(ctx, FRAG, {
      u_img: img,
      u_rect: [r.x / w, r.y / h, r.w / w, r.h / h],
      u_a0: a[0], u_a1: a[1], u_b0: b[0], u_b1: b[1],
      u_edge: -0.25 + 1.5 * sweep,
      u_contrast: p.contrast,
      u_grain: p.grain,
      u_frame: Math.floor(tt * 24) % 997,
    }, env);
  },
};
