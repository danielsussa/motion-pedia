import { clamp, rng, ease, seg, hexToRgb } from '../lib/anim.js';
import { asset } from '../lib/assets.js';

// Areia (autômato celular) "assada" no setup. O logo vira um molde invisível: cada coluna da silhueta tem
// paredes abaixo do seu fundo, então os grãos que caem por cima enchem a forma de baixo para cima.
// Soltamos exatamente um grão por célula do molde, na coluna do alvo e em ordem de baixo para cima (com jitter),
// e a regra da areia (cai; se bloqueado, escorrega na diagonal) faz o resto. A cor de cada grão vem da célula
// onde ele termina — então o logo aparece "pintado" camada por camada. Guardamos a posição de cada grão por
// quadro (Uint16). No fim, o fundo do molde abre e a areia escoa (analítico, no render) → loop limpo.

const FPS = 30;
const P0 = 0.25; // início da chuva
const P1 = 6.0; // último grão solto
const SIM_END = 7.4;
const SHEEN = [7.1, 8.2];
const OUT = 1.55; // escoamento final

const cache = new Map();

function buildLogo(img, GW, GH, cell, w, h, size) {
  const L = Math.min(w, h) * size;
  const k = Math.min(L / img.width, L / img.height);
  const bw = Math.max(4, Math.round((img.width * k) / cell));
  const bh = Math.max(4, Math.round((img.height * k) / cell));
  const c = document.createElement('canvas');
  c.width = bw;
  c.height = bh;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, 0, 0, bw, bh);
  const data = g.getImageData(0, 0, bw, bh).data;
  // um pouco abaixo do centro: areia "assenta"
  const ox = Math.round((GW - bw) / 2);
  const oy = Math.round((GH - bh) / 2 + Math.min(GW, GH) * 0.03);
  const mask = new Uint8Array(GW * GH);
  const col = new Uint8Array(GW * GH * 3);
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const gx = ox + x, gy = oy + y;
      if (gx < 0 || gy < 0 || gx >= GW || gy >= GH) continue;
      const s = (y * bw + x) * 4;
      if (data[s + 3] < 110) continue;
      const i = gy * GW + gx;
      mask[i] = 1;
      // desfaz o pré-multiplicado da borda
      const a = data[s + 3] / 255;
      col[i * 3] = Math.min(255, data[s] / a);
      col[i * 3 + 1] = Math.min(255, data[s + 1] / a);
      col[i * 3 + 2] = Math.min(255, data[s + 2] / a);
    }
  }
  return { mask, col };
}

