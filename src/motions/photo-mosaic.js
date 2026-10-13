import { seg, ease, rng } from '../lib/anim.js';
import { asset } from '../lib/assets.js';
import { coverRect, imageGrid } from '../lib/image.js';
import { shader } from '../lib/gl.js';

// Fotomosaico: a foto vira uma grade de miniaturas. No setup saem 64 recortes aleatórios da própria foto
// e/ou de uma segunda foto, desenhados em dois atlas (128 px e 32 px por miniatura) com a cor média de
// cada um; cada célula escolhe o recorte de média mais próxima da sua cor (com um sorteio leve e sem
// repetir o vizinho) e o shader corrige o ganho por canal para a média bater com a célula. Assim, de
// perto se veem fotos e de longe a imagem. Câmera: começa bem perto do foco (rosto), as miniaturas
// brotam numa onda a partir dele, a câmera recua até o quadro inteiro, pausa e as peças somem das
// bordas para o centro. t=0 e t=duration são o papel vazio, então o loop fecha.
const NV = 64;          // recortes
const AT = 8;           // atlas 8×8
const HI = 128, LO = 32;

const FRAG = `
uniform sampler2D u_tgt;   // cor alvo por célula
uniform sampler2D u_info;  // r = recorte escolhido (índice*4)
uniform sampler2D u_means; // 64×1: média de cada recorte
uniform sampler2D u_hi;
uniform sampler2D u_lo;
uniform vec2 u_wh;
uniform vec2 u_dims;       // colunas, linhas
uniform float u_cell;
uniform vec3 u_cam;        // centro da câmera (lógico) + zoom
uniform vec2 u_focus;      // foco (lógico)
uniform float u_dmax;
uniform float u_t;
uniform float u_in0;
uniform float u_inSpan;
uniform float u_out0;
uniform float u_outSpan;
uniform float u_gap;
uniform float u_fid;
uniform float u_cellPx;    // célula na tela em px reais
uniform vec3 u_paper;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float seg(float t, float a, float b) { return clamp((t - a) / (b - a), 0.0, 1.0); }
float spring(float x, float b) {
  if (x <= 0.0) return 0.0;
  if (x >= 1.0) return 1.0;
  return 1.0 - exp(-7.0 * x) * cos(x * 3.14159265 * (1.0 + b * 6.0));
}
void main() {
  vec2 pos = vec2(gl_FragCoord.x / u_res.x, 1.0 - gl_FragCoord.y / u_res.y) * u_wh;
  float Z = u_cam.z;
  vec2 wp = u_cam.xy + (pos - 0.5 * u_wh) / Z;
  vec2 g = wp / u_cell;
  vec2 ci = floor(g);
  vec2 f = g - ci;
  vec3 col = u_paper;
  if (ci.x < 0.0 || ci.y < 0.0 || ci.x >= u_dims.x || ci.y >= u_dims.y) { outColor = vec4(col, 1.0); return; }

  // tempo de entrada e saída da célula: onda radial a partir do foco + sorteio
  vec2 cc = (ci + 0.5) * u_cell;
  float dn = length(cc - u_focus) / u_dmax;
  float hj = hash(ci);
  float a = u_in0 + u_inSpan * pow(dn, 0.85) + 0.22 * hj;
  float s = spring(seg(u_t, a, a + 0.75), 0.28);
  float b = u_out0 + u_outSpan * (1.0 - dn) + 0.2 * hash(ci + 17.0);
  float e = seg(u_t, b, b + 0.45);
  s *= 1.0 - e * e * (3.0 - 2.0 * e);
  if (s < 0.002) { outColor = vec4(col, 1.0); return; }

  // ladrilho: quadrado arredondado de lado (1 - gap) * s, centrado na célula
  float half_ = 0.5 * (1.0 - u_gap) * s;
  vec2 q = abs(f - 0.5);
  float rad = min(half_, 0.12 * u_gap / 0.08 * s);
  float sd = length(max(q - (half_ - rad), 0.0)) - rad;
  float aa = 0.75 / max(u_cellPx, 1.0);
  float cov = smoothstep(aa, -aa, sd);
  if (cov <= 0.0) { outColor = vec4(col, 1.0); return; }

  vec2 cuv = (ci + 0.5) / u_dims;
  cuv.y = 1.0 - cuv.y;
  vec3 tgt = texture(u_tgt, cuv).rgb;
  float vi = floor(texture(u_info, cuv).r * 255.0 / 4.0 + 0.5);
  vec3 mean = texture(u_means, vec2((vi + 0.5) / 64.0, 0.5)).rgb;
  vec2 cell = vec2(mod(vi, 8.0), floor(vi / 8.0));
  vec2 l = clamp((f - 0.5) / max(2.0 * half_, 1e-3) + 0.5, 0.0, 1.0);
  vec2 lh = (cell + 0.004 + l * 0.992) / 8.0;
  vec2 ll = (cell + 0.02 + l * 0.96) / 8.0;
  vec3 th = mix(texture(u_lo, vec2(ll.x, 1.0 - ll.y)).rgb, texture(u_hi, vec2(lh.x, 1.0 - lh.y)).rgb,
                smoothstep(28.0, 72.0, u_cellPx));
  // correção: ganho de luminância (limitado) + deslocamento aditivo da média → a média bate com a célula
  // sem amplificar a proporção entre canais (ganho por canal esverdeava recortes vermelhos)
  vec3 Lw = vec3(0.2126, 0.7152, 0.0722);
  float lg = clamp((dot(tgt, Lw) + 0.03) / (dot(mean, Lw) + 0.03), 0.45, 1.8);
  vec3 tile = mix(th, clamp(th * lg + (tgt - mean * lg), 0.0, 1.0), u_fid);
  // pequenas na tela, a miniatura cede para a cor da célula (a foto grande lê melhor e não cintila)
  tile = mix(tgt, tile, smoothstep(3.0, 9.0, u_cellPx) * (0.6 + 0.4 * smoothstep(14.0, 70.0, u_cellPx)));
  // borda interna sutil quando há fresta
  tile *= 1.0 - 0.18 * (u_gap / 0.08) * smoothstep(0.62, 1.0, max(q.x, q.y) / max(half_, 1e-3));
  outColor = vec4(mix(col, tile, cov), 1.0);
}`;

