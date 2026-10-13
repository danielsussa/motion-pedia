import { seg, ease, rgba } from '../lib/anim.js';

const FONTS = {
  serif: (s) => `400 ${s}px 'Instrument Serif', serif`,
  'serif itálico': (s) => `italic 400 ${s}px 'Instrument Serif', serif`,
  sans: (s) => `800 ${s}px Inter, system-ui, sans-serif`,
};

export default {
  id: 'stroke-draw',
  title: 'Stroke Draw',
  description: 'Each letter\'s outline is hand-drawn by a point of light, then filled and underlined.',
  category: 'tipografia',
  tags: ['typography', 'intro'],
  duration: 5,
  poster: 2.6,

  params: {
    text: { type: 'text', label: 'Text', default: 'Essence' },
    font: { type: 'select', label: 'Font', options: ['serif', 'serif itálico', 'sans'], default: 'serif itálico' },
    size: { type: 'range', label: 'Size', min: 0.1, max: 0.5, step: 0.01, default: 0.36 },
    stroke: { type: 'range', label: 'Stroke width', min: 0.3, max: 4, step: 0.05, default: 1 },
    fill: { type: 'boolean', label: 'Fill', default: true },
    underline: { type: 'boolean', label: 'Underline', default: true },
    color: { type: 'color', label: 'Text', default: '#f4f1ea' },
    accent: { type: 'color', label: 'Accent', default: '#ff5a36' },
    bg: { type: 'color', label: 'Background', default: '#0e0e12' },
    transparent: { type: 'boolean', label: 'Transparent background', default: false },
  },

  render(ctx, t, { w, h, p, px }) {
    const m = Math.min(w, h);
    if (!p.transparent) {
      ctx.fillStyle = p.bg;
      ctx.fillRect(0, 0, w, h);
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.6);
      g.addColorStop(0, 'rgba(255,255,255,0.045)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    const chars = [...(p.text || '')];
    if (!chars.length) return;
    const fontFn = FONTS[p.font] ?? FONTS.serif;
    let fs = m * p.size * (p.font === 'sans' ? 0.8 : 1);
    ctx.font = fontFn(fs);
    const full = ctx.measureText(chars.join('')).width;
    if (full > w * 0.86) {
      fs *= (w * 0.86) / full;
      ctx.font = fontFn(fs);
    }
    const tw = ctx.measureText(chars.join('')).width;
    const x0 = (w - tw) / 2;
    const base = h / 2 + fs * 0.28;
    // Posição de cada letra pela largura do prefixo (respeita o kerning).
    const xs = chars.map((_, i) => x0 + ctx.measureText(chars.slice(0, i).join('')).width);

    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const lw = Math.max(0.75, fs * 0.011 * p.stroke);
    const stg = Math.min(0.09, 1.1 / chars.length);
    const DRAW = 1.5; // duração do desenho de cada letra
    const maxLen = fs * 4.2; // maior contorno esperado de um glifo
    const gap = fs * 20;
    const OUT = 3.75;

    chars.forEach((c, i) => {
      if (c === ' ') return;
      const x = xs[i];
      const t0 = 0.15 + i * stg;
      const k = seg(t, t0, t0 + DRAW);
      if (k <= 0) return;
      const d = ease.inOutCubic(k) * maxLen;
      // Saída: o traço é apagado do começo para o fim, em cascata.
      const ko = seg(t, OUT + i * stg * 0.6, OUT + 0.85 + i * stg * 0.6);
      const u = ease.inOutCubic(ko) * maxLen;

      // Preenchimento: sobe por baixo quando o desenho da letra termina, some antes do traço.
      if (p.fill) {
        const fk = ease.outCubic(seg(t, t0 + DRAW * 0.55, t0 + DRAW * 0.55 + 0.6));
        const fo = ease.inCubic(seg(t, OUT - 0.25 + i * stg * 0.5, OUT + 0.3 + i * stg * 0.5));
        const a = fk * (1 - fo);
        if (a > 0.001) {
          ctx.save();
          ctx.beginPath();
          const top = base - fs * 1.05;
          const hh = fs * 1.45;
          ctx.rect(x - fs * 0.2, top + hh * (1 - fk), fs * 1.6, hh * fk);
          ctx.clip();
          ctx.globalAlpha = 1 - fo;
          ctx.fillStyle = p.color;
          ctx.fillText(c, x, base);
          ctx.restore();
        }
      }

      if (u >= maxLen) return;
      ctx.lineWidth = lw;
      // Rastro do traço.
      ctx.strokeStyle = p.color;
      // Offset negativo empurra o traço para frente (sem pontinhos de dash de comprimento zero).
      ctx.setLineDash([Math.max(0.001, d - u), gap]);
      ctx.lineDashOffset = -u;
      ctx.strokeText(c, x, base);
      // Ponta de luz no fim do traço (some quando a letra termina).
      const hl = fs * 0.22;
      const headA = 1 - seg(k, 0.85, 1);
      if (headA > 0 && d > 0) {
        ctx.save();
        ctx.globalAlpha = headA;
        ctx.strokeStyle = p.accent;
        ctx.lineWidth = lw * 2.2;
        ctx.shadowColor = p.accent;
        ctx.shadowBlur = fs * 0.06 * px;
        ctx.setLineDash([Math.min(hl, d), gap]);
        ctx.lineDashOffset = -Math.max(0, d - hl);
        ctx.strokeText(c, x, base);
        ctx.restore();
      }
    });
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;

    // Sublinhado em curva, desenhado depois do texto.
    if (p.underline) {
      const ui = ease.inOutCubic(seg(t, 1.55, 2.35));
      const uo = ease.inOutCubic(seg(t, OUT + 0.3, OUT + 0.95));
      if (ui > uo) {
        const y = base + fs * 0.2;
        const xa = x0 + tw * 0.04;
        const xb = x0 + tw * 0.96;
        const N = 48;
        ctx.beginPath();
        for (let j = 0; j <= N; j++) {
          const s = uo + (ui - uo) * (j / N);
          const xx = xa + (xb - xa) * s;
          const yy = y + Math.sin(s * Math.PI) * fs * 0.035 - s * fs * 0.06;
          if (j === 0) ctx.moveTo(xx, yy);
          else ctx.lineTo(xx, yy);
        }
        ctx.strokeStyle = p.accent;
        ctx.lineWidth = Math.max(1, fs * 0.022 * Math.sqrt(p.stroke));
        ctx.stroke();
        // Ponto na ponta enquanto desenha.
        if (ui < 1) {
          const xx = xa + (xb - xa) * ui;
          const yy = y + Math.sin(ui * Math.PI) * fs * 0.035 - ui * fs * 0.06;
          ctx.fillStyle = rgba(p.accent, 1);
          ctx.beginPath();
          ctx.arc(xx, yy, fs * 0.022, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  },
};
