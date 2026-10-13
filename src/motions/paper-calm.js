import { TAU, lerp, rng, hexToRgb } from '../lib/anim.js';

// Fundo de papel recortado CLARO para vídeo explicativo: camadas onduladas que entram pelas bordas (cantos, laterais,
// base) e deixam o centro calmo e vazio para gráficos e texto por cima. Cada camada tem um degradê leve e projeta uma
// sombra macia sobre a de baixo; as bordas respiram devagar em loop. Feito para substituir uma imagem de fundo gerada
// por IA (mesmo visual de papel em camadas creme/areia/verde-água/âmbar), mas animado e de graça.
//
// Geometria: cada grupo de camadas tem uma direção n (do centro para a borda). A camada i é a região além de uma curva
// a uma distância D_i do centro, medida ao longo de n, com ondulação ao longo da tangente. As de dentro são pintadas
// primeiro; as mais perto da borda ficam por cima e jogam sombra para dentro.
// Sombra: o recorte pintado em preto num buffer pequeno (1/8) e ampliado com drawImage (bilinear = desfoque barato).

const NS = 64;          // pontos por curva
// sombra em duas partes, como papel de verdade: de contato (curta, mais escura, colada na borda) e ambiente (larga e
// fraca). Cada uma é pintada num buffer pequeno, desfocada lá dentro (barato) e ampliada; cor marrom quente, não preta.
const SOMBRAS = [{ red: 3, blur: 1.4, off: 0.004, a: 0.30 }, { red: 8, blur: 4.5, off: 0.02, a: 0.22 }];
const TOM = 'rgb(105,76,44)';

const norm = ([x, y]) => { const l = Math.hypot(x, y); return [x / l, y / l]; };
const mixC = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

// grupos por cena: direção (do centro para a borda), nº de camadas, faixa de distância (fração da distância até a
// borda) e quanto ondula
const CENAS = {
  ondas: [{ n: [1, -1.15], k: 4, de: 0.22, ate: 0.8, amp: 1.7 }, { n: [-1, 1.2], k: 5, de: 0.18, ate: 0.84, amp: 1.7 }],
  faixas: [{ n: [1, 0.08], k: 4, de: 0.05, ate: 0.75, amp: 0.6 }, { n: [-1, 0], k: 3, de: 0.45, ate: 0.85, amp: 0.55 }],
  trilha: [{ n: [0.12, 1], k: 5, de: 0.25, ate: 0.85, amp: 1.4 }, { n: [0.5, -1], k: 3, de: 0.4, ate: 0.85, amp: 1 }],
  colunas: [{ n: [0.2, -1], k: 4, de: 0.3, ate: 0.85, amp: 1.1 }, { n: [0, 1], k: 2, de: 0.62, ate: 0.88, amp: 0.6 }],
  bordas: [{ n: [1, -1], k: 3, de: 0.45, ate: 0.85, amp: 1 }, { n: [-1, 1], k: 3, de: 0.42, ate: 0.85, amp: 1 }, { n: [-1, -1], k: 2, de: 0.6, ate: 0.88, amp: 0.8 }, { n: [1, 1], k: 2, de: 0.58, ate: 0.88, amp: 0.8 }],
};