const cache = new Map();

function buildAtlas(sources, seed) {
  const key = `${sources.map((s) => s.src || s.width).join('|')}#${seed}`;
  if (cache.has(key)) return cache.get(key);
  const hi = document.createElement('canvas');
  hi.width = hi.height = HI * AT;
  const lo = document.createElement('canvas');
  lo.width = lo.height = LO * AT;
  const gh = hi.getContext('2d');
  const gl = lo.getContext('2d', { willReadFrequently: true });
  const r = rng(seed * 7919 + 13);
  for (let v = 0; v < NV; v++) {
    const img = sources[v % sources.length];
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    const side = Math.min(iw, ih) * (0.18 + 0.3 * r());
    const sx = r() * (iw - side), sy = r() * (ih - side);
    const ax = (v % AT), ay = Math.floor(v / AT);
    gh.drawImage(img, sx, sy, side, side, ax * HI, ay * HI, HI, HI);
    gl.drawImage(img, sx, sy, side, side, ax * LO, ay * LO, LO, LO);
  }
  const data = gl.getImageData(0, 0, LO * AT, LO * AT).data;
  const means = new Float32Array(NV * 3);
  const mid = new ImageData(NV, 1);
  for (let v = 0; v < NV; v++) {
    const ax = (v % AT) * LO, ay = Math.floor(v / AT) * LO;
    let R = 0, G = 0, B = 0;
    for (let y = 0; y < LO; y++) {
      for (let x = 0; x < LO; x++) {
        const i = ((ay + y) * LO * AT + ax + x) * 4;
        R += data[i]; G += data[i + 1]; B += data[i + 2];
      }
    }
    const n = LO * LO;
    means[v * 3] = R / n / 255;
    means[v * 3 + 1] = G / n / 255;
    means[v * 3 + 2] = B / n / 255;
    mid.data[v * 4] = R / n;
    mid.data[v * 4 + 1] = G / n;
    mid.data[v * 4 + 2] = B / n;
    mid.data[v * 4 + 3] = 255;
  }
  // ImageData (não canvas): o gl.js guarda em cache e sobe para a GPU uma vez só
  const out = { hi: gh.getImageData(0, 0, HI * AT, HI * AT), lo: gl.getImageData(0, 0, LO * AT, LO * AT), means, meansTex: mid };
  if (cache.size > 6) cache.clear();
  cache.set(key, out);
  return out;
}

