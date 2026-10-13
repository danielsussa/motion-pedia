import { TAU, clamp, lerp, fract, ease, mixHex, rgba } from '../lib/anim.js';

// Peso do Inter variável (100–900) por letra. A onda vai e volta pela palavra (vai-e-vem com
// inOutSine nas pontas = pausa com a palavra toda fina), então t=0 e t=duration são o mesmo quadro.
export default {
  id: 'variable-wave',
  title: 'Variable Wave',
  description: 'A weight wave, from thin to black, travels through the letters of a word while the block width breathes along.',
  category: 'tipografia',
  tags: ['typography', 'loop'],
  duration: 5,
  poster: 1.15,

  params: {
    text: { type: 'text', label: 'Text', default: 'VARIABLE' },
    size: { type: 'range', label: 'Size', min: 0.1, max: 0.5, step: 0.005, default: 0.3 },
    minW: { type: 'range', label: 'Min weight', min: 100, max: 900, step: 10, default: 100 },
    maxW: { type: 'range', label: 'Max weight', min: 100, max: 900, step: 10, default: 900 },
    spread: { type: 'range', label: 'Wave width (letters)', min: 0.5, max: 5, step: 0.1, default: 1.8 },
    cycles: { type: 'range', label: 'Back-and-forths per loop', min: 1, max: 4, step: 1, default: 1 },
    rows: { type: 'select', label: 'Lines', options: ['auto', '1', '2', '3', '4', '5', '7', '9'], default: 'auto' },
    lag: { type: 'range', label: 'Delay between lines', min: 0, max: 0.1, step: 0.005, default: 0.035 },
    axis: { type: 'boolean', label: 'wght axis ruler', default: true },
    color: { type: 'color', label: 'Text', default: '#f4f1ea' },
    accent: { type: 'color', label: 'Accent', default: '#ff4d2e' },
    bg: { type: 'color', label: 'Background', default: '#0d0d10' },
  },

  render(ctx, t, { w, h, p, progress }) {
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, w, h);
    const chars = [...p.text];
    const n = chars.length;
    if (!n) return;
    const m = Math.min(w, h);

    // Centro da onda (em índice de letra): vai-e-volta, devagar nas pontas, fora da palavra nos extremos.
    const cyc = Math.max(1, Math.round(p.cycles));
    const margin = p.spread * 1.5;
    const lo = Math.min(p.minW, p.maxW);
    const hi = Math.max(p.minW, p.maxW);
    const center = (ph) => {
      const tri = 1 - Math.abs(1 - 2 * fract(ph * cyc)); // 0 → 1 → 0
      return -margin + (n - 1 + 2 * margin) * ease.inOutSine(tri);
    };

    // Tamanho: cabe com tudo no peso máximo (pior caso), para a palavra nunca vazar ao respirar.
    let fs = m * p.size;
    const font = (wt, s) => `${wt} ${s}px Inter, system-ui, sans-serif`;
    ctx.font = font(hi, fs);
    const widest = chars.reduce((s, ch) => s + ctx.measureText(ch).width, 0);
    if (widest > w * 0.86) fs *= (w * 0.86) / widest;

    // Linhas: em telas altas a palavra se repete empilhada, cada linha com a onda um pouco atrasada.
    const lh = fs * 0.98;
    const rows = p.rows === 'auto' ? (h / w < 0.8 ? 1 : Math.max(1, Math.floor((h * 0.8) / lh))) : Number(p.rows);
    const track = -0.01 * fs;
    const blockTop = h / 2 - (lh * (rows - 1)) / 2;
    ctx.textBaseline = 'alphabetic';

    let x0 = 0;
    let total = 0;
    let base = 0;
    let peakX = w / 2;
    let peakA = -1;
    for (let r = 0; r < rows; r++) {
      const c = center(progress - (r - (rows - 1) / 2) * p.lag);
      const amt = chars.map((_, i) => Math.exp(-(((i - c) / p.spread) ** 2)));
      const wts = amt.map((a) => Math.round(lerp(lo, hi, a)));
      const widths = chars.map((ch, i) => {
        ctx.font = font(wts[i], fs);
        return ctx.measureText(ch).width;
      });
      total = widths.reduce((a, b) => a + b, 0) + track * (n - 1);
      x0 = (w - total) / 2;
      base = blockTop + lh * r + fs * 0.36;
      let x = x0;
      peakA = -1;
      chars.forEach((ch, i) => {
        ctx.font = font(wts[i], fs);
        const a = amt[i];
        ctx.fillStyle = a > 0.02 ? mixHex(p.color, p.accent, ease.inCubic(a)) : p.color;
        ctx.fillText(ch, x, base);
        if (a > peakA) {
          peakA = a;
          peakX = x + widths[i] / 2;
        }
        x += widths[i] + track;
      });
    }

    if (!p.axis || rows > 1) return;
    // Régua: limites do bloco (respirando), trilho do eixo e o valor de wght da letra mais pesada.
    const ry = base + fs * 0.32;
    const lw = Math.max(1, m * 0.0016);
    const mono = Math.max(10, m * 0.017);
    ctx.fillStyle = rgba(p.color, 0.22);
    ctx.fillRect(x0, ry, total, lw);
    for (const xx of [x0, x0 + total]) ctx.fillRect(xx - lw / 2, ry - mono * 0.5, lw, mono);

    const vis = clamp(peakA * 1.6 - 0.2, 0, 1);
    const kx = clamp(peakX, x0, x0 + total);
    ctx.fillStyle = rgba(p.accent, vis);
    ctx.beginPath();
    ctx.arc(kx, ry + lw / 2, mono * 0.28, 0, TAU);
    ctx.fill();

    ctx.font = `500 ${mono}px "JetBrains Mono", monospace`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'center';
    const wt = Math.round(lerp(lo, hi, Math.max(0, peakA)));
    ctx.fillStyle = rgba(p.accent, vis);
    ctx.fillText(`wght ${wt}`, kx, ry + mono * 0.9);
    ctx.fillStyle = rgba(p.color, 0.4);
    ctx.textAlign = 'left';
    ctx.fillText(`${Math.round(total)}px`, x0, ry - mono * 1.9);
    ctx.textAlign = 'right';
    ctx.fillText(`${lo}–${hi}`, x0 + total, ry - mono * 1.9);
    ctx.textAlign = 'start';
  },
};
