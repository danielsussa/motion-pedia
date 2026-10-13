import { TAU, ease, seg } from '../lib/anim.js';
import { shader } from '../lib/gl.js';

// Papel holográfico de cartão colecionável. Cor = filme fino (paleta cosseno) cuja fase depende da
// posição, da normal da folha ondulada (soma de senos, gradiente analítico) e da
// inclinação do cartão — que oscila com frequências inteiras do loop. O padrão de difração (arcos,
// escamas hexagonais, glitter) desloca a fase por região. Um reflexo largo atravessa na diagonal uma vez
// por loop (fora da tela em t=0 e t=duration).
const FRAG = `
uniform float u_ang;
uniform float u_sweep;
uniform float u_scale;
uniform float u_sat;
uniform float u_sheen;
uniform float u_crinkle;
uniform float u_pattern;
uniform float u_pal;
uniform float u_seed;
uniform vec3 u_base;
const float TAU = 6.28318530718;

vec3 hash3(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yxz + 33.33);
  return fract((q.xxy + q.yzz) * q.zyx);
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

// célula hexagonal: (centro relativo, id)
vec4 hexCell(vec2 p) {
  const vec2 s = vec2(1.0, 1.7320508);
  vec4 hc = floor(vec4(p, p - vec2(0.5, 1.0)) / s.xyxy) + 0.5;
  vec4 h = vec4(p - hc.xy * s, p - (hc.zw + 0.5) * s);
  return dot(h.xy, h.xy) < dot(h.zw, h.zw) ? vec4(h.xy, hc.xy) : vec4(h.zw, hc.zw + 0.5);
}
vec3 film(float ph) {
  // 0 arco-íris · 1 perolado (rosa/ciano/lilás) · 2 dourado
  vec3 off = u_pal < 0.5 ? vec3(0.0, 0.33, 0.67) : (u_pal < 1.5 ? vec3(0.0, 0.18, 0.42) : vec3(0.0, 0.08, 0.2));
  vec3 amp = u_pal < 0.5 ? vec3(0.5) : (u_pal < 1.5 ? vec3(0.26, 0.3, 0.2) : vec3(0.32, 0.27, 0.22));
  vec3 mid = u_pal < 0.5 ? vec3(0.5) : (u_pal < 1.5 ? vec3(0.76, 0.72, 0.86) : vec3(0.72, 0.58, 0.36));
  return mid + amp * cos(TAU * (ph + off));
}

// folha amassada: facetas planas (Voronoi) com normais aleatórias e vincos nas bordas
vec3 facets(vec2 p) {
  vec2 n = floor(p), f = fract(p);
  float d1 = 9.0, d2 = 9.0;
  vec2 best = vec2(0.0);
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec3 h = hash3(n + g + u_seed * 3.1);
    vec2 r = g + 0.15 + 0.7 * h.xy - f;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; best = n + g; } else if (d < d2) d2 = d;
  }
  vec3 h = hash3(best * 1.7 + 9.0 + u_seed);
  return vec3((h.xy - 0.5), sqrt(d2) - sqrt(d1));
}

void main() {
  float m = min(u_res.x, u_res.y);
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / m;
  vec2 tilt = vec2(0.5 * sin(u_ang), 0.32 * sin(2.0 * u_ang + 0.7));
  vec2 p = uv * u_scale;

  // ondulação larga da folha: soma de senos com fase deformada e gradiente analítico
  // (derivar o simplex por diferenças finitas mostrou as arestas das células como riscos retos)
  vec2 k1 = vec2(3.1, 1.6), k2 = vec2(-2.0, 4.1), k3 = vec2(5.3, -2.9), k4 = vec2(1.3, -2.4);
  float sd = u_seed;
  float A = dot(p, k1) + sd, D = dot(p, k4) + sd * 2.3;
  float B = dot(p, k2) + sd * 1.7 + 0.9 * sin(D), C = dot(p, k3) + sd * 0.6 + 0.7 * sin(A);
  float h0 = 0.5 * sin(A) + 0.35 * sin(B) + 0.25 * sin(C);
  vec2 dh = 0.5 * cos(A) * k1 + 0.35 * cos(B) * (k2 + 0.9 * cos(D) * k4) + 0.25 * cos(C) * (k3 + 0.7 * cos(A) * k1);
  vec2 nxy = -dh * 0.035 * u_crinkle;

  float ph = 0.38 * uv.x - 0.26 * uv.y + dot(tilt, vec2(0.5, 0.35));
  ph += h0 * 0.35;
  float glit = 0.0;
  float crease = 0.0;
  if (u_pattern < 0.5) {
    vec3 fc = facets(p * 13.0);
    nxy += fc.xy * 0.05 * u_crinkle;
    crease = 0.12 * smoothstep(0.03, 0.0, fc.z);
  } else if (u_pattern < 1.5) {
    // arcos de difração em volta de um centro fora do quadro (sulcos finos)
    float r = length(uv - vec2(-1.1, -0.9));
    ph += r * 2.2;
  } else if (u_pattern < 2.5) {
    // escamas hexagonais: cada célula com uma "inclinação" própria
    vec4 hx = hexCell(p * 9.0);
    vec3 hh = hash3(hx.zw + u_seed);
    nxy += (hh.xy - 0.5) * 0.18;
    ph += (hh.z - 0.5) * 0.3;
    crease = 0.6 * smoothstep(0.43, 0.5, max(abs(hx.x) * 0.866 + abs(hx.y) * 0.5, abs(hx.y)));
  } else if (u_pattern < 3.5) {
    // glitter: flocos com normais aleatórias que acendem quando alinham com a luz
    vec2 g = p * 70.0;
    vec3 hh = hash3(floor(g) + u_seed);
    float al = 1.0 - length((hh.xy - 0.5) * 1.6 - tilt * 1.4);
    float d = length(fract(g) - 0.5);
    glit += smoothstep(0.82, 1.0, al) * smoothstep(0.5, 0.15, d) * 1.6;
  }
  vec3 n = normalize(vec3(nxy, 1.0));
  ph += dot(n.xy, vec2(0.8, 0.5) + tilt * 2.0) * 1.6;

  vec3 irid = film(ph);
  float lum = dot(irid, vec3(0.299, 0.587, 0.114));
  irid = mix(vec3(lum), irid, u_sat);

  // luz direcional que acompanha a inclinação
  vec3 L = normalize(vec3(-0.35 - tilt.x, 0.55 - tilt.y, 1.0));
  float dif = clamp(dot(n, L), 0.0, 1.0);
  // faixas largas de reflexo do ambiente (metal escovado) que andam com a inclinação
  float envL = 0.5 + 0.5 * sin(dot(uv, vec2(0.9, -0.45)) * 2.3 + tilt.x * 3.0 - tilt.y * 2.0 + dot(n.xy, vec2(3.0, 2.0)));
  envL = envL * envL * (3.0 - 2.0 * envL);
  vec3 metal = u_base * (0.62 + 0.45 * envL) * (0.85 + 0.2 * dif);
  vec3 col = metal * mix(vec3(1.0), irid * 1.3, 0.8);
  // brilho especular das dobras
  vec3 R = reflect(-L, n);
  float spec = pow(max(R.z, 0.0), 80.0);
  col += vec3(0.25) * spec * envL;
  // vincos: um lado claro, outro escuro
  col *= 1.0 - 0.22 * crease;

  // reflexo que atravessa
  vec2 dir = normalize(vec2(1.0, 0.55));
  float s = dot(uv, dir) - u_sweep;
  float band = exp(-s * s / 0.035) + 0.55 * exp(-pow(s + 0.28, 2.0) / 0.003);
  band *= u_sheen * (0.75 + 0.5 * dif);
  col = mix(col, vec3(0.55) + irid * 0.5, clamp(band * 0.5, 0.0, 1.0));
  col += vec3(0.12) * band;
  col += glit * vec3(1.0) * (0.5 + band);

  // ombro suave: o reflexo não estoura em branco chapado
  col = col / (1.0 + 0.6 * max(col - 0.75, 0.0));
  col *= 1.0 - 0.32 * smoothstep(0.5, 1.35, length(uv));
  col += (hash(gl_FragCoord.xy) - 0.5) * 0.02;
  outColor = vec4(col, 1.0);
}`;