export default {
  id: 'photo-mosaic',
  title: 'Photo Mosaic',
  description: 'Up close, photo thumbnails sprout in a wave; the camera pulls back as they form the whole photo, then they vanish from the edges inward.',
  category: 'imagem',
  tags: ['intro', 'loop', 'shader', 'pattern'],
  duration: 10,
  poster: 7.2,

  params: {
    image: { type: 'image', label: 'Photo', default: '/samples/portrait.jpg' },
    tiles: { type: 'image', label: 'Second photo (thumbnails)', default: '/samples/landscape.jpg' },
    source: { type: 'select', label: 'Thumbnails from', options: ['as duas', 'mesma foto', 'segunda foto'], default: 'as duas' },
    cells: { type: 'range', label: 'Tiles (short side)', min: 16, max: 90, step: 1, default: 44 },
    fidelity: { type: 'range', label: 'Color correction', min: 0, max: 1, step: 0.01, default: 0.85 },
    startZoom: { type: 'range', label: 'Starting zoom (pieces on screen)', min: 2, max: 16, step: 1, default: 5 },
    paper: { type: 'color', label: 'Background', default: '#121315' },
    focusY: { type: 'range', label: 'Vertical focus', min: 0, max: 1, step: 0.01, default: 0.3 },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 7 },
  },

  setup({ w, h, p }) {
    const img = asset(p.image);
    if (!img) return { ready: false };
    const second = asset(p.tiles);
    let sources = [img];
    if (p.source === 'segunda foto' && second) sources = [second];
    else if (p.source === 'as duas' && second) sources = [img, second];
    const atlas = buildAtlas(sources, p.seed);

    const cell = Math.min(w, h) / p.cells;
    const grid = imageGrid(img, { w, h, cell, fx: 0.5, fy: p.focusY });
    const { cols, rows, rgb } = grid;
    const tgt = document.createElement('canvas');
    tgt.width = cols;
    tgt.height = rows;
    const info = document.createElement('canvas');
    info.width = cols;
    info.height = rows;
    const tg = tgt.getContext('2d');
    const ig = info.getContext('2d');
    const td = tg.createImageData(cols, rows);
    const idd = ig.createImageData(cols, rows);
    const choice = new Int16Array(cols * rows);
    const r = rng(p.seed * 31 + 5);
    const M = atlas.means;
    const K = 8;
    const top = new Int16Array(K);
    const topD = new Float32Array(K);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        const R = rgb[i * 3] / 255, G = rgb[i * 3 + 1] / 255, B = rgb[i * 3 + 2] / 255;
        const left = x > 0 ? choice[i - 1] : -1;
        const up = y > 0 ? choice[i - cols] : -1;
        // os K recortes mais próximos na cor; sorteia entre eles (variedade) sem repetir os vizinhos
        top.fill(-1);
        topD.fill(Infinity);
        for (let v = 0; v < NV; v++) {
          if (v === left || v === up) continue;
          const dr = M[v * 3] - R, dg = M[v * 3 + 1] - G, db = M[v * 3 + 2] - B;
          const d = 0.3 * dr * dr + 0.59 * dg * dg + 0.11 * db * db;
          for (let j = 0; j < K; j++) {
            if (d < topD[j]) {
              topD.copyWithin(j + 1, j, K - 1);
              top.copyWithin(j + 1, j, K - 1);
              topD[j] = d;
              top[j] = v;
              break;
            }
          }
        }
        const best = top[Math.floor(r() * K)];
        choice[i] = best;
        td.data[i * 4] = rgb[i * 3];
        td.data[i * 4 + 1] = rgb[i * 3 + 1];
        td.data[i * 4 + 2] = rgb[i * 3 + 2];
        td.data[i * 4 + 3] = 255;
        idd.data[i * 4] = best * 4;
        idd.data[i * 4 + 3] = 255;
      }
    }
    tg.putImageData(td, 0, 0);
    ig.putImageData(idd, 0, 0);

    // foco = ponto (0.5, focusY) da foto, na tela
    const cr = coverRect(img, cols * cell, rows * cell, { fx: 0.5, fy: p.focusY });
    const fx = Math.min(w * 0.85, Math.max(w * 0.15, cr.x + cr.w * 0.5));
    const fy = Math.min(h * 0.85, Math.max(h * 0.15, cr.y + cr.h * p.focusY));
    let dmax = 0;
    for (const [x, y] of [[0, 0], [w, 0], [0, h], [w, h]]) dmax = Math.max(dmax, Math.hypot(x - fx, y - fy));
    return { ready: true, atlas, tgt, info, cell, cols, rows, focus: [fx, fy], dmax };
  },

  render(ctx, t, env) {
    const { w, h, p, px, duration, state } = env;
    if (!state.ready) {
      ctx.fillStyle = p.paper;
      ctx.fillRect(0, 0, w, h);
      return;
    }
    const D = duration;
    // zoom: de "startZoom peças na tela" até 1, interpolado em log
    const zmax = Math.max(1, p.cells / p.startZoom);
    const k = ease.inOutCubic(seg(t, D * 0.15, D * 0.64));
    const Z = Math.exp(Math.log(zmax) * (1 - k)) * (1 + 0.02 * ease.inOutSine(seg(t, D * 0.64, D * 0.9)));
    // âncora no foco: o foco fica parado na tela enquanto a câmera recua
    const [fx, fy] = state.focus;
    const cam = [fx + (w / 2 - fx) / Z, fy + (h / 2 - fy) / Z];
    const gap = 0.08 * Math.min(1, Math.max(0, (Z - 1.6) / 2.4));
    shader(ctx, FRAG, {
      u_tgt: state.tgt,
      u_info: state.info,
      u_means: state.atlas.meansTex,
      u_hi: state.atlas.hi,
      u_lo: state.atlas.lo,
      u_wh: [w, h],
      u_dims: [state.cols, state.rows],
      u_cell: state.cell,
      u_cam: [cam[0], cam[1], Z],
      u_focus: state.focus,
      u_dmax: state.dmax,
      u_t: t,
      u_in0: D * 0.03,
      u_inSpan: D * 0.3,
      u_out0: D * 0.84,
      u_outSpan: D * 0.07,
      u_gap: gap,
      u_fid: p.fidelity,
      u_cellPx: state.cell * Z * px,
      u_paper: p.paper,
    }, env);
  },
};
