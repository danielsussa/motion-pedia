import { seg, ease, clamp, lerp, rng, mixHex, springWin } from '../lib/anim.js';

const SANS = 'Inter, system-ui, sans-serif';
const SERIF = "'Instrument Serif', Georgia, serif";

// "palavra" ou "palavra: peso" por linha. Sem peso, a ordem define a importância (a 1ª é a principal).
function parse(text) {
  const rows = String(text || '')
    .split(/\n|,/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 80);
  const items = rows.map((r, i) => {
    const m = r.match(/^(.*?)\s*:\s*([\d.]+)\s*$/);
    const word = (m ? m[1] : r).trim();
    const wt = m ? Number(m[2]) : NaN;
    return { word, wt, i };
  });
  const n = items.length;
  items.forEach((it) => {
    if (!Number.isFinite(it.wt)) it.wt = 1 + 9 * (1 - it.i / Math.max(1, n)) ** 1.7;
  });
  items.sort((a, b) => b.wt - a.wt || a.i - b.i);
  const max = items[0]?.wt || 1;
  const min = items[items.length - 1]?.wt ?? 0;
  items.forEach((it) => (it.k = max > min ? (it.wt - min) / (max - min) : 1));
  return items;
}

let measureCtx = null;
const mctx = () => (measureCtx ??= new OffscreenCanvas(4, 4).getContext('2d'));

function fontFor(it, idx, style, size) {
  if (idx === 0) return style === 'serif' ? `italic 400 ${size * 1.15}px ${SERIF}` : `800 ${size}px ${SANS}`;
  const serif = style === 'serif' || (style === 'misto' && idx % 4 === 2);
  if (serif) return `italic 400 ${size * 1.12}px ${SERIF}`;
  const wgt = it.k > 0.55 ? 750 : it.k > 0.25 ? 600 : 450;
  return `${wgt} ${size}px ${SANS}`;
}

