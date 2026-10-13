import { TAU, clamp, ease, spring, rng } from '../lib/anim.js';

// Grade suíça: cada célula tem uma cor de fundo e uma figura (quarto de círculo, semicírculo, círculo
// ou "gravata" de dois quartos). Em batidas alternadas a figura gira 90° (mola) ou "estoura" e volta
// como outra figura/cor. Uma onda (radial, diagonal ou aleatória) espalha o início de cada célula.
// Loop: 8 batidas → 4 giros (360°) e 4 trocas (o ciclo de figuras/cores tem período 4).

const BEATS = 8;

function drawFigure(ctx, type, a) {
  ctx.beginPath();
  if (type === 0) {
    // quarto de círculo ancorado no canto superior esquerdo
    ctx.moveTo(-a, -a);
    ctx.arc(-a, -a, 2 * a, 0, Math.PI / 2);
  } else if (type === 1) {
    // semicírculo com o diâmetro na borda de cima
    ctx.moveTo(a, -a);
    ctx.arc(0, -a, a, 0, Math.PI);
  } else if (type === 2) {
    ctx.arc(0, 0, a * 0.8, 0, TAU);
  } else {
    // dois quartos em cantos opostos
    ctx.moveTo(-a, -a);
    ctx.arc(-a, -a, a, 0, Math.PI / 2);
    ctx.moveTo(a, a);
    ctx.arc(a, a, a, Math.PI, Math.PI * 1.5);
  }
  ctx.fill();
}

export default {
  id: 'bauhaus-grid',
  title: 'Bauhaus Grid',
  description: 'A Swiss grid of quarter circles, half circles and circles that rotate and swap shapes in a staggered wave.',
  category: 'formas',
  tags: ['pattern', 'shape', 'loop', 'background'],
  duration: 8,
  poster: 2.35,

  params: {
    rows: { type: 'range', label: 'Rows (short side)', min: 3, max: 12, step: 1, default: 5 },
    wave: { type: 'select', label: 'Wave', options: ['radial', 'diagonal', 'aleatória'], default: 'radial' },
    spread: { type: 'range', label: 'Stagger (s)', min: 0, max: 1.2, step: 0.05, default: 0.6 },
    gap: { type: 'range', label: 'Gap', min: 0, max: 0.15, step: 0.005, default: 0.03 },
    c1: { type: 'color', label: 'Paper', default: '#eee5d1' },
    c2: { type: 'color', label: 'Red', default: '#e2432a' },
    c3: { type: 'color', label: 'Blue', default: '#1f45a8' },
    c4: { type: 'color', label: 'Yellow', default: '#f3b42b' },
    c5: { type: 'color', label: 'Ink', default: '#17171b' },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 7 },
  },

  setup({ w, h, p }) {
    const m = Math.min(w, h);
    const target = m / p.rows;
    const cols = Math.max(1, Math.round(w / target));
    const rows = Math.max(1, Math.round(h / target));
    const r = rng(p.seed);
    const cells = [];
    const cxg = (cols - 1) / 2;
    const cyg = (rows - 1) / 2;
    const maxD = Math.hypot(cxg, cyg) || 1;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        // fundo: papel mais frequente, tinta e cores menos
        const q = r();
        const bg = q < 0.36 ? 0 : q < 0.56 ? 4 : q < 0.72 ? 1 : q < 0.86 ? 2 : 3;
        let wv;
        if (p.wave === 'diagonal') wv = (i / Math.max(1, cols - 1) + j / Math.max(1, rows - 1)) / 2;
        else if (p.wave === 'aleatória') wv = r();
        else wv = Math.hypot(i - cxg, j - cyg) / maxD;
        cells.push({
          i,
          j,
          bg,
          fgOff: Math.floor(r() * 4),
          type: Math.floor(r() * 4),
          rot0: Math.floor(r() * 4),
          dir: r() < 0.5 ? 1 : -1,
          holds: r() < 0.3, // não troca de figura, só gira
          wv,
          jitter: r() * 0.08,
        });
      }
    }
    return { cols, rows, cells };
  },

  render(ctx, t, { w, h, p, duration, state }) {
    const pal = [p.c1, p.c2, p.c3, p.c4, p.c5];
    ctx.fillStyle = p.c5;
    ctx.fillRect(0, 0, w, h);

    const { cols, rows, cells } = state;
    const cw = w / cols;
    const ch = h / rows;
    const g = Math.min(cw, ch) * p.gap;
    const bl = duration / BEATS;
    const trans = 0.72; // fração da batida ocupada pela transição

    for (const c of cells) {
      const tc = t - c.wv * p.spread - c.jitter;
      const bf = tc / bl;
      const j = Math.floor(bf);
      const act = clamp((bf - j) / trans);
      let rotN = Math.ceil(j / 2);
      let pops = Math.floor(j / 2);
      let scale = 1;
      if (j % 2 === 0) {
        rotN += spring(act, 0.18);
      } else if (!c.holds) {
        if (act < 0.42) scale = 1 - ease.inCubic(act / 0.42);
        else {
          pops += 1;
          scale = spring((act - 0.42) / 0.58, 0.25);
        }
      }
      if (c.holds) pops = 0;
      const pm = ((pops % 4) + 4) % 4;
      const type = (c.type + pm) % 4;
      const fg = pal[(c.bg + 1 + ((c.fgOff + pm) % 4)) % 5];

      const x = c.i * cw;
      const y = c.j * ch;
      ctx.fillStyle = pal[c.bg];
      ctx.fillRect(x + g / 2, y + g / 2, cw - g, ch - g);

      if (scale <= 0.001) continue;
      const a = (Math.min(cw, ch) - g) / 2;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x + g / 2, y + g / 2, cw - g, ch - g);
      ctx.clip();
      ctx.translate(x + cw / 2, y + ch / 2);
      ctx.rotate(((c.rot0 + c.dir * rotN) * Math.PI) / 2);
      ctx.scale(scale, scale);
      ctx.fillStyle = fg;
      drawFigure(ctx, type, a);
      ctx.restore();
    }
  },
};
