import { TAU, clamp, seg, ease, spring, rng, rgba } from '../lib/anim.js';

// Árvore recursiva: a estrutura (ângulo, comprimento, atraso de cada galho) é sorteada no setup;
// o render percorre a árvore a partir da raiz somando ângulos, então o vento (seno por galho, mais
// forte nas pontas) curva a árvore inteira de forma coerente. Crescimento galho a galho: cada galho
// nasce quando o pai termina e cresce com outExpo. No fim, folhas e flores abrem em stagger com mola.
// Desenho em lote: um stroke por nível de profundidade (espessura constante no nível).

const MAX_DEPTH = 11;
const TROPISM = 0.14;

export default {
  id: 'fractal-tree',
  title: 'Fractal Tree',
  description: 'Árvore recursiva que cresce galho a galho, balança ao vento e termina com folhas e flores abrindo em stagger.',
  category: 'formas',
  tags: ['forma', 'intro', 'simulação'],
  duration: 10,
  poster: 7.5,

  params: {
    depth: { type: 'range', label: 'Níveis', min: 5, max: MAX_DEPTH, step: 1, default: 10 },
    spread: { type: 'range', label: 'Abertura (°)', min: 10, max: 50, step: 1, default: 27 },
    shrink: { type: 'range', label: 'Redução', min: 0.6, max: 0.85, step: 0.01, default: 0.74 },
    wind: { type: 'range', label: 'Vento', min: 0, max: 1, step: 0.01, default: 0.4 },
    foliage: { type: 'select', label: 'Copa', options: ['folhas e flores', 'só folhas', 'só flores', 'nenhuma'], default: 'folhas e flores' },
    ink: { type: 'color', label: 'Galhos', default: '#2a2622' },
    leaf: { type: 'color', label: 'Folhas', default: '#8a9a6b' },
    accent: { type: 'color', label: 'Flores', default: '#e8553e' },
    bg: { type: 'color', label: 'Fundo', default: '#efe9de' },
    seed: { type: 'range', label: 'Seed', min: 1, max: 99, step: 1, default: 11 },
  },

  setup({ p }) {
    const r = rng(p.seed);
    const spread = (p.spread * Math.PI) / 180;
    const nodes = []; // ordem pré-fixada: pai sempre antes dos filhos
    const tips = [];
    const GROW = 5.2; // segundos até o último nível terminar
    const per = GROW / (p.depth + 0.6);
    function add(parent, depth, angle, len, start) {
      const i = nodes.length;
      const n = { parent, depth, angle, len, start, dur: per * (1.25 + r() * 0.4), phase: r() * TAU, kids: 0 };
      nodes.push(n);
      if (depth < p.depth) {
        const k = depth < 2 || r() > 0.12 ? 2 : 1; // às vezes um galho só
        const end = start + n.dur * 0.72;
        for (let c = 0; c < k; c++) {
          const side = k === 1 ? (r() - 0.5) * 0.6 : c === 0 ? -1 : 1;
          const a = side * spread * (0.7 + r() * 0.6) + (r() - 0.5) * 0.25;
          const l = len * p.shrink * (0.82 + r() * 0.3);
          add(i, depth + 1, a, l, end + r() * per * 0.25);
          n.kids++;
        }
      } else {
        const kind = r();
        tips.push({ i, r1: r(), r2: r(), kind });
      }
      return i;
    }
    add(-1, 0, 0, 1, 0.2);
    // caixa da árvore pronta (sem vento), em unidades do tronco, para enquadrar em qualquer formato
    const ax = [], ex = [], ey = [];
    let x0 = 0, x1 = 0, y0 = 0;
    nodes.forEach((n, i) => {
      let a = -Math.PI / 2, sx = 0, sy = 0;
      if (n.parent >= 0) {
        a = ax[n.parent] + n.angle;
        a += (-Math.PI / 2 - a) * TROPISM;
        sx = ex[n.parent];
        sy = ey[n.parent];
      }
      ax[i] = a;
      ex[i] = sx + Math.cos(a) * n.len;
      ey[i] = sy + Math.sin(a) * n.len;
      x0 = Math.min(x0, ex[i]); x1 = Math.max(x1, ex[i]); y0 = Math.min(y0, ey[i]);
    });
    return { nodes, tips, GROW, box: { x0, x1, top: -y0 } };
  },

  render(ctx, t, { w, h, p, state, duration }) {
    const { nodes, tips } = state;
    const m = Math.min(w, h);
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, w, h);

    // tamanho: o tronco escala para a caixa da árvore pronta (calculada no setup) caber na tela
    const { box } = state;
    const baseY = h * (w > h ? 0.93 : 0.84);
    const L0 = Math.min((baseY - h * 0.12) / (box.top + 0.06), (w * 0.86) / (box.x1 - box.x0 + 0.1));
    const baseX = w / 2 - ((box.x0 + box.x1) / 2) * L0; // centra a copa, não o tronco

    // chão: linha fina que abre do centro
    const g = ease.outExpo(seg(t, 0, 1.2));
    ctx.strokeStyle = rgba(p.ink, 0.25);
    ctx.lineWidth = Math.max(1, m * 0.0015);
    ctx.beginPath();
    ctx.moveTo(baseX - w * 0.3 * g, baseY);
    ctx.lineTo(baseX + w * 0.3 * g, baseY);
    ctx.stroke();

    // vento: entra devagar, rajadas suaves (soma de senos), mais forte com a profundidade
    const windOn = ease.inOutSine(seg(t, 1.5, 4.5)) * p.wind;
    const gust = 0.6 * Math.sin(t * 1.3) + 0.4 * Math.sin(t * 2.9 + 1.1);

    const N = nodes.length;
    const X0 = new Float32Array(N), Y0 = new Float32Array(N), X1 = new Float32Array(N), Y1 = new Float32Array(N);
    const A = new Float32Array(N), G = new Float32Array(N);
    const byDepth = Array.from({ length: p.depth + 1 }, () => []);
    for (let i = 0; i < N; i++) {
      const n = nodes[i];
      const k = ease.outCubic(seg(t, n.start, n.start + n.dur));
      G[i] = k;
      if (k <= 0) continue;
      const sway = windOn * (0.02 + 0.03 * n.depth) * (gust + 0.35 * Math.sin(t * 3.7 + n.phase));
      // o galho também "abre" ao nascer: o ângulo começa fechado e assenta com mola
      const open = spring(seg(t, n.start, n.start + n.dur * 1.4), 0.15);
      let ang, x, y;
      if (n.parent < 0) {
        ang = -Math.PI / 2 + sway * 0.4;
        x = baseX;
        y = baseY;
      } else {
        const pi = n.parent;
        ang = A[pi] + n.angle * open + sway;
        ang += (-Math.PI / 2 - ang) * TROPISM; // tropismo: puxa os galhos para cima (sem isso a copa despenca)
        x = X1[pi];
        y = Y1[pi];
      }
      const len = n.len * L0 * k;
      A[i] = ang;
      X0[i] = x;
      Y0[i] = y;
      X1[i] = x + Math.cos(ang) * len;
      Y1[i] = y + Math.sin(ang) * len;
      byDepth[n.depth].push(i);
    }

    // galhos: um stroke por nível
    ctx.strokeStyle = p.ink;
    ctx.lineCap = 'round';
    for (let d = 0; d <= p.depth; d++) {
      const list = byDepth[d];
      if (!list.length) continue;
      ctx.lineWidth = Math.max(0.8, L0 * 0.075 * Math.pow(0.74, d));
      ctx.beginPath();
      for (const i of list) {
        ctx.moveTo(X0[i], Y0[i]);
        ctx.lineTo(X1[i], Y1[i]);
      }
      ctx.stroke();
    }

    // copa: abre depois do crescimento, em stagger aleatório, com mola; recolhe no fim do loop
    if (p.foliage !== 'nenhuma') {
      const leaves = p.foliage !== 'só flores';
      const flowers = p.foliage !== 'só folhas';
      const fade = 1 - ease.inCubic(seg(t, duration - 0.9, duration - 0.1));
      const sz = Math.max(2, L0 * 0.05);
      const leafPath = new Path2D();
      const flowerPath = new Path2D();
      const centerPath = new Path2D();
      for (const tip of tips) {
        if (G[tip.i] < 1) continue;
        const isFlower = flowers && (!leaves || tip.kind < 0.13);
        const t0 = 5.0 + tip.r1 * 2.2 + (isFlower ? 0.6 : 0);
        const s = spring(seg(t, t0, t0 + 0.9), 0.35) * fade;
        if (s <= 0.01) continue;
        const x = X1[tip.i];
        const y = Y1[tip.i];
        if (isFlower) {
          const R = sz * 0.85 * s;
          const rot = tip.r2 * TAU + A[tip.i];
          for (let k = 0; k < 5; k++) {
            const a = rot + (k * TAU) / 5;
            const px = x + Math.cos(a) * R * 0.62;
            const py = y + Math.sin(a) * R * 0.62;
            flowerPath.moveTo(px + R * 0.5, py);
            flowerPath.arc(px, py, R * 0.5, 0, TAU);
          }
          centerPath.moveTo(x + R * 0.3, y);
          centerPath.arc(x, y, R * 0.3, 0, TAU);
        } else if (leaves) {
          // folha: elipse alinhada ao galho, um pouco para o lado
          const a = A[tip.i] + (tip.r2 - 0.5) * 1.6;
          const lx = x + Math.cos(a) * sz * 0.6 * s;
          const ly = y + Math.sin(a) * sz * 0.6 * s;
          leafPath.moveTo(lx + Math.cos(a) * sz * s, ly + Math.sin(a) * sz * s);
          leafPath.ellipse(lx, ly, sz * s, sz * 0.48 * s, a, 0, TAU);
        }
      }
      ctx.fillStyle = p.leaf;
      ctx.fill(leafPath);
      ctx.fillStyle = p.accent;
      ctx.fill(flowerPath);
      ctx.fillStyle = p.bg;
      ctx.fill(centerPath);
    }

    // saída: a árvore some com a cor do fundo por cima (loop limpo)
    const out = seg(t, duration - 0.6, duration);
    if (out > 0) {
      ctx.fillStyle = rgba(p.bg, ease.inOutSine(out));
      ctx.fillRect(0, 0, w, h);
    }
  },
};