export default {
  id: 'word-cloud',
  title: 'Word Cloud',
  description: 'A word cloud that arranges itself in a spiral out from the center, where the main word grows first.',
  category: 'tipografia',
  tags: ['typography', 'intro', 'data'],
  duration: 6,
  poster: 5,

  params: {
    words: {
      type: 'textarea',
      label: 'Words (one per line, optional "word: weight")',
      rows: 6,
      default:
        'motion\nrhythm\ntypography\neasing\ncamera\ncolor\ntiming\nscene\nloop\ncontrast\nstagger\ntexture\npause\nscale\nshape\nlight\ncurve\nspring\ngrid\nsound\nlayer\nframe\nflow\ngesture\nnarrative\nweight\nspace\ncadence\nkeyframe\nblur\norbit\nglow\nshadow\nmask\nvector\npixel\nwave\nfocus',
    },
    style: { type: 'select', label: 'Fonts', options: ['misto', 'sans', 'serif'], default: 'misto' },
    rotate: { type: 'select', label: 'Orientation', options: ['horizontal', 'misto'], default: 'horizontal' },
    density: { type: 'range', label: 'Spacing', min: 0, max: 1, step: 0.01, default: 0.35 },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 7 },
    color: { type: 'color', label: 'Text', default: '#efebe3' },
    accent: { type: 'color', label: 'Accent', default: '#ff5a36' },
    bg: { type: 'color', label: 'Background', default: '#111013' },
    transparent: { type: 'boolean', label: 'Transparent background', default: false },
  },

  setup({ w, h, p }) {
    const items = parse(p.words);
    if (!items.length) return { words: [] };
    const ctx = mctx();
    const R = rng(Math.round(p.seed) * 7919 + 13);
    const U = 100; // tamanho da palavra principal (unidades de layout)
    const pad = U * (0.04 + 0.1 * p.density);
    const asp = Math.sqrt(w / h);
    const placed = [];
    const hit = (b) => {
      for (const q of placed)
        if (b.x0 < q.x1 + pad && b.x1 > q.x0 - pad && b.y0 < q.y1 + pad * 0.6 && b.y1 > q.y0 - pad * 0.6) return true;
      return false;
    };
    items.forEach((it, idx) => {
      const size = idx === 0 ? U : U * (0.16 + 0.5 * it.k ** 1.15);
      const font = fontFor(it, idx, p.style, size);
      ctx.font = font;
      const mt = ctx.measureText(it.word);
      const tw = mt.width;
      const asc = mt.actualBoundingBoxAscent;
      const desc = mt.actualBoundingBoxDescent;
      const rot = p.rotate === 'misto' && idx > 0 && R() < 0.28;
      const bw = rot ? asc + desc : tw;
      const bh = rot ? tw : asc + desc;
      let x = 0, y = 0;
      if (idx > 0) {
        const a0 = R() * Math.PI * 2;
        const dir = R() < 0.5 ? 1 : -1;
        const step = U * 0.035;
        let th = 0;
        for (let k = 0; k < 20000; k++) {
          const r = step * th * 0.9;
          x = Math.cos(a0 + dir * th) * r * asp;
          y = Math.sin(a0 + dir * th) * r / asp;
          if (!hit({ x0: x - bw / 2, x1: x + bw / 2, y0: y - bh / 2, y1: y + bh / 2 })) break;
          th += Math.min(0.35, (step * 2) / Math.max(r, step));
        }
      }
      placed.push({ x0: x - bw / 2, x1: x + bw / 2, y0: y - bh / 2, y1: y + bh / 2 });
      it.x = x;
      it.y = y;
      it.size = size;
      it.font = font;
      it.tw = tw;
      it.dy = (asc - desc) / 2;
      it.rot = rot;
      it.serif = font.includes('Serif');
    });
    // Encaixa a nuvem na tela (centrada na palavra principal).
    let ex = 1, ey = 1;
    for (const b of placed) {
      ex = Math.max(ex, Math.abs(b.x0), Math.abs(b.x1));
      ey = Math.max(ey, Math.abs(b.y0), Math.abs(b.y1));
    }
    const K = Math.min((w * 0.45) / ex, (h * 0.42) / ey);
    const n = items.length;
    const words = items.map((it, idx) => ({
      word: it.word,
      x: it.x * K,
      y: it.y * K,
      r: Math.hypot(it.x, it.y) * K,
      phi: Math.atan2(it.y, it.x),
      font: it.font.replace(/([\d.]+)px/, (_, s) => `${(Number(s) * K).toFixed(2)}px`),
      tw: it.tw * K,
      dy: it.dy * K,
      rot: it.rot,
      k: it.k,
      idx,
      // Ordem de entrada: das mais pesadas para as menores, com leve variação.
      start: idx === 0 ? 0.15 : 0.75 + clamp((idx - 1) / Math.max(1, n - 2) + (R() - 0.5) * 0.12) * 2.7,
    }));
    return { words };
  },

  render(ctx, t, { w, h, p, state }) {
    if (!p.transparent) {
      ctx.fillStyle = p.bg;
      ctx.fillRect(0, 0, w, h);
    }
    const { words } = state;
    if (!words?.length) return;
    const cx = w / 2, cy = h / 2;
    // Respiração da câmera: zoom lento depois que tudo assentou.
    const zoom = 1.06 - 0.06 * ease.outCubic(seg(t, 0, 6));
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(zoom, zoom);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    const warm = mixHex(p.color, p.accent, 0.45);

    for (let i = words.length - 1; i >= 0; i--) {
      const wd = words[i];
      let x, y, s, a;
      if (i === 0) {
        s = lerp(0.25, 1, springWin(t, wd.start, wd.start + 1.3, 0.28));
        a = ease.outCubic(seg(t, wd.start, wd.start + 0.35));
        x = 0;
        y = 0;
      } else {
        const e = ease.outExpo(seg(t, wd.start, wd.start + 1.25));
        if (e <= 0) continue;
        const r = wd.r * (0.6 + 0.4 * e);
        const ph = wd.phi - (1 - e) * 0.85;
        x = Math.cos(ph) * r;
        y = Math.sin(ph) * r;
        s = 0.55 + 0.45 * e;
        a = ease.outCubic(seg(t, wd.start, wd.start + 0.45));
      }
      if (a <= 0) continue;
      // Hierarquia de cor: principal no destaque, 3 seguintes levemente aquecidas, o resto em cinzas.
      let col, alpha;
      if (i === 0) {
        col = p.accent;
        alpha = 1;
      } else if (i <= 3) {
        col = warm;
        alpha = 0.95;
      } else {
        col = p.color;
        alpha = 0.32 + 0.6 * wd.k ** 0.8;
      }
      ctx.globalAlpha = a * alpha;
      ctx.fillStyle = col;
      ctx.font = wd.font;
      ctx.save();
      ctx.translate(x, y);
      if (wd.rot) ctx.rotate(-Math.PI / 2);
      ctx.scale(s, s);
      ctx.fillText(wd.word, -wd.tw / 2, wd.dy);
      ctx.restore();
    }
    ctx.globalAlpha = 1;

    ctx.restore();
  },
};
