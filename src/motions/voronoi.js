import { TAU } from '../lib/anim.js';
import { shader } from '../lib/gl.js';

// Voronoi com distância à borda exata (Inigo Quilez: 2 passadas, 3×3 e depois 5×5 em volta da célula vencedora).
// Cada semente orbita dentro da sua célula com frequência inteira de progress (1 ou 2 voltas) e cada célula
// pulsa com fase própria → loop perfeito. O espaço recebe uma ondulação leve (também periódica) para as
// bordas ficarem orgânicas em vez de retas.
const FRAG = `
uniform float u_ang;
uniform float u_scale;
uniform float u_move;
uniform float u_edge;
uniform float u_glow;
uniform float u_breath;
uniform float u_seed;
uniform float u_grain;
uniform vec3 u_bg;
uniform vec3 u_cell;
uniform vec3 u_accent;
const float TAU = 6.28318530718;
// hash sem sin (Dave Hoskins): barato e estável em float
vec3 hash3(vec2 p) {
  vec3 q = fract(vec3(p.xyx + u_seed) * vec3(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yxz + 33.33);
  return fract((q.xxy + q.yzz) * q.zyx);
}
vec2 seedPt(vec2 g) {
  vec3 h = hash3(g);
  float a = (1.0 + step(0.5, h.z)) * u_ang;   // 1 ou 2 voltas por loop
  return 0.5 + u_move * vec2(sin(a + TAU * h.x), cos(a + TAU * h.y));
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  float m = min(u_res.x, u_res.y);
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / m;
  vec2 x = uv * u_scale + vec2(11.3, 7.9);
  // ondulação periódica do espaço (bordas levemente curvas)
  x += 0.08 * vec2(sin(1.7 * x.y + u_ang), sin(1.9 * x.x - u_ang));
  vec2 n = floor(x), f = fract(x);
  vec2 mg = vec2(0.0), mr = vec2(0.0);
  float md = 8.0;
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 r = g + seedPt(n + g) - f;
    float d = dot(r, r);
    if (d < md) { md = d; mr = r; mg = g; }
  }
  float bd = 8.0;
  // 3×3 em vez de 5×5: com o movimento limitado a ±0.45 da célula, os erros são raros e invisíveis
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++) {
    vec2 g = mg + vec2(float(i), float(j));
    vec2 r = g + seedPt(n + g) - f;
    vec2 dr = r - mr;
    if (dot(dr, dr) > 1e-5) bd = min(bd, dot(0.5 * (mr + r), normalize(dr)));
  }
  vec2 id = n + mg;
  vec3 hc = hash3(id + 9.7);
  float ch = hc.x;
  float k = 1.0 + step(0.5, hc.y);
  float pulse = 0.5 + 0.5 * sin(k * u_ang + TAU * ch);          // 0..1, cada célula no seu ritmo
  float lit = mix(1.0, pulse, u_breath);

  float cd = length(mr);
  float aa = fwidth(bd) * 1.2;
  // célula: almofada (escurece perto da borda), tom levemente variado por célula
  float pillow = smoothstep(0.0, 0.42, bd);
  vec3 col = mix(u_bg, u_cell, (0.55 + 0.45 * ch) * (0.35 + 0.65 * pillow));
  // brilho no centro, respirando
  float core = exp(-cd * cd * 7.0) * lit;
  col += u_accent * u_glow * (0.55 * core + 0.35 * pow(core, 6.0));
  // borda fina: escuro do fundo + filete de luz que acompanha a respiração das vizinhas
  float edgeW = u_edge * (0.85 + 0.3 * lit);
  float line = 1.0 - smoothstep(edgeW, edgeW + aa, bd);
  col = mix(col, u_bg, smoothstep(edgeW * 4.0 + aa, 0.0, bd) * 0.7);
  col = mix(col, mix(u_cell, u_accent, 0.6), line * (0.45 + 0.4 * lit));

  col *= 1.0 - 0.4 * smoothstep(0.35, 1.25, length(uv));
  col += (hash(gl_FragCoord.xy) - 0.5) * u_grain;
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'voronoi',
  title: 'Voronoi Cells',
  description: 'Organic cells breathing in a loop, with thin edges and a glow pulsing at the center of each.',
  category: 'fundos',
  tags: ['background', 'loop', 'pattern', 'shader'],
  duration: 10,

  params: {
    bg: { type: 'color', label: 'Background', default: '#05070a' },
    cell: { type: 'color', label: 'Cell', default: '#15232b' },
    accent: { type: 'color', label: 'Glow', default: '#5ff2c8' },
    scale: { type: 'range', label: 'Density', min: 1.5, max: 14, step: 0.1, default: 4.8 },
    move: { type: 'range', label: 'Movement', min: 0, max: 0.45, step: 0.01, default: 0.28 },
    edge: { type: 'range', label: 'Edge', min: 0.005, max: 0.08, step: 0.001, default: 0.009 },
    glow: { type: 'range', label: 'Glow intensity', min: 0, max: 1.5, step: 0.01, default: 0.8 },
    breath: { type: 'range', label: 'Breathing', min: 0, max: 1, step: 0.01, default: 0.75 },
    grain: { type: 'range', label: 'Grain', min: 0, max: 0.12, step: 0.005, default: 0.025 },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 7 },
  },

  render(ctx, t, env) {
    const { p, progress } = env;
    shader(ctx, FRAG, {
      u_time: t,
      u_ang: TAU * progress,
      u_scale: p.scale,
      u_move: p.move,
      u_edge: p.edge,
      u_glow: p.glow,
      u_breath: p.breath,
      u_seed: p.seed * 1.618,
      u_grain: p.grain,
      u_bg: p.bg,
      u_cell: p.cell,
      u_accent: p.accent,
    }, env);
  },
};