// ordem do menu ≠ índice no shader (0 facetas, 1 arcos, 2 escamas, 3 glitter, 4 liso)
const PATTERNS = ['liso', 'facetas', 'arcos', 'escamas', 'glitter'];
const PAT_IDX = { facetas: 0, arcos: 1, escamas: 2, glitter: 3, liso: 4 };
const PALETTES = ['arco-íris', 'perolado', 'dourado'];

export default {
  id: 'holo-foil',
  title: 'Holo Foil',
  description: 'Holographic foil card stock shifting color as it tilts, with a glint of light sweeping across.',
  category: 'fundos',
  tags: ['background', 'loop', 'gradient', 'shader'],
  duration: 10,

  params: {
    base: { type: 'color', label: 'Metal', default: '#c9ccd6' },
    palette: { type: 'select', label: 'Palette', options: PALETTES, default: 'perolado' },
    pattern: { type: 'select', label: 'Pattern', options: PATTERNS, default: 'facetas' },
    saturation: { type: 'range', label: 'Saturation', min: 0, max: 1.5, step: 0.01, default: 0.85 },
    sheen: { type: 'range', label: 'Sheen', min: 0, max: 2, step: 0.01, default: 1 },
    crinkle: { type: 'range', label: 'Crinkle', min: 0, max: 2, step: 0.01, default: 1 },
    scale: { type: 'range', label: 'Scale', min: 0.5, max: 3, step: 0.01, default: 1 },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 3 },
  },

  render(ctx, t, env) {
    const { w, h, p, progress } = env;
    const m = Math.min(w, h);
    // meia-diagonal projetada na direção do reflexo + folga: fora da tela nas pontas
    const D = (0.5 * (w + 0.55 * h)) / m / Math.hypot(1, 0.55) + 0.55;
    const k = ease.inOutCubic(seg(progress, 0.2, 0.75));
    shader(ctx, FRAG, {
      u_ang: TAU * progress,
      u_sweep: -D + 2 * D * k,
      u_scale: p.scale,
      u_sat: p.saturation,
      u_sheen: p.sheen,
      u_crinkle: p.crinkle,
      u_pattern: PAT_IDX[p.pattern] ?? 4,
      u_pal: Math.max(0, PALETTES.indexOf(p.palette)),
      u_seed: p.seed * 1.37,
      u_base: p.base,
    }, env);
  },
};
