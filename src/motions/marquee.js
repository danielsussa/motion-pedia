import { rgba } from '../lib/anim.js';

// Estrela de 4 pontas (separador entre as repetições).
function star(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 - Math.PI / 2;
    const rr = i % 2 ? r * 0.28 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

export default {
  id: 'marquee',
  title: 'Marquee',
  description: 'Tilted bands of text scrolling in an endless loop, in alternating directions, covering the screen.',
  category: 'tipografia',
  tags: ['typography', 'loop', 'background'],
  duration: 8,

  params: {
    text: { type: 'text', label: 'Text', default: 'MOTION PEDIA' },
    text2: { type: 'text', label: 'Alternate text', default: 'ENDLESS LOOP' },
    bands: { type: 'range', label: 'Bands', min: 2, max: 10, step: 1, default: 5 },
    angle: { type: 'range', label: 'Tilt (°)', min: -30, max: 30, step: 0.5, default: -9 },
    speed: { type: 'range', label: 'Speed (laps/loop)', min: 1, max: 4, step: 1, default: 1 },
    outline: { type: 'boolean', label: 'Outlined bands', default: true },
    color: { type: 'color', label: 'Text', default: '#f4f1ea' },
    accent: { type: 'color', label: 'Accent', default: '#ff4d2e' },
    bg: { type: 'color', label: 'Background', default: '#0d0d10' },
  },

  render(ctx, t, { w, h, p, progress }) {
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, w, h);

    // Em telas verticais, mais faixas (senão ficam gigantes).
    const n = Math.round(p.bands * Math.sqrt(Math.max(1, h / w)));
    const a = (p.angle * Math.PI) / 180;
    // Altura da tela projetada na normal das faixas → as faixas cobrem tudo.
    const cover = h * Math.cos(a) + w * Math.abs(Math.sin(a));
    const bh = cover / n;
    const L = Math.hypot(w, h) * 1.15;
    const fs = bh * 0.6;
    const font = `900 ${fs}px Inter, system-ui, sans-serif`;
    const k = Math.round(p.speed);

    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(a);
    ctx.font = font;
    ctx.textBaseline = 'middle';
    ctx.letterSpacing = `${-fs * 0.02}px`;

    for (let i = 0; i < n; i++) {
      const y0 = -cover / 2 + i * bh;
      const yc = y0 + bh / 2;
      const kind = i % 2 === 1 ? 'accent' : p.outline && i % 4 === 2 ? 'outline' : 'solid';
      const txt = (i % 2 === 1 ? p.text2 || p.text : p.text) || ' ';

      // fundo da faixa (sobreposição mínima evita fresta de antialias)
      ctx.fillStyle = kind === 'accent' ? p.accent : p.bg;
      ctx.fillRect(-L / 2, y0 - 0.5, L, bh + 1);

      const tw = ctx.measureText(txt).width;
      const gap = fs * 0.55;
      const sr = fs * 0.24;
      const U = tw + gap * 2 + sr * 2; // largura de uma repetição
      const dir = i % 2 ? 1 : -1;
      const shift = ((progress * k * U * dir) % U + U) % U;
      let x = -L / 2 - U + shift;
      const ty = yc + fs * 0.03;

      const ink = kind === 'accent' ? p.bg : p.color;
      if (kind === 'outline') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(2, fs * 0.05);
        ctx.lineJoin = 'round';
      }
      ctx.fillStyle = ink;
      for (; x < L / 2; x += U) {
        if (kind === 'outline') {
          // traço duplo + preenchimento com o fundo: esconde os contornos internos da fonte variável
          ctx.strokeText(txt, x, ty);
          ctx.fillStyle = p.bg;
          ctx.fillText(txt, x, ty);
        } else ctx.fillText(txt, x, ty);
        ctx.fillStyle = kind === 'accent' ? p.bg : p.accent;
        star(ctx, x + tw + gap + sr, yc, sr);
        ctx.fillStyle = ink;
      }

      // fio entre faixas
      ctx.fillStyle = rgba(p.color, 0.08);
      ctx.fillRect(-L / 2, y0, L, Math.max(1, bh * 0.006));
    }
    ctx.restore();
    ctx.letterSpacing = '0px';
  },
};
