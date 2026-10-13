import { TAU, lerp, rng, hexToRgb } from '../lib/anim.js';
import { shader, GLSL_NOISE } from '../lib/gl.js';
import { CENAS } from './paper-calm.js';

// A mesma cena do `paper-calm` (papel recortado claro, camadas entrando pelas bordas, centro vazio), mas em WebGL:
// o shader calcula, por pixel, a distância com sinal até a borda de cada camada (ao longo da direção n da camada,
// com a ondulação ao longo da tangente). Daí sai tudo de forma contínua, sem buffers:
//  • sombra de contato e sombra ambiente com queda exponencial da distância, deslocadas para longe da luz;
//  • a espessura do papel: um fio claro na borda voltada para a luz e um escuro na oposta;
//  • relevo leve da superfície (ruído de baixa frequência) e grão fino de papel.
// As camadas são pintadas na ordem (de dentro para fora), então a sombra de cada uma cai sobre as de baixo.
// Os dados das camadas entram no GLSL como constantes (o shader é gerado no setup e fica em cache por texto).

const norm = ([x, y]) => { const l = Math.hypot(x, y); return [x / l, y / l]; };
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const f = (x) => (Number.isInteger(x) ? `${x}.0` : `${+x.toFixed(5)}`);
const v2 = (a) => `vec2(${f(a[0])},${f(a[1])})`;
const v3 = (a) => `vec3(${f(a[0] / 255)},${f(a[1] / 255)},${f(a[2] / 255)})`;