export default {
  id: 'paper-calm',
  title: 'Paper Calm',
  description: 'Fundo claro de papel recortado: camadas onduladas entram pelas bordas, com sombra macia, e deixam o centro vazio.',
  category: 'fundos',
  tags: ['fundo', 'loop', 'gradiente'],
  duration: 12,
  poster: 3,

  params: {
    cena: { type: 'select', label: 'Cena', options: ['ondas', 'faixas', 'trilha', 'colunas', 'bordas'], default: 'ondas' },
    papel: { type: 'color', label: 'Papel', default: '#fbf2e2' },
    areia: { type: 'color', label: 'Areia', default: '#f3ddb9' },
    verde: { type: 'color', label: 'Verde-água', default: '#aed4c5' },
    ambar: { type: 'color', label: 'Âmbar', default: '#f4c27e' },
    sombra: { type: 'range', label: 'Sombra', min: 0, max: 1, step: 0.01, default: 0.5 },
    movimento: { type: 'range', label: 'Movimento', min: 0, max: 1, step: 0.01, default: 0.5 },
    luz: { type: 'boolean', label: 'Faixa de luz', default: false },
    pontos: { type: 'boolean', label: 'Pontilhado nas bordas', default: false },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 5 },
  },

  setup({ w, h, p, px }) {
    const r = rng(p.seed);
    const pal = [hexToRgb(p.areia), hexToRgb(p.verde), hexToRgb(p.ambar), mixC(hexToRgb(p.papel), hexToRgb(p.areia), 0.5), hexToRgb(p.verde), mixC(hexToRgb(p.ambar), hexToRgb(p.areia), 0.5)];
    const papel = hexToRgb(p.papel);
    let ci = Math.floor(r() * 3);
    const grupos = (CENAS[p.cena] || CENAS.ondas).map((g) => {
      const n = norm(g.n), tg = [-n[1], n[0]];
      const E = Math.abs(n[0]) * w / 2 + Math.abs(n[1]) * h / 2;          // centro → borda ao longo de n
      const S = Math.hypot(w, h) / 2 + 100;                               // meia largura ao longo da tangente (cobre a tela toda)
      const camadas = Array.from({ length: g.k }, (_, i) => {
        const cor = mixC(pal[ci++ % pal.length], papel, 0.02 + 0.08 * r());
        return {
          D: E * lerp(g.de, g.ate, g.k > 1 ? i / (g.k - 1) : 0),
          cor, claro: mixC(cor, [255, 255, 255], 0.35),
          harm: [1, 2, 3].map((k, j) => ({ k, a: E * g.amp * [0.07, 0.035, 0.015][j] * (0.6 + r() * 0.6), ph: r() * TAU, m: (r() < 0.5 ? -1 : 1) * (j + 1) })),
        };
      });
      return { n, tg, E, S, camadas };
    });
    // colunas (cena "colunas"): tiras verticais de pontas arredondadas subindo da base
    const colunas = p.cena === 'colunas' ? Array.from({ length: 6 }, (_, i) => ({ x: w * (0.1 + i * 0.16 + (r() - 0.5) * 0.04), l: w * 0.07, a: h * (0.12 + r() * 0.16), ph: r() * TAU, cor: mixC(pal[(i + 2) % pal.length], papel, 0.45) })) : [];
    // luz central, grão de papel e pontilhado: num buffer, pintados uma vez
    const base = document.createElement('canvas');
    base.width = Math.round(w * px); base.height = Math.round(h * px);
    const b = base.getContext('2d');
    b.scale(px, px);
    b.fillStyle = css(papel); b.fillRect(0, 0, w, h);
    const glow = b.createRadialGradient(w / 2, h * 0.48, 0, w / 2, h * 0.48, Math.max(w, h) * 0.6);
    glow.addColorStop(0, 'rgba(255,250,240,0.45)'); glow.addColorStop(1, 'rgba(255,250,240,0)');
    b.fillStyle = glow; b.fillRect(0, 0, w, h);
    const grao = document.createElement('canvas');
    const gw = Math.max(1, Math.round(w * px)), gh = Math.max(1, Math.round(h * px));
    grao.width = gw; grao.height = gh;
    const g2 = grao.getContext('2d'), img = g2.createImageData(gw, gh), rr = rng(p.seed * 17 + 3);
    for (let i = 0; i < gw * gh; i++) { const v = rr(), o = i * 4; img.data[o] = img.data[o + 1] = img.data[o + 2] = v < 0.5 ? 90 : 255; img.data[o + 3] = Math.abs(v - 0.5) * 2 * 11 * Math.min(1, px * 2); }
    g2.putImageData(img, 0, 0);
    const pontos = [];
    if (p.pontos) for (let i = 0; i < 900; i++) { const x = r() * w, y = r() * h, dx = Math.min(x, w - x) / w, dy = Math.min(y, h - y) / h; if (Math.min(dx, dy) < 0.12) pontos.push([x, y]); }
    const buf = SOMBRAS.map((o) => { const a = document.createElement('canvas'), b = document.createElement('canvas');
      a.width = b.width = Math.max(8, Math.round(w * px / o.red)); a.height = b.height = Math.max(8, Math.round(h * px / o.red)); return { a, b }; });
    return { grupos, colunas, base, grao, pontos, buf, m: Math.min(w, h) };
  },

  render(ctx, t, { w, h, p, px, progress: u, state }) {
    const { grupos, colunas, base, grao, pontos, buf, m } = state;
    ctx.drawImage(base, 0, 0, w, h);
    const mov = p.movimento;
    const cx = w / 2, cy = h / 2;
    // contorno da camada (região além da curva, até bem fora da tela)
    const caminho = (g, c, alvo, esc = 1) => {
      alvo.beginPath();
      for (let j = 0; j <= NS; j++) {
        const s = lerp(-g.S, g.S, j / NS), q = s / g.S;
        let d = c.D;
        for (const hh of c.harm) d += hh.a * (0.6 + 0.4 * mov) * Math.sin(hh.k * Math.PI * q + hh.ph + TAU * u * hh.m * (mov > 0 ? 1 : 0) * 0.999999);
        d += Math.sin(TAU * u + c.D) * m * 0.01 * mov;
        const x = cx + g.tg[0] * s + g.n[0] * d, y = cy + g.tg[1] * s + g.n[1] * d;
        j ? alvo.lineTo(x * esc, y * esc) : alvo.moveTo(x * esc, y * esc);
      }
      const far = g.E * 3;
      alvo.lineTo((cx + g.tg[0] * g.S + g.n[0] * far) * esc, (cy + g.tg[1] * g.S + g.n[1] * far) * esc);
      alvo.lineTo((cx - g.tg[0] * g.S + g.n[0] * far) * esc, (cy - g.tg[1] * g.S + g.n[1] * far) * esc);
      alvo.closePath();
    };
    // camadas de dentro para fora, grupo a grupo (os grupos ficam em bordas diferentes e não se cruzam no centro)
    for (const g of grupos) {
      for (const c of g.camadas) {
        if (p.sombra > 0) SOMBRAS.forEach((o, k) => {
          const { a, b } = buf[k], ga = a.getContext('2d'), gb = b.getContext('2d'), esc = a.width / w;
          ga.setTransform(1, 0, 0, 1, 0, 0); ga.clearRect(0, 0, a.width, a.height);
          ga.fillStyle = TOM; caminho(g, c, ga, esc); ga.fill();
          gb.setTransform(1, 0, 0, 1, 0, 0); gb.clearRect(0, 0, b.width, b.height);
          gb.filter = `blur(${o.blur}px)`; gb.drawImage(a, 0, 0); gb.filter = 'none';
          // a luz vem de cima: a sombra cai para dentro e um pouco para baixo
          const off = m * o.off;
          ctx.globalAlpha = o.a * p.sombra * 2;
          ctx.drawImage(b, -g.n[0] * off, -g.n[1] * off + off * 0.6, w, h);
          ctx.globalAlpha = 1;
        });
        const a0 = [cx + g.n[0] * c.D, cy + g.n[1] * c.D], a1 = [cx + g.n[0] * g.E * 1.1, cy + g.n[1] * g.E * 1.1];
        const gr = ctx.createLinearGradient(a0[0], a0[1], a1[0], a1[1]);
        gr.addColorStop(0, css(c.claro)); gr.addColorStop(0.35, css(c.cor)); gr.addColorStop(1, css(mixC(c.cor, [120, 100, 80], 0.08)));
        ctx.fillStyle = gr; caminho(g, c, ctx); ctx.fill();
        // fio de luz na borda recortada (espessura do papel)
        ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = Math.max(1, m * 0.002); ctx.stroke();
      }
    }
    for (const k of colunas) {
      const hh = k.a * (1 + 0.06 * Math.sin(TAU * u + k.ph) * p.movimento), x = k.x, y = h - hh;
      ctx.globalAlpha = 0.25 * p.sombra; ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.roundRect(x + m * 0.01, y + m * 0.012, k.l, hh, k.l / 2); ctx.fill(); ctx.globalAlpha = 1;
      const gr = ctx.createLinearGradient(x, 0, x + k.l, 0);
      gr.addColorStop(0, css(mixC(k.cor, [255, 255, 255], 0.4))); gr.addColorStop(1, css(k.cor));
      ctx.fillStyle = gr; ctx.beginPath(); ctx.roundRect(x, y, k.l, hh + 40, [k.l / 2, k.l / 2, 0, 0]); ctx.fill();
    }
    if (p.luz) {
      // faixa de luz diagonal que passa devagar
      const k = ((u * 1) % 1), x0 = lerp(-0.6, 1.6, k) * w;
      const gr = ctx.createLinearGradient(x0 - w * 0.35, 0, x0 + w * 0.35, h * 0.4);
      gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gr; ctx.fillRect(0, 0, w, h);
    }
    if (pontos.length) { ctx.fillStyle = 'rgba(120,100,80,0.18)'; ctx.beginPath(); for (const [x, y] of pontos) { ctx.moveTo(x + 2.2, y); ctx.arc(x, y, 2.2, 0, TAU); } ctx.fill(); }
    ctx.drawImage(grao, 0, 0, w, h);
  },
};