function simulate(GW, GH, mask, seed) {
  const n = GW * GH;
  const r = rng(seed);
  // molde: em cada coluna com silhueta, células do topo ao fundo são preenchíveis; abaixo do fundo é parede
  // colunas fora da silhueta são parede da linha do topo do logo para baixo (senão a areia escorre pelos lados)
  const wall = new Uint8Array(n);
  const fillable = new Uint8Array(n);
  const fill = [];
  let gTop = GH;
  for (let i = 0; i < n; i++) if (mask[i]) { gTop = Math.min(gTop, (i / GW) | 0); }
  for (let x = 0; x < GW; x++) {
    let top = -1, bot = -1;
    for (let y = 0; y < GH; y++) if (mask[y * GW + x]) { if (top < 0) top = y; bot = y; }
    if (top < 0) {
      for (let y = gTop; y < GH; y++) wall[y * GW + x] = 1;
      continue;
    }
    for (let y = bot + 1; y < GH; y++) wall[y * GW + x] = 1;
    // o molde vai da linha do topo do logo (não do topo da coluna) até o fundo: os cantos arredondados de
    // cima viram "vão" preenchido por grãos invisíveis — senão a areia que escorrega para lá fica presa
    for (let y = gTop; y <= bot; y++) { fill.push(y * GW + x); fillable[y * GW + x] = 1; }
  }
  // ordem de soltura: de baixo para cima, com ondulação por coluna e ruído (superfície irregular)
  const wav = r() * 6;
  const keyed = fill.map((i) => {
    const x = i % GW, y = (i / GW) | 0;
    return [i, y + 2.2 * Math.sin(x * 0.11 + wav) + r() * 3.5];
  });
  keyed.sort((a, b) => b[1] - a[1]);
  const N = keyed.length;
  const target = keyed.map((k) => k[0] % GW);

  const occ = new Int32Array(n).fill(-1);
  const pos = new Int32Array(N).fill(-1); // -1 = ainda não saiu; -2 = saiu da tela
  const vy = new Float64Array(N);
  const acc = new Float64Array(N);
  const g = GH * 2.2; // células/s²
  const dt = 1 / FPS;
  let spawned = 0;
  const queue = [];
  const frames = [];
  const nFrames = Math.round(SIM_END * FPS) + 1;
  const order = [];
  for (let f = 0; f < nFrames; f++) {
    const t = f / FPS;
    // soltura: ritmo com easing (começa e termina devagar)
    const want = Math.round(N * ease.inOutSine(seg(t, P0, P1)));
    while (spawned < want) queue.push(spawned++);
    for (let q = 0; q < queue.length; q++) {
      const id = queue[q];
      const x = target[id];
      // entra numa das 2 linhas de cima (ou espera a vez)
      const row = r() < 0.5 ? 0 : 1;
      const i = row * GW + x;
      if (occ[i] < 0) {
        occ[i] = id;
        pos[id] = i;
        vy[id] = FPS * (0.6 + r() * 0.4);
        acc[id] = r();
        queue[q] = -1;
      }
    }
    for (let q = queue.length - 1; q >= 0; q--) if (queue[q] < 0) queue.splice(q, 1);

    // passo: de baixo para cima (quem está embaixo abre espaço primeiro), alternando o sentido
    order.length = 0;
    for (let id = 0; id < spawned; id++) if (pos[id] >= 0) order.push(id);
    order.sort((a, b) => pos[b] - pos[a]);
    const flip = f & 1;
    for (const id of order) {
      let i = pos[id];
      vy[id] = Math.min(vy[id] + g * dt, GH * 2.5);
      acc[id] += vy[id] * dt;
      let moves = Math.max(1, Math.floor(acc[id]));
      acc[id] -= moves;
      if (acc[id] < 0) acc[id] = 0;
      while (moves-- > 0) {
        const x = i % GW;
        const y = (i - x) / GW;
        if (y === GH - 1) {
          // fundo da tela aberto: sobra sai de cena
          occ[i] = -1;
          i = -2;
          break;
        }
        const d = i + GW;
        if (occ[d] < 0 && !wall[d]) {
          occ[i] = -1; occ[d] = id; i = d;
          continue;
        }
        const first = (r() < 0.5) !== !!flip ? -1 : 1;
        let moved = false;
        for (const s of [first, -first]) {
          const nx = x + s;
          if (nx < 0 || nx >= GW) continue;
          const dd = d + s;
          if (occ[dd] < 0 && !wall[dd] && occ[i + s] < 0 && !wall[i + s]) {
            occ[i] = -1; occ[dd] = id; i = dd;
            vy[id] *= 0.7;
            moved = true;
            break;
          }
        }
        // parado fora do molde (sobra no topo): escorre de lado, como líquido, até achar um vão
        // (anda em direção ao vão livre mais próximo na linha de baixo)
        if (!moved && !fillable[i] && t > P0 + 1) {
          let dir = 0;
          for (let k = 1; k < GW && !dir; k++) {
            if (x - k >= 0 && occ[d - k] < 0 && !wall[d - k]) dir = -1;
            else if (x + k < GW && occ[d + k] < 0 && !wall[d + k]) dir = 1;
          }
          // até 4 células por passo (a sobra do topo some rápido, sem "formigas" andando no fim)
          for (let k = 0; k < 4 && dir; k++) {
            const nx = (i % GW) + dir;
            if (nx < 0 || nx >= GW || occ[i + dir] >= 0 || wall[i + dir]) break;
            occ[i] = -1; occ[i + dir] = id; i += dir;
            moved = true;
            if (occ[i + GW] < 0 && !wall[i + GW]) break;
          }
          if (moved) break;
        }
        if (!moved) {
          vy[id] = FPS * 0.6;
          acc[id] = 0;
          break;
        }
      }
      pos[id] = i;
    }
    const snap = new Uint16Array(N);
    for (let id = 0; id < N; id++) snap[id] = pos[id] >= 0 ? pos[id] : 65535;
    frames.push(snap);
  }
  return { frames, N };
}

