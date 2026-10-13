import { seg, ease, lerp, clamp, springWin, rgba } from '../lib/anim.js';

// Tempo das palavras (sem timestamps): cada palavra dura (1 / velocidade) s, ponderado pelo tamanho
// (palavras longas ficam um pouco mais) e com uma pausa extra depois de pontuação (. , ! ? ; :).
// Páginas: até `perPage` palavras; pontuação final (. ! ?) e quebras de linha do texto forçam página nova.
function timeline(text, wps, perPage, lead) {
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const words = [];
  const pages = [];
  let t = lead;
  const base = 1 / wps;
  for (const line of lines) {
    let page = [];
    const toks = line.split(/\s+/).filter(Boolean);
    toks.forEach((tok, k) => {
      const clean = tok.replace(/[^\p{L}\p{N}]/gu, '');
      const dur = base * (0.7 + 0.3 * clamp(clean.length / 5, 0.4, 2));
      const word = { text: tok, start: t, end: t + dur };
      t += dur;
      if (/[,;:]$/.test(tok)) t += base * 0.5;
      const stop = /[.!?…]$/.test(tok);
      if (stop) t += base * 0.9;
      words.push(word);
      page.push(word);
      if (page.length >= perPage || stop || k === toks.length - 1) {
        pages.push(page);
        page = [];
      }
    });
  }
  pages.forEach((pg, i) => {
    pg.start = pg[0].start;
    // A página fica até a próxima começar (ou até o fim, a última).
    pg.end = i < pages.length - 1 ? pages[i + 1][0].start : Infinity;
  });
  return { words, pages };
}

const rr = (ctx, x, y, w, h, r) => {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
};

