import { seg, ease, clamp, lerp, rng, spring } from '../lib/anim.js';
import { asset } from '../lib/assets.js';
import { coverRect } from '../lib/image.js';

// Polaroids caem sobre uma mesa clara e empilham. Cada cartão desce de cima (maior = mais alto, sombra
// mais longe e mais difusa), gira até o ângulo final e assenta com uma mola curta. A foto "revela" no
// papel: começa num cinza-esverdeado escuro, passa por uma versão lavada e sépia e chega à cor (três
// camadas pré-pintadas no setup, misturadas por alpha). Fotos: até três URLs, com recortes diferentes
// (zoom e foco sorteados) para variar; a última carta cai no centro com a legenda em serifa itálica e um
// brilho que atravessa a foto quando termina de revelar.
const SERIF = '"Instrument Serif", Georgia, serif';

export default {
  id: 'polaroid-stack',
  title: 'Polaroid Stack',
  description: 'Polaroids tumble onto the table and stack up, each photo slowly developing until it reaches full color.',
  category: 'imagem',
  tags: ['intro', 'ui'],
  duration: 8,
  poster: 6.6,

  params: {
    photo1: { type: 'image', label: 'Photo 1 (on top)', default: '/samples/portrait.jpg' },
    photo2: { type: 'image', label: 'Photo 2', default: '/samples/landscape.jpg' },
    photo3: { type: 'image', label: 'Photo 3', default: '/samples/landscape.jpg' },
    count: { type: 'range', label: 'Polaroids', min: 1, max: 7, step: 1, default: 5 },
    caption: { type: 'text', label: 'Caption (last)', default: 'summer, 2024' },
    table: { type: 'color', label: 'Table', default: '#e7e1d7' },
    ink: { type: 'color', label: 'Caption ink', default: '#2b2b33' },
    spread: { type: 'range', label: 'Spread', min: 0, max: 1, step: 0.05, default: 0.6 },
    develop: { type: 'range', label: 'Develop time (s)', min: 0.6, max: 4, step: 0.1, default: 2.4 },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 4 },
  },

  setup({ w, h, p, px }) {
    const sc = Math.max(px, 0.25);
    const m = Math.min(w, h);
    const portrait = h > w * 1.1;
    const n = Math.round(p.count);
    const R = rng(p.seed * 977 + 13);

    // tamanho do cartão (proporção da Polaroid 600: 88 × 107 mm, foto 79 × 79)
    const CW = portrait ? w * (h > w * 1.5 ? 0.6 : 0.5) : m * (w > h * 1.2 ? 0.5 : 0.56);
    const CH = CW * (107 / 88);
    const side = CW * (4.5 / 88);
    const top = CW * (5.5 / 88);
    const PS = CW - side * 2;

    const urls = [p.photo1, p.photo2, p.photo3].filter(Boolean);
    const cards = [];
    for (let i = 0; i < n; i++) {
      const last = i === n - 1;
      const img = urls.length ? asset(urls[(n - 1 - i) % urls.length]) : null;
      // recorte quadrado: zoom/foco variados (retrato: foco no rosto)
      const isPortrait = img && (img.naturalHeight || img.height) > (img.naturalWidth || img.width);
      const zoom = last ? 1.05 : 1 + R() * 0.9;
      const fx = last ? 0.5 : 0.2 + R() * 0.6;
      const fy = isPortrait ? 0.28 + R() * 0.06 : 0.5 + R() * 0.35;

      const P = Math.ceil(PS * sc);
      const mk = () => {
        const c = document.createElement('canvas');
        c.width = c.height = P;
        return c;
      };
      const color = mk(), latent = mk();
      if (img) {
        const r = coverRect(img, P, P, { zoom, fx, fy });
        const g = color.getContext('2d');
        g.filter = 'contrast(1.06) saturate(1.08)';
        g.drawImage(img, r.x, r.y, r.w, r.h);
        // imagem latente: lavada, sépia, pouco contraste
        const l = latent.getContext('2d');
        l.filter = 'grayscale(0.6) sepia(0.5) contrast(0.55) brightness(1.08)';
        l.drawImage(img, r.x, r.y, r.w, r.h);
        // brilho interno da emulsão nas duas
        for (const c of [color, latent]) {
          const gg = c.getContext('2d');
          gg.filter = 'none';
          const vg = gg.createRadialGradient(P / 2, P / 2, P * 0.3, P / 2, P / 2, P * 0.75);
          vg.addColorStop(0, 'rgba(0,0,0,0)');
          vg.addColorStop(1, 'rgba(0,0,0,0.22)');
          gg.fillStyle = vg;
          gg.fillRect(0, 0, P, P);
        }
      }

      // posição final: espalhados em volta do centro, a última no centro
      const ang = (i / Math.max(1, n - 1)) * Math.PI * 2 * 0.85 + R() * 0.8;
      const rad = last ? 0 : (portrait ? 0.14 : 0.2) * p.spread * (0.7 + R() * 0.5);
      const ax = portrait ? w : w * 1.25;
      // mantém o cartão inteiro dentro do quadro (com folga para a rotação)
      const mx = CW * 0.56, my = CH * 0.56;
      cards.push({
        color, latent, img: !!img,
        x: clamp(w / 2 + Math.cos(ang) * rad * ax, Math.min(w / 2, mx), Math.max(w / 2, w - mx)),
        y: clamp(h / 2 + Math.sin(ang) * rad * h * (portrait ? 1.5 : 0.8), Math.min(h / 2, my), Math.max(h / 2, h - my)) + (last ? -CH * 0.02 : 0),
        rot: last ? (R() - 0.5) * 0.06 : (R() - 0.5) * 0.5,
        rot0: (R() - 0.5) * 1.2,
        dx: (R() - 0.5) * w * 0.25,
      });
    }

    // cartão (papel com leve gradiente) e sombra, uma vez só
    const cardC = document.createElement('canvas');
    cardC.width = Math.ceil(CW * sc); cardC.height = Math.ceil(CH * sc);
    const cg = cardC.getContext('2d');
    cg.scale(sc, sc);
    const pg = cg.createLinearGradient(0, 0, CW, CH);
    pg.addColorStop(0, '#fbfaf6');
    pg.addColorStop(1, '#efece4');
    cg.fillStyle = pg;
    cg.fillRect(0, 0, CW, CH);
    cg.strokeStyle = 'rgba(0,0,0,0.06)';
    cg.lineWidth = Math.max(0.5 / sc, CW * 0.003);
    cg.strokeRect(0, 0, CW, CH);
    cg.fillStyle = '#262b29';
    cg.fillRect(side, top, PS, PS);

    const ss = sc * 0.25;
    const blur = CW * 0.05;
    const pad = blur * 3;
    const shC = document.createElement('canvas');
    shC.width = Math.ceil((CW + pad * 2) * ss); shC.height = Math.ceil((CH + pad * 2) * ss);
    const sg = shC.getContext('2d');
    sg.filter = `blur(${blur * ss}px)`;
    sg.scale(ss, ss);
    sg.fillStyle = 'rgba(40,30,20,1)';
    sg.fillRect(pad, pad, CW, CH);

    // mesa: cor + luz suave (pré-pintada)
    const bgC = document.createElement('canvas');
    bgC.width = Math.ceil(w * sc); bgC.height = Math.ceil(h * sc);
    const bg = bgC.getContext('2d');
    bg.scale(sc, sc);
    bg.fillStyle = p.table;
    bg.fillRect(0, 0, w, h);
    const lg = bg.createRadialGradient(w * 0.42, h * 0.35, 0, w * 0.42, h * 0.35, Math.hypot(w, h) * 0.75);
    lg.addColorStop(0, 'rgba(255,255,255,0.28)');
    lg.addColorStop(1, 'rgba(255,255,255,0)');
    bg.fillStyle = lg;
    bg.fillRect(0, 0, w, h);
    const vg = bg.createRadialGradient(w / 2, h / 2, m * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.6);
    vg.addColorStop(0, 'rgba(30,20,10,0)');
    vg.addColorStop(1, 'rgba(30,20,10,0.22)');
    bg.fillStyle = vg;
    bg.fillRect(0, 0, w, h);

    return { cards, CW, CH, side, top, PS, cardC, shC, pad, bgC, m };
  },

  render(ctx, t, { w, h, p, duration, state: s }) {
    const D = duration;
    const n = s.cards.length;
    const { CW, CH, side, top, PS } = s;
    ctx.drawImage(s.bgC, 0, 0, w, h);

    const drop = 0.95;
    const first = 0.25;
    const lastLand = Math.max(first + drop, D - p.develop - 1.4);
    const gapT = n > 1 ? (lastLand - drop - first) / (n - 1) : 0;
    // leve push-in ao longo de tudo
    const z = 1 + 0.04 * ease.inOutSine(seg(t, 0, D));
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(z, z);
    ctx.translate(-w / 2, -h / 2);

    s.cards.forEach((c, i) => {
      const t0 = first + i * gapT;
      const k = seg(t, t0, t0 + drop);
      if (k <= 0) return;
      const fall = ease.inOutCubic(Math.min(1, k * 1.05)); // altura: 1 → 0
      const height = 1 - fall;
      const settle = spring(seg(t, t0 + drop * 0.82, t0 + drop * 0.82 + 0.6), 0.25);
      const sq = settle > 0 ? 1 + 0.018 * Math.sin(settle * Math.PI) * (1 - settle) : 1;
      const scl = (1 + 0.55 * height) * sq;
      const x = c.x + c.dx * height;
      const y = c.y - h * 0.08 * height;
      const rot = lerp(c.rot, c.rot0, height * height) + (1 - settle) * 0.03 * (k >= 1 ? 1 : 0);
      const alpha = clamp(k * 4);

      // sombra: mais longe e clara quando alto
      ctx.save();
      ctx.globalAlpha = alpha * lerp(0.42, 0.16, height);
      const off = s.m * (0.008 + 0.09 * height);
      ctx.translate(x + off * 0.5, y + off);
      ctx.rotate(rot);
      const ss = scl * (1 + 0.1 * height);
      ctx.scale(ss, ss);
      ctx.drawImage(s.shC, -CW / 2 - s.pad, -CH / 2 - s.pad, CW + s.pad * 2, CH + s.pad * 2);
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.scale(scl, scl);
      ctx.translate(-CW / 2, -CH / 2);
      ctx.drawImage(s.cardC, 0, 0, CW, CH);
      // revelação: escuro → latente → cor
      if (c.img) {
        const land = t0 + drop * 0.6;
        const d = seg(t, land, land + p.develop);
        const a1 = ease.inOutSine(clamp(d * 1.8));
        const a2 = ease.inOutCubic(clamp((d - 0.3) / 0.7));
        if (a1 > 0) {
          ctx.globalAlpha = alpha * a1;
          ctx.drawImage(c.latent, side, top, PS, PS);
        }
        if (a2 > 0) {
          ctx.globalAlpha = alpha * a2;
          ctx.drawImage(c.color, side, top, PS, PS);
        }
        // brilho que atravessa a última foto quando termina de revelar
        if (i === n - 1) {
          const gl = seg(t, land + p.develop * 0.85, land + p.develop * 0.85 + 1.1);
          if (gl > 0 && gl < 1) {
            const e = ease.inOutCubic(gl);
            const gx = lerp(-PS * 0.6, PS * 1.6, e);
            const gr = ctx.createLinearGradient(side + gx - PS * 0.35, top, side + gx + PS * 0.05, top + PS * 0.4);
            gr.addColorStop(0, 'rgba(255,255,255,0)');
            gr.addColorStop(0.5, 'rgba(255,255,255,0.22)');
            gr.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.globalAlpha = alpha;
            ctx.fillStyle = gr;
            ctx.fillRect(side, top, PS, PS);
          }
        }
      }
      ctx.globalAlpha = alpha;
      // reflexo fixo do plástico sobre a foto
      const sh = ctx.createLinearGradient(side, top, side + PS, top + PS);
      sh.addColorStop(0, 'rgba(255,255,255,0.10)');
      sh.addColorStop(0.45, 'rgba(255,255,255,0)');
      ctx.fillStyle = sh;
      ctx.fillRect(side, top, PS, PS);
      // legenda na última
      if (i === n - 1 && p.caption.trim()) {
        const ck = ease.outCubic(seg(t, t0 + drop + 0.9, t0 + drop + 1.9));
        if (ck > 0) {
          const fs = CW * 0.085;
          ctx.font = `italic 400 ${fs}px ${SERIF}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = p.ink;
          ctx.globalAlpha = alpha * ck * 0.88;
          const cy = top + PS + (CH - top - PS) / 2;
          // escrita da esquerda para a direita (máscara)
          ctx.save();
          ctx.beginPath();
          ctx.rect(0, cy - fs, CW * (0.08 + 0.92 * ck), fs * 2);
          ctx.clip();
          ctx.fillText(p.caption.trim(), CW / 2, cy);
          ctx.restore();
        }
      }
      ctx.restore();
    });
    ctx.restore();

    // fecha no fundo para o loop do player
    const out = seg(t, D - 0.5, D);
    if (out > 0) {
      ctx.globalAlpha = ease.inCubic(out);
      ctx.drawImage(s.bgC, 0, 0, w, h);
      ctx.globalAlpha = 1;
    }
  },
};
