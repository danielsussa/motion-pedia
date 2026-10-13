import { seg, ease, rgba } from '../lib/anim.js';

// Hash determinístico 0..1 de (a, b, c): a "aleatoriedade" do glitch vem daqui, nunca de Math.random.
function hash(a, b, c = 0) {
  let x = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 1440670441)) | 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  x ^= x >>> 16;
  x = Math.imul(x, 2246822519);
  x ^= x >>> 13;
  return (x >>> 0) / 4294967296;
}

const JUNK = '#%&@$!?/\\<>[]{}=+*01';

export default {
  id: 'glitch-title',
  title: 'Glitch Title',
  description: 'A title that glitches in and out: RGB split, shifted slices, corrupted characters and jitter.',
  category: 'tipografia',
  tags: ['typography', 'intro', 'loop'],
  duration: 4,
  poster: 1.5,

  params: {
    text: { type: 'text', label: 'Text', default: 'SIGNAL LOST' },
    sub: { type: 'text', label: 'Caption', default: 'TRANSMISSION INTERRUPTED · 04:13' },
    intensity: { type: 'range', label: 'Intensity', min: 0, max: 2, step: 0.01, default: 1 },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 7 },
    color: { type: 'color', label: 'Text', default: '#f4f1ea' },
    colorA: { type: 'color', label: 'Channel A', default: '#ff2a5f' },
    colorB: { type: 'color', label: 'Channel B', default: '#1fe0ff' },
    bg: { type: 'color', label: 'Background', default: '#09090c' },
    transparent: { type: 'boolean', label: 'Transparent background', default: false },
  },

  render(ctx, t, { w, h, p }) {
    const m = Math.min(w, h);
    const S = p.seed * 7919;
    // Glitch "quantizado" a 24 quadros/s: a falha salta em degraus, como vídeo digital.
    const f = Math.floor(t * 24);
    const H = (i, k = 0) => hash(f + S, i, k);

    // Intensidade ao longo do tempo: entrada pesada, rajadas curtas no meio, saída pesada.
    let I = 0.04;
    let visible = true;
    if (t < 0.75) {
      const k = seg(t, 0.05, 0.75);
      I = 1 - 0.92 * ease.outCubic(k);
      visible = t > 0.05 && H(901) < 0.25 + k * 1.2;
    }
    for (const [a, d, v] of [[1.42, 0.14, 0.4], [2.2, 0.06, 0.22], [2.62, 0.2, 0.5]]) {
      if (t >= a && t < a + d) I = Math.max(I, v);
    }
    if (t > 3.2) {
      const k = seg(t, 3.2, 3.9);
      I = Math.max(I, ease.inCubic(k));
      visible = H(902) > k * 1.1 - 0.1 && t < 3.9;
    }
    I *= p.intensity;

    if (!p.transparent) {
      ctx.fillStyle = p.bg;
      ctx.fillRect(0, 0, w, h);
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.6);
      g.addColorStop(0, 'rgba(255,255,255,0.05)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    // Texto (com caracteres corrompidos proporcionais à intensidade).
    const chars = [...p.text.toUpperCase()];
    const corrupt = (c, i) => (c !== ' ' && H(i, 1) < I * 0.35 ? JUNK[Math.floor(H(i, 2) * JUNK.length)] : c);
    const upper = p.text.toUpperCase();
    let fs = m * 0.2;
    const font = (s) => `900 ${s}px Inter, system-ui, sans-serif`;
    const setFont = () => {
      ctx.font = font(fs);
      ctx.letterSpacing = `${-fs * 0.02}px`;
    };
    setFont();
    // Linhas: no vertical, quebra em duas (equilibradas) se não couber numa só.
    let lines = [upper];
    const words = upper.split(' ');
    if (h > w && words.length > 1 && ctx.measureText(upper).width > w * 0.86) {
      let best = null;
      for (let k = 1; k < words.length; k++) {
        const a = words.slice(0, k).join(' ');
        const b = words.slice(k).join(' ');
        const d = Math.max(ctx.measureText(a).width, ctx.measureText(b).width);
        if (!best || d < best.d) best = { d, l: [a, b] };
      }
      lines = best.l;
    }
    let tw = Math.max(...lines.map((l) => ctx.measureText(l).width));
    if (tw > w * 0.86) {
      fs *= (w * 0.86) / tw;
      tw = w * 0.86;
    }
    setFont();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lh = fs * 0.95;
    let ci = 0;
    const rows = lines.map((l) => {
      const r = [...l].map((c) => corrupt(c, ci++)).join('');
      ci++;
      return r;
    });
    const fillRows = (x, y) => rows.forEach((r, i) => ctx.fillText(r, x, y + (i - (rows.length - 1) / 2) * lh));

    const cx = w / 2 + (H(3) - 0.5) * I * m * 0.03;
    const cy = h / 2 - fs * 0.12;
    const bh = fs * 1.24 + (rows.length - 1) * lh;
    const top = cy - bh / 2;
    const split = m * (0.004 + 0.025 * I * H(4));
    const punch = 1 + 0.06 * (1 - ease.outExpo(seg(t, 0.05, 0.8)));

    if (visible) {
      // Fatias horizontais: cada uma com seu deslocamento (a maioria parada, algumas jogadas para o lado).
      const bands = [];
      let y = top - fs * 0.1;
      let i = 0;
      while (y < top + bh + fs * 0.1) {
        const hh = fs * (0.04 + H(i, 5) * (I > 0.1 ? 0.22 : 0.6));
        const hit = H(i, 6) < I * 0.75;
        bands.push({ y, hh, dx: hit ? (H(i, 7) - 0.5) * m * 0.22 * I : 0, hit });
        y += hh;
        i++;
      }
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(punch, punch);
      ctx.translate(-cx, -cy);
      for (const b of bands) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, b.y, w, b.hh + 0.5);
        ctx.clip();
        const x = cx + b.dx;
        const s = split * (b.hit ? 2.2 : 1);
        ctx.globalCompositeOperation = p.transparent ? 'source-over' : 'lighter';
        ctx.fillStyle = p.colorA;
        ctx.globalAlpha = p.transparent ? 0.85 : 1;
        fillRows(x - s, cy);
        ctx.fillStyle = p.colorB;
        fillRows(x + s, cy + s * 0.25);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        ctx.fillStyle = b.hit && H(b.y | 0, 8) < 0.3 ? p.colorB : p.color;
        fillRows(x, cy);
        ctx.restore();
      }
      ctx.restore();

      // Blocos de "dado corrompido" durante as falhas.
      if (I > 0.12) {
        const n = Math.floor(4 + I * 14);
        for (let k = 0; k < n; k++) {
          const bw = m * (0.02 + H(k, 10) * 0.18);
          const bhh = m * (0.004 + H(k, 11) * 0.025);
          const bx = w / 2 + (H(k, 12) - 0.5) * tw * 1.3;
          const by = top + H(k, 13) * bh;
          ctx.fillStyle = [p.colorA, p.colorB, p.color, 'rgba(0,0,0,0.9)'][Math.floor(H(k, 14) * 4)];
          ctx.globalAlpha = 0.5 + 0.5 * H(k, 15);
          ctx.fillRect(bx - bw / 2, by, bw, bhh);
        }
        ctx.globalAlpha = 1;
      }

      // Legenda mono: digita depois da entrada e pisca junto com as falhas.
      if (p.sub) {
        const ss = Math.max(10, fs * 0.13);
        ctx.font = `500 ${ss}px 'JetBrains Mono', monospace`;
        ctx.letterSpacing = `${ss * 0.25}px`;
        const subChars = [...p.sub];
        const typed = Math.floor(subChars.length * seg(t, 0.55, 1.25));
        const subOut = t > 3.2 ? 1 - seg(t, 3.2, 3.5) : 1;
        if (typed > 0 && subOut > 0 && H(77) > I * 0.5) {
          const sy = top + bh + ss * 1.6;
          const shown = subChars.slice(0, typed).join('') + (typed < subChars.length || Math.floor(t * 2.5) % 2 ? '_' : ' ');
          ctx.globalAlpha = subOut;
          const sx = w / 2 - ctx.measureText(p.sub + '_').width / 2 + ss * 0.6;
          ctx.fillStyle = p.colorA;
          ctx.fillRect(sx - ss * 1.5, sy - ss * 0.35, ss * 0.7, ss * 0.7);
          ctx.textAlign = 'left';
          ctx.fillStyle = rgba(p.color, 0.75);
          ctx.fillText(shown, sx, sy);
          ctx.globalAlpha = 1;
        }
      }
    }

    // Faixa de varredura que rola e linhas de scan (só com fundo).
    if (!p.transparent) {
      const sy = ((t / 4) * 1.0 * (h * 1.4)) % (h * 1.4) - h * 0.2;
      const g = ctx.createLinearGradient(0, sy - h * 0.1, 0, sy + h * 0.1);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.5, 'rgba(255,255,255,0.035)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, sy - h * 0.1, w, h * 0.2);
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath();
      const step = Math.max(2, m / 270);
      for (let y = 0; y < h; y += step * 2) ctx.rect(0, y, w, step);
      ctx.fill();
      // Linha branca horizontal "rasgando" a tela nas falhas fortes.
      if (I > 0.4 && H(50) < 0.6) {
        ctx.fillStyle = rgba(p.color, 0.5);
        ctx.fillRect(0, h * H(51), w, Math.max(1, m * 0.002));
      }
    }
  },
};
