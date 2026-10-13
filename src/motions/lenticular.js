import { TAU, clamp } from '../lib/anim.js';
import { asset } from '../lib/assets.js';
import { coverRect } from '../lib/image.js';
import { shader } from '../lib/gl.js';

// Cartão lenticular: um cartão em perspectiva que gira em torno do eixo vertical e troca de foto
// conforme o ângulo. Tudo num fragment shader: cada pixel lança um raio da câmera até o plano do cartão
// (perspectiva correta), acha a coordenada no cartão e a direção de visão no referencial dele. As lentes
// são cilindros verticais; sob cada uma há duas faixas intercaladas (A e B). O ponto visto sob a lente
// depende do ângulo de visão (e da posição dentro da lente, pela refração), então durante a virada
// surgem as listras finas típicas e uma frente de troca que atravessa o cartão (a perspectiva muda o
// ângulo de um lado ao outro). Por cima: brilho estreito em cada lente que corre com o ângulo, reflexo
// largo do plástico, aro na borda e a sombra suave no fundo. As fotos são recortadas (cover) no tamanho
// do cartão no setup e vão para a GPU como ImageData (sobe uma vez; canvas subiria a cada quadro).

const FRAG = `
const float TAU = 6.28318530718;
uniform vec2 u_size;
uniform vec3 u_ex, u_ey, u_n;
uniform float u_D, u_rad, u_lens, u_ridge, u_gloss, u_gain, u_theta, u_cy, u_shadow;
uniform vec2 u_half, u_shHalf;
uniform vec3 u_bg;
uniform sampler2D u_A, u_B;

float sdRB(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  vec2 f = gl_FragCoord.xy / u_res * u_size;
  float m = min(u_size.x, u_size.y);
  // origem no centro do cartão, y para baixo (unidades lógicas)
  vec2 P = vec2(f.x - u_size.x * 0.5, (u_size.y - f.y) - u_size.y * 0.5 - u_cy);

  // fundo: luz central suave + sombra do cartão
  vec2 uvS = (f / u_size) - 0.5;
  float lightBg = 1.0 - dot(uvS * vec2(u_size.x / m, u_size.y / m), uvS * vec2(u_size.x / m, u_size.y / m)) * 0.55;
  vec3 col = u_bg * (0.78 + 0.32 * lightBg);
  float sd = sdRB(P - vec2(0.0, m * 0.045), u_shHalf, u_rad);
  float sh = 1.0 - smoothstep(-m * 0.05, m * 0.07, sd);
  col *= 1.0 - u_shadow * sh;

  // raio da câmera até o plano do cartão
  vec3 E = vec3(0.0, 0.0, -u_D);
  vec3 dir = vec3(P, u_D);
  float den = dot(dir, u_n);
  float tt = dot(-E, u_n) / den;
  vec3 H = E + tt * dir;
  vec2 L = vec2(dot(H, u_ex), dot(H, u_ey));
  float d = sdRB(L, u_half, u_rad);
  float aa = max(fwidth(d), 1e-3);
  float cover = clamp(0.5 - d / aa, 0.0, 1.0);

  if (cover > 0.0) {
    vec2 uv = L / (2.0 * u_half) + 0.5;
    vec3 V = normalize(H - E);
    float a = atan(dot(V, u_ex), dot(V, u_n));           // ângulo de visão no referencial do cartão
    float x = uv.x * u_lens;
    float s = fract(x);
    // ponto visto sob a lente: ângulo + refração pela posição na lente
    float q = fract(0.5 - u_gain * a + (s - 0.5) * 0.14);
    float c = cos(TAU * (q - 0.75));                      // +1 = centro da faixa A, -1 = B
    float wA = smoothstep(-0.3, 0.3, c);
    vec2 tuv = vec2(uv.x, 1.0 - uv.y);
    vec3 ca = texture(u_A, tuv).rgb;
    vec3 cb = texture(u_B, tuv).rgb;
    vec3 card = mix(cb, ca, wA);
    // ghosting leve na troca
    card = mix(card, (ca + cb) * 0.5, 0.12 * (1.0 - abs(c)));

    // relevo das lentes: sombreamento cilíndrico + brilho fino que corre com o ângulo
    float shade = 1.0 - u_ridge * 0.07 * (0.5 - 0.5 * cos(TAU * s));
    float sp = pow(max(0.0, cos(TAU * (s - 0.5 + a * 2.2) * 0.5)), 60.0);
    card = card * shade + u_ridge * 0.16 * sp;

    // reflexo largo do plástico (diagonal), corre com a rotação
    float band = (uv.x * 0.85 + uv.y * 0.45) - (0.62 + u_theta * 2.4);
    card += u_gloss * 0.22 * exp(-band * band / 0.012);
    card += u_gloss * 0.05 * (1.0 - uv.y);
    // aro na borda (corte do plástico)
    float rim = smoothstep(-m * 0.006, 0.0, d);
    card = mix(card, vec3(0.92), rim * 0.55);

    col = mix(col, card, cover);
  }
  // dither contra banding
  col += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
  outColor = vec4(col, 1.0);
}
`;

