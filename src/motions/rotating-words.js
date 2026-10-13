import { seg, ease, spring, lerp, rgba } from '../lib/anim.js';

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export default {
  id: 'rotating-words',
  title: 'Rotating Words',
  description: 'A fixed phrase whose last word keeps swapping in place: it slides up and the block springs to the new width.',
  category: 'tipografia',
  tags: ['typography', 'loop'],
  duration: 8,
  poster: 1.0,

  params: {
    prefix: { type: 'text', label: 'Fixed phrase', default: 'We make' },
    words: { type: 'text', label: 'Words (comma-separated)', default: 'videos, brands, apps, noise' },
    style: { type: 'select', label: 'Word style', options: ['Pílula', 'Serif itálico'], default: 'Pílula' },
    size: { type: 'range', label: 'Size', min: 0.04, max: 0.2, step: 0.001, default: 0.12 },
    bounce: { type: 'range', label: 'Spring', min: 0, max: 0.6, step: 0.01, default: 0.22 },
    color: { type: 'color', label: 'Text', default: '#f4f1ea' },
    accent: { type: 'color', label: 'Accent', default: '#ff4d2e' },
    wordColor: { type: 'color', label: 'Pill text', default: '#ffffff' },
    bg: { type: 'color', label: 'Background', default: '#0d0d10' },
  },

  render(ctx, t, { w, h, p, duration }) {
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, w, h);
    const vg = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.hypot(w, h) * 0.6);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.4)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);

    const words = p.words.split(',').map((s) => s.trim()).filter(Boolean);
    if (!words.length) words.push('…');
    const n = words.length;
    const slot = duration / n;
    const pill = p.style === 'Pílula';

    let fs = Math.min(w, h) * p.size;
    const fPre = (s) => `700 ${s}px Inter, system-ui, sans-serif`;
    const fWord = (s) => (pill ? `800 ${s}px Inter, system-ui, sans-serif` : `italic 400 ${s * 1.25}px "Instrument Serif", Georgia, serif`);
    const measure = () => {
      ctx.font = fPre(fs);
      const pre = ctx.measureText(p.prefix).width;
      ctx.font = fWord(fs);
      const ws = words.map((wd) => ctx.measureText(wd).width);
      return { pre, ws };
    };
    let m = measure();
    const padX = () => (pill ? fs * 0.42 : fs * 0.06);
    const gap = () => (p.prefix ? fs * 0.3 : 0);
    const maxWord = () => Math.max(...m.ws) + padX() * 2;
    // Uma linha se couber; senão, empilha (frase em cima, palavra embaixo).
    let stacked = m.pre + gap() + maxWord() > w * 0.88;
    if (stacked) {
      const need = Math.max(m.pre, maxWord());
      if (need > w * 0.86) {
        fs *= (w * 0.86) / need;
        m = measure();
      }
    }

    // Tempo: palavra idx assentada; troca nos últimos 0.65 s do slot.
    const idx = Math.floor(t / slot) % n;
    const local = t - Math.floor(t / slot) * slot;
    const nxt = (idx + 1) % n;
    const k = seg(local, slot - 0.7, slot);
    const outE = ease.inCubic(seg(local, slot - 0.7, slot - 0.38));
    const inS = spring(seg(local, slot - 0.52, slot + 0.0001), p.bounce);
    const widthS = spring(seg(local, slot - 0.62, slot), p.bounce * 0.8);

    const pw = lerp(m.ws[idx], m.ws[nxt], widthS) + padX() * 2;
    const ph = fs * (pill ? 1.38 : 1.7);
    const total = stacked ? 0 : m.pre + gap() + pw;
    const preX = stacked ? (w - m.pre) / 2 : (w - total) / 2;
    const cy = h / 2;
    const preY = stacked ? cy - ph * 0.62 : cy;
    const pillX = stacked ? (w - pw) / 2 : preX + m.pre + gap();
    const pillCy = stacked ? cy + ph * 0.62 : cy;

    ctx.textBaseline = 'middle';
    ctx.font = fPre(fs);
    ctx.fillStyle = p.color;
    ctx.fillText(p.prefix, preX, preY + fs * 0.04);

    // Bloco da palavra.
    const top = pillCy - ph / 2;
    if (pill) {
      ctx.fillStyle = p.accent;
      roundRect(ctx, pillX, top, pw, ph, ph * 0.28);
      ctx.fill();
    } else {
      // sublinhado que acompanha a largura
      ctx.fillStyle = p.accent;
      ctx.fillRect(pillX, pillCy + fs * 0.78, pw, Math.max(2, fs * 0.05));
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(pillX - fs, top, pw + fs * 2, ph);
    ctx.clip();
    ctx.font = fWord(fs);
    ctx.fillStyle = pill ? p.wordColor : p.accent;
    const travel = ph * 0.95;
    const yOff = pill ? fs * 0.04 : -fs * 0.04;
    const drawWord = (i, dy, a) => {
      if (a <= 0) return;
      ctx.globalAlpha = a;
      ctx.fillText(words[i], pillX + (pw - m.ws[i]) / 2, pillCy + yOff + dy);
    };
    if (k <= 0) drawWord(idx, 0, 1);
    else {
      drawWord(idx, -outE * travel, 1 - outE * 0.6);
      drawWord(nxt, (1 - inS) * travel, Math.min(1, inS * 2.5));
    }
    ctx.restore();
    ctx.globalAlpha = 1;

    // Indicador discreto de progresso (pontos).
    const dotR = Math.max(2, fs * 0.07);
    const dotsY = (stacked ? pillCy + ph / 2 : cy + ph / 2) + fs * (pill ? 0.75 : 0.6);
    const dx = dotR * 4;
    const active = lerp(idx, idx + 1, ease.inOutCubic(k));
    for (let i = 0; i < n; i++) {
      const x = w / 2 + (i - (n - 1) / 2) * dx;
      let on = Math.max(0, 1 - Math.abs(i - active));
      if (idx === n - 1) on = Math.max(on, i === 0 ? Math.max(0, 1 - Math.abs(n - active)) : 0);
      ctx.fillStyle = rgba(p.color, 0.18 + 0.6 * on);
      ctx.beginPath();
      ctx.arc(x, dotsY, dotR, 0, Math.PI * 2);
      ctx.fill();
    }
  },
};
