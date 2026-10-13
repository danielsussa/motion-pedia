import { seg, ease, rgba, rng, fract, smoothstep } from '../lib/anim.js';

const SETS = {
  código: '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ$+-*/=<>#%&@{}[];:?!',
  binário: '01',
  hex: '0123456789ABCDEF',
  símbolos: '+-*/=<>|^~:;.,_#%&@$!?(){}[]',
};

// Hash inteiro → 0..1 (sem estado).
const hash = (a, b, c = 0) => {
  let x = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 2147483647);
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
};

const LEVELS = 10; // faixas de alpha do rastro (um fillStyle por faixa)

export default {
  id: 'matrix-rain',
  title: 'Code Rain',
  description: 'Columns of falling characters with bright heads and fading trails; they can form a word in the middle.',
  category: 'tipografia',
  tags: ['typography', 'background', 'loop'],
  duration: 8,
  poster: 4.6,

  params: {
    word: { type: 'text', label: 'Word (empty = rain only)', default: 'MOTION' },
    charset: { type: 'select', label: 'Characters', options: Object.keys(SETS), default: 'código' },
    cell: { type: 'range', label: 'Character size', min: 0.012, max: 0.05, step: 0.001, default: 0.024 },
    density: { type: 'range', label: 'Density', min: 0.2, max: 1, step: 0.05, default: 0.65 },
    trail: { type: 'range', label: 'Trail', min: 4, max: 40, step: 1, default: 18 },
    color: { type: 'color', label: 'Color', default: '#38e08a' },
    head: { type: 'color', label: 'Head / word', default: '#eafff2' },
    bg: { type: 'color', label: 'Background', default: '#050807' },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 3 },
    transparent: { type: 'boolean', label: 'Transparent background', default: false },
  },

  setup({ w, h, p }) {
    const cs = Math.max(6, Math.min(w, h) * p.cell);
    const cols = Math.ceil(w / (cs * 0.72)); // mono: largura ~0,6 do corpo + respiro
    const cw = w / cols;
    const rows = Math.ceil(h / cs) + 1;
    const r = rng(p.seed * 9973 + 1);
    const trail = p.trail;
    // Gotas: cada coluna tem 1–3 gotas; a cabeça percorre (rows + trail) células `laps` vezes por loop
    // (inteiro → loop perfeito). Fase aleatória.
    const drops = [];
    for (let c = 0; c < cols; c++) {
      if (r() > p.density) continue;
      const n = 1 + (r() < 0.45) + (r() < 0.12);
      const laps = 1 + Math.floor(r() * 3);
      for (let k = 0; k < n; k++)
        drops.push({ c, laps, ph: (k + r() * 0.8) / n, len: trail * (0.55 + r() * 0.7), dim: 0.55 + r() * 0.45 });
    }
    // Máscara da palavra numa grade cols × rows.
    let mask = null;
    if (p.word && p.word.trim()) {
      const cv = document.createElement('canvas');
      cv.width = cols;
      cv.height = rows;
      const g = cv.getContext('2d', { willReadFrequently: true });
      // Fonte em "células": compensa a célula não-quadrada esticando o x.
      const sx = cs / cw;
      let fsz = rows * 0.5;
      g.font = `900 ${fsz}px Inter, sans-serif`;
      const tw = g.measureText(p.word).width / sx;
      if (tw > cols * 0.9) {
        fsz *= (cols * 0.9) / tw;
        g.font = `900 ${fsz}px Inter, sans-serif`;
      }
      g.setTransform(1 / sx, 0, 0, 1, cols / 2, rows / 2);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(p.word, 0, fsz * 0.04);
      const d = g.getImageData(0, 0, cols, rows).data;
      mask = new Float32Array(cols * rows);
      for (let i = 0; i < cols * rows; i++) mask[i] = d[i * 4 + 3] / 255;
    }
    // Faixa de linhas ocupada pela palavra (a chuva ali esmaece para ela ler bem).
    let band = null;
    if (mask) {
      let a = rows;
      let b = -1;
      for (let i = 0; i < cols * rows; i++) if (mask[i] > 0.5) {
        const rr = Math.floor(i / cols);
        a = Math.min(a, rr);
        b = Math.max(b, rr);
      }
      if (b >= a) band = [a - 2, b + 2];
    }
    return { cs, cols, rows, cw, drops, mask, band, chars: SETS[p.charset] || SETS['código'] };
  },

  render(ctx, t, { w, h, p, progress, state }) {
    if (!p.transparent) {
      ctx.fillStyle = p.bg;
      ctx.fillRect(0, 0, w, h);
    }
    const { cs, cols, rows, cw, drops, mask, band, chars } = state;
    const NC = chars.length;
    ctx.font = `500 ${cs * 0.82}px "JetBrains Mono", ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Troca de caractere: cada célula muda ~M vezes por loop (inteiro), com fase própria.
    // `n` trocas por loop → periódico em progress.
    const glyph = (c, r, n) => {
      const off = hash(c, r, 7);
      const step = Math.floor(fract(progress + off) * n);
      return chars[Math.floor(hash(c, r, step) * NC)];
    };

    // Palavra: aparece no meio do loop e se desfaz antes do fim.
    const wordOn = mask ? smoothstep(0.22, 0.42, progress) * (1 - smoothstep(0.78, 0.95, progress)) : 0;

    // Rastros por faixa de alpha.
    const buckets = Array.from({ length: LEVELS }, () => []);
    const heads = [];
    const lit = mask ? new Float32Array(cols * rows) : null;
    for (const d of drops) {
      const span = rows + d.len;
      const hy = fract(progress * d.laps + d.ph) * span; // posição contínua da cabeça (células)
      const hr = Math.floor(hy);
      const x = (d.c + 0.5) * cw;
      for (let i = 0; i < d.len; i++) {
        const row = hr - i;
        if (row < 0) break;
        if (row >= rows) continue;
        let a = Math.pow(1 - i / d.len, 1.6) * d.dim;
        if (band && row >= band[0] && row <= band[1] && !(mask[row * cols + d.c] > 0.5)) a *= 1 - 0.7 * wordOn;
        if (i === 0) heads.push([x, row, d.c]);
        else {
          const lv = Math.min(LEVELS - 1, Math.floor(a * LEVELS));
          if (lv > 0) buckets[lv].push(d.c, row);
          if (lit) lit[row * cols + d.c] = Math.max(lit[row * cols + d.c], a);
        }
      }
    }

    // Nas células da palavra, o rastro "acende" e fica.
    const mixed = mask && wordOn > 0;
    for (let lv = 1; lv < LEVELS; lv++) {
      const b = buckets[lv];
      if (!b.length) continue;
      ctx.fillStyle = rgba(p.color, lv / LEVELS);
      for (let i = 0; i < b.length; i += 2) {
        const c = b[i];
        const r = b[i + 1];
        if (mixed && mask[r * cols + c] > 0.5) continue; // desenhada na passada da palavra
        ctx.fillText(glyph(c, r, 48), (c + 0.5) * cw, (r + 0.5) * cs);
      }
    }

    if (mixed) {
      // Cada célula da palavra acende num instante próprio (varredura de cima para baixo + ruído)
      // e brilha forte; as fora da máscara ficam como estão.
      const dimBg = 0.12;
      const base = rgba(p.head, 1);
      ctx.fillStyle = base;
      const glow = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const m = mask[r * cols + c];
          if (m <= 0.5) continue;
          const delay = (r / rows) * 0.35 + hash(c, r, 3) * 0.25;
          const on = smoothstep(delay, delay + 0.15, wordOn * 1.6 - 0.1) ;
          const trailA = lit[r * cols + c];
          const a = Math.max(on * 0.95, trailA, dimBg * wordOn);
          if (a < 0.03) continue;
          glow.push(c, r, a, on);
        }
      }
      ctx.font = `800 ${cs * 0.95}px "JetBrains Mono", ui-monospace, monospace`;
      for (let i = 0; i < glow.length; i += 4) {
        const [c, r, a, on] = [glow[i], glow[i + 1], glow[i + 2], glow[i + 3]];
        ctx.globalAlpha = a;
        ctx.fillStyle = on > 0.5 ? p.head : p.color;
        // aceso: troca mais devagar (quase parado)
        ctx.fillText(glyph(c, r, on > 0.5 ? 6 : 48), (c + 0.5) * cw, (r + 0.5) * cs);
      }
      ctx.globalAlpha = 1;
      ctx.font = `500 ${cs * 0.82}px "JetBrains Mono", ui-monospace, monospace`;
    }

    // Cabeças: claras (pulam as células da palavra já acesas).
    ctx.fillStyle = p.head;
    for (const [x, r, c] of heads) if (!(mixed && mask[r * cols + c] > 0.5)) ctx.fillText(glyph(c, r, 96), x, (r + 0.5) * cs);

    // Vinheta (mesma cor do fundo variando só o alpha).
    if (!p.transparent) {
      const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.hypot(w, h) * 0.6);
      g.addColorStop(0, rgba(p.bg, 0));
      g.addColorStop(1, rgba(p.bg, 0.75));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
  },
};
