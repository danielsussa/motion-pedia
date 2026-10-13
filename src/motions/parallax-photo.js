import { TAU } from '../lib/anim.js';
import { asset } from '../lib/assets.js';
import { coverRect } from '../lib/image.js';
import { shader } from '../lib/gl.js';

// Foto 2.5D: no setup a foto vira um mapa de "proximidade" (0 = longe, 1 = perto) numa grade pequena,
// somando três pistas que funcionam bem em fotos comuns: posição vertical (embaixo = perto), detalhe
// local (o que está nítido/texturizado costuma estar perto; céu, névoa e bokeh são lisos) e saturação
// (névoa e distância dessaturam). O mapa é normalizado por percentis, dilatado um pouco (o primeiro plano
// "engole" a borda, assim o fundo não fica grudado na silhueta) e bem borrado (sem degraus = sem rasgos).
// No shader, cada pixel faz um parallax occlusion mapping: percorre a proximidade de 1 → 0 procurando o
// primeiro ponto da foto que, deslocado pela câmera, cai neste pixel (o mais perto vence a oclusão), e
// refina entre os dois últimos passos. A câmera flutua numa figura de Lissajous com frequências inteiras
// de `progress` e um dolly que respira, então o loop fecha. Mapa em cache de módulo por URL.
const FRAG = `
uniform sampler2D u_img;
uniform sampler2D u_depth;
uniform vec4 u_rect;     // retângulo cover normalizado (x, y, w, h), origem em cima à esquerda
uniform vec2 u_shift;    // deslocamento da câmera (fração da tela) por unidade de proximidade
uniform float u_dolly;   // zoom extra por unidade de proximidade
uniform float u_focus;   // proximidade que não se move
uniform float u_show;    // 1 = mostra o mapa
uniform float u_haze;
uniform vec3 u_hazeColor;
uniform float u_vig;
uniform float u_grain;
uniform float u_frame;

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
vec2 toUV(vec2 s, float n) {
  float d = n - u_focus;
  vec2 q = 0.5 + (s - 0.5 - u_shift * d) / (1.0 + u_dolly * d);
  return (q - u_rect.xy) / u_rect.zw;
}
float depthAt(vec2 uv) { return texture(u_depth, vec2(uv.x, 1.0 - uv.y)).r; }

void main() {
  vec2 s = vec2(gl_FragCoord.x / u_res.x, 1.0 - gl_FragCoord.y / u_res.y);
  const int N = 14;
  float step = 1.0 / float(N);
  float n = 1.0;
  vec2 uv = toUV(s, n);
  float dp = depthAt(uv);
  float prevN = n, prevDiff = dp - n;
  vec2 prevUV = uv;
  for (int i = 0; i < N; i++) {
    if (dp >= n) break;
    prevN = n; prevDiff = dp - n; prevUV = uv;
    n -= step;
    uv = toUV(s, n);
    dp = depthAt(uv);
  }
  // refino linear entre o último passo "no ar" e o primeiro "dentro"
  float diff = dp - n;
  float k = clamp(diff / max(diff - prevDiff, 1e-4), 0.0, 1.0);
  float nn = mix(n, prevN, k);
  uv = toUV(s, nn);
  uv = clamp(uv, vec2(0.001), vec2(0.999));
  vec3 c = texture(u_img, vec2(uv.x, 1.0 - uv.y)).rgb;
  float dd = depthAt(uv);
  if (u_show > 0.5) c = vec3(dd);
  // névoa leve no que está longe (acentua a profundidade)
  c = mix(c, u_hazeColor, u_haze * (1.0 - smoothstep(0.0, 0.6, dd)) * (1.0 - u_show));
  vec2 q = s - 0.5;
  c *= 1.0 - u_vig * smoothstep(0.35, 0.9, length(q * vec2(1.0, 0.85)) * 1.15);
  float g = hash(floor(gl_FragCoord.xy) + u_frame * 17.31) + hash(floor(gl_FragCoord.xy) * 1.7 + u_frame * 3.7) - 1.0;
  c += g * u_grain;
  outColor = vec4(c, 1.0);
}`;

const cache = new Map();