export default {
  id: 'paper-calm-gl',
  title: 'Paper Calm (WebGL)',
  description: 'Papel recortado claro em WebGL: sombras contínuas por distância, espessura do papel com luz na borda e relevo leve.',
  category: 'fundos',
  tags: ['fundo', 'loop', 'shader'],
  duration: 12,
  poster: 3,

  params: {
    cena: { type: 'select', label: 'Cena', options: ['ondas', 'faixas', 'trilha', 'colunas', 'bordas'], default: 'ondas' },
    papel: { type: 'color', label: 'Papel', default: '#fbf2e2' },
    areia: { type: 'color', label: 'Areia', default: '#f3ddb9' },
    verde: { type: 'color', label: 'Verde-água', default: '#aed4c5' },
    ambar: { type: 'color', label: 'Âmbar', default: '#f4c27e' },
    sombra: { type: 'range', label: 'Sombra', min: 0, max: 1, step: 0.01, default: 0.55 },
    centro: { type: 'range', label: 'Centro vazio', min: 0.8, max: 1.4, step: 0.01, default: 1.12 },
    relevo: { type: 'range', label: 'Relevo', min: 0, max: 1, step: 0.01, default: 0.5 },
    movimento: { type: 'range', label: 'Movimento', min: 0, max: 1, step: 0.01, default: 0.5 },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 5 },
    escala: { type: 'range', label: 'Resolução do shader', min: 0.3, max: 1, step: 0.05, default: 1 },
  },

  setup({ w, h, p }) {
    const r = rng(p.seed);
    const papel = hexToRgb(p.papel), areia = hexToRgb(p.areia), verde = hexToRgb(p.verde), ambar = hexToRgb(p.ambar);
    const pal = [areia, verde, ambar, mix3(papel, areia, 0.5), verde, mix3(ambar, areia, 0.5)];
    let ci = Math.floor(r() * 3);
    const L = [];
    for (const g of CENAS[p.cena] || CENAS.ondas) {
      const n = norm(g.n), tg = [-n[1], n[0]];
      const E = Math.abs(n[0]) * w / 2 + Math.abs(n[1]) * h / 2, S = Math.hypot(w, h) / 2;
      for (let i = 0; i < g.k; i++) {
        L.push({ n, tg, S, D: Math.min(E * 0.95, E * lerp(g.de, g.ate, g.k > 1 ? i / (g.k - 1) : 0) * p.centro), cor: mix3(pal[ci++ % pal.length], papel, 0.02 + 0.08 * r()),
          a: [0.07, 0.035, 0.015].map((a) => E * g.amp * a * (0.6 + r() * 0.6)), ph: [r(), r(), r()].map((x) => x * TAU), m: [1, 2, 3].map((k) => (r() < 0.5 ? -1 : 1) * k) });
      }
    }
    const N = L.length, arr = (tipo, fn) => `${tipo}[${N}](${L.map(fn).join(',')})`;
    const FRAG = `
uniform float u_p, u_mov, u_sombra, u_relevo;
const vec2 SZ = ${v2([w, h])};
const vec3 PAPEL = ${v3(papel)};
const vec2 LN[${N}] = ${arr('vec2', (l) => v2(l.n))};
const vec2 LT[${N}] = ${arr('vec2', (l) => v2(l.tg))};
const float LD[${N}] = ${arr('float', (l) => f(l.D))};
const float LS[${N}] = ${arr('float', (l) => f(l.S))};
const vec3 LA[${N}] = ${arr('vec3', (l) => `vec3(${l.a.map(f).join(',')})`)};
const vec3 LP[${N}] = ${arr('vec3', (l) => `vec3(${l.ph.map(f).join(',')})`)};
const vec3 LM[${N}] = ${arr('vec3', (l) => `vec3(${l.m.map(f).join(',')})`)};
const vec3 LC[${N}] = ${arr('vec3', (l) => v3(l.cor))};
${GLSL_NOISE}
// distância com sinal até a borda da camada i (> 0 = dentro da camada), em px lógicos
float sd(int i, vec2 q) {
  vec2 c = q - SZ * 0.5;
  float s = dot(c, LT[i]) / LS[i];
  vec3 k = vec3(1.0, 2.0, 3.0) * 3.14159265 * s + LP[i] + 6.2831853 * u_p * LM[i] * step(0.001, u_mov);
  float wob = dot(LA[i] * (0.6 + 0.4 * u_mov), sin(k));
  // derivada da ondulação ao longo da tangente: corrige a distância para ficar ~euclidiana
  float dw = dot(LA[i] * (0.6 + 0.4 * u_mov), vec3(1.0, 2.0, 3.0) * 3.14159265 / LS[i] * cos(k));
  return (dot(c, LN[i]) - LD[i] - wob) / sqrt(1.0 + dw * dw);
}
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 q = vec2(uv.x, 1.0 - uv.y) * SZ;            // px lógicos, y para baixo
  float px = SZ.x / u_res.x;                         // tamanho de 1 px real em px lógicos (antialias)
  vec2 luz = normalize(vec2(-0.35, -1.0));            // a luz vem de cima, um pouco da esquerda
  // fundo: papel com um brilho quente no centro
  float g = 1.0 - smoothstep(0.0, 0.62 * max(SZ.x, SZ.y), length(q - SZ * vec2(0.5, 0.48)));
  vec3 col = mix(PAPEL * 0.985, min(PAPEL * 1.03, vec3(1.0)), g);
  for (int i = 0; i < ${N}; i++) {
    float d = sd(i, q);
    // sombras: a camada projeta na direção oposta à luz; contato (curta) + ambiente (larga), em marrom quente
    // (longe da borda, fora da camada, a sombra já é ~0: pula as duas distâncias extras)
    if (d < 0.0 && d > -320.0) {
      float dc = sd(i, q + luz * 5.0), da = sd(i, q + luz * 26.0);
      float sh = 0.30 * exp(min(dc, 0.0) / 7.0) + 0.20 * exp(min(da, 0.0) / 48.0);
      sh *= u_sombra * 1.8 * (1.0 - smoothstep(-px, px, d));
      col = mix(col, col * vec3(0.66, 0.58, 0.5), clamp(sh, 0.0, 0.85));
    }
    // a camada: cor com degradê (mais clara perto da borda recortada) e relevo leve
    float cobre = smoothstep(-px, px, d);
    if (cobre > 0.0) {
      vec3 c = LC[i] * mix(1.07, 0.97, smoothstep(0.0, 360.0, d));
      float rel = snoise(vec3(q * 0.0028, float(i) * 3.1)) * 0.6;
      c *= 1.0 + rel * 0.035 * u_relevo;
      // espessura do papel: borda voltada para a luz acende, a oposta escurece um pouco
      float aresta = 1.0 - smoothstep(0.0, 4.0 * max(1.0, px), d);
      if (aresta > 0.0) {
        vec2 gr = vec2(sd(i, q + vec2(1.0, 0.0)) - d, sd(i, q + vec2(0.0, 1.0)) - d);
        float face = dot(normalize(gr + 1e-5), -luz);
        c = mix(c, c * (face > 0.0 ? 1.12 : 0.92), aresta * abs(face) * u_relevo * 1.4);
      }
      col = mix(col, c, cobre);
    }
  }
  col += (hash12(gl_FragCoord.xy) - 0.5) * 0.025;   // grão fino
  outColor = vec4(col, 1.0);
}`;
    return { FRAG };
  },

  render(ctx, t, env) {
    const { p, progress, state } = env;
    // `escala` < 1 roda o shader em resolução menor e amplia (o fundo é macio; no render por software isso é o que mais pesa)
    shader(ctx, state.FRAG, { u_p: progress, u_mov: p.movimento, u_sombra: p.sombra, u_relevo: p.relevo }, { ...env, px: env.px * p.escala });
  },
};
