import { clamp, seg, ease, rng, rgba, mixHex } from '../lib/anim.js';

// Partida de Tetris roteirizada no setup: sequência 7-bag (seed) e um "jogador" que testa todas as
// rotações/colunas da peça atual + a próxima (2 lances) com a heurística clássica (altura agregada,
// buracos, irregularidade) e um bônus crescente por linhas — então às vezes guarda um poço e faz
// um Tetris. O setup grava, por peça: tempos (nascer, travar, limpar), trajeto e o tabuleiro antes
// e depois. O render só acha a peça do tempo t e desenha: queda em degraus, giro em torno do
// centro da caixa SRS, peça-fantasma, flash ao travar, linhas completas piscando e sumindo do
// centro para fora e o resto descendo. No fim o fundo do poço "abre" e tudo cai (loop ∞).

const COLS = 10;
const ROWS = 20;
const BASE = {
  I: { n: 4, c: [[0, 1], [1, 1], [2, 1], [3, 1]] },
  O: { n: 4, c: [[1, 0], [2, 0], [1, 1], [2, 1]] },
  T: { n: 3, c: [[1, 0], [0, 1], [1, 1], [2, 1]] },
  S: { n: 3, c: [[1, 0], [2, 0], [0, 1], [1, 1]] },
  Z: { n: 3, c: [[0, 0], [1, 0], [1, 1], [2, 1]] },
  J: { n: 3, c: [[0, 0], [0, 1], [1, 1], [2, 1]] },
  L: { n: 3, c: [[2, 0], [0, 1], [1, 1], [2, 1]] },
};
const TYPES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
// rotações: (x, y) → (n-1-y, x) dentro da caixa
const SHAPES = TYPES.map((k) => {
  const { n, c } = BASE[k];
  const rots = [c];
  for (let r = 1; r < 4; r++) rots.push(rots[r - 1].map(([x, y]) => [n - 1 - y, x]));
  return { n, rots: k === 'O' ? [c, c, c, c] : rots, uniq: k === 'O' ? 1 : k === 'I' || k === 'S' || k === 'Z' ? 2 : 4 };
});
const CLASSIC = ['#58c4dc', '#f2c14e', '#a77bdc', '#6cc287', '#e8615a', '#5b86e5', '#f0954a'];
const LINE_BONUS = [0, 0.25, 0.9, 2.2, 9];

function fits(board, cells, px, py) {
  for (const [x, y] of cells) {
    const X = px + x;
    const Y = py + y;
    if (X < 0 || X >= COLS || Y >= ROWS) return false;
    if (Y >= 0 && board[Y * COLS + X]) return false;
  }
  return true;
}

// coloca e limpa; devolve { board, rows (linhas completas, índices no tabuleiro com a peça) }
function place(board, cells, px, py, v) {
  const b = board.slice();
  for (const [x, y] of cells) if (py + y >= 0) b[(py + y) * COLS + px + x] = v;
  const rows = [];
  for (let y = 0; y < ROWS; y++) {
    let full = true;
    for (let x = 0; x < COLS; x++) if (!b[y * COLS + x]) { full = false; break; }
    if (full) rows.push(y);
  }
  return { locked: b, rows };
}

function clearRows(b, rows) {
  if (!rows.length) return b;
  const out = new Uint8Array(COLS * ROWS);
  let dst = ROWS - 1;
  for (let y = ROWS - 1; y >= 0; y--) {
    if (rows.includes(y)) continue;
    out.set(b.subarray(y * COLS, y * COLS + COLS), dst * COLS);
    dst--;
  }
  return out;
}

function evaluate(b) {
  let agg = 0;
  let holes = 0;
  let bump = 0;
  let maxH = 0;
  let prev = -1;
  for (let x = 0; x < COLS; x++) {
    let hgt = 0;
    let seen = false;
    for (let y = 0; y < ROWS; y++) {
      if (b[y * COLS + x]) {
        if (!seen) { hgt = ROWS - y; seen = true; }
      } else if (seen) holes++;
    }
    agg += hgt;
    maxH = Math.max(maxH, hgt);
    if (prev >= 0) bump += Math.abs(hgt - prev);
    prev = hgt;
  }
  return -0.3 * agg - 0.72 * holes - 0.2 * bump - 0.3 * Math.max(0, maxH - 10) ** 2;
}