// mapa de proximidade no espaço da imagem (G px de largura)
function depthMap(img) {
  const key = img.src || img;
  if (cache.has(key)) return cache.get(key);
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const G = 320;
  const GW = iw >= ih ? G : Math.round((G * iw) / ih);
  const GH = iw >= ih ? Math.round((G * ih) / iw) : G;
  const mk = () => {
    const c = document.createElement('canvas');
    c.width = GW; c.height = GH;
    return [c, c.getContext('2d', { willReadFrequently: true })];
  };
  const [a, ga] = mk();
  ga.drawImage(img, 0, 0, GW, GH);
  const src = ga.getImageData(0, 0, GW, GH).data;
  const [b, gb] = mk();
  gb.filter = `blur(${G * 0.008}px)`;
  gb.drawImage(a, 0, 0);
  const bl = gb.getImageData(0, 0, GW, GH).data;
  const n = GW * GH;
  const det = new Float32Array(n), sat = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = src[i * 4], g = src[i * 4 + 1], bb = src[i * 4 + 2];
    const L = 0.2126 * r + 0.7152 * g + 0.0722 * bb;
    const Lb = 0.2126 * bl[i * 4] + 0.7152 * bl[i * 4 + 1] + 0.0722 * bl[i * 4 + 2];
    det[i] = Math.abs(L - Lb) / 255;
    sat[i] = (Math.max(r, g, bb) - Math.min(r, g, bb)) / 255;
  }
  // detalhe regional: espalha o detalhe por uma vizinhança (blur do mapa de detalhe)
  const toCanvas = (arr, scale) => {
    const [c, g] = mk();
    const id = g.createImageData(GW, GH);
    for (let i = 0; i < n; i++) {
      const v = Math.min(255, arr[i] * scale);
      id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = v;
      id.data[i * 4 + 3] = 255;
    }
    g.putImageData(id, 0, 0);
    return c;
  };
  const readBlur = (c, r) => {
    const [o, g] = mk();
    g.filter = `blur(${r}px)`;
    g.drawImage(c, 0, 0);
    const d = g.getImageData(0, 0, GW, GH).data;
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = d[i * 4] / 255;
    return out;
  };
  const pct = (arr, lo, hi) => {
    const s = Float32Array.from(arr).sort();
    return [s[Math.floor(lo * (n - 1))], s[Math.floor(hi * (n - 1))]];
  };
  const detR = readBlur(toCanvas(det, 255 * 4), G * 0.02);
  const satR = readBlur(toCanvas(sat, 255), G * 0.012);
  const [d0, d1] = pct(detR, 0.05, 0.95);
  const [s0, s1] = pct(satR, 0.05, 0.95);
  const raw = new Float32Array(n);
  for (let y = 0; y < GH; y++) {
    const vy = y / (GH - 1);
    for (let x = 0; x < GW; x++) {
      const i = y * GW + x;
      const D = Math.min(1, Math.max(0, (detR[i] - d0) / (d1 - d0 + 1e-5)));
      const S = Math.min(1, Math.max(0, (satR[i] - s0) / (s1 - s0 + 1e-5)));
      const L = (0.2126 * src[i * 4] + 0.7152 * src[i * 4 + 1] + 0.0722 * src[i * 4 + 2]) / 255;
      raw[i] = 0.36 * vy * vy * (3 - 2 * vy) + 0.3 * D + 0.14 * S + 0.2 * (1 - L * (1 - S));
    }
  }
  const [r0, r1] = pct(raw, 0.03, 0.97);
  for (let i = 0; i < n; i++) raw[i] = Math.min(1, Math.max(0, (raw[i] - r0) / (r1 - r0 + 1e-5)));
  // dilata (máximo 3×3, duas vezes) e borra bem
  let cur = raw;
  for (let it = 0; it < 2; it++) {
    const nx = new Float32Array(n);
    for (let y = 0; y < GH; y++) {
      for (let x = 0; x < GW; x++) {
        let mx = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = Math.min(GH - 1, Math.max(0, y + dy));
          for (let dx = -1; dx <= 1; dx++) {
            const xx = Math.min(GW - 1, Math.max(0, x + dx));
            const v = cur[yy * GW + xx];
            if (v > mx) mx = v;
          }
        }
        nx[y * GW + x] = mx;
      }
    }
    cur = nx;
  }
  const final = toCanvas(cur, 255);
  const [out, go] = mk();
  go.filter = `blur(${G * 0.012}px)`;
  // margem: desenha também esticado por baixo para o blur não puxar preto nas bordas
  go.drawImage(final, -GW * 0.1, -GH * 0.1, GW * 1.2, GH * 1.2);
  go.drawImage(final, 0, 0);
  cache.set(key, out);
  return out;
}

