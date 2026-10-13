import { ease, seg, clamp } from '../lib/anim.js';
import { asset } from '../lib/assets.js';
import { drawCover } from '../lib/image.js';
import { shader } from '../lib/gl.js';

// A foto vira desenho a traço: no setup a foto (já em cover) é lida numa grade fixa (~720 no lado menor,
// igual na miniatura) e passa por diferença de gaussianas (DoG, blur nativo do canvas): o lado escuro de
// cada borda vira traço. Uma ImageData leva RGB = foto borrada (a aquarela) e A = traço; ImageData não é
// canvas, então o gl.js sobe a textura uma vez só. No shader: o traço se desenha atrás de uma frente de
// ruído + distância ao rosto (os traços fortes saem antes dos fracos), a hachura vem logo atrás nas
// sombras, e depois a cor entra por baixo como aguada, com a borda do pigmento mais escura.
const FRAG = `
uniform sampler2D u_tex;
uniform vec2 u_wh;
uniform vec2 u_focus;
uniform float u_zoom;
uniform float u_m;
uniform vec3 u_ink;
uniform vec3 u_paper;
uniform float u_draw;
uniform float u_color;
uniform float u_hatch;
uniform float u_wash;
uniform float u_seed;

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  return 0.55 * vnoise(p) + 0.3 * vnoise(p * 2.1 + 5.3) + 0.15 * vnoise(p * 4.3 + 1.7);
}
// hachura: listras na direção dir, com a espessura vinda do escuro e um tremor de mão livre
float hatch(vec2 pos, vec2 dir, float period, float dark, float thr) {
  float u = dot(pos, dir) / period + 0.35 * vnoise(pos / (u_m * 0.03) + dir * 9.0);
  float d = abs(fract(u) - 0.5);
  float wdt = clamp((dark - thr) * 0.45, 0.0, 0.26);
  float aa = fwidth(u) * 0.75 + 1e-4;
  return (1.0 - smoothstep(wdt - aa, wdt + aa, d)) * step(0.01, wdt);
}
void main() {
  vec2 pos = vec2(gl_FragCoord.x / u_res.x, 1.0 - gl_FragCoord.y / u_res.y) * u_wh;
  vec2 s = pos / u_wh;
  s = u_focus + (s - u_focus) / u_zoom;
  vec4 tx = texture(u_tex, vec2(s.x, 1.0 - s.y));
  vec3 photo = tx.rgb;
  float line = tx.a;
  float lum = dot(photo, vec3(0.2126, 0.7152, 0.0722));

  // distância ao foco normalizada pela meia diagonal: mesma forma de revelação em qualquer proporção
  float dist = clamp(length(pos - u_focus * u_wh) / (0.5 * length(u_wh)), 0.0, 1.2);
  vec2 sd = vec2(u_seed * 7.31, u_seed * 3.17);
  float F = 0.55 * fbm(pos / (u_m * 0.22) + sd) + 0.45 * dist;
  float C = 0.45 * fbm(pos / (u_m * 0.3) + sd.yx + 11.0) + 0.55 * dist;

  // papel com fibra leve
  vec3 col = u_paper * (1.0 - 0.03 * vnoise(pos / (u_m * 0.004)) - 0.02 * vnoise(pos / (u_m * 0.05)));

  // aguada: cor da foto clareada e um pouco mais saturada, entra por baixo do traço
  float cm = 1.0 - smoothstep(u_color - 0.06, u_color, C);
  float rim = exp(-pow((C - u_color + 0.03) / 0.018, 2.0)) * step(0.001, cm);
  vec3 wc = mix(vec3(lum), photo, 1.25);
  wc = mix(wc, vec3(1.0), 0.18);
  wc *= 1.0 - 0.07 * vnoise(pos / (u_m * 0.012) + 3.0); // granulação do pigmento
  vec3 tint = mix(vec3(1.0), clamp(wc, 0.0, 1.0), u_wash * cm);
  tint *= 1.0 - 0.18 * rim * u_wash;
  col *= tint;

  // traço: atrás da frente aparece inteiro; na frente, os traços fortes chegam primeiro
  float x = (u_draw - F) / 0.1;
  float shown = clamp(x + 1.2 * line - 0.4, 0.0, 1.0);
  float lc = line * shown;
  // hachura nas sombras, um pouco atrás da frente do traço
  float hs = clamp((u_draw - F) / 0.12 - 0.6, 0.0, 1.0) * u_hatch;
  float dark = 1.0 - lum;
  float period = u_m / 115.0;
  float h1 = hatch(pos, normalize(vec2(0.62, 0.78)), period, dark, 0.55);
  float h2 = hatch(pos, normalize(vec2(-0.78, 0.62)), period * 1.15, dark, 0.84);
  float hc = max(h1, h2) * hs * mix(0.38, 0.12, cm);
  col *= mix(vec3(1.0), u_ink, max(lc * 0.95, hc));
  outColor = vec4(col, 1.0);
}`;

