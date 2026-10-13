import { TAU, clamp, seg, ease, rgba, mixHex, fract } from '../lib/anim.js';
import { asset } from '../lib/assets.js';
import { coverRect } from '../lib/image.js';

const F = 'Inter, system-ui, sans-serif';

const DEFAULT = `Como animar com molas sem perder o ritmo | Ana Ribeiro | Motion
Paletas contidas: menos cor, mais foco | Rafael Lima | Design
O guia definitivo de easing para vídeo | Bia Campos | Tutorial
Tipografia que se move em 7 truques | João Pedro | Tipografia
Grids que respiram em qualquer formato | Marina Luz | Layout`;

const BODIES = [
  'Um passo a passo com exemplos reais, do primeiro quadro até a exportação final.',
  'Por que uma cor de destaque basta e como escolher os neutros ao redor dela.',
  'Curvas, durações e pausas: o que separa um movimento bom de um movimento ótimo.',
  'Peso, tracking e entrada letra a letra sem cansar quem está assistindo.',
  'Margens, colunas e respiro que funcionam do 16:9 ao vertical sem refazer nada.',
];

const CROPS = [
  { src: 'A', zoom: 1, fx: 0.5, fy: 0.5 },
  { src: 'B', zoom: 1, fx: 0.5, fy: 0.3 },
  { src: 'A', zoom: 1.8, fx: 0.2, fy: 0.6 },
  { src: 'B', zoom: 1.6, fx: 0.5, fy: 0.25 },
  { src: 'A', zoom: 1.6, fx: 0.85, fy: 0.4 },
];

function wrap(ctx, text, maxW, maxLines) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const wd of words) {
    const test = cur ? `${cur} ${wd}` : wd;
    if (ctx.measureText(test).width <= maxW || !cur) cur = test;
    else {
      lines.push(cur);
      cur = wd;
    }
  }
  if (cur) lines.push(cur);
  const cut = lines.length > maxLines;
  if (cut) lines.length = maxLines;
  return lines.map((s, i) => {
    if (!(cut && i === maxLines - 1) && ctx.measureText(s).width <= maxW) return s;
    while (s.length > 1 && ctx.measureText(`${s}…`).width > maxW) s = s.slice(0, -1);
    return `${s.trimEnd()}…`;
  });
}

// Duração 6 s, loop: esqueleto com brilho → conteúdo entra em cascata → volta ao esqueleto.
const SHIMMER = 1.5; // período (divide a duração: loop sem emenda)
const T_REVEAL = 2.0;
const T_BACK = 5.15;

