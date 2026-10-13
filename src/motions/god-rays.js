import { TAU } from '../lib/anim.js';
import { shader } from '../lib/gl.js';

// Feixes de luz entrando por uma janela num quarto escuro. Espalhamento volumétrico em espaço de tela
// (GPU Gems 3, cap. 13): cada pixel marcha N amostras em direção a uma fonte de luz que fica ALÉM da janela
// (fora do quadro, em cima) e soma a máscara analítica da janela (vidraças menos caixilhos) com decaimento.
// Só os pixels "a jusante" da janela recebem luz → leque de feixes com as sombras do caixilho.
// Nuvens passando = máscara modulada por senos de frequência inteira; poeira = pontos em grade de células
// subindo devagar, periódicos no eixo do movimento (hash com id módulo PER) → loop perfeito.
const FRAG = `
uniform float u_ang;
uniform vec2 u_win;      // centro da janela (unid. de min(w,h), origem no centro da tela)
uniform vec2 u_wsize;    // meia-largura, meia-altura
uniform vec2 u_light;    // posição da fonte (além da janela)
uniform vec2 u_dir;      // direção do feixe
uniform float u_ldist;   // distância fonte → janela
uniform float u_beamW;   // largura do feixe (janela projetada na perpendicular)
uniform vec4 u_bars;     // posições dos caixilhos projetadas (99 = sem caixilho)
uniform float u_int;
uniform float u_dust;
uniform float u_clouds;
uniform float u_cols;
uniform float u_rows;
uniform vec3 u_bg;
uniform vec3 u_col;
const float TAU = 6.28318530718;
const float BAR = 0.009;   // meia-espessura do caixilho

float cloud(vec2 p) {
  vec2 q = (p - u_win) / u_wsize;
  float c = 0.5 + 0.28 * sin(q.x * 2.3 + q.y * 1.1 - u_ang * 2.0) + 0.22 * sin(q.x * 3.7 - q.y * 2.3 + u_ang * 3.0 + 1.3);
  return mix(1.0, 0.25 + 0.75 * c, u_clouds);
}
// gobo 1D: posição x (perpendicular ao feixe, no plano da janela) → transmissão. Caixilhos viram faixas
// escuras (com penumbra 'soft' que alarga longe da janela) e senos de frequência inteira fazem os raios pulsarem.
float gobo(float x, float soft) {
  float hb = u_beamW * 0.5;
  float g = smoothstep(hb + soft, hb - soft * 0.5, abs(x));
  vec4 d = abs(vec4(x) - u_bars);
  vec4 sb = smoothstep(vec4(BAR), vec4(BAR + soft), d);
  g *= mix(1.0, sb.x * sb.y * sb.z * sb.w, 0.85);
  float rays = 0.62 + 0.2 * sin(x * 61.0 + u_ang + 0.4) + 0.12 * sin(x * 137.0 - 2.0 * u_ang + 1.9)
             + 0.1 * sin(x * 23.0 - u_ang + 4.2);
  return g * rays;
}
float paneMask(vec2 p, float aa) {
  vec2 q = p - u_win;
  if (abs(q.x) > u_wsize.x || abs(q.y) > u_wsize.y) return 0.0;
  vec2 pane = 2.0 * u_wsize / vec2(u_cols, u_rows);
  vec2 f = abs(fract((p - u_win + u_wsize) / pane) - 0.5) * pane;   // distância ao centro da vidraça
  vec2 e = 0.5 * pane - BAR - f;                                     // distância ao caixilho
  return smoothstep(0.0, aa, min(e.x, e.y));
}
vec3 hash3(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yxz + 33.33);
  return fract((q.xxy + q.yzz) * q.zyx);
}
// poeira: uma partícula por célula (nem todas), passeando em volta do centro da célula em órbitas de
// 1 ou 2 voltas por loop (sem deriva líquida: um deslocamento contínuo da grade não fecharia o loop)
float dust(vec2 p, float scale) {
  vec2 x = p * scale;
  vec2 n = floor(x), f = fract(x);
  float acc = 0.0;
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 id = n + g;
    vec3 h = hash3(id + 17.0);
    if (h.z > 0.5) continue;
    float k = 1.0 + step(0.25, h.z);
    vec2 c = g + 0.5 + 0.34 * vec2(sin(k * u_ang + TAU * h.x), cos(u_ang + TAU * h.y) * (2.0 - k) + sin(u_ang * 2.0 + TAU * h.x) * (k - 1.0));
    float d = length(c - f);
    float r = 0.03 + 0.05 * h.y * h.y;
    float tw = 0.5 + 0.5 * sin(k * u_ang * 2.0 + TAU * h.x);
    acc += smoothstep(r, r * 0.15, d) * tw;
  }
  return acc;
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  float m = min(u_res.x, u_res.y);
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / m;
  vec2 v = uv - u_light;
  vec2 P = vec2(-u_dir.y, u_dir.x);
  float along = dot(v, u_dir);
  float xw = dot(v, P) * u_ldist / along;          // onde o raio cruzou o plano da janela
  // onde o raio SAI do retângulo da janela (slab): o feixe só existe depois disso
  vec2 inv = 1.0 / (v + vec2(1e-6));
  vec2 t0 = (u_win - u_wsize - u_light) * inv, t1 = (u_win + u_wsize - u_light) * inv;
  vec2 tx = max(t0, t1);
  float past = (1.0 - min(tx.x, tx.y)) * length(v);   // distância depois da saída
  float soft = 0.004 + max(past, 0.0) * 0.03;
  float dW = length(uv - u_win);
  float beam = gobo(xw, soft) * smoothstep(0.0, 0.04, past) * exp(-max(past, 0.0) * 0.8);
  // névoa: variações lentas ao longo do feixe
  beam *= 0.88 + 0.12 * sin(past * 3.0 - u_ang * 2.0 + xw * 4.0);
  beam *= u_int;
  vec3 col = u_bg * (0.7 + 0.6 * exp(-dW * 1.6));
  col += u_col * beam;
  // halo em volta da janela
  vec2 rq = max(abs(uv - u_win) - u_wsize, 0.0);
  col += u_col * 0.22 * u_int * exp(-length(rq) * 14.0);
  // poeira só dentro do feixe
  if (beam > 0.01 && u_dust > 0.0) {
    float dd = dust(uv, 9.0) + 0.6 * dust(uv + 3.7, 16.0);
    col += u_col * dd * u_dust * smoothstep(0.0, 0.3, beam) * 0.9;
  }
  // janela: vidraças com a luz das nuvens, caixilho escuro
  float aa = 1.5 / m;
  float wm = paneMask(uv, aa);
  // vidro estourado: quase branco no meio, a cor da luz nas bordas e onde passa nuvem
  vec2 wq = (uv - u_win) / u_wsize;
  vec3 glass = mix(u_col, vec3(1.0), (0.35 + 0.5 * cloud(uv)) * (1.0 - 0.35 * dot(wq, wq)));
  col = mix(col, glass, wm);
  float frame = step(abs(uv.x - u_win.x), u_wsize.x + BAR) * step(abs(uv.y - u_win.y), u_wsize.y + BAR) * (1.0 - wm);
  col = mix(col, u_bg * 0.5, frame * 0.85);
  col *= 1.0 - 0.45 * smoothstep(0.35, 1.3, length(uv));
  col += (hash(gl_FragCoord.xy) - 0.5) * 0.02;
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'god-rays',
  title: 'God Rays',
  description: 'Light beams pouring through a window into a dark room, with clouds passing and dust floating in the shaft.',
  category: 'fundos',
  tags: ['background', 'loop', 'shader', 'particles'],
  duration: 12,

  params: {
    bg: { type: 'color', label: 'Room', default: '#1a1512' },
    light: { type: 'color', label: 'Light', default: '#ffd9a0' },
    intensity: { type: 'range', label: 'Intensity', min: 0, max: 2, step: 0.01, default: 1 },
    angle: { type: 'range', label: 'Light angle', min: -60, max: 60, step: 1, default: 28 },
    panes: { type: 'select', label: 'Panes', options: ['2×2', '2×3', '3×3', '1×1'], default: '2×3' },
    dust: { type: 'range', label: 'Dust', min: 0, max: 1, step: 0.01, default: 0.6 },
    clouds: { type: 'range', label: 'Clouds', min: 0, max: 1, step: 0.01, default: 0.5 },
  },

  setup({ w, h, p }) {
    const m = Math.min(w, h);
    const hw = w / m / 2, hh = h / m / 2; // meia-tela em unidades de min(w,h)
    const [cols, rows] = p.panes.split('×').map(Number);
    const a = (p.angle * Math.PI) / 180;
    const ws = [0.075 * cols, 0.09 * rows];
    // janela no alto, do lado de onde a luz vem; o feixe atravessa a tela na diagonal
    const win = [-Math.sin(a) * hw * 0.6, hh - ws[1] - 0.07];
    const dir = [Math.sin(a), -Math.cos(a)];
    const P = [-dir[1], dir[0]];
    const ldist = 1.8;
    const light = [win[0] - dir[0] * ldist, win[1] - dir[1] * ldist];
    // largura do feixe e caixilhos internos projetados na perpendicular (coordenada relativa ao centro)
    const beamW = 2 * (ws[0] * Math.abs(P[0]) + ws[1] * Math.abs(P[1]));
    const bars = [];
    for (let i = 1; i < cols; i++) bars.push((-ws[0] + (2 * ws[0] * i) / cols) * P[0]);
    for (let j = 1; j < rows; j++) bars.push((-ws[1] + (2 * ws[1] * j) / rows) * P[1]);
    while (bars.length < 4) bars.push(99);
    return { win, ws, light, dir, ldist, beamW, bars: bars.slice(0, 4), cols, rows };
  },

  render(ctx, t, env) {
    const { p, progress, state: s } = env;
    shader(ctx, FRAG, {
      u_ang: TAU * progress,
      u_win: s.win,
      u_wsize: s.ws,
      u_light: s.light,
      u_dir: s.dir,
      u_ldist: s.ldist,
      u_beamW: s.beamW,
      u_bars: s.bars,
      u_int: p.intensity,
      u_dust: p.dust,
      u_clouds: p.clouds,
      u_cols: s.cols,
      u_rows: s.rows,
      u_bg: p.bg,
      u_col: p.light,
    }, env);
  },
};