// lado menor da grade de detecção de borda (independe do tamanho real: a miniatura tem os mesmos traços)
const GRID = 720;

export default {
  id: 'line-drawing',
  title: 'Line Drawing',
  description: 'The photo becomes a line drawing that draws itself, gains hatching in the shadows, then gets color washed in underneath like watercolor.',
  category: 'imagem',
  tags: ['intro', 'shader'],
  duration: 9,
  poster: 6.2,

  params: {
    image: { type: 'image', label: 'Photo', default: '/samples/portrait.jpg' },
    ink: { type: 'color', label: 'Ink', default: '#22201e' },
    paper: { type: 'color', label: 'Paper', default: '#f4efe6' },
    detail: { type: 'range', label: 'Detail', min: 0, max: 1, step: 0.01, default: 0.55 },
    weight: { type: 'range', label: 'Stroke weight', min: 0.5, max: 2.5, step: 0.05, default: 1 },
    hatch: { type: 'range', label: 'Hatching', min: 0, max: 1, step: 0.01, default: 0.7 },
    wash: { type: 'range', label: 'Color wash', min: 0, max: 1, step: 0.01, default: 0.85 },
    spread: { type: 'range', label: 'Color reach', min: 0.3, max: 1.2, step: 0.01, default: 0.78 },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 3 },
    focusY: { type: 'range', label: 'Vertical focus', min: 0, max: 1, step: 0.01, default: 0.34 },
  },

  setup({ w, h, p }) {
    const img = asset(p.image);
    if (!img) return { tex: null };
    const k = GRID / Math.min(w, h);
    const W = Math.max(2, Math.round(w * k));
    const H = Math.max(2, Math.round(h * k));
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true });
    const read = (blur) => {
      g.clearRect(0, 0, W, H);
      g.filter = blur > 0 ? `blur(${blur}px)` : 'none';
      // um pouco maior que a tela para o blur não puxar transparência das bordas
      g.save();
      g.translate(-W * 0.02, -H * 0.02);
      drawCover(g, img, W * 1.04, H * 1.04, { fx: 0.5, fy: p.focusY });
      g.restore();
      return g.getImageData(0, 0, W, H).data;
    };
    const s1 = 1.3 * p.weight;
    const A = read(s1);
    const B = read(s1 * 1.6);
    const wash = read(3.2);
    const n = W * H;
    const out = new ImageData(W, H);
    const o = out.data;
    // limiar: mais detalhe = limiar mais baixo (cabelo e textura entram)
    const thr = 0.004 + (1 - p.detail) * 0.02;
    for (let i = 0; i < n; i++) {
      const j = i * 4;
      const la = (0.2126 * A[j] + 0.7152 * A[j + 1] + 0.0722 * A[j + 2]) / 255;
      const lb = (0.2126 * B[j] + 0.7152 * B[j + 1] + 0.0722 * B[j + 2]) / 255;
      // lado escuro da borda, normalizado de leve pelo brilho (sombras não viram borrão)
      const e = (lb - la) * (1.25 - 0.5 * lb);
      const v = clamp((e - thr) / (thr * 2.5));
      o[j] = wash[j];
      o[j + 1] = wash[j + 1];
      o[j + 2] = wash[j + 2];
      o[j + 3] = Math.round(255 * v * (2 - v)); // curva: meio-tom do traço fica mais firme
    }
    return { tex: out };
  },

  render(ctx, t, env) {
    const { w, h, p, duration, state } = env;
    if (!state.tex) {
      ctx.fillStyle = p.paper;
      ctx.fillRect(0, 0, w, h);
      return;
    }
    const draw = 0.04 + 1.25 * ease.inOutSine(seg(t, 0.2, 4.6));
    const color = -0.1 + (0.1 + p.spread) * ease.inOutCubic(seg(t, 4.5, 7.6));
    shader(ctx, FRAG, {
      u_tex: state.tex,
      u_wh: [w, h],
      u_focus: [0.5, 0.42],
      u_zoom: 1 + 0.05 * (t / duration),
      u_m: Math.min(w, h),
      u_ink: p.ink,
      u_paper: p.paper,
      u_draw: draw,
      u_color: color,
      u_hatch: p.hatch,
      u_wash: p.wash,
      u_seed: p.seed,
    }, env);
  },
};
