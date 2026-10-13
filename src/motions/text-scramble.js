import { seg, ease, fract, rgba } from '../lib/anim.js';

// Hash determinístico 0..1.
const hash = (a, b = 0, c = 0) => fract(Math.sin(a * 12.9898 + b * 78.233 + c * 37.719 + 0.31) * 43758.5453);

const SETS = {
  'Letras e números': 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
  Binário: '01',
  Hex: '0123456789ABCDEF',
  Símbolos: '#%&*+=<>/\\[]{}?!$@_-~^',
};

export default {
  id: 'text-scramble',
  title: 'Text Scramble',
  description: 'Caracteres aleatórios embaralham e vão se resolvendo no texto, como uma mensagem sendo decodificada.',
  category: 'tipografia',
  tags: ['tipografia', 'intro'],
  duration: 5,
  poster: 1.45,

  params: {
    text: { type: 'text', label: 'Texto (/ quebra linha)', default: 'SINAL/DECODIFICADO' },
    sub: { type: 'text', label: 'Legenda', default: '// transmissão 07 — 23:41:08' },
    charset: { type: 'select', label: 'Caracteres', options: Object.keys(SETS), default: 'Letras e números' },
    font: { type: 'select', label: 'Fonte', options: ['Mono', 'Sans'], default: 'Mono' },
    size: { type: 'range', label: 'Tamanho', min: 0.05, max: 0.3, step: 0.005, default: 0.16 },
    speed: { type: 'range', label: 'Velocidade de troca', min: 6, max: 40, step: 1, default: 20 },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 7 },
    color: { type: 'color', label: 'Texto', default: '#f4f1ea' },
    accent: { type: 'color', label: 'Destaque', default: '#c6ff3d' },
    bg: { type: 'color', label: 'Fundo', default: '#0b0c0e' },
  },

  render(ctx, t, { w, h, p, px }) {
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, w, h);
    const vg = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.hypot(w, h) * 0.6);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);

    const set = SETS[p.charset] || SETS['Letras e números'];
    const lines = p.text.split('/').map((s) => [...s]);
    const S = p.seed;
    const mono = p.font === 'Mono';
    const font = (s) => (mono ? `600 ${s}px "JetBrains Mono", ui-monospace, monospace` : `800 ${s}px Inter, system-ui, sans-serif`);

    // Tamanho: encolhe para caber.
    let fs = Math.min(w, h) * p.size;
    ctx.font = font(fs);
    const longest = Math.max(...lines.map((l) => ctx.measureText(l.join('')).width + (mono ? 0 : l.length * fs * 0.04)));
    if (longest > w * 0.86) fs *= (w * 0.86) / longest;
    ctx.font = font(fs);
    const lh = fs * 1.05;
    const subFs = Math.max(fs * 0.2, Math.min(w, h) * 0.024);
    const blockH = lines.length * lh + subFs * 2.6;
    const top = h / 2 - blockH / 2;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';

    const total = lines.reduce((a, l) => a + l.length, 0);
    const cell = (c) => (mono ? ctx.measureText('M').width : ctx.measureText(c).width + fs * 0.04);

    // Desenha uma linha de caracteres com janelas [ini, resolve, desresolve, fim] por caractere.
    const drawLine = (chars, y, gi0, tIn, tRes, tOut, accentA) => {
      const widths = chars.map(cell);
      const lw = widths.reduce((a, b) => a + b, 0);
      let x = w / 2 - lw / 2;
      chars.forEach((c, i) => {
        const gi = gi0 + i;
        const cx = x + widths[i] / 2;
        x += widths[i];
        if (c === ' ') return;
        const r = hash(gi, S);
        const order = (i / Math.max(1, chars.length - 1)) * 0.75 + r * 0.25; // esquerda→direita com ruído
        const a0 = tIn + order * 0.5 + r * 0.15;
        const a1 = tRes + order * 1.25 + hash(gi, S, 2) * 0.3;
        const b0 = tOut + (1 - order) * 0.45 + hash(gi, S, 3) * 0.2;
        const b1 = b0 + 0.35 + r * 0.2;
        if (t < a0 || t >= b1) return;
        const resolved = t >= a1 && t < b0;
        if (resolved) {
          // flash de "travou": bloco de destaque que some
          const f = 1 - seg(t, a1, a1 + 0.28);
          if (f > 0) {
            ctx.fillStyle = rgba(p.accent, 0.9 * f * f);
            ctx.fillRect(cx - widths[i] / 2, y - fs * 0.52, widths[i], fs * 1.0);
          }
          ctx.fillStyle = p.color;
          ctx.fillText(c, cx, y);
        } else {
          const k = Math.floor(t * p.speed + r * 7);
          const g = set[Math.floor(hash(gi, k, S) * set.length) % set.length];
          const fadeIn = ease.outCubic(seg(t, a0, a0 + 0.12));
          ctx.globalAlpha = fadeIn * (0.55 + 0.45 * hash(gi, k, 5)) * accentA;
          ctx.fillStyle = p.accent;
          ctx.fillText(g, cx, y);
          ctx.globalAlpha = 1;
        }
      });
      return lw;
    };

    // Brilho leve no texto principal.
    ctx.shadowColor = rgba(p.accent, 0.35);
    ctx.shadowBlur = fs * 0.25 * px;
    let gi = 0;
    let maxLw = 0;
    lines.forEach((l, li) => {
      const lw = drawLine(l, top + lh * (li + 0.5), gi, 0.15 + li * 0.18, 0.55 + li * 0.25, 3.55 + li * 0.1, 1);
      maxLw = Math.max(maxLw, lw);
      gi += l.length;
    });
    ctx.shadowBlur = 0;

    // Legenda + régua.
    if (p.sub) {
      ctx.font = `500 ${subFs}px "JetBrains Mono", ui-monospace, monospace`;
      const subY = top + lines.length * lh + subFs * 1.9;
      const subChars = [...p.sub];
      const sw = Math.min(maxLw, w * 0.86);
      const ruleIn = ease.outExpo(seg(t, 1.2, 2.0));
      const ruleOut = ease.inOutCubic(seg(t, 3.6, 4.2));
      ctx.fillStyle = rgba(p.color, 0.25);
      const rl = sw * (ruleIn - ruleOut);
      ctx.fillRect(w / 2 - sw / 2 + sw * ruleOut, subY - subFs * 1.15, rl, Math.max(1, fs * 0.012));
      // legenda reaproveita o embaralhador em escala menor
      const cellW = ctx.measureText('M').width;
      let x = w / 2 - (subChars.length * cellW) / 2;
      subChars.forEach((c, i) => {
        const cx = x + cellW / 2;
        x += cellW;
        if (c === ' ') return;
        const g2 = 1000 + i;
        const r = hash(g2, S);
        const o = i / Math.max(1, subChars.length - 1);
        const a0 = 1.1 + o * 0.5;
        const a1 = 1.35 + o * 0.9 + r * 0.2;
        const b0 = 3.5 + (1 - o) * 0.3;
        const b1 = b0 + 0.25;
        if (t < a0 || t >= b1) return;
        if (t >= a1 && t < b0) {
          ctx.fillStyle = rgba(p.color, 0.6);
          ctx.fillText(c, cx, subY);
        } else {
          const k = Math.floor(t * p.speed + r * 7);
          ctx.fillStyle = rgba(p.accent, 0.6);
          ctx.fillText(set[Math.floor(hash(g2, k, S) * set.length) % set.length], cx, subY);
        }
      });
    }
    ctx.textAlign = 'start';
  },
};