export default {
  id: 'captions',
  title: 'Karaoke Captions',
  description: 'Reels/TikTok-style captions in short pages: the spoken word lights up in the accent color with a "pop".',
  category: 'tipografia',
  tags: ['typography', 'overlay', 'alpha'],
  duration: 8,
  poster: 2.3,

  params: {
    text: {
      type: 'textarea',
      label: 'Text (line break = new page)',
      rows: 4,
      default: 'This changes everything. Captions that follow every word hold attention to the very last second.',
    },
    wps: { type: 'range', label: 'Words per second', min: 1, max: 6, step: 0.1, default: 2.6 },
    perPage: { type: 'range', label: 'Words per page', min: 1, max: 6, step: 1, default: 3 },
    style: { type: 'select', label: 'Highlight', options: ['pílula', 'cor', 'palavra a palavra'], default: 'pílula' },
    size: { type: 'range', label: 'Size', min: 0.5, max: 1.6, step: 0.01, default: 1 },
    y: { type: 'range', label: 'Vertical position', min: 0.2, max: 0.9, step: 0.01, default: 0.68 },
    color: { type: 'color', label: 'Text', default: '#ffffff' },
    accent: { type: 'color', label: 'Accent', default: '#ffd22e' },
    bg: { type: 'color', label: 'Background', default: '#1b2130' },
    transparent: { type: 'boolean', label: 'Transparent background', default: false },
  },

  setup({ p }) {
    return timeline(p.text || '', p.wps, Math.round(p.perPage), 0.25);
  },

  render(ctx, t, { w, h, p, px, state }) {
    if (!p.transparent) {
      // Fundo de prévia: um "frame de vídeo" escuro com luz suave e vinheta.
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, p.bg);
      g.addColorStop(1, '#07080b');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      const r = ctx.createRadialGradient(w * 0.3, h * 0.25, 0, w * 0.3, h * 0.25, Math.max(w, h) * 0.7);
      r.addColorStop(0, rgba(p.accent, 0.1));
      r.addColorStop(1, rgba(p.accent, 0));
      ctx.fillStyle = r;
      ctx.fillRect(0, 0, w, h);
    }

    const { pages } = state;
    const page = pages.find((pg) => t >= pg.start && t < pg.end);
    if (!page) return;

    const m = Math.min(w, h);
    let fs = m * (h > w ? 0.095 : 0.085) * p.size;
    const font = (s) => `900 ${s}px Inter, system-ui, sans-serif`;
    const maxW = w * 0.78;
    ctx.font = font(fs);
    const label = (wd) => wd.text.toUpperCase();
    let widths = page.map((wd) => ctx.measureText(label(wd)).width);
    let space = fs * 0.42;
    // Uma palavra sozinha maior que a largura: encolhe a fonte.
    const widest = Math.max(...widths);
    if (widest > maxW) {
      const k = maxW / widest;
      fs *= k;
      space *= k;
      widths = widths.map((v) => v * k);
      ctx.font = font(fs);
    }

    // Quebra em linhas.
    const lines = [[]];
    let lw = 0;
    page.forEach((wd, i) => {
      const add = (lines[lines.length - 1].length ? space : 0) + widths[i];
      if (lw + add > maxW && lines[lines.length - 1].length) {
        lines.push([]);
        lw = 0;
      }
      lw += (lines[lines.length - 1].length ? space : 0) + widths[i];
      lines[lines.length - 1].push(i);
    });
    const lh = fs * 1.18;
    const cy = h * p.y;
    const boxes = [];
    lines.forEach((ln, li) => {
      const tw = ln.reduce((a, i, k) => a + widths[i] + (k ? space : 0), 0);
      let x = w / 2 - tw / 2;
      const y = cy + (li - (lines.length - 1) / 2) * lh;
      for (const i of ln) {
        boxes[i] = { x, y, w: widths[i] };
        x += widths[i] + space;
      }
    });

    // Entrada da página: mola em escala a partir do centro do bloco.
    const pin = springWin(t, page.start, page.start + 0.45, 0.25);
    const pageScale = lerp(0.82, 1, pin);
    const pageAlpha = clamp(seg(t, page.start, page.start + 0.08));

    let active = -1;
    page.forEach((wd, i) => {
      if (t >= wd.start) active = i;
    });

    ctx.save();
    ctx.translate(w / 2, cy);
    ctx.scale(pageScale, pageScale);
    ctx.translate(-w / 2, -cy);
    ctx.globalAlpha = pageAlpha;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';

    const pill = p.style === 'pílula';
    const drawWords = (mode) => {
      page.forEach((wd, i) => {
        const b = boxes[i];
        const isActive = i === active;
        let a = 1;
        if (p.style === 'palavra a palavra') {
          a = seg(t, wd.start, wd.start + 0.06);
          if (a <= 0) return;
        }
        const k = isActive ? springWin(t, wd.start, wd.start + 0.4, 0.35) : 0;
        const s = 1 + 0.1 * k;
        ctx.save();
        ctx.globalAlpha = pageAlpha * a;
        ctx.translate(b.x + b.w / 2, b.y - fs * 0.03 * k);
        ctx.scale(s, s);
        const txt = label(wd);
        if (mode === 'ink') {
          // Texto escuro só dentro da pílula (clip feito por fora).
          ctx.fillStyle = '#111114';
        } else {
          // Contorno grosso + sombra: leitura sobre qualquer vídeo.
          ctx.shadowColor = 'rgba(0,0,0,0.55)';
          ctx.shadowBlur = fs * 0.25 * px;
          ctx.shadowOffsetY = fs * 0.05 * px;
          ctx.lineWidth = fs * 0.16;
          ctx.strokeStyle = '#000000';
          ctx.strokeText(txt, 0, 0);
          ctx.shadowColor = 'transparent';
          ctx.fillStyle = isActive && !pill ? p.accent : p.color;
        }
        ctx.fillText(txt, 0, 0);
        ctx.restore();
      });
    };

    drawWords('base');

    if (pill && active >= 0) {
      // Pílula desliza da palavra anterior para a atual e "pulsa" junto com ela.
      const wd = page[active];
      const b = boxes[active];
      const prev = boxes[active - 1];
      const mv = ease.outCubic(seg(t, wd.start, wd.start + 0.14));
      const grow = active === 0 ? springWin(t, wd.start, wd.start + 0.4, 0.3) : 1;
      const padX = fs * 0.2;
      const same = prev && prev.y === b.y;
      const k = springWin(t, wd.start, wd.start + 0.4, 0.35);
      const pop = 1 + 0.1 * k;
      const pcx = same ? lerp(prev.x + prev.w / 2, b.x + b.w / 2, mv) : b.x + b.w / 2;
      const bw = (same ? lerp(prev.w, b.w, mv) : b.w) * pop;
      const by = (prev && !same ? b.y : prev ? lerp(prev.y, b.y, mv) : b.y) - fs * 0.03 * k;
      const ph = fs * 1.12 * grow * pop;
      const pw = (bw + padX * 2) * (active === 0 ? grow : 1);
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = fs * 0.3 * px;
      ctx.shadowOffsetY = fs * 0.06 * px;
      ctx.fillStyle = p.accent;
      rr(ctx, pcx - pw / 2, by - ph / 2 - fs * 0.02, pw, ph, fs * 0.22);
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.clip();
      drawWords('ink');
      ctx.restore();
    }
    ctx.restore();
  },
};