export default {
  id: 'skeleton-loading',
  title: 'Skeleton Loading',
  description: 'Tela de cards em skeleton com brilho deslizando que se resolve, em cascata, no conteúdo real.',
  category: 'dados',
  tags: ['ui', 'dados', 'loop'],
  duration: 6,
  poster: 3.6,

  params: {
    items: { type: 'textarea', label: 'Cards (título | autor | categoria)', rows: 5, default: DEFAULT },
    imageA: { type: 'image', label: 'Foto 1', default: '/samples/landscape.jpg' },
    imageB: { type: 'image', label: 'Foto 2', default: '/samples/portrait.jpg' },
    theme: { type: 'select', label: 'Tema', options: ['claro', 'escuro'], default: 'claro' },
    accent: { type: 'color', label: 'Destaque', default: '#5b5bf0' },
    bg: { type: 'color', label: 'Fundo', default: '#f1f0ec' },
    transparent: { type: 'boolean', label: 'Fundo transparente', default: false },
  },

  setup({ w, h, p, px }) {
    const dark = p.theme === 'escuro';
    const items = String(p.items || '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l, i) => {
        const [title = '', author = '', tag = ''] = l.split('|').map((s) => s.trim());
        return { title, author, tag, body: BODIES[i % BODIES.length], crop: CROPS[i % CROPS.length] };
      });
    if (!items.length) items.push({ title: 'Título', author: 'Autor', tag: 'Tag', body: BODIES[0], crop: CROPS[0] });

    // ---------- grade conforme o formato ----------
    const ar = w / h;
    const list = ar < 0.7; // vertical: cards horizontais empilhados
    const cols = list ? 1 : ar > 1.3 ? 3 : 2;
    const rows = list ? Math.min(items.length, 5) : ar > 1.3 ? 1 : 2;
    const n = Math.min(items.length, cols * rows);
    const gap = Math.min(w, h) * 0.03;
    const areaW = w * (list ? 0.88 : ar > 1.3 ? 0.86 : 0.88);
    const cw = (areaW - gap * (cols - 1)) / cols;
    const cu = list ? cw / 900 : cw / 350; // unidade do card

    // medição de texto
    const mc = document.createElement('canvas').getContext('2d');
    const cards = [];
    for (let i = 0; i < n; i++) {
      const it = items[i];
      const els = []; // { kind, x, y, w, h, r, ... } em coordenadas do card
      let ch;
      if (!list) {
        const P = 24 * cu;
        const imgH = 220 * cu;
        els.push({ kind: 'img', x: 0, y: 0, w: cw, h: imgH, r: [16 * cu, 16 * cu, 0, 0] });
        let y = imgH + 22 * cu;
        mc.font = `700 ${12.5 * cu}px ${F}`;
        const tagW = mc.measureText(it.tag.toUpperCase()).width + 22 * cu;
        if (it.tag) els.push({ kind: 'tag', x: P, y, w: tagW, h: 26 * cu, r: 13 * cu, text: it.tag.toUpperCase(), fs: 12.5 * cu });
        y += 26 * cu + 16 * cu;
        mc.font = `700 ${23 * cu}px ${F}`;
        const tl = wrap(mc, it.title, cw - P * 2, 2);
        tl.forEach((l, li) => els.push({ kind: 'text', x: P, y: y + li * 30 * cu, w: mc.measureText(l).width, h: 30 * cu, text: l, fs: 23 * cu, weight: 700, ink: true }));
        y += 2 * 30 * cu + 10 * cu;
        mc.font = `400 ${15.5 * cu}px ${F}`;
        const bl = wrap(mc, it.body, cw - P * 2, 2);
        bl.forEach((l, li) => els.push({ kind: 'text', x: P, y: y + li * 23 * cu, w: mc.measureText(l).width, h: 23 * cu, text: l, fs: 15.5 * cu, weight: 400 }));
        y += 2 * 23 * cu + 22 * cu;
        els.push({ kind: 'avatar', x: P, y, w: 34 * cu, h: 34 * cu, r: 17 * cu });
        mc.font = `600 ${14.5 * cu}px ${F}`;
        const meta = `${it.author}`;
        els.push({ kind: 'text', x: P + 46 * cu, y: y + 0 * cu, w: mc.measureText(meta).width, h: 18 * cu, text: meta, fs: 14.5 * cu, weight: 600, ink: true });
        mc.font = `400 ${13 * cu}px ${F}`;
        const sub = `${4 + ((i * 3) % 7)} min de leitura`;
        els.push({ kind: 'text', x: P + 46 * cu, y: y + 18 * cu, w: mc.measureText(sub).width, h: 17 * cu, text: sub, fs: 13 * cu, weight: 400 });
        ch = y + 34 * cu + P;
      } else {
        const P = 26 * cu;
        const th = 216 * cu;
        els.push({ kind: 'img', x: P, y: P, w: th, h: th, r: 18 * cu });
        const x = P + th + 30 * cu;
        const tw = cw - x - P;
        let y = P + 4 * cu;
        mc.font = `700 ${21 * cu}px ${F}`;
        const tagW = mc.measureText(it.tag.toUpperCase()).width + 30 * cu;
        if (it.tag) els.push({ kind: 'tag', x, y, w: tagW, h: 38 * cu, r: 19 * cu, text: it.tag.toUpperCase(), fs: 21 * cu });
        y += 38 * cu + 18 * cu;
        mc.font = `700 ${38 * cu}px ${F}`;
        const tl = wrap(mc, it.title, tw, 2);
        tl.forEach((l, li) => els.push({ kind: 'text', x, y: y + li * 48 * cu, w: mc.measureText(l).width, h: 48 * cu, text: l, fs: 38 * cu, weight: 700, ink: true }));
        y = P + th - 46 * cu;
        els.push({ kind: 'avatar', x, y, w: 46 * cu, h: 46 * cu, r: 23 * cu });
        mc.font = `500 ${25 * cu}px ${F}`;
        const meta = `${it.author} · ${4 + ((i * 3) % 7)} min`;
        els.push({ kind: 'text', x: x + 62 * cu, y: y + 8 * cu, w: mc.measureText(meta).width, h: 30 * cu, text: meta, fs: 25 * cu, weight: 500 });
        ch = th + P * 2;
      }
      cards.push({ it, els, ch, i });
    }
    const chMax = Math.max(...cards.map((c) => c.ch));
    const areaH = chMax * rows + gap * (rows - 1);
    // se não couber na altura, encolhe tudo
    const fit = Math.min(1, (h * 0.9) / areaH);
    const ox = (w - areaW * fit) / 2;
    const oy = (h - areaH * fit) / 2;
    cards.forEach((c, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      c.x = ox + col * (cw + gap) * fit;
      c.y = oy + row * (chMax + gap) * fit;
      c.ch = chMax;
    });

    // fotos pré-recortadas na resolução final
    const k = fit * px;
    const imgs = { A: asset(p.imageA), B: asset(p.imageB) };
    for (const c of cards) {
      const e = c.els.find((x) => x.kind === 'img');
      const img = imgs[c.it.crop.src];
      if (!img) continue;
      const cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(e.w * k * 1.06));
      cv.height = Math.max(1, Math.round(e.h * k * 1.06));
      const r = coverRect(img, cv.width, cv.height, c.it.crop);
      cv.getContext('2d').drawImage(img, r.x, r.y, r.w, r.h);
      e.cache = cv;
      const a = c.els.find((x) => x.kind === 'avatar');
      const av = document.createElement('canvas');
      av.width = av.height = Math.max(2, Math.round(a.w * k));
      const g = av.getContext('2d');
      g.beginPath();
      g.arc(av.width / 2, av.width / 2, av.width / 2, 0, TAU);
      g.clip();
      const rb = coverRect(imgs.B || img, av.width, av.width, { zoom: [1, 1.8, 2.4, 1.4, 2][c.i % 5], fx: 0.5, fy: 0.3 });
      g.drawImage(imgs.B || img, rb.x, rb.y, rb.w, rb.h);
      a.cache = av;
    }

    let wall = null;
    if (!p.transparent) {
      wall = document.createElement('canvas');
      wall.width = Math.max(4, Math.round(w * px));
      wall.height = Math.max(4, Math.round(h * px));
      const g = wall.getContext('2d');
      g.scale(px, px);
      g.fillStyle = p.bg;
      g.fillRect(0, 0, w, h);
      const rg = g.createRadialGradient(w * 0.5, h * 0.4, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.7);
      rg.addColorStop(0, rgba(p.accent, dark ? 0.1 : 0.07));
      rg.addColorStop(1, rgba(p.accent, 0));
      g.fillStyle = rg;
      g.fillRect(0, 0, w, h);
    }
    return { cards, fit, cw, wall, dark };
  },

  render(ctx, t, { w, h, p, px, duration, state }) {
    const { cards, fit, cw, wall } = state;
    const dark = p.theme === 'escuro';
    if (wall) ctx.drawImage(wall, 0, 0, w, h);
    const CARD = dark ? '#18191e' : '#ffffff';
    const SK = dark ? '#25272d' : '#ebeae6';
    const INK = dark ? '#eeeff2' : '#15161a';
    const MUTED = dark ? '#8c8f99' : '#74767e';
    const SHINE = dark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.85)';

    // brilho: faixa diagonal atravessando a tela inteira
    const ph = fract(t / SHIMMER);
    const band = Math.max(w, h) * 0.22;
    const sx = -band * 2 + (w + band * 4) * ph;
    const shine = ctx.createLinearGradient(sx - band, -band * 0.6, sx + band, band * 0.6);
    shine.addColorStop(0, rgba('#ffffff', 0));
    shine.addColorStop(0.5, SHINE);
    shine.addColorStop(1, rgba('#ffffff', 0));

    // progresso de revelação de um elemento
    const reveal = (ci, ei) => {
      const a = T_REVEAL + ci * 0.2 + ei * 0.045;
      const b = T_BACK + ci * 0.06;
      return ease.outCubic(seg(t, a, a + 0.5)) * (1 - ease.inOutCubic(seg(t, b, b + 0.5)));
    };

    // cartões
    for (const c of cards) {
      // sombra suave em camadas + card
      for (const [e, a] of [[16, 0.035], [5, 0.05]]) {
        ctx.fillStyle = `rgba(0,0,0,${a * (dark ? 3 : 1)})`;
        ctx.beginPath();
        ctx.roundRect(c.x - e * 0.2 * fit, c.y + e * 0.5 * fit, cw * fit + e * 0.4 * fit, c.ch * fit, 18 * fit);
        ctx.fill();
      }
      ctx.fillStyle = CARD;
      ctx.beginPath();
      ctx.roundRect(c.x, c.y, cw * fit, c.ch * fit, 18 * fit);
      ctx.fill();
    }

    // esqueleto: um caminho com tudo que ainda está 100% esqueleto, um fill + um fill de brilho
    const skel = new Path2D();
    const partial = [];
    const shapeOf = (path, c, e) => {
      const x = c.x + e.x * fit;
      const y = c.y + e.y * fit;
      if (e.kind === 'avatar') {
        path.moveTo(x + e.w * fit, y + e.h * fit / 2);
        path.arc(x + (e.w * fit) / 2, y + (e.h * fit) / 2, (e.w * fit) / 2, 0, TAU);
      } else if (e.kind === 'text') {
        // barra arredondada com a largura da linha real
        const bh = e.fs * fit * 0.72;
        path.roundRect(x, y + (e.h * fit - bh) / 2, Math.max(bh, e.w * fit), bh, bh / 2);
      } else {
        path.roundRect(x, y, e.w * fit, e.h * fit, Array.isArray(e.r) ? e.r.map((r) => r * fit) : e.r * fit);
      }
    };
    cards.forEach((c, ci) =>
      c.els.forEach((e, ei) => {
        const k = reveal(ci, ei);
        if (k <= 0.001) shapeOf(skel, c, e);
        else partial.push({ c, e, k });
      }),
    );
    ctx.fillStyle = SK;
    ctx.fill(skel);
    ctx.fillStyle = shine;
    ctx.fill(skel);

    // elementos em transição ou revelados
    const base = ctx.globalAlpha;
    for (const { c, e, k } of partial) {
      const x = c.x + e.x * fit;
      const y = c.y + e.y * fit;
      if (k < 0.999) {
        const one = new Path2D();
        shapeOf(one, c, e);
        ctx.globalAlpha = base * (1 - k);
        ctx.fillStyle = SK;
        ctx.fill(one);
        ctx.fillStyle = shine;
        ctx.fill(one);
      }
      ctx.globalAlpha = base * k;
      if (e.kind === 'img') {
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(x, y, e.w * fit, e.h * fit, Array.isArray(e.r) ? e.r.map((r) => r * fit) : e.r * fit);
        ctx.clip();
        if (e.cache) {
          const z = 1.06 - 0.06 * k;
          const ww = e.w * fit * z;
          const hh = e.h * fit * z;
          ctx.drawImage(e.cache, x + (e.w * fit - ww) / 2, y + (e.h * fit - hh) / 2, ww, hh);
        } else {
          ctx.fillStyle = mixHex(p.accent, CARD, 0.7);
          ctx.fillRect(x, y, e.w * fit, e.h * fit);
        }
        ctx.restore();
      } else if (e.kind === 'avatar') {
        if (e.cache) ctx.drawImage(e.cache, x, y, e.w * fit, e.h * fit);
        else {
          ctx.fillStyle = p.accent;
          ctx.beginPath();
          ctx.arc(x + (e.w * fit) / 2, y + (e.h * fit) / 2, (e.w * fit) / 2, 0, TAU);
          ctx.fill();
        }
      } else if (e.kind === 'tag') {
        ctx.fillStyle = rgba(p.accent, dark ? 0.22 : 0.12);
        ctx.beginPath();
        ctx.roundRect(x, y, e.w * fit, e.h * fit, e.r * fit);
        ctx.fill();
        ctx.fillStyle = dark ? mixHex(p.accent, '#ffffff', 0.4) : p.accent;
        ctx.font = `700 ${e.fs * fit}px ${F}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(e.text, x + (e.w * fit) / 2, y + (e.h * fit) / 2 + 0.5 * fit);
      } else {
        ctx.fillStyle = e.ink ? INK : MUTED;
        ctx.font = `${e.weight} ${e.fs * fit}px ${F}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(e.text, x, y + (e.h * fit) / 2 + (1 - k) * e.fs * fit * 0.3);
      }
    }
    ctx.globalAlpha = base;
  },
};
