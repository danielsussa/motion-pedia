import { seg, ease, clamp, lerp, rng, rgba } from '../lib/anim.js';
import { asset } from '../lib/assets.js';
import { drawCover } from '../lib/image.js';

// Ken Burns: o enquadramento interpola de (zoom, foco x/y) inicial para o final em inOutSine ao longo
// de toda a duração. Por cima: vinheta, sombra embaixo para o texto, grão (textura de ruído assada no
// setup e deslocada a cada quadro de 24 fps) e o título em Instrument Serif entrando palavra a palavra
// por trás de uma máscara, com um fio de destaque e a linha de apoio em Inter. Abre e fecha no preto.
const SERIF = '"Instrument Serif", Georgia, serif';
const SANS = 'Inter, system-ui, sans-serif';

export default {
  id: 'ken-burns',
  title: 'Ken Burns',
  description: 'A photo with slow zoom and pan, vignette and grain, and a serif title coming in word by word.',
  category: 'imagem',
  tags: ['typography', 'intro', 'background'],
  duration: 8,
  poster: 3.6,

  params: {
    image: { type: 'image', label: 'Photo', default: '/samples/landscape.jpg' },
    title: { type: 'text', label: 'Title', default: 'The silent valley' },
    subtitle: { type: 'text', label: 'Subtitle', default: 'Yosemite · California' },
    layout: { type: 'select', label: 'Text position', options: ['embaixo à esquerda', 'centro'], default: 'embaixo à esquerda' },
    accent: { type: 'color', label: 'Accent', default: '#ffb59a' },
    zoom0: { type: 'range', label: 'Start zoom', min: 1, max: 2, step: 0.01, default: 1.0 },
    zoom1: { type: 'range', label: 'End zoom', min: 1, max: 2, step: 0.01, default: 1.22 },
    x0: { type: 'range', label: 'Start focus x', min: 0, max: 1, step: 0.01, default: 0.35 },
    y0: { type: 'range', label: 'Start focus y', min: 0, max: 1, step: 0.01, default: 0.55 },
    x1: { type: 'range', label: 'End focus x', min: 0, max: 1, step: 0.01, default: 0.62 },
    y1: { type: 'range', label: 'End focus y', min: 0, max: 1, step: 0.01, default: 0.42 },
    grain: { type: 'range', label: 'Grain', min: 0, max: 0.3, step: 0.01, default: 0.1 },
  },

  setup({ w, h, p, px }) {
    const m = Math.min(w, h);
    const center = p.layout === 'centro';
    const margin = m * 0.085;
    const size = m * (w < h ? 0.14 : 0.12);
    const maxW = w - margin * 2;

    // quebra o título em linhas pelo maxWidth (medição com a fonte final)
    const meas = document.createElement('canvas').getContext('2d');
    meas.font = `400 ${size}px ${SERIF}`;
    const space = meas.measureText(' ').width;
    const lines = [];
    let cur = [];
    let curW = 0;
    for (const word of p.title.trim().split(/\s+/).filter(Boolean)) {
      const ww = meas.measureText(word).width;
      if (cur.length && curW + space + ww > maxW) {
        lines.push({ words: cur, width: curW });
        cur = [];
        curW = 0;
      }
      cur.push({ text: word, w: ww });
      curW += (cur.length > 1 ? space : 0) + ww;
    }
    if (cur.length) lines.push({ words: cur, width: curW });

    const lh = size * 1.0;
    const sub = p.subtitle.trim().toUpperCase();
    const subSize = m * 0.026;
    const gap = size * 0.42;
    const blockH = lines.length * lh + (sub ? gap + subSize * 1.6 : 0);
    // baseline da última linha do título
    const lastBase = center ? h / 2 - blockH / 2 + lines.length * lh - size * 0.22 : h - margin - (sub ? gap + subSize * 1.6 : 0) - size * 0.05;
    const words = [];
    lines.forEach((ln, li) => {
      let x = center ? w / 2 - ln.width / 2 : margin;
      const y = lastBase - (lines.length - 1 - li) * lh;
      for (const wd of ln.words) {
        words.push({ text: wd.text, x, y });
        x += wd.w + space;
      }
    });
    const ruleY = lastBase + gap * 0.62;
    const subY = ruleY + subSize * 2.1;

    // textura de grão em px reais: pontos claros e escuros com alpha aleatório
    const T = 256;
    const tile = document.createElement('canvas');
    tile.width = tile.height = T;
    const g = tile.getContext('2d');
    const id = g.createImageData(T, T);
    const R = rng(11);
    for (let i = 0; i < T * T; i++) {
      const n = (R() + R() + R()) / 3 - 0.5; // ~gaussiana
      const v = n > 0 ? 255 : 0;
      id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = v;
      id.data[i * 4 + 3] = Math.min(255, Math.abs(n) * 2 * 255);
    }
    g.putImageData(id, 0, 0);

    return { m, center, margin, size, words, ruleY, subY, sub, subSize, tile, T, sc: Math.max(0.25, px) };
  },

  render(ctx, t, { w, h, p, duration, state: s }) {
    const img = asset(p.image);
    const u = ease.inOutSine(clamp(t / duration));
    ctx.fillStyle = '#121214';
    ctx.fillRect(0, 0, w, h);
    if (img) {
      drawCover(ctx, img, w, h, {
        zoom: lerp(p.zoom0, p.zoom1, u),
        fx: lerp(p.x0, p.x1, u),
        fy: lerp(p.y0, p.y1, u),
      });
    }
    const { m } = s;

    // vinheta (preto variando só o alpha) + sombra atrás do texto
    const vg = ctx.createRadialGradient(w / 2, h / 2, m * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.62);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.6)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
    const textIn = ease.outCubic(seg(t, 0.3, 1.6)) * (1 - seg(t, duration - 0.9, duration - 0.2));
    if (s.center) {
      ctx.fillStyle = `rgba(0,0,0,${0.28 * textIn})`;
      ctx.fillRect(0, 0, w, h);
    } else {
      const sh = ctx.createLinearGradient(0, h * 0.4, 0, h);
      sh.addColorStop(0, 'rgba(0,0,0,0)');
      sh.addColorStop(1, `rgba(0,0,0,${0.55 * textIn})`);
      ctx.fillStyle = sh;
      ctx.fillRect(0, h * 0.4, w, h * 0.6);
    }

    // título: cada palavra sobe por trás de uma máscara (stagger), sai com fade no fim
    const ink = '#f7f2ea';
    const out = 1 - ease.inCubic(seg(t, duration - 1.0, duration - 0.35));
    ctx.font = `400 ${s.size}px ${SERIF}`;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillStyle = ink;
    s.words.forEach((wd, i) => {
      const k = ease.outExpo(seg(t, 0.7 + i * 0.11, 0.7 + i * 0.11 + 1.3));
      if (k <= 0 || out <= 0) return;
      ctx.save();
      ctx.beginPath();
      ctx.rect(wd.x - s.size * 0.2, wd.y - s.size * 1.05, s.size * 20, s.size * 1.35);
      ctx.clip();
      ctx.globalAlpha = Math.min(1, k * 1.4) * out;
      ctx.fillText(wd.text, wd.x, wd.y + (1 - k) * s.size * 1.1);
      ctx.restore();
    });

    // fio de destaque crescendo + linha de apoio
    const nW = s.words.length;
    const tr = 0.9 + nW * 0.11;
    const rk = ease.outExpo(seg(t, tr, tr + 1.2));
    const ruleW = m * 0.09 * rk;
    if (ruleW > 0.5 && out > 0) {
      ctx.globalAlpha = out;
      ctx.fillStyle = p.accent;
      const rx = s.center ? w / 2 - ruleW / 2 : s.margin;
      ctx.fillRect(rx, s.ruleY, ruleW, Math.max(1.5, m * 0.0032));
      ctx.globalAlpha = 1;
    }
    if (s.sub) {
      const k = ease.outExpo(seg(t, tr + 0.25, tr + 1.5));
      if (k > 0 && out > 0) {
        ctx.font = `600 ${s.subSize}px ${SANS}`;
        ctx.letterSpacing = `${s.subSize * 0.22}px`;
        ctx.textAlign = s.center ? 'center' : 'left';
        ctx.fillStyle = rgba(ink, 0.88 * k * out);
        // com letterSpacing o centro leva o espaço extra da última letra: compensa
        const sx = s.center ? w / 2 + s.subSize * 0.11 : s.margin;
        ctx.fillText(s.sub, sx, s.subY + (1 - k) * s.subSize * 0.8);
        ctx.letterSpacing = '0px';
        ctx.textAlign = 'left';
      }
    }

    // grão: a mesma textura com deslocamento pseudoaleatório a cada quadro de 24 fps
    if (p.grain > 0) {
      const f = Math.floor(t * 24);
      const ox = ((f * 7919) % 251) * 1.0, oy = ((f * 104729) % 241) * 1.0;
      const pat = ctx.createPattern(s.tile, 'repeat');
      pat.setTransform(new DOMMatrix().translate(-ox / s.sc, -oy / s.sc).scale(1 / s.sc));
      ctx.globalAlpha = p.grain;
      ctx.fillStyle = pat;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }

    // abre e fecha no preto
    const fade = 1 - Math.min(ease.outCubic(seg(t, 0, 0.9)), 1 - ease.inCubic(seg(t, duration - 0.6, duration)));
    if (fade > 0.001) {
      ctx.fillStyle = `rgba(10,10,12,${fade})`;
      ctx.fillRect(0, 0, w, h);
    }
  },
};
