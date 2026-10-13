import { TAU, clamp, rng, ease } from '../lib/anim.js';
import { shader } from '../lib/gl.js';

// Stable fluids (Jos Stam) na CPU, numa grade baixa (~130 células no lado maior), "assado" no setup:
// a cada passo — jatos (força + tinta), confinamento de vorticidade, advecção semi-lagrangiana da velocidade,
// projeção (SOR com pressão reaproveitada do passo anterior) e advecção da tinta (3 canais = 3 cores).
// Guardamos a tinta a 30 fps em Uint8 (RGBA = tinta 1, 2, 3). O render interpola dois quadros, sobe a grade
// como textura e o shader amostra em bicúbico (B-spline), mistura as cores sobre o fundo e dá um brilho de relevo.
// Loop: simulamos WARM s antes de t=0 (a tela já começa cheia) e XF s além do fim; no começo do loop cruzamos
// o quadro t com o quadro t+duração (normalizado para não perder contraste).

const FPS = 30;
const WARM = 2;
const XF = 1.5;

const FRAG = `
uniform sampler2D u_dye;
uniform vec2 u_grid;
uniform vec3 u_bg;
uniform vec3 u_c1;
uniform vec3 u_c2;
uniform vec3 u_c3;
uniform float u_gain;
uniform float u_gloss;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
vec4 cubic(float v) {
  vec4 n = vec4(1.0, 2.0, 3.0, 4.0) - v;
  vec4 s = n * n * n;
  float x = s.x;
  float y = s.y - 4.0 * s.x;
  float z = s.z - 4.0 * s.y + 6.0 * s.x;
  return vec4(x, y, z, 6.0 - x - y - z) * (1.0 / 6.0);
}
vec4 bicubic(vec2 uv) {
  vec2 res = u_grid;
  uv = uv * res - 0.5;
  vec2 f = fract(uv);
  uv -= f;
  vec4 xc = cubic(f.x), yc = cubic(f.y);
  vec4 c = uv.xxyy + vec2(-0.5, 1.5).xyxy;
  vec4 s = vec4(xc.xz + xc.yw, yc.xz + yc.yw);
  vec4 o = (c + vec4(xc.yw, yc.yw) / s) / res.xxyy;
  vec4 s0 = texture(u_dye, o.xz), s1 = texture(u_dye, o.yz), s2 = texture(u_dye, o.xw), s3 = texture(u_dye, o.yw);
  float sx = s.x / (s.x + s.y), sy = s.z / (s.z + s.w);
  return mix(mix(s3, s2, sx), mix(s1, s0, sx), sy);
}
float dens(vec2 uv) { vec3 d = texture(u_dye, uv).rgb; return d.r + d.g + d.b; } // relevo: linear basta
void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec3 d = max(bicubic(uv).rgb, 0.0) * u_gain;
  float sum = d.r + d.g + d.b;
  // peso quadrático: a tinta dominante manda na cor (menos "barro" onde as três se misturam)
  vec3 d2 = d * d + 1e-5;
  vec3 tint = (u_c1 * d2.r + u_c2 * d2.g + u_c3 * d2.b) / (d2.r + d2.g + d2.b);
  float a = 1.0 - exp(-2.6 * pow(sum, 1.35)); // baixa densidade some (menos névoa marrom entre os filetes)
  vec3 col = u_bg;
  vec2 q = uv - 0.5;
  q.x *= u_res.x / u_res.y;
  col *= 1.0 - 0.4 * smoothstep(0.3, 1.2, length(q));
  // núcleo denso clareia um pouco (tinta "acesa")
  tint = mix(tint, mix(tint, vec3(1.0), 0.35), smoothstep(0.9, 2.2, sum));
  col = mix(col, tint, a);
  // relevo: gradiente da densidade iluminado de cima à esquerda
  vec2 e = 1.8 / u_grid;
  float gx = dens(uv + vec2(e.x, 0.0)) - dens(uv - vec2(e.x, 0.0));
  float gy = dens(uv + vec2(0.0, e.y)) - dens(uv - vec2(0.0, e.y));
  float lit = clamp((gy - gx) * u_gain * 0.9, -1.0, 1.0);
  col += u_gloss * a * (max(lit, 0.0) * 0.28 * mix(tint, vec3(1.0), 0.6) - max(-lit, 0.0) * 0.12 * col);
  col += (hash(gl_FragCoord.xy) - 0.5) * 0.022;
  outColor = vec4(col, 1.0);
}`;

