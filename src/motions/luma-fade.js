import { seg, ease } from '../lib/anim.js';
import { shader, GLSL_NOISE } from '../lib/gl.js';

// Fundo de prévia das transições: cena "A" antes do meio, "B" depois.
function preview(ctx, t, { w, h, p, duration }) {
  if (p.transparent) return;
  const isA = t < duration / 2;
  ctx.fillStyle = isA ? p.colorA : p.colorB;
  ctx.fillRect(0, 0, w, h);
  const m = Math.min(w, h);
  ctx.font = `800 ${m * 0.32}px Inter, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = isA ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.14)';
  ctx.fillText(isA ? 'A' : 'B', w / 2, h / 2 + m * 0.02);
}

const TEXTURES = ['nuvem', 'tinta', 'papel'];
const BIASES = { nenhuma: 0, 'esquerda→direita': 1, 'cima→baixo': 2, 'centro→bordas': 3 };

// Textura de luminância (calculada uma vez no setup, meia resolução).
const TEX_FRAG = `
uniform float u_kind;
uniform float u_seed;
uniform float u_scale;
${GLSL_NOISE}
float fbm(vec3 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 6; i++) { s += a * snoise(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; }
  return s;
}
void main() {
  vec2 q = gl_FragCoord.xy / u_res.y * u_scale;
  vec3 p = vec3(q, u_seed);
  float n;
  if (u_kind < 0.5) {
    n = fbm(p);
  } else if (u_kind < 1.5) {
    // tinta: domínio torcido, manchas de borda nítida que avançam em filamentos
    vec3 wq = vec3(fbm(p + vec3(4.1, 0.0, 0.0)), fbm(p + vec3(0.0, 7.3, 2.0)), 0.0);
    n = fbm(p * 0.8 + wq * 1.6);
    n = sign(n) * pow(abs(n), 0.7);
  } else {
    // papel: fibras alongadas em várias direções + mancha larga
    float f = 0.0;
    for (int i = 0; i < 4; i++) {
      float an = float(i) * 0.83 + u_seed;
      vec2 d = vec2(cos(an), sin(an));
      vec2 r = vec2(dot(q, d) * 2.0, dot(q, vec2(-d.y, d.x)) * 26.0);
      f += snoise(vec3(r, u_seed + float(i) * 3.7));
    }
    n = fbm(p * 0.7) * 0.8 + f * 0.07 + snoise(vec3(q * 60.0, u_seed)) * 0.02;
  }
  outColor = vec4(vec3(0.5 + 0.5 * n), 1.0);
}
`;

// Corte por limiar: n < limiar cobre (fase 1) / descobre (fase 2). Borda clara na frente do avanço.
const FRAG = `
uniform sampler2D u_tex;
uniform float u_lo;
uniform float u_hi;
uniform float u_th;
uniform float u_soft;
uniform float u_gw;      // largura da borda brilhante (em unidades de luminância)
uniform float u_glowAmt;
uniform float u_phase;   // 0 = cobrindo, 1 = descobrindo
uniform float u_zoom;
uniform float u_bias;
uniform float u_biasKind;
uniform vec3 u_cover;
uniform vec3 u_glow;
void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 tuv = 0.5 + (uv - 0.5) / u_zoom;
  float n = clamp((texture(u_tex, tuv).r - u_lo) / (u_hi - u_lo), 0.0, 1.0);
  if (u_biasKind > 0.5) {
    float g;
    if (u_biasKind < 1.5) g = uv.x;
    else if (u_biasKind < 2.5) g = 1.0 - uv.y;
    else { vec2 c = (uv - 0.5) * vec2(u_res.x / u_res.y, 1.0); g = length(c) / length(vec2(0.5 * u_res.x / u_res.y, 0.5)); }
    n = mix(n, g, u_bias);
  }
  float c;     // cobertura
  float rim;   // borda brilhante
  if (u_phase < 0.5) {
    c = 1.0 - smoothstep(u_th - u_soft, u_th, n);
    // halo à frente (do lado ainda descoberto) + filete na própria borda
    float ahead = (1.0 - smoothstep(u_th, u_th + u_gw, n)) * (1.0 - c);
    rim = ahead * 0.55 + c * smoothstep(u_th - u_soft - u_gw, u_th - u_soft * 0.5, n) * 0.9;
  } else {
    c = smoothstep(u_th - u_soft, u_th, n);
    float behind = smoothstep(u_th - u_gw, u_th, n) * (1.0 - c);
    rim = behind * 0.55 + c * (1.0 - smoothstep(u_th + u_soft * 0.5, u_th + u_soft + u_gw, n)) * 0.9;
  }
  rim *= u_glowAmt;
  // tom da massa varia um pouco com a própria textura (profundidade)
  vec3 body = u_cover * (0.82 + 0.3 * n);
  float a = clamp(c + rim * (1.0 - c), 0.0, 1.0);
  vec3 col = body * c * (1.0 - rim) + u_glow * rim;
  outColor = vec4(min(col, vec3(a)), a);
}
`;

export default {
  id: 'luma-fade',
  title: 'Luma Fade',
  description: 'A dissolve driven by a luminance texture (cloud, ink or paper fiber): the stain takes over the screen with a glowing edge, then recedes in the same order to reveal the next scene.',
  category: 'transicoes',
  tags: ['transition', 'shader', 'overlay', 'alpha'],
  duration: 1.6,
  poster: 0.42,

  params: {
    texture: { type: 'select', label: 'Texture', options: TEXTURES, default: 'tinta' },
    cover: { type: 'color', label: 'Cover color', default: '#ff4d2e' },
    glow: { type: 'color', label: 'Glowing edge', default: '#ffe2a8' },
    glowAmt: { type: 'range', label: 'Edge glow', min: 0, max: 1, step: 0.01, default: 0.8 },
    edge: { type: 'range', label: 'Edge width', min: 0.01, max: 0.3, step: 0.01, default: 0.09 },
    softness: { type: 'range', label: 'Softness', min: 0.005, max: 0.3, step: 0.005, default: 0.025 },
    scale: { type: 'range', label: 'Texture scale', min: 0.5, max: 6, step: 0.1, default: 1.6 },
    direction: { type: 'select', label: 'Direction', options: Object.keys(BIASES), default: 'nenhuma' },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 5 },
    colorA: { type: 'color', label: 'Preview A', default: '#1a1c22' },
    colorB: { type: 'color', label: 'Preview B', default: '#e7e2d8' },
    transparent: { type: 'boolean', label: 'Shapes only (alpha)', default: false },
  },

  setup({ w, h, p, px }) {
    const TW = Math.max(16, Math.round(w * px * 0.5));
    const TH = Math.max(16, Math.round(h * px * 0.5));
    const c = document.createElement('canvas');
    c.width = TW;
    c.height = TH;
    const g = c.getContext('2d', { willReadFrequently: true });
    shader(
      g,
      TEX_FRAG,
      { u_kind: Math.max(0, TEXTURES.indexOf(p.texture)), u_seed: p.seed * 1.37, u_scale: p.scale },
      { w: TW, h: TH, px: 1 },
    );
    // ImageData (e não o canvas) para a textura subir uma vez só para a GPU.
    const img = g.getImageData(0, 0, TW, TH);
    // Percentis para espalhar o avanço por toda a duração.
    const hist = new Uint32Array(256);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) hist[d[i]]++;
    const total = TW * TH;
    let acc = 0;
    let lo = 0;
    let hi = 255;
    for (let v = 0; v < 256; v++) {
      acc += hist[v];
      if (acc < total * 0.01) lo = v;
      if (acc <= total * 0.99) hi = v;
    }
    return { img, lo: lo / 255, hi: Math.max(lo + 2, hi) / 255 };
  },

  render(ctx, t, env) {
    const { p, duration, state } = env;
    preview(ctx, t, env);
    const mid = duration / 2;
    const closing = t < mid;
    const soft = p.softness;
    const gw = p.edge;
    const bias = BIASES[p.direction] ?? 0;
    // Limiar varre de "nada" a "tudo" (com folga da suavidade e da borda) dentro de cada metade.
    const lo = -soft - gw - 0.01;
    const hi = 1 + soft + gw + 0.01;
    let th;
    if (closing) {
      const u = seg(t, mid * 0.03, mid * 0.95);
      if (u <= 0) return;
      th = lo + (hi - lo) * (0.55 * ease.inOutSine(u) + 0.45 * ease.inCubic(u));
    } else {
      const u = seg(t, mid + duration * 0.03, duration * 0.97);
      if (u >= 1) return;
      th = lo + (hi - lo) * (0.55 * ease.inOutSine(u) + 0.45 * ease.outCubic(u));
    }
    shader(
      ctx,
      FRAG,
      {
        u_tex: state.img,
        u_lo: state.lo,
        u_hi: state.hi,
        u_th: th,
        u_soft: soft,
        u_gw: gw,
        u_glowAmt: p.glowAmt,
        u_phase: closing ? 0 : 1,
        u_zoom: 1 + 0.06 * (t / duration),
        u_bias: bias ? 0.45 : 0,
        u_biasKind: bias,
        u_cover: p.cover,
        u_glow: p.glow,
      },
      { w: env.w, h: env.h, px: env.px * 0.6 },
    );
  },
};
