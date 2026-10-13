import { clamp, seg, ease, rng, rgba, fract } from '../lib/anim.js';
import { asset } from '../lib/assets.js';
import { drawCover, imagePixels } from '../lib/image.js';

// Pixel sort: no setup a foto é lida numa resolução reduzida e, em cada linha (coluna ou fileira), os
// intervalos acima/abaixo do limiar de brilho são ordenados. No render, cada intervalo "escorre": o trecho
// ordenado cresce esticado a partir do início do intervalo (entrada) e depois é recolhido (saída).
// A foto original é desenhada em resolução cheia por baixo; só os pixels ordenados vêm da camada reduzida.

const MAX_PIXELS = 520_000; // teto da camada ordenada (≈ 960×540)

export default {
  id: 'pixel-sort',
  title: 'Pixel Sort',
  description: 'Photo pixels are sorted by brightness into streaks that drip away and then slide back, an artistic glitch.',
  category: 'imagem',
  tags: ['image', 'loop'],
  duration: 6,
  poster: 2.9,

  params: {
    image: { type: 'image', label: 'Photo', default: '/samples/portrait.jpg' },
    direction: { type: 'select', label: 'Direction', options: ['vertical', 'horizontal'], default: 'vertical' },
    mode: { type: 'select', label: 'Sort', options: ['claros', 'escuros'], default: 'claros' },
    threshold: { type: 'range', label: 'Brightness threshold', min: 0.05, max: 0.95, step: 0.01, default: 0.32 },
    amount: { type: 'range', label: 'Amount', min: 0, max: 1, step: 0.01, default: 0.8 },
    reverse: { type: 'boolean', label: 'Reverse order (light → dark)', default: false },
    zoom: { type: 'range', label: 'Zoom', min: 1, max: 2, step: 0.01, default: 1 },
    focus: { type: 'range', label: 'Vertical focus', min: 0, max: 1, step: 0.01, default: 0.3 },
    bg: { type: 'color', label: 'Background (loading)', default: '#0c0c10' },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 4 },
  },

  setup({ w, h, p, px }) {
    const img = asset(p.image);
    if (!img || !img.width) return { img: null };
    const r = Math.min(px * 0.5, Math.sqrt(MAX_PIXELS / (w * h)));
    const W = Math.max(8, Math.round(w * r));
    const H = Math.max(8, Math.round(h * r));
    const id = imagePixels(img, W, H, { zoom: p.zoom, fy: p.focus });
    const src = new Uint32Array(id.data.buffer);
    const d = id.data;
    const n = W * H;
    const lum = new Uint8Array(n);
    for (let i = 0; i < n; i++) lum[i] = (d[i * 4] * 54 + d[i * 4 + 1] * 183 + d[i * 4 + 2] * 19) >> 8;

    const vertical = p.direction === 'vertical';
    const lines = vertical ? W : H;
    const len = vertical ? H : W;
    const stride = vertical ? W : 1; // passo ao longo da linha
    const step = vertical ? 1 : W; // passo entre linhas
    const thr = Math.round(p.threshold * 255);
    const bright = p.mode === 'claros';
    const minLen = Math.max(3, Math.round(len * 0.015));
    const maxLen = Math.round(len * 0.85);

    const R = rng(p.seed * 7717 + 3);
    // atraso por linha: ruído de valor 1D suave (faixas vizinhas parecidas) + um pouco de aleatório
    const knots = Array.from({ length: 20 }, () => R());
    const smooth = (x) => {
      const xi = Math.floor(x), f = x - xi;
      const a = knots[xi % knots.length], b = knots[(xi + 1) % knots.length];
      return a + (b - a) * f * f * (3 - 2 * f);
    };

    const sorted = new Uint32Array(n);
    const keys = new Uint32Array(len);
    const iv = []; // [linha, início, fim, atraso, seleção]
    for (let l = 0; l < lines; l++) {
      const base = l * step;
      const dl = 0.65 * smooth((l / lines) * 14) + 0.35 * R();
      let i = 0;
      while (i < len) {
        const ok = (k) => (bright ? lum[base + k * stride] >= thr : lum[base + k * stride] <= thr);
        if (!ok(i)) { i++; continue; }
        let j = i;
        while (j < len && ok(j) && j - i < maxLen) j++;
        const L = j - i;
        if (L >= minLen) {
          // chave = brilho << 16 | índice local → um sort numérico de typed array
          for (let k = 0; k < L; k++) keys[k] = ((lum[base + (i + k) * stride] ^ (p.reverse ? 255 : 0)) << 16) | k;
          const ks = keys.subarray(0, L).sort();
          for (let k = 0; k < L; k++) sorted[base + (i + k) * stride] = src[base + (i + (ks[k] & 0xffff)) * stride];
          iv.push(l, i, j, clamp(dl + (R() - 0.5) * 0.12), R());
        }
        i = j;
      }
    }

    const layer = document.createElement('canvas');
    layer.width = W;
    layer.height = H;
    const lctx = layer.getContext('2d');
    const out = lctx.createImageData(W, H);
    return { img, W, H, sorted, iv: Float32Array.from(iv), out, out32: new Uint32Array(out.data.buffer), layer, lctx, stride, step };
  },

  render(ctx, t, { w, h, p, state }) {
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, w, h);
    if (!state.img) {
      const m = Math.min(w, h);
      ctx.fillStyle = rgba('#ffffff', 0.06);
      for (let i = 0; i < 24; i++) ctx.fillRect((i / 24) * w, 0, w / 48, h * (0.3 + 0.5 * fract(Math.sin(i * 12.9) * 43758)));
      ctx.fillStyle = rgba('#ffffff', 0.25);
      ctx.fillRect(w / 2 - m * 0.1, h / 2, m * 0.2 * fract(t / 2), m * 0.004);
      return;
    }
    ctx.imageSmoothingQuality = 'high';
    drawCover(ctx, state.img, w, h, { zoom: p.zoom, fy: p.focus });

    const { iv, sorted, out32, stride, step } = state;
    out32.fill(0);
    let any = false;
    for (let q = 0; q < iv.length; q += 5) {
      if (iv[q + 4] > p.amount) continue;
      const dl = iv[q + 3];
      // entrada: escorre de 0,25 s a ~2,6 s; saída: recolhe de ~3,3 s a 5,95 s
      const a0 = 0.25 + dl * 1.25;
      const kin = ease.outCubic(seg(t, a0, a0 + 1.1));
      const b0 = 3.3 + dl * 1.45;
      const kout = ease.inOutCubic(seg(t, b0, b0 + 1.2));
      if (kin <= 0 || kout >= 1) continue;
      any = true;
      const l = iv[q], a = iv[q + 1], L = iv[q + 2] - a;
      const base = l * step + a * stride;
      const head = Math.min(L, Math.ceil(L * kin));
      const tail = Math.floor(L * kout);
      const inv = 1 / kin;
      if (kin >= 1) for (let i = tail; i < head; i++) out32[base + i * stride] = sorted[base + i * stride];
      else for (let i = tail; i < head; i++) out32[base + i * stride] = sorted[base + Math.min(L - 1, Math.floor(i * inv)) * stride];
    }
    if (!any) return;
    state.lctx.putImageData(state.out, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(state.layer, 0, 0, w, h);
    ctx.imageSmoothingEnabled = true;
  },
};
