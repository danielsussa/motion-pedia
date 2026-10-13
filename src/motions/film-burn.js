import { seg, ease, rng } from '../lib/anim.js';
import { shader } from '../lib/gl.js';
import { createNoise } from '../lib/noise.js';

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

// Película queimando no projetor. Campo f = distância ao foco mais próximo (cada foco com atraso) + fbm.
// Fase 1: d = f − b; d < 0 é buraco (luz da lâmpada), depois borda incandescente, carvão, mancha de calor.
// Fase 2: a luz sai de dentro para fora (B aparece a partir dos focos), com borda alaranjada macia.
// Saída com alpha pré-multiplicado (overlay sobre a prévia ou, com transparent, sobre o vídeo).
// O ruído é estático: vai pré-calculado numa textura pequena (R: contorno, G: largura do carvão, B: brasas);
// simplex por pixel no shader ficava 5× mais caro.
const RES = 0.5; // resolução do shader (relativa à do canvas)
const NA = 0.36; // soma das amplitudes do ruído (limite para garantir cobertura total)

const texCache = new Map();
function noiseTexture(seed, w, h, s) {
  const key = `${seed}|${w}|${h}|${s}`;
  if (texCache.has(key)) return texCache.get(key);
  const m = Math.min(w, h);
  const TW = Math.max(8, Math.round(w * s));
  const TH = Math.max(8, Math.round(h * s));
  const c = document.createElement('canvas');
  c.width = TW;
  c.height = TH;
  const g = c.getContext('2d');
  const img = g.createImageData(TW, TH);
  const d = img.data;
  const N = createNoise(seed);
  for (let j = 0; j < TH; j++) {
    // mesma orientação do shader (gl_FragCoord tem y para cima; a textura chega em pé)
    const y = ((TH - 0.5 - j) / TH) * h / m - h / m / 2;
    for (let i = 0; i < TW; i++) {
      const x = ((i + 0.5) / TW) * w / m - w / m / 2;
      const n = 0.2 * N.noise2(x * 2.2, y * 2.2) + 0.11 * N.noise2(x * 6 + 31.1, y * 6 - 7.7) + 0.05 * N.noise2(x * 19 + 71.3, y * 19 + 13.9);
      const k = (j * TW + i) * 4;
      d[k] = Math.round((n / NA * 0.5 + 0.5) * 255);
      d[k + 1] = Math.round((N.noise2(x * 11 - 51.7, y * 11 + 3.3) * 0.5 + 0.5) * 255);
      d[k + 2] = Math.round((N.noise2(x * 60 + 5.5, y * 60 - 91.1) * 0.5 + 0.5) * 255);
      d[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  if (texCache.size > 12) texCache.delete(texCache.keys().next().value);
  texCache.set(key, c);
  return c;
}

const FRAG = `
uniform float u_b;
uniform float u_phase;
uniform float u_k;
uniform float u_rough;
uniform float u_flick;
uniform float u_cool;
uniform vec4 u_o01;
uniform vec4 u_o23;
uniform vec4 u_delay;
uniform float u_n;
uniform vec3 u_light;
uniform vec3 u_glow;
uniform vec3 u_char;
uniform sampler2D u_tex;
float field(vec2 q){
  float f = length(q - u_o01.xy) + u_delay.x;
  if (u_n > 1.5) f = min(f, length(q - u_o01.zw) + u_delay.y);
  if (u_n > 2.5) f = min(f, length(q - u_o23.xy) + u_delay.z);
  if (u_n > 3.5) f = min(f, length(q - u_o23.zw) + u_delay.w);
  return f;
}
void main(){
  float S = min(u_res.x, u_res.y);
  vec2 q = (gl_FragCoord.xy - 0.5 * u_res) / S;
  vec3 tx = texture(u_tex, gl_FragCoord.xy / u_res).rgb * 2.0 - 1.0;
  // contorno irregular em duas escalas + serrilhado fino (fbm de 3 oitavas, amplitudes somam ${NA})
  float n = tx.r * ${NA};
  float d = field(q) + n * u_rough - u_b;
  vec3 col = vec3(0.0);
  float a = 0.0;
  float aa = 1.5 / S;
  if (u_phase < 0.5) {
    if (d < 0.0) {
      // luz da lâmpada: laranja perto da borda, branco quente para dentro
      float deep = smoothstep(0.0, 0.11, -d);
      col = mix(u_glow * 1.15, u_light, deep) * u_flick;
      a = 1.0;
    }
    float e1 = 0.011;
    float e2 = 0.034 + 0.012 * tx.g;
    if (d >= 0.0 && d < e2 + aa) {
      // borda incandescente que esfria para o carvão
      float hot = 1.0 - smoothstep(0.0, e1, d);
      vec3 c = mix(u_char, u_glow * 1.25, hot);
      c = mix(c, u_light, (1.0 - smoothstep(0.0, e1 * 0.35, d)) * 0.7);
      // brasas pontuais no carvão
      float em = smoothstep(0.5, 0.8, tx.b);
      c += u_glow * em * (1.0 - hot) * 0.9;
      float edge = 1.0 - smoothstep(e2 - aa, e2 + aa, d);
      col = c * edge;
      a = edge;
    }
    if (d >= e2 - aa) {
      // mancha de calor (película tostando) e um brilho alaranjado logo além do carvão
      float x = d - e2;
      float scorch = (1.0 - smoothstep(0.0, 0.16, x)) * 0.62;
      float warm = (1.0 - smoothstep(0.0, 0.05, x)) * 0.35;
      float al = max(scorch, warm) * u_k;
      vec3 sc = mix(u_char * 0.9, u_glow * 0.7, warm / max(al, 1e-3) * u_k);
      // compõe por baixo da borda (que já tem cobertura 'a')
      col += sc * al * (1.0 - a);
      a += al * (1.0 - a);
    }
  } else {
    // fase 2: a luz recua para fora a partir dos focos; d > 0 é luz
    float lightA = smoothstep(-aa, aa, d);
    vec3 lc = mix(u_glow * 1.15, u_light, smoothstep(0.0, 0.09, d));
    lc = mix(lc, u_glow, u_cool * 0.55) * u_flick;
    float rim = (1.0 - smoothstep(0.0, 0.035, -d)) * step(d, 0.0) * 0.85 * u_k;
    col = lc * lightA + u_glow * rim * (1.0 - lightA);
    a = lightA + rim * (1.0 - lightA);
  }
  outColor = vec4(col, a);
}`;

export default {
  id: 'film-burn',
  title: 'Film Burn',
  description: 'A película queima no projetor: buracos de borda incandescente e carvão crescem até a luz da lâmpada tomar a tela, que depois recua revelando a próxima cena.',
  category: 'transicoes',
  tags: ['transição', 'shader', 'overlay', 'alpha'],
  duration: 1.8,
  poster: 0.36,

  params: {
    light: { type: 'color', label: 'Luz', default: '#fff3dc' },
    glow: { type: 'color', label: 'Brasa', default: '#ff6a1a' },
    char: { type: 'color', label: 'Carvão', default: '#1c0d05' },
    spots: { type: 'range', label: 'Focos', min: 1, max: 4, step: 1, default: 2 },
    rough: { type: 'range', label: 'Irregularidade', min: 0, max: 1.6, step: 0.01, default: 1 },
    flicker: { type: 'range', label: 'Tremulação da luz', min: 0, max: 1, step: 0.01, default: 0.5 },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 3 },
    colorA: { type: 'color', label: 'Prévia A', default: '#1a1c22' },
    colorB: { type: 'color', label: 'Prévia B', default: '#e7e2d8' },
    transparent: { type: 'boolean', label: 'Só as formas (alpha)', default: false },
  },

  setup({ w, h, p, px }) {
    const tex = noiseTexture(p.seed, w, h, px >= 0.5 ? 0.25 : 0.125);
    const m = Math.min(w, h);
    const ax = w / m / 2;
    const ay = h / m / 2;
    const r = rng(p.seed * 61 + 7);
    const n = Math.round(p.spots);
    const o = [];
    const delay = [0, 0, 0, 0];
    for (let k = 0; k < 4; k++) {
      // focos espalhados, longe das bordas; o primeiro um pouco fora do centro
      const x = (r() * 2 - 1) * ax * (k ? 0.75 : 0.35);
      const y = (r() * 2 - 1) * ay * (k ? 0.7 : 0.3);
      o.push(x, y);
      if (k) delay[k] = 0.08 + 0.1 * k + 0.08 * r();
    }
    // maior distância de um ponto da tela ao foco 0 (cota superior do campo)
    let fmax = 0;
    for (const [cx, cy] of [[-ax, -ay], [ax, -ay], [-ax, ay], [ax, ay]]) fmax = Math.max(fmax, Math.hypot(cx - o[0], cy - o[1]));
    return { o, delay, n, fmax, tex };
  },

  render(ctx, t, env) {
    const { w, h, p, duration, px, state } = env;
    preview(ctx, t, env);
    const { o, delay, n, fmax, tex } = state;
    const mid = duration / 2;
    const amp = NA * p.rough;
    const phase = t < mid ? 0 : 1;
    let b;
    let k; // intensidade das manchas/brilhos fora da área queimada
    let cool = 0;
    if (!phase) {
      // começa num ponto e acelera (a película cede de vez)
      const u = seg(t, duration * 0.05, mid * 0.94);
      if (u <= 0) return;
      const e = 0.12 * ease.outCubic(seg(u, 0, 0.3)) + 0.88 * ease.inCubic(u);
      b = -amp - 0.02 + (fmax + 2 * amp + 0.08) * e;
      k = Math.min(1, u * 5);
    } else {
      const u = seg(t, mid + duration * 0.02, duration * 0.95);
      if (u >= 1) return;
      // a luz recua: b sobe de abaixo do mínimo do campo até acima do máximo (+ largura da borda)
      b = -amp * 0.75 - 0.012 + (fmax + 1.75 * amp + 0.16) * (1 - (1 - u) ** 2);
      k = 1 - seg(u, 0.75, 1);
      cool = ease.inCubic(u);
    }
    // tremulação de lâmpada: muda a cada quadro de filme (24 por segundo)
    const fr = Math.floor(t * 24);
    const hsh = Math.abs(Math.sin(fr * 12.9898 + p.seed * 78.233) * 43758.5453) % 1;
    const flick = 1 - p.flicker * 0.14 * hsh;
    shader(ctx, FRAG, {
      u_time: t,
      u_b: b,
      u_phase: phase,
      u_k: k,
      u_rough: p.rough,
      u_tex: tex,
      u_flick: flick,
      u_cool: cool,
      u_o01: [o[0], -o[1], o[2], -o[3]],
      u_o23: [o[4], -o[5], o[6], -o[7]],
      u_delay: delay,
      u_n: n,
      u_light: p.light,
      u_glow: p.glow,
      u_char: p.char,
    }, { w, h, px: px * RES });
  },
};