function moves(board, type) {
  const S = SHAPES[type];
  const out = [];
  for (let r = 0; r < S.uniq; r++) {
    const cells = S.rots[r];
    const minX = Math.min(...cells.map((c) => c[0]));
    const maxX = Math.max(...cells.map((c) => c[0]));
    const minY = Math.min(...cells.map((c) => c[1]));
    for (let px = -minX; px + maxX < COLS; px++) {
      let py = -minY - 1;
      if (!fits(board, cells, px, py)) continue;
      while (fits(board, cells, px, py + 1)) py++;
      out.push({ r, px, py, cells });
    }
  }
  return out;
}

// pilha inicial: linhas de "lixo" com um poço numa coluna (cai no começo, vira Tetris logo)
function garbage(R) {
  const b = new Uint8Array(COLS * ROWS);
  const well = R() < 0.5 ? 0 : COLS - 1;
  const nG = 5;
  for (let i = 0; i < nG; i++) {
    const y = ROWS - 1 - i;
    for (let x = 0; x < COLS; x++) if (x !== well) b[y * COLS + x] = 1 + Math.floor(R() * 7);
  }
  // degraus irregulares por cima
  for (let x = 0; x < COLS; x++) {
    if (x === well || Math.abs(x - well) === 1) continue;
    const extra = Math.floor(R() * 3);
    for (let k = 0; k < extra; k++) b[(ROWS - 1 - nG - k) * COLS + x] = 1 + Math.floor(R() * 7);
  }
  return b;
}

