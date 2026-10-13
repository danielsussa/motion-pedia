import { seg, ease, rgba, spring } from '../lib/anim.js';

const serif = (s, it = true) => `${it ? 'italic ' : ''}400 ${s}px 'Instrument Serif', Georgia, serif`;

// Palavras com *destaque* entre asteriscos; quebras manuais (\n) viram parágrafo.
function parse(text) {
  const out = [];
  let hot = false;
  String(text || '')
    .split('\n')
    .forEach((para, pi) => {
      para
        .split(/\s+/)
        .filter(Boolean)
        .forEach((raw, i) => {
          let s = raw;
          const open = s.startsWith('*');
          if (open) {
            hot = true;
            s = s.slice(1);
          }
          const close = s.endsWith('*') || /\*[.,;:!?…”"]*$/.test(s);
          const wordHot = hot;
          if (close) {
            s = s.replace(/\*([.,;:!?…”"]*)$/, '$1');
            hot = false;
          }
          out.push({ text: s, hot: wordHot, br: pi > 0 && i === 0 });
        });
    });
  return out;
}

function wrap(ctx, words, maxW) {
  const sp = ctx.measureText(' ').width;
  const lines = [[]];
  let x = 0;
  for (const wd of words) {
    const ww = ctx.measureText(wd.text).width;
    if ((wd.br || x + ww > maxW) && x > 0) {
      lines.push([]);
      x = 0;
    }
    lines[lines.length - 1].push({ ...wd, x, w: ww });
    x += ww + sp;
  }
  return lines;
}

export default {
  id: 'quote-card',
  title: 'Quote Card',
  description: 'Huge serif quote marks draw themselves, the quote arrives word by word in italics and the author rises in.',
  category: 'tipografia',
  tags: ['typography', 'intro'],
  duration: 8,
  poster: 4.6,

  params: {
    quote: {
      type: 'textarea',
      label: 'Quote (*highlight*)',
      rows: 4,
      default: 'Simplicity is the *ultimate* sophistication.',
    },
    author: { type: 'text', label: 'Author', default: 'Leonardo da Vinci' },
    role: { type: 'text', label: 'Caption', default: 'Painter and inventor' },
    size: { type: 'range', label: 'Size', min: 0.05, max: 0.16, step: 0.002, default: 0.12 },
    align: { type: 'select', label: 'Alignment', options: ['esquerda', 'centro'], default: 'esquerda' },
    color: { type: 'color', label: 'Text', default: '#f2ede4' },
    accent: { type: 'color', label: 'Accent', default: '#ff6a3d' },
    bg: { type: 'color', label: 'Background', default: '#121114' },
    transparent: { type: 'boolean', label: 'Transparent background', default: false },
  },

  setup({ p }) {
    return { words: parse(p.quote) };
  },

  render(ctx, t, { w, h, p, px, duration: D, state }) {
    const m = Math.min(w, h);
    if (!p.transparent) {
      ctx.fillStyle = p.bg;
      ctx.fillRect(0, 0, w, h);
      const g = ctx.createRadialGradient(w * 0.3, h * 0.25, 0, w * 0.3, h * 0.25, Math.hypot(w, h) * 0.75);
      g.addColorStop(0, rgba(p.accent, 0.07));
      g.addColorStop(1, rgba(p.accent, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    const { words } = state;
    const center = p.align === 'centro';
    const portrait = h > w * 1.1;

    // Layout da citação: encolhe até caber em ~55% da altura.
    let fs = m * p.size;
    const maxW = w * (portrait ? 0.8 : 0.66);
    ctx.font = serif(fs);
    let lines = wrap(ctx, words, maxW);
    for (let i = 0; i < 8 && lines.length * fs * 1.08 > h * 0.5; i++) {
      fs *= 0.9;
      ctx.font = serif(fs);
      lines = wrap(ctx, words, maxW);
    }
    const lh = fs * 1.08;
    const lineW = lines.map((l) => (l.length ? l[l.length - 1].x + l[l.length - 1].w : 0));
    const blockW = Math.max(1, ...lineW);
    const qs = fs * 5.2; // aspas
    const afs = Math.max(fs * 0.25, m * 0.021); // autor
    const qChar = '“';
    ctx.font = serif(qs, false);
    const qm = ctx.measureText(qChar);
    const qAsc = qm.actualBoundingBoxAscent; // topo da tinta acima da baseline
    const qInk = qAsc - -qm.actualBoundingBoxDescent; // altura da tinta (as aspas ficam no alto do glifo)
    const gapQ = fs * 0.35;
    const gapA = fs * 0.9;
    const totalH = qInk + gapQ + fs * 0.75 + (lines.length - 1) * lh + gapA + afs * 3.4;
    const top = (h - totalH) / 2;
    const left = (w - blockW) / 2;

    // Saída: tudo desliza um pouco para cima e some (em cascata invertida suave).
    const out = ease.inCubic(seg(t, D - 1.0, D - 0.25));

    // 1) Aspas: o contorno se desenha e o preenchimento entra em seguida.
    ctx.font = serif(qs, false);
    const qw = qm.actualBoundingBoxRight + qm.actualBoundingBoxLeft;
    const qx = center ? w / 2 - qw / 2 + qm.actualBoundingBoxLeft : left + qm.actualBoundingBoxLeft;
    const qy = top + qAsc;
    const draw = ease.inOutCubic(seg(t, 0.2, 1.4));
    const fillK = ease.outCubic(seg(t, 0.95, 1.6));
    const qOut = ease.inCubic(seg(t, D - 1.0, D - 0.45));
    if (draw > 0 && qOut < 1) {
      ctx.save();
      ctx.globalAlpha = 1 - qOut;
      ctx.translate(0, -qOut * fs * 0.3);
      ctx.textBaseline = 'alphabetic';
      if (fillK > 0) {
        ctx.fillStyle = rgba(p.accent, fillK);
        ctx.fillText(qChar, qx, qy);
      }
      if (fillK < 1) {
        const L = qs * 1.25; // comprimento aproximado do contorno das duas vírgulas
        ctx.strokeStyle = p.accent;
        ctx.lineWidth = Math.max(1, qs * 0.006);
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.globalAlpha = (1 - qOut) * (1 - fillK * 0.9);
        ctx.setLineDash([Math.max(0.001, draw * L), L * 4]);
        ctx.strokeText(qChar, qx, qy);
        ctx.setLineDash([]);
      }
      ctx.restore();
    }

    // 2) Citação palavra a palavra: sobe com mola leve, desfoque falso via alpha.
    const y0 = top + qInk + gapQ + fs * 0.75;
    const n = words.length;
    const stg = Math.min(0.11, 2.2 / Math.max(1, n));
    const T0 = 1.05;
    let idx = 0;
    ctx.font = serif(fs);
    ctx.textBaseline = 'alphabetic';
    lines.forEach((l, li) => {
      const ox = center ? (w - lineW[li]) / 2 : left;
      const y = y0 + li * lh;
      for (const wd of l) {
        const t0 = T0 + idx * stg;
        const k = seg(t, t0, t0 + 0.9);
        const e = spring(k, 0.12);
        const a = ease.outCubic(seg(t, t0, t0 + 0.5));
        // saída em cascata (rápida)
        const ko = ease.inCubic(seg(t, D - 1.05 + idx * 0.012, D - 0.45 + idx * 0.012));
        idx++;
        if (a <= 0 || ko >= 1) continue;
        ctx.globalAlpha = a * (1 - ko);
        ctx.fillStyle = wd.hot ? p.accent : p.color;
        ctx.fillText(wd.text, ox + wd.x, y + (1 - e) * fs * 0.42 - ko * fs * 0.35);
      }
    });
    ctx.globalAlpha = 1;
    const tq = T0 + n * stg + 0.35; // fim da citação

    // 3) Autor: traço de destaque cresce, nome e legenda sobem por uma máscara.
    const ay = y0 + (lines.length - 1) * lh + gapA;
    const lk = ease.outExpo(seg(t, tq, tq + 0.9));
    const lo = ease.inCubic(seg(t, D - 0.95, D - 0.4));
    const barW = fs * 0.75;
    const ax = center ? w / 2 : left;
    if (lk > 0 && lo < 1) {
      ctx.fillStyle = p.accent;
      const bw = barW * (lk - lo);
      const bx = center ? ax - barW / 2 + barW * lo : ax + barW * lo;
      ctx.fillRect(bx, ay, Math.max(0, bw), Math.max(1.5, fs * 0.022));
    }
    const nameK = ease.outExpo(seg(t, tq + 0.15, tq + 1.1));
    const roleK = ease.outExpo(seg(t, tq + 0.3, tq + 1.25));
    const tx = center ? ax : ax;
    ctx.textAlign = center ? 'center' : 'left';
    const rowName = ay + afs * 1.9;
    const rowRole = rowName + afs * 1.45;
    const lineOf = (txt, k, y, font, color, track) => {
      if (!txt || k <= 0 || lo >= 1) return;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, y - afs * 1.2, w, afs * 1.55);
      ctx.clip();
      ctx.font = font;
      ctx.fillStyle = color;
      ctx.globalAlpha = 1 - lo;
      if ('letterSpacing' in ctx) ctx.letterSpacing = `${track}px`;
      ctx.fillText(txt, tx, y + (1 - k) * afs * 1.4 - lo * afs * 0.6);
      ctx.restore();
    };
    lineOf((p.author || '').toUpperCase(), nameK, rowName, `600 ${afs}px Inter, system-ui, sans-serif`, p.color, afs * 0.16);
    lineOf(p.role, roleK, rowRole, `500 ${afs * 0.95}px Inter, system-ui, sans-serif`, rgba(p.color, 0.5), 0);
    ctx.textAlign = 'left';
  },
};
