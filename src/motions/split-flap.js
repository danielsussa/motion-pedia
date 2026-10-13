import { ease, seg, rgba, mixHex } from '../lib/anim.js';

function hash(a, b, c = 0) {
  let x = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 1440670441)) | 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

const CHARSET = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,:-/!?&';
const norm = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^ A-Z0-9.,:\-/!?&]/g, ' ');

const FLIP = 0.075; // duração de cada virada (s)

export default {
  id: 'split-flap',
  title: 'Split-Flap',
  description: 'Painel de aeroporto (Solari): as placas viram letra a letra, em cascata, até formar as palavras.',
  category: 'tipografia',
  tags: ['tipografia', 'intro', 'ui'],
  duration: 6,
  poster: 3.2,

  params: {
    text: { type: 'textarea', label: 'Texto (uma linha por fileira)', rows: 3, default: 'EMBARQUE\nPORTAO 12\nNO HORARIO' },
    header: { type: 'text', label: 'Cabeçalho', default: 'PARTIDAS  ·  DEPARTURES' },
    cols: { type: 'range', label: 'Colunas (0 = auto)', min: 0, max: 24, step: 1, default: 0 },
    flips: { type: 'range', label: 'Viradas por placa', min: 2, max: 30, step: 1, default: 12 },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 3 },
    color: { type: 'color', label: 'Letras', default: '#f2efe6' },
    accent: { type: 'color', label: 'Última linha', default: '#ffc23d' },
    flap: { type: 'color', label: 'Placa', default: '#1c1d21' },
    bg: { type: 'color', label: 'Fundo', default: '#0b0b0d' },
  },

  setup({ p, duration }) {
    const lines = (p.text || ' ').split('\n').map(norm);
    const longest = Math.max(1, ...lines.map((l) => l.trimEnd().length));
    const cols = p.cols > 0 ? Math.max(p.cols, 1) : longest + 2;
    const rows = lines.length;
    const L = CHARSET.length;
    const cells = [];
    const end = duration ?? 6;
    lines.forEach((line, r) => {
      const t = line.trimEnd();
      const pad = Math.floor((cols - t.length) / 2);
      for (let c = 0; c < cols; c++) {
        const ch = t[c - pad] ?? ' ';
        const ti = Math.max(0, CHARSET.indexOf(ch));
        const hs = hash(p.seed, r * 97 + c);
        const blank = ti === 0;
        // Placas vazias viram poucas vezes; as com letra percorrem n caracteres antes do alvo.
        const n = blank ? Math.floor(hs * 3) : Math.max(1, Math.round(p.flips * (0.55 + 0.9 * hash(p.seed, r * 97 + c, 1))));
        const seq = [' '];
        for (let k = 1; k <= n; k++) seq.push(CHARSET[(((ti - n + k) % L) + L) % L]);
        if (n === 0) seq.length = 1;
        const start = 0.25 + c * 0.045 + r * 0.12 + hs * 0.12;
        // Saída (para o loop): tudo volta para vazio em cascata.
        const outStart = end - 1.15 + c * 0.02 + r * 0.05;
        cells.push({ r, c, seq, start, outStart, accent: r === rows - 1 && rows > 1 });
      }
    });
    return { cells, cols, rows, end };
  },

  render(ctx, t, { w, h, p, px, state }) {
    const { cells, cols, rows } = state;
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, w, h);
    const glow = ctx.createRadialGradient(w / 2, h * 0.45, 0, w / 2, h / 2, Math.max(w, h) * 0.65);
    glow.addColorStop(0, 'rgba(255,255,255,0.06)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    // Layout: placas com proporção ~0.7, cabem em 88% da largura e 70% da altura.
    const gap = 0.1;
    const cw = Math.min((w * 0.88) / (cols + (cols - 1) * gap), ((h * 0.7) / (rows + (rows - 1) * gap * 1.6)) * 0.7);
    const ch = cw / 0.7;
    const gx = cw * gap;
    const gy = cw * gap * 1.6;
    const bw = cols * cw + (cols - 1) * gx;
    const bh = rows * ch + (rows - 1) * gy;
    const x0 = (w - bw) / 2;
    const y0 = (h - bh) / 2;

    // Moldura do painel.
    const pad = cw * 0.35;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = cw * 0.8 * px;
    ctx.shadowOffsetY = cw * 0.15 * px;
    ctx.fillStyle = mixHex(p.bg, '#000000', 0.4);
    ctx.beginPath();
    ctx.roundRect(x0 - pad, y0 - pad, bw + pad * 2, bh + pad * 2, cw * 0.18);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = Math.max(1, cw * 0.02);
    ctx.stroke();

    // Cabeçalho mono acima do painel.
    if (p.header) {
      const hs = Math.max(9, Math.min(w, h) * 0.022);
      const a = ease.outCubic(seg(t, 0.05, 0.6)) * (1 - seg(t, state.end - 0.5, state.end - 0.1));
      ctx.globalAlpha = a;
      ctx.font = `500 ${hs}px 'JetBrains Mono', monospace`;
      ctx.letterSpacing = `${hs * 0.2}px`;
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'left';
      const hy = y0 - pad - hs * 1.1;
      ctx.fillStyle = p.accent;
      ctx.beginPath();
      ctx.arc(x0 - pad + hs * 0.35, hy - hs * 0.35, hs * 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rgba(p.color, 0.7);
      ctx.fillText(p.header, x0 - pad + hs * 1.2, hy);
      ctx.globalAlpha = 1;
      ctx.letterSpacing = '0px';
    }

    const fs = ch * 0.72;
    ctx.font = `700 ${fs}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const rad = cw * 0.08;
    const flapTop = mixHex(p.flap, '#ffffff', 0.05);
    const flapBot = p.flap;
    const seam = Math.max(1, ch * 0.018);

    const half = (x, y, char, top, color, base) => {
      // Desenha metade (superior/inferior) de uma placa com a letra recortada.
      const yy = top ? y : y + ch / 2;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, yy, cw, ch / 2);
      ctx.clip();
      ctx.fillStyle = base;
      ctx.beginPath();
      ctx.roundRect(x, y, cw, ch, rad);
      ctx.fill();
      if (char !== ' ') {
        ctx.fillStyle = color;
        ctx.fillText(char, x + cw / 2, y + ch / 2 + fs * 0.04);
      }
      ctx.restore();
    };

    for (const cell of cells) {
      const x = x0 + cell.c * (cw + gx);
      const y = y0 + cell.r * (ch + gy);
      const color = cell.accent ? p.accent : p.color;
      const { seq } = cell;
      const n = seq.length - 1;
      // Índice da virada atual (entrada: avança na sequência; saída: volta direto ao vazio em 1 virada).
      let from;
      let to;
      let f;
      const ft = (t - cell.start) / FLIP;
      if (t >= cell.outStart && n > 0) {
        from = seq[n];
        to = ' ';
        f = Math.min(1, (t - cell.outStart) / (FLIP * 1.6));
      } else if (ft <= 0 || n === 0) {
        from = to = seq[0];
        f = 1;
      } else if (ft >= n) {
        from = to = seq[n];
        f = 1;
      } else {
        const k = Math.floor(ft);
        from = seq[k];
        to = seq[k + 1];
        f = ft - k;
      }

      if (f >= 1 || from === to) {
        half(x, y, to, true, color, flapTop);
        half(x, y, to, false, color, flapBot);
      } else {
        // Fundo: metade de cima já mostra a nova, de baixo ainda a antiga.
        half(x, y, to, true, color, flapTop);
        half(x, y, from, false, color, flapBot);
        const e = ease.inOutSine(f);
        const cy = y + ch / 2;
        ctx.save();
        if (e < 0.5) {
          // Aba superior (antiga) caindo: achata em direção à dobradiça.
          const s = Math.cos(e * Math.PI);
          ctx.translate(0, cy);
          ctx.scale(1, s);
          ctx.translate(0, -cy);
          half(x, y, from, true, color, mixHex(p.flap, '#000000', (1 - s) * 0.5));
        } else {
          // Aba inferior (nova) terminando de cair.
          const s = -Math.cos(e * Math.PI);
          ctx.translate(0, cy);
          ctx.scale(1, s);
          ctx.translate(0, -cy);
          half(x, y, to, false, color, mixHex(p.flap, '#ffffff', (1 - s) * 0.12));
        }
        ctx.restore();
      }
      // Fenda central e brilho sutil no topo.
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(x, y + ch / 2 - seam / 2, cw, seam);
      ctx.fillStyle = rgba('#ffffff', 0.04);
      ctx.fillRect(x + rad, y + 1, cw - rad * 2, Math.max(1, ch * 0.012));
    }

  },
};