const cache = new Map();
const a0len = (frames) => frames[0].length;

function simulate(GW, GH, nFrames, { jets, speed, swirl, curl, fade, seed, duration }) {
  const n = GW * GH;
  let u = new Float64Array(n), v = new Float64Array(n);
  let u2 = new Float64Array(n), v2 = new Float64Array(n);
  const pr = new Float64Array(n), div = new Float64Array(n), w = new Float64Array(n);
  // a tinta roda no dobro da resolução da velocidade (filetes mais finos pelo mesmo custo de projeção)
  const DW = GW * 2, DH = GH * 2, dn = DW * DH;
  let D = [new Float64Array(dn), new Float64Array(dn), new Float64Array(dn)];
  let D2 = [new Float64Array(dn), new Float64Array(dn), new Float64Array(dn)];
  const dt = 1 / FPS;
  const m = Math.min(GW, GH);
  const r = rng(seed);
  const J = [];
  for (let i = 0; i < jets; i++) {
    J.push({ a0: (i / jets) * TAU + r() * 0.5, ph: r() * TAU, ch: i % 3, wob: 0.25 + r() * 0.2 });
  }
  const rad = m * 0.055;
  const R = Math.ceil(rad * 2.6);
  const vel = speed * m * 0.9; // células/s

  // bilinear com clamp
  const sampleG = (F, x, y, W, H) => {
    x = x < 0 ? 0 : x > W - 1.001 ? W - 1.001 : x;
    y = y < 0 ? 0 : y > H - 1.001 ? H - 1.001 : y;
    const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0;
    const i = y0 * W + x0;
    const a = F[i] + (F[i + 1] - F[i]) * fx;
    const b = F[i + W] + (F[i + W + 1] - F[i + W]) * fx;
    return a + (b - a) * fy;
  };
  const sample = (F, x, y) => sampleG(F, x, y, GW, GH);

  const frames = [];
  const total = Math.round(WARM * FPS) + nFrames;
  for (let s = 0; s < total; s++) {
    const t = s / FPS - WARM; // tempo da animação (jatos periódicos na duração → emenda suave)
    const ph = TAU * t / duration;
    // jatos: giram em volta do centro uma vez por loop e apontam para dentro, inclinados (redemoinho)
    for (const j of J) {
      const ang = j.a0 + ph;
      // órbita elíptica: ocupa a tela em qualquer formato
      const cx = GW / 2 + Math.cos(ang) * GW * 0.3;
      const cy = GH / 2 + Math.sin(ang) * GH * 0.3;
      const dir = ang + Math.PI + swirl + j.wob * Math.sin(2 * ph + j.ph);
      const pulse = 0.55 + 0.45 * Math.sin(3 * ph + j.ph);
      const jx = Math.cos(dir) * vel * pulse;
      const jy = Math.sin(dir) * vel * pulse;
      const x0 = Math.max(1, Math.floor(cx - R)), x1 = Math.min(GW - 2, Math.ceil(cx + R));
      const y0 = Math.max(1, Math.floor(cy - R)), y1 = Math.min(GH - 2, Math.ceil(cy + R));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const dx = x - cx, dy = y - cy;
          const g = Math.exp(-(dx * dx + dy * dy) / (rad * rad));
          if (g < 0.01) continue;
          const i = y * GW + x;
          u[i] += (jx - u[i]) * g * 0.45;
          v[i] += (jy - v[i]) * g * 0.45;
        }
      }
      const Dc = D[j.ch];
      const dr = rad * 2 * 0.75, DR = Math.ceil(dr * 2.6), dcx = cx * 2 + 0.5, dcy = cy * 2 + 0.5;
      for (let y = Math.max(0, Math.floor(dcy - DR)); y <= Math.min(DH - 1, Math.ceil(dcy + DR)); y++) {
        for (let x = Math.max(0, Math.floor(dcx - DR)); x <= Math.min(DW - 1, Math.ceil(dcx + DR)); x++) {
          const dx = x - dcx, dy = y - dcy;
          const g = Math.exp(-(dx * dx + dy * dy) / (dr * dr));
          if (g < 0.01) continue;
          const i = y * DW + x;
          Dc[i] = Math.min(1.4, Dc[i] + g * 0.3 * (0.25 + 0.75 * pulse));
        }
      }
    }
    // vorticidade
    for (let y = 1; y < GH - 1; y++) {
      for (let x = 1; x < GW - 1; x++) {
        const i = y * GW + x;
        w[i] = 0.5 * (v[i + 1] - v[i - 1] - u[i + GW] + u[i - GW]);
      }
    }
    for (let y = 2; y < GH - 2; y++) {
      for (let x = 2; x < GW - 2; x++) {
        const i = y * GW + x;
        let nx = Math.abs(w[i + 1]) - Math.abs(w[i - 1]);
        let ny = Math.abs(w[i + GW]) - Math.abs(w[i - GW]);
        const l = Math.sqrt(nx * nx + ny * ny) + 1e-5;
        nx /= l; ny /= l;
        u[i] += curl * ny * w[i] * dt;
        v[i] -= curl * nx * w[i] * dt;
      }
    }
    // advecção da velocidade
    for (let y = 0; y < GH; y++) {
      for (let x = 0; x < GW; x++) {
        const i = y * GW + x;
        const px = x - u[i] * dt, py = y - v[i] * dt;
        u2[i] = sample(u, px, py) * 0.999;
        v2[i] = sample(v, px, py) * 0.999;
      }
    }
    let tmp = u; u = u2; u2 = tmp;
    tmp = v; v = v2; v2 = tmp;
    // viscosidade leve (uma passada de suavização): mata o xadrez da projeção em grade colocada
    for (let y = 1; y < GH - 1; y++) {
      for (let x = 1; x < GW - 1; x++) {
        const i = y * GW + x;
        u2[i] = u[i] * 0.8 + 0.05 * (u[i - 1] + u[i + 1] + u[i - GW] + u[i + GW]);
        v2[i] = v[i] * 0.8 + 0.05 * (v[i - 1] + v[i + 1] + v[i - GW] + v[i + GW]);
      }
    }
    for (let y = 1; y < GH - 1; y++) {
      for (let x = 1; x < GW - 1; x++) { const i = y * GW + x; u[i] = u2[i]; v[i] = v2[i]; }
    }
    // paredes
    for (let y = 0; y < GH; y++) { u[y * GW] = 0; u[y * GW + GW - 1] = 0; }
    for (let x = 0; x < GW; x++) { v[x] = 0; v[(GH - 1) * GW + x] = 0; }
    // projeção
    for (let y = 0; y < GH; y++) {
      for (let x = 0; x < GW; x++) {
        const i = y * GW + x;
        const uR = x < GW - 1 ? u[i + 1] : 0, uL = x > 0 ? u[i - 1] : 0;
        const vD = y < GH - 1 ? v[i + GW] : 0, vU = y > 0 ? v[i - GW] : 0;
        div[i] = 0.5 * (uR - uL + vD - vU);
      }
    }
    // SOR: miolo sem desvios; bordas (Neumann) copiam a vizinha a cada iteração
    for (let it = 0; it < 8; it++) {
      for (let y = 1; y < GH - 1; y++) {
        let i = y * GW + 1;
        for (let x = 1; x < GW - 1; x++, i++) {
          pr[i] += 1.75 * ((pr[i - 1] + pr[i + 1] + pr[i - GW] + pr[i + GW] - div[i]) * 0.25 - pr[i]);
        }
      }
      for (let y = 0; y < GH; y++) { pr[y * GW] = pr[y * GW + 1]; pr[y * GW + GW - 1] = pr[y * GW + GW - 2]; }
      for (let x = 0; x < GW; x++) { pr[x] = pr[GW + x]; pr[(GH - 1) * GW + x] = pr[(GH - 2) * GW + x]; }
    }
    for (let y = 0; y < GH; y++) {
      for (let x = 0; x < GW; x++) {
        const i = y * GW + x;
        const pL = x > 0 ? pr[i - 1] : pr[i], pR = x < GW - 1 ? pr[i + 1] : pr[i];
        const pU = y > 0 ? pr[i - GW] : pr[i], pD = y < GH - 1 ? pr[i + GW] : pr[i];
        u[i] -= 0.5 * (pR - pL);
        v[i] -= 0.5 * (pD - pU);
      }
    }
    // advecção da tinta (com dissipação): velocidade bilinear na grade grossa, pesos calculados uma vez
    // para os 3 canais (é o laço mais quente da simulação)
    const [d0, d1, d2] = D, [e0, e1, e2] = D2;
    const k2 = dt * 2;
    for (let y = 0; y < DH; y++) {
      let gy = (y + 0.5) / 2 - 0.5;
      gy = gy < 0 ? 0 : gy > GH - 1.001 ? GH - 1.001 : gy;
      const gy0 = gy | 0, gfy = gy - gy0;
      for (let x = 0; x < DW; x++) {
        let gx = (x + 0.5) / 2 - 0.5;
        gx = gx < 0 ? 0 : gx > GW - 1.001 ? GW - 1.001 : gx;
        const gx0 = gx | 0, gfx = gx - gx0;
        const gi = gy0 * GW + gx0;
        const w00 = (1 - gfx) * (1 - gfy), w10 = gfx * (1 - gfy), w01 = (1 - gfx) * gfy, w11 = gfx * gfy;
        const uu = u[gi] * w00 + u[gi + 1] * w10 + u[gi + GW] * w01 + u[gi + GW + 1] * w11;
        const vv = v[gi] * w00 + v[gi + 1] * w10 + v[gi + GW] * w01 + v[gi + GW + 1] * w11;
        let px = x - uu * k2, py = y - vv * k2;
        px = px < 0 ? 0 : px > DW - 1.001 ? DW - 1.001 : px;
        py = py < 0 ? 0 : py > DH - 1.001 ? DH - 1.001 : py;
        const x0 = px | 0, y0 = py | 0, fx = px - x0, fy = py - y0;
        const j = y0 * DW + x0;
        const a00 = (1 - fx) * (1 - fy) * fade, a10 = fx * (1 - fy) * fade, a01 = (1 - fx) * fy * fade, a11 = fx * fy * fade;
        const i = y * DW + x;
        e0[i] = d0[j] * a00 + d0[j + 1] * a10 + d0[j + DW] * a01 + d0[j + DW + 1] * a11;
        e1[i] = d1[j] * a00 + d1[j + 1] * a10 + d1[j + DW] * a01 + d1[j + DW + 1] * a11;
        e2[i] = d2[j] * a00 + d2[j + 1] * a10 + d2[j + DW] * a01 + d2[j + DW + 1] * a11;
      }
    }
    const tD = D; D = D2; D2 = tD;

    if (s >= Math.round(WARM * FPS)) {
      // RGB em Uint8 (3 bytes por célula); a borda copia a vizinha (parede sem deslizamento deixa a
      // última linha mais pobre → faixa escura na beira)
      const out = new Uint8Array(dn * 3);
      const [a, b, c] = D;
      for (let y = 0; y < DH; y++) {
        const sy = y === 0 ? 1 : y === DH - 1 ? DH - 2 : y;
        for (let x = 0; x < DW; x++) {
          const sx = x === 0 ? 1 : x === DW - 1 ? DW - 2 : x;
          const i = sy * DW + sx, j = (y * DW + x) * 3;
          out[j] = Math.min(255, a[i] * 180);
          out[j + 1] = Math.min(255, b[i] * 180);
          out[j + 2] = Math.min(255, c[i] * 180);
        }
      }
      frames.push(out);
    }
  }
  return frames;
}

