import { clamp, seg, ease, rng, rgba, mixHex } from '../lib/anim.js';

// Labirinto gerado por backtracker recursivo (sorteado no setup) e depois resolvido.
// Desenho em "corredores": cada passagem é um traço grosso entre os centros de duas células, com
// ponta quadrada — as paredes são o que sobra do fundo. Toda a geração é pré-computada como uma
// lista de passos (cavar / voltar); o render só acha o passo do tempo t e desenha o prefixo.
// A pilha do backtracker (caminho da raiz até a cabeça) sai em tom de destaque, e a solução é o
// caminho da árvore da entrada (canto superior esquerdo) até a saída (inferior direito).

const T_GEN0 = 0.04;
const T_GEN1 = 0.56; // fração da duração em que a geração termina
const T_SOL0 = 0.6;
const T_SOL1 = 0.8;
const T_OUT = 0.94;

export default {
  id: 'maze',
  title: 'Maze',
  description: 'Labirinto que se cava sozinho (backtracker) e depois é resolvido por uma linha que corre da entrada à saída.',
  category: 'formas',
  tags: ['forma', 'padrão', 'simulação'],
  duration: 10,
  poster: 7.6,

  params: {
    bg: { type: 'color', label: 'Fundo', default: '#0f1013' },
    paper: { type: 'color', label: 'Corredores', default: '#ebe7df' },
    accent: { type: 'color', label: 'Destaque', default: '#ff5a36' },
    cells: { type: 'range', label: 'Células (lado menor)', min: 6, max: 30, step: 1, default: 13 },
    wall: { type: 'range', label: 'Espessura da parede', min: 0.12, max: 0.6, step: 0.01, default: 0.3 },
    backSpeed: { type: 'range', label: 'Velocidade da volta', min: 1, max: 6, step: 0.5, default: 3 },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 11 },
  },

  setup({ w, h, p }) {
    const m = Math.min(w, h);
    const n = Math.round(p.cells);
    const margin = m * 0.11;
    const cell = (m - 2 * margin) / n;
    const cols = Math.max(3, Math.floor((w - 2 * margin) / cell));
    const rows = Math.max(3, Math.floor((h - 2 * margin) / cell));
    const ox = (w - cols * cell) / 2;
    const oy = (h - rows * cell) / 2;
    const N = cols * rows;
    const cx = new Float32Array(N);
    const cy = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      cx[i] = ox + ((i % cols) + 0.5) * cell;
      cy[i] = oy + (Math.floor(i / cols) + 0.5) * cell;
    }

    // backtracker
    const r = rng(p.seed * 7919);
    const visited = new Uint8Array(N);
    const parent = new Int32Array(N).fill(-1);
    const stack = [0];
    visited[0] = 1;
    const heads = [0]; // cabeça depois de cada passo
    const carved = [0]; // nº de passagens cavadas depois de cada passo
    const order = []; // célula cavada (a passagem é parent→célula)
    const tAt = [0]; // tempo acumulado (cavar pesa 1, voltar pesa 1/backSpeed)
    while (stack.length) {
      const c = stack[stack.length - 1];
      const x = c % cols;
      const y = (c / cols) | 0;
      const nb = [];
      if (x > 0 && !visited[c - 1]) nb.push(c - 1);
      if (x < cols - 1 && !visited[c + 1]) nb.push(c + 1);
      if (y > 0 && !visited[c - cols]) nb.push(c - cols);
      if (y < rows - 1 && !visited[c + cols]) nb.push(c + cols);
      if (nb.length) {
        const k = nb[Math.floor(r() * nb.length)];
        visited[k] = 1;
        parent[k] = c;
        stack.push(k);
        order.push(k);
        heads.push(k);
        carved.push(order.length);
        tAt.push(tAt[tAt.length - 1] + 1);
      } else {
        stack.pop();
        if (!stack.length) break;
        heads.push(stack[stack.length - 1]);
        carved.push(order.length);
        tAt.push(tAt[tAt.length - 1] + 1 / p.backSpeed);
      }
    }
    const total = tAt[tAt.length - 1];
    for (let i = 0; i < tAt.length; i++) tAt[i] /= total;

    // solução: da saída até a raiz pela árvore
    const sol = [];
    for (let c = N - 1; c !== -1; c = parent[c]) sol.push(c);
    sol.reverse();
    // comprimento acumulado (em células) + pontas para fora do quadro
    const solPts = [[ox - cell * 0.9, cy[0]], ...sol.map((c) => [cx[c], cy[c]]), [ox + cols * cell + cell * 0.9, cy[N - 1]]];
    const solLen = [0];
    for (let i = 1; i < solPts.length; i++)
      solLen.push(solLen[i - 1] + Math.hypot(solPts[i][0] - solPts[i - 1][0], solPts[i][1] - solPts[i - 1][1]));

    return { cell, cols, rows, ox, oy, N, cx, cy, parent, heads, carved, order, tAt, solPts, solLen, tint: mixHex(p.paper, p.accent, 0.42) };
  },

  render(ctx, t, { w, h, p, duration, state: S }) {
    const { cell, cols, ox, N, cx, cy, parent, heads, carved, order, tAt, solPts, solLen } = S;
    const m = Math.min(w, h);
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, w, h);
    const u = t / duration;
    const fadeIn = ease.outCubic(seg(u, 0, 0.05));
    const fadeOut = 1 - ease.inOutCubic(seg(u, T_OUT, 0.995));
    const A = fadeIn * fadeOut;
    if (A <= 0) return;
    ctx.globalAlpha = A;

    // grade de pontos (células ainda não visitadas)
    const dot = cell * 0.08;
    ctx.fillStyle = rgba(p.paper, 0.16);
    ctx.beginPath();
    for (let i = 0; i < N; i++) ctx.rect(cx[i] - dot / 2, cy[i] - dot / 2, dot, dot);
    ctx.fill();

    // passo atual da geração (tempo não linear: voltas são mais rápidas)
    const g = ease.inOutSine(seg(u, T_GEN0, T_GEN1));
    let lo = 0;
    let hi = tAt.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (tAt[mid] <= g) lo = mid;
      else hi = mid;
    }
    const k = g >= 1 ? tAt.length - 1 : lo;
    const fr = k < tAt.length - 1 ? clamp((g - tAt[k]) / (tAt[k + 1] - tAt[k] || 1)) : 0;
    const nCarved = carved[k];
    const partial = k < tAt.length - 1 && carved[k + 1] > nCarved ? order[nCarved] : -1;

    const wid = cell * (1 - p.wall);
    ctx.lineCap = 'square';
    ctx.lineJoin = 'miter';
    ctx.lineWidth = wid;
    // corredores cavados (um traço só)
    ctx.strokeStyle = p.paper;
    ctx.beginPath();
    ctx.moveTo(cx[0], cy[0]);
    ctx.lineTo(cx[0], cy[0]);
    for (let i = 0; i < nCarved; i++) {
      const c = order[i];
      const q = parent[c];
      ctx.moveTo(cx[q], cy[q]);
      ctx.lineTo(cx[c], cy[c]);
    }
    if (partial >= 0) {
      const q = parent[partial];
      const e = ease.outCubic(fr);
      ctx.moveTo(cx[q], cy[q]);
      ctx.lineTo(cx[q] + (cx[partial] - cx[q]) * e, cy[q] + (cy[partial] - cy[q]) * e);
    }
    // entrada e saída aparecem quando a geração termina
    const doors = ease.outExpo(seg(u, T_GEN1, T_GEN1 + 0.04));
    if (doors > 0) {
      ctx.moveTo(cx[0], cy[0]);
      ctx.lineTo(cx[0] - (cell * 0.5 + wid * 0.5) * doors, cy[0]);
      ctx.moveTo(cx[N - 1], cy[N - 1]);
      ctx.lineTo(cx[N - 1] + (cell * 0.5 + wid * 0.5) * doors, cy[N - 1]);
    }
    ctx.stroke();

    // pilha do backtracker (some quando termina)
    const stackA = 1 - seg(u, T_GEN1, T_GEN1 + 0.03);
    if (stackA > 0 && k > 0) {
      let hx;
      let hy;
      const head = heads[k];
      const next = k < heads.length - 1 ? heads[k + 1] : head;
      if (partial >= 0) {
        const e = ease.outCubic(fr);
        hx = cx[head] + (cx[partial] - cx[head]) * e;
        hy = cy[head] + (cy[partial] - cy[head]) * e;
      } else {
        const e = ease.inOutSine(fr);
        hx = cx[head] + (cx[next] - cx[head]) * e;
        hy = cy[head] + (cy[next] - cy[head]) * e;
      }
      ctx.globalAlpha = A * stackA;
      ctx.strokeStyle = S.tint;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = wid * 0.34;
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      // se está voltando, a cabeça já saiu da célula atual
      let c = partial >= 0 || next === head ? head : next === parent[head] ? next : head;
      ctx.lineTo(cx[c], cy[c]);
      for (c = parent[c]; c !== -1; c = parent[c]) ctx.lineTo(cx[c], cy[c]);
      ctx.stroke();
      // cabeça
      ctx.fillStyle = p.accent;
      const hs = wid * 0.62;
      ctx.fillRect(hx - hs / 2, hy - hs / 2, hs, hs);
      ctx.globalAlpha = A;
    }

    // marcadores de entrada/saída
    if (doors > 0) {
      ctx.fillStyle = p.accent;
      const tri = (x, y, s) => {
        ctx.beginPath();
        ctx.moveTo(x - s * 0.5, y - s * 0.6);
        ctx.lineTo(x + s * 0.55, y);
        ctx.lineTo(x - s * 0.5, y + s * 0.6);
        ctx.closePath();
        ctx.fill();
      };
      const s = cell * 0.36 * doors;
      ctx.globalAlpha = A * doors;
      tri(ox - cell * 0.95, cy[0], s);
      tri(ox + cols * cell + cell * 0.95, cy[N - 1], s);
      ctx.globalAlpha = A;
    }

    // solução: linha que corre
    const sp = ease.inOutCubic(seg(u, T_SOL0, T_SOL1));
    if (sp > 0) {
      const L = solLen[solLen.length - 1] * sp;
      ctx.strokeStyle = p.accent;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(wid * 0.3, m * 0.004);
      ctx.beginPath();
      ctx.moveTo(solPts[0][0], solPts[0][1]);
      let hx = solPts[0][0];
      let hy = solPts[0][1];
      for (let i = 1; i < solPts.length; i++) {
        if (solLen[i] <= L) {
          ctx.lineTo(solPts[i][0], solPts[i][1]);
          hx = solPts[i][0];
          hy = solPts[i][1];
        } else {
          const f = (L - solLen[i - 1]) / (solLen[i] - solLen[i - 1]);
          hx = solPts[i - 1][0] + (solPts[i][0] - solPts[i - 1][0]) * f;
          hy = solPts[i - 1][1] + (solPts[i][1] - solPts[i - 1][1]) * f;
          ctx.lineTo(hx, hy);
          break;
        }
      }
      ctx.stroke();
      // cabeça com halo (alguns discos de alpha baixo; sem shadowBlur)
      const run = 1 - seg(u, T_SOL1, T_SOL1 + 0.05);
      if (run > 0) {
        ctx.fillStyle = rgba(p.accent, 0.14 * run);
        for (const k2 of [2.6, 1.8]) {
          ctx.beginPath();
          ctx.arc(hx, hy, wid * 0.32 * k2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = p.accent;
        ctx.beginPath();
        ctx.arc(hx, hy, wid * 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  },
};