export default {
  id: 'falling-sand',
  title: 'Falling Sand',
  description: 'Areia cai grão a grão por cima de um molde invisível e vai preenchendo o logo de baixo para cima; no fim, escoa.',
  category: 'particulas',
  tags: ['simulação', 'partículas', 'intro', 'loop'],
  duration: 10,
  poster: 7.6,

  params: {
    image: { type: 'image', label: 'Logo (PNG/SVG)', default: '/samples/logo.svg' },
    bg: { type: 'color', label: 'Fundo', default: '#ece6db' },
    ghost: { type: 'color', label: 'Molde', default: '#ddd5c7' },
    size: { type: 'range', label: 'Tamanho do logo', min: 0.3, max: 0.85, step: 0.01, default: 0.56 },
    grains: { type: 'range', label: 'Grãos (lado maior)', min: 90, max: 240, step: 10, default: 170 },
    jitter: { type: 'range', label: 'Variação do grão', min: 0, max: 0.3, step: 0.01, default: 0.12 },
    sheen: { type: 'boolean', label: 'Brilho no fim', default: true },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 5 },
  },

  setup({ w, h, p, px }) {
    const img = asset(p.image);
    const Nside = px < 0.5 ? Math.min(p.grains, 120) : p.grains;
    const cell = Math.max(w, h) / Nside;
    const GW = Math.ceil(w / cell);
    const GH = Math.ceil(h / cell);
    // fundo com vinheta (mesma cor, só alpha) pintado uma vez
    const bgc = document.createElement('canvas');
    bgc.width = Math.max(1, Math.round(w * px));
    bgc.height = Math.max(1, Math.round(h * px));
    const bctx = bgc.getContext('2d');
    bctx.scale(px, px);
    bctx.fillStyle = p.bg;
    bctx.fillRect(0, 0, w, h);
    const vg = bctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.hypot(w, h) * 0.62);
    vg.addColorStop(0, 'rgba(60,40,20,0)');
    vg.addColorStop(1, 'rgba(60,40,20,0.16)');
    bctx.fillStyle = vg;
    bctx.fillRect(0, 0, w, h);
    if (!img) return { bgc, img: null };

    const { mask, col } = buildLogo(img, GW, GH, cell, w, h, p.size);
    const key = [GW, GH, p.size, p.seed, p.image, w, h].join('|');
    let sim = cache.get(key);
    if (!sim) {
      sim = simulate(GW, GH, mask, p.seed);
      if (cache.size > 4) cache.delete(cache.keys().next().value);
      cache.set(key, sim);
    }
    const { frames, N } = sim;
    // cor de cada grão = cor do logo onde ele termina (fora do logo: cor do molde)
    const last = frames[frames.length - 1];
    const r = rng(p.seed * 7 + 1);
    const [gr, gg, gb] = hexToRgb(p.ghost);
    const rgb = new Uint8Array(N * 3);
    const finalRow = new Float32Array(N);
    const delay = new Float32Array(N);
    const hidden = new Uint8Array(N);
    let maxRow = 0;
    for (let id = 0; id < N; id++) {
      const i = last[id];
      let c = [gr, gg, gb];
      if (i !== 65535) {
        if (mask[i]) c = [col[i * 3], col[i * 3 + 1], col[i * 3 + 2]];
        else hidden[id] = 1; // vão dentro do molde (canto/furo do logo): grão invisível
        finalRow[id] = (i / GW) | 0;
        maxRow = Math.max(maxRow, finalRow[id]);
      } else finalRow[id] = -1;
      const j = 1 + (r() - 0.5) * 2 * p.jitter;
      rgb[id * 3] = clamp(c[0] * j, 0, 255);
      rgb[id * 3 + 1] = clamp(c[1] * j, 0, 255);
      rgb[id * 3 + 2] = clamp(c[2] * j, 0, 255);
      delay[id] = r();
    }
    // molde fantasma (silhueta) numa textura da grade
    const ghostC = document.createElement('canvas');
    ghostC.width = GW;
    ghostC.height = GH;
    const gx = ghostC.getContext('2d');
    const gimg = gx.createImageData(GW, GH);
    for (let i = 0; i < GW * GH; i++) {
      if (!mask[i]) continue;
      gimg.data[i * 4] = gr; gimg.data[i * 4 + 1] = gg; gimg.data[i * 4 + 2] = gb; gimg.data[i * 4 + 3] = 255;
    }
    gx.putImageData(gimg, 0, 0);
    const canvas = document.createElement('canvas');
    canvas.width = GW;
    canvas.height = GH;
    const gctx = canvas.getContext('2d', { willReadFrequently: true });
    return {
      bgc, img, GW, GH, cell, frames, N, rgb, hidden, finalRow, maxRow, delay, ghostC, canvas, gctx,
      buf: gctx.createImageData(GW, GH),
    };
  },

  render(ctx, t, env) {
    const { w, h, p, duration, state } = env;
    ctx.drawImage(state.bgc, 0, 0, w, h);
    if (!state.img) return;
    const { GW, GH, cell, frames, N, rgb, hidden, finalRow, maxRow, delay, ghostC, canvas, gctx, buf } = state;
    const ox = (w - GW * cell) / 2;
    const oy = (h - GH * cell) / 2;
    ctx.imageSmoothingEnabled = false;

    // molde: visível no começo, some quando a areia o completa, volta no escoamento (emenda do loop)
    const tOut = duration - OUT - 0.1;
    const ghostA = 1 - ease.inOutSine(seg(t, P1 - 1.5, P1 + 0.6)) +
      ease.outCubic(seg(t, tOut + 0.3, duration - 0.15));
    if (ghostA > 0.001) {
      ctx.globalAlpha = clamp(ghostA);
      ctx.drawImage(ghostC, ox, oy, GW * cell, GH * cell);
      ctx.globalAlpha = 1;
    }

    const f = frames[clamp(Math.round(t * FPS), 0, frames.length - 1)];
    const d = buf.data;
    d.fill(0);
    const draining = t > tOut;
    const sheenOn = p.sheen && t > SHEEN[0] && t < SHEEN[1];
    const sp = ease.inOutCubic(seg(t, SHEEN[0], SHEEN[1]));
    const band = (GW + GH) * (sp * 1.3 - 0.15);
    const gpx = GH * 2.6; // gravidade do escoamento (células/s²)
    for (let id = 0; id < N; id++) {
      let i = f[id];
      if (i === 65535 || hidden[id]) continue;
      let x = i % GW;
      let y = (i - x) / GW;
      if (draining && finalRow[id] >= 0) {
        // o fundo abre: as linhas de baixo saem primeiro
        const st = tOut + ((maxRow - finalRow[id]) / GH) * 1.1 + delay[id] * 0.12;
        const dtt = t - st;
        if (dtt > 0) {
          y += Math.floor(0.5 * gpx * dtt * dtt + dtt * 4);
          if (y >= GH) continue;
          i = y * GW + x;
        }
      }
      let r = rgb[id * 3], g = rgb[id * 3 + 1], b = rgb[id * 3 + 2];
      if (sheenOn) {
        const k = Math.max(0, 1 - Math.abs(x + y - band) / 7);
        if (k > 0) {
          const s = k * k * 0.45;
          r += (255 - r) * s; g += (255 - g) * s; b += (255 - b) * s;
        }
      }
      const j = i * 4;
      d[j] = r; d[j + 1] = g; d[j + 2] = b; d[j + 3] = 255;
    }
    gctx.putImageData(buf, 0, 0);
    ctx.drawImage(canvas, ox, oy, GW * cell, GH * cell);
    ctx.imageSmoothingEnabled = true;
  },
};