function* simulate(seed) {
  const R = rng(seed * 4099 + 17);
  const seq = [];
  const start = garbage(R);
  while (seq.length < 120) {
    const bag = [0, 1, 2, 3, 4, 5, 6];
    for (let i = 6; i > 0; i--) {
      const j = Math.floor(R() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    seq.push(...bag);
  }
  let board = start;
  yield { start, seq };
  for (let i = 0; i < seq.length - 2; i++) {
    const type = seq[i];
    let best = null;
    let bestScore = -Infinity;
    for (const m of moves(board, type)) {
      const { locked, rows } = place(board, m.cells, m.px, m.py, type + 1);
      const b1 = clearRows(locked, rows);
      let s2 = -Infinity;
      for (const m2 of moves(b1, seq[i + 1])) {
        const r2 = place(b1, m2.cells, m2.px, m2.py, 1);
        const v = evaluate(clearRows(r2.locked, r2.rows)) + LINE_BONUS[r2.rows.length] * 0.9;
        if (v > s2) s2 = v;
      }
      // desempate determinístico e levemente variado pela seed
      const score = LINE_BONUS[rows.length] + s2 + R() * 1e-3;
      if (score > bestScore) { bestScore = score; best = { ...m, locked, rows, after: b1 }; }
    }
    if (!best) return;
    yield { type, r: best.r, px: best.px, py: best.py, before: board, locked: best.locked, rows: best.rows };
    board = best.after;
  }
}

const spawnOf = (type) => {
  const S = SHAPES[type];
  const minY = Math.min(...S.rots[0].map((c) => c[1]));
  return { sx: S.n === 4 ? 3 : 3, sy: -minY };
};

export default {
  id: 'tetris',
  title: 'Tetris',
  description: 'A self-playing game of Tetris: pieces rotate and lock in, and full lines flash and clear.',
  category: 'formas',
  tags: ['shape', 'loop', 'simulation', 'ui'],
  duration: 18,
  poster: 9.4,

  params: {
    bg: { type: 'color', label: 'Background', default: '#101114' },
    ink: { type: 'color', label: 'Blocks', default: '#e9e4da' },
    accent: { type: 'color', label: 'Accent', default: '#ff5a36' },
    palette: { type: 'select', label: 'Piece colors', options: ['tons', 'clássico'], default: 'tons' },
    speed: { type: 'range', label: 'Speed', min: 0.6, max: 2, step: 0.05, default: 1 },
    ghost: { type: 'boolean', label: 'Ghost piece', default: true },
    panel: { type: 'boolean', label: 'Panel (next / lines)', default: true },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 3 },
  },

  setup({ w, h, p, duration }) {
    const sp = p.speed;
    const T_IN = 1.1; // a pilha inicial cai antes da primeira peça
    const T_OUT = duration - 1.5;
    const LOCK = 0.09 / sp;
    const CLEAR = 0.62 / Math.sqrt(sp);
    // simula de sobra e corta pelo tempo
    const gen = simulate(Math.round(p.seed));
    const { start, seq } = gen.next().value;
    const pieces = [];
    let t = T_IN;
    let lines = 0;
    for (const pc of gen) {
      const { sx, sy } = spawnOf(pc.type);
      const fallRows = pc.py - sy;
      const tf = (0.24 + 0.017 * fallRows) / sp;
      const end = t + tf + LOCK + (pc.rows.length ? CLEAR : 0);
      if (end > T_OUT) break;
      lines += pc.rows.length;
      pieces.push({ ...pc, sx, sy, t0: t, tLand: t + tf, tEnd: end, lines });
      t = end;
    }
    const finalBoard = pieces.length ? clearRows(pieces[pieces.length - 1].locked, pieces[pieces.length - 1].rows) : start;

    // layout
    const vertical = w / h < 0.8;
    let c;
    let bx;
    let by;
    let pnl;
    if (!p.panel) {
      c = Math.floor(Math.min((h * 0.86) / ROWS, (w * 0.86) / COLS));
      bx = (w - c * COLS) / 2;
      by = (h - c * ROWS) / 2;
    } else if (vertical) {
      c = Math.floor(Math.min((w * 0.82) / COLS, (h * 0.84) / (ROWS + 3.6)));
      bx = (w - c * COLS) / 2;
      by = (h - c * (ROWS + 3.6)) / 2 + c * 3.6;
      pnl = { mode: 'top', x: bx, y: by - c * 3.6, wd: c * COLS };
    } else {
      c = Math.floor(Math.min((h * 0.84) / ROWS, (w * 0.86) / (COLS + 5.4)));
      bx = (w - c * (COLS + 5.4)) / 2;
      by = (h - c * ROWS) / 2;
      pnl = { mode: 'side', x: bx + c * (COLS + 1), y: by };
    }

    const colors =
      p.palette === 'clássico'
        ? CLASSIC
        : TYPES.map((_, i) => mixHex(p.bg, p.ink, [0.92, 0.62, 0.78, 0.5, 0.7, 0.56, 0.84][i]));
    const hi = rgba('#ffffff', 0.14);
    return { pieces, finalBoard, start, firstType: seq[0], seq, c, bx, by, pnl, colors, hi, T_IN, T_OUT, LOCK, CLEAR };
  },

  render(ctx, t, { w, h, p, duration, state: S }) {
    const { pieces, c, bx, by, pnl, colors, T_OUT, LOCK, CLEAR } = S;
    const m = Math.min(w, h);
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, w, h);

    // poço
    const BW = c * COLS;
    const BH = c * ROWS;
    ctx.fillStyle = rgba(p.ink, 0.035);
    ctx.fillRect(bx, by, BW, BH);
    // grade de pontos nas interseções
    ctx.fillStyle = rgba(p.ink, 0.13);
    ctx.beginPath();
    const d = Math.max(1.5, c * 0.06);
    for (let y = 1; y < ROWS; y++) for (let x = 1; x < COLS; x++) ctx.rect(bx + x * c - d / 2, by + y * c - d / 2, d, d);
    ctx.fill();
    // paredes e fundo
    const lw = Math.max(2, c * 0.08);
    ctx.fillStyle = rgba(p.ink, 0.5);
    ctx.fillRect(bx - lw * 1.6, by, lw, BH + lw * 1.6);
    ctx.fillRect(bx + BW + lw * 0.6, by, lw, BH + lw * 1.6);
    ctx.fillRect(bx - lw * 1.6, by + BH + lw * 0.6, BW + lw * 3.2, lw);

    // estado no tempo t
    let k = -1;
    for (let lo = 0, hi = pieces.length - 1; lo <= hi; ) {
      const mid = (lo + hi) >> 1;
      if (pieces[mid].t0 <= t) { k = mid; lo = mid + 1; } else hi = mid - 1;
    }
    const pc = k >= 0 ? pieces[k] : null;
    const outro = t >= T_OUT;

    const inset = c * 0.07;
    const rr = c * 0.14;
    const cellPath = (x, y, s = 1) => {
      const q = (c - 2 * inset) * s;
      ctx.roundRect(bx + x * c + c / 2 - q / 2, by + y * c + c / 2 - q / 2, q, q, rr * s);
    };
    // desenha um tabuleiro agrupando por cor; yOff(y) desloca linhas, skip(y) pula, scale(x,y) encolhe
    const drawBoard = (b, yOff, scaleAt, alphaAt) => {
      for (let v = 1; v <= 7; v++) {
        ctx.fillStyle = colors[v - 1];
        ctx.beginPath();
        let any = false;
        for (let y = 0; y < ROWS; y++) {
          const a = alphaAt ? alphaAt(y) : 1;
          if (a <= 0) continue;
          for (let x = 0; x < COLS; x++) {
            if (b[y * COLS + x] !== v) continue;
            const s = scaleAt ? scaleAt(x, y) : 1;
            if (s <= 0.01) continue;
            cellPath(x, y + (yOff ? yOff(y) : 0), s);
            any = true;
          }
        }
        if (any) ctx.fill();
      }
      // brilho no topo de cada bloco (um lote só)
      ctx.fillStyle = S.hi;
      ctx.beginPath();
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          if (!b[y * COLS + x]) continue;
          const s = scaleAt ? scaleAt(x, y) : 1;
          if (s <= 0.01) continue;
          const q = (c - 2 * inset) * s;
          ctx.rect(bx + x * c + c / 2 - q / 2 + q * 0.18, by + (y + (yOff ? yOff(y) : 0)) * c + c / 2 - q / 2 + q * 0.14, q * 0.64, q * 0.1);
        }
      }
      ctx.fill();
    };

    ctx.save();
    ctx.beginPath();
    ctx.rect(bx, by, BW, BH);
    ctx.clip();

    if (!pc && !outro) {
      // começo: a pilha inicial cai de cima, linha a linha (a de baixo primeiro)
      const fallIn = (y) => {
        const s = clamp((t - 0.05 - (ROWS - 1 - y) * 0.07) / 0.5);
        return -(1 - ease.outCubic(s)) * (ROWS + 1);
      };
      drawBoard(S.start, fallIn);
    } else if (outro) {
      // fim: o fundo abre e as linhas caem (de baixo para cima)
      const b = S.finalBoard;
      {
        const u = (t - T_OUT) / (duration - T_OUT - 0.15);
        const fall = (y) => {
          const s = clamp((u - (ROWS - 1 - y) * 0.018) / 0.55);
          return ease.inCubic(s) * (ROWS + 2);
        };
        // fade suave no fim para emendar com o vazio
        ctx.globalAlpha = 1 - seg(u, 0.75, 1);
        if (ctx.globalAlpha > 0) drawBoard(b, fall);
        ctx.globalAlpha = 1;
      }
    } else if (t < pc.tLand) {
      drawBoard(pc.before);
      // peça ativa
      const SH = SHAPES[pc.type];
      const tau = (t - pc.t0) / (pc.tLand - pc.t0);
      const rot = pc.r;
      const re = ease.outBack(seg(tau, 0.05, 0.22));
      const dx = pc.px - pc.sx;
      const steps = Math.abs(dx);
      let xc = pc.sx;
      if (steps) {
        const mv = seg(tau, 0.14, 0.5) * steps;
        const whole = Math.floor(mv);
        xc = pc.sx + Math.sign(dx) * (whole + ease.outCubic(clamp((mv - whole) * 2.2)));
      }
      const fallRows = pc.py - pc.sy;
      const yc0 = Math.pow(seg(tau, 0.08, 1), 1.25) * fallRows;
      const yw = Math.floor(yc0);
      const yc = pc.sy + (yc0 >= fallRows ? fallRows : yw + ease.outCubic(clamp((yc0 - yw) * 2.6)));
      const cells = SH.rots[rot];
      const pop = ease.outBack(seg(t, pc.t0, pc.t0 + 0.16));

      if (p.ghost) {
        ctx.strokeStyle = rgba(p.accent, 0.38 * seg(tau, 0.1, 0.3));
        ctx.lineWidth = Math.max(1.5, c * 0.05);
        ctx.beginPath();
        for (const [x, y] of cells) {
          const q = c - 2 * inset - ctx.lineWidth;
          ctx.roundRect(bx + (pc.px + x) * c + c / 2 - q / 2, by + (pc.py + y) * c + c / 2 - q / 2, q, q, rr);
        }
        ctx.stroke();
      }
      // gira em torno do centro da caixa SRS
      const ang = rot === 0 || SH.uniq === 1 ? 0 : -(1 - re) * (Math.PI / 2) * rot;
      const ccx = bx + (xc + SH.n / 2) * c;
      const ccy = by + (yc + SH.n / 2) * c;
      ctx.save();
      ctx.translate(ccx, ccy);
      ctx.rotate(ang);
      ctx.scale(pop, pop);
      ctx.translate(-ccx, -ccy);
      ctx.fillStyle = p.accent;
      ctx.beginPath();
      for (const [x, y] of cells) cellPath(xc + x, yc + y);
      ctx.fill();
      ctx.fillStyle = S.hi;
      ctx.beginPath();
      const q = c - 2 * inset;
      for (const [x, y] of cells) ctx.rect(bx + (xc + x) * c + inset + q * 0.18, by + (yc + y) * c + inset + q * 0.14, q * 0.64, q * 0.1);
      ctx.fill();
      ctx.restore();
    } else {
      // travou: peça passa do destaque para a cor dela; linhas completas piscam e somem
      const tl = t - pc.tLand;
      const rows = pc.rows;
      const tc = t - pc.tLand - LOCK; // tempo dentro da limpeza
      const full = new Uint8Array(ROWS);
      for (const y of rows) full[y] = 1;
      const vanish = (x, y) => {
        if (!full[y] || tc < 0) return 1;
        const dc = Math.abs(x - (COLS - 1) / 2) / ((COLS - 1) / 2);
        return 1 - ease.inCubic(seg(tc, CLEAR * (0.3 + 0.18 * (1 - dc)), CLEAR * (0.52 + 0.18 * (1 - dc))));
      };
      // quantas linhas abaixo de y somem → desce
      const below = new Float32Array(ROWS);
      for (let y = ROWS - 2; y >= 0; y--) below[y] = below[y + 1] + full[y + 1];
      const coll = rows.length ? ease.outQuart(seg(tc, CLEAR * 0.68, CLEAR)) : 0;
      drawBoard(pc.locked, (y) => (full[y] ? 0 : below[y] * coll), vanish);

      // cor de destaque saindo da peça recém-travada
      const SH = SHAPES[pc.type];
      const fade = 1 - ease.outCubic(clamp(tl / 0.32));
      if (fade > 0 && !(rows.length && tc > CLEAR * 0.3)) {
        ctx.globalAlpha = fade;
        ctx.fillStyle = p.accent;
        ctx.beginPath();
        for (const [x, y] of SH.rots[pc.r]) {
          const Y = pc.py + y;
          if (Y >= 0) cellPath(pc.px + x, Y, vanish(pc.px + x, Y));
        }
        ctx.fill();
        // flash branco curto do impacto
        ctx.globalAlpha = 0.55 * (1 - ease.outCubic(clamp(tl / 0.14)));
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      // flash das linhas completas: barra clara que acende e se fecha
      if (rows.length && tc >= 0) {
        const on = ease.outCubic(seg(tc, 0, CLEAR * 0.12));
        const off = ease.inOutCubic(seg(tc, CLEAR * 0.3, CLEAR * 0.62));
        const blink = 0.7 + 0.3 * Math.cos(seg(tc, 0, CLEAR * 0.3) * Math.PI * 4);
        const a = on * (1 - off) * blink;
        if (a > 0) {
          ctx.fillStyle = rgba('#ffffff', 0.82 * a);
          ctx.beginPath();
          const sx = 1 - off;
          for (const y of rows) ctx.rect(bx + BW / 2 - (BW / 2) * sx, by + y * c + c * 0.04, BW * sx, c * 0.92);
          ctx.fill();
          // brilho que vaza pelas laterais
          ctx.fillStyle = rgba(p.accent, 0.2 * a);
          ctx.beginPath();
          for (const y of rows) ctx.rect(bx, by + (y - 0.35) * c, BW, c * 1.7);
          ctx.fill();
        }
      }
    }
    ctx.restore();

    // painel
    if (pnl) {
      const L = pc && !outro ? pc.lines - (pc.rows.length && t < pc.tLand + LOCK + CLEAR * 0.45 ? pc.rows.length : 0) : 0;
      const shownLines = outro ? pieces.length ? pieces[pieces.length - 1].lines : 0 : L;
      // próxima peça
      let nextType;
      if (outro || !pc) nextType = S.firstType;
      else nextType = t < pc.tEnd ? S.seq[k + 1] : S.seq[k + 1];
      if (pc && !outro && t >= pc.tLand) nextType = S.seq[k + 1];
      const label = (txt, x, y) => {
        ctx.fillStyle = rgba(p.ink, 0.5);
        ctx.font = `600 ${Math.round(c * 0.4)}px Inter`;
        ctx.letterSpacing = `${(c * 0.4 * 0.16).toFixed(1)}px`;
        ctx.textBaseline = 'alphabetic';
        ctx.textAlign = 'left';
        ctx.fillText(txt, x, y);
        ctx.letterSpacing = '0px';
      };
      const drawMini = (type, x, y, sz) => {
        const SH = SHAPES[type];
        const cells = SH.rots[0];
        const minX = Math.min(...cells.map((q) => q[0]));
        const maxX = Math.max(...cells.map((q) => q[0]));
        const minY = Math.min(...cells.map((q) => q[1]));
        const maxY = Math.max(...cells.map((q) => q[1]));
        const cw = (maxX - minX + 1) * sz;
        const ch = (maxY - minY + 1) * sz;
        const ins = sz * 0.07;
        ctx.beginPath();
        for (const [qx, qy] of cells) ctx.roundRect(x - cw / 2 + (qx - minX) * sz + ins, y - ch / 2 + (qy - minY) * sz + ins, sz - 2 * ins, sz - 2 * ins, sz * 0.14);
        ctx.fill();
      };
      // troca da "próxima": encolhe e cresce de novo quando uma peça nasce
      const tNext = pc && !outro ? t - pc.t0 : t - T_OUT;
      const sw = !pc && !outro ? 1 : ease.outBack(clamp(tNext / 0.28));
      const lineCount = String(outro ? (t < T_OUT + 0.9 ? shownLines : 0) : shownLines).padStart(2, '0');
      const countA = outro ? Math.abs(1 - 2 * seg(t, T_OUT + 0.6, T_OUT + 1.2)) : 1;
      // pulso no número quando linhas somam
      const bump = pc && !outro && pc.rows.length ? Math.sin(Math.PI * seg(t, pc.tLand + LOCK + CLEAR * 0.4, pc.tLand + LOCK + CLEAR * 0.9)) : 0;
      if (pnl.mode === 'side') {
        const X = pnl.x;
        label('NEXT', X, pnl.y + c * 0.4);
        ctx.fillStyle = rgba(p.ink, 0.05);
        ctx.beginPath();
        ctx.roundRect(X, pnl.y + c * 0.9, c * 4.4, c * 3.4, c * 0.3);
        ctx.fill();
        ctx.fillStyle = mixHex(p.bg, p.ink, 0.86);
        if (sw > 0) drawMini(nextType, X + c * 2.2, pnl.y + c * 2.6, c * 0.82 * sw);
        label('LINES', X, pnl.y + c * 5.6);
        ctx.globalAlpha = countA;
        ctx.fillStyle = bump > 0 ? mixHex(p.ink, p.accent, bump) : p.ink;
        ctx.font = `500 ${Math.round(c * 1.9 * (1 + 0.12 * bump))}px "JetBrains Mono"`;
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(lineCount, X - c * 0.1, pnl.y + c * 7.75);
        ctx.globalAlpha = 1;
      } else {
        const X = pnl.x;
        const Y = pnl.y;
        label('NEXT', X, Y + c * 0.4);
        ctx.fillStyle = mixHex(p.bg, p.ink, 0.86);
        if (sw > 0) drawMini(nextType, X + c * 1.6, Y + c * 1.85, c * 0.62 * sw);
        ctx.textAlign = 'right';
        ctx.fillStyle = rgba(p.ink, 0.5);
        ctx.font = `600 ${Math.round(c * 0.4)}px Inter`;
        ctx.fillText('LINES', X + pnl.wd, Y + c * 0.4);
        ctx.globalAlpha = countA;
        ctx.fillStyle = bump > 0 ? mixHex(p.ink, p.accent, bump) : p.ink;
        ctx.font = `500 ${Math.round(c * 1.6 * (1 + 0.12 * bump))}px "JetBrains Mono"`;
        ctx.fillText(lineCount, X + pnl.wd + c * 0.05, Y + c * 2.45);
        ctx.globalAlpha = 1;
        ctx.textAlign = 'left';
      }
    }
    void m;
  },
};