export default {
  id: 'parallax-photo',
  title: 'Parallax Photo',
  description: 'The photo gains fake 2.5D depth as the camera drifts slowly, the foreground moving more than the background.',
  category: 'imagem',
  tags: ['loop', '3d', 'shader', 'background'],
  duration: 10,
  poster: 2.5,

  params: {
    image: { type: 'image', label: 'Photo', default: '/samples/landscape.jpg' },
    strength: { type: 'range', label: 'Depth', min: 0, max: 0.08, step: 0.002, default: 0.035 },
    dolly: { type: 'range', label: 'Dolly (breathing)', min: 0, max: 0.2, step: 0.005, default: 0.07 },
    focus: { type: 'range', label: 'Still plane', min: 0, max: 1, step: 0.05, default: 0.35 },
    orbit: { type: 'select', label: 'Motion', options: ['flutuar', 'lateral', 'vertical'], default: 'flutuar' },
    haze: { type: 'range', label: 'Background haze', min: 0, max: 0.4, step: 0.01, default: 0.08 },
    vignette: { type: 'range', label: 'Vignette', min: 0, max: 0.8, step: 0.05, default: 0.3 },
    grain: { type: 'range', label: 'Grain', min: 0, max: 0.15, step: 0.005, default: 0.03 },
    focusY: { type: 'range', label: 'Vertical focus', min: 0, max: 1, step: 0.01, default: 0.45 },
    showDepth: { type: 'boolean', label: 'Show depth map', default: false },
  },

  setup({ p }) {
    const img = asset(p.image);
    if (!img) return { depth: null };
    const depth = depthMap(img);
    // cor da névoa: média do terço de cima do mapa (o que está longe), lida da própria foto
    const c = document.createElement('canvas');
    c.width = 8; c.height = 8;
    const g = c.getContext('2d', { willReadFrequently: true });
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    g.drawImage(img, 0, 0, iw, ih * 0.35, 0, 0, 8, 8);
    const d = g.getImageData(0, 0, 8, 8).data;
    const avg = [0, 0, 0];
    for (let i = 0; i < 64; i++) for (let k = 0; k < 3; k++) avg[k] += d[i * 4 + k] / 255 / 64;
    return { depth, hazeColor: avg };
  },

  render(ctx, t, env) {
    const { w, h, p, progress, state: s } = env;
    const img = asset(p.image);
    if (!img || !s.depth) {
      ctx.fillStyle = '#16171a';
      ctx.fillRect(0, 0, w, h);
      return;
    }
    const m = Math.min(w, h);
    const a = p.strength;
    const ph = TAU * progress;
    let vx, vy;
    if (p.orbit === 'lateral') { vx = Math.sin(ph); vy = 0.12 * Math.sin(2 * ph); }
    else if (p.orbit === 'vertical') { vx = 0.12 * Math.sin(2 * ph); vy = Math.sin(ph); }
    else { vx = Math.sin(ph); vy = 0.55 * Math.sin(2 * ph + 0.9) ; }
    // em unidades de min(w, h) → fração da tela
    const shift = [(vx * a * m) / w, (vy * a * m) / h];
    const dolly = p.dolly * (0.5 - 0.5 * Math.cos(ph));
    // sobra de enquadramento para as bordas nunca aparecerem
    const reach = Math.max(p.focus, 1 - p.focus);
    const over = 1 + 2.2 * a * reach * (m / Math.min(w, h)) + dolly * reach + 0.01;
    const r = coverRect(img, w, h, { zoom: over, fx: 0.5, fy: p.focusY });
    shader(ctx, FRAG, {
      u_img: img,
      u_depth: s.depth,
      u_rect: [r.x / w, r.y / h, r.w / w, r.h / h],
      u_shift: shift,
      u_dolly: dolly,
      u_focus: p.focus,
      u_show: p.showDepth,
      u_haze: p.haze,
      u_hazeColor: s.hazeColor,
      u_vig: p.vignette,
      u_grain: p.grain,
      u_frame: Math.floor(t * 24) % 997,
    }, env);
  },
};
