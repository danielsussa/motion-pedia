import { TAU } from '../lib/anim.js';
import { shader } from '../lib/gl.js';

// Vitral: Voronoi com distância exata à borda (2 passadas, como em voronoi.js) vira as peças de vidro e o
// chumbo. No modo rosácea o plano é dobrado em N setores espelhados (simetria radial) e dois anéis de chumbo
// separam medalhão, coroa e borda. Cada peça tem um índice na paleta de 4 cores; uma onda (do centro para fora
// ou na diagonal) faz as peças trocarem de cor uma a uma — 4 trocas por loop, então tudo volta ao início.
// A luz de trás é um "sol" difuso que passa atrás do vidro numa órbita fechada.
const FRAG = `
uniform float u_ang;
uniform float u_scale;
uniform float u_rose;
uniform float u_sectors;
uniform float u_lead;
uniform float u_light;
uniform float u_seed;
uniform vec3 u_c0;
uniform vec3 u_c1;
uniform vec3 u_c2;
uniform vec3 u_c3;
uniform vec3 u_leadCol;
uniform vec3 u_sun;
const float TAU = 6.28318530718;
vec3 hash3(vec2 p) {
  vec3 q = fract(vec3(p.xyx + u_seed) * vec3(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yxz + 33.33);
  return fract((q.xxy + q.yzz) * q.zyx);
}
vec2 seedPt(vec2 g) {
  vec3 h = hash3(g);
  return 0.5 + 0.38 * vec2(sin(TAU * h.x), cos(TAU * h.y));
}
// sequência de cores de cada peça (4 degraus por volta). Peças comuns passeiam pelos 3 tons de base;
// as de destaque (~1 em 5) ficam na cor de destaque e só mergulham num tom de base uma vez por volta.
vec3 pal(float i, float accent) {
  i = mod(i, 4.0);
  if (accent > 0.5) return i < 2.5 && i >= 1.5 ? u_c0 : u_c3;
  if (i < 1.0) return u_c0;
  if (i < 2.0) return u_c1;
  if (i < 3.0) return u_c2;
  return u_c1;
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
// Voronoi com distância à borda (cell units); linhas fora de [y0, y1) são ignoradas (as bordas do intervalo
// coincidem com anéis de chumbo, então não sobram lascas finas junto deles). Devolve (distância, id.x, id.y).
vec3 vor(vec2 x, float y0, float y1) {
  vec2 n = floor(x), f = fract(x);
  vec2 mg = vec2(0.0), mr = vec2(0.0);
  float md = 8.0;
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    float row = n.y + g.y;
    if (row < y0 || row >= y1) continue;
    vec2 rr = g + seedPt(n + g) - f;
    float d = dot(rr, rr);
    if (d < md) { md = d; mr = rr; mg = g; }
  }
  float cd = 8.0;
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++) {
    vec2 g = mg + vec2(float(i), float(j));
    float row = n.y + g.y;
    if (row < y0 || row >= y1) continue;
    vec2 rr = g + seedPt(n + g) - f;
    vec2 dr = rr - mr;
    if (dot(dr, dr) > 1e-5) cd = min(cd, dot(0.5 * (mr + rr), normalize(dr)));
  }
  return vec3(cd, n + mg);
}
void main() {
  float m = min(u_res.x, u_res.y);
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / m;
  float r = length(uv);
  float bd;          // distância ao chumbo, em unidades de uv
  vec2 id;
  if (u_rose > 0.5) {
    float sec = TAU / u_sectors;
    float ang = atan(uv.y, uv.x) + sec * 0.5;
    float a = abs(mod(ang, sec) - sec * 0.5);     // espelhado dentro do setor
    const float R1 = 0.15, R2 = 0.4, BW = 0.045, RB = 0.042;
    if (r < R1) {
      // medalhão: pétalas (uma por setor) em volta de um botão central
      if (r < RB) { bd = RB - r; id = vec2(5.0, 1.0); }
      else {
        bd = min(min(r * sin(sec * 0.5 - a), R1 - r), r - RB);
        id = vec2(mod(floor(ang / sec), 2.0), 2.0);
      }
    } else if (r > R2 && r < R2 + BW) {
      // faixa de contas: segmentos curtos entre dois anéis
      float segA = sec / 4.0;
      float sa = mod(ang, segA);
      bd = min(min(r - R2, R2 + BW - r), r * sin(min(sa, segA - sa)));
      id = vec2(mod(floor(ang / segA), 2.0), 3.0);
    } else {
      // coroa e borda: Voronoi em coordenadas log-polares (conforme: peças com proporção constante,
      // crescendo para fora) com as fileiras alinhadas aos anéis
      float rows = max(1.0, floor(u_scale / 2.0 + 0.5));
      float K = rows / log(R2 / R1);
      bool inner = r < R2;
      float r0 = inner ? R1 : R2 + BW;
      vec2 x = vec2(a * K * 2.0, log(r / r0) * K);   // 2× no ângulo: peças alongadas, como pétalas
      vec3 v = vor(x + vec2(0.0, 0.0), 0.0, inner ? rows : 1e4);
      bd = v.x * r / (K * 1.6);                      // cell units → uv (escala local ~r/K, anisotrópica)
      bd = min(bd, inner ? min(r - R1, R2 - r) : r - R2 - BW);
      id = v.yz + (inner ? vec2(40.0, 0.0) : vec2(80.0, 0.0));
    }
  } else {
    vec3 v = vor(uv * u_scale + vec2(7.3, 3.1), -1e4, 1e4);
    bd = v.x / u_scale;
    id = v.yz;
  }
  vec3 h = hash3(id + 4.1);

  // —— cor: índice próprio + onda de troca (4 trocas por loop; 'f' suave só no fim de cada degrau)
  float wave = u_rose > 0.5 ? r * 1.6 : dot(uv, vec2(0.55, 0.35)) + 0.6;
  float s = u_ang / TAU * 4.0 - wave + h.y * 0.35;
  float k = floor(s);
  float ft = smoothstep(0.72, 1.0, fract(s));
  float base = floor(h.x * 4.0);
  float acc = step(0.8, fract(h.x * 7.13 + h.z));
  vec3 glass = mix(pal(base + k, acc), pal(base + k + 1.0, acc), ft);
  glass *= 0.82 + 0.3 * h.z;                       // cada peça com densidade própria

  // textura do vidro: estrias onduladas numa direção por peça + bolhas finas
  float th = TAU * h.z;
  vec2 dir = vec2(cos(th), sin(th));
  float tex = 0.08 * sin(dot(uv, dir) * 70.0 + 3.0 * sin(dot(uv, dir.yx) * 9.0 + h.x * 6.0))
            + 0.05 * sin(dot(uv, dir.yx) * 23.0 + h.y * 9.0);
  // borda da peça um pouco mais escura (espessura do vidro junto ao chumbo)
  float edgeDark = smoothstep(0.0, 0.04, bd);

  // —— luz de trás: sol difuso em órbita fechada + luz ambiente
  vec2 sp = vec2(0.55 * cos(u_ang + 0.6), 0.32 * sin(u_ang + 0.6)) * vec2(u_res.x / m, 1.0);
  float sun = exp(-dot(uv - sp, uv - sp) * 2.4);
  float lightAmt = 0.5 + u_light * (1.1 * sun + 0.15 * (1.0 - r));
  vec3 col = glass * lightAmt * (0.7 + 0.3 * edgeDark) * (1.0 + tex);
  // vidro saturado estoura para o branco onde o sol bate forte
  col += u_sun * pow(sun, 3.0) * 0.45 * u_light * (0.6 + 0.4 * h.z);

  // —— chumbo: faixa escura com um filete de brilho no meio (a "alma" da calha)
  float aa = fwidth(bd) * 1.2;
  float lw = u_lead * 0.0075;
  float lead = 1.0 - smoothstep(lw, lw + aa, bd);
  float ridge = exp(-pow(bd / max(lw, 1e-4) * 1.6, 2.0));
  vec3 leadCol = u_leadCol * (1.0 + 0.7 * ridge) + u_sun * sun * 0.06 * u_light;
  col = mix(col, leadCol, lead);
  // halo: a luz vaza por cima do chumbo perto do sol
  col += u_sun * sun * sun * 0.12 * u_light;

  col *= 1.0 - 0.45 * smoothstep(0.45, 1.3, length(uv));
  col += (hash(gl_FragCoord.xy) - 0.5) * 0.025;
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'stained-glass',
  title: 'Stained Glass',
  description: 'Vitral de chumbo e vidro colorido com a luz passando por trás e as peças trocando de cor em onda.',
  category: 'fundos',
  tags: ['fundo', 'loop', 'padrão', 'shader'],
  duration: 12,

  params: {
    layout: { type: 'select', label: 'Desenho', options: ['rosácea', 'mosaico'], default: 'rosácea' },
    c0: { type: 'color', label: 'Vidro 1', default: '#1b3f8b' },
    c1: { type: 'color', label: 'Vidro 2', default: '#0f6a7a' },
    c2: { type: 'color', label: 'Vidro 3', default: '#2a2a78' },
    c3: { type: 'color', label: 'Vidro 4 (destaque)', default: '#e09a2c' },
    leadCol: { type: 'color', label: 'Chumbo', default: '#141210' },
    sun: { type: 'color', label: 'Luz', default: '#fff1d0' },
    sectors: { type: 'range', label: 'Setores (rosácea)', min: 4, max: 16, step: 1, default: 10 },
    scale: { type: 'range', label: 'Peças', min: 2, max: 14, step: 0.5, default: 6 },
    lead: { type: 'range', label: 'Espessura do chumbo', min: 0.2, max: 2, step: 0.05, default: 1 },
    light: { type: 'range', label: 'Luz', min: 0, max: 2, step: 0.01, default: 1 },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 7 },
  },

  render(ctx, t, env) {
    const { p, progress } = env;
    shader(ctx, FRAG, {
      u_ang: TAU * progress,
      u_scale: p.scale,
      u_rose: p.layout === 'rosácea',
      u_sectors: p.sectors,
      u_lead: p.lead,
      u_light: p.light,
      u_seed: p.seed * 1.37,
      u_c0: p.c0,
      u_c1: p.c1,
      u_c2: p.c2,
      u_c3: p.c3,
      u_leadCol: p.leadCol,
      u_sun: p.sun,
    }, env);
  },
};