// recortes em cover no tamanho do cartão (cache: o setup roda de novo a cada mudança)
const cropCache = new Map();
let gray = null;
function crop(img, url, W, H, fy) {
  const key = `${url}|${W}x${H}|${fy}`;
  let v = cropCache.get(key);
  if (v) return v;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true });
  const r = coverRect(img, W, H, { fy });
  g.drawImage(img, r.x, r.y, r.w, r.h);
  v = g.getImageData(0, 0, W, H);
  if (cropCache.size > 12) cropCache.clear();
  cropCache.set(key, v);
  return v;
}
function placeholder() {
  if (!gray) {
    gray = new ImageData(2, 2);
    gray.data.fill(120);
    for (let i = 3; i < 16; i += 4) gray.data[i] = 255;
  }
  return gray;
}

export default {
  id: 'lenticular',
  title: 'Cartão lenticular',
  description: 'Um cartão lenticular em perspectiva inclina de um lado para o outro e troca entre duas fotos, com listras e brilho das lentes.',
  category: 'imagem',
  tags: ['3d', 'loop', 'shader'],
  duration: 6,
  poster: 1.5,

  params: {
    imageA: { type: 'image', label: 'Foto A', default: '/samples/portrait.jpg' },
    imageB: { type: 'image', label: 'Foto B', default: '/samples/landscape.jpg' },
    focusA: { type: 'range', label: 'Foco vertical A', min: 0, max: 1, step: 0.01, default: 0.3 },
    focusB: { type: 'range', label: 'Foco vertical B', min: 0, max: 1, step: 0.01, default: 0.5 },
    tilt: { type: 'range', label: 'Inclinação (graus)', min: 8, max: 35, step: 1, default: 24 },
    lenses: { type: 'range', label: 'Lentes', min: 30, max: 160, step: 1, default: 80 },
    ridge: { type: 'range', label: 'Relevo das lentes', min: 0, max: 1.5, step: 0.05, default: 1 },
    gloss: { type: 'range', label: 'Brilho', min: 0, max: 1.5, step: 0.05, default: 1 },
    bg: { type: 'color', label: 'Fundo', default: '#1b1c20' },
  },

  setup({ w, h, p, px }) {
    const m = Math.min(w, h);
    // cartão 4:5, cabe com folga para a rotação e a sombra
    let ch = h * 0.76;
    let cw = ch * 0.8;
    if (cw > w * 0.74) {
      cw = w * 0.74;
      ch = cw / 0.8;
    }
    const sc = Math.max(px, 0.25);
    const W = Math.max(2, Math.round(cw * sc)), H = Math.max(2, Math.round(ch * sc));
    const A = asset(p.imageA), B = asset(p.imageB);
    return {
      m, cw, ch, sc,
      texA: A ? crop(A, p.imageA, W, H, p.focusA) : placeholder(),
      texB: B ? crop(B, p.imageB, W, H, p.focusB) : placeholder(),
    };
  },

  render(ctx, t, { w, h, p, px, progress, state: s }) {
    const th0 = (p.tilt * Math.PI) / 180;
    // vai e volta com pausas nos extremos: cos achatado (começa mostrando A)
    const c = Math.cos(TAU * progress);
    let k = 1.5 * c - 0.5 * c * c * c;
    k = 1.5 * k - 0.5 * k * k * k;
    const ry = th0 * k;
    // leve balanço vertical para mostrar o 3D
    const rx = -0.07 + 0.035 * Math.sin(TAU * progress * 2);
    const cy = s.m * 0.008 * Math.sin(TAU * progress * 2 + 0.6);
    const cyr = Math.cos(ry), syr = Math.sin(ry), cxr = Math.cos(rx), sxr = Math.sin(rx);
    // R = Ry * Rx aplicado aos eixos do cartão (x à direita, y para baixo, z para longe)
    const ex = [cyr, 0, -syr];
    const ey = [syr * sxr, cxr, cyr * sxr];
    const n = [syr * cxr, -sxr, cyr * cxr];
    const D = Math.max(w, h) * 1.15;
    // largura de uma lente em px reais: abaixo de ~3 px o relevo vira moiré, então some
    const lensPx = (s.cw * Math.abs(cyr) * px) / p.lenses;
    const ridge = p.ridge * clamp((lensPx - 2.2) / 3);
    const half = [s.cw / 2, s.ch / 2];
    shader(ctx, FRAG, {
      u_size: [w, h],
      u_ex: ex, u_ey: ey, u_n: n,
      u_D: D,
      u_rad: s.m * 0.022,
      u_half: half,
      u_shHalf: [half[0] * (0.25 + 0.7 * Math.abs(cyr)), half[1] * 0.96],
      u_lens: p.lenses,
      u_ridge: ridge,
      u_gloss: p.gloss,
      u_gain: 0.25 / (th0 * 0.85),
      u_theta: ry,
      u_cy: cy,
      u_shadow: 0.5,
      u_bg: p.bg,
      u_A: s.texA,
      u_B: s.texB,
    }, { w, h, px });
  },
};