export default {
  id: 'fluid',
  title: 'Fluid',
  description: 'Jatos de tinta colorida girando num fluido de verdade (stable fluids): redemoinhos, filetes e misturas.',
  category: 'particulas',
  tags: ['simulação', 'fundo', 'loop', 'shader'],
  duration: 10,
  poster: 5,

  params: {
    bg: { type: 'color', label: 'Fundo', default: '#0a0b12' },
    c1: { type: 'color', label: 'Tinta 1', default: '#ff4d2e' },
    c2: { type: 'color', label: 'Tinta 2', default: '#5b6cff' },
    c3: { type: 'color', label: 'Tinta 3', default: '#f3efe9' },
    jets: { type: 'range', label: 'Jatos', min: 1, max: 6, step: 1, default: 3 },
    speed: { type: 'range', label: 'Força', min: 0.3, max: 2, step: 0.05, default: 1 },
    swirl: { type: 'range', label: 'Giro', min: 0, max: 1.4, step: 0.05, default: 0.55 },
    curl: { type: 'range', label: 'Vórtices', min: 0, max: 40, step: 1, default: 18 },
    density: { type: 'range', label: 'Tinta', min: 0.4, max: 2, step: 0.05, default: 1 },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 4 },
  },

  setup({ w, h, p, px, duration }) {
    const N = px < 0.5 ? 80 : 118;
    const cell = Math.max(w, h) / N;
    const GW = Math.max(8, Math.round(w / cell));
    const GH = Math.max(8, Math.round(h / cell));
    const nFrames = Math.ceil((duration + XF) * FPS) + 1;
    const opts = { jets: p.jets, speed: p.speed, swirl: p.swirl, curl: p.curl, fade: 0.99, seed: p.seed, duration };
    const key = JSON.stringify([GW, GH, nFrames, opts]);
    let frames = cache.get(key);
    if (!frames) {
      frames = simulate(GW, GH, nFrames, opts);
      if (cache.size > 2) cache.delete(cache.keys().next().value);
      cache.set(key, frames);
    }
    const canvas = document.createElement('canvas');
    canvas.width = GW * 2;
    canvas.height = GH * 2;
    const gctx = canvas.getContext('2d', { willReadFrequently: true });
    const img = gctx.createImageData(GW * 2, GH * 2);
    for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255;
    return { GW: GW * 2, GH: GH * 2, frames, canvas, gctx, img };
  },

  render(ctx, t, env) {
    const { p, duration, state } = env;
    const { GW, GH, frames, canvas, gctx, img } = state;
    const last = frames.length - 1;
    const at = (tt) => {
      const fi = clamp(tt * FPS, 0, last);
      const i0 = Math.floor(fi);
      return [frames[i0], frames[Math.min(last, i0 + 1)], fi - i0];
    };
    const d = img.data;
    const n = a0len(frames);
    const [a, b, k] = at(t);
    if (t < XF) {
      // emenda: o começo do loop sai do quadro t+duração e entra no quadro t
      const s = ease.inOutSine(t / XF);
      const [a2, b2, k2] = at(t + duration);
      const norm = 1 / Math.sqrt(s * s + (1 - s) * (1 - s));
      for (let i = 0, j = 0; i < n; i++, j += i % 3 === 0 ? 2 : 1) {
        const x = a[i] + (b[i] - a[i]) * k;
        const y = a2[i] + (b2[i] - a2[i]) * k2;
        d[j] = (y + (x - y) * s) * norm;
      }
    } else {
      for (let i = 0, j = 0; i < n; i++, j += i % 3 === 0 ? 2 : 1) d[j] = a[i] + (b[i] - a[i]) * k;
    }
    gctx.putImageData(img, 0, 0);
    shader(ctx, FRAG, {
      u_dye: canvas,
      u_grid: [GW, GH],
      u_bg: p.bg,
      u_c1: p.c1,
      u_c2: p.c2,
      u_c3: p.c3,
      u_gain: (255 / 180) * p.density,
      u_gloss: 1,
    }, env);
  },
};
